import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createJudgeBudget } from '../../src/judge/budget.mjs';
import { createAdminAuth } from '../../src/server/admin-auth.mjs';
import { createArenaApi } from '../../src/server/arena-api.mjs';
import { createApiHttpHandler } from '../../src/server/http.mjs';
import { ApiError } from '../../src/server/validation.mjs';

// O defeito medido na auditoria: a avaliacao externa pode levar 12 s (mais uma
// repeticao) e o cliente desiste em 12 s — o aluno lia falha de rede enquanto o
// servidor CONTINUAVA avaliando, e o resultado so aparecia se ele repetisse o
// envio. Do outro lado, trinta e cinco envios simultaneos nao tinham teto
// nenhum de concorrencia ou cota.
//
// Estes casos prendem o contrato novo:
//   - o envio responde "pendente" dentro do prazo, com id e tentativa;
//   - a nota chega pela consulta de estado (o lobby que a tela ja faz);
//   - repetir o envio NAO dispara uma segunda avaliacao externa;
//   - a recusa do teto e recuperavel (503 + retry-after) e a tentativa fica;
//   - em nenhum caminho existe nota duplicada.
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CRITERIA = [{ criterion: 'objetivo', weight: 60 }, { criterion: 'contexto', weight: 40 }];
const REFERENCE = 'Cartaz A3 da feira de tecnologia, com data, local, lista de stands e contato.';

let opened, repositories, arenaDispatch, clock, sequence, adminToken, adminAuth;

function montar(judge, { submitWaitMs = 60 } = {}) {
  arenaDispatch = createArenaApi({
    repositories,
    judge,
    now: () => clock,
    id: () => `id-${++sequence}`,
    adminAuth,
    submitWaitMs,
  });
}

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 2_000_000;
  sequence = 0;
  adminAuth = createAdminAuth({
    password: 'senha-segura-123', secret: 'segredo-muito-longo-para-teste-123456', now: () => clock,
  });
  adminToken = adminAuth.login('senha-segura-123').token;
});
afterEach(() => opened.close());

const admin = () => ({ admin_token: adminToken });
const api = (action, payload = {}, meta = {}) => arenaDispatch(action, payload, meta);

const notaLocal = (percent = 77) => async () => ({
  percent,
  breakdown: { objetivo: 12, contexto: 8 },
  feedback: 'Feedback de teste.',
  metadata: { provider: 'local', model: 'teste-local-v1', fallback_used: true },
});

/** Sala simples (preset personalizado) com uma missão aberta e um aluno dentro. */
async function salaComMissao({ nome = 'Ana' } = {}) {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Turma do SLA', expected_players: 10 })).room;
  const challenge = (await api('arena_save_challenge', {
    ...admin(), title: 'Cartaz', modality: 'precisao', mission: 'Crie um cartaz para a feira.',
    criteria: CRITERIA, duration_seconds: 300, speed_weight: 'none', reference_text: REFERENCE,
  })).challenge;
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  await api('arena_publish_room', { ...admin(), room_id: room.id });
  await api('arena_start_round', { ...admin(), room_id: room.id });
  const aluno = await api('arena_join', { code: room.pin || room.code, name: nome });
  const detalhe = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  const roundId = detalhe.rounds.find((round) => round.status === 'open').id;
  return {
    roomId: room.id,
    roundId,
    envio: {
      participant_id: aluno.participant.id,
      token: aluno.token,
      round_id: roundId,
      prompt: 'Crie um cartaz A3 com data, local e contato para a feira.',
      attempt: 1,
    },
    sessao: { participant_id: aluno.participant.id, token: aluno.token },
  };
}

test('o envio responde "pendente" dentro do prazo, e a nota chega pela consulta de estado', async () => {
  let chamadas = 0;
  montar(async () => { chamadas += 1; await dormir(250); return (await notaLocal()()); });
  const { envio, sessao } = await salaComMissao();

  const inicio = Date.now();
  const resposta = await api('arena_submit', envio);
  const gasto = Date.now() - inicio;

  assert.equal(resposta.ok, true);
  assert.equal(resposta.pending, true, 'o servidor diz que aceitou e continua avaliando');
  assert.equal(resposta.attempt, 1);
  assert.ok(resposta.submission_id, 'devolve o id da submissao (a consulta de estado tem o que procurar)');
  assert.equal(resposta.percent, undefined, 'nao inventa nota na resposta pendente');
  assert.ok(gasto < 200, `respondeu no prazo do servidor (gasto: ${gasto}ms, avaliacao: 250ms)`);

  // Estado enquanto a avaliacao corre: recebida, sem nota.
  const durante = await api('arena_lobby', sessao);
  assert.equal(durante.lobby.current_round.my_scores.length, 0);
  assert.equal(durante.lobby.current_round.my_submissions[0].status, 'received');

  await dormir(300);
  const depois = await api('arena_lobby', sessao);
  assert.equal(depois.lobby.current_round.my_scores.length, 1, 'a nota apareceu pela consulta de estado');
  assert.equal(depois.lobby.current_round.my_submissions[0].status, 'scored');
  assert.equal(Number(depois.lobby.current_round.my_scores[0].percent), 77);
  assert.equal(chamadas, 1);
});

test('repetir o envio enquanto a avaliação corre não dispara uma segunda avaliação', async () => {
  let chamadas = 0;
  montar(async () => { chamadas += 1; await dormir(250); return (await notaLocal(88)()); });
  const { envio, sessao, roundId } = await salaComMissao();

  const primeiro = await api('arena_submit', envio);
  assert.equal(primeiro.pending, true);
  // O mesmo envio, do jeito que o aluno repetiria ("tente de novo" / clique duplo).
  const segundo = await api('arena_submit', envio);
  assert.equal(segundo.pending, true);
  assert.equal(segundo.submission_id, primeiro.submission_id, 'e a MESMA submissao');

  await dormir(320);
  assert.equal(chamadas, 1, 'uma avaliacao externa para os dois envios');

  const scores = await repositories.arena.scores.listByRound(roundId);
  assert.equal(scores.length, 1, 'uma nota por submissao');
  const lobby = await api('arena_lobby', sessao);
  assert.equal(Number(lobby.lobby.current_round.my_scores[0].percent), 88);
});

