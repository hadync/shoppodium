// Diagnostic only: says whether Stripe env vars are visible to functions. Never exposes secrets.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const live = process.env.STRIPE_SECRET_KEY;
  const test = process.env.STRIPE_SECRET_KEY_TEST;
  return res.status(200).json({
    liveKeyPresent: !!live,
    liveKeyPrefix: live ? live.slice(0, 8) : null,
    testKeyPresent: !!test,
    testKeyPrefix: test ? test.slice(0, 8) : null,
    allStripeEnvNames: Object.keys(process.env).filter(n => n.toUpperCase().includes('STRIPE'))
  });
};
