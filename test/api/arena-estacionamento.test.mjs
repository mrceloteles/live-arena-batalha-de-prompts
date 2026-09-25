// A promessa: quando o provedor falha depois das repetições, a avaliação é
// ESTACIONADA para reprocessar — nenhuma submissão fica sem nota, e nenhuma
// ganha nota heurística.
//
// O defeito medido (17/09/2026): no modo `gemini`, uma falha do provedor virava
// nota LOCAL (`arena-fallback-v1`). Com o projeto bloqueado (403), isso deu 6 de
// 6 notas locais com cara de avaliadas — o aluno não tinha como perceber, e a
// turma inteira levou para casa uma nota que ninguém avaliou.
//
// Estes casos passam pelo juiz DE VERDADE (`createJudges` + adaptador +
// repetição) e medem o que sobra no banco:
//   1. o provedor volta: a nota é a do provedor, uma só, e a tela do aluno a vê;
//   2. o provedor não volta: a submissão fica SEM nota (nunca uma heurística),
//      visível para o professor como envio sem avaliação;
//   3. repetir o envio durante a espera não duplica avaliação nem nota;
//   4. a recusa do orçamento da instalação também estaciona: a nota chega sem o
//      aluno precisar repetir.
import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createJudgeBudget } from '../../src/judge/budget.mjs';
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

/**
 * Sobe a Arena com o juiz de VERDADE do modo `gemini`: o que o teste troca é o
 * `fetch` (o provedor), não o adaptador. Assim a repetição, o motivo e o
 * marcador de indisponibilidade são os de produção.
 */
function montar({ fetchImpl, modalidade = 'criterios', submitWaitMs = 40, parkLimits = {} } = {}) {
  parking = createEvaluationParking({ baseDelayMs: 1, maxDelayMs: 3, maxAttempts: 2, ...parkLimits });
  const judges = createJudges({
    mode: 'gemini',
    apiKey: KEY,
    model: 'modelo-de-teste',
    fetchImpl,
    // Espera zerada: o que se mede é o DESFECHO, não o relógio do teste.
    retryDelayMs: 0, rateLimitDelayMs: 0, maxRetryWaitMs: 0,
  });
  // `modalidade` é o juiz injetado quando o caso não quer o adaptador de verdade
  // (o do orçamento injeta o teto, não o provedor).
  arenaDispatch = createArenaApi({
    repositories,
    judge: modalidade === 'criterios' ? judges.criteriaJudge : modalidade,
    now: () => clock, id: () => `id-${++sequence}`, adminAuth, submitWaitMs, parking,
  });
  return judges;
}

/** Provedor que responde a nota da família por critérios. */
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

/** Falha do provedor como ela chega: status + cabeçalhos (sem `Retry-After`). */
const falhaDoProvedor = (status) => ({ ok: false, status, headers: { get: () => null } });

