// Shop account lookup by email (no password).
// GET /api/shop-account?email=foo@bar.com
// Returns their active subscription(s) + a referral code + how many shops they've referred.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });

    const email = (req.query && req.query.email ? String(req.query.email) : '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 0) return res.status(400).json({ error: 'Enter a valid email' });

    const auth = { headers: { 'Authorization': 'Bearer ' + key } };

    // 1. Find the customer by email
    const custRes = await fetch('https://api.stripe.com/v1/customers?email=' + encodeURIComponent(email) + '&limit=1', auth);
    const custData = await custRes.json();
    if (custData.error) return res.status(400).json({ error: custData.error.message });
    if (!custData.data || !custData.data.length) {
      return res.status(200).json({ found: false });
    }
    const customer = custData.data[0];

    // 2. Get their subscriptions
    const subRes = await fetch('https://api.stripe.com/v1/subscriptions?customer=' + customer.id + '&status=all&limit=10', auth);
    const subData = await subRes.json();
    const subs = (subData.data || []).map(s => {
      let amount = 0;
      (s.items && s.items.data || []).forEach(it => {
        amount += (it.price && it.price.unit_amount ? it.price.unit_amount : 0) * (it.quantity || 1);
      });
      return {
        id: s.id,
        status: s.status,
        amount: amount / 100,
        summary: (s.metadata && s.metadata.summary) || 'Brandr monthly bags',
        currentPeriodEnd: s.current_period_end,
        cancelAtPeriodEnd: !!s.cancel_at_period_end,
        cancelAt: s.cancel_at || null
      };
    });

    // 3. Build their referral code (stable, derived from email local-part) and count their referrals
    const refCode = email.split('@')[0].replace(/[^a-z0-9]/g, '').slice(0, 20) || ('shop' + customer.id.slice(-6));

    // Count active subs referred by this code
    let referred = 0, referredMonthly = 0;
    let starting_after = null;
    for (let i = 0; i < 5; i++) {
      let url = 'https://api.stripe.com/v1/subscriptions?limit=100&status=all';
      if (starting_after) url += '&starting_after=' + starting_after;
      const r = await fetch(url, auth);
      const d = await r.json();
      if (d.error) break;
      (d.data || []).forEach(s => {
        if (s.metadata && s.metadata.ref && s.metadata.ref.toLowerCase() === refCode.toLowerCase()
            && (s.status === 'active' || s.status === 'trialing')) {
          referred++;
          (s.items && s.items.data || []).forEach(it => {
            referredMonthly += (it.price && it.price.unit_amount ? it.price.unit_amount : 0) * (it.quantity || 1);
          });
        }
      });
      if (!d.has_more || !d.data.length) break;
      starting_after = d.data[d.data.length - 1].id;
    }
    referredMonthly = referredMonthly / 100;

    return res.status(200).json({
      found: true,
      email: email,
      name: customer.name || null,
      subscriptions: subs,
      refCode: refCode,
      referredCount: referred,
      yourMonthlyCut: Math.round(referredMonthly * 0.25 * 100) / 100,
      referralsToFreeBag: Math.max(0, 5 - referred),
      bagFree: referred >= 5
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
