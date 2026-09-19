import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApi } from '../../src/server/api.mjs';
import { DEFAULT_ROUNDS } from '../../src/server/start.mjs';

let opened, repositories, dispatch, clock, sequence;

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 10_000;
  sequence = 0;
  const game = await repositories.rooms.createCycle({ id: 'admin-game', now: clock });
  await repositories.rooms.putRounds(game.id, DEFAULT_ROUNDS, clock);
  dispatch = createApi({
    repositories,
    judge: createFakeJudge(),
    now: () => clock,
    id: () => `admin-id-${++sequence}`,
    adminPassword: 'senha-correta',
    adminSecret: 'segredo-de-teste-com-32-caracteres',
  });
});

afterEach(() => opened.close());

const registration = (station) => ({
  station_id: station,
  name: `Jogador ${station}`,
  email: `j${station}@exemplo.com`,
  role: 'Aluno',
  company: 'Escola',
  lgpd_accept: true,
  mode: 'wait_all',
});

async function login() {
  return (await dispatch('admin_login', { password: 'senha-correta' })).admin_token;
}

test('report includes Arena participants, scored prompts and date filtering', async () => {
  const room = await repositories.arena.rooms.create({ id: 'arena-report', code: 'RPT123', title: 'Relatório Arena', now: clock });
  await repositories.arena.challenges.save({ id: 'report-challenge', title: 'Imagem', modality: 'precisao', mission: 'Descreva a imagem', referenceText: 'Referência', now: clock });
  await repositories.arena.rounds.add({ id: 'report-round', roomId: room.id, position: 1, challengeId: 'report-challenge', modality: 'precisao', now: clock });
  await repositories.arena.rounds.updateStatus({ id: 'report-round', status: 'open', startedAt: clock, now: clock });
  await repositories.arena.participants.join({ id: 'report-person', roomId: room.id, name: 'Ana Arena', token: 'session', now: clock });
  await repositories.arena.submissions.create({ id: 'report-submission', roomId: room.id, participantId: 'report-person', roundId: 'report-round', attempt: 1, prompt: 'Um cartaz educativo', submittedAt: clock + 5 });
  await repositories.arena.scores.record({ id: 'report-score', submissionId: 'report-submission', percent: 80, points: 8000, breakdown: {}, feedback: 'Bom', now: clock + 6 });
  const admin_token = await login();
  const { metrics } = await dispatch('report_metrics', { admin_token });
  assert.equal(metrics.cards.total_sessions, 1);
  assert.equal(metrics.cards.matches_scored, 1);
  assert.equal(metrics.tables.players[0].player_name, 'Ana Arena');
  assert.equal(metrics.tables.players[0].total_points, 8000);
  assert.equal(metrics.tables.matches[0].user_prompt, 'Um cartaz educativo');
  assert.equal(metrics.tables.matches[0].elapsed_seconds, 5);
  const filtered = await dispatch('report_metrics', { admin_token, start_date: '2026-01-01' });
  assert.equal(filtered.metrics.cards.matches_scored, 0);
});

test('admin login locks a source after repeated failures and recovers', async () => {
  const ip = '10.0.0.55';
  for (let index = 0; index < 5; index += 1) {
    await assert.rejects(
      dispatch('admin_login', { password: 'errada' }, { ip }),
      (error) => error.status === 401,
    );
  }
  // A sexta tentativa (mesmo com a senha certa) e bloqueada na origem.
  await assert.rejects(
    dispatch('admin_login', { password: 'senha-correta' }, { ip }),
    (error) => error.status === 429,
  );
  // Outra origem nao e afetada pela trava.
  const other = await dispatch('admin_login', { password: 'senha-correta' }, { ip: '10.0.0.56' });
  assert.ok(other.admin_token);
  // Apos a janela de bloqueio, a origem volta a conseguir entrar.
  clock += 901;
  const recovered = await dispatch('admin_login', { password: 'senha-correta' }, { ip });
  assert.ok(recovered.admin_token);
});

test('admin login rejects a wrong password and returns an expiring token for the correct one', async () => {
  await assert.rejects(
    dispatch('admin_login', { password: 'errada' }),
    (error) => error.status === 401,
  );

  const login = await dispatch('admin_login', { password: 'senha-correta' });
  assert.equal(login.ok, true);
  assert.equal(typeof login.admin_token, 'string');
  assert.ok(login.admin_token.length > 40);
  assert.equal(login.expires_at, 13_600);

  clock = 13_601;
  await assert.rejects(
    dispatch('admin_status', { admin_token: login.admin_token }),
    (error) => error.status === 401,
  );
});

test('admin report and reset reject requests without a valid token', async () => {
  await assert.rejects(
    dispatch('report_metrics', {}),
    (error) => error.status === 401,
  );
  await assert.rejects(
    dispatch('admin_reset', { admin_token: 'token-falso' }),
    (error) => error.status === 401,
  );
});

test('admin report calculates real player and submission results', async () => {
  const sessions = [];
  for (let station = 1; station <= 3; station += 1) {
    sessions.push((await dispatch('register', registration(station))).session);
  }
  const starts = [];
  for (const session of sessions) {
    starts.push((await dispatch('start_match', { session_id: session.id, mode: 'wait_all' })).match);
  }
  for (let station = 0; station < 3; station += 1) {
    clock += 1;
    await dispatch('submit_prompt', {
      match_id: starts[station].id,
      session_id: sessions[station].id,
      token: `admin-submit-${station + 1}`,
      prompt: `astronauta no espaco resposta ${station + 1}`,
    });
  }

  const report = await dispatch('report_metrics', { admin_token: await login() });
  assert.equal(report.ok, true);
  assert.deepEqual(report.metrics.cards.players, 3);
  assert.deepEqual(report.metrics.cards.matches_scored, 3);
  assert.equal(report.metrics.tables.players.length, 3);
  assert.equal(report.metrics.tables.matches.length, 3);
  assert.ok(report.metrics.cards.avg_percent > 0);
  assert.ok(report.metrics.tables.matches.every((row) => row.user_prompt && row.player_name));
  assert.deepEqual(
    report.metrics.tables.players.map(({ email, role, company }) => ({ email, role, company })),
    [1, 2, 3].map((station) => ({
      email: `j${station}@exemplo.com`, role: 'Aluno', company: 'Escola',
    })),
  );
  assert.ok(report.metrics.tables.matches.every((row) => row.email && row.role && row.company));
});

test('admin reset opens a clean cycle and preserves the previous game history', async () => {
  for (let station = 1; station <= 3; station += 1) {
    await dispatch('register', registration(station));
  }
  const previous = await repositories.rooms.getActive();
  const token = await login();
  clock += 1;

  const reset = await dispatch('admin_reset', { admin_token: token });
  assert.equal(reset.ok, true);
  assert.equal(reset.room.phase, 'idle');
  assert.equal(reset.room.registered, 0);
  assert.notEqual(reset.room.id, previous.id);
  assert.equal((await repositories.reports.forGame(previous.id)).sessions.length, 3);
  assert.equal((await repositories.rooms.getState(reset.room.id)).rounds.length, 3);
});
