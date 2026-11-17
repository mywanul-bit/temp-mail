// Proxy: GET /api/message?id=<message id> -> GET https://api.mail.tm/messages/<id>
// Netlify Function. Forwards the Authorization: Bearer <token> header from the browser.
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
  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id) {
    return json(400, { error: 'Missing ?id=' });
  }
  try {
    const headers = { Accept: 'application/ld+json' };
    if (event.headers.authorization) {
      headers.Authorization = event.headers.authorization;
    }
    const upstream = await fetch(UPSTREAM + '/messages/' + encodeURIComponent(id), { headers });
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
