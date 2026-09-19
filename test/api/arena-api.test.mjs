import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createAdminAuth } from '../../src/server/admin-auth.mjs';
import { createArenaApi } from '../../src/server/arena-api.mjs';
import { createFallbackSafeCriteriaJudge } from '../../src/judge/criteria-judge.mjs';

let opened, repositories, arenaDispatch, clock, sequence, adminToken;
beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 1_000_000;
  sequence = 0;
  const adminAuth = createAdminAuth({
    password: 'senha-segura-123', secret: 'segredo-muito-longo-para-teste-123456',
    now: () => clock,
  });
  adminToken = adminAuth.login('senha-segura-123').token;
  arenaDispatch = createArenaApi({
    repositories,
    judge: createFallbackSafeCriteriaJudge({ fetchImpl: async () => { throw new Error('no network'); } }),
    now: () => clock,
    id: () => `id-${++sequence}`,
    adminAuth,
  });
});
afterEach(() => opened.close());

const admin = () => ({ admin_token: adminToken });
const api = (action, payload = {}, meta = {}) => arenaDispatch(action, payload, meta);

test('round controls reject overlapping starts and cross-room removal', async () => {
  const { room, challenge } = await setupRoom();
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  await api('arena_start_round', { ...admin(), room_id: room.id });
  await assert.rejects(api('arena_start_round', { ...admin(), room_id: room.id }), (error) => error.status === 409);
  const other = await setupRoom();
  const [active] = await repositories.arena.rounds.listByRoom(room.id);
  await assert.rejects(api('arena_remove_round', { ...admin(), room_id: other.room.id, round_id: active.id }), (error) => error.status === 404);
  assert.equal((await repositories.arena.rounds.getById(active.id)).status, 'open');
});

test('removing a middle round allows another mission and keeps contiguous positions', async () => {
  const { room, challenge } = await setupRoom();
  for (let n = 0; n < 2; n++) await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  const rounds = await repositories.arena.rounds.listByRoom(room.id);
  await api('arena_remove_round', { ...admin(), room_id: room.id, round_id: rounds[1].id });
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  assert.deepEqual((await repositories.arena.rounds.listByRoom(room.id)).map((round) => round.position), [1, 2, 3]);
});

test('reordering requires each room mission exactly once without changing invalid requests', async () => {
  const { room, challenge } = await setupRoom();
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  const rounds = await repositories.arena.rounds.listByRoom(room.id);
  for (const positions of [[rounds[0].id], [rounds[0].id, rounds[0].id], [rounds[0].id, 'foreign']]) {
    await assert.rejects(api('arena_reorder_rounds', { ...admin(), room_id: room.id, positions }), (error) => error.status === 422);
    assert.deepEqual(await repositories.arena.rounds.listByRoom(room.id), rounds);
  }
  await api('arena_reorder_rounds', { ...admin(), room_id: room.id, positions: rounds.map((round) => round.id).reverse() });
  assert.deepEqual((await repositories.arena.rounds.listByRoom(room.id)).map((round) => round.id), rounds.map((round) => round.id).reverse());
});

const CRITERIA = [
  { criterion: 'objetivo', weight: 30 },
  { criterion: 'contexto', weight: 25 },
  { criterion: 'publico', weight: 20 },
  { criterion: 'formato', weight: 15 },
  { criterion: 'restricoes', weight: 10 },
];

async function setupRoom({ expectedPlayers = 3 } = {}) {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Turma 2026', expected_players: expectedPlayers })).room;
  const challenge = (await api('arena_save_challenge', {
    ...admin(), title: 'Cartaz', modality: 'precisao', mission: 'Crie um cartaz para a feira de tecnologia.',
    context: 'Feira anual do ensino medio.', criteria: CRITERIA, duration_seconds: 120, speed_weight: 'none',
    reference_text: 'Cartaz A3 da feira de tecnologia, com data, local, lista de stands e contato, linguagem chamativa para adolescentes.',
  })).challenge;
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  await api('arena_publish_room', { ...admin(), room_id: room.id });
  return { room, challenge };
}

test('arena gate blocks joining while closed and opens via admin', async () => {
  await assert.rejects(api('arena_join', { code: 'ABCD12', name: 'Ana' }), (error) => error.status === 409);
  const openedStatus = await api('arena_set_open', { ...admin(), open: true });
  assert.equal(openedStatus.open, true);
  const status = await api('arena_status');
  assert.equal(status.open, true);
});

test('join validates code, capacity and duplicate names', async () => {
  const { room } = await setupRoom({ expectedPlayers: 2 });
  const join = await api('arena_join', { code: room.code, name: 'Ana' });
  assert.ok(join.token);
  assert.equal(join.participant.room.code, room.code);

  await assert.rejects(api('arena_join', { code: room.code, name: 'Ana' }), (error) => error.status === 409);
  await assert.rejects(api('arena_join', { code: 'ZZZZ99', name: 'Bia' }), (error) => error.status === 404);
  const bia = await api('arena_join', { code: room.code, name: 'Bia' });
  assert.ok(bia.token);
  // Capacidade 2 atingida.
  await assert.rejects(api('arena_join', { code: room.code, name: 'Caio' }), (error) => error.status === 409);
});

test('full mission lifecycle: start, submit, quality ordering, timeout and results', async () => {
  const { room } = await setupRoom();
  const ana = await api('arena_join', { code: room.code, name: 'Ana' });
  const bia = await api('arena_join', { code: room.code, name: 'Bia' });
  const caio = await api('arena_join', { code: room.code, name: 'Caio' });

  const detail = (await api('arena_start_round', { ...admin(), room_id: room.id })).room;
  assert.equal(detail.room.status, 'playing');
  const roundId = detail.rounds[0].id;
  assert.equal(detail.rounds[0].status, 'open');
  assert.ok(detail.rounds[0].deadline_at > clock);

  clock += 2;
  const good = await api('arena_submit', {
    participant_id: ana.participant.id, token: ana.token, round_id: roundId,
    prompt: 'Crie um cartaz vibrante para a feira de tecnologia, em formato A3, para estudantes do ensino médio, com cores fortes e sem texto pequeno.',
  });
  const poor = await api('arena_submit', {
    participant_id: bia.participant.id, token: bia.token, round_id: roundId,
    prompt: 'faça um cartaz',
  });
  assert.ok(good.submission.percent > poor.submission.percent + 30);
  assert.ok(Object.keys(good.submission.breakdown).length >= 5);
  assert.ok(good.submission.feedback.length > 0);
  assert.equal(good.submission.evolution, null);

  // Submissao duplicada na mesma tentativa e bloqueada apos a avaliacao.
  await assert.rejects(api('arena_submit', {
    participant_id: ana.participant.id, token: ana.token, round_id: roundId,
    prompt: 'outro prompt diferente',
  }), (error) => error.status === 409);

  // Prazo vence: caio (sem envio) e zerado e a rodada vai para resultados.
  clock = Number(detail.rounds[0].deadline_at) + 30;
  const lobby = (await api('arena_lobby', { participant_id: ana.participant.id, token: ana.token })).lobby;
  assert.equal(lobby.rounds[0].status, 'results');
  assert.equal(lobby.results.length, 1);
  const caioRow = lobby.results[0].ranking.find((entry) => entry.name === 'Caio');
  assert.equal(caioRow.percent, 0);
  assert.ok(lobby.ranking.length === 3);
  assert.equal(lobby.ranking[0].name, 'Ana');

  // Apos o prazo, nao aceita mais submissao.
  await assert.rejects(api('arena_submit', {
    participant_id: caio.participant.id, token: caio.token, round_id: roundId,
    prompt: 'agora eu envio',
  }), (error) => error.status === 409);
});