/** Sala com uma missão aberta e um aluno dentro — o mesmo recorte da auditoria. */
async function salaComMissao({ nome = 'Ana' } = {}) {
  await api('arena_set_open', { ...admin(), open: true });
  const room = (await api('arena_create_room', { ...admin(), title: 'Turma do pátio', expected_players: 10 })).room;
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
    aluno,
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

const missoes = (detalhe) => detalhe.rounds;

test('o provedor falha e volta: a nota é a do provedor, e a heurística local não é gravada', async () => {
  let chamadas = 0;
  montar({
    fetchImpl: async () => {
      chamadas += 1;
      // Uma avaliação gasta até duas chamadas com repetição (o 429 se repete).
      return chamadas <= 2 ? falhaDoProvedor(429) : respostaDoProvedor(18, 16);
    },
  });
  const { envio, sessao, roundId, roomId } = await salaComMissao();

  const resposta = await api('arena_submit', envio);
  const chamadasNoEnvio = chamadas;

  assert.equal(resposta.ok, true);
  assert.equal(resposta.pending, true, 'o envio é aceito: a avaliação continua');
  assert.equal(resposta.parked, true, 'e ela continua no pátio, não no juiz local');
  assert.equal(resposta.reason, 'gemini_http_429', 'o motivo é o do provedor (o que o professor lê)');
  assert.equal(resposta.submission, undefined, 'nenhuma nota é inventada na resposta');
  assert.ok(chamadasNoEnvio >= 2, `o provedor foi tentado antes de desistir (chamadas: ${chamadasNoEnvio})`);

  // O que está no banco AGORA é o ponto: nenhuma nota heurística.
  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 0, 'nenhuma nota ainda');
  const tentativas = await repositories.arena.judgeAttempts.listBySubmission(resposta.submission_id);
  assert.equal(tentativas.length, 1, 'a tentativa que falhou fica registrada');
  assert.equal(tentativas[0].status, 'failed');
  assert.match(tentativas[0].error, /429/);

  // O estado visível: recebida, sem nota — e o professor vê exatamente isso.
  const durante = await api('arena_lobby', sessao);
  assert.equal(durante.lobby.current_round.my_submissions[0].status, 'received');
  const painel = (await api('arena_room_detail', { ...admin(), room_id: roomId })).detail;
  assert.equal(missoes(painel)[0].submitted, 1);
  assert.equal(missoes(painel)[0].scored, 0, 'a missão aparece com envio e sem avaliação');

  // O pátio reprocessa sozinho: ninguém repete o envio, ninguém clica de novo.
  await parking.idle();

  const scores = await repositories.arena.scores.listByRound(roundId);
  assert.equal(scores.length, 1, 'a nota chegou — uma só');
  // 18 de 20 com peso 60 + 16 de 20 com peso 40 = 86%.
  assert.equal(Number(scores[0].percent), 86, 'a nota é a do provedor');
  assert.equal(scores[0].model, 'modelo-de-teste');

  // E a heurística continua ausente: nem no banco, nem no que o professor lê.
  const depois = (await api('arena_room_detail', { ...admin(), room_id: roomId })).detail;
  const missao = missoes(depois)[0];
  assert.equal(missao.judge.total, 1);
  assert.equal(missao.judge.local, 0, 'zero notas do juiz local');
  assert.equal(missao.judge.model, 'modelo-de-teste');
  assert.equal(parking.state().resolved, 1);
  assert.equal(parking.state().exhausted, 0);

  const lobby = await api('arena_lobby', sessao);
  assert.equal(lobby.lobby.current_round.my_scores.length, 1, 'a tela do aluno vê a nota pela consulta de estado');
  assert.equal(Number(lobby.lobby.current_round.my_scores[0].percent), 86);
});

test('o provedor não volta: a submissão fica sem nota — nunca com heurística', async () => {
  let chamadas = 0;
  montar({
    fetchImpl: async () => { chamadas += 1; return falhaDoProvedor(503); },
    parkLimits: { maxAttempts: 2 },
  });
  const { envio, sessao, roundId, roomId } = await salaComMissao();

  const resposta = await api('arena_submit', envio);
  assert.equal(resposta.parked, true);
  assert.equal(resposta.reason, 'gemini_http_503');

  await parking.idle();

  const estado = parking.state();
  assert.equal(estado.exhausted, 1, 'as tentativas automáticas terminaram e o pátio CONTA isso');
  assert.equal(estado.parked, 0);

  // A afirmação central: nenhuma nota. O comportamento antigo gravaria
  // `arena-fallback-v1` aqui — uma nota que ninguém avaliou.
  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 0, 'nenhuma nota heurística');

  // O envio NÃO se perdeu: ele existe, e é isso que o aluno e o professor veem.
  const lobby = await api('arena_lobby', sessao);
  assert.equal(lobby.lobby.current_round.my_submissions[0].status, 'received');
  const painel = (await api('arena_room_detail', { ...admin(), room_id: roomId })).detail;
  assert.equal(missoes(painel)[0].submitted, 1, 'o professor vê o envio');
  assert.equal(missoes(painel)[0].scored, 0, 'e vê que ele ainda não foi avaliado');

  // As tentativas automáticas ficaram registradas, uma a uma: a do envio e as
  // duas do pátio. O professor consegue reconstruir a história inteira.
  const tentativas = await repositories.arena.judgeAttempts.listBySubmission(resposta.submission_id);
  assert.equal(tentativas.length, 3, 'envio + duas do pátio, todas com rastro');
  assert.ok(tentativas.every((entrada) => entrada.status === 'failed'));
  assert.equal(chamadas, 6, 'cada avaliação tentada gastou duas chamadas (uma tentativa mais uma repetição)');

  // E o aluno pode repetir: continua sem nota inventada (e sem nota dupla).
  const antes = chamadas;
  const repetido = await api('arena_submit', envio);
  assert.equal(repetido.parked, true);
  assert.equal(repetido.submission, undefined);
  assert.ok(chamadas > antes, 'o novo envio tentou o provedor de novo (não é o resultado de ontem em cache)');
  await parking.idle();
  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 0);
});

