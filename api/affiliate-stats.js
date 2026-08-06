// Reads a creator's referral performance straight from Stripe.
// GET /api/affiliate-stats?ref=CODE
// Returns: referred shops (active subs), monthly recurring, their 25% cut, and refer-5 progress.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });

    const ref = (req.query && req.query.ref ? String(req.query.ref) : '').trim();
    if (!ref) return res.status(400).json({ error: 'Missing ref' });

    const RATE = 0.25;        // 25% recurring cut
    const FREE_AT = 5;        // refer 5 -> your bag is free

    // Pull subscriptions (paginate up to a few hundred)
    let subs = [];
    let starting_after = null;
    for (let i = 0; i < 5; i++) {
      let url = 'https://api.stripe.com/v1/subscriptions?limit=100&status=all';
      if (starting_after) url += '&starting_after=' + starting_after;
      const r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + key } });
      const data = await r.json();
      if (data.error) return res.status(400).json({ error: data.error.message });
      subs = subs.concat(data.data || []);
      if (!data.has_more || !data.data.length) break;
      starting_after = data.data[data.data.length - 1].id;
    }

    // Filter to this creator's referrals
    const mine = subs.filter(s => s.metadata && s.metadata.ref &&
      s.metadata.ref.toLowerCase() === ref.toLowerCase());

    const active = mine.filter(s => s.status === 'active' || s.status === 'trialing');

    // Monthly recurring total from active referred subs
    let monthly = 0;
    active.forEach(s => {
      (s.items && s.items.data || []).forEach(it => {
        const amt = it.price && it.price.unit_amount ? it.price.unit_amount : 0;
        const qty = it.quantity || 1;
        monthly += (amt * qty);
      });
    });
    monthly = monthly / 100; // cents -> dollars

    const referredCount = active.length;
    const yourCut = Math.round(monthly * RATE * 100) / 100;
    const bagFree = referredCount >= FREE_AT;
    const toFree = Math.max(0, FREE_AT - referredCount);

    return res.status(200).json({
      ref: ref,
      referredCount: referredCount,
      totalReferred: mine.length,
      monthlyRecurring: monthly,
      yourMonthlyCut: yourCut,
      rate: RATE,
      bagFree: bagFree,
      referralsToFreeBag: toFree
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
