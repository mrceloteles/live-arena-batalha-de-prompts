import assert from 'node:assert/strict';
import { test } from 'node:test';

import { JudgeBudgetError, budgetRejection, createJudgeBudget } from '../../src/judge/budget.mjs';
import { createJudges, JUDGE_LIMITS } from '../../src/judge/configuration.mjs';

// O defeito medido: "várias avaliações simultâneas não têm teto global". Trinta
// e cinco alunos enviando juntos eram trinta e cinco chamadas ao Gemini sem
// nenhum teto — nem de concorrência, nem de cota, nem de fila.
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('nenhuma avaliação começa antes de o teto de concorrência liberar', async () => {
  const budget = createJudgeBudget({ maxConcurrent: 2, perHour: 100, maxQueued: 50 });
  let emVoo = 0;
  let pico = 0;
  const tarefa = () => async () => {
    emVoo += 1;
    pico = Math.max(pico, emVoo);
    await dormir(20);
    emVoo -= 1;
    return 'ok';
  };
  const resultados = await Promise.all(Array.from({ length: 6 }, (_, indice) => budget.run(tarefa(), { indice })));
  assert.deepEqual(resultados, ['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
  assert.equal(pico, 2, `o pico de avaliacoes simultaneas respeitou o teto (pico: ${pico})`);
  assert.deepEqual(budget.state(), {
    active: 0, queued: 0, concurrency: 2, per_hour: 100, spent_last_hour: 6, remaining_last_hour: 94,
  });
});

test('a fila tem fundo: além dela a recusa é recuperável, com tempo de espera', async () => {
  const budget = createJudgeBudget({ maxConcurrent: 1, perHour: 100, maxQueued: 0 });
  let liberar;
  const segurando = budget.run(() => new Promise((resolve) => { liberar = resolve; }));
  await dormir(5);

  await assert.rejects(
    budget.run(async () => 'nunca'),
    (error) => {
      assert.equal(error instanceof JudgeBudgetError, true);
      assert.equal(error.code, 'judge_budget');
      assert.equal(error.reason, 'fila_cheia');
      assert.ok(error.retryAfterSeconds >= 1, 'diz quanto esperar');
      return true;
    },
  );
  assert.equal(budget.state().active, 1);
  liberar('liberado');
  assert.equal(await segurando, 'liberado');
  assert.equal(budget.state().active, 0);
});

test('o orçamento da hora é gasto por avaliação, não por requisição ao provedor', async () => {
  const budget = createJudgeBudget({ maxConcurrent: 4, perHour: 2, maxQueued: 10 });
  // Duas avaliacoes, a primeira com uma repeticao interna (erro 500 do provedor).
  let tentativasRede = 0;
  const avaliacaoComRepeticao = () => budget.run(async () => {
    for (let tentativa = 0; tentativa < 2; tentativa += 1) { tentativasRede += 1; }
    return 'nota';
  });
  assert.equal(await avaliacaoComRepeticao(), 'nota');
  assert.equal(await budget.run(async () => 'nota'), 'nota');
  assert.equal(tentativasRede, 2, 'duas tentativas de rede couberam em UMA avaliacao');
  assert.equal(budget.state().spent_last_hour, 2);

  await assert.rejects(
    budget.run(async () => 'nunca'),
    (error) => {
      assert.equal(error.reason, 'orcamento_esgotado');
      assert.ok(error.retryAfterSeconds >= 1);
      return true;
    },
  );
});

test('a janela da hora anda com o relógio: o que saiu da janela devolve o lugar', async () => {
  let agora = 1_000_000;
  const budget = createJudgeBudget({ maxConcurrent: 2, perHour: 2, now: () => agora });
  await budget.run(async () => 1);
  await budget.run(async () => 2);
  await assert.rejects(budget.run(async () => 3), /Orçamento/);

  agora += 60 * 60 * 1000 + 1;
  assert.equal(await budget.run(async () => 4), 4, 'a hora seguinte tem orçamento novo');
  assert.equal(budget.state().spent_last_hour, 1);
});

test('a recusa vira resposta recuperável, com a tentativa preservada', () => {
  const fila = budgetRejection(new JudgeBudgetError('cheia', { reason: 'fila_cheia', retryAfterSeconds: 7 }));
  assert.equal(fila.status, 503);
  assert.equal(fila.retryAfter, 7);
  assert.match(fila.message, /fila de avaliacoes esta cheia/i);
  assert.match(fila.message, /mesma avaliacao/);

  const cota = budgetRejection(new JudgeBudgetError('cota', { reason: 'orcamento_esgotado', retryAfterSeconds: 120 }));
  assert.equal(cota.status, 503);
  assert.match(cota.message, /limite de avaliacoes externas desta hora/);

  assert.equal(budgetRejection(new Error('falha do provedor')), null, 'erro de outro tipo nao e recusa de teto');
  assert.equal(budgetRejection(undefined), null);
});

test('modo fallback não tem teto; os modos com rede têm, e o teto é do processo', async () => {
  const semRede = createJudges({ mode: 'fallback' });
  assert.equal(semRede.budget, null, 'sem rede nao ha o que limitar');

  const comRede = createJudges({ mode: 'gemini', apiKey: 'chave', fetchImpl: async () => { throw new Error('sem rede'); } });
  assert.ok(comRede.budget, 'modo com rede cria o teto');
  assert.deepEqual(comRede.budget.limits, {
    maxConcurrent: JUDGE_LIMITS.maxConcurrent,
    perHour: JUDGE_LIMITS.perHour,
    maxQueued: JUDGE_LIMITS.maxQueued,
  });

  // O teto vale para as DUAS familias: uma avaliacao classica e uma por
  // criterios do mesmo processo dividem a mesma cota.
  const limites = createJudgeBudget({ maxConcurrent: 4, perHour: 1 });
  const duas = createJudges({ mode: 'gemini', apiKey: 'chave', budget: limites, fetchImpl: async () => { throw new Error('sem rede'); } });
  assert.equal(duas.budget, limites, 'o teto injetado e o usado');
  await duas.classicJudge({ referencePrompt: 'a', rubric: 'b', candidatePrompt: 'c' });
  await assert.rejects(
    duas.criteriaJudge({
      mission: 'm', candidatePrompt: 'prompt de verdade com palavras', criteria: [{ criterion: 'objetivo', weight: 100 }],
    }),
    (error) => error.code === 'judge_budget',
    'a cota da hora e do processo, nao de cada familia',
  );
});

test('a recusa do teto não vira nota local no modo gemini', async () => {
  // A promessa do modo `gemini` e cair no fallback quando o PROVEDOR falha. Um
  // pico de fila nao e falha do provedor: comprar uma nota heuristica
  // permanente por um problema passageiro seria pior que pedir para repetir.
  const limites = createJudgeBudget({ maxConcurrent: 1, perHour: 1, maxQueued: 0 });
  const judges = createJudges({
    mode: 'gemini',
    apiKey: 'chave',
    budget: limites,
    fetchImpl: async () => { throw new Error('sem rede'); },
  });
  let liberar;
  const ocupando = limites.run(() => new Promise((resolve) => { liberar = resolve; }));
  await dormir(5);

  await assert.rejects(
    judges.criteriaJudge({
      mission: 'Escreva um cartaz.', candidatePrompt: 'Crie um cartaz A3 com data e local.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
    }),
    (error) => error.code === 'judge_budget',
  );
  await assert.rejects(
    judges.classicJudge({ referencePrompt: 'Cartaz A3', rubric: 'objetivo', candidatePrompt: 'Cartaz A3' }),
    (error) => error.code === 'judge_budget',
  );
  liberar('fim');
  await ocupando;
});
