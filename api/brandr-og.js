export default function handler(req, res) {
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  res.status(200).send(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#050505"/>
    <g transform="translate(415 160) scale(.28)">
      <path fill="#0b79d0" d="M168 973 174 986 1198 989 1214 978 1214 856 1203 846 462 846 755 397 743 379 579 379 557 396Z"/>
      <path fill="#0b79d0" d="M228 248 242 268 997 269 999 279 695 729 708 743 872 743 889 733 1279 142 1268 129 240 129 228 146Z"/>
    </g>
  </svg>`);
}