test('pause freezes submissions and resume extends the deadline', async () => {
  const { room } = await setupRoom();
  const ana = await api('arena_join', { code: room.code, name: 'Ana' });
  const bia = await api('arena_join', { code: room.code, name: 'Bia' });

  const detail = (await api('arena_start_round', { ...admin(), room_id: room.id })).room;
  const round = detail.rounds[0];
  const originalDeadline = Number(round.deadline_at);
  assert.equal(round.status, 'open');
  assert.equal(round.paused_at, null);

  // Pausar: prazo congelado, envios bloqueados.
  clock += 30;
  const paused = (await api('arena_pause_round', { ...admin(), room_id: room.id })).room;
  const pausedRound = paused.rounds[0];
  assert.equal(pausedRound.status, 'open');
  assert.equal(Number(pausedRound.paused_at), clock);
  await assert.rejects(api('arena_submit', {
    participant_id: ana.participant.id, token: ana.token, round_id: round.id,
    prompt: 'envio durante a pausa',
  }), (error) => error.status === 409);

  // Pausar de novo e rejeitado; retomar sem pausa tambem.
  await assert.rejects(api('arena_pause_round', { ...admin(), room_id: room.id }), (error) => error.status === 409);

  // 60s depois, retomar: deadline estendido pela duracao da pausa.
  clock += 60;
  const resumed = (await api('arena_resume_round', { ...admin(), room_id: room.id })).room;
  const resumedRound = resumed.rounds[0];
  assert.equal(resumedRound.paused_at, null);
  assert.equal(Number(resumedRound.deadline_at), originalDeadline + 60);
  await assert.rejects(api('arena_resume_round', { ...admin(), room_id: room.id }), (error) => error.status === 409);

  // Envio funciona novamente apos retomar.
  clock += 2;
  const ok = await api('arena_submit', {
    participant_id: ana.participant.id, token: ana.token, round_id: round.id,
    prompt: 'Crie um cartaz vibrante para a feira de tecnologia, em formato A3, para estudantes do ensino médio, com cores fortes e sem texto pequeno.',
  });
  assert.ok(ok.submission.percent > 0);

  // Ao vencer o prazo estendido, a rodada fecha normalmente (auto-close).
  clock = Number(resumedRound.deadline_at) + 30;
  const lobby = (await api('arena_lobby', { participant_id: bia.participant.id, token: bia.token })).lobby;
  assert.equal(lobby.rounds[0].status, 'results');
});

test('advanced modes (diagnostico, briefing, boss, completo, essencial) run end to end', async () => {
  const modes = [
    { modality: 'diagnostico', mission: 'Explique inteligencia artificial.', prompt: 'Explique inteligência artificial para um aluno do 6º ano, em texto curto com exemplos do dia a dia, sem termos técnicos sem explicação.' },
    { modality: 'briefing', mission: 'Quero uma postagem para minha empresa. Tem que parecer profissional, mas nao muito formal. Meu publico e jovem. Nao quero muito texto. Quero algo bonito.', prompt: 'Crie uma postagem para o Instagram da minha empresa de tecnologia, tom profissional porém descontraído, para público jovem de 18 a 25 anos, no máximo 3 frases, com visual moderno e CTA no final.' },
    { modality: 'boss', mission: 'Missao final: combine tudo.', prompt: 'Desenvolva um plano de lançamento completo para um aplicativo de estudos, para alunos do ensino médio, com cronograma de 4 semanas, restrições de orçamento, formato de apresentação executiva e métricas de sucesso definidas.' },
    { modality: 'completo', mission: 'Monte um prompt completo.', prompt: 'Elabore um roteiro de 10 slides para apresentar o projeto de robótica, para a banca avaliadora, com contexto do projeto, instruções por slide, restrições de tempo de 5 minutos, formato visual consistente e critérios claros de resultado.' },
    { modality: 'essencial', mission: 'Prompt essencial.', prompt: 'Resumo de IA para iniciantes, 100 palavras, sem jargão.' },
  ];
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Modos', expected_players: 2 })).room;
  for (const mode of modes) {
    const challenge = (await api('arena_save_challenge', {
      ...admin(), title: mode.modality, modality: mode.modality, mission: mode.mission,
      criteria: CRITERIA, duration_seconds: 300, speed_weight: 'none',
      // O gabarito é o que sustenta a nota: sem ele a sala nem abre.
      reference_text: mode.prompt,
    })).challenge;
    await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  }
  await api('arena_publish_room', { ...admin(), room_id: room.id });
  const ana = await api('arena_join', { code: room.code, name: 'Ana' });
  for (let index = 0; index < modes.length; index += 1) {
    const mode = modes[index];
    const detail = (await api('arena_start_round', { ...admin(), room_id: room.id })).room;
    const round = detail.rounds[index];
    assert.equal(round.modality, mode.modality);
    assert.equal(round.status, 'open');
    clock += 2;
    const submitted = await api('arena_submit', {
      participant_id: ana.participant.id, token: ana.token, round_id: round.id,
      prompt: mode.prompt,
    });
    assert.ok(submitted.submission.percent > 0, mode.modality + ' scored');
    assert.ok(Object.keys(submitted.submission.breakdown).length >= 5, mode.modality + ' breakdown');
    clock += 1;
    await api('arena_end_round', { ...admin(), room_id: room.id });
    await api('arena_close_round', { ...admin(), room_id: room.id });
  }
});

test('lesson catalog lists the four aula sets', async () => {
  const data = await api('arena_list_lessons', { ...admin() });
  assert.equal(data.lessons.length, 4);
  const ids = data.lessons.map((lesson) => lesson.id);
  assert.deepEqual(ids, ['aula2-fundacao', 'aula3-controle', 'aula4-visual', 'aula5-final']);
  const final = data.lessons.find((lesson) => lesson.id === 'aula5-final');
  assert.equal(final.challenges.length, 7);
  assert.equal(final.challenges[6].modality, 'boss');
});

test('arena_add_lesson seeds a draft room with challenges and rounds in order', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Turma', expected_players: 3 })).room;
  const added = await api('arena_add_lesson', { ...admin(), room_id: room.id, lesson_id: 'aula2-fundacao' });
  assert.equal(added.lesson.count, 4);
  assert.equal(added.created.length, 4);
  assert.equal(added.rounds.length, 4);
  const detail = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  assert.equal(detail.rounds.length, 4);
  assert.deepEqual(detail.rounds.map((round) => round.position), [1, 2, 3, 4]);
  assert.deepEqual(detail.rounds.map((round) => round.modality), ['resgate', 'precisao', 'essencial', 'diagnostico']);
});

test('arena_add_lesson guards invalid ids, in-play rooms and bank-only mode', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Turma', expected_players: 3 })).room;
  await assert.rejects(api('arena_add_lesson', { ...admin(), lesson_id: 'aula-inexistente' }), (error) => error.status === 404);

  // Banco apenas: cria desafios sem rodadas.
  const bankOnly = await api('arena_add_lesson', { ...admin(), lesson_id: 'aula3-controle' });
  assert.equal(bankOnly.created.length, 4);
  assert.equal(bankOnly.rounds, null);

  // Sala em jogo: bloqueado. (Aula 3 e de texto: a Aula 4 e visual e so abre
  // depois que as imagens das missoes reversa existirem — ver o teste do gate.)
  await api('arena_add_lesson', { ...admin(), room_id: room.id, lesson_id: 'aula3-controle' });
  await api('arena_publish_room', { ...admin(), room_id: room.id });
  await api('arena_start_round', { ...admin(), room_id: room.id });
  await assert.rejects(api('arena_add_lesson', { ...admin(), room_id: room.id, lesson_id: 'aula2-fundacao' }), (error) => error.status === 409);
});

test('essencial enforces the 250-character limit', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Essencial', expected_players: 1 })).room;
  const challenge = (await api('arena_save_challenge', {
    ...admin(), title: 'Curto', modality: 'essencial', mission: 'Resumo curto.',
    criteria: CRITERIA,
    reference_text: 'Resumo de inteligência artificial em três frases, para iniciantes, sem jargão.',
  })).challenge;
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  await api('arena_publish_room', { ...admin(), room_id: room.id });
  const ana = await api('arena_join', { code: room.code, name: 'Ana' });
  const detail = (await api('arena_start_round', { ...admin(), room_id: room.id })).room;
  const roundId = detail.rounds[0].id;
  clock += 2;
  // Prompt legivel: o limite e o assunto do teste; texto socado no teclado nao
  // pontua mais (ver test/judge/criteria-judge.test.mjs).
  const atLimit = 'Crie um resumo curto e claro das ideias principais do texto da missão, em três frases, para a turma do 6º ano, sem termos técnicos e mantendo o tom da história original.'
    .padEnd(250, ' ok')
    .slice(0, 250);
  assert.equal(atLimit.length, 250);
  await assert.rejects(api('arena_submit', {
    participant_id: ana.participant.id, token: ana.token, round_id: roundId,
    prompt: `${atLimit}x`,
  }), (error) => error.status === 422);
  const ok = await api('arena_submit', {
    participant_id: ana.participant.id, token: ana.token, round_id: roundId,
    prompt: atLimit,
  });
  assert.ok(ok.submission.percent > 0);
});