test('a recusa do teto é recuperável, e repetir depois conclui a MESMA avaliação', async () => {
  const budget = createJudgeBudget({ maxConcurrent: 1, perHour: 5, maxQueued: 0 });
  const criterios = notaLocal(66);
  montar((input) => budget.run(() => criterios(input)));

  let liberar;
  const ocupando = budget.run(() => new Promise((resolve) => { liberar = resolve; }));
  await dormir(5);

  const { envio, sessao, roundId } = await salaComMissao();

  await assert.rejects(api('arena_submit', envio), (error) => {
    assert.equal(error.status, 503, 'recusa recuperavel, nao 502 de provedor quebrado');
    assert.match(error.message, /fila de avaliacoes esta cheia/i);
    assert.ok(Number(error.details?.retry_after) >= 1, 'diz quanto esperar');
    return true;
  });

  // A resposta NAO se perdeu: ela existe, sem nota, e a mensagem ao aluno diz
  // que repetir continua a mesma avaliacao.
  const detalhe = (await repositories.arena.submissions.listByRound(roundId))[0];
  assert.ok(detalhe, 'a submissao foi criada antes da recusa');
  assert.equal((await api('arena_lobby', sessao)).lobby.current_round.my_submissions[0].status, 'received');
  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 0);

  liberar('fim');
  await ocupando;
  const concluido = await api('arena_submit', envio);
  assert.equal(concluido.ok, true);
  assert.equal(concluido.pending, undefined);
  assert.equal(Number(concluido.submission.percent), 66);
  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 1, 'a nota existe uma vez so');
});

test('o professor vê de onde veio cada nota, e por que o juiz local assumiu', async () => {
  // A nota heuristica e a nota do modelo nao valem o mesmo: o professor precisa
  // saber quando o juiz local assumiu. A procedencia sai do METADADO gravado na
  // tentativa de avaliacao (nao de adivinhacao pelo nome do modelo).
  let rodada = 0;
  montar(async () => {
    rodada += 1;
    return rodada === 1
      ? { percent: 61, breakdown: {}, feedback: 'local', metadata: { provider: 'fallback', model: 'arena-fallback-v1', fallback_used: true, fallback_reason: 'gemini_http_429', judge_mode: 'gemini' } }
      : { percent: 90, breakdown: {}, feedback: 'modelo', metadata: { provider: 'gemini', model: 'gemini-3.6-flash', fallback_used: false, judge_mode: 'gemini' } };
  });
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Turma da procedencia', expected_players: 10 })).room;
  const challenge = (await api('arena_save_challenge', {
    ...admin(), title: 'Cartaz', modality: 'precisao', mission: 'Crie um cartaz para a feira.',
    criteria: CRITERIA, duration_seconds: 300, speed_weight: 'none', reference_text: REFERENCE,
  })).challenge;
  await api('arena_add_round', { ...admin(), room_id: room.id, challenge_id: challenge.id });
  await api('arena_publish_room', { ...admin(), room_id: room.id });
  await api('arena_start_round', { ...admin(), room_id: room.id });
  const ana = await api('arena_join', { code: room.pin || room.code, name: 'Ana' });
  const bruno = await api('arena_join', { code: room.pin || room.code, name: 'Bruno' });
  const roundId = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail.rounds[0].id;
  const envio = (aluno) => ({
    participant_id: aluno.participant.id, token: aluno.token, round_id: roundId,
    prompt: 'Crie um cartaz A3 com data, local e contato para a feira.', attempt: 1,
  });
  await api('arena_submit', envio(ana));
  await api('arena_submit', envio(bruno));

  const detalhe = (await api('arena_room_detail', { ...admin(), room_id: room.id })).detail;
  const missao = detalhe.rounds[0];
  assert.equal(missao.judge.total, 2);
  assert.equal(missao.judge.local, 1, 'uma das duas notas veio do juiz local');
  assert.equal(missao.judge.model, 'gemini-3.6-flash', 'o modelo do provedor e o que aparece primeiro');
  assert.deepEqual(missao.judge.reasons, { gemini_http_429: 1 });

  const local = missao.ranking.find((entry) => Number(entry.percent) === 61);
  const modelo = missao.ranking.find((entry) => Number(entry.percent) === 90);
  assert.equal(local.judge.fallback_used, true);
  assert.equal(local.judge.reason, 'gemini_http_429');
  assert.equal(local.judge.provider, 'fallback');
  assert.equal(modelo.judge.fallback_used, false);
  assert.equal(modelo.judge.provider, 'gemini');
  assert.equal(modelo.judge.model, 'gemini-3.6-flash');
});

test('a recusa recuperável sai com o cabeçalho Retry-After', async () => {
  // O cabecalho e do transporte: o corpo ja diz o motivo, e o navegador/proxy
  // precisa do tempo de espera no formato padrao.
  const handler = createApiHttpHandler(async () => {
    const erro = new ApiError(503, 'A fila esta cheia agora.');
    erro.details = { retry_after: 12 };
    throw erro;
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const resposta = await fetch(`http://127.0.0.1:${server.address().port}/api.php?action=arena_submit`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(resposta.status, 503);
    assert.equal(resposta.headers.get('retry-after'), '12');
    assert.equal((await resposta.json()).details.retry_after, 12);
  } finally {
    server.close();
  }
});
