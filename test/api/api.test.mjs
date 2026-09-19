import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApi } from '../../src/server/api.mjs';
import { DEFAULT_ROUNDS } from '../../src/server/start.mjs';

let opened, repositories, dispatch, clock, sequence;
beforeEach(async () => {
  opened = openDatabase(':memory:'); await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 1000; sequence = 0;
  const game = await repositories.rooms.createCycle({ id: 'game-1', now: clock });
  await repositories.rooms.putRounds(game.id, DEFAULT_ROUNDS, clock);
  dispatch = createApi({ repositories, judge: createFakeJudge(), now: () => clock, id: () => `id-${++sequence}` });
});
afterEach(() => opened.close());

const registration = (station) => ({ station_id: station, name: `Jogador ${station}`, email: `j${station}@exemplo.com`, role: 'Aluno', company: 'Escola', lgpd_accept: true, mode: 'wait_all' });

test('register, heartbeat and room status preserve the three-station contract', async () => {
  const sessions = [];
  for (let station = 1; station <= 3; station++) {
    const response = await dispatch('register', registration(station));
    assert.equal(response.reset_at, 1000);
    sessions.push(response.session);
  }

  const status = await dispatch('room_status');
  assert.equal(status.reset_at, 1000);
  assert.equal(status.room.all_registered, true);
  assert.equal(status.room.phase, 'ready');
  assert.equal(status.room.round.total_rounds, 3);
  assert.deepEqual(
    status.room.stations.map(({ status: stationStatus, game_mode, total_rounds, rounds_completed }) => ({
      status: stationStatus,
      game_mode,
      total_rounds,
      rounds_completed,
    })),
    Array.from({ length: 3 }, () => ({
      status: 'registered',
      game_mode: 'wait_all',
      total_rounds: 3,
      rounds_completed: 0,
    })),
  );

  const heartbeat = await dispatch('heartbeat', { session_id: sessions[0].id });
  assert.equal(heartbeat.ok, true);
  assert.equal(heartbeat.reset_at, 1000);
  await assert.rejects(dispatch('register', registration(1)), (error) => error.status === 409);
});

test('start, submit and idempotent resend are server-authoritative', async () => {
  const sessions = [];
  for (let station = 1; station <= 3; station++) sessions.push((await dispatch('register', registration(station))).session);
  const starts = [];
  for (const session of sessions) starts.push((await dispatch('start_match', { session_id: session.id, mode: 'wait_all' })).match);
  const match = starts[0];
  const payload = { match_id: match.id, session_id: sessions[0].id, token: 'submission-1', prompt: 'astronauta no espaço com a Terra refletida no capacete' };
  const first = await dispatch('submit_prompt', payload);
  assert.equal(first.match.scored, true);
  assert.equal((await dispatch('submit_prompt', payload)).idempotent, true);
  clock = match.deadline_at + 3;
  await assert.rejects(dispatch('submit_prompt', { ...payload, match_id: starts[1].id, session_id: sessions[1].id, token: 'submission-2' }), (error) => error.status === 409);
});

test('a human retry after judge failure reuses the original submission', async () => {
  let judgeCalls = 0;
  dispatch = createApi({
    repositories,
    now: () => clock,
    id: () => `retry-id-${++sequence}`,
    judge: async () => {
      judgeCalls += 1;
      if (judgeCalls === 1) throw new Error('temporary judge failure');
      return {
        percent: 80,
        explanation: 'avaliacao recuperada',
        metadata: { model: 'qa-retry' },
      };
    },
  });

  const sessions = [];
  for (let station = 1; station <= 3; station++) {
    sessions.push((await dispatch('register', registration(station))).session);
  }
  const starts = [];
  for (const session of sessions) {
    starts.push((await dispatch('start_match', { session_id: session.id, mode: 'wait_all' })).match);
  }

  const firstPayload = {
    match_id: starts[0].id,
    session_id: sessions[0].id,
    token: 'browser-click-1',
    prompt: 'uma descricao valida que deve ser preservada',
  };
  await assert.rejects(dispatch('submit_prompt', firstPayload), (error) => error.status === 502);

  const recovered = await dispatch('submit_prompt', {
    ...firstPayload,
    token: 'browser-click-2',
  });
  assert.equal(recovered.match.scored, true);

  const match = (await repositories.matches.listByGame('game-1'))[0];
  const submissions = await repositories.submissions.listByMatch(match.id);
  assert.equal(submissions.length, 1, 'a second button click must not create another response');
  assert.equal(submissions[0].prompt, firstPayload.prompt);
  assert.deepEqual(
    (await repositories.judgeAttempts.listBySubmission(submissions[0].id)).map(({ status }) => status),
    ['failed', 'succeeded'],
  );
});