test('refinement mode awards a second attempt and records evolution', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Turma', expected_players: 1 })).room;
  const challenge = (await api('arena_save_challenge', {
    ...admin(), title: 'Refinamento', modality: 'refinamento', mission: 'Escreva um prompt para gerar um infografico educativo.',
    criteria: CRITERIA, attempts: 2, duration_seconds: 300,
    reference_text: 'Infográfico educativo sobre energia solar, vertical, 5 seções numeradas, ícones simples, amarelo e azul.',
  })).challenge;
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  await api('arena_publish_room', { ...admin(), room_id: room.id });
  const ana = await api('arena_join', { code: room.code, name: 'Ana' });

  const detail = (await api('arena_start_round', { ...admin(), room_id: room.id })).room;
  const roundId = detail.rounds[0].id;
  clock += 2;
  const v1 = await api('arena_submit', { participant_id: ana.participant.id, token: ana.token, round_id: roundId, prompt: 'Crie um infográfico sobre energia solar.' });
  const v2 = await api('arena_submit', {
    participant_id: ana.participant.id, token: ana.token, round_id: roundId,
    prompt: 'Crie um infográfico educativo e colorido sobre energia solar, em formato vertical A4, para alunos do 6º ano, com 5 seções. Não use termos técnicos sem explicação.',
  });
  assert.equal(v1.submission.attempt, 1);
  assert.equal(v2.submission.attempt, 2);
  assert.equal(v2.submission.evolution, Math.round((v2.submission.percent - v1.submission.percent) * 100) / 100);
  assert.ok(v2.submission.evolution >= 0);

  // Terceira tentativa bloqueada (attempts = 2).
  await assert.rejects(api('arena_submit', {
    participant_id: ana.participant.id, token: ana.token, round_id: roundId,
    prompt: 'uma terceira versao qualquer',
  }), (error) => error.status === 409);
});

test('challenge bank: save, validate, duplicate and delete with usage guard', async () => {
  const saved = await api('arena_save_challenge', {
    ...admin(), title: 'Boss', modality: 'boss', mission: 'Combine tudo.', criteria: CRITERIA,
  });
  assert.equal(saved.challenge.modality, 'boss');

  await assert.rejects(api('arena_save_challenge', {
    ...admin(), title: 'Ruim', modality: 'inexistente', mission: 'x',
  }), (error) => error.status === 422);
  await assert.rejects(api('arena_save_challenge', {
    ...admin(), title: 'Sem criterio', modality: 'precisao', mission: 'x', criteria: [],
  }), (error) => error.status === 422);

  const dup = (await api('arena_duplicate_challenge', { ...admin(), challenge_id: saved.challenge.id })).challenge;
  assert.match(dup.title, /copia/i);

  // Desafio em uso nao pode ser excluido.
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Sala', expected_players: 1 })).room;
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: saved.challenge.id });
  await assert.rejects(api('arena_delete_challenge', { ...admin(), challenge_id: saved.challenge.id }), (error) => error.status === 409);
  await api('arena_delete_room', { ...admin(), room_id: room.id });
  await api('arena_delete_challenge', { ...admin(), challenge_id: saved.challenge.id });
  assert.equal((await api('arena_list_challenges', admin())).challenges.length, 1);
});

test('teacher controls: publish, block entry, end round, close, archive and delete', async () => {
  const { room } = await setupRoom();
  const detail = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  assert.equal(detail.room.status, 'waiting');

  // Bloquear entrada impede novos joins.
  await api('arena_update_room', { ...admin(), room_id: room.id, entry_blocked: true });
  await assert.rejects(api('arena_join', { code: room.code, name: 'Ana' }), (error) => error.status === 409);
  await api('arena_update_room', { ...admin(), room_id: room.id, entry_blocked: false });

  // Sala em jogo nao pode ser excluida nem receber novas missoes.
  await api('arena_start_round', { ...admin(), room_id: room.id });
  await assert.rejects(api('arena_delete_room', { ...admin(), room_id: room.id }), (error) => error.status === 409);
  await assert.rejects(api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: (await api('arena_list_challenges', admin())).challenges[0].id }), (error) => error.status === 409);

  // Encerrar rodada e fechar: sala termina e pode arquivar.
  const ended = await api('arena_end_room', { ...admin(), room_id: room.id });
  assert.equal(ended.room.room.status, 'ended');
  await api('arena_archive_room', { ...admin(), room_id: room.id });
  assert.equal((await api('arena_room_detail', { ...admin(), room_id: room.id })).detail.room.status, 'archived');
  await api('arena_delete_room', { ...admin(), room_id: room.id });
  assert.equal((await api('arena_admin_status', admin())).rooms.length, 0);
});

test('deleting a room forgets its draw and its projection tokens', async () => {
  const { room } = await setupRoom({ expectedPlayers: 2 });
  await api('arena_join', { code: room.code, name: 'Ana' });
  await api('arena_join', { code: room.code, name: 'Bia' });
  await api('arena_draw_setup', { ...admin(), room_id: room.id, mode: 'mata-mata', group_size: 2 });
  assert.equal((await repositories.settings.get(`arena.draw.${room.id}`)).mode, 'mata-mata');
  const issued = await api('arena_tv_token', { ...admin(), room_id: room.id });
  assert.ok(issued.tv_code);

  await api('arena_delete_room', { ...admin(), room_id: room.id });

  // Sala excluida nao deixa estado proprio para tras: nem o sorteio, nem os
  // tokens de projecao, nem o codigo curto apontando para o vazio.
  assert.equal(await repositories.settings.get(`arena.draw.${room.id}`), undefined);
  assert.equal(await repositories.settings.get(`arena.tv.${room.id}`), undefined);
  const index = (await repositories.settings.get('arena.tv.codes')) || {};
  assert.equal(Object.values(index).some((entry) => entry?.roomId === room.id), false);
});

test('highlights and collective results derive from scored rounds', async () => {
  const { room } = await setupRoom({ expectedPlayers: 2 });
  const ana = await api('arena_join', { code: room.code, name: 'Ana' });
  const bia = await api('arena_join', { code: room.code, name: 'Bia' });
  const detail = (await api('arena_start_round', { ...admin(), room_id: room.id })).room;
  const roundId = detail.rounds[0].id;
  clock += 2;
  await api('arena_submit', {
    participant_id: ana.participant.id, token: ana.token, round_id: roundId,
    prompt: 'Crie um cartaz vibrante para a feira de tecnologia, em formato A3, para estudantes do ensino médio, com cores fortes e sem texto pequeno.',
  });
  await api('arena_submit', {
    participant_id: bia.participant.id, token: bia.token, round_id: roundId,
    prompt: 'Crie um cartaz para a feira, em formato A3, para adolescentes.',
  });
  clock = Number(detail.rounds[0].deadline_at) + 30;

  const lobby = (await api('arena_lobby', { participant_id: ana.participant.id, token: ana.token })).lobby;
  assert.ok(lobby.highlights.best_score);
  assert.equal(lobby.highlights.best_score.name, 'Ana');
  assert.ok(lobby.highlights.most_precise.name);
  assert.equal(lobby.results[0].ranking.length, 2);
});

test('highlights stay empty when every score is zero (timeout)', async () => {
  const { room } = await setupRoom({ expectedPlayers: 1 });
  const ana = await api('arena_join', { code: room.code, name: 'Ana' });
  const detail = (await api('arena_start_round', { ...admin(), room_id: room.id })).room;
  // Ninguem envia: prazo vence e a rodada fecha zerada (scoreMissingAtClose).
  clock = Number(detail.rounds[0].deadline_at) + 60;
  const lobby = (await api('arena_lobby', { participant_id: ana.participant.id, token: ana.token })).lobby;
  assert.equal(lobby.highlights.best_score, null);
  assert.equal(lobby.highlights.most_precise, null);
  assert.equal(lobby.highlights.best_context, null);
  assert.equal(lobby.highlights.most_efficient, null);
  assert.equal(lobby.results[0].ranking.length, 1);
  assert.equal(Number(lobby.results[0].ranking[0].percent), 0);
});

test('arena actions require admin auth and unknown actions are rejected', async () => {
  await assert.rejects(api('arena_create_room', { title: 'X' }), (error) => error.status === 401);
  await assert.rejects(api('arena_set_open', { open: true }), (error) => error.status === 401);
  await assert.rejects(api('arena_nao_existe'), (error) => error.status === 404);
});

