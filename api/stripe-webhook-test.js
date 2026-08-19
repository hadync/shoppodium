// TEST-MODE ONLY copy of api/stripe-webhook.js for the Stripe sandbox environment.
// Production webhook code is untouched. This branch intentionally uses the Stripe
// test secret key to authenticate/retrieve the event, so the sandbox does not depend
// on a Vercel webhook-signing-secret environment variable while we finish setup.

const SUPABASE_URL = 'https://cajerxgiwbgevfjzkkoy.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY_TEST = process.env.STRIPE_SECRET_KEY_TEST;

const KIT_COMPONENT_SLUGS = [
  'branded-bag',
  'branded-air-fresheners',
  'branded-microfiber-towels',
  'referral-cards',
  'thank-you-cards',
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  if (!SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set - cannot write fulfillment data.');
    return res.status(500).send('Server not configured');
  }
  if (!STRIPE_SECRET_KEY_TEST) {
    console.error('STRIPE_SECRET_KEY_TEST is not set - cannot authenticate test webhook events.');
    return res.status(500).send('Test Stripe key not configured');
  }

  const rawBody = await readRawBody(req);
  let incoming;
  try {
    incoming = JSON.parse(rawBody);
  } catch (err) {
    return res.status(400).send('Invalid JSON');
  }

  try {
    // Authenticate the webhook by retrieving the event from Stripe using the
    // test-mode secret key. The event returned by Stripe is the source of truth.
    if (!incoming.id || !String(incoming.id).startsWith('evt_')) {
      return res.status(400).send('Missing Stripe event id');
    }
    const eventRes = await fetch('https://api.stripe.com/v1/events/' + encodeURIComponent(incoming.id), {
      headers: { Authorization: 'Bearer ' + STRIPE_SECRET_KEY_TEST },
    });
    const event = await eventRes.json();
    if (!eventRes.ok || event.error) {
      throw new Error('Could not verify Stripe event: ' + (event.error?.message || eventRes.status));
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.mode === 'payment') await handleOneTimeOrder(session);
    } else if (event.type === 'invoice.paid') {
      await handleInvoicePaid(event.data.object);
    }

    return res.status(200).json({ received: true, testMode: true, eventId: event.id });
  } catch (err) {
    console.error('Test webhook handling error:', err);
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
      is_test: true,
      stripe_checkout_session_id: session.id,
      stripe_customer_id: session.customer || null,
      business_name: (md.biz_name || session.customer_details?.name || 'Unknown') + ' (TEST)',
      business_email: md.biz_email || session.customer_details?.email || session.customer_email || 'unknown@example.com',
      business_website: md.biz_web || null,
      logo_url: md.logo_url || null,
      review_link: md.review_link || null,
      quantity,
      notes: '[TEST ORDER] ' + (md.summary || ''),
      ...shippingFromSession(session),
    }),
  });
  const order = orderRows && orderRows[0];
  if (!order) return;
  if (productSlug) await createFulfillmentItems(order.id, [productSlug], quantity);
}

async function handleInvoicePaid(invoice) {
  if (!invoice.subscription) return;

  const subRes = await fetch('https://api.stripe.com/v1/subscriptions/' + encodeURIComponent(invoice.subscription), {
    headers: { Authorization: 'Bearer ' + STRIPE_SECRET_KEY_TEST },
  });
  const subscription = await subRes.json();
  if (!subRes.ok || subscription.error) throw new Error('Could not fetch subscription: ' + (subscription.error?.message || subRes.status));

  const md = subscription.metadata || {};
  const quantity = parseInt(md.quantity, 10) ||
    (subscription.items && subscription.items.data[0] && subscription.items.data[0].quantity) || 25;
  const productSlug = md.product_slug || 'monthly-customer-kits';

  const orderRows = await sb('brandr_fulfillment_orders', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify({
      status: 'paid',
      is_test: true,
      stripe_checkout_session_id: null,
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: invoice.subscription,
      stripe_customer_id: invoice.customer,
      business_name: (md.biz_name || 'Unknown') + ' (TEST)',
      business_email: md.biz_email || invoice.customer_email || 'unknown@example.com',
      business_website: md.biz_web || null,
      logo_url: md.logo_url || null,
      review_link: md.review_link || null,
      quantity,
      notes: '[TEST ORDER] Monthly Brandr Kit, recurring billing cycle',
    }),
  });
  const order = orderRows && orderRows[0];
  if (!order) return;

  const componentSlugs = productSlug === 'monthly-customer-kits' ? KIT_COMPONENT_SLUGS : [productSlug];
  await createFulfillmentItems(order.id, componentSlugs, quantity);
}

module.exports.config = { api: { bodyParser: false } };
