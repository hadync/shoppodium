/* ShopPodium: Instagram OAuth callback.
   Exchanges the code for a long-lived token and stores it in Supabase. */
module.exports = async function (req, res) {
  try {
    var appId = process.env.IG_APP_ID;
    var secret = process.env.IG_APP_SECRET;
    var sbUrl = process.env.SUPABASE_URL;
    var sbKey = process.env.SUPABASE_SERVICE_KEY;
    var code = req.query && req.query.code;
    var shop = (req.query && req.query.state) ? String(req.query.state).slice(0, 64) : 'default';
    if (req.query && req.query.error) {
      res.statusCode = 302;
      res.setHeader('Location', '/shoppodium-capture-23.html?ig=declined');
      res.end();
      return;
    }
    if (!appId || !secret) { res.statusCode = 500; res.end('App credentials are not configured'); return; }
    if (!code) { res.statusCode = 400; res.end('Missing code'); return; }

    /* 1. code -> short-lived token */
    var form = new URLSearchParams();
    form.append('client_id', appId);
    form.append('client_secret', secret);
    form.append('grant_type', 'authorization_code');
    form.append('redirect_uri', 'https://shoppodium.vercel.app/api/ig-callback');
    form.append('code', code);
    var shortResp = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form });
    var shortData = await shortResp.json();
    if (!shortData.access_token) { res.statusCode = 502; res.end('Token exchange failed: ' + JSON.stringify(shortData)); return; }

    /* 2. short-lived -> long-lived (about 60 days, refreshable) */
    var longResp = await fetch('https://graph.instagram.com/access_token' +
      '?grant_type=ig_exchange_token' +
      '&client_secret=' + encodeURIComponent(secret) +
      '&access_token=' + encodeURIComponent(shortData.access_token));
    var longData = await longResp.json();
    var token = longData.access_token || shortData.access_token;
    var expiresIn = longData.expires_in || 3600;
    var igUserId = String(shortData.user_id || '');

    /* 3. store in Supabase (upsert on shop_id) */
    if (sbUrl && sbKey) {
      await fetch(sbUrl + '/rest/v1/ig_tokens', {
        method: 'POST',
        headers: {
          'apikey': sbKey,
          'Authorization': 'Bearer ' + sbKey,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify([{
          shop_id: shop,
          ig_user_id: igUserId,
          access_token: token,
          expires_at: new Date(Date.now() + expiresIn * 1000).toISOString()
        }])
      });
    }

    res.statusCode = 302;
    res.setHeader('Location', '/shoppodium-capture-23.html?ig=connected');
    res.end();
  } catch (err) {
    res.statusCode = 500;
    res.end('Callback error: ' + (err && err.message ? err.message : 'unknown'));
  }
};