test('projection TV uses a cookie session (8h) with no token in the URL', async () => {
  const { room } = await setupRoom();
  // Sem sessao: a projecao nao abre mesmo com o PIN/codigo correto.
  await assert.rejects(api('arena_tv', { pin: room.code }), (error) => error.status === 403);
  await assert.rejects(api('arena_tv', { pin: room.code, tv_token: 'invalido' }), (error) => error.status === 403);

  // O cockpit (admin) gera a sessao de 8h; a URL fica so com o PIN.
  const issued = await api('arena_tv_token', { ...admin(), room_id: room.id });
  assert.equal(issued.ok, true);
  assert.equal(issued.url.includes('tk='), false, 'URL sem token');
  assert.ok(issued.url.includes('pin='), 'URL leva o PIN');
  assert.ok(issued.tv_token, 'token da sessao so no retorno (vai para o cookie no HTTP)');
  assert.ok(issued.expires_at > clock);
  assert.match(issued.tv_code, /^\d{6}$/, 'cockpit recebe um codigo curto de 6 digitos');

  const url = new URL(issued.url, 'http://local');
  const pin = url.searchParams.get('pin');
  const tv = await api('arena_tv', { pin, tv_token: issued.tv_token }, { ip: '127.0.0.1', host: '192.168.1.5:3000' });
  assert.equal(tv.ok, true);
  assert.ok(tv.tv && tv.tv.room);
  assert.equal(String(tv.tv.room.pin || tv.tv.room.code), String(pin));
  // Lobby da TV mostra o QR de entrada dos alunos (gerado no servidor, pois a
  // TV nao tem sessao admin) apontando para a tela de entrada.
  assert.ok(tv.tv.entry_qr, 'lobby entrega o QR de entrada dos alunos');
  assert.equal(tv.tv.entry_qr.url, `http://192.168.1.5:3000/play?pin=${encodeURIComponent(pin)}`, 'QR aponta para a sala no host da projecao');
  const secureTv = await api('arena_tv', { pin, tv_token: issued.tv_token }, { host: 'arena.example', protocol: 'https' });
  assert.equal(secureTv.tv.entry_qr.url, `https://arena.example/play?pin=${encodeURIComponent(pin)}`);
  assert.match(tv.tv.entry_qr.data_url, /^data:image\/png;base64,/, 'QR em PNG base64');

  // Sessao invalida apos geracao: continua bloqueado.
  await assert.rejects(api('arena_tv', { pin, tv_token: 'outro' }), (error) => error.status === 403);
  // Sessao de outra sala nao projeta nesta sala.
  const other = await api('arena_tv_token', { ...admin(), room_id: (await setupRoom()).room.id });
  await assert.rejects(api('arena_tv', { pin, tv_token: other.tv_token }), (error) => error.status === 403);
  // Emissao sem ser admin e bloqueada.
  await assert.rejects(api('arena_tv_token', { room_id: room.id }), (error) => error.status === 401);
});

test('short projection code unlocks the TV on another device (no token in URL)', async () => {
  const { room } = await setupRoom();
  const issued = await api('arena_tv_token', { ...admin(), room_id: room.id });
  const code = issued.tv_code;

  // Codigo malformado / inexistente e rejeitado.
  await assert.rejects(api('arena_tv_code', { code: '12' }), (error) => error.status === 422);
  await assert.rejects(api('arena_tv_code', { code: '999999' }), (error) => error.status === 403);

  // O codigo valido vira uma sessao de projecao (token no retorno -> cookie).
  const unlocked = await api('arena_tv_code', { code }, { ip: '127.0.0.1', host: '192.168.1.5:3000' });
  assert.equal(unlocked.ok, true);
  assert.equal(unlocked.pin, room.pin || room.code);
  assert.ok(unlocked.tv && unlocked.tv.room);
  assert.ok(unlocked.tv_token, 'sessao nova para a TV');
  assert.ok(unlocked.expires_at > clock);
  assert.equal(unlocked.tv.entry_qr.url, `http://192.168.1.5:3000/play?pin=${encodeURIComponent(room.pin || room.code)}`, 'TV aberta por codigo curto tambem mostra o QR da sala');

  // A TV projeta com a sessao recebida (e o popup do cockpit segue valido).
  const projected = await api('arena_tv', { pin: unlocked.pin, tv_token: unlocked.tv_token });
  assert.equal(projected.ok, true);
  const stillOpen = await api('arena_tv', { pin: room.pin || room.code, tv_token: issued.tv_token });
  assert.equal(stillOpen.ok, true, 'codigo nao invalida a sessao do popup');

  // O codigo e idempotente: reutilizado sem gerar sala nova — e continua
  // redimivel apos o re-emissao (regressao: o get-or-create apagava/corrompia
  // a propria entrada, fazendo a troca por sessao falhar com 403/404).
  const again = await api('arena_tv_token', { ...admin(), room_id: room.id });
  assert.equal(again.tv_code, code, 'mesmo codigo enquanto valido (8h)');
  const redeemedAgain = await api('arena_tv_code', { code });
  assert.equal(redeemedAgain.ok, true, 'codigo continua valido apos re-emissao');
  assert.equal(redeemedAgain.pin, room.pin || room.code);

  // Codigo de outra sala projeta a outra sala, nao esta.
  const other = await setupRoom();
  const otherIssued = await api('arena_tv_token', { ...admin(), room_id: other.room.id });
  assert.notEqual(otherIssued.tv_code, code, 'codigos distintos entre salas');
  const otherUnlocked = await api('arena_tv_code', { code: otherIssued.tv_code });
  assert.equal(otherUnlocked.pin, other.room.pin || other.room.code);
});

test('arena_qr generates QR data URLs for the cockpit (entry + projection)', async () => {
  // So o admin gera QR.
  await assert.rejects(api('arena_qr', { path: '/play' }), (error) => error.status === 401);
  // Caminho invalido.
  await assert.rejects(api('arena_qr', { ...admin(), path: 'play' }), (error) => error.status === 422);
  await assert.rejects(api('arena_qr', { ...admin(), path: '/x\nY' }), (error) => error.status === 422);

  // Entrada dos alunos: QR do /play com a URL absoluta do origin informado.
  const entry = await api('arena_qr', { ...admin(), path: '/play', origin: 'http://192.168.1.5:3000' });
  assert.equal(entry.ok, true);
  assert.equal(entry.url, 'http://192.168.1.5:3000/play');
  assert.match(entry.data_url, /^data:image\/png;base64,/, 'QR em PNG base64');

  // Projecao: o QR carrega o codigo curto — escanear projeta sem digitar nada.
  const { room } = await setupRoom();
  const issued = await api('arena_tv_token', { ...admin(), room_id: room.id });
  const qr = await api('arena_qr', {
    ...admin(),
    path: `/tv.php?code=${issued.tv_code}`,
    origin: 'http://192.168.1.5:3000',
  });
  assert.equal(qr.ok, true);
  const parsed = new URL(qr.url);
  assert.equal(parsed.pathname, '/tv.php');
  assert.equal(parsed.searchParams.get('code'), issued.tv_code, 'codigo de projecao embutido no QR');
  assert.match(qr.data_url, /^data:image\/png;base64,/);

  // Origin loopback: a URL final sai com IP da rede (ou mantem localhost se a
  // deteccao falhar — nunca sai vazia e sempre aponta para o caminho pedido).
  const loopback = await api('arena_qr', { ...admin(), path: '/play', origin: 'http://localhost:3000' });
  assert.equal(new URL(loopback.url).pathname, '/play');
  assert.match(new URL(loopback.url).host, /:3000$/, 'porta preservada');
  assert.notEqual(loopback.url, '', 'URL gerada');
});

test('short projection code is throttled per origin after repeated failures', async () => {
  const { room } = await setupRoom();
  await api('arena_tv_token', { ...admin(), room_id: room.id });
  // 8 falhas consecutivas disparam a trava por IP (como o login do painel).
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await assert.rejects(api('arena_tv_code', { code: '000000' }), (error) => error.status === 403);
  }
  await assert.rejects(api('arena_tv_code', { code: '111111' }), (error) => error.status === 429);
});

test('classic room seed reuses canonical challenges instead of duplicating the bank', async () => {
  const classic = (title) => api('arena_create_room', {
    ...admin(), title, preset: 'classic', expected_players: 3,
  });
  const countClassic = async () => (await api('arena_list_challenges', { ...admin() })).challenges
    .filter((c) => c.title.startsWith('Batalha Clássica')).length;
  const first = await classic('Classe A dedupe');
  assert.equal(await countClassic(), 3, 'primeira sala semeia os 3 classicos canonicos');
  const second = await classic('Classe B dedupe');
  assert.equal(await countClassic(), 3, 'segunda sala reusa os canonicos, sem duplicar');
  // Cada sala tem suas 3 rodadas apontando para os canonicos.
  const roundsA = (await api('arena_room_detail', { ...admin(), room_id: first.room.id })).detail.rounds;
  const roundsB = (await api('arena_room_detail', { ...admin(), room_id: second.room.id })).detail.rounds;
  assert.equal(roundsA.length, 3);
  assert.equal(roundsB.length, 3);
  // Limpeza: exclui as duas salas de teste.
  await api('arena_delete_room', { ...admin(), room_id: first.room.id });
  await api('arena_delete_room', { ...admin(), room_id: second.room.id });
});

