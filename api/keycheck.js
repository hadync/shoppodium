// Diagnostic only: says whether the key env var is visible to functions. Never exposes the key.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const k = process.env.STRIPE_SECRET_KEY;
  return res.status(200).json({
    keyPresent: !!k,
    keyLength: k ? k.length : 0,
    keyPrefix: k ? k.slice(0, 8) : null,   // e.g. "rk_live_" - safe, not the secret part
    allStripeEnvNames: Object.keys(process.env).filter(n => n.toUpperCase().includes('STRIPE'))
  });
};
