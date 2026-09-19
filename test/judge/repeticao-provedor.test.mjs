// A cota do provedor não pode virar nota heurística.
//
// Medido em 17/09/2026 (`npm run carga:http -- --falha-provedor 429`, 6 alunos):
// no modo `gemini` um 429 produzia **6 de 6** notas locais, sem o aluno ver
// diferença — o critério do juiz por critérios não repetia 429, e o juiz
// clássico (source-compatible) não repetia NADA. Estes testes fixam o
// comportamento novo: 429 e 5xx se repetem com espera, e o local passa a ser o
// ÚLTIMO recurso, não o primeiro.
//
// A política em si (o que se repete, quanto se espera) mora em
// `src/judge/retry.mjs`, compartilhada pelas duas famílias: elas não podem
// discordar sobre isto de novo.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createJudges } from '../../src/judge/configuration.mjs';
import { createCriteriaJudge, createFallbackSafeCriteriaJudge } from '../../src/judge/criteria-judge.mjs';
import { judgeUnavailable } from '../../src/judge/failure.mjs';
import { createGeminiJudge } from '../../src/judge/gemini-judge.mjs';
import { createSourceCompatibleJudge } from '../../src/judge/source-compatible-judge.mjs';
import { CLASSIC_DEADLINE_MS, JUDGE_RETRY_LIMITS, hasTimeForRetry, retryAfterMs, retryableStatus, waitBeforeRetry } from '../../src/judge/retry.mjs';
import { SOURCE_COMPATIBLE_CONFIG } from '../../src/judge/source-compatible-judge.mjs';

// `assert.rejects` não devolve o erro; estes casos precisam inspecioná-lo (é ele
// que carrega o motivo e a marca de estacionável).
async function capturarErro(fn) {
  let capturado = null;
  await assert.rejects(fn, (erro) => {
    capturado = erro;
    return true;
  });
  return capturado;
}

const CRITERIA = [
  { criterion: 'objetivo', weight: 60 },
  { criterion: 'contexto', weight: 40 },
];

const CRITERIA_INPUT = {
  mission: 'Crie um cartaz para a feira de tecnologia da escola.',
  context: 'Feira anual do ensino médio.',
  referenceText: 'feira de tecnologia, estudantes do ensino médio, cartaz impresso',
  expectedResult: 'Cartaz A3 impresso, chamativo para adolescentes.',
  criteria: CRITERIA,
  candidatePrompt: 'Crie um cartaz vibrante para a feira de tecnologia, formato A3 impresso, para estudantes do ensino médio.',
};

const CLASSIC_INPUT = {
  referencePrompt: 'Cartaz A3 da feira de tecnologia, com data, local e contato.',
  rubric: 'Compare assunto, composição e detalhes.',
  candidatePrompt: 'Cartaz A3 da feira de tecnologia, com data, local e contato.',
};

// Espera zerada onde o que se mede é a CONTAGEM de tentativas: um teste não
// precisa esperar para provar que tentou de novo.
const SEM_ESPERA = { retryDelayMs: 0, rateLimitDelayMs: 0, maxRetryWaitMs: 0 };

const respostaCriteria = (pontos = 18) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            scores: CRITERIA.map(({ criterion }) => ({ criterion, points: pontos })),
            feedback: 'Nota do provedor.',
          }),
        }],
      },
    }],
    modelVersion: 'modelo-de-teste',
  }),
});

const respostaClassica = (percent = 77) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ content: { parts: [{ text: JSON.stringify({ percent, explanation: 'Nota do provedor.' }) }] } }],
    modelVersion: 'modelo-de-teste',
  }),
});

const respostaNumerica = (texto = '77.5') => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }], modelVersion: 'modelo-de-teste' }),
});

// Uma falha do provedor como ela chega: status + cabeçalhos.
const falha = (status, cabecalhos = {}) => ({
  ok: false,
  status,
  headers: { get: (nome) => cabecalhos[String(nome).toLowerCase()] ?? null },
});

