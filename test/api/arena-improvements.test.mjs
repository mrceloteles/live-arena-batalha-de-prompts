import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createApiHttpHandler } from '../../src/server/http.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createAdminAuth } from '../../src/server/admin-auth.mjs';
import { createArenaApi } from '../../src/server/arena-api.mjs';
import { createApi } from '../../src/server/api.mjs';

async function fixture(t, { speed = 'high', duration = 120, capacity = 50, judge } = {}) {
  const opened = openDatabase(':memory:');
  t.after(() => opened.close());
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  let clock = 1000, calls = 0;
  const now = () => clock;
  const auth = createAdminAuth({ password: 'test-password', secret: 'test-secret-with-at-least-32-characters', now });
  const admin = { admin_token: auth.login('test-password').token };
  const evaluate = async (input) => { calls++; return judge ? judge(input) : { percent: 80, breakdown: {}, feedback: 'Avaliado' }; };
  const api = createArenaApi({ repositories, adminAuth: auth, now, judge: evaluate });
  const core = createApi({ repositories, adminAuth: auth, now, judge: evaluate });
  await api('arena_set_open', { ...admin, open: true });
  const { room } = await api('arena_create_room', { ...admin, title: 'Sala de teste', expected_players: capacity });
  // O gabarito é exigido para a sala abrir: sem ele o juiz não tem referência.
  const { challenge } = await api('arena_save_challenge', {
    ...admin, title: 'Missão', mission: 'Escreva um texto', modality: 'refinamento', attempts: 2,
    duration_seconds: duration, speed_weight: speed,
    reference_text: 'Texto de referência com público, formato e restrições claras.',
  });
  const { round } = await api('arena_add_round', { ...admin, room_id: room.id, challenge_id: challenge.id });
  await api('arena_publish_room', { ...admin, room_id: room.id });
  const join = async (name) => { const value = await api('arena_join', { code: room.code, name }); return { participant_id: value.participant.id, token: value.token }; };
  return { api, core, admin, room, round, repositories, join, calls: () => calls, time: (value) => { clock = value; } };
}

test('custom speed points are persisted and rank equally accurate early responses first', async (t) => {
  const f = await fixture(t);
  const ana = await f.join('Ana'), bia = await f.join('Bia');
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  f.time(1010);
  const early = await f.api('arena_submit', { ...ana, round_id: f.round.id, attempt: 1, prompt: 'Primeiro prompt' });
  f.time(1110);
  const late = await f.api('arena_submit', { ...bia, round_id: f.round.id, attempt: 1, prompt: 'Segundo prompt' });
  assert.ok(early.submission.points > late.submission.points);
  assert.equal(early.submission.percent, late.submission.percent);
  const { detail } = await f.api('arena_room_detail', { ...f.admin, room_id: f.room.id });
  assert.equal(detail.ranking[0].name, 'Ana');
  assert.equal(detail.ranking[0].points_sum, early.submission.points);
});

test('unlimited missions ignore speed weighting', async (t) => {
  const f = await fixture(t, { duration: null });
  const ana = await f.join('Ana');
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  f.time(9000);
  const result = await f.api('arena_submit', { ...ana, round_id: f.round.id, attempt: 1, prompt: 'Sem prazo' });
  assert.equal(result.submission.points, 80);
});

test('multiple attempts remain in report history but count one best round', async (t) => {
  const f = await fixture(t, { speed: 'none', judge: async ({ candidatePrompt }) => ({ percent: candidatePrompt === 'Melhor prompt' ? 90 : 50, breakdown: {}, feedback: 'Avaliado' }) });
  const ana = await f.join('Ana');
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  await f.api('arena_submit', { ...ana, round_id: f.round.id, attempt: 1, prompt: 'Melhor prompt' });
  await f.api('arena_submit', { ...ana, round_id: f.round.id, attempt: 2, prompt: 'Outra tentativa' });
  const { metrics } = await f.core('report_metrics', f.admin);
  assert.equal(metrics.tables.matches.length, 2);
  assert.equal(metrics.tables.players[0].rounds_completed, 1);
  assert.equal(metrics.tables.players[0].total_points, 90);
  assert.equal(metrics.tables.players[0].matches_started, 2);
  const { detail } = await f.api('arena_room_detail', { ...f.admin, room_id: f.room.id });
  assert.equal(detail.ranking[0].rounds_completed, 1);
  assert.equal(detail.ranking[0].points_sum, 90);
  assert.equal(detail.rounds[0].ranking.length, 1);
});

