import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';

let opened;
let arena;

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  arena = createRepositories(opened.database).arena;
});

afterEach(() => opened.close());

test('rooms persist preset, pin and settings and are found by pin or legacy code', async () => {
  const created = await arena.rooms.create({
    id: 'room-1', code: '483217', pin: '483217', title: 'Batalha Classica',
    status: 'waiting', expectedPlayers: 3, preset: 'classic',
    settings: { maxPlayers: 3, rounds: 3, judgeKind: 'classic' }, now: 1000,
  });
  assert.equal(created.preset, 'classic');
  assert.equal(created.pin, '483217');
  assert.deepEqual(created.settings, { maxPlayers: 3, rounds: 3, judgeKind: 'classic' });
  assert.equal(created.expectedPlayers, 3);

  const byPin = await arena.rooms.getByPin('483217');
  assert.equal(byPin?.id, 'room-1');
  const legacy = await arena.rooms.create({
    id: 'room-2', code: 'RAFA27', title: 'Legado', status: 'waiting', now: 1000,
  });
  assert.equal(legacy.pin, null);
  assert.equal(legacy.preset, 'personalizado');
  assert.equal((await arena.rooms.findByPinOrCode('483217'))?.id, 'room-1');
  assert.equal((await arena.rooms.findByPinOrCode('RAFA27'))?.id, 'room-2');
  assert.equal((await arena.rooms.findByPinOrCode(' 483 217 '))?.id, undefined);
});

test('duplicate pins are rejected by the unique index', async () => {
  await arena.rooms.create({ id: 'a', code: '111111', pin: '111111', title: 'A', now: 1 });
  await assert.rejects(
    () => arena.rooms.create({ id: 'b', code: '222222', pin: '111111', title: 'B', now: 2 }),
    /UNIQUE/i,
  );
});

test('participants join with an internal station and an optional profile', async () => {
  await arena.rooms.create({ id: 'room-1', code: '483217', title: 'Sala', status: 'waiting', now: 1 });
  const ana = await arena.participants.join({
    id: 'p1', roomId: 'room-1', name: 'Ana', token: 't1', now: 2,
    stationNumber: 1, email: 'ana@exemplo.com', role: 'Aluna', company: 'Escola', consent: true,
  });
  assert.equal(ana.stationNumber, 1);
  assert.equal(ana.email, 'ana@exemplo.com');
  assert.equal(ana.consent, true);
  const bia = await arena.participants.join({
    id: 'p2', roomId: 'room-1', name: 'Bia', token: 't2', now: 3, stationNumber: 2,
  });
  assert.equal(bia.stationNumber, 2);
  assert.deepEqual(await arena.participants.activeStations('room-1'), [1, 2]);
});

test('two active participants cannot share a station in the same room', async () => {
  await arena.rooms.create({ id: 'room-1', code: '483217', title: 'Sala', status: 'waiting', now: 1 });
  await arena.participants.join({ id: 'p1', roomId: 'room-1', name: 'Ana', token: 't1', now: 2, stationNumber: 1 });
  await assert.rejects(
    () => arena.participants.join({ id: 'p2', roomId: 'room-1', name: 'Bia', token: 't2', now: 3, stationNumber: 1 }),
    /UNIQUE/i,
  );
});

test('classic challenges persist judge fields and may carry no criteria', async () => {
  const saved = await arena.challenges.save({
    id: 'ch-classic', title: 'Desafio 1', modality: 'precisao',
    mission: 'Observe a imagem e recrie o prompt.', durationSeconds: 60,
    judgeKind: 'classic', referencePrompt: 'Uma mulher de jaqueta vermelha...', rubric: 'Compare os elementos.',
    criteria: [], now: 1000,
  });
  assert.equal(saved.judgeKind, 'classic');
  assert.equal(saved.referencePrompt.startsWith('Uma mulher'), true);
  assert.equal(saved.rubric, 'Compare os elementos.');
  assert.equal(saved.durationSeconds, 60);
  assert.deepEqual(saved.criteria, []);
  const listed = await arena.challenges.list();
  assert.equal(listed[0].judgeKind, 'classic');
});

test('scores record and read classic points/position/scoring version', async () => {
  await arena.rooms.create({ id: 'room-1', code: '483217', title: 'Sala', status: 'waiting', now: 1 });
  await arena.participants.join({ id: 'p1', roomId: 'room-1', name: 'Ana', token: 't1', now: 2, stationNumber: 1 });
  await arena.challenges.save({ id: 'ch-1', title: 'D1', modality: 'precisao', mission: 'm', criteria: [], now: 3 });
  await arena.rounds.add({ id: 'rr-1', roomId: 'room-1', position: 1, challengeId: 'ch-1', modality: 'precisao', now: 4 });
  await arena.submissions.create({
    id: 'sub-1', roomId: 'room-1', participantId: 'p1', roundId: 'rr-1', attempt: 1, prompt: 'x', submittedAt: 5,
  });
  const recorded = await arena.scores.record({
    id: 'sc-1', submissionId: 'sub-1', percent: 80, breakdown: {}, feedback: 'bom',
    points: 8500, position: 1, scoringVersion: 'v3-live-speed-bonus', now: 6,
  });
  assert.equal(recorded.points, 8500);
  assert.equal(recorded.position, 1);
  const byRound = await arena.scores.listByRound('rr-1');
  assert.equal(byRound[0].points, 8500);
  assert.equal(byRound[0].participantId, 'p1');
  const updated = await arena.scores.updateClassicMetrics({
    submissionId: 'sub-1', points: 999, position: 2, scoringVersion: 'v3', now: 7,
  });
  assert.equal(updated.points, 999);
  assert.equal(updated.position, 2);
});
