// A fila do pátio na TELA do professor.
//
// O defeito que isto corrige: quando o provedor falhava, a submissão ficava sem
// nota e o painel só dizia "1 envio · 0 avaliados". Quem estava dando aula não
// tinha como saber se a nota voltava sozinha, se dependia de o aluno reenviar, ou
// se a aula tinha acabado e ninguém mais iria avaliar aquilo. A fila existia —
// mas só para quem lê a prontidão do servidor (`/readyz`), e quem dá aula não lê.
//
// O que estes casos fixam, um por desfecho possível: quem espera (aluna, missão),
// há quanto tempo, quanto falta para a próxima tentativa, e — a decisão que o
// professor toma agora — se a nota volta SOZINHA ou não.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createJudges } from '../../src/judge/configuration.mjs';
import { createEvaluationParking } from '../../src/judge/parking.mjs';
import { createAdminAuth } from '../../src/server/admin-auth.mjs';
import { createArenaApi } from '../../src/server/arena-api.mjs';

const CRITERIA = [{ criterion: 'objetivo', weight: 60 }, { criterion: 'contexto', weight: 40 }];
const REFERENCE = 'Cartaz A3 da feira de tecnologia, com data, local, lista de stands e contato.';
const KEY = 'chave-de-teste-que-nao-pode-vazar';

let opened, repositories, arenaDispatch, clock, sequence, adminToken, adminAuth, parking;

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
const entrarDeNovo = () => { adminToken = adminAuth.login('senha-segura-123').token; };

/**
 * Sobe a Arena com o juiz de VERDADE do modo `gemini`: o que o teste troca é o
 * `fetch` (o provedor). Assim o motivo que o painel mostra é o de produção, e não
 * um texto inventado pelo teste.
 */
function montar({ fetchImpl, parkLimits = {}, submitWaitMs = 40 } = {}) {
  parking = createEvaluationParking({ baseDelayMs: 1, maxDelayMs: 3, maxAttempts: 2, ...parkLimits });
  const judges = createJudges({
    mode: 'gemini',
    apiKey: KEY,
    model: 'modelo-de-teste',
    fetchImpl,
    retryDelayMs: 0, rateLimitDelayMs: 0, maxRetryWaitMs: 0,
  });
  arenaDispatch = createArenaApi({
    repositories,
    judge: judges.criteriaJudge,
    now: () => clock, id: () => `id-${++sequence}`, adminAuth, submitWaitMs, parking,
  });
}

const respostaDoProvedor = (objetivo = 18, contexto = 16) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => ({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            scores: [{ criterion: 'objetivo', points: objetivo }, { criterion: 'contexto', points: contexto }],
            feedback: 'Nota do provedor.',
          }),
        }],
      },
    }],
    modelVersion: 'modelo-de-teste-v1',
  }),
});

const falhaDoProvedor = (status) => ({ ok: false, status, headers: { get: () => null } });

