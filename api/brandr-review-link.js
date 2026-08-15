const crypto = require('crypto');

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function makeSlug() {
  return crypto.randomBytes(6).toString('hex');
}

function validGoogleUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && (u.hostname.includes('google.') || u.hostname === 'g.page' || u.hostname === 'maps.app.goo.gl');
  } catch (_) { return false; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { businessName, email, googleReviewUrl } = req.body || {};
    if (!businessName || !email || !googleReviewUrl) return res.status(400).json({ error: 'Business name, email, and Google review URL are required.' });
    if (!validGoogleUrl(googleReviewUrl)) return res.status(400).json({ error: 'Please enter a valid Google review link.' });

    const base = process.env.BRANDR_PUBLIC_URL || 'https://www.brandrbags.com';
    let slug = makeSlug();
    let url = `${base}/r/${slug}`;
    const headers = supabaseHeaders();
    const endpoint = `${process.env.SUPABASE_URL || 'https://cajerxgiwbgevfjzkkoy.supabase.co'}/rest/v1/brandr_review_links`;

    for (let i = 0; i < 3; i++) {
      const insert = await fetch(endpoint, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ business_name: businessName.trim().slice(0, 160), email: email.trim().toLowerCase().slice(0, 320), google_review_url: googleReviewUrl.trim(), slug, active: true })
      });
      if (insert.ok) {
        const rows = await insert.json();
        return res.status(200).json({ id: rows[0].id, slug, redirectUrl: url, googleReviewUrl: googleReviewUrl.trim() });
      }
      slug = makeSlug(); url = `${base}/r/${slug}`;
    }
    return res.status(500).json({ error: 'Could not create the review link.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not create the review link.' });
  }
};
