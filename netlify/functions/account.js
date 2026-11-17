// Proxy: DELETE /api/account?id=<account id> -> DELETE https://api.mail.tm/accounts/<id>
// Netlify Function. Forwards the Authorization: Bearer <token> header (mail.tm
// requires the account's own token to delete it).
const UPSTREAM = 'https://api.mail.tm';

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'DELETE') {
    return json(405, { error: 'Method not allowed' });
  }
  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id) {
    return json(400, { error: 'Missing ?id=' });
  }
  try {
    const headers = { Accept: 'application/json' };
    if (event.headers.authorization) {
      headers.Authorization = event.headers.authorization;
    }
    const upstream = await fetch(UPSTREAM + '/accounts/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers,
    });
    const body = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: { 'Content-Type': 'application/json' },
      body: body || '{}',
    };
  } catch (err) {
    return json(502, {
      error: 'Upstream request failed',
      detail: String((err && err.message) || err),
    });
  }
};