test('arena_add_lesson reuses canonical curriculum challenges instead of duplicating the bank', async () => {
  const countByTitle = async (title) => (await api('arena_list_challenges', { ...admin() })).challenges
    .filter((challenge) => challenge.title === title).length;
  // Modo banco: adiciona a aula duas vezes; o banco nao pode crescer.
  const first = await api('arena_add_lesson', { ...admin(), lesson_id: 'aula2-fundacao' });
  const before = await countByTitle(first.created[0].title);
  const second = await api('arena_add_lesson', { ...admin(), lesson_id: 'aula2-fundacao' });
  const after = await countByTitle(second.created[0].title);
  assert.equal(after, before, 'segunda adicao reusa os canonicos, sem duplicar');
  assert.equal(second.created.length, 4, 'created continua retornando os 4 desafios da aula');
});

test('sala nao abre com missao sem gabarito ou missao visual sem imagem, e diz o que falta', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Gate', expected_players: 5 })).room;
  const semGabarito = (await api('arena_save_challenge', {
    ...admin(), title: 'Sem gabarito', modality: 'precisao', mission: 'Crie um cartaz para a feira.',
    criteria: CRITERIA,
  })).challenge;
  const semImagem = (await api('arena_save_challenge', {
    ...admin(), title: 'Reversa sem imagem', modality: 'reversa', mission: 'Escreva o prompt que gerou a imagem.',
    criteria: CRITERIA, category: 'Imagem',
    reference_text: 'Cartaz vertical de festival de musica, tipografia grande e paleta neon.',
  })).challenge;
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: semGabarito.id });
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: semImagem.id });

  const detail = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  assert.equal(detail.ready, false);
  // Cada pendencia diz qual desafio corrigir: e por esse id que o painel
  // abre o desafio em edicao, no campo que falta, a partir do card da missao.
  assert.deepEqual(detail.blockers, [
    { position: 1, title: 'Sem gabarito', missing: ['gabarito'], challenge_id: semGabarito.id },
    { position: 2, title: 'Reversa sem imagem', missing: ['imagem'], challenge_id: semImagem.id },
  ]);
  assert.deepEqual(detail.blockers.map((entry) => entry.challenge_id), [semGabarito.id, semImagem.id]);
  assert.deepEqual(detail.rounds.map((round) => round.missing), [['gabarito'], ['imagem']]);
  // O gabarito que a missao visual ja tem continua visivel no detalhe.
  assert.equal(detail.rounds[1].reference_text.includes('Cartaz vertical'), true);

  await assert.rejects(api('arena_publish_room', { ...admin(), room_id: room.id }), (error) => {
    assert.equal(error.status, 409);
    assert.deepEqual(error.details.blockers, detail.blockers);
    assert.match(error.message, /Missão 1 — Sem gabarito: sem gabarito/);
    assert.match(error.message, /Missão 2 — Reversa sem imagem: sem imagem/);
    return true;
  });

  // Nada abriu: a sala segue em rascunho e a lista de salas avisa o professor.
  const listed = (await api('arena_admin_status', { ...admin() })).rooms.find((entry) => entry.id === room.id);
  assert.equal(listed.status, 'draft');
  assert.equal(listed.blockers.length, 2);

  // Corrigindo os dois pontos, a sala abre.
  await api('arena_save_challenge', {
    ...admin(), challenge_id: semGabarito.id, title: 'Sem gabarito', modality: 'precisao',
    mission: 'Crie um cartaz para a feira.', criteria: CRITERIA,
    reference_text: 'Cartaz A3 da feira, com data, local e contato.',
  });
  await api('arena_save_challenge', {
    ...admin(), challenge_id: semImagem.id, title: 'Reversa sem imagem', modality: 'reversa',
    mission: 'Escreva o prompt que gerou a imagem.', criteria: CRITERIA, category: 'Imagem',
    reference_text: 'Cartaz vertical de festival de musica, tipografia grande e paleta neon.',
    reference_image: 'data:image/png;base64,AAAA',
  });
  const published = await api('arena_publish_room', { ...admin(), room_id: room.id });
  assert.equal(published.room.room.status, 'waiting');
  assert.deepEqual(published.room.blockers, []);
  assert.equal(published.room.ready, true);
});

test('lote da tela unica salva tudo numa chamada ou nao salva nada', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Lote', preset: 'personalizado', expected_players: 5 })).room;
  const criar = async (title, mission) => (await api('arena_save_challenge', {
    ...admin(), title, modality: 'precisao', mission, criteria: CRITERIA, category: 'Texto',
  })).challenge;
  const primeiro = await criar('Lote 1', 'Escreva o prompt do cartaz da feira.');
  const segundo = await criar('Lote 2', 'Escreva o prompt do banner do evento.');
  for (const challenge of [primeiro, segundo]) {
    await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  }

  // Uma chamada so: os dois gabaritos entram juntos e a sala destrava.
  const lote = await api('arena_save_challenges', {
    ...admin(),
    challenges: [
      { challenge_id: primeiro.id, title: 'Lote 1', modality: 'precisao', mission: 'Escreva o prompt do cartaz da feira.', category: 'Texto', criteria: CRITERIA, reference_text: 'Cartaz A3 da feira, com data, local e contato.' },
      { challenge_id: segundo.id, title: 'Lote 2', modality: 'precisao', mission: 'Escreva o prompt do banner do evento.', category: 'Texto', criteria: CRITERIA, reference_text: 'Banner 2x1 do evento, com logo, data e horario.' },
    ],
  });
  assert.equal(lote.count, 2);
  const detail = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  assert.equal(detail.ready, true);
  assert.deepEqual(detail.rounds.map((round) => round.gabarito_text),
    ['Cartaz A3 da feira, com data, local e contato.', 'Banner 2x1 do evento, com logo, data e horario.']);

  // Um item invalido derruba o lote inteiro: o item valido nao pode entrar.
  await assert.rejects(api('arena_save_challenges', {
    ...admin(),
    challenges: [
      { challenge_id: primeiro.id, title: 'Lote 1', modality: 'precisao', mission: 'Escreva o prompt do cartaz da feira.', category: 'Texto', criteria: CRITERIA, reference_text: 'ESSE TEXTO NAO PODE ENTRAR' },
      { challenge_id: segundo.id, title: 'Lote 2', modality: 'modalidade-inexistente', mission: 'Escreva o prompt do banner.', criteria: CRITERIA },
    ],
  }), (error) => {
    assert.equal(error.status, 422);
    assert.match(error.message, /nada foi salvo/);
    assert.ok(Object.keys(error.details).some((key) => key.startsWith('challenges.1')), JSON.stringify(error.details));
    return true;
  });
  const depois = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  assert.deepEqual(depois.rounds.map((round) => round.gabarito_text),
    ['Cartaz A3 da feira, com data, local e contato.', 'Banner 2x1 do evento, com logo, data e horario.']);
  assert.equal((await repositories.arena.challenges.getById(primeiro.id)).referenceText, 'Cartaz A3 da feira, com data, local e contato.');

  // Lote vazio e lote grande demais tambem sao recusados sem gravar.
  await assert.rejects(api('arena_save_challenges', { ...admin(), challenges: [] }), (error) => error.status === 422);
});

test('o gabarito do juiz nunca chega na tela do aluno, mas o professor continua vendo', async () => {
  const { room, challenge } = await setupRoom();
  const GABARITO = challenge.referenceText;
  const ana = await api('arena_join', { code: room.code, name: 'Ana' });
  await api('arena_start_round', { ...admin(), room_id: room.id });

  // O que o aluno recebe: a missao montada para jogar, sem o campo do gabarito
  // e sem o texto em lugar nenhum do payload (era a resposta impressa na tela).
  const lobby = (await api('arena_lobby', { participant_id: ana.participant.id, token: ana.token })).lobby;
  assert.equal(lobby.current_round.modality, 'precisao');
  assert.equal('reference_text' in lobby.current_round, false);
  assert.equal(JSON.stringify(lobby).includes(GABARITO), false, 'gabarito vazou para o aluno');

  // O professor audita no detalhe da sala e na previa — e so para ele.
  const detail = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  assert.equal(detail.rounds[0].reference_text, GABARITO);
  const preview = await api('arena_room_preview', { ...admin(), room_id: room.id });
  assert.equal(preview.missions[0].judge_reference, GABARITO);
  assert.equal('reference_text' in preview.missions[0], false);
});