test('repetir o envio durante a espera não duplica avaliação nem nota', async () => {
  let chamadas = 0;
  // A espera do pátio é longa o bastante para o aluno repetir ANTES dela: é isso
  // que o caso precisa medir.
  montar({
    fetchImpl: async () => {
      chamadas += 1;
      return chamadas <= 2 ? falhaDoProvedor(429) : respostaDoProvedor(20, 20);
    },
    parkLimits: { baseDelayMs: 250, maxDelayMs: 250, maxAttempts: 2 },
  });
  const { envio, roundId, sessao } = await salaComMissao();

  const primeiro = await api('arena_submit', envio);
  assert.equal(primeiro.parked, true);
  assert.equal(chamadas, 2, 'a avaliação tentou o provedor e desistiu da tentativa');

  // O aluno repete o mesmo envio (clique duplo, "tente de novo"): é a MESMA
  // submissão e a mesma tentativa — a resposta traz a nota, não um erro.
  const repetido = await api('arena_submit', envio);
  assert.equal(repetido.pending, undefined);
  assert.equal(repetido.submission.id, primeiro.submission_id);
  assert.equal(Number(repetido.submission.percent), 100, '20 de 20 nos dois criterios');
  assert.equal(chamadas, 3, 'uma chamada nova, não duas');

  // O pátio ainda tinha a entrada: ao vencer, ele encontra a nota e NÃO
  // reavalia (é essa a diferença entre "reprocessar" e "avaliar de novo").
  await parking.idle();
  assert.equal(chamadas, 3, 'o pátio não gastou chamada: a nota já existia');
  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 1, 'uma nota por submissão');
  assert.equal(parking.state().resolved, 1);
  const lobby = await api('arena_lobby', sessao);
  assert.equal(lobby.lobby.current_round.my_scores.length, 1);
});

// ---------------------------------------------------------------------------
// A RETOMADA: a fila é o banco, o pátio é só o relógio de quem está de pé
// ---------------------------------------------------------------------------
//
// O defeito medido: o pátio vivia na memória do processo, então um redeploy (ou
// um reinício) descartava as esperas — e a submissão que esperava nota ficava
// sem nota ATÉ o aluno reenviar. Aqui o "reinício" é simulado do jeito mais
// honesto que um teste em processo consegue: o pátio anterior para, um pátio
// NOVO e uma API NOVA nascem sobre o MESMO banco, e é a retomada do boot que
// recoloca a avaliação na fila. Nada é passado de mão em mão entre os dois.

