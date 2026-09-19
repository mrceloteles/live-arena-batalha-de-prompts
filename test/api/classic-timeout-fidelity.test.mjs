import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApi } from '../../src/server/api.mjs';
import { DEFAULT_ROUNDS } from '../../src/server/start.mjs';

let opened, repositories, dispatch, clock, sequence, judgedPrompt;

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 1000;
  sequence = 0;
  judgedPrompt = null;
  const game = await repositories.rooms.createCycle({ id: 'game-1', now: clock });
  await repositories.rooms.putRounds(game.id, DEFAULT_ROUNDS, clock);
  dispatch = createApi({
    repositories,
    now: () => clock,
    id: () => `id-${++sequence}`,
    judge: async ({ candidatePrompt }) => {
      judgedPrompt = candidatePrompt;
      return { percent: candidatePrompt === '' ? 0 : 77, explanation: 'capture', metadata: { model: 'test' } };
    },
  });
});

afterEach(() => opened.close());

const registration = (station) => ({
  station_id: station,
  name: `Jogador ${station}`,
  email: `j${station}@example.com`,
  role: 'Aluno',
  company: 'Escola',
  lgpd_accept: true,
  mode: 'wait_all',
});

test('blank timeout reproduces the live timeout_empty result without calling the judge', async () => {
  const sessions = [];
  for (let station = 1; station <= 3; station += 1) {
    sessions.push((await dispatch('register', registration(station))).session);
  }
  const starts = [];
  for (const session of sessions) {
    starts.push((await dispatch('start_match', { session_id: session.id, mode: 'wait_all' })).match);
  }

  const result = await dispatch('submit_prompt', {
    match_id: starts[0].id,
    session_id: sessions[0].id,
    prompt: '',
    timeout: true,
    token: 'timeout-empty-1',
  });

  assert.equal(judgedPrompt, null);
  assert.equal(result.match.user_prompt, '');
  assert.equal(result.match.submitted_at, starts[0].deadline_at);
  assert.equal(result.match.percent, 0);
  assert.equal(result.match.points, 0);
  assert.equal(result.match.gemini_status, 'timeout_empty');
  assert.equal(result.match.feedback, 'Tempo encerrado sem prompt enviado. Pontuacao zerada nesta rodada.');
  assert.equal(result.match.fallback_used, false);
  const station = result.room.stations.find((row) => row.id === 1);
  assert.equal(station.gemini_status, 'timeout_empty');
  assert.equal(station.submitted_at, starts[0].deadline_at);
  assert.equal(station.elapsed_seconds, 60);
});
