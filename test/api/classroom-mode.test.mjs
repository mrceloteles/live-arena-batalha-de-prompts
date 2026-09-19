import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApi } from '../../src/server/api.mjs';
import { DEFAULT_ROUNDS } from '../../src/server/start.mjs';

let opened, repositories, dispatch, clock, sequence, adminToken;

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 20_000;
  sequence = 0;
  const game = await repositories.rooms.createCycle({ id: 'classroom-game', now: clock });
  await repositories.rooms.putRounds(game.id, DEFAULT_ROUNDS, clock);
  dispatch = createApi({
    repositories,
    judge: createFakeJudge(),
    now: () => clock,
    id: () => `classroom-id-${++sequence}`,
    adminPassword: 'senha-correta',
    adminSecret: 'segredo-de-teste-com-32-caracteres',
  });
  adminToken = (await dispatch('admin_login', { password: 'senha-correta' })).admin_token;
});

afterEach(() => opened.close());

const student = (number) => ({
  name: `Aluno ${number}`,
  email: `aluno${number}@escola.test`,
  role: 'Aluno',
  company: 'Escola',
  lgpd_accept: true,
  mode: 'wait_all',
});

test('only an administrator can configure 1 to 50 classroom seats', async () => {
  await assert.rejects(
    dispatch('configure_classroom', { expected_players: 30 }),
    (error) => error.status === 401,
  );
  for (const expected_players of [0, 51]) {
    await assert.rejects(
      dispatch('configure_classroom', { admin_token: adminToken, expected_players }),
      (error) => error.status === 422,
    );
  }
  const configured = await dispatch('configure_classroom', {
    admin_token: adminToken,
    expected_players: 30,
  });
  assert.equal(configured.room.mode, 'classroom');
  assert.equal(configured.room.expected_stations, 30);
  assert.equal(configured.room.phase, 'idle');
});

test('a teacher can run classroom mode with one participant', async () => {
  const configured = await dispatch('configure_classroom', {
    admin_token: adminToken,
    expected_players: 1,
  });
  assert.equal(configured.room.expected_stations, 1);

  const session = (await dispatch('register', student(1))).session;
  const started = await dispatch('start_classroom', { admin_token: adminToken });
  assert.equal(started.room.phase, 'ready'); // instrucoes: o relogio ainda nao correu
  assert.equal(started.room.registered, 1);
  assert.equal(started.room.playing_stations, 0);

  const round = await dispatch('start_match', { session_id: session.id, mode: 'wait_all' });
  assert.equal(round.match.round_number, 1);
  assert.equal((await dispatch('room_status')).room.phase, 'playing');

  const result = await dispatch('submit_prompt', {
    match_id: round.match.id,
    session_id: session.id,
    token: 'solo-submit',
    prompt: 'descricao individual valida da imagem',
  });
  assert.equal(result.room.phase, 'results');
  assert.equal(result.room.round_ranking.length, 1);
  assert.equal(result.room.round_ranking[0].position, 1);
});

test('students receive unique seats and wait for the teacher to start', async () => {
  await dispatch('configure_classroom', { admin_token: adminToken, expected_players: 12 });
  const sessions = [];
  for (let number = 1; number <= 12; number += 1) {
    sessions.push((await dispatch('register', student(number))).session);
  }
  assert.deepEqual(sessions.map((row) => row.station_id), Array.from({ length: 12 }, (_, index) => index + 1));
  const waiting = (await dispatch('room_status')).room;
  assert.equal(waiting.phase, 'registration');
  assert.equal(waiting.all_registered, true);

  const started = await dispatch('start_classroom', { admin_token: adminToken });
  assert.equal(started.room.phase, 'ready');
  assert.equal(started.room.playing_stations, 0);
  assert.ok(started.room.stations.every((row) => row.match_id === null));

  // O primeiro "Pronto para a batalha!" aceita a turma inteira e inicia a rodada 1
  const first = await dispatch('start_match', { session_id: sessions[0].id, mode: 'wait_all' });
  const firstRoom = (await dispatch('room_status')).room;
  assert.equal(firstRoom.phase, 'playing');
  assert.equal(firstRoom.playing_stations, 12);
  assert.ok(firstRoom.stations.every((row) => typeof row.match_id === 'string' && row.match_id.startsWith('m-')));

  const tenth = await dispatch('start_match', { session_id: sessions[9].id, mode: 'wait_all' });
  assert.match(tenth.match.id, /^m-\d+-1-10$/);
  assert.equal(tenth.match.status, 'playing');
});

test('a 50-person classroom completes without a disconnected student blocking results', async () => {
  await dispatch('configure_classroom', { admin_token: adminToken, expected_players: 50 });
  const sessions = [];
  for (let number = 1; number <= 50; number += 1) {
    sessions.push((await dispatch('register', student(number))).session);
  }
  const started = await dispatch('start_classroom', { admin_token: adminToken });
  await dispatch('start_match', { session_id: sessions[0].id, mode: 'wait_all' });
  const round = (await dispatch('room_status')).room;
  const matchId = round.stations[0].match_id;

  for (let index = 0; index < 49; index += 1) {
    clock += 0.1;
    await dispatch('submit_prompt', {
      match_id: round.stations[index].match_id,
      session_id: sessions[index].id,
      token: `classroom-submit-${index}`,
      prompt: `descricao valida da imagem pelo aluno ${index + 1}`,
    });
  }
  clock = Number(round.round.deadline_at) + 3;
  const finished = (await dispatch('match_status', { match_id: matchId })).room;
  assert.equal(finished.phase, 'results');
  assert.equal(finished.all_scored, true);
  assert.equal(finished.round_ranking.length, 50);
  assert.equal(finished.round_ranking.at(-1).points, 0);
});