// Um provedor que devolve a resposta da vez; acabando a fila, repete a última
// (assim uma repetição a mais do que o previsto aparece na contagem).
function provedor(respostas) {
  const chamadas = [];
  return {
    chamadas,
    fetchImpl: async (url) => {
      chamadas.push(String(url));
      return respostas[chamadas.length - 1] ?? respostas[respostas.length - 1];
    },
  };
}

// ---------------------------------------------------------------------------
// A política, isolada
// ---------------------------------------------------------------------------

test('a política separa o passageiro do definitivo: 429 e 5xx se repetem, 4xx de pedido não', () => {
  assert.equal(retryableStatus(429), true, 'cota do provedor é passageira');
  assert.equal(retryableStatus(500), true);
  assert.equal(retryableStatus(503), true);
  assert.equal(retryableStatus(400), false, 'pedido inválido não melhora repetindo');
  assert.equal(retryableStatus(401), false);
  assert.equal(retryableStatus(403), false, 'projeto sem acesso não melhora repetindo');
  assert.equal(retryableStatus(404), false);
  assert.equal(retryableStatus(200), false);
  assert.equal(retryableStatus(undefined), false);
});

test('Retry-After é lido em segundos e como data HTTP; o que não é parseável vale 0', () => {
  const comSegundos = { headers: { get: (nome) => (nome === 'retry-after' ? '7' : null) } };
  assert.equal(retryAfterMs(comSegundos), 7000);

  const quando = new Date(Date.now() + 4000).toUTCString();
  const comData = { headers: { get: (nome) => (nome === 'retry-after' ? quando : null) } };
  assert.ok(Math.abs(retryAfterMs(comData) - 4000) < 1500, `data HTTP -> ${retryAfterMs(comData)}ms`);

  assert.equal(retryAfterMs({ headers: { get: () => 'em breve' } }), 0);
  assert.equal(retryAfterMs({ headers: { get: () => null } }), 0);
  assert.equal(retryAfterMs(undefined), 0, 'resposta sem cabeçalhos não derruba a repetição');
});

test('a espera de 429 é de segundo, a de 5xx é curta, e o Retry-After manda dentro do teto', () => {
  assert.equal(waitBeforeRetry({ attempt: 0, status: 429 }), JUDGE_RETRY_LIMITS.rateLimitDelayMs);
  assert.equal(waitBeforeRetry({ attempt: 0, status: 500 }), JUDGE_RETRY_LIMITS.baseDelayMs);
  assert.equal(waitBeforeRetry({ attempt: 1, status: 500 }), JUDGE_RETRY_LIMITS.baseDelayMs * 2);
  // O provedor sabe quando a cota volta: a espera dele vence a exponencial...
  assert.equal(waitBeforeRetry({ attempt: 0, status: 429, retryAfter: 5000 }), JUDGE_RETRY_LIMITS.maxWaitMs);
  // ...mas não pode segurar a avaliação por uma hora.
  assert.equal(waitBeforeRetry({ attempt: 0, status: 429, retryAfter: 3_600_000 }), JUDGE_RETRY_LIMITS.maxWaitMs);
  // E um Retry-After curto não encurta a espera da família.
  assert.equal(waitBeforeRetry({ attempt: 0, status: 429, retryAfter: 10 }), JUDGE_RETRY_LIMITS.rateLimitDelayMs);
});

test('o prazo da repetição cabe na paciência de quem chama', () => {
  // O navegador do fluxo clássico aborta em 12 s (`public/assets/js/app.js`).
  // Repetir além disso produziria uma falha que o servidor não cometeu.
  assert.ok(CLASSIC_DEADLINE_MS < 12_000, `prazo clássico ${CLASSIC_DEADLINE_MS}ms tem de caber nos 12 s do cliente`);
  assert.equal(SOURCE_COMPATIBLE_CONFIG.deadlineMs, CLASSIC_DEADLINE_MS);
});