test('same accepted attempt is recoverable after deadline without evaluating twice', async (t) => {
  const f = await fixture(t);
  const ana = await f.join('Ana');
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  const payload = { ...ana, round_id: f.round.id, attempt: 1, prompt: 'Prompt recebido' };
  const first = await f.api('arena_submit', payload);
  f.time(1200);
  const retry = await f.api('arena_submit', payload);
  assert.equal(retry.submission.id, first.submission.id);
  assert.equal(retry.submission.points, first.submission.points);
  assert.equal(f.calls(), 1);
  await assert.rejects(f.api('arena_submit', { ...payload, prompt: 'Prompt alterado' }), (error) => error.status === 409);
});

test('simultaneous duplicate sends share one evaluation', async (t) => {
  const f = await fixture(t, { judge: async () => { await new Promise((resolve) => setTimeout(resolve, 15)); return { percent: 80, breakdown: {}, feedback: 'Avaliado' }; } });
  const ana = await f.join('Ana');
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  const payload = { ...ana, round_id: f.round.id, attempt: 1, prompt: 'Prompt recebido' };
  const results = await Promise.all(Array.from({ length: 10 }, () => f.api('arena_submit', payload)));
  assert.equal(new Set(results.map((result) => result.submission.id)).size, 1);
  assert.equal(f.calls(), 1);
});

test('fifty simultaneous joins allocate distinct seats and enforce capacity', async (t) => {
  const f = await fixture(t);
  const results = await Promise.allSettled(Array.from({ length: 55 }, (_, index) => f.join(`Aluno ${index}`)));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 50);
  for (const result of results.filter((result) => result.status === 'rejected')) assert.equal(result.reason.status, 409);
  const participants = await f.repositories.arena.participants.listByRoom(f.room.id);
  assert.equal(new Set(participants.map((person) => person.stationNumber)).size, 50);
});

test('pending evaluation survives the deadline and can be recovered', async (t) => {
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const f = await fixture(t, { judge: async () => { entered(); await barrier; return { percent: 80, breakdown: {}, feedback: 'Avaliado' }; } });
  const ana = await f.join('Ana');
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  const pending = f.api('arena_submit', { ...ana, round_id: f.round.id, attempt: 1, prompt: 'Recebido no prazo' });
  await started;
  const before = await f.api('arena_lobby', ana);
  assert.equal(before.lobby.current_round.my_submissions[0].status, 'received');
  f.time(1130);
  await f.api('arena_lobby', ana);
  release();
  const result = await pending;
  assert.equal(result.submission.percent, 80);
  assert.equal((await f.repositories.arena.scores.listByRound(f.round.id)).length, 1);
});

test('paused time does not reduce custom speed points', async (t) => {
  const f = await fixture(t);
  const ana = await f.join('Ana');
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  f.time(1010);
  await f.api('arena_pause_round', { ...f.admin, room_id: f.room.id });
  f.time(1110);
  await f.api('arena_resume_round', { ...f.admin, room_id: f.room.id });
  f.time(1120);
  const value = await f.api('arena_submit', { ...ana, round_id: f.round.id, attempt: 1, prompt: 'Após a pausa' });
  assert.equal(value.submission.points, 90.67);
});

test('simultaneous deadline polls close a round once and retain every zero score', async (t) => {
  const f = await fixture(t);
  const people = await Promise.all(Array.from({ length: 10 }, (_, index) => f.join(`Aluno ${index}`)));
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  f.time(1130);
  await Promise.all(people.map((person) => f.api('arena_lobby', person)));
  assert.equal((await f.repositories.arena.scores.listByRound(f.round.id)).length, 10);
});

test('teacher controls stop offering start while a round is active', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.api('arena_admin_status', f.admin)).rooms[0].can_start, true);
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  assert.equal((await f.api('arena_admin_status', f.admin)).rooms[0].can_start, false);
});

