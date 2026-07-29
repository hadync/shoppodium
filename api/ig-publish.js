/* ShopPodium: publish a finished shot to the connected Instagram account.
   POST /api/ig-publish  JSON: { shop, mediaUrl, caption, kind }
   kind: 'image' | 'reel'   mediaUrl must be publicly reachable (e.g. Supabase Storage). */
module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
    var sbUrl = process.env.SUPABASE_URL;
    var sbKey = process.env.SUPABASE_SERVICE_KEY;
    if (!sbUrl || !sbKey) { res.statusCode = 500; res.end('Supabase is not configured'); return; }

    var body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    var shop = String(body.shop || 'default').slice(0, 64);
    var mediaUrl = body.mediaUrl;
    var caption = String(body.caption || '').slice(0, 2200);
    var kind = body.kind === 'reel' ? 'reel' : 'image';
    if (!mediaUrl || String(mediaUrl).indexOf('https://') !== 0) { res.statusCode = 400; res.end('mediaUrl must be an https URL'); return; }

    /* 1. token lookup */
    var tokResp = await fetch(sbUrl + '/rest/v1/ig_tokens?shop_id=eq.' + encodeURIComponent(shop) + '&select=ig_user_id,access_token', {
      headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey }
    });
    var rows = await tokResp.json();
    if (!rows || !rows[0] || !rows[0].access_token) { res.statusCode = 404; res.end(JSON.stringify({ error: 'not_connected' })); return; }
    var igUser = rows[0].ig_user_id;
    var token = rows[0].access_token;
    var G = 'https://graph.instagram.com/v23.0/';

    /* 2. create media container */
    var containerParams = new URLSearchParams();
    if (kind === 'reel') {
      containerParams.append('media_type', 'REELS');
      containerParams.append('video_url', mediaUrl);
    } else {
      containerParams.append('image_url', mediaUrl);
    }
    if (caption) containerParams.append('caption', caption);
    containerParams.append('access_token', token);
    var contResp = await fetch(G + igUser + '/media', { method: 'POST', body: containerParams });
    var contData = await contResp.json();
    if (!contData.id) { res.statusCode = 502; res.end(JSON.stringify({ error: 'container_failed', detail: contData })); return; }

    /* 3. videos need processing time: poll status until FINISHED (max ~50s) */
    if (kind === 'reel') {
      var ready = false;
      for (var i = 0; i < 10; i++) {
        await new Promise(function (ok) { setTimeout(ok, 5000); });
        var stResp = await fetch(G + contData.id + '?fields=status_code&access_token=' + encodeURIComponent(token));
        var stData = await stResp.json();
        if (stData.status_code === 'FINISHED') { ready = true; break; }
        if (stData.status_code === 'ERROR') { res.statusCode = 502; res.end(JSON.stringify({ error: 'processing_failed' })); return; }
      }
      if (!ready) { res.statusCode = 504; res.end(JSON.stringify({ error: 'processing_timeout', creation_id: contData.id })); return; }
    }

    /* 4. publish */
    var pubParams = new URLSearchParams();
    pubParams.append('creation_id', contData.id);
    pubParams.append('access_token', token);
    var pubResp = await fetch(G + igUser + '/media_publish', { method: 'POST', body: pubParams });
    var pubData = await pubResp.json();
    if (!pubData.id) { res.statusCode = 502; res.end(JSON.stringify({ error: 'publish_failed', detail: pubData })); return; }

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, media_id: pubData.id }));
  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'server_error', detail: err && err.message }));
  }
};
