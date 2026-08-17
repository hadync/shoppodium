// Internal Brandr fulfillment admin API. Not for customer use.
//
// REQUIRED SETUP (cannot be done from code):
//   1. Set env var FULFILLMENT_ADMIN_KEY in Vercel to any long random string you choose -
//      this is the password the dashboard will ask for. Treat it like a real password.
//   2. Set env var SUPABASE_SERVICE_ROLE_KEY in Vercel (same requirement as the webhook -
//      the fulfillment tables have no anon RLS policies on purpose).
//
// Every request must include header: x-admin-key: <FULFILLMENT_ADMIN_KEY>
// The service role key is used here, server-side only, and never sent to the browser.

const SUPABASE_URL = 'https://cajerxgiwbgevfjzkkoy.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path, opts) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: (opts && opts.prefer) || 'return=representation',
      ...(opts && opts.headers),
    },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) throw new Error('Supabase error (' + res.status + '): ' + JSON.stringify(data));
  return data;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const adminKey = process.env.FULFILLMENT_ADMIN_KEY;
  if (!adminKey) return res.status(500).json({ error: 'FULFILLMENT_ADMIN_KEY not configured' });
  if (!SERVICE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
  if (req.headers['x-admin-key'] !== adminKey) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const orders = await sb(
        'brandr_fulfillment_orders?select=*&order=created_at.desc&limit=200'
      );
      const items = await sb(
        'brandr_fulfillment_items?select=*,brandr_suppliers(name,website_url)&order=created_at.asc'
      );
      const byOrder = {};
      for (const it of items) {
        (byOrder[it.fulfillment_order_id] = byOrder[it.fulfillment_order_id] || []).push(it);
      }
      const result = orders.map((o) => ({ ...o, items: byOrder[o.id] || [] }));
      return res.status(200).json({ orders: result });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const action = body.action;

      if (action === 'updateOrderStatus') {
        const { orderId, status, notes } = body;
        const validStatuses = ['pending_payment','paid','ordering','in_production','partially_received','ready_to_assemble','assembled','shipped','delivered','cancelled','exception'];
        if (!orderId || !validStatuses.includes(status)) {
          return res.status(400).json({ error: 'Invalid orderId or status' });
        }
        const patch = { status, updated_at: new Date().toISOString() };
        if (notes !== undefined) patch.notes = notes;
        await sb('brandr_fulfillment_orders?id=eq.' + encodeURIComponent(orderId), {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        return res.status(200).json({ ok: true });
      }

      if (action === 'updateItem') {
        const { itemId, status, supplier_order_reference, tracking_number, notes } = body;
        const validItemStatuses = ['queued','ready_to_order','ordered','in_production','shipped','received','exception','cancelled'];
        if (!itemId) return res.status(400).json({ error: 'Missing itemId' });
        const patch = { updated_at: new Date().toISOString() };
        if (status !== undefined) {
          if (!validItemStatuses.includes(status)) return res.status(400).json({ error: 'Invalid item status' });
          patch.status = status;
          if (status === 'ordered') patch.ordered_at = new Date().toISOString();
          if (status === 'received') patch.received_at = new Date().toISOString();
        }
        if (supplier_order_reference !== undefined) patch.supplier_order_reference = supplier_order_reference;
        if (tracking_number !== undefined) patch.tracking_number = tracking_number;
        if (notes !== undefined) patch.notes = notes;
        await sb('brandr_fulfillment_items?id=eq.' + encodeURIComponent(itemId), {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
