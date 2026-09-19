import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createJudges, CRITERIA_JUDGE_LIMITS } from '../../src/judge/configuration.mjs';
import { judgeUnavailable } from '../../src/judge/failure.mjs';
import { JudgeCancelledError } from '../../src/judge/gemini-judge.mjs';
import { ArenaJudgeCancelledError } from '../../src/judge/criteria-judge.mjs';

// O defeito medido: no encerramento, uma avaliacao em voo no Gemini continuava
// esperando ate o proprio timeout do adaptador (12 a 15 s) — mais que o prazo
// combinado com o host. A instancia era morta no meio da avaliacao, e o que
// sobrava era um envio sem nota ou um "timeout" que nunca foi timeout.
//
// O que estes casos prendem:
//   - o sinal de fora derruba a chamada em voo, e RAPIDO;
//   - cancelamento NAO se repete (repetir depois do "pare" e o oposto do pedido);
//   - cancelamento tem nome diferente de tempo esgotado — o relatorio distingue;
//   - nos dois modos o cancelamento NAO vira nota heuristica: `gemini-safe`
//     propaga o cancelamento, e `gemini` (desde 17/09/2026) tambem — uma nota
//     local ali seria uma nota que ninguem avaliou.
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Um `fetch` que fica pendurado ate' alguem abortar (como o de verdade). */
function fetchPendurado(chamadas) {
  return (_url, options) => new Promise((_resolve, reject) => {
    chamadas.total += 1;
    options.signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    }, { once: true });
  });
}

/** Entrada valida da familia classica (o contrato exige os tres campos). */
function entradaClassica() {
  return {
    referencePrompt: 'Cartaz A3 para a feira de ciencias de 2026, com data, local e contato.',
    rubric: 'Objetivo claro; contexto da feira; formato do cartaz.',
    candidatePrompt: 'Crie um cartaz A3 para a feira de ciencias de 2026, com data, local e contato.',
  };
}

function entradaCriteria() {
  return {
    mission: 'Escreva o prompt de um cartaz da feira de ciências.',
    candidatePrompt: 'Crie um cartaz A3 para a feira de ciências de 2026.',
    criteria: [{ criterion: 'objetivo', weight: 60 }, { criterion: 'contexto', weight: 40 }],
  };
}

function medir(ms = 2_000) {
  const inicio = Date.now();
  return { decorrido: () => Date.now() - inicio, prazo: ms };
}

test('o cancelamento derruba a chamada em voo do juiz clássico, sem repetir', async () => {
  const chamadas = { total: 0 };
  const controller = new AbortController();
  const judges = createJudges({
    mode: 'gemini-safe',
    apiKey: 'chave-de-teste',
    fetchImpl: fetchPendurado(chamadas),
    signal: controller.signal,
    // Sem cancelamento, este caso esperaria 800 ms por tentativa. O prazo aqui
    // e o do cancelamento, nao o do adaptador.
    timeoutMs: 800,
  });
  const relogio = medir();
  const avaliacao = judges.classicJudge(entradaClassica());
  await dormir(30);
  controller.abort();

  await assert.rejects(avaliacao, (error) => {
    assert.equal(error.name, 'JudgeCancelledError');
    assert.equal(error instanceof JudgeCancelledError, true);
    assert.equal(error.cancelled, true);
    // Nao e tempo esgotado: quem mandou parar foi o encerramento.
    assert.notEqual(error.name, 'JudgeTimeoutError');
    return true;
  });
  assert.ok(relogio.decorrido() < relogio.prazo, `resolveu em ${relogio.decorrido()}ms depois do cancelamento`);
  assert.equal(chamadas.total, 1, 'cancelar nao dispara uma segunda tentativa');
});

test('o cancelamento derruba a chamada em voo do juiz por critérios, sem repetir', async () => {
  const chamadas = { total: 0 };
  const controller = new AbortController();
  const judges = createJudges({
    mode: 'gemini-safe',
    apiKey: 'chave-de-teste',
    fetchImpl: fetchPendurado(chamadas),
    signal: controller.signal,
    timeoutMs: 800,
  });
  const relogio = medir();
  const avaliacao = judges.criteriaJudge(entradaCriteria());
  await dormir(30);
  controller.abort();

  await assert.rejects(avaliacao, (error) => {
    assert.equal(error instanceof ArenaJudgeCancelledError, true);
    assert.equal(error.cancelled, true);
    return true;
  });
  assert.ok(relogio.decorrido() < relogio.prazo);
  assert.equal(chamadas.total, 1);
});

test('sinal já abortado não chega a chamar o provedor', async () => {
  const chamadas = { total: 0 };
  const controller = new AbortController();
  controller.abort();
  const judges = createJudges({
    mode: 'gemini-safe',
    apiKey: 'chave-de-teste',
    fetchImpl: fetchPendurado(chamadas),
    signal: controller.signal,
  });
  await assert.rejects(judges.classicJudge(entradaClassica()), /cancel/i);
  await assert.rejects(judges.criteriaJudge(entradaCriteria()), /cancel/i);
  assert.equal(chamadas.total, 0, 'nenhuma chamada externa depois do encerramento');
});

test('no modo gemini, o cancelamento tambem nao vira nota heuristica — e nao se estaciona', async () => {
  // O que mudou (17/09/2026): o modo `gemini` nao inventa mais nota quando o
  // provedor nao entregou. No encerramento isso vale igual — a fila de
  // reprocessamento vive na memoria deste processo, que esta saindo, entao
  // estacionar seria prometer uma nota que ninguem vai calcular. O desfecho e
  // explicito (e nao-parkavel), e a submissao segue sem nota, recuperavel pelo
  // reenvio do proprio aluno.
  const chamadas = { total: 0 };
  const controller = new AbortController();
  const judges = createJudges({
    mode: 'gemini',
    apiKey: 'chave-de-teste',
    fetchImpl: fetchPendurado(chamadas),
    signal: controller.signal,
    timeoutMs: 800,
  });
  assert.equal(judges.mode, 'gemini');

  const classica = judges.classicJudge(entradaClassica());
  const porCriterios = judges.criteriaJudge(entradaCriteria());
  await dormir(30);
  const relogio = medir();
  controller.abort();

  for (const avaliacao of [classica, porCriterios]) {
    await assert.rejects(avaliacao, (error) => {
      assert.equal(error.cancelled, true, 'quem parou foi o encerramento, e o erro diz isso');
      const falha = judgeUnavailable(error);
      assert.equal(falha.parkable, false, 'cancelamento nao se reprocessa: a fila morre com o processo');
      assert.equal(falha.reason, 'gemini_cancelled');
      return true;
    });
  }
  assert.ok(relogio.decorrido() < relogio.prazo, 'saiu na hora, sem esperar o timeout');
  assert.equal(chamadas.total, 2, 'uma chamada por familia, nenhuma repetida');
});

test('sem sinal, o comportamento é o de sempre: o adaptador continua estourando o próprio prazo', async () => {
  const chamadas = { total: 0 };
  const judges = createJudges({
    mode: 'gemini-safe',
    apiKey: 'chave-de-teste',
    fetchImpl: fetchPendurado(chamadas),
    timeoutMs: 60,
    retries: 0,
  });
  await assert.rejects(
    judges.criteriaJudge(entradaCriteria()),
    (error) => error.name === 'ArenaJudgeTimeoutError',
  );
  assert.equal(CRITERIA_JUDGE_LIMITS.timeoutMs, 12_000, 'os limites de producao nao mudaram por causa do sinal');
});
