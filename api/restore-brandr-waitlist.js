export default async function handler(req, res) {
  try {
    const upstream = await fetch('https://brandr-ntaarth6z-hadyn-lee-cummings.vercel.app/', {
      headers: { 'user-agent': req.headers['user-agent'] || 'Brandr-Restore' }
    });
    const html = await upstream.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.status(upstream.status).send(html);
  } catch (error) {
    res.status(502).send('Unable to load Brandr waitlist');
  }
}