test('previa das telas de fim: exemplo marcado no rascunho, dados reais depois de jogar', async () => {
  const { room } = await setupRoom();
  const rounds = await repositories.arena.rounds.listByRoom(room.id);

  // Sala sem resposta nenhuma: as telas de fim existem como amostra, e a amostra
  // se identifica como amostra (nada de placar inventado passando por real).
  const rascunho = await api('arena_room_preview', { ...admin(), room_id: room.id });
  assert.equal(rascunho.end.sample, true);
  assert.equal(rascunho.end.player, '');
  assert.equal(rascunho.missions[0].result_sample, true);
  assert.equal(rascunho.missions[0].preview_scores.length, 1);
  assert.ok(rascunho.missions[0].preview_scores[0].percent > 0);
  assert.ok(rascunho.missions[0].preview_scores[0].breakdown.objetivo > 0);
  assert.match(rascunho.missions[0].preview_scores[0].feedback, /^Exemplo/);
  assert.equal(rascunho.end.results.length, 1);
  assert.equal(rascunho.end.ranking.length, 4);
  assert.equal(rascunho.end.highlights.best_score.name, 'Ana');
  // Revisar o fim da sala não mexe na sala.
  assert.equal((await repositories.arena.rooms.getById(room.id)).status, 'waiting');
  assert.equal((await repositories.arena.submissions.listByRound(rounds[0].id)).length, 0);

  // Com uma resposta de verdade, as telas de fim passam a vir dela.
  const ana = await api('arena_join', { code: room.code, name: 'Ana' });
  await api('arena_start_round', { ...admin(), room_id: room.id });
  const [round] = await repositories.arena.rounds.listByRoom(room.id);
  await api('arena_submit', {
    participant_id: ana.participant.id, token: ana.token, round_id: round.id,
    prompt: 'Cartaz A3 da feira de tecnologia, com data, local, lista de stands e contato, linguagem jovem.',
  });
  const jogada = await api('arena_room_preview', { ...admin(), room_id: room.id });
  assert.equal(jogada.end.sample, false);
  assert.equal(jogada.end.player, 'Ana');
  assert.equal(jogada.missions[0].result_sample, false);
  assert.equal(jogada.missions[0].preview_scores.length, 1);
  assert.ok(jogada.missions[0].preview_scores[0].percent > 0);
  assert.equal(jogada.end.ranking.some((row) => row.name === 'Ana' && Number(row.points_sum) > 0), true);
  // A rodada ainda está aberta: o resultado por missão só existe depois de fechar
  // a rodada, e a prévia mostra exatamente isso (lista vazia), não uma invenção.
  assert.deepEqual(jogada.end.results, []);
});

test('tempo da sala: somatorio no detalhe e cronometro missao por missao na previa', async () => {
  // setupRoom cria a primeira missao com 120s.
  const { room } = await setupRoom();
  const semTempo = (await api('arena_save_challenge', {
    ...admin(), title: 'Sem cronometro', modality: 'precisao', mission: 'Escreva o prompt do banner do evento.',
    criteria: CRITERIA, reference_text: 'Banner 2x1 do evento, com logo, data e horario.',
  })).challenge;
  const curta = (await api('arena_save_challenge', {
    ...admin(), title: 'Curta', modality: 'precisao', mission: 'Escreva o prompt do story do evento.',
    criteria: CRITERIA, duration_seconds: 90, reference_text: 'Story 9:16 do evento, com logo e data.',
  })).challenge;
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: semTempo.id });
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: curta.id });

  // O detalhe responde a pergunta do professor: quanto tempo de aula isso da, e
  // quantas missoes ficam sem cronometro (essas so acabam quando ele encerra).
  const detail = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  assert.deepEqual(detail.timing, { missions: 3, timed: 2, untimed: 1, total_seconds: 210 });
  assert.deepEqual(detail.rounds.map((round) => round.duration_seconds), [120, null, 90]);

  // A previa mostra o mesmo total e o tempo de cada missao, na ordem da tela.
  const preview = await api('arena_room_preview', { ...admin(), room_id: room.id });
  assert.deepEqual(preview.timing, { missions: 3, timed: 2, untimed: 1, total_seconds: 210 });
  assert.deepEqual(preview.missions.map((mission) => mission.duration_seconds), [120, null, 90]);
});

test('tempo sugerido por modalidade e tamanho, aceito com arena_set_round_times', async () => {
  const { room } = await setupRoom();
  const semTempo = (await api('arena_save_challenge', {
    ...admin(), title: 'Reversa sem cronometro', modality: 'reversa', category: 'Imagem',
    mission: 'Escreva o prompt da imagem.', criteria: CRITERIA,
    reference_image: 'https://exemplo.test/imagem.png',
    reference_text: 'Cartaz vertical de festival, tipografia grande e paleta neon.',
  })).challenge;
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: semTempo.id });

  const detail = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  const [comTempo, semCronometro] = detail.rounds;
  // A sugestao vem da modalidade (precisao 120 s, reversa 180 s) ajustada pelo
  // tamanho do que o aluno le (a reversa de uma linha perde 15 s).
  assert.equal(comTempo.duration_seconds, 120);
  assert.equal(comTempo.suggested_seconds, 120);
  assert.equal(comTempo.suggested_reason, 'missão no tamanho típico');
  assert.equal(semCronometro.duration_seconds, null);
  assert.equal(semCronometro.suggested_seconds, 165);
  assert.match(semCronometro.suggested_reason, /^missão curta \(\d+ palavras\)$/);
  assert.equal(semCronometro.other_rooms, 0);

  // O mesmo desafio em outra sala: o detalhe avisa que o tempo vale la tambem.
  const outra = (await api('arena_create_room', { ...admin(), title: 'Outra turma', preset: 'personalizado', expected_players: 3 })).room;
  await api('arena_add_round', { ...admin(), room_id: outra.id, challenge_id: semTempo.id });
  const comOutraSala = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  assert.equal(comOutraSala.rounds[1].other_rooms, 1);

  // Aceitar a sugestao muda SO a duracao: texto, imagem, criterios e tentativas ficam iguais.
  const antes = await repositories.arena.challenges.getById(semTempo.id);
  const aceito = await api('arena_set_round_times', {
    ...admin(), room_id: room.id,
    times: [{ challenge_id: semTempo.id, duration_seconds: semCronometro.suggested_seconds }],
  });
  assert.equal(aceito.count, 1);
  assert.deepEqual(aceito.timing, { missions: 2, timed: 2, untimed: 0, total_seconds: 285 });
  const depois = await repositories.arena.challenges.getById(semTempo.id);
  assert.equal(depois.durationSeconds, 165);
  for (const key of ['title', 'mission', 'referenceText', 'referenceImage', 'category', 'attempts', 'speedWeight']) {
    assert.deepEqual(depois[key], antes[key], key);
  }
  assert.deepEqual(depois.criteria, antes.criteria);
  assert.equal(depois.judgeKind, antes.judgeKind);

  // Tirar o cronometro tambem e um ajuste valido (volta a terminar no encerrar).
  await api('arena_set_round_times', { ...admin(), room_id: room.id, times: [{ challenge_id: semTempo.id, duration_seconds: null }] });
  assert.equal((await repositories.arena.challenges.getById(semTempo.id)).durationSeconds, null);
  await api('arena_set_round_times', { ...admin(), room_id: room.id, times: [{ challenge_id: semTempo.id, duration_seconds: 165 }] });

  // Um item invalido derruba o lote: o tempo valido nao pode entrar sozinho.
  await assert.rejects(api('arena_set_round_times', {
    ...admin(), room_id: room.id,
    times: [
      { challenge_id: comTempo.challenge_id, duration_seconds: 90 },
      { challenge_id: semTempo.id, duration_seconds: 5 },
    ],
  }), (error) => {
    assert.equal(error.status, 422);
    assert.match(error.message, /nada foi salvo/);
    assert.ok(Object.keys(error.details).some((key) => key.startsWith('times.1')), JSON.stringify(error.details));
    return true;
  });
  assert.equal((await repositories.arena.challenges.getById(comTempo.challenge_id)).durationSeconds, 120);

  // Desafio que nao pertence a sala e recusado antes de qualquer gravacao.
  const fora = (await api('arena_save_challenge', {
    ...admin(), title: 'De outra sala', modality: 'precisao', mission: 'Escreva o prompt do story.',
    criteria: CRITERIA, reference_text: 'Story 9:16 do evento.',
  })).challenge;
  await assert.rejects(api('arena_set_round_times', {
    ...admin(), room_id: room.id, times: [{ challenge_id: fora.id, duration_seconds: 60 }],
  }), (error) => {
    assert.equal(error.status, 422);
    assert.match(JSON.stringify(error.details), /nao pertence a sala/);
    return true;
  });
  assert.equal((await repositories.arena.challenges.getById(fora.id)).durationSeconds, null);

  // Sala em jogo: ajuste de tempo so antes de abrir.
  const ana = await api('arena_join', { code: room.code, name: 'Ana' });
  assert.ok(ana.token);
  await api('arena_start_round', { ...admin(), room_id: room.id });
  await assert.rejects(api('arena_set_round_times', {
    ...admin(), room_id: room.id, times: [{ challenge_id: comTempo.challenge_id, duration_seconds: 200 }],
  }), (error) => error.status === 409);
  assert.equal((await repositories.arena.challenges.getById(comTempo.challenge_id)).durationSeconds, 120);
});

