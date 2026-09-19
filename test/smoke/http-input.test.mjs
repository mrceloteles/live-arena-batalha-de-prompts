import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createApiHttpHandler } from '../../src/server/http.mjs';
import { createApplication } from '../../src/server/start.mjs';

async function request(handler, body, headers = {}, url = '/api.php?action=arena_status') {
  const req = Readable.from([Buffer.from(body)]);
  Object.assign(req, { url, method: 'POST', headers, socket: {} });
  const res = { writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, end(body) { this.body = JSON.parse(body); } };
  await handler(req, res);
  return res;
}

test('HTTP rejects non-object JSON before injecting session cookies', async () => {
  const handler = createApiHttpHandler(async () => ({ ok: true }));
  for (const body of ['null', '42', '"text"', '[]']) {
    assert.equal((await request(handler, body, { cookie: 'arena_admin=token' })).status, 400);
  }
});

test('HTTP accepts supported challenge images but limits other requests and oversized images', async () => {
  const handler = createApiHttpHandler(async () => ({ ok: true }));
  const body = JSON.stringify({ reference_image: 'data:image/png;base64,' + 'A'.repeat(100_000) });
  assert.equal((await request(handler, body, {}, '/api.php?action=arena_save_challenge')).status, 200);
  assert.equal((await request(handler, body)).status, 413);
  assert.equal((await request(handler, JSON.stringify({ image: 'A'.repeat(2_300_000) }), {}, '/api.php?action=arena_save_challenge')).status, 413);
});

test('unexpected HTTP failures do not disclose internal details', async () => {
  const handler = createApiHttpHandler(async () => { throw new Error('private database path and query'); });
  const response = await request(handler, '{}');
  assert.equal(response.status, 500);
  assert.equal(response.body.error, 'Erro interno.');
});

test('HTTP preserves HTTPS metadata for generated projection links', async () => {
  let meta;
  const handler = createApiHttpHandler(async (_action, _payload, value) => { meta = value; return { ok: true }; });
  await request(handler, '{}', { host: 'arena.example', 'x-forwarded-proto': 'https' });
  assert.equal(meta.protocol, 'https');
});

test('admin login stays disabled without configured credentials', async () => {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SECRET;
  try {
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_SECRET;
    const handler = createApplication({ repositories: {}, judge: async () => ({}) });
    const result = await request(handler, JSON.stringify({ password: 'Batalha@Prompts2026' }), {}, '/api.php?action=admin_login');
    assert.equal(result.status, 503);
    assert.equal(result.headers['set-cookie'], undefined);
  } finally {
    if (password !== undefined) process.env.ADMIN_PASSWORD = password;
    if (secret !== undefined) process.env.ADMIN_SECRET = secret;
  }
});

test('static directories and malformed paths do not crash the application', async () => {
  const handler = createApplication({ repositories: {}, judge: async () => ({}) });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/public/assets/`)).status, 404);
    assert.equal((await fetch(`${base}/public/%ZZ`)).status, 400);
    assert.equal((await fetch(`${base}/public/assets/js/arena.js`)).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
