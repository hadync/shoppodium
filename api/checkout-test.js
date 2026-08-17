// TEST-MODE ONLY copy of api/checkout.js for the Stripe sandbox environment.
// Identical logic to production checkout.js, with two differences:
//   1. Reads STRIPE_SECRET_KEY_TEST instead of STRIPE_SECRET_KEY (must be a sk_test_... key).
//   2. Tags metadata[is_test]=true so the webhook can mark the resulting fulfillment
//      order as a test order (is_test=true column), keeping it out of real fulfillment.
//
// This file exists ONLY on the stripe-test-sandbox branch/preview deployment and is
// never merged into main - production checkout.js is completely untouched.
//
// SETUP REQUIRED IN VERCEL (Preview environment scope only, NOT Production):
//   STRIPE_SECRET_KEY_TEST = sk_test_... (from Stripe Dashboard, Test mode toggle on)

const SUPABASE_URL = 'https://cajerxgiwbgevfjzkkoy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhamVyeGdpd2JnZXZmanpra295Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDY0NDcsImV4cCI6MjA5NjAyMjQ0N30.8dCTpfeWkdUIjmKGgfnrOqlBa1jIwDt_yqg3Dlt1a0M';

async function resolveServerPrice(productSlug, quantity) {
  const prodRes = await fetch(
    SUPABASE_URL + '/rest/v1/products?slug=eq.' + encodeURIComponent(productSlug) + '&active=eq.true&select=*',
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } }
  );
  const prodRows = await prodRes.json();
  const product = Array.isArray(prodRows) ? prodRows[0] : null;
  if (!product) return null;

  const tierRes = await fetch(
    SUPABASE_URL + '/rest/v1/pricing_tiers?product_slug=eq.' + encodeURIComponent(productSlug) +
      '&active=eq.true&min_quantity=lte.' + quantity + '&select=*',
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } }
  );
  const tierRows = await tierRes.json();
  const tier = Array.isArray(tierRows)
    ? tierRows.find((t) => t.max_quantity === null || quantity <= t.max_quantity)
    : null;

  if (tier) {
    return {
      unitAmount: parseFloat(tier.price_per_unit),
      // Test-mode Stripe Price IDs are different objects than live ones - a live-mode
      // price id in this column would fail against a test-mode secret key, so we
      // deliberately ignore stripe_price_id here and always build price_data inline.
      stripePriceId: null,
      minQuantity: product.minimum_quantity,
    };
  }
  if (product.price_per_unit != null) {
    return {
      unitAmount: parseFloat(product.price_per_unit),
      stripePriceId: null,
      minQuantity: product.minimum_quantity,
    };
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

    const mode = body.mode === 'subscription' ? 'subscription' : 'payment';
    const summary = (body.summary || 'Brandr order (TEST)').toString().slice(0, 250);
    const ref = (body.ref || '').toString().slice(0, 100);

    const hasProductSlug = typeof body.productSlug === 'string' && body.productSlug.length > 0;
    const hasUnitQty = !hasProductSlug && body.unitAmount !== undefined && body.quantity !== undefined;

    let amount, quantity, unitAmount, resolvedStripePriceId = null;

    if (hasProductSlug) {
      quantity = parseInt(body.quantity, 10);
      if (!quantity || quantity <= 0) {
        return res.status(400).json({ error: 'Invalid quantity' });
      }
      const resolved = await resolveServerPrice(body.productSlug, quantity);
      if (!resolved) {
        return res.status(400).json({ error: 'Unknown product or pricing not configured' });
      }
      if (resolved.minQuantity && quantity < resolved.minQuantity) {
        return res.status(400).json({ error: 'Quantity below minimum order of ' + resolved.minQuantity });
      }
      unitAmount = resolved.unitAmount;
      resolvedStripePriceId = resolved.stripePriceId;
      amount = unitAmount * quantity;
    } else if (hasUnitQty) {
      unitAmount = parseFloat(body.unitAmount);
      quantity = parseInt(body.quantity, 10);
      if (!unitAmount || unitAmount <= 0 || !quantity || quantity <= 0) {
        return res.status(400).json({ error: 'Invalid unitAmount/quantity' });
      }
      amount = unitAmount * quantity;
    } else {
      amount = parseInt(body.amount, 10);
      quantity = 1;
    }

    if (!amount || amount < 30 || amount > 10000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // TEST-MODE KEY - deliberately a different env var name than production so there is
    // no way to accidentally fall back to a live key if this var is unset.
    const key = process.env.STRIPE_SECRET_KEY_TEST;
    if (!key) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY_TEST (set this in Vercel, Preview scope, to a sk_test_... key)' });
    if (key.startsWith('sk_live_')) {
      return res.status(500).json({ error: 'STRIPE_SECRET_KEY_TEST is set to a LIVE key - refusing to use it on the test endpoint' });
    }

    const origin = req.headers.origin || 'https://shoppodium.vercel.app';
    const productName = (mode === 'subscription' ? 'Brandr monthly bags' : 'Brandr order') + ' (TEST)';
    const isSafePath = (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');
    const successUrl = isSafePath(body.successUrl) ? origin + body.successUrl : origin + '/shoppodium-thankyou.html';
    const cancelUrl = isSafePath(body.cancelUrl) ? origin + body.cancelUrl : origin + '/volt.html';

    const params = new URLSearchParams();
    params.append('mode', mode);
    if (mode === 'subscription') {
      params.append('custom_text[submit][message]', 'TEST MODE - no real charge. Cancel anytime.');
    }
    params.append('success_url', successUrl);
    params.append('cancel_url', cancelUrl);

    if (hasProductSlug && resolvedStripePriceId) {
      params.append('line_items[0][price]', resolvedStripePriceId);
      params.append('line_items[0][quantity]', String(quantity));
    } else if (hasProductSlug) {
      params.append('line_items[0][quantity]', String(quantity));
      params.append('line_items[0][price_data][currency]', 'usd');
      params.append('line_items[0][price_data][unit_amount]', String(Math.round(unitAmount * 100)));
      if (mode === 'subscription') {
        params.append('line_items[0][price_data][recurring][interval]', 'month');
      }
      params.append('line_items[0][price_data][product_data][name]', productName);
      params.append('line_items[0][price_data][product_data][description]', summary);
    } else if (hasUnitQty) {
      params.append('line_items[0][quantity]', String(quantity));
      params.append('line_items[0][price_data][currency]', 'usd');
      params.append('line_items[0][price_data][unit_amount]', String(Math.round(unitAmount * 100)));
      if (mode === 'subscription') {
        params.append('line_items[0][price_data][recurring][interval]', 'month');
      }
      params.append('line_items[0][price_data][product_data][name]', productName);
      params.append('line_items[0][price_data][product_data][description]', summary);
    } else {
      params.append('line_items[0][quantity]', '1');
      params.append('line_items[0][price_data][currency]', 'usd');
      params.append('line_items[0][price_data][unit_amount]', String(amount * 100));
      if (mode === 'subscription') {
        params.append('line_items[0][price_data][recurring][interval]', 'month');
      }
      params.append('line_items[0][price_data][product_data][name]', productName);
      params.append('line_items[0][price_data][product_data][description]', summary);
    }

    params.append('shipping_address_collection[allowed_countries][0]', 'US');
    if (ref) {
      params.append('metadata[ref]', ref);
      if (mode === 'subscription') params.append('subscription_data[metadata][ref]', ref);
    }
    params.append('metadata[summary]', summary);
    params.append('metadata[mode]', mode);
    // Marks every order created via this endpoint as a test order, read by
    // api/stripe-webhook-test.js to set is_test=true on the fulfillment order.
    params.append('metadata[is_test]', 'true');
    if (mode === 'subscription') params.append('subscription_data[metadata][is_test]', 'true');
    if (hasProductSlug || hasUnitQty) {
      params.append('metadata[quantity]', String(quantity));
      params.append('metadata[unit_amount]', String(unitAmount));
      if (mode === 'subscription') {
        params.append('subscription_data[metadata][quantity]', String(quantity));
      }
    }
    if (hasProductSlug) params.append('metadata[product_slug]', body.productSlug);
    if (mode === 'subscription' && hasProductSlug) params.append('subscription_data[metadata][product_slug]', body.productSlug);
    if (body.bizName) {
      params.append('metadata[biz_name]', String(body.bizName).slice(0, 200));
      if (mode === 'subscription') params.append('subscription_data[metadata][biz_name]', String(body.bizName).slice(0, 200));
    }
    if (body.bizWeb) {
      params.append('metadata[biz_web]', String(body.bizWeb).slice(0, 200));
      if (mode === 'subscription') params.append('subscription_data[metadata][biz_web]', String(body.bizWeb).slice(0, 200));
    }
    if (body.bizEmail) {
      const email = String(body.bizEmail).slice(0, 200);
      params.append('metadata[biz_email]', email);
      params.append('customer_email', email);
      if (mode === 'subscription') params.append('subscription_data[metadata][biz_email]', email);
    }
    if (body.logoUrl) {
      params.append('metadata[logo_url]', String(body.logoUrl).slice(0, 500));
      if (mode === 'subscription') params.append('subscription_data[metadata][logo_url]', String(body.logoUrl).slice(0, 500));
    }
    if (body.reviewLink) {
      params.append('metadata[review_link]', String(body.reviewLink).slice(0, 500));
      if (mode === 'subscription') params.append('subscription_data[metadata][review_link]', String(body.reviewLink).slice(0, 500));
    }

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await r.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    return res.status(200).json({ url: data.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