test('a repetição só acontece quando HÁ TEMPO para ela', () => {
  // Sem repetição autorizada, não importa o tempo.
  assert.equal(hasTimeForRetry({ attempt: 1, retries: 1 }), false);
  // Com tempo de sobra, repete.
  assert.equal(hasTimeForRetry({ attempt: 0, retries: 1, elapsedMs: 100, waitMs: 1000, attemptTimeoutMs: 8000, deadlineMs: 11_000 }), true);
  // Uma primeira tentativa que já consumiu o prazo não ganha outra: é aqui que
  // se evita a falha enganosa de quem espera menos que o juiz.
  assert.equal(hasTimeForRetry({ attempt: 0, retries: 1, elapsedMs: 8000, waitMs: 150, attemptTimeoutMs: 8000, deadlineMs: 11_000 }), false);
  // Só a ESPERA não cabe, mas o pior caso da próxima tentativa também conta.
  assert.equal(hasTimeForRetry({ attempt: 0, retries: 1, elapsedMs: 0, waitMs: 2000, attemptTimeoutMs: 12_000, deadlineMs: 11_000 }), false);
  // Prazo zero ou negativo significa "sem prazo": quem decide é o `retries`.
  assert.equal(hasTimeForRetry({ attempt: 0, retries: 2, elapsedMs: 999_999, deadlineMs: 0 }), true);
});

test('sem tempo para outra tentativa, o juiz para agora em vez de estourar o prazo', async () => {
  const pro = provedor([falha(429), respostaCriteria(18)]);
  const judge = createFallbackSafeCriteriaJudge({
    apiKey: 'k', model: 'm', fetchImpl: pro.fetchImpl, retries: 1,
    ...SEM_ESPERA,
    // Prazo menor que o pior caso de uma tentativa só: não cabe repetir.
    deadlineMs: 1,
  });

  // Para AGORA, mas nomeando o motivo: quem recebe isto é o servidor, que
  // estaciona a avaliação — não o aluno, que ficaria com uma nota inventada.
  const erro = await capturarErro(() => judge(CRITERIA_INPUT));
  assert.equal(pro.chamadas.length, 1, 'não repetiu quando não havia tempo');
  assert.equal(judgeUnavailable(erro).reason, 'gemini_http_429');
});

// ---------------------------------------------------------------------------
// A afirmação: a cota do provedor não vira nota local
// ---------------------------------------------------------------------------

test('juiz por critérios: um 429 vira nova tentativa, e a nota é a do provedor', async () => {
  const pro = provedor([falha(429, { 'retry-after': '1' }), respostaCriteria(18)]);
  const judge = createCriteriaJudge({ apiKey: 'k', model: 'm', fetchImpl: pro.fetchImpl, retries: 1, ...SEM_ESPERA });

  const resultado = await judge(CRITERIA_INPUT);

  assert.equal(pro.chamadas.length, 2, 'o 429 gerou uma repetição');
  assert.equal(resultado.metadata.provider, 'gemini', 'a nota veio do provedor, não do juiz local');
  assert.equal(resultado.metadata.attempt, 2);
  assert.ok(resultado.percent > 0);
});

test('juiz por critérios no modo com fallback: o local é o último recurso, não o primeiro', async () => {
  const pro = provedor([falha(429), respostaCriteria(18)]);
  const judge = createFallbackSafeCriteriaJudge({ apiKey: 'k', model: 'm', fetchImpl: pro.fetchImpl, retries: 1, ...SEM_ESPERA });

  const resultado = await judge(CRITERIA_INPUT);

  assert.equal(pro.chamadas.length, 2);
  assert.equal(resultado.metadata.provider, 'gemini', 'não caiu no local apesar do 429');
});

