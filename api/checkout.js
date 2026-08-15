// Creates a Stripe Checkout session. Defaults to a one-time payment (mode:'payment').
// Pass { mode: 'subscription' } explicitly if a recurring order is ever wanted again.
// Uses plain fetch (no stripe npm package) so it never breaks the build.
// Needs env var STRIPE_SECRET_KEY.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const amount = parseInt(body.amount, 10);
    const summary = (body.summary || 'Brandr order').toString().slice(0, 250);
    const ref = (body.ref || '').toString().slice(0, 100);
    const mode = body.mode === 'subscription' ? 'subscription' : 'payment';

    // $30 floor matches the site's minimum one-time order; $6000 ceiling covers the largest
    // realistic custom build (multi-item picks at 300 qty) with headroom.
    if (!amount || amount < 30 || amount > 6000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });

    const origin = req.headers.origin || 'https://shoppodium.vercel.app';
    const productName = mode === 'subscription' ? 'Brandr monthly bags' : 'Brandr order';
    // Optional per-call redirect override (same-origin only). Falls back to the original
    // ShopPodium defaults so every existing caller keeps working exactly as before.
    const isSafePath = (p) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//');
    const successUrl = isSafePath(body.successUrl) ? origin + body.successUrl : origin + '/shoppodium-thankyou.html';
    const cancelUrl = isSafePath(body.cancelUrl) ? origin + body.cancelUrl : origin + '/volt.html';

    // Build form-encoded params for Stripe's API
    const params = new URLSearchParams();
    params.append('mode', mode);
    params.append('success_url', successUrl);
    params.append('cancel_url', cancelUrl);
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', 'usd');
    params.append('line_items[0][price_data][unit_amount]', String(amount * 100));
    if (mode === 'subscription') {
      params.append('line_items[0][price_data][recurring][interval]', 'month');
    }
    params.append('line_items[0][price_data][product_data][name]', productName);
    params.append('line_items[0][price_data][product_data][description]', summary);
    params.append('shipping_address_collection[allowed_countries][0]', 'US');
    if (ref) {
      params.append('metadata[ref]', ref);
      if (mode === 'subscription') params.append('subscription_data[metadata][ref]', ref);
    }
    params.append('metadata[summary]', summary);
    params.append('metadata[mode]', mode);

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
