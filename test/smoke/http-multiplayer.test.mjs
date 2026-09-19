import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApi } from '../../src/server/api.mjs';
import { createApiHttpHandler } from '../../src/server/http.mjs';
import { createApplication, DEFAULT_ROUNDS } from '../../src/server/start.mjs';

let opened, repositories, server, baseUrl, clock, sequence;

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 5000;
  sequence = 0;
  const game = await repositories.rooms.createCycle({ id: 'http-game', now: clock });
  await repositories.rooms.putRounds(game.id, DEFAULT_ROUNDS, clock);
  const app = createApplication({
    repositories,
    judge: createFakeJudge(),
    now: () => clock,
    id: () => `http-id-${++sequence}`,
    // Regressao do motor classico: producao bloqueia estas acoes no HTTP.
    allowLegacyPublicApi: true,
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
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

const registration = (station) => ({
  station_id: station,
  name: `Jogador ${station}`,
  email: `j${station}@exemplo.com`,
  role: 'Aluno',
  company: 'Escola',
  lgpd_accept: true,
  mode: 'wait_all',
});

test('Codespaces HTTP surface runs a real three-player round end to end', async () => {
  const tvPage = await fetch(`${baseUrl}/tv.php`);
  assert.equal(tvPage.status, 200);
  assert.match(await tvPage.text(), /data-tv-content/);

  const sessions = [];
  for (let station = 1; station <= 3; station += 1) {
    sessions.push((await post('register', registration(station))).session);
  }

  let status = await post('room_status', { room_id: 'main' });
  assert.equal(status.room.phase, 'ready');
  assert.equal(status.room.registered, 3);

  const starts = [];
  for (const session of sessions) {
    starts.push((await post('start_match', { session_id: session.id, mode: 'wait_all' })).match);
  }
  assert.deepEqual(starts.map((match) => match.round_number), [1, 1, 1]);
  assert.equal(new Set(starts.map((match) => match.id)).size, 3);

  status = await post('room_status', { room_id: 'main' });
  assert.equal(status.room.phase, 'playing');
  assert.equal(status.room.playing_stations, 3);
  assert.ok(status.room.round.image_url);

  for (let station = 0; station < 3; station += 1) {
    clock += 1;
    await post('submit_prompt', {
      match_id: starts[station].id,
      session_id: sessions[station].id,
      token: `http-submit-${station + 1}`,
      prompt: `astronauta no espaço resposta ${station + 1}`,
    });
  }

  status = await post('room_status', { room_id: 'main' });
  assert.equal(status.room.phase, 'results');
  assert.equal(status.room.all_scored, true);
  assert.equal(status.room.round_ranking.length, 3);
});