/** Sala com uma missão aberta e uma aluna dentro. */
async function salaComMissao({ titulo = 'Turma da fila', nome = 'Ana', missao = 'Cartaz' } = {}) {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: titulo, expected_players: 10 })).room;
  const challenge = (await api('arena_save_challenge', {
    ...admin(), title: missao, modality: 'precisao', mission: 'Crie um cartaz para a feira.',
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
    aluno,
    sessao: { participant_id: aluno.participant.id, token: aluno.token },
    envio: {
      participant_id: aluno.participant.id,
      token: aluno.token,
      round_id: roundId,
      prompt: 'Crie um cartaz A3 com data, local e contato para a feira.',
      attempt: 1,
    },
  };
}

const fila = async (roomId) => (await api('arena_room_detail', { ...admin(), room_id: roomId })).detail.waiting;

test('o painel diz quem espera nota: aluna, missão, tempo e quanto falta para a próxima tentativa', async () => {
  montar({
    fetchImpl: async () => falhaDoProvedor(503),
    // Espera longa: a avaliação FICA no pátio enquanto o painel é lido. Com
    // espera curta ela já teria sido reprocessada e o caso mediria outra coisa.
    parkLimits: { baseDelayMs: 5_000, maxDelayMs: 5_000, maxAttempts: 3 },
  });
  const { envio, roomId, roundId } = await salaComMissao();

  // Antes de qualquer envio não há pendência — e o painel não inventa uma.
  assert.deepEqual(await fila(roomId), { total: 0, items: [] }, 'sala sem pendência não tem bloco de espera');

  const resposta = await api('arena_submit', envio);
  assert.equal(resposta.parked, true, 'a avaliação está no pátio');

  const naFila = await fila(roomId);
  assert.equal(naFila.total, 1);
  const [item] = naFila.items;
  assert.equal(item.submission_id, resposta.submission_id, 'a linha aponta para a submissão que espera');
  assert.equal(item.participant_id, envio.participant_id);
  assert.equal(item.participant_name, 'Ana', 'o professor lê o NOME, não um id');
  assert.equal(item.round_id, roundId);
  assert.equal(item.round_position, 1, 'e sabe de que missão se trata');
  assert.equal(item.round_title, 'Cartaz');
  assert.equal(item.state, 'na_fila', 'a nota vai chegar: o relógio do pátio está de pé');
  assert.equal(item.reason, 'gemini_http_503', 'o motivo é o vocabulário do provedor (a tela traduz)');
  assert.equal(item.attempts, 1, 'uma tentativa até agora: a do envio');
  assert.ok(Number.isFinite(item.next_retry_seconds), `diz quando tenta de novo (${item.next_retry_seconds})`);
  assert.ok(item.next_retry_seconds > 0);

  // O tempo de espera é o tempo real desde o envio — é o "há quanto tempo" da
  // tela, e ele anda com o relógio do servidor.
  const antes = Number(item.waiting_seconds);
  clock += 90;
  const depois = (await fila(roomId)).items[0];
  assert.equal(Number(depois.waiting_seconds), antes + 90, 'o tempo de espera acompanha o relógio');
  assert.equal(depois.submitted_at, item.submitted_at, 'e a referência continua sendo o envio');
});

test('avaliação em voo aparece como "avaliando agora", não como pendência parada', async () => {
  let soltar = null;
  montar({
    // O provedor SEGURA a resposta: é o retrato da avaliação que está sendo feita
    // neste instante — a que o professor vê como "avaliando agora".
    fetchImpl: () => new Promise((resolve) => { soltar = () => resolve(respostaDoProvedor()); }),
  });
  const { envio, roomId } = await salaComMissao();

  const resposta = await api('arena_submit', envio);
  assert.equal(resposta.pending, true, 'o envio responde pendente enquanto a avaliação corre');

  const emVoo = await fila(roomId);
  assert.equal(emVoo.total, 1);
  assert.equal(emVoo.items[0].state, 'avaliando');
  assert.equal(emVoo.items[0].reason, null, 'não há falha para contar: nada de motivo inventado');

  soltar();
  await parking.idle();
  assert.equal((await fila(roomId)).total, 0, 'a nota chegou e a pendência saiu da tela');
});

test('a nota que chega tira o envio da fila do painel', async () => {
  let chamadas = 0;
  montar({
    fetchImpl: async () => {
      chamadas += 1;
      return chamadas <= 2 ? falhaDoProvedor(429) : respostaDoProvedor(18, 16);
    },
    // Espera curta (1 s): o que o caso mede é a presença e a AUSÊNCIA da linha,
    // e não o relógio do pátio — basta que a avaliação ainda esteja na fila na
    // leitura logo depois do envio.
    parkLimits: { baseDelayMs: 1_000, maxDelayMs: 1_000, maxAttempts: 3 },
  });
  const { envio, roomId, roundId } = await salaComMissao();

  assert.equal((await api('arena_submit', envio)).parked, true);
  assert.equal((await fila(roomId)).total, 1, 'antes da nota, a pendência está na tela');

  await parking.idle();

  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 1, 'a nota chegou');
  const depois = await fila(roomId);
  assert.deepEqual(depois, { total: 0, items: [] }, 'e o bloco de espera some: não há mais o que dizer');
});

