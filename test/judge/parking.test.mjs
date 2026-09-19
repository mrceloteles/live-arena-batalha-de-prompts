// O pátio das avaliações que o provedor não entregou.
//
// O que estes casos prendem, e por quê:
//   - a MESMA submissão não gera duas tentativas em paralelo (o aluno repete o
//     envio, o pátio já tem a chave: o custo da avaliação não dobra);
//   - o teto de tentativas existe: sem ele, uma chave revogada tentaria para
//     sempre — e o que passa do teto fica CONTADO (`exhausted`), não escondido;
//   - a espera cresce e respeita o `Retry-After` do provedor, com teto (um
//     `Retry-After: 3600` não pode segurar a avaliação por uma hora);
//   - cancelamento (encerramento) não se reprocessa: a fila vive na memória
//     deste processo, que está saindo;
//   - `stop()` para de agendar, e é isso que o encerramento chama.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { JUDGE_PARK_LIMITS, createEvaluationParking, waitBeforeReprocess } from '../../src/judge/parking.mjs';

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Esperas curtas: o que se mede é a ORDEM e a CONTAGEM das tentativas, não o
// relógio. O que o teste não pode fazer é esperar segundos para provar isso.
const RAPIDO = { baseDelayMs: 1, maxDelayMs: 5 };

test('a espera cresce por tentativa e respeita o teto, inclusive contra o Retry-After', () => {
  assert.equal(waitBeforeReprocess({ attempt: 1, ...RAPIDO }), 1);
  assert.equal(waitBeforeReprocess({ attempt: 2, ...RAPIDO }), 2);
  assert.equal(waitBeforeReprocess({ attempt: 3, ...RAPIDO }), 4);
  // O teto vale para as duas: nem a exponencial o ultrapassa...
  assert.equal(waitBeforeReprocess({ attempt: 9, ...RAPIDO }), 5);
  // ...nem a espera que o provedor pediu (uma hora não pode segurar a avaliação).
  assert.equal(waitBeforeReprocess({ attempt: 1, retryAfterMs: 3_600_000, ...RAPIDO }), 5);
  // E o Retry-After maior que a exponencial vence, dentro do teto.
  assert.equal(waitBeforeReprocess({ attempt: 1, retryAfterMs: 4, ...RAPIDO }), 4);
  assert.deepEqual(JUDGE_PARK_LIMITS, { maxAttempts: 4, baseDelayMs: 5_000, maxDelayMs: 60_000 });
});

test('o pátio tenta de novo, entrega a nota e conta o que resolveu', async () => {
  const tentativas = [];
  const pátio = createEvaluationParking({ ...RAPIDO, maxAttempts: 3 });
  pátio.park({
    key: 'submissao-1',
    roomId: 'sala-1',
    reason: 'gemini_http_503',
    task: async ({ attempt }) => {
      tentativas.push(attempt);
      if (attempt < 2) throw new Error('provedor indisponível');
      return 'nota';
    },
  });

  assert.equal(pátio.state().parked, 1, 'a avaliação entra no pátio antes de qualquer nova tentativa');
  await pátio.idle();

  assert.deepEqual(tentativas, [1, 2], 'duas tentativas: a espera não é opcional');
  const estado = pátio.state();
  assert.equal(estado.resolved, 1);
  assert.equal(estado.exhausted, 0);
  assert.equal(estado.parked, 0);
  assert.equal(estado.next_retry_ms, null, 'pátio vazio não promete próxima tentativa');
});

test('passado o teto, a avaliação fica sem nota e o pátio CONTA isso', async () => {
  const tentativas = [];
  const eventos = [];
  const pátio = createEvaluationParking({
    ...RAPIDO,
    maxAttempts: 2,
    log: (evento, dados) => eventos.push({ evento, dados }),
  });
  pátio.park({
    key: 'submissao-2',
    roomId: 'sala-1',
    reason: 'gemini_http_429',
    task: async ({ attempt }) => {
      tentativas.push(attempt);
      throw new Error(`indisponível (${attempt})`);
    },
  });

  await pátio.idle();

  assert.deepEqual(tentativas, [1, 2], 'não insiste além do teto');
  const estado = pátio.state();
  assert.equal(estado.exhausted, 1, 'a desistência aparece no estado (é o que a prontidão mostra)');
  assert.equal(estado.resolved, 0);
  assert.equal(estado.parked, 0);
  assert.deepEqual(
    eventos.map(({ evento }) => evento),
    ['judge_parked', 'judge_park_retry', 'judge_park_exhausted'],
    'cada passo deixa rastro: entrou, tentou de novo, desistiu',
  );
  assert.equal(eventos.at(-1).dados.attempts, 2);
});

