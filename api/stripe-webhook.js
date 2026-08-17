// Stripe webhook receiver for Brandr fulfillment.
//
// Listens for:
//   checkout.session.completed  (mode: 'payment')       -> one-time individual product order
//   invoice.paid                (subscription invoices) -> the Monthly Kit, once per billing cycle
//
// IMPORTANT SETUP REQUIRED (cannot be done from code):
//   1. Set env var STRIPE_WEBHOOK_SECRET in Vercel - get this from Stripe Dashboard ->
//      Developers -> Webhooks -> your endpoint -> Signing secret (starts with whsec_).
//   2. In Stripe Dashboard -> Developers -> Webhooks, add an endpoint pointing to:
//        https://www.brandrbags.com/api/stripe-webhook
//      subscribed to at minimum: checkout.session.completed, invoice.paid
//   3. Set env var SUPABASE_SERVICE_ROLE_KEY in Vercel. The fulfillment tables have RLS
//      enabled with zero anon policies (locked down on purpose, since they hold customer
//      data) - only the service role key can write to them. There is no safe fallback
//      value for this that can be hardcoded, unlike the anon key used elsewhere in this
//      project - if this env var is missing, every write below will fail with 401/403.
//
// This endpoint intentionally does NOT create a fulfillment order on
// checkout.session.completed for subscription-mode sessions. Stripe fires an invoice.paid
// event for the *first* subscription cycle too, so treating invoice.paid as the single
// source of truth for subscriptions avoids double-creating an order for cycle 1.

const crypto = require('crypto');

const SUPABASE_URL = 'https://cajerxgiwbgevfjzkkoy.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The Monthly Kit is a bundle - break it into its real physical components so each one
// gets routed to its own supplier. Matches products.included_items display names plus the
// bag itself (the kit's included_items field only describes visible contents, not the
// container it ships in).
const KIT_COMPONENT_SLUGS = [
  'branded-bag',
  'branded-air-fresheners',
  'branded-microfiber-towels',
  'referral-cards',
  'thank-you-cards',
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set - cannot verify webhook signatures.');
    return res.status(500).send('Webhook not configured');
  }
  if (!SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set - cannot write fulfillment data.');
    return res.status(500).send('Server not configured');
  }

  const rawBody = await readRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = verifyStripeSignature(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send('Invalid signature');
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.mode === 'payment') {
        await handleOneTimeOrder(session);
      }
      // subscription mode: intentionally deferred to invoice.paid, see comment above.
    } else if (event.type === 'invoice.paid') {
      await handleInvoicePaid(event.data.object);
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handling error:', err);
    // Return 500 so Stripe retries - better a duplicate attempt (blocked by our unique
    // constraints) than a silently dropped order.
    return res.status(500).json({ error: err.message });
  }
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Manual Stripe webhook signature verification (HMAC-SHA256), since this project doesn't
// use the stripe npm package anywhere else - matches the existing raw-fetch style used in
// api/checkout.js rather than introducing a new dependency for just this.
function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader) throw new Error('Missing stripe-signature header');
  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k, v];
    })
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error('Malformed signature header');

  const fiveMinutes = 5 * 60;
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > fiveMinutes) throw new Error('Timestamp too old (possible replay)');

  const signedPayload = timestamp + '.' + rawBody;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Signature mismatch');
  }
  return JSON.parse(rawBody);
}

async function sb(path, opts) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: (opts && opts.prefer) || 'return=representation',
      ...(opts && opts.headers),
    },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) throw new Error('Supabase ' + path + ' failed (' + res.status + '): ' + JSON.stringify(data));
  return data;
}

function shippingFromSession(session) {
  const s = session.shipping_details || session.customer_details || {};
  const addr = s.address || {};
  return {
    shipping_name: s.name || null,
    shipping_address_line1: addr.line1 || null,
    shipping_address_line2: addr.line2 || null,
    shipping_city: addr.city || null,
    shipping_state: addr.state || null,
    shipping_postal_code: addr.postal_code || null,
    shipping_country: addr.country || 'US',
  };
}

async function lookupSupplierId(productSlug) {
  const rows = await sb(
    'brandr_supplier_products?product_slug=eq.' + encodeURIComponent(productSlug) +
      '&active=eq.true&order=priority.asc&limit=1&select=supplier_id'
  );
  return rows && rows[0] ? rows[0].supplier_id : null;
}

async function createFulfillmentItems(orderId, componentSlugs, quantity) {
  for (const slug of componentSlugs) {
    const supplierId = await lookupSupplierId(slug);
    await sb('brandr_fulfillment_items', {
      method: 'POST',
      body: JSON.stringify({
        fulfillment_order_id: orderId,
        product_slug: slug,
        supplier_id: supplierId,
        quantity,
        status: 'queued',
        component_key: slug,
      }),
    });
  }
}

async function handleOneTimeOrder(session) {
  const md = session.metadata || {};
  const productSlug = md.product_slug || null;
  const quantity = parseInt(md.quantity, 10) || 1;

  const orderRows = await sb('brandr_fulfillment_orders', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify({
      status: 'paid',
      stripe_checkout_session_id: session.id,
      stripe_customer_id: session.customer || null,
      business_name: md.biz_name || session.customer_details?.name || 'Unknown',
      business_email: md.biz_email || session.customer_details?.email || session.customer_email || 'unknown@example.com',
      business_website: md.biz_web || null,
      logo_url: md.logo_url || null,
      review_link: md.review_link || null,
      quantity,
      notes: md.summary || null,
      ...shippingFromSession(session),
    }),
  });
  const order = orderRows && orderRows[0];
  if (!order) return; // duplicate webhook delivery, ignore-duplicates matched an existing row

  if (productSlug) {
    await createFulfillmentItems(order.id, [productSlug], quantity);
  }
}

async function handleInvoicePaid(invoice) {
  if (!invoice.subscription) return; // not a subscription invoice, nothing to do here

  // Read metadata from the subscription itself (mirrored there at checkout time), not the
  // invoice, since only the subscription reliably carries it across every renewal cycle.
  const subRes = await fetch('https://api.stripe.com/v1/subscriptions/' + invoice.subscription, {
    headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY },
  });
  const subscription = await subRes.json();
  if (subscription.error) throw new Error('Could not fetch subscription: ' + subscription.error.message);
  const md = subscription.metadata || {};

  const quantity = parseInt(md.quantity, 10) ||
    (subscription.items && subscription.items.data[0] && subscription.items.data[0].quantity) || 25;
  const productSlug = md.product_slug || 'monthly-customer-kits';

  const orderRows = await sb('brandr_fulfillment_orders', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify({
      status: 'paid',
      stripe_checkout_session_id: null,
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: invoice.subscription,
      stripe_customer_id: invoice.customer,
      business_name: md.biz_name || 'Unknown',
      business_email: md.biz_email || invoice.customer_email || 'unknown@example.com',
      business_website: md.biz_web || null,
      logo_url: md.logo_url || null,
      review_link: md.review_link || null,
      quantity,
      notes: 'Monthly Brandr Kit, recurring billing cycle',
    }),
  });
  const order = orderRows && orderRows[0];
  if (!order) return; // duplicate delivery of the same invoice - unique constraint on
                       // stripe_invoice_id + ignore-duplicates means this is a no-op, not
                       // a second fulfillment order for the same billing cycle.

  const componentSlugs = productSlug === 'monthly-customer-kits' ? KIT_COMPONENT_SLUGS : [productSlug];
  await createFulfillmentItems(order.id, componentSlugs, quantity);
}

module.exports.config = { api: { bodyParser: false } };