/** Simula o reinício sobre o mesmo banco e devolve o resultado da retomada. */
async function reiniciar({ fetchImpl, parkLimits = {}, rearrms } = {}) {
  parking.stop();
  parking = createEvaluationParking({ baseDelayMs: 1, maxDelayMs: 3, ...parkLimits });
  const judges = createJudges({
    mode: 'gemini', apiKey: KEY, model: 'modelo-de-teste', fetchImpl,
    retryDelayMs: 0, rateLimitDelayMs: 0, maxRetryWaitMs: 0,
  });
  arenaDispatch = createArenaApi({
    repositories, judge: judges.criteriaJudge, now: () => clock,
    id: () => `id-${++sequence}`, adminAuth, submitWaitMs: 40, parking,
  });
  const retomada = await arenaDispatch.retomarEstacionadas({
    timestamp: clock, ...(Number.isInteger(rearrms) ? { rearrms } : {}),
  });
  return { retomada, judges };
}

test('o reinício não descarta: a submissão sem nota volta para a fila e recebe a nota do provedor', async () => {
  const chamadas = [];
  montar({
    fetchImpl: async () => { chamadas.push('envio'); return falhaDoProvedor(503); },
    parkLimits: { maxAttempts: 4 },
  });
  const { envio, sessao, roundId, roomId } = await salaComMissao();

  const resposta = await api('arena_submit', envio);
  assert.equal(resposta.parked, true);
  assert.equal(resposta.reason, 'gemini_http_503');
  // O processo MORRE aqui: as esperas do pátio vão embora com ele (é o que o
  // encerramento faz de verdade, e é o caso que o redeploy produz).
  assert.equal(parking.state().parked, 1, 'a avaliação estava esperando no pátio');
  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 0, 'e sem nota nenhuma');
  const chamadasAntesDoReinicio = chamadas.length;

  // O processo NOVO: mesmo banco, outro pátio (vazio por definição).
  let chamadasDoProvedorNovo = 0;
  const { retomada } = await reiniciar({
    fetchImpl: async () => { chamadasDoProvedorNovo += 1; return respostaDoProvedor(18, 16); },
    parkLimits: { maxAttempts: 4 },
  });

  // A retomada é uma LEITURA do banco: encontrou a fila que já estava lá.
  assert.equal(retomada.found, 1, 'o banco guardou a submissão sem nota');
  assert.equal(retomada.resumed, 1, 'e ela voltou para a fila no processo novo');
  assert.equal(retomada.exhausted, 0);
  assert.equal(parking.state().parked, 1, 'a avaliação está na fila do processo novo');
  // Piso de 1 s: retomar não pode virar rajada no mesmo instante em que sobe.
  //
  // A folga de 50 ms é do INSTRUMENTO, não do piso: `next_retry_ms` é o tempo
  // que FALTA, medido depois do agendamento — os milissegundos que correram
  // desde então já saíram da conta, e numa máquina carregada 1 ms basta para a
  // leitura fechar em 999. O defeito que esta linha persegue é outro: a retomada
  // imediata, que devolveria 0 a poucos ms. Exigir o valor exato media o
  // relógio, não a regra (a suíte reprovava com 999 ms e passava isolada).
  assert.ok(parking.state().next_retry_ms >= 950, `a retomada não dispara na subida (leu ${parking.state().next_retry_ms}ms)`);
  assert.equal(chamadas.length, chamadasAntesDoReinicio, 'e nada foi chamado antes da hora');

  await parking.idle();

  // A nota que chega é a do provedor, no processo novo, sem o aluno reenviar.
  const scores = await repositories.arena.scores.listByRound(roundId);
  assert.equal(scores.length, 1, 'a nota chegou — uma só');
  assert.equal(Number(scores[0].percent), 86, '18/20 com peso 60 + 16/20 com peso 40');
  assert.equal(scores[0].model, 'modelo-de-teste');
  assert.equal(chamadasDoProvedorNovo >= 1, true, 'a nota veio do provedor do processo novo');
  assert.equal(parking.state().resolved, 1);

  const painel = (await api('arena_room_detail', { ...admin(), room_id: roomId })).detail;
  assert.equal(missoes(painel)[0].scored, 1, 'o professor vê a missão avaliada');
  assert.equal(missoes(painel)[0].judge.local, 0, 'e nenhuma nota do juiz local');
  const lobby = await api('arena_lobby', sessao);
  assert.equal(lobby.lobby.current_round.my_scores.length, 1, 'a tela do aluno vê a nota');

  // O rastro das tentativas continua sendo a história verdadeira: a do envio
  // (que falhou) e a do reprocessamento do processo novo (que deu a nota).
  const tentativas = await repositories.arena.judgeAttempts.listBySubmission(resposta.submission_id);
  assert.equal(tentativas.length, 2);
  assert.equal(tentativas[0].status, 'failed');
  assert.equal(tentativas[1].status, 'succeeded');
});

