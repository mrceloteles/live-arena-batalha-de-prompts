import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';

let opened, arena;
beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  arena = createRepositories(opened.database).arena;
});
afterEach(() => opened.close());

const NOW = 1000;

test('rooms CRUD with unique codes and status guards', async () => {
  const room = await arena.rooms.create({ id: 'r1', code: 'RAFA27', title: 'Turma 2026', now: NOW });
  assert.equal(room.status, 'draft');
  assert.equal(room.code, 'RAFA27');
  assert.equal((await arena.rooms.getByCode('rafa27')).id, 'r1'); // case-insensitive lookup
  assert.equal(await arena.rooms.getByCode('XXXXXX'), undefined);

  await arena.rooms.updateStatus({ id: 'r1', status: 'waiting', now: NOW + 1 });
  const updated = await arena.rooms.getById('r1');
  assert.equal(updated.status, 'waiting');
  assert.equal(updated.updatedAt, NOW + 1);

  await arena.rooms.update({ id: 'r1', title: 'Novo titulo', expectedPlayers: 35, entryBlocked: true, now: NOW + 2 });
  const edited = await arena.rooms.getById('r1');
  assert.equal(edited.title, 'Novo titulo');
  assert.equal(edited.expectedPlayers, 35);
  assert.equal(edited.entryBlocked, true);

  await arena.rooms.delete('r1');
  assert.equal(await arena.rooms.getById('r1'), undefined);
});

test('participants join, heartbeat, remove and rename with unique names', async () => {
  await arena.rooms.create({ id: 'r1', code: 'ABC123', title: 'Sala', now: NOW });
  const ana = await arena.participants.join({ id: 'p1', roomId: 'r1', name: 'Ana', token: 't1', now: NOW });
  assert.equal(ana.active, true);
  await assert.rejects(
    arena.participants.join({ id: 'p2', roomId: 'r1', name: 'Ana', token: 't2', now: NOW }),
    /UNIQUE/i,
  );
  assert.equal(await arena.participants.countActive('r1'), 1);

  await arena.participants.heartbeat({ id: 'p1', now: NOW + 5 });
  assert.equal((await arena.participants.getById('p1')).lastSeenAt, NOW + 5);

  await arena.participants.rename({ id: 'p1', name: 'Ana Clara', now: NOW + 6 });
  assert.equal((await arena.participants.getById('p1')).name, 'Ana Clara');

  await arena.participants.remove({ id: 'p1', now: NOW + 7 });
  assert.equal((await arena.participants.getById('p1')).active, false);
  assert.equal(await arena.participants.countActive('r1'), 0);
});

test('challenges save, list, duplicate shape and delete', async () => {
  const criteria = [
    { criterion: 'objetivo', weight: 40 },
    { criterion: 'formato', weight: 60 },
  ];
  const challenge = await arena.challenges.save({
    id: 'c1', title: 'Cartaz', modality: 'precisao', mission: 'Crie um cartaz.',
    context: 'Feira', criteria, attempts: 2, durationSeconds: 120, speedWeight: 'low',
    now: NOW,
  });
  assert.equal(challenge.title, 'Cartaz');
  assert.equal(challenge.criteria.length, 2);

  const loaded = await arena.challenges.getById('c1');
  assert.deepEqual(loaded.criteria.map((entry) => entry.weight).sort(), [40, 60]);
  assert.equal(loaded.durationSeconds, 120);
  assert.equal(loaded.speedWeight, 'low');

  const all = await arena.challenges.list();
  assert.equal(all.length, 1);

  await arena.challenges.delete('c1');
  assert.equal(await arena.challenges.getById('c1'), undefined);
  assert.equal((await arena.challenges.list()).length, 0);
});

test('rounds support add, reorder and status changes', async () => {
  await arena.rooms.create({ id: 'r1', code: 'ABC123', title: 'Sala', now: NOW });
  await arena.challenges.save({ id: 'c1', title: 'D1', modality: 'precisao', mission: 'M1', now: NOW });
  await arena.challenges.save({ id: 'c2', title: 'D2', modality: 'resgate', mission: 'M2', now: NOW });

  const r1 = await arena.rounds.add({ id: 'w1', roomId: 'r1', position: 1, challengeId: 'c1', modality: 'precisao', now: NOW });
  const r2 = await arena.rounds.add({ id: 'w2', roomId: 'r1', position: 2, challengeId: 'c2', modality: 'resgate', now: NOW });
  assert.equal(r1.status, 'pending');

  await arena.rounds.reorder({ roomId: 'r1', positions: ['w2', 'w1'] });
  const reordered = await arena.rounds.listByRoom('r1');
  assert.equal(reordered[0].id, 'w2');
  assert.equal(reordered[1].id, 'w1');

  await arena.rounds.updateStatus({ id: 'w1', status: 'open', now: NOW + 1, startedAt: NOW + 1, deadlineAt: NOW + 61 });
  assert.equal((await arena.rounds.getById('w1')).deadlineAt, NOW + 61);

  await arena.rounds.remove('w2');
  assert.equal((await arena.rounds.listByRoom('r1')).length, 1);
});

test('submissions and scores round-trip with breakdown', async () => {
  await arena.rooms.create({ id: 'r1', code: 'ABC123', title: 'Sala', now: NOW });
  await arena.challenges.save({ id: 'c1', title: 'D1', modality: 'precisao', mission: 'M1', now: NOW });
  const round = await arena.rounds.add({ id: 'w1', roomId: 'r1', position: 1, challengeId: 'c1', modality: 'precisao', now: NOW });
  const participant = await arena.participants.join({ id: 'p1', roomId: 'r1', name: 'Ana', token: 't1', now: NOW });

  const submission = await arena.submissions.create({
    id: 's1', roomId: 'r1', participantId: 'p1', roundId: 'w1', attempt: 1,
    prompt: 'prompt da ana', submittedAt: NOW + 10,
  });
  assert.equal(submission.prompt, 'prompt da ana');

  await arena.scores.record({
    id: 'sc1', submissionId: 's1', percent: 85, breakdown: { objetivo: 18, formato: 16 },
    feedback: 'bom', now: NOW + 12,
  });
  const score = await arena.scores.getBySubmission('s1');
  assert.equal(score.percent, 85);
  assert.equal(score.breakdown.objetivo, 18);

  const byRound = await arena.scores.listByRound('w1');
  assert.equal(byRound.length, 1);
  assert.equal(byRound[0].participantId, 'p1');

  await arena.judgeAttempts.record({ id: 'ja1', submissionId: 's1', attempt: 1, status: 'succeeded', model: 'arena-fallback-v1', now: NOW + 12 });
  assert.equal((await arena.judgeAttempts.listBySubmission('s1')).length, 1);
});