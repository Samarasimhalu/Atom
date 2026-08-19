const crypto = require('crypto');

function signPayload(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { body, timestamp, signature: `v1=${signature}` };
}

function verifyPayload(body, signature, secret, timestamp, toleranceSeconds = 300) {
  if (!secret || !signature || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) return false;
  const expected = signPayload(body, secret, timestamp).signature;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function deliverWebhook(url, payload, config, fetchImpl = fetch) {
  const signed = signPayload(payload, config.webhooks.signingSecret);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.webhooks.timeoutMs);
  try {
    const response = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-atom-webhook-timestamp': String(signed.timestamp), 'x-atom-webhook-signature': signed.signature }, body: signed.body, signal: controller.signal });
    return { ok: response.ok, status: response.status };
  } finally { clearTimeout(timeout); }
}

module.exports = { signPayload, verifyPayload, deliverWebhook };
