// Proxy: DELETE /api/account?id=<account id> -> DELETE https://api.mail.tm/accounts/<id>
// Forwards the Authorization: Bearer <token> header (mail.tm requires the
// account's own token to delete it).
const UPSTREAM = 'https://api.mail.tm';

module.exports = async (req, res) => {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = req.query && req.query.id;
  if (!id) {
    return res.status(400).json({ error: 'Missing ?id=' });
  }
  try {
    const headers = { Accept: 'application/json' };
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }
    const upstream = await fetch(UPSTREAM + '/accounts/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers,
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(body || '{}');
  } catch (err) {
    res.status(502).json({
      error: 'Upstream request failed',
      detail: String((err && err.message) || err),
    });
  }
};
