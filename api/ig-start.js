/* ShopPodium: kick off Instagram business login.
   GET /api/ig-start?shop=<shopId>  ->  302 to Instagram's OAuth screen */
module.exports = async function (req, res) {
  var appId = process.env.IG_APP_ID;
  if (!appId) { res.statusCode = 500; res.end('IG_APP_ID is not configured'); return; }
  var shop = (req.query && req.query.shop) ? String(req.query.shop).slice(0, 64) : 'default';
  var redirect = 'https://shoppodium.vercel.app/api/ig-callback';
  var scope = 'instagram_business_basic,instagram_business_content_publish';
  var url = 'https://www.instagram.com/oauth/authorize' +
    '?client_id=' + encodeURIComponent(appId) +
    '&redirect_uri=' + encodeURIComponent(redirect) +
    '&response_type=code' +
    '&scope=' + encodeURIComponent(scope) +
    '&state=' + encodeURIComponent(shop);
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
};
