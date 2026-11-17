// Proxy: POST /api/accounts { address, password } -> POST https://api.mail.tm/accounts
// Netlify Function.
const UPSTREAM = 'https://api.mail.tm';

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }
  try {
    const upstream = await fetch(UPSTREAM + '/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: event.body || '{}',
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