test('surto esgotado não vira surto novo: a varredura espera o resfriamento e dá UMA tentativa', async () => {
  let chamadas = 0;
  const falha = async () => { chamadas += 1; return falhaDoProvedor(503); };
  montar({
    fetchImpl: falha,
    // Teto de UMA tentativa de pátio: o cenário patológico (provedor fora), no
    // qual um laço de reinícios poderia tentar para sempre.
    parkLimits: { maxAttempts: 1 },
  });
  const { envio, roundId, roomId } = await salaComMissao();

  const resposta = await api('arena_submit', envio);
  assert.equal(resposta.parked, true);
  await parking.idle();
  assert.equal(parking.state().exhausted, 1, 'a tentativa automática se esgotou');
  assert.equal((await repositories.arena.judgeAttempts.listBySubmission(resposta.submission_id)).length, 2, 'a do envio e a do pátio');
  const chamadasAntes = chamadas;

  // 1) Antes do resfriamento, nem o reinício nem o vigia tentam: o surto já foi
  //    gasto, e quem decide a próxima tentativa é o relógio do resfriamento.
  const cedo = await reiniciar({ fetchImpl: async () => { chamadas += 1; return respostaDoProvedor(); }, parkLimits: { maxAttempts: 1 } });
  assert.equal(cedo.retomada.found, 1, 'a submissão continua sem nota');
  assert.equal(cedo.retomada.resumed, 0, 'o surto já foi: não é surto novo');
  assert.equal(cedo.retomada.cooling, 1, 'ela está esperando o resfriamento');
  assert.equal(cedo.retomada.rearms, 0);
  await parking.idle();
  assert.equal(chamadas, chamadasAntes, 'nenhuma chamada ao provedor antes do resfriamento');

  // 2) Cumprido o resfriamento, o provedor que voltou é aproveitado — com UMA
  //    tentativa, e não com um surto de quatro.
  clock += 3_600; // uma hora: o resfriamento padrão é de 10 minutos
  const depois = await reiniciar({ fetchImpl: falha, parkLimits: { maxAttempts: 1 } });
  assert.equal(depois.retomada.rearms, 1, 'rearmada depois do resfriamento');
  assert.equal(parking.state().parked, 1);
  await parking.idle();
  assert.equal(
    (await repositories.arena.judgeAttempts.listBySubmission(resposta.submission_id)).length, 3,
    'envio + surto + a tentativa única do rearme',
  );
  assert.equal(chamadas, chamadasAntes + 2, 'uma avaliação a mais (uma tentativa e a repetição dela)');
  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 0, 'o provedor ainda está fora: sem nota');
  assert.equal(missoes((await api('arena_room_detail', { ...admin(), room_id: roomId })).detail)[0].scored, 0);
});