test('sala encerrada: o painel avisa que a nota desta missão não volta sozinha', async () => {
  montar({
    fetchImpl: async () => falhaDoProvedor(503),
    parkLimits: { baseDelayMs: 5_000, maxDelayMs: 5_000, maxAttempts: 3 },
  });
  const { envio, roomId } = await salaComMissao();
  assert.equal((await api('arena_submit', envio)).parked, true);
  // O processo perde o relógio (ou o professor encerra a aula): a submissão
  // continua sem nota, e a recuperação automática não pega sala encerrada.
  parking.stop();
  await api('arena_end_room', { ...admin(), room_id: roomId });

  const item = (await fila(roomId)).items[0];
  assert.equal(item.state, 'encerrada', 'a tela diz o motivo de a nota não voltar: a aula acabou');
  assert.equal(item.reason, 'gemini_http_503', 'e o motivo da falha continua registrado');
});

test('envio mais velho que a janela de recuperação aparece como fora do prazo', async () => {
  montar({
    fetchImpl: async () => falhaDoProvedor(503),
    parkLimits: { baseDelayMs: 1, maxDelayMs: 1, maxAttempts: 1 },
  });
  const { envio, roomId } = await salaComMissao();
  assert.equal((await api('arena_submit', envio)).parked, true);
  parking.stop();
  // A sala continua viva; o envio é que passou da janela de 24 h da retomada.
  clock += 25 * 60 * 60;
  entrarDeNovo();

  const item = (await fila(roomId)).items[0];
  assert.equal(item.state, 'fora_da_janela', 'a recuperação automática não alcança mais este envio');
  assert.equal(Number(item.waiting_seconds) > 24 * 60 * 60, true, 'e o tempo de espera diz isso sem rodeio');
});

test('surto e rearmes esgotados: o painel diz que a nota não volta sozinha', async () => {
  montar({
    fetchImpl: async () => falhaDoProvedor(503),
    // Teto de UMA tentativa por rodada: o cenário patológico (provedor fora), no
    // qual a história inteira de uma submissão é envio + surto + rearmes.
    parkLimits: { baseDelayMs: 1, maxDelayMs: 1, maxAttempts: 1 },
  });
  const { envio, roomId, roundId } = await salaComMissao();
  await api('arena_submit', envio);
  await parking.idle();

  // Cada rearme exige o resfriamento cumprido e dá UMA tentativa. O teto do
  // rearme é do produto (6); o teste percorre o caminho inteiro até o fim dele.
  for (let volta = 0; volta < 8; volta += 1) {
    entrarDeNovo();
    clock += 3_600;
    const varredura = await arenaDispatch.retomarEstacionadas({ timestamp: clock });
    await parking.idle();
    if (varredura.exhausted > 0) break;
  }

  const naFila = await fila(roomId);
  assert.equal(naFila.total, 1, 'a submissão continua ali: sem nota, e agora contada');
  assert.equal(naFila.items[0].state, 'esgotada', 'a tela diz que a nota depende de ação, não de espera');
  assert.equal(naFila.items[0].attempts, 8, 'envio + surto + os seis rearmes do teto');
  assert.equal(naFila.items[0].reason, 'gemini_http_503', 'e o motivo não se perdeu no caminho');
  assert.equal(naFila.items[0].next_retry_seconds, null, 'não há próxima tentativa para anunciar');
  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 0, 'e o provedor nunca deu a nota');
});

test('a fila é da SALA: o que espera em outra sala não aparece neste painel', async () => {
  montar({
    fetchImpl: async () => falhaDoProvedor(503),
    parkLimits: { baseDelayMs: 5_000, maxDelayMs: 5_000, maxAttempts: 3 },
  });
  const primeira = await salaComMissao({ titulo: 'Turma A', nome: 'Ana' });
  const segunda = await salaComMissao({ titulo: 'Turma B', nome: 'Bruno' });

  assert.equal((await api('arena_submit', primeira.envio)).parked, true);
  assert.equal((await api('arena_submit', segunda.envio)).parked, true);

  assert.equal((await fila(primeira.roomId)).total, 1);
  assert.equal((await fila(primeira.roomId)).items[0].participant_name, 'Ana');
  assert.equal((await fila(segunda.roomId)).total, 1);
  assert.equal((await fila(segunda.roomId)).items[0].participant_name, 'Bruno');
});
