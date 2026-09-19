import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApi } from '../../src/server/api.mjs';
import { DEFAULT_ROUNDS } from '../../src/server/start.mjs';
import { GAME_RULES } from '../../src/domain/game-state.mjs';

let opened, repositories, dispatch, clock, sequence;

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 1000;
  sequence = 0;
  const game = await repositories.rooms.createCycle({ id: 'game-1', now: clock });
  await repositories.rooms.putRounds(game.id, DEFAULT_ROUNDS, clock);
  dispatch = createApi({
    repositories,
    judge: createFakeJudge(),
    now: () => clock,
    id: () => `id-${++sequence}`,
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

async function registerThree() {
  const sessions = [];
  for (let station = 1; station <= 3; station += 1) {
    sessions.push((await dispatch('register', registration(station))).session);
  }
  return sessions;
}

async function submitThree(sessions, starts, round) {
  for (let index = 0; index < sessions.length; index += 1) {
    clock += 1;
    await dispatch('submit_prompt', {
      match_id: starts[index].id,
      session_id: sessions[index].id,
      token: `round-${round}-station-${index + 1}`,
      prompt: `astronauta no espaço, resposta da estação ${index + 1}`,
    });
  }
}

function assertThreePlayers(ranking) {
  assert.equal(ranking.length, 3);
  assert.deepEqual([...ranking.map((row) => row.station_id)].sort(), [1, 2, 3]);
  assert.ok(ranking.every((row) => row.position >= 1 && row.position <= 3));
}

test('three stations complete the same round and all three rounds reach a final ranking', async () => {
  const sessions = await registerThree();

  let room = (await dispatch('room_status')).room;
  assert.equal(room.phase, 'ready');
  assert.equal(room.all_registered, true);

  for (let round = 1; round <= GAME_RULES.rounds; round += 1) {
    const starts = [];
    for (const session of sessions) {
      starts.push((await dispatch('start_match', {
        session_id: session.id,
        mode: 'wait_all',
      })).match);
    }

    assert.equal(new Set(starts.map((match) => match.id)).size, 3, `round ${round} needs one player handle per station`);
    assert.deepEqual(starts.map((match) => match.round_number), [round, round, round]);
    assert.ok(starts.every((match) => typeof match.image_url === 'string' && match.image_url.length > 0));
    assert.equal(new Set(starts.map((match) => match.image_url)).size, 1, `round ${round} must share the same challenge image`);

    room = (await dispatch('room_status')).room;
    assert.equal(room.phase, 'playing');
    assert.equal(room.playing_stations, 3);
    assert.equal(room.round.round_number, round);
    assert.equal(room.round.image_url, starts[0].image_url);
    assert.ok(room.stations.every((station) => station.match_id));

    await submitThree(sessions, starts, round);
    room = (await dispatch('room_status')).room;

    if (round < GAME_RULES.rounds) {
      assert.equal(room.phase, 'results');
      assertThreePlayers(room.round_ranking);

      clock += GAME_RULES.resultsDuration + 1;
      room = (await dispatch('room_status')).room;
      assert.equal(room.phase, 'ready');
      assert.equal(room.round.round_number, round + 1);
    } else {
      assert.equal(room.phase, 'final_results');
      assertThreePlayers(room.final_ranking);
    }
  }
});

test('server closes an expired round when a player disconnects before submitting', async () => {
  const sessions = await registerThree();
  const starts = [];
  for (const session of sessions) {
    starts.push((await dispatch('start_match', {
      session_id: session.id,
      mode: 'wait_all',
    })).match);
  }

  for (let index = 0; index < 2; index += 1) {
    clock += 1;
    await dispatch('submit_prompt', {
      match_id: starts[index].id,
      session_id: sessions[index].id,
      token: `disconnect-round-station-${index + 1}`,
      prompt: `resposta enviada pela estacao ${index + 1}`,
    });
  }

  clock = starts[0].deadline_at + 3;
  let room = (await dispatch('room_status')).room;
  assert.equal(room.phase, 'results');
  assert.equal(room.all_submitted, true);
  assert.equal(room.all_scored, true);
  assertThreePlayers(room.round_ranking);

  const absent = room.stations.find((station) => station.id === 3);
  assert.equal(absent.submitted, true);
  assert.equal(absent.scored, true);
  assert.equal(absent.percent, 0);
  assert.equal(absent.points, 0);

  const match = (await repositories.matches.listByGame('game-1'))[0];
  const before = await repositories.submissions.listByMatch(match.id);
  const timedOut = before.find((submission) => String(submission.session_id) === String(sessions[2].id));
  assert.equal(timedOut.prompt, '');
  assert.equal((await repositories.judgeAttempts.listBySubmission(timedOut.id))[0].status, 'skipped');

  room = (await dispatch('room_status')).room;
  assert.equal((await repositories.submissions.listByMatch(match.id)).length, before.length,
    'repeated status reads must not duplicate the server timeout submission');
  assert.equal(room.round_ranking.length, 3);
});
