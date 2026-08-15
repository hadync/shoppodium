module.exports = async (req, res) => {
  const slug = String(req.query?.slug || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!slug) return res.status(404).send('Review link not found.');
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const base = process.env.SUPABASE_URL || 'https://cajerxgiwbgevfjzkkoy.supabase.co';
    if (!key) return res.status(500).send('Review link unavailable.');
    const r = await fetch(`${base}/rest/v1/brandr_review_links?select=google_review_url&slug=eq.${encodeURIComponent(slug)}&active=eq.true&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!r.ok) return res.status(404).send('Review link not found.');
    const rows = await r.json();
    if (!rows[0]?.google_review_url) return res.status(404).send('Review link not found.');
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, rows[0].google_review_url);
  } catch (e) {
    console.error(e);
    return res.status(500).send('Review link unavailable.');
  }
};
