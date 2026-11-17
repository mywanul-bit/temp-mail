// Proxy: GET /api/message?id=<message id> -> GET https://api.mail.tm/messages/<id>
// Forwards the Authorization: Bearer <token> header from the browser.
const UPSTREAM = 'https://api.mail.tm';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = req.query && req.query.id;
  if (!id) {
    return res.status(400).json({ error: 'Missing ?id=' });
  }
  try {
    const headers = { Accept: 'application/ld+json' };
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }
    const upstream = await fetch(UPSTREAM + '/messages/' + encodeURIComponent(id), { headers });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(body);
  } catch (err) {
    res.status(502).json({
      error: 'Upstream request failed',
      detail: String((err && err.message) || err),
    });
  }
};
