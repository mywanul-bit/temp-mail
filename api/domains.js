// Proxy: GET /api/domains -> GET https://api.mail.tm/domains
// The browser never calls api.mail.tm directly (CORS only allows the
// https://mail.tm origin), so every request goes through this function.
const UPSTREAM = 'https://api.mail.tm';

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const upstream = await fetch(UPSTREAM + '/domains', {
      // Ask for JSON-LD so mail.tm returns the {"hydra:member": [...]} shape.
      headers: { Accept: 'application/ld+json' },
    });
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
