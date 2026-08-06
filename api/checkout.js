// Vercel serverless function: creates a Stripe subscription checkout for the exact price
// Needs env var STRIPE_SECRET_KEY (restricted key with Checkout Sessions: Write)
const Stripe = require('stripe');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    // Parse body (Vercel may give string or object)
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const amount = parseInt(body.amount, 10); // dollars
    const summary = (body.summary || 'Brandr monthly bags').toString().slice(0, 250);

    // Guard: enforce a sane floor and ceiling so a bad request can't create a weird charge
    if (!amount || amount < 99 || amount > 5000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const origin = req.headers.origin || 'https://shoppodium.vercel.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'Brandr monthly bags', description: summary },
          unit_amount: amount * 100, // cents
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      shipping_address_collection: { allowed_countries: ['US'] },
      success_url: origin + '/shoppodium-thankyou.html',
      cancel_url: origin + '/volt.html',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
