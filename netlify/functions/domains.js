// Proxy: GET /api/domains -> GET https://api.mail.tm/domains
// Netlify Function. The browser never calls api.mail.tm directly (CORS only
// allows the https://mail.tm origin), so every request goes through this function.
const UPSTREAM = 'https://api.mail.tm';

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }
  try {
    const upstream = await fetch(UPSTREAM + '/domains', {
      // Ask for JSON-LD so mail.tm returns the {"hydra:member": [...]} shape.
      headers: { Accept: 'application/ld+json' },
    });
    const body = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: { 'Content-Type': 'application/json' },
      body,
    };
  } catch (err) {
    return json(502, {
      error: 'Upstream request failed',
      detail: String((err && err.message) || err),
    });
  }
};