test('previa da TV: espera, rodada, resultado e fim com campeao, sem sessao de projecao', async () => {
  const { room } = await setupRoom();
  const rounds = await repositories.arena.rounds.listByRoom(room.id);

  // Sala em rascunho: os quatro estados existem, e cada um diz se o que esta na
  // tela e exemplo (e por que) ou dado real da sala.
  const previa = await api('arena_tv_preview', { ...admin(), room_id: room.id });
  assert.equal(previa.room.title, room.title);
  assert.equal(previa.player, '');
  assert.deepEqual(Object.keys(previa.states), ['lobby', 'round', 'results', 'final']);
  for (const [nome, estado] of Object.entries(previa.states)) {
    assert.equal(estado.sample, true, nome + ' vem de amostra');
    assert.equal(typeof estado.sample_reason, 'string');
    assert.ok(estado.sample_reason.length > 0, nome + ' explica por que e exemplo');
  }
  // Espera: PIN e QR reais (e o QR que a turma vai escanear), participantes de exemplo.
  assert.equal(previa.states.lobby.tv.room.pin || previa.states.lobby.tv.room.code, room.pin || room.code);
  assert.equal(previa.states.lobby.tv.roster.length, 4);
  assert.equal(previa.states.lobby.tv.current_round, null);
  assert.match(previa.states.lobby.sample_reason, /ninguém entrou/);
  // Rodada: missao da sala na tela grande, com tempo e envios de exemplo.
  assert.equal(previa.states.round.tv.current_round.title, 'Cartaz');
  assert.equal(previa.states.round.tv.current_round.reference_image, '');
  assert.ok(previa.states.round.tv.current_round.deadline_at > previa.states.round.tv.current_round.server_now);
  // Resultado e fim: a TV escolhe o que projetar pela rodada com status 'results'.
  assert.equal(previa.states.results.tv.room.phase, 'round_results');
  assert.equal(previa.states.results.tv.results[0].status, 'results');
  assert.equal(previa.states.final.tv.room.status, 'ended');
  assert.equal(previa.states.final.tv.ranking[0].name, 'Ana');
  // A previa NAO abre sessao de projecao nem mexe na sala.
  const tokens = await repositories.settings.get(`arena.tv.${room.id}`);
  assert.equal(tokens, undefined);
  assert.equal((await repositories.arena.rooms.getById(room.id)).status, 'waiting');
  assert.equal((await repositories.arena.submissions.listByRound(rounds[0].id)).length, 0);

  // Com a partida andando, a TV mostra a rodada aberta e o fim com o placar real.
  const ana = await api('arena_join', { code: room.code, name: 'Ana' });
  await api('arena_start_round', { ...admin(), room_id: room.id });
  const [openRound] = await repositories.arena.rounds.listByRoom(room.id);
  await api('arena_submit', {
    participant_id: ana.participant.id, token: ana.token, round_id: openRound.id,
    prompt: 'Cartaz A3 da feira de tecnologia, com data, local, lista de stands e contato, linguagem jovem.',
  });
  const jogada = await api('arena_tv_preview', { ...admin(), room_id: room.id });
  assert.equal(jogada.states.round.sample, false);
  assert.equal(jogada.states.round.tv.current_round.id, openRound.id);
  assert.equal(jogada.states.final.sample, false);
  assert.equal(jogada.player, 'Ana');
  assert.ok(jogada.states.final.tv.ranking.some((row) => row.name === 'Ana'));
  // Rodada ainda aberta: o resultado projetado continua sendo exemplo, e diz por que.
  assert.equal(jogada.states.results.sample, true);
  assert.match(jogada.states.results.sample_reason, /rodada terminou/);
  // E abrir a TV de verdade exige o passo proprio (token de projecao).
  const tv = await api('arena_tv_token', { ...admin(), room_id: room.id });
  assert.equal(tv.url, `/tv.php?pin=${encodeURIComponent(room.pin || room.code)}`);
  assert.ok(tv.tv_token);
});

/** Sala publicada com `count` alunos dentro, pronta para sortear. */
async function drawRoom(count) {
  const { room, challenge } = await setupRoom({ expectedPlayers: count });
  const joined = [];
  for (let index = 0; index < count; index += 1) {
    joined.push(await api('arena_join', { code: room.code, name: `Aluno ${index + 1}` }));
  }
  return { room, challenge, joined, ids: joined.map((entry) => entry.participant.id) };
}

test('sorteio livre: o vencedor continua no balaio e ninguem sai da disputa', async () => {
  const { room, ids } = await drawRoom(6);
  // Sem configuracao nenhuma, o detalhe ja entrega um sorteio pronto para usar.
  const before = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail.draw;
  assert.equal(before.mode, 'livre');
  assert.equal(before.group_size, 3);
  assert.equal(before.counts.total, 6);
  assert.equal(before.counts.eligible, 6);
  assert.equal(before.can_draw, true);
  assert.equal(before.started, false);
  assert.deepEqual(before.current, null);
  assert.equal(before.next_size, 3, 'o botão anuncia quantos entram de fato');

  const sized = (await api('arena_draw_setup', { ...admin(), room_id: room.id, mode: 'livre', group_size: 2 })).room.draw;
  assert.equal(sized.group_size, 2);
  assert.equal(sized.counts.eligible, 6);

  const drawn = (await api('arena_draw_next', { ...admin(), room_id: room.id })).room.draw;
  assert.equal(drawn.current.ids.length, 2);
  assert.equal(new Set(drawn.current.ids).size, 2);
  assert.ok(drawn.current.ids.every((id) => ids.includes(id)));
  assert.equal(drawn.can_draw, false);
  assert.match(drawn.cannot_reason, /Escolha o vencedor/);

  // Sortear de novo troca o grupo sem registrar vencedor nenhum.
  const again = (await api('arena_draw_next', { ...admin(), room_id: room.id })).room.draw;
  assert.equal(again.history.length, 0);
  assert.equal(again.current.ids.length, 2);

  const winnerId = again.current.ids[0];
  const settled = (await api('arena_draw_settle', { ...admin(), room_id: room.id, winner_id: winnerId })).room.draw;
  assert.equal(settled.current, null);
  assert.equal(settled.history.length, 1);
  assert.equal(settled.history[0].winner_id, winnerId);
  assert.deepEqual(settled.eliminated, []);
  assert.equal(settled.counts.eligible, 6, 'no livre ninguem sai do sorteio');
  assert.equal(settled.eligible.find((entry) => entry.id === winnerId).wins, 1);
  assert.equal(settled.champion, null);
});

test('sorteio mata-mata: quem perde sai e a rodada seguinte so tem vencedores', async () => {
  const { room, ids } = await drawRoom(4);
  const setup = (await api('arena_draw_setup', { ...admin(), room_id: room.id, mode: 'mata-mata', group_size: 3 })).room.draw;
  assert.equal(setup.next_size, 2, '4 pessoas com grupos de 3 viram 2 + 2, e o botão diz 2');
  await api('arena_draw_setup', { ...admin(), room_id: room.id, mode: 'mata-mata', group_size: 2 });

  const first = (await api('arena_draw_next', { ...admin(), room_id: room.id })).room.draw;
  assert.equal(first.round, 1);
  const [winnerOne, loserOne] = first.current.ids;
  await api('arena_draw_settle', { ...admin(), room_id: room.id, winner_id: winnerOne });
  const afterFirst = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail.draw;
  assert.deepEqual(afterFirst.eliminated.map((entry) => entry.id), [loserOne]);
  assert.equal(afterFirst.counts.eligible, 2, 'os outros dois ainda não jogaram a rodada 1');

  const second = (await api('arena_draw_next', { ...admin(), room_id: room.id })).room.draw;
  const [winnerTwo] = second.current.ids;
  const afterSecond = (await api('arena_draw_settle', { ...admin(), room_id: room.id, winner_id: winnerTwo })).room.draw;
  // Rodada 1 fechada: a rodada 2 nasce so com os dois vencedores.
  assert.equal(afterSecond.round, 2);
  assert.equal(afterSecond.counts.eligible, 2);
  assert.equal(afterSecond.counts.eliminated, 2);
  assert.deepEqual(afterSecond.eligible.map((entry) => entry.id).sort(), [winnerOne, winnerTwo].sort());
  assert.equal(afterSecond.champion, null);

  // A final decide o campeao e o sorteio para de sortear.
  const final = (await api('arena_draw_next', { ...admin(), room_id: room.id })).room.draw;
  assert.equal(final.current.ids.length, 2);
  const champion = final.current.ids[0];
  const ended = (await api('arena_draw_settle', { ...admin(), room_id: room.id, winner_id: champion })).room.draw;
  assert.equal(ended.champion.id, champion);
  assert.equal(ended.can_draw, false);
  assert.match(ended.cannot_reason, /já tem campeão/);
  await assert.rejects(
    api('arena_draw_next', { ...admin(), room_id: room.id }),
    (error) => error.status === 409 && /já terminou/.test(error.message),
  );

  // Recomecar devolve todo mundo ao balaio e abre de novo.
  const fresh = (await api('arena_draw_reset', { ...admin(), room_id: room.id })).room.draw;
  assert.equal(fresh.mode, 'mata-mata');
  assert.equal(fresh.round, 1);
  assert.deepEqual(fresh.history, []);
  assert.deepEqual(fresh.eliminated, []);
  assert.equal(fresh.champion, null);
  assert.equal(fresh.counts.eligible, 4);
  assert.deepEqual(fresh.eligible.map((entry) => entry.id).sort(), [...ids].sort());
});

