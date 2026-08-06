// Creates a Stripe subscription checkout for the exact price.
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
    const summary = (body.summary || 'Brandr monthly bags').toString().slice(0, 250);

    if (!amount || amount < 99 || amount > 5000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });

    const origin = req.headers.origin || 'https://shoppodium.vercel.app';

    // Build form-encoded params for Stripe's API
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('success_url', origin + '/shoppodium-thankyou.html');
    params.append('cancel_url', origin + '/volt.html');
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', 'usd');
    params.append('line_items[0][price_data][unit_amount]', String(amount * 100));
    params.append('line_items[0][price_data][recurring][interval]', 'month');
    params.append('line_items[0][price_data][product_data][name]', 'Brandr monthly bags');
    params.append('line_items[0][price_data][product_data][description]', summary);
    params.append('shipping_address_collection[allowed_countries][0]', 'US');

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
