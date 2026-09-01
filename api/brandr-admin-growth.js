// Private Brandr admin endpoint for waitlist submission details.
// Uses the same admin key as the fulfillment dashboard.
const SUPABASE_URL = 'https://cajerxgiwbgevfjzkkoy.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json'
    }
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) throw new Error('Supabase error (' + res.status + '): ' + JSON.stringify(data));
  return data;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const adminKey = process.env.FULFILLMENT_ADMIN_KEY;
  if (!adminKey) return res.status(500).json({ error: 'FULFILLMENT_ADMIN_KEY not configured' });
  if (!SERVICE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
  if (req.headers['x-admin-key'] !== adminKey) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const fields = [
      'id','created_at','first_name','business_name','email','phone','instagram',
      'business_types','monthly_customers','help_needs','source','utm_source',
      'utm_medium','utm_campaign','utm_content','landing_path'
    ].join(',');
    const submissions = await sb(
      'brandr_founding300?select=' + fields + '&order=created_at.desc&limit=250'
    );
    return res.status(200).json({ submissions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