test('sorteio: trocar de modelo com sorteio em andamento recomeca, e ajustar o tamanho nao', async () => {
  const { room } = await drawRoom(4);
  await api('arena_draw_setup', { ...admin(), room_id: room.id, mode: 'livre', group_size: 2 });
  await api('arena_draw_next', { ...admin(), room_id: room.id });
  const winnerId = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail.draw.current.ids[0];
  await api('arena_draw_settle', { ...admin(), room_id: room.id, winner_id: winnerId });

  // Só o tamanho muda quando o modelo é o mesmo: o histórico fica.
  const resized = (await api('arena_draw_setup', { ...admin(), room_id: room.id, mode: 'livre', group_size: 4 })).room.draw;
  assert.equal(resized.group_size, 4);
  assert.equal(resized.history.length, 1);

  // Trocar de modelo não converte um sorteio no outro: recomeça.
  const other = (await api('arena_draw_setup', { ...admin(), room_id: room.id, mode: 'mata-mata', group_size: 4 })).room.draw;
  assert.equal(other.mode, 'mata-mata');
  assert.deepEqual(other.history, []);
  assert.equal(other.started, false);
});

test('sorteio: recusa vencedor de fora do grupo, sala sem gente e quem nao e admin', async () => {
  await api('arena_set_open', { ...admin(), open: true });
  const empty = (await api('arena_create_room', { ...admin(), title: 'Vazia', expected_players: 5 })).room;
  await assert.rejects(
    api('arena_draw_next', { ...admin(), room_id: empty.id }),
    (error) => error.status === 409 && /pelo menos 2/.test(error.message),
  );
  await assert.rejects(api('arena_draw_setup', { room_id: empty.id, mode: 'livre', group_size: 3 }), (error) => error.status === 401);
  await assert.rejects(
    api('arena_draw_setup', { ...admin(), room_id: empty.id, mode: 'sorte', group_size: 3 }),
    (error) => error.status === 422,
  );
  await assert.rejects(
    api('arena_draw_setup', { ...admin(), room_id: empty.id, mode: 'livre', group_size: 1 }),
    (error) => error.status === 422,
  );
  await assert.rejects(
    api('arena_draw_settle', { ...admin(), room_id: empty.id, winner_id: 'quem' }),
    (error) => error.status === 409 && /Nenhum grupo/.test(error.message),
  );

  const { room, ids } = await drawRoom(3);
  await api('arena_draw_setup', { ...admin(), room_id: room.id, mode: 'livre', group_size: 2 });
  const drawn = (await api('arena_draw_next', { ...admin(), room_id: room.id })).room.draw;
  const outside = ids.find((id) => !drawn.current.ids.includes(id));
  await assert.rejects(
    api('arena_draw_settle', { ...admin(), room_id: room.id, winner_id: outside }),
    (error) => error.status === 409 && /um dos sorteados/.test(error.message),
  );
  // E o grupo da vez continua aberto depois da recusa.
  assert.deepEqual((await api('arena_room_detail', { ...admin(), room_id: room.id })).detail.draw.current.ids, drawn.current.ids);
});

test('sorteio nao mexe em missao, nota, status nem em quem sai da sala', async () => {
  const { room, ids } = await drawRoom(3);
  await api('arena_draw_setup', { ...admin(), room_id: room.id, mode: 'mata-mata', group_size: 2 });
  const drawn = (await api('arena_draw_next', { ...admin(), room_id: room.id })).room.draw;
  const before = await repositories.arena.rooms.getById(room.id);
  const roundsBefore = await repositories.arena.rounds.listByRoom(room.id);

  await api('arena_draw_settle', { ...admin(), room_id: room.id, winner_id: drawn.current.ids[0] });
  const after = await repositories.arena.rooms.getById(room.id);
  assert.equal(after.status, before.status);
  assert.deepEqual(await repositories.arena.rounds.listByRoom(room.id), roundsBefore);
  assert.equal((await repositories.arena.submissions.listByRound(roundsBefore[0].id)).length, 0);

  // Quem o professor remove da sala sai do balaio (e o sorteio continua de pe).
  await api('arena_remove_participant', { ...admin(), room_id: room.id, participant_id: ids[2] });
  const detail = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  assert.ok(!detail.draw.eligible.some((entry) => entry.id === ids[2]));
  assert.equal(detail.draw.counts.total, 2);
});

test('a TV projeta o sorteio da vez (grupo em campo e chaveamento) sem expor nada privado', async () => {
  const { room } = await drawRoom(4);
  await api('arena_draw_setup', { ...admin(), room_id: room.id, mode: 'mata-mata', group_size: 2 });

  // Sem sorteio começado, a projeção da espera não inventa bloco.
  const vazia = await api('arena_tv_preview', { ...admin(), room_id: room.id });
  assert.equal(vazia.states.lobby.tv.draw.started, false);
  assert.equal(vazia.states.lobby.tv.draw.current, null);
  assert.equal(vazia.states.lobby.tv.draw.champion, null);

  const sorteado = (await api('arena_draw_next', { ...admin(), room_id: room.id })).room.draw;
  const previa = await api('arena_tv_preview', { ...admin(), room_id: room.id });
  const naTv = previa.states.lobby.tv.draw;
  assert.equal(naTv.mode, 'mata-mata');
  assert.deepEqual(naTv.current.ids, sorteado.current.ids);
  assert.deepEqual(naTv.current.names, sorteado.current.names);
  assert.equal(naTv.counts.eligible, 2, 'o balaio da rodada perde quem está jogando agora');
  assert.equal(naTv.counts.in_game, 4, 'mas ninguém saiu do torneio antes de perder');
  assert.equal(naTv.counts.eliminated, 0);
  // A rodada aberta também sabe quem está em campo (a TV mostra a linha).
  assert.deepEqual(previa.states.round.tv.draw.current.ids, sorteado.current.ids);

  // A projeção leva só nome, id e contagens — nada da ficha do participante.
  const bruto = JSON.stringify(naTv);
  for (const campo of ['email', 'token', 'role', 'company', 'last_seen_at', 'joined_at']) {
    assert.ok(!bruto.includes(campo), `a TV não projeta ${campo}`);
  }
  assert.deepEqual(Object.keys(naTv.eligible[0]).sort(), ['id', 'name', 'plays', 'wins']);

  // Cada disputa decide: quem perde sai do chaveamento projetado.
  await api('arena_draw_settle', { ...admin(), room_id: room.id, winner_id: sorteado.current.ids[0] });
  const depois = await api('arena_tv_preview', { ...admin(), room_id: room.id });
  const bracket = depois.states.lobby.tv.draw;
  assert.equal(bracket.counts.eliminated, 1);
  assert.equal(bracket.counts.in_game, 3);
  assert.equal(bracket.counts.eligible, 2, 'os dois que ainda não entraram em campo');
  assert.ok(bracket.eligible.every((entry) => bracket.in_game.some((game) => game.id === entry.id)));
  assert.equal(bracket.history.at(-1).winner_id, sorteado.current.ids[0]);
  assert.equal(bracket.current, null, 'sem grupo aberto, a projeção mostra a última disputa');

  // A TV de verdade (com a sessão de projeção) recebe o mesmo sorteio.
  const token = await api('arena_tv_token', { ...admin(), room_id: room.id });
  const real = await api('arena_tv', { pin: room.pin || room.code, tv_token: token.tv_token });
  assert.deepEqual(
    real.tv.draw.eligible.map((entry) => entry.id).sort(),
    bracket.eligible.map((entry) => entry.id).sort(),
  );
  assert.equal(real.tv.draw.champion, null);

  // Encerrar o sorteio (campeão) também chega à parede.
  await api('arena_draw_reset', { ...admin(), room_id: room.id });
  const limpo = await api('arena_tv', { pin: room.pin || room.code, tv_token: token.tv_token });
  assert.equal(limpo.tv.draw.started, false);
  assert.equal(limpo.tv.draw.history.length, 0);
});