test('a retomada continua de onde parou: o que o processo anterior gastou continua gasto', async () => {
  let chamadas = 0;
  const falha = async () => { chamadas += 1; return falhaDoProvedor(503); };
  montar({ fetchImpl: falha, parkLimits: { maxAttempts: 2 } });
  const { envio, roundId } = await salaComMissao();

  const resposta = await api('arena_submit', envio);
  await parking.idle();
  const gastasNoPrimeiro = await repositories.arena.judgeAttempts.listBySubmission(resposta.submission_id);
  assert.equal(gastasNoPrimeiro.length, 3, 'envio + duas do pátio (o teto do primeiro processo)');
  assert.equal(parking.state().exhausted, 1);

  // O processo novo tem teto 4 — e ainda restam DUAS tentativas (4 menos as
  // duas que o pátio anterior já gastou), não quatro. Sem isto, um laço de
  // reinícios daria ao provedor um punhado novo de tentativas a cada subida.
  const { retomada } = await reiniciar({ fetchImpl: falha, parkLimits: { maxAttempts: 4 } });
  assert.equal(retomada.resumed, 1, 'ainda havia tentativa a gastar, então a avaliação volta para a fila');
  await parking.idle();

  const tentativas = await repositories.arena.judgeAttempts.listBySubmission(resposta.submission_id);
  assert.equal(tentativas.length, 5, 'o teto de 4 reprocessamentos vale para a história inteira, não por processo');
  assert.equal(parking.state().exhausted, 1, 'e o processo novo desiste no mesmo ponto em que desistiria o antigo');
  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 0, 'sem nota: o provedor nunca respondeu');
  assert.equal(chamadas, 10, 'nenhuma chamada além das que o teto autoriza');
});

test('o vigia rearma até o teto de rearmes: depois disso a nota depende do reenvio do aluno', async () => {
  let chamadas = 0;
  const falha = async () => { chamadas += 1; return falhaDoProvedor(503); };
  montar({ fetchImpl: falha, parkLimits: { maxAttempts: 1 } });
  const { envio, roundId, roomId } = await salaComMissao();
  const resposta = await api('arena_submit', envio);
  await parking.idle();

  // Um vigia com UM rearme só: a história inteira de uma submissão é envio +
  // surto + um rearme. Sem esse teto, "reprocessar de vez em quando" seria um
  // laço infinito com cara de bondade.
  const rearmar = async () => {
    // O relógio avança horas entre os rearmes, e o token do painel tem prazo:
    // o operador de verdade entra de novo, e o teste faz o mesmo.
    adminToken = adminAuth.login('senha-segura-123').token;
    const { retomada } = await reiniciar({ fetchImpl: falha, parkLimits: { maxAttempts: 1 }, rearrms: 1 });
    await parking.idle();
    return retomada;
  };

  clock += 3_600;
  const primeiro = await rearmar();
  assert.equal(primeiro.rearms, 1, 'o rearme permitido acontece');
  clock += 3_600;
  const segundo = await rearmar();
  assert.equal(segundo.rearms, 0, 'o teto de rearmes foi gasto');
  assert.equal(segundo.exhausted, 1, 'e a submissão fica contada como sem nota automática');

  const tentativas = await repositories.arena.judgeAttempts.listBySubmission(resposta.submission_id);
  assert.equal(tentativas.length, 3, 'envio + surto + o único rearme: nada além disso');
  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 0);
  assert.equal(missoes((await api('arena_room_detail', { ...admin(), room_id: roomId })).detail)[0].scored, 0);
  // O caminho que sempre existe: o aluno repete o MESMO envio.
  const repetido = await api('arena_submit', envio);
  assert.equal(repetido.parked, true, 'o reenvio volta a tentar na hora');
  assert.equal((await repositories.arena.judgeAttempts.listBySubmission(resposta.submission_id)).length, 4);
});

test('o que já está na fila não é reestacionado pela varredura', async () => {
  let chamadas = 0;
  montar({
    fetchImpl: async () => { chamadas += 1; return falhaDoProvedor(503); },
    // Espera longa: a avaliação fica na fila enquanto a varredura passa.
    parkLimits: { baseDelayMs: 5_000, maxDelayMs: 5_000, maxAttempts: 3 },
  });
  const { envio, roundId } = await salaComMissao();
  const resposta = await api('arena_submit', envio);
  assert.equal(parking.state().parked, 1);
  const chamadasAntes = chamadas;

  const resumo = await arenaDispatch.retomarEstacionadas({ timestamp: clock });

  assert.equal(resumo.found, 1);
  assert.equal(resumo.running, 1, 'a varredura reconhece o que já está na fila deste processo');
  assert.equal(resumo.resumed, 0, 'e não estaciona de novo');
  assert.equal(parking.state().parked, 1, 'uma entrada só, como antes da varredura');
  assert.equal(chamadas, chamadasAntes, 'nenhuma chamada nova por causa da varredura');
  parking.stop();
  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 0);
});