test('a mesma chave não vira duas avaliações em paralelo', async () => {
  let chamadas = 0;
  const pátio = createEvaluationParking({ ...RAPIDO, maxAttempts: 2 });
  const tarefa = async () => { chamadas += 1; await dormir(20); throw new Error('indisponível'); };

  const primeira = pátio.park({ key: 'mesma', roomId: 'sala-1', task: tarefa });
  // O aluno repetiu o envio, ou o servidor tentou estacionar de novo no mesmo
  // clinte: a resposta é a entrada que já existe.
  const segunda = pátio.park({ key: 'mesma', roomId: 'sala-1', task: tarefa });
  assert.equal(segunda, primeira, 'estacionar duas vezes devolve a MESMA entrada');

  await pátio.idle();
  assert.equal(chamadas, 2, 'duas tentativas (o teto), não quatro');
  assert.equal(pátio.state().exhausted, 1);
});

// A retomada: as tentativas gastas por um processo que morreu continuam gastas.
// É o que impede um laço de reinícios de dar ao provedor um punhado novo de
// tentativas a cada subida.
test('avaliação retomada do banco continua de onde parou', async () => {
  const tentativas = [];
  const pátio = createEvaluationParking({ ...RAPIDO, maxAttempts: 3 });
  pátio.park({
    key: 'submissao-retomada',
    roomId: 'sala-1',
    reason: 'retomada',
    attemptsSoFar: 2,
    task: async ({ attempt }) => { tentativas.push(attempt); return 'nota'; },
  });

  await pátio.idle();

  assert.deepEqual(tentativas, [3], 'a tentativa retomada é a terceira, não a primeira');
  assert.equal(pátio.state().resolved, 1);
});

test('o rearme dá UMA tentativa: a entrada rearmada não ganha um surto novo', async () => {
  const tentativas = [];
  const pátio = createEvaluationParking({ ...RAPIDO, maxAttempts: 4 });
  pátio.park({
    key: 'rearmada',
    roomId: 'sala-1',
    reason: 'vigia_rearme',
    attemptsSoFar: 4,
    attemptsAllowed: 5,
    task: async ({ attempt }) => { tentativas.push(attempt); throw new Error('ainda fora'); },
  });

  await pátio.idle();

  assert.deepEqual(tentativas, [5], 'uma tentativa, não quatro: o vigia não é um surto novo');
  assert.equal(pátio.state().exhausted, 1);
});

test('retomada com o teto já gasto não chama a tarefa: desiste e conta', async () => {
  let chamou = false;
  const pátio = createEvaluationParking({ ...RAPIDO, maxAttempts: 2 });
  pátio.park({
    key: 'submissao-teto',
    roomId: 'sala-1',
    reason: 'retomada',
    attemptsSoFar: 2,
    task: async () => { chamou = true; return 'nota'; },
  });

  await pátio.idle();

  assert.equal(chamou, false, 'nada foi tentado: o teto já tinha sido gasto antes deste processo');
  const estado = pátio.state();
  assert.equal(estado.exhausted, 1, 'e isso aparece no estado, não em silêncio');
  assert.equal(estado.parked, 0);
});

test('cancelamento (encerramento) não se reprocessa', async () => {
  const tentativas = [];
  const pátio = createEvaluationParking({ ...RAPIDO, maxAttempts: 5 });
  pátio.park({
    key: 'submissao-3',
    task: async ({ attempt }) => {
      tentativas.push(attempt);
      throw Object.assign(new Error('encerrando'), { cancelled: true });
    },
  });

  await pátio.idle();

  assert.deepEqual(tentativas, [1], 'parou na primeira: a fila morre com o processo');
  const estado = pátio.state();
  assert.equal(estado.cancelled, 1);
  assert.equal(estado.exhausted, 0, 'cancelar não é desistir por tentativas');
});

test('quem estacionou é avisado a cada desfecho, e a espera do provedor chega ao agendamento', async () => {
  const avisos = [];
  const pátio = createEvaluationParking({ baseDelayMs: 1, maxDelayMs: 60_000, maxAttempts: 1 });
  pátio.park({
    key: 'submissao-4',
    roomId: 'sala-1',
    retryAfterMs: 5_000,
    onSettled: (entrada, erro) => avisos.push({ key: entrada.key, falhou: Boolean(erro) }),
    task: async () => { throw new Error('indisponível'); },
  });

  // O provedor disse quanto esperar: a primeira tentativa respeita isso (e não a
  // exponencial de 1 ms do teste).
  assert.ok(pátio.state().next_retry_ms > 4_000, `espera lida do provedor (leu ${pátio.state().next_retry_ms}ms)`);
  pátio.stop();
  assert.equal(pátio.state().parked, 0);
  await pátio.idle();
});

test('stop() para de agendar: o encerramento não pode deixar trabalho prometido', async () => {
  let tentou = false;
  const pátio = createEvaluationParking({ baseDelayMs: 50, maxDelayMs: 50, maxAttempts: 3 });
  pátio.park({ key: 'submissao-5', task: async () => { tentou = true; return 'nota'; } });

  pátio.stop();
  await dormir(80);

  assert.equal(tentou, false, 'nada tentou depois do stop');
  assert.equal(pátio.state().parked, 0);
  await pátio.idle();
});