test('juiz clássico do pacote-base: o 429 é repetido (antes a primeira falha já virara nota local)', async () => {
  const pro = provedor([falha(429, { 'retry-after': '2' }), respostaNumerica('77.5')]);
  const judge = createSourceCompatibleJudge({ apiKey: 'k', model: 'm', fetchImpl: pro.fetchImpl, retries: 1, ...SEM_ESPERA });

  const resultado = await judge(CLASSIC_INPUT);

  assert.equal(pro.chamadas.length, 2, 'este adaptador não repetia nada antes desta rodada');
  assert.equal(resultado.metadata.fallback_used, false);
  assert.equal(resultado.metadata.provider, 'gemini');
  assert.equal(resultado.metadata.attempt, 2);
  assert.equal(resultado.percent, 77.5);
});

test('juiz clássico estruturado: o 5xx também é repetido antes de qualquer fallback', async () => {
  const pro = provedor([falha(503), respostaClassica(77)]);
  const judge = createGeminiJudge({ apiKey: 'k', model: 'm', fetchImpl: pro.fetchImpl, retries: 1, ...SEM_ESPERA });

  const resultado = await judge(CLASSIC_INPUT);

  assert.equal(pro.chamadas.length, 2);
  assert.equal(resultado.percent, 77);
  assert.equal(resultado.metadata.attempt, 2);
});

test('definitivo não se repete: um 403 do projeto não gasta cota à toa', async () => {
  const pro = provedor([falha(403), respostaCriteria(18)]);
  const judge = createFallbackSafeCriteriaJudge({ apiKey: 'k', model: 'm', fetchImpl: pro.fetchImpl, retries: 1, ...SEM_ESPERA });

  const erro = await capturarErro(() => judge(CRITERIA_INPUT));
  const sinal = judgeUnavailable(erro);

  assert.equal(pro.chamadas.length, 1, '403 é definitivo: repetir só gastaria cota');
  assert.equal(sinal.reason, 'gemini_http_403');
  assert.equal(sinal.status, 403);
  assert.equal(sinal.parkable, true, 'projeto sem acesso é passageiro: o pátio tenta de novo quando o operador consertar');
});

// A afirmação desta rodada, no nível do adaptador: esgotadas as repetições, NÃO
// existe nota local — sai o sinal nomeado que o servidor estaciona. Quem prova
// que a nota chega depois (sem o aluno clicar de novo) é
// `test/api/arena-estacionamento.test.mjs`; aqui se prende que a heurística não
// tem por onde entrar.
test('esgotadas as repetições, sai o sinal do pátio — nunca uma nota local', async () => {
  const pro = provedor([falha(429)]);
  const judge = createFallbackSafeCriteriaJudge({ apiKey: 'k', model: 'm', fetchImpl: pro.fetchImpl, retries: 2, ...SEM_ESPERA });

  const erro = await capturarErro(() => judge(CRITERIA_INPUT));
  const sinal = judgeUnavailable(erro);

  assert.equal(pro.chamadas.length, 3, 'uma tentativa mais duas repetições');
  assert.equal(sinal.reason, 'gemini_http_429', 'o motivo nomeia o último status, não a classe do erro');
  assert.equal(sinal.parkable, true);
  assert.equal(erro.metadata, undefined, 'e não há resultado de nota nenhum a ser gravado');
});

// ---------------------------------------------------------------------------
// O teto é da avaliação, não da tentativa
// ---------------------------------------------------------------------------

test('o teto conta a AVALIAÇÃO: repetir não gasta dois lugares da cota da hora', async () => {
  const pro = provedor([falha(429), respostaNumerica('77.5')]);
  const judges = createJudges({
    mode: 'gemini',
    apiKey: 'k',
    model: 'm',
    fetchImpl: pro.fetchImpl,
    ...SEM_ESPERA,
    budgetLimits: { perHour: 1, maxConcurrent: 1, maxQueued: 1 },
  });

  const resultado = await judges.classicJudge(CLASSIC_INPUT);

  assert.equal(resultado.metadata.fallback_used, false, 'a nota veio do provedor depois da repetição');
  assert.equal(pro.chamadas.length, 2, 'duas chamadas HTTP ao provedor');
  assert.equal(judges.budget.state().spent_last_hour, 1, 'e um único lugar no orçamento da hora');
});
