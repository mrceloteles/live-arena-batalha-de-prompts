import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApi } from '../../src/server/api.mjs';
import { DEFAULT_ROUNDS } from '../../src/server/start.mjs';
import { GAME_RULES } from '../../src/domain/game-state.mjs';

let opened;
let repositories;
let dispatch;
let clock;
let sequence;

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 1000;
  sequence = 0;
  const game = await repositories.rooms.createCycle({ id: 'classic-game-1', now: clock });
  await repositories.rooms.putRounds(game.id, DEFAULT_ROUNDS, clock);
  dispatch = createApi({
    repositories,
    judge: createFakeJudge(),
    now: () => clock,
    id: () => `classic-id-${++sequence}`,
  });
});

afterEach(() => opened.close());

function registration(station) {
  return {
    station_id: station,
    name: `Jogador ${station}`,
    email: `j${station}@example.com`,
    role: 'Aluno',
    company: 'Escola',
    lgpd_accept: true,
    mode: 'wait_all',
  };
}

async function registerClassicThree() {
  const sessions = [];
  for (let station = 1; station <= GAME_RULES.players; station += 1) {
    sessions.push((await dispatch('register', registration(station))).session);
  }
  return sessions;
}

async function startClassicRound(sessions, round) {
  const starts = [];
  for (const session of sessions) {
    starts.push((await dispatch('start_match', { session_id: session.id, mode: 'wait_all' })).match);
  }
  assert.deepEqual(starts.map((match) => match.round_number), [round, round, round]);
  assert.equal(new Set(starts.map((match) => match.image_url)).size, 1);
  assert.ok(starts.every((match) => match.total_rounds === 3));
  return starts;
}

async function submitClassicThree(sessions, starts, round) {
  for (let index = 0; index < sessions.length; index += 1) {
    clock += 1;
    await dispatch('submit_prompt', {
      match_id: starts[index].id,
      session_id: sessions[index].id,
      token: `classic-round-${round}-station-${index + 1}`,
      prompt: `astronauta no espaço resposta clássica ${round}-${index + 1}`,
    });
  }
}

function assertClassicRoom(room) {
  assert.equal(room.mode, 'classic');
  assert.equal(room.expected_stations, 3);
  assert.equal(room.game.total_rounds, 3);
  assert.equal(room.stations.length, 3);
  assert.ok(room.stations.every((station) => station.id >= 1 && station.id <= 3));
}

test('classic mode completes 3 players x 3 rounds, holds result phases, then opens a clean classic cycle', async () => {
  assert.deepEqual(GAME_RULES, {
    players: 3,
    rounds: 3,
    roundDuration: 60,
    resultsDuration: 10,
    finalResultsDuration: 30,
  });

  const untouched = await dispatch('room_status');
  assert.equal(untouched.room.phase, 'idle', 'the captured Red Door room remains idle before the first registration');

  const sessions = await registerClassicThree();
  let status = await dispatch('room_status');
  let room = status.room;
  assertClassicRoom(room);
  assert.equal(room.phase, 'ready');
  assert.equal(room.registered, 3);
  assert.equal(room.all_registered, true);
  assert.ok(Number(status.reset_at) > 0);

  const firstCycleResetAt = Number(status.reset_at);

  for (let round = 1; round <= 3; round += 1) {
    const starts = await startClassicRound(sessions, round);
    room = (await dispatch('room_status')).room;
    assertClassicRoom(room);
    assert.equal(room.phase, 'playing');
    assert.equal(room.round.round_number, round);
    assert.equal(room.playing_stations, 3);

    await submitClassicThree(sessions, starts, round);
    status = await dispatch('room_status');
    room = status.room;
    assertClassicRoom(room);
    assert.equal(room.all_submitted, true);
    assert.equal(room.all_scored, true);

    if (round < 3) {
      assert.equal(room.phase, 'results');
      assert.equal(room.round_ranking.length, 3);
      const resultsStartedAt = Number(room.round.results_at);
      assert.ok(resultsStartedAt > 0);

      clock = resultsStartedAt + GAME_RULES.resultsDuration - 0.1;
      room = (await dispatch('room_status')).room;
      assert.equal(room.phase, 'results', 'round result screen must remain for the full 10 seconds');

      clock = resultsStartedAt + GAME_RULES.resultsDuration;
      room = (await dispatch('room_status')).room;
      assert.equal(room.phase, 'ready');
      assert.equal(room.round.round_number, round + 1);
    } else {
      assert.equal(room.phase, 'final_results');
      assert.equal(room.final_ranking.length, 3);
      assert.deepEqual([...room.final_ranking.map((row) => row.station_id)].sort((a, b) => a - b), [1, 2, 3]);
      const finalStartedAt = Number(room.game.finished_at);
      assert.ok(finalStartedAt > 0);

      clock = finalStartedAt + GAME_RULES.finalResultsDuration - 0.1;
      room = (await dispatch('room_status')).room;
      assert.equal(room.phase, 'final_results', 'final ranking must remain for the full 30 seconds');

      clock = finalStartedAt + GAME_RULES.finalResultsDuration;
      status = await dispatch('room_status');
      room = status.room;
    }
  }

  assertClassicRoom(room);
  assert.equal(room.phase, 'idle');
  assert.equal(room.current_round, 0);
  assert.equal(room.registered, 0);
  assert.equal(room.all_registered, false);
  assert.ok(Number(status.reset_at) > firstCycleResetAt, 'new classic cycle must expose a newer reset_at');
  assert.equal(room.expected_stations, 3, 'classroom configuration must not leak into a new classic cycle');
});