test('aula encerrada não dispara avaliação no boot: o teto do passado não vira chamada de hoje', async () => {
  let chamadas = 0;
  montar({
    fetchImpl: async () => { chamadas += 1; return falhaDoProvedor(503); },
    parkLimits: { maxAttempts: 3 },
  });
  const { envio, roomId, roundId } = await salaComMissao();
  assert.equal((await api('arena_submit', envio)).parked, true);
  parking.stop();
  await api('arena_end_room', { ...admin(), room_id: roomId });

  const chamadasAntes = chamadas;
  const { retomada } = await reiniciar({ fetchImpl: async () => { chamadas += 1; return respostaDoProvedor(); } });

  assert.equal(retomada.found, 0, 'sala encerrada não entra na fila do boot');
  assert.equal(retomada.resumed, 0);
  assert.equal(parking.state().parked, 0);
  assert.equal(chamadas, chamadasAntes, 'o provedor não é chamado por uma aula que acabou');
  assert.equal((await repositories.arena.scores.listByRound(roundId)).length, 0);
});

test('a recusa do orçamento da instalação também estaciona: a nota chega sem o aluno repetir', async () => {
  // O teto da hora já estourada (uma avaliação gasta o único lugar). O relógio
  // do TETO é separado do relógio da sala de propósito: a janela dele é de uma
  // hora e a missão é de minutos — misturar os dois avançaria a missão junto.
  let relogioDoTeto = clock * 1000;
  const budget = createJudgeBudget({ maxConcurrent: 1, perHour: 1, maxQueued: 0, now: () => relogioDoTeto });
  await budget.run(async () => 'ocupou o lugar da hora');
  montar({ fetchImpl: async () => respostaDoProvedor(), modalidade: (input) => budget.run(async () => ({
    percent: 66, breakdown: { objetivo: 13, contexto: 13 }, feedback: 'Avaliado.', metadata: { provider: 'gemini', model: 'modelo-de-teste' },
  })) });
  const { envio, roundId, sessao, roomId } = await salaComMissao();

  // A recusa continua recuperável (o aluno pode repetir na hora)...
  await assert.rejects(api('arena_submit', envio), (error) => {
    assert.equal(error.status, 503);
    assert.match(error.message, /limite de avaliacoes externas/i);
    assert.ok(Number(error.details?.retry_after) >= 1, 'diz quanto esperar');
    return true;
  });
  // ...E a avaliação ficou no pátio: sem isto, um pico de cota deixava a nota
  // dependendo de o aluno lembrar de repetir.
  assert.equal(parking.state().parked, 1);
  const submissao = (await repositories.arena.submissions.listByRound(roundId))[0];
  assert.ok(submissao, 'a submissão foi criada antes da recusa');

  // A hora vira (o pátio tenta de novo depois dela).
  relogioDoTeto += 4_000_000;
  await parking.idle();

  const scores = await repositories.arena.scores.listByRound(roundId);
  assert.equal(scores.length, 1, 'a nota chegou sem novo envio do aluno');
  assert.equal(Number(scores[0].percent), 66);
  assert.equal(parking.state().resolved, 1);
  const lobby = await api('arena_lobby', sessao);
  assert.equal(lobby.lobby.current_round.my_scores.length, 1);
  const painel = (await api('arena_room_detail', { ...admin(), room_id: roomId })).detail;
  assert.equal(missoes(painel)[0].scored, 1, 'o professor vê a missão avaliada');
});
