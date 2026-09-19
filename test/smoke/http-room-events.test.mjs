import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApplication, DEFAULT_ROUNDS } from '../../src/server/start.mjs';

let opened, repositories, server, baseUrl, controller;

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  const now = 9000;
  const game = await repositories.rooms.createCycle({ id: 'events-game', now });
  await repositories.rooms.putRounds(game.id, DEFAULT_ROUNDS, now);
  const app = createApplication({
    repositories,
    judge: createFakeJudge(),
    now: () => now,
    id: (() => { let n = 0; return () => `events-id-${++n}`; })(),
    // Regressao do motor classico: producao bloqueia estas acoes no HTTP.
    allowLegacyPublicApi: true,
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  controller = new AbortController();
});

afterEach(async () => {
  controller.abort();
  await new Promise((resolve) => server.close(resolve));
  opened.close();
});

async function post(action, payload = {}) {
  const response = await fetch(`${baseUrl}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  assert.equal(response.ok, true, `${action}: ${JSON.stringify(body)}`);
  return body;
}

async function nextRoomEvent(reader, timeoutMs = 500) {
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(`room SSE event not received within ${timeoutMs}ms`)), timeoutMs);
    timer.unref?.();
  });
  const read = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new Error('SSE stream ended before a room event');
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary < 0) break;
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (!block.includes('event: room')) continue;
        const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
        return dataLine ? JSON.parse(dataLine.slice(6)) : {};
      }
    }
  })();
  return Promise.race([read, deadline]);
}

test('server pushes successful room mutations over SSE without waiting for polling', async () => {
  const response = await fetch(`${baseUrl}/events`, { signal: controller.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/event-stream/);

  const reader = response.body.getReader();
  const eventPromise = nextRoomEvent(reader);
  const started = performance.now();
  await post('register', {
    station_id: 1,
    name: 'Jogador SSE',
    email: 'sse@exemplo.com',
    role: 'Aluno',
    company: 'Escola',
    lgpd_accept: true,
    mode: 'wait_all',
  });
  const event = await eventPromise;
  const elapsed = performance.now() - started;

  assert.equal(event.action, 'register');
  assert.ok(elapsed < 500, `push notification should arrive below polling latency, got ${elapsed.toFixed(1)}ms`);
  await reader.cancel();
});
