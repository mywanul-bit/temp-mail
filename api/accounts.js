// Proxy: POST /api/accounts { address, password } -> POST https://api.mail.tm/accounts
const UPSTREAM = 'https://api.mail.tm';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const upstream = await fetch(UPSTREAM + '/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: payload,
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