test('fifty students submit concurrently over HTTP without losing evaluations', async (t) => {
  let active = 0, peak = 0;
  const f = await fixture(t, { judge: async () => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active--;
    return { percent: 80, breakdown: {}, feedback: 'Avaliado' };
  } });
  const server = createServer(createApiHttpHandler(f.api));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api.php`;
    const post = async (action, payload) => {
      const response = await fetch(`${base}?action=${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    const people = await Promise.all(Array.from({ length: 50 }, (_, i) => post('arena_join', { code: f.room.code, name: `Aluno HTTP ${i}` })));
    await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
    const results = await Promise.all(people.map((person) => post('arena_submit', { participant_id: person.participant.id, token: person.token, round_id: f.round.id, attempt: 1, prompt: 'Meu prompt concorrente' })));
    assert.equal(new Set(results.map((result) => result.submission.id)).size, 50);
    assert.equal((await f.repositories.arena.scores.listByRound(f.round.id)).length, 50);
    assert.ok(peak > 1, 'different students must not wait for one serialized judge queue');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

// O PIN da sala e o nome NAO provam quem e a pessoa: devolver o registro antigo
// (token novo no MESMO id) entregava a quem digitasse o nome o e-mail, a
// empresa, o consentimento e os pontos de outro aluno. A reentrada agora e um
// participante novo; o registro de quem saiu fica arquivado, com o historico
// dele, no relatorio do professor.
test('aluno removido que volta com o mesmo nome entra como identidade nova', async (t) => {
  const f = await fixture(t);
  const ana = await f.join('Ana');
  await f.api('arena_set_profile', {
    ...ana, email: 'ana@empresa.com', role: 'Analista', company: 'Empresa X', consent: true,
  });
  await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  await f.api('arena_submit', { ...ana, round_id: f.round.id, attempt: 1, prompt: 'Prompt da Ana' });

  await f.api('arena_remove_participant', { ...f.admin, room_id: f.room.id, participant_id: ana.participant_id });
  // A sessao de quem foi removido morre junto com a remocao.
  await assert.rejects(f.api('arena_lobby', { ...ana }), (error) => error.status === 401);

  const volta = await f.api('arena_join', { code: f.room.code, name: 'Ana' });
  assert.notEqual(volta.participant.id, ana.participant_id, 'a reentrada e um participante novo');
  const nova = await f.repositories.arena.participants.getById(volta.participant.id);
  assert.equal(nova.active, true);
  assert.equal(nova.email, '', 'o e-mail de quem saiu nao viaja junto com o nome');
  assert.equal(nova.role, '');
  assert.equal(nova.company, '');
  assert.equal(nova.consent, false);

  const antiga = await f.repositories.arena.participants.getById(ana.participant_id);
  assert.equal(antiga.active, false);
  assert.equal(antiga.name, 'Ana (saiu)', 'o registro antigo fica arquivado, com rotulo');
  assert.equal(antiga.email, 'ana@empresa.com', 'e o perfil dele nao e apagado do relatorio');
  assert.notEqual(antiga.token, ana.token, 'o token arquivado e rotacionado');

  // O historico da Ana antiga continua no id antigo: quem digita o nome depois
  // nao herda os pontos de ninguem.
  const envios = await f.repositories.arena.submissions.listByRound(f.round.id);
  assert.deepEqual(envios.map((entry) => String(entry.participantId)), [String(ana.participant_id)]);
  const { detail } = await f.api('arena_room_detail', { ...f.admin, room_id: f.room.id });
  assert.deepEqual(detail.participants.map((entry) => entry.name).sort(), ['Ana', 'Ana (saiu)']);
});

test('nome de quem ja esta na sala continua recusado na entrada', async (t) => {
  const f = await fixture(t);
  await f.join('Ana');
  await assert.rejects(
    f.api('arena_join', { code: f.room.code, name: 'Ana' }),
    (error) => error.status === 409,
  );
});

test('a segunda saida do mesmo nome nao colide no rotulo do arquivo', async (t) => {
  const f = await fixture(t);
  const primeira = await f.join('Ana');
  await f.api('arena_remove_participant', { ...f.admin, room_id: f.room.id, participant_id: primeira.participant_id });
  const segunda = await f.join('Ana');
  await f.api('arena_remove_participant', { ...f.admin, room_id: f.room.id, participant_id: segunda.participant_id });
  const terceira = await f.join('Ana');
  assert.notEqual(terceira.participant_id, segunda.participant_id);
  const nomes = (await f.repositories.arena.participants.listByRoom(f.room.id)).map((entry) => entry.name).sort();
  assert.deepEqual(nomes, ['Ana', 'Ana (saiu 2)', 'Ana (saiu)']);
});
