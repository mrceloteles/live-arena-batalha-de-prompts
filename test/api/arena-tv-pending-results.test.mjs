import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createAdminAuth } from '../../src/server/admin-auth.mjs';
import { createArenaApi } from '../../src/server/arena-api.mjs';

test('TV and student wait for every accepted answer to be scored before the final podium', async (t) => {
  const opened = openDatabase(':memory:');
  t.after(() => opened.close());
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const now = () => 1000;
  const adminAuth = createAdminAuth({
    password: 'test-password', secret: 'test-secret-with-at-least-32-characters', now,
  });
  const admin = { admin_token: adminAuth.login('test-password').token };
  const api = createArenaApi({
    repositories, adminAuth, now,
    judge: async () => { throw new Error('This test must not invoke a judge'); },
  });
  await api('arena_set_open', { ...admin, open: true });
  const { room } = await api('arena_create_room', { ...admin, title: 'Final da batalha', expected_players: 2 });
  const { challenge } = await api('arena_save_challenge', {
    ...admin, title: 'Cartaz', modality: 'precisao', mission: 'Crie um cartaz para a feira.',
    reference_text: 'Cartaz para a feira da escola com data, local e convite para as famílias.',
    duration_seconds: 120, speed_weight: 'none',
  });
  const { round } = await api('arena_add_round', { ...admin, room_id: room.id, challenge_id: challenge.id });
  await api('arena_publish_room', { ...admin, room_id: room.id });
  const ana = await api('arena_join', { code: room.code, name: 'Ana' });
  const bia = await api('arena_join', { code: room.code, name: 'Bia' });
  const { tv_token } = await api('arena_tv_token', { ...admin, room_id: room.id });
  const project = async () => (await api('arena_tv', { pin: room.pin || room.code, tv_token })).tv;
  const student = async () => (await api('arena_lobby', { participant_id: ana.participant.id, token: ana.token })).lobby;
  await api('arena_start_round', { ...admin, room_id: room.id });
  assert.equal((await project()).results_pending, 0, 'an empty round has no pending evaluation');

  for (const person of [ana, bia]) {
    await repositories.arena.submissions.create({
      id: `submission-${person.participant.id}`, roomId: room.id, participantId: person.participant.id,
      roundId: round.id, attempt: 1, prompt: `Cartaz de ${person.participant.name}`, submittedAt: now(),
    });
  }
  assert.equal((await project()).results_pending, 2, 'both accepted answers await a score during the round');
  await repositories.arena.scores.record({
    id: 'score-ana', submissionId: `submission-${ana.participant.id}`, percent: 80,
    breakdown: {}, feedback: 'Resposta avaliada.', now: now(),
  });
  await api('arena_end_room', { ...admin, room_id: room.id });
  const pendingTv = await project();
  assert.equal(pendingTv.room.status, 'ended');
  assert.equal(pendingTv.room.phase, 'final_results');
  assert.equal(pendingTv.results_pending, 1, 'ending the room must not hide an unfinished evaluation');
  assert.equal(pendingTv.results_pending, (await student()).results_pending);
  assert.equal(pendingTv.ranking[0].name, 'Ana', 'the provisional leader is available but not final');

  await repositories.arena.scores.record({
    id: 'score-bia', submissionId: `submission-${bia.participant.id}`, percent: 95,
    breakdown: {}, feedback: 'Resposta avaliada.', now: now(),
  });
  const completeTv = await project();
  assert.equal(completeTv.results_pending, 0, 'the podium is ready only after the last score arrives');
  assert.equal(completeTv.results_pending, (await student()).results_pending);
  assert.equal(completeTv.ranking[0].name, 'Bia', 'the later evaluation changes the winner');
  assert.deepEqual(completeTv.ranking.map((entry) => entry.name), ['Bia', 'Ana']);
});
