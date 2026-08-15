// Creates a Stripe Billing Portal session so a shop can manage/cancel their own
// subscription (update payment method, cancel at period end, etc) without any
// custom billing UI on our side.
//
// POST /api/billing-portal   body: { email }
//
// Security: the customer is looked up fresh, server-side, by email - exactly the
// same lookup shop-account.js already does. We never accept a Stripe customer ID
// from the browser, so there's no way to request a portal session for someone
// else's account by guessing/supplying an ID.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

    const email = (body.email || '').toString().trim().toLowerCase();
    if (!email || email.indexOf('@') < 0) {
      return res.status(400).json({ error: 'Enter a valid email' });
    }

    const auth = { headers: { Authorization: 'Bearer ' + key } };

    // Look up the Stripe customer fresh, server-side, by email. This is the only
    // source of truth for "which customer" - never trust an ID from the client.
    const custRes = await fetch(
      'https://api.stripe.com/v1/customers?email=' + encodeURIComponent(email) + '&limit=1',
      auth
    );
    const custData = await custRes.json();
    if (custData.error) return res.status(400).json({ error: custData.error.message });
    if (!custData.data || !custData.data.length) {
      return res.status(404).json({ error: 'No account found for that email' });
    }
    const customer = custData.data[0];

    const origin = req.headers.origin || 'https://shoppodium.vercel.app';
    const params = new URLSearchParams();
    params.append('customer', customer.id);
    params.append('return_url', origin + '/brandr-account.html');

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const portalData = await portalRes.json();
    if (portalData.error) return res.status(400).json({ error: portalData.error.message });

    return res.status(200).json({ url: portalData.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
