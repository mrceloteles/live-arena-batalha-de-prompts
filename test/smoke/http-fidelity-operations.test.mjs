import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApplication, DEFAULT_ROUNDS } from '../../src/server/start.mjs';
import { GAME_RULES } from '../../src/domain/game-state.mjs';

const servers = [];
const databases = [];
const tempDirs = [];

afterEach(async () => {
  while (servers.length) {
    const server = servers.pop();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
  while (databases.length) databases.pop().close();
  while (tempDirs.length) await rm(tempDirs.pop(), { recursive: true, force: true });
});

async function boot({ databasePath = ':memory:', clockRef, idPrefix = 'remote' } = {}) {
  const opened = openDatabase(databasePath);
  await opened.migrate();
  databases.push(opened);
  const repositories = createRepositories(opened.database);
  if (!(await repositories.rooms.getActive())) {
    const game = await repositories.rooms.createCycle({ id: `${idPrefix}-game`, now: clockRef.value });
    await repositories.rooms.putRounds(game.id, DEFAULT_ROUNDS, clockRef.value);
  }
  let sequence = 0;
  const app = createApplication({
    repositories,
    judge: createFakeJudge(),
    now: () => clockRef.value,
    id: () => `${idPrefix}-id-${++sequence}`,
    adminPassword: 'senha-remota',
    adminSecret: 'segredo-remoto-com-mais-de-32-caracteres',
    // Regressao do motor classico: producao bloqueia estas acoes no HTTP.
    allowLegacyPublicApi: true,
  });
  const server = createServer(app);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { opened, repositories, server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

let lastSetCookie = '';
async function post(baseUrl, action, payload = {}, { expectOk = true } = {}) {
  const response = await fetch(`${baseUrl}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  lastSetCookie = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  const body = await response.json();
  if (expectOk) assert.equal(response.ok, true, `${action}: ${JSON.stringify(body)}`);
  return { response, body };
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

async function registerThree(baseUrl) {
  const sessions = [];
  for (let station = 1; station <= 3; station += 1) {
    sessions.push((await post(baseUrl, 'register', registration(station))).body.session);
  }
  return sessions;
}

async function startThree(baseUrl, sessions) {
  const matches = [];
  for (const session of sessions) {
    matches.push((await post(baseUrl, 'start_match', { session_id: session.id, mode: 'wait_all' })).body.match);
  }
  return matches;
}

test('remote HTTP protocol: admin auth, exact tie, timeout and administrative restart', async () => {
  const clock = { value: 50_000 };
  const { baseUrl, repositories } = await boot({ clockRef: clock, idPrefix: 'ops' });

  const wrongLogin = await post(baseUrl, 'admin_login', { password: 'errada' }, { expectOk: false });
  assert.equal(wrongLogin.response.status, 401);
  const unauthorizedReset = await post(baseUrl, 'admin_reset', {}, { expectOk: false });
  assert.equal(unauthorizedReset.response.status, 401);

  const sessions = await registerThree(baseUrl);
  const roundOne = await startThree(baseUrl, sessions);
  const tiePrompt = 'astronauta espaço Terra capacete 8k neon';
  for (let index = 0; index < 3; index += 1) {
    await post(baseUrl, 'submit_prompt', {
      match_id: roundOne[index].id,
      session_id: sessions[index].id,
      token: `tie-${index + 1}`,
      prompt: tiePrompt,
    });
  }

  let status = (await post(baseUrl, 'room_status', { room_id: 'main' })).body.room;
  assert.equal(status.phase, 'results');
  assert.equal(status.round_ranking.length, 3);
  assert.deepEqual(status.round_ranking.map((row) => row.position), [1, 1, 1]);
  assert.equal(new Set(status.round_ranking.map((row) => row.percent)).size, 1);
  assert.equal(new Set(status.round_ranking.map((row) => row.elapsed_seconds)).size, 1);

  clock.value += GAME_RULES.resultsDuration + 1;
  status = (await post(baseUrl, 'room_status', { room_id: 'main' })).body.room;
  assert.equal(status.phase, 'ready');
  assert.equal(status.round.round_number, 2);

  const roundTwo = await startThree(baseUrl, sessions);
  for (let index = 0; index < 2; index += 1) {
    await post(baseUrl, 'submit_prompt', {
      match_id: roundTwo[index].id,
      session_id: sessions[index].id,
      token: `timeout-control-${index + 1}`,
      prompt: `resposta estação ${index + 1}`,
    });
  }
  clock.value = roundTwo[2].deadline_at + 3;
  status = (await post(baseUrl, 'room_status', { room_id: 'main' })).body.room;
  assert.equal(status.phase, 'results');
  assert.equal(status.all_submitted, true);
  assert.equal(status.all_scored, true);
  const timedOutStation = status.stations.find((station) => station.id === 3);
  assert.equal(timedOutStation.percent, 0);
  assert.equal(timedOutStation.points, 0);

  const activeGame = await repositories.rooms.getActive();
  const internalRoundTwo = (await repositories.matches.listByGame(activeGame.id))
    .find((match) => match.roundNumber === 2);
  const timedOutSubmission = (await repositories.submissions.listByMatch(internalRoundTwo.id))
    .find((row) => String(row.session_id) === String(sessions[2].id));
  assert.equal(timedOutSubmission.prompt, '');

  await post(baseUrl, 'admin_login', { password: 'senha-remota' });
  // O token admin so existe no cookie HttpOnly (o corpo nao o expoe).
  const token = /arena_admin=([^;]+)/.exec(lastSetCookie)?.[1];
  assert.ok(token);
  const reportBefore = await post(baseUrl, 'report_metrics', { admin_token: token });
  assert.equal(reportBefore.body.metrics.cards.players, 3);
  assert.equal(reportBefore.body.metrics.cards.matches_scored, 6);

  const previousGame = await repositories.rooms.getActive();
  clock.value += 1;
  const reset = await post(baseUrl, 'admin_reset', { admin_token: token });
  assert.equal(reset.body.room.phase, 'idle');
  assert.equal(reset.body.room.registered, 0);
  assert.notEqual(reset.body.room.id, previousGame.id);
  assert.equal((await repositories.reports.forGame(previousGame.id)).sessions.length, 3);
  assert.equal((await repositories.reports.forGame(previousGame.id)).scores.length, 6);
});

test('remote HTTP protocol: process restart rehydrates persisted classic state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'batalha-restart-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'state.sqlite');
  const clock = { value: 90_000 };

  const first = await boot({ databasePath, clockRef: clock, idPrefix: 'restart-a' });
  const sessions = await registerThree(first.baseUrl);
  const matches = await startThree(first.baseUrl, sessions);
  await post(first.baseUrl, 'submit_prompt', {
    match_id: matches[0].id,
    session_id: sessions[0].id,
    token: 'restart-preserved-submit',
    prompt: 'astronauta espaço sideral',
  });

  const before = (await post(first.baseUrl, 'room_status', { room_id: 'main' })).body.room;
  assert.equal(before.phase, 'playing');
  assert.equal(before.stations.find((station) => station.id === 1).submitted, true);

  await new Promise((resolve) => first.server.close(resolve));
  first.opened.close();
  databases.splice(databases.indexOf(first.opened), 1);
  servers.splice(servers.indexOf(first.server), 1);

  const second = await boot({ databasePath, clockRef: clock, idPrefix: 'restart-b' });
  const after = (await post(second.baseUrl, 'room_status', { room_id: 'main' })).body.room;
  assert.equal(after.phase, 'playing');
  assert.equal(after.registered, 3);
  assert.equal(after.round.round_number, 1);
  assert.equal(after.stations.find((station) => station.id === 1).submitted, true);
  assert.equal(after.stations.find((station) => station.id === 1).scored, true);
  assert.equal(await repositoriesStateCount(second.repositories), 1);
});

async function repositoriesStateCount(repositories) {
  return (await repositories.rooms.list()).filter((game) => game.active).length;
}
