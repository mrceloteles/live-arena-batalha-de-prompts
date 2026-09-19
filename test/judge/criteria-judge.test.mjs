import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCriteriaJudge, createFallbackSafeCriteriaJudge,
  fallbackCriteriaBreakdown, fallbackCriteriaResult, fallbackFeedback,
  isUnreadableText,
} from '../../src/judge/criteria-judge.mjs';
import { judgeUnavailable } from '../../src/judge/failure.mjs';

const CRITERIA = [
  { criterion: 'objetivo', weight: 30 },
  { criterion: 'contexto', weight: 25 },
  { criterion: 'publico', weight: 20 },
  { criterion: 'formato', weight: 15 },
  { criterion: 'restricoes', weight: 10 },
];

const INPUT = {
  mission: 'Crie um cartaz para a feira de tecnologia da escola.',
  context: 'Feira anual de projetos do ensino medio, cartazes serao pendurados no corredor.',
  referenceText: 'feira de tecnologia, estudantes do ensino medio, cartaz impresso',
  expectedResult: 'Cartaz A3 impresso, chamativo para adolescentes.',
  criteria: CRITERIA,
};

test('fallback differentiates a complete prompt from a vague one', () => {
  const good = fallbackCriteriaResult({
    ...INPUT,
    candidatePrompt: 'Crie um cartaz vibrante para a feira de tecnologia da escola, em formato A3 impresso, para estudantes do ensino médio, com cores fortes e sem texto pequeno.',
  }, CRITERIA, 'test');
  const bad = fallbackCriteriaResult({
    ...INPUT,
    candidatePrompt: 'faça um site bonito sobre carros',
  }, CRITERIA, 'test');

  assert.ok(good.percent > bad.percent + 30, `good=${good.percent} bad=${bad.percent}`);
  assert.ok(good.percent >= 50 && good.percent <= 100);
  assert.ok(bad.percent < 50);
  assert.equal(typeof good.feedback, 'string');
  assert.ok(good.feedback.trim().length > 0);
  assert.equal(good.metadata.provider, 'fallback');
});

test('fallback breakdown covers every requested criterion with 0..20 points', () => {
  const breakdown = fallbackCriteriaBreakdown({ ...INPUT, candidatePrompt: 'Crie um cartaz para adolescentes.' });
  for (const entry of CRITERIA) {
    assert.ok(Number.isFinite(breakdown[entry.criterion]), entry.criterion);
    assert.ok(breakdown[entry.criterion] >= 0 && breakdown[entry.criterion] <= 20, entry.criterion);
  }
});

test('teclado socado nao compra pontos: texto ilegivel zera e avisa o jogador', () => {
  const junk = [
    'asdasdasdasdasdasdasdasdasdasdasd',
    'asd asd kkkk pqp aaaa ssss dddd ffff',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'dskljhgsdfgkljhsdfgkljhsdfgkkkkkk',
    'aeiou aeaeae ?????',
  ];
  for (const candidatePrompt of junk) {
    assert.equal(isUnreadableText(candidatePrompt), true, candidatePrompt);
    const result = fallbackCriteriaResult({ ...INPUT, candidatePrompt }, CRITERIA, 'test');
    assert.equal(result.percent, 0, `percent de "${candidatePrompt}"`);
    for (const entry of CRITERIA) assert.equal(result.breakdown[entry.criterion], 0, entry.criterion);
    assert.equal(result.metadata.unreadable_text, true);
    assert.match(result.feedback, /entender/i);
  }
  // Texto legivel (mesmo vago) segue sendo avaliado normalmente.
  assert.equal(isUnreadableText('faça um site bonito sobre carros'), false);
  assert.equal(isUnreadableText('cartaz A3 para a feira'), false);
});

test('texto ilegivel nem chega ao provedor (economiza cota)', async () => {
  let calls = 0;
  const judge = createCriteriaJudge({
    apiKey: 'key',
    fetchImpl: async () => { calls += 1; throw new Error('should not be called'); },
  });
  const result = await judge({ ...INPUT, candidatePrompt: 'asdasdasdasdasdasdasdasdasd' });
  assert.equal(calls, 0);
  assert.equal(result.percent, 0);
  assert.equal(result.metadata.fallback_reason, 'unreadable_text');
  assert.equal(result.metadata.unreadable_text, true);
});

test('sem piso de graca: prompt curto vale menos que prompt completo', () => {
  const short = fallbackCriteriaResult({ ...INPUT, candidatePrompt: 'cartaz' }, CRITERIA, 'test');
  const vague = fallbackCriteriaResult({ ...INPUT, candidatePrompt: 'faça um cartaz' }, CRITERIA, 'test');
  const complete = fallbackCriteriaResult({
    ...INPUT,
    candidatePrompt: 'Crie um cartaz vibrante para a feira de tecnologia da escola, em formato A3 impresso, para estudantes do ensino médio, com cores fortes e sem texto pequeno.',
  }, CRITERIA, 'test');
  assert.ok(short.percent < 15, `short=${short.percent}`);
  assert.ok(vague.percent < 30, `vague=${vague.percent}`);
  assert.ok(complete.percent > vague.percent + 25, `complete=${complete.percent} vague=${vague.percent}`);
});

test('feedback is short and actionable', () => {
  const feedback = fallbackFeedback({ objetivo: 18, contexto: 6, publico: 14, formato: 10, restricoes: 5 });
  assert.ok(feedback.length < 300);
  assert.match(feedback, /contexto|formato|restricoes|público/i);
  const excellent = fallbackFeedback({ objetivo: 19, contexto: 18, publico: 17, formato: 19, restricoes: 18 });
  assert.match(excellent, /Excelente/i);
});

test('createCriteriaJudge without a key returns the fallback result', async () => {
  const judge = createCriteriaJudge({ fetchImpl: async () => { throw new Error('should not be called'); } });
  const result = await judge({ ...INPUT, candidatePrompt: 'Crie um cartaz completo para a feira, formato A3, para alunos.' });
  assert.equal(result.metadata.provider, 'fallback');
  assert.equal(result.metadata.fallback_reason, 'gemini_api_key_missing');
});

test('createCriteriaJudge repete 429 e 5xx antes de desistir', async () => {
  let calls = 0;
  const judge = createCriteriaJudge({
    apiKey: 'key',
    retries: 2,
    // O que se prova aqui e a CONTAGEM de tentativas, nao a espera.
    retryDelayMs: 0,
    rateLimitDelayMs: 0,
    maxRetryWaitMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 429 };
    },
  });
  await assert.rejects(() => judge({ ...INPUT, candidatePrompt: 'prompt' }), /HTTP 429/);
  // Uma tentativa mais as repeticoes. Antes de 17/09/2026 era 1: o 429 entregava
  // a nota heuristica na primeira resposta do provedor (medido: 6 de 6).
  assert.equal(calls, 3, '429 deve ser re-tentado ate o limite de repeticoes');
});

// A sala NÃO fica travada por falha do provedor — mas quem a destrava é o
// PÁTIO (`parking.mjs`), que reprocessa e entrega a nota do provedor, e não uma
// heurística de consolo. Aqui o que se prende é o sinal: o juiz diz que o
// provedor está indisponível, em vez de inventar uma nota com cara de avaliada.
// O caminho completo (nota que chega sozinha, sem segundo clique do aluno) tem
// teste próprio em `test/api/arena-estacionamento.test.mjs`.
test('falha do provedor sai como indisponibilidade para o pátio, não como nota heurística', async () => {
  const judge = createFallbackSafeCriteriaJudge({
    apiKey: 'key',
    fetchImpl: async () => { throw new Error('network down'); },
  });
  await assert.rejects(
    () => judge({ ...INPUT, candidatePrompt: 'Crie um cartaz para a feira, em formato A3, para adolescentes, sem texto pequeno.' }),
    (error) => {
      const falha = judgeUnavailable(error);
      assert.ok(falha, `deveria sair como indisponibilidade (saiu: ${error?.name})`);
      assert.equal(falha.parkable, true, 'estacionável: a avaliação é reprocessada depois');
      return true;
    },
  );
});

// O comportamento antigo não sumiu — virou opt-in explícito. Quem escreve
// `onProviderFailure: 'fallback'` está escolhendo a heurística marcada, e não
// caindo nela por esquecimento do parâmetro.
test('com opt-in explícito, a heurística marcada continua respondendo por falha do provedor', async () => {
  const judge = createFallbackSafeCriteriaJudge({
    apiKey: 'key',
    onProviderFailure: 'fallback',
    fetchImpl: async () => { throw new Error('network down'); },
  });
  const result = await judge({ ...INPUT, candidatePrompt: 'Crie um cartaz para a feira, em formato A3, para adolescentes, sem texto pequeno.' });
  assert.equal(result.metadata.provider, 'fallback');
  assert.equal(result.metadata.judge_failed, true);
  assert.equal(result.metadata.model, 'arena-fallback-v1', 'a nota local é marcada como local');
  assert.ok(Number.isFinite(result.percent));
  assert.equal(typeof result.feedback, 'string');
});

test('reference image never travels to Gemini: the judge call is text-only', async () => {
  const secret = 'ZTRjMWNhZmUwMDAwMDAwMA';
  const image = `data:image/png;base64,${secret}`;
  const sent = [];
  const fetchImpl = async (_url, options) => {
    sent.push(options.body);
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          scores: CRITERIA.map((entry) => ({ criterion: entry.criterion, points: 10 })),
          feedback: 'Ok.',
        }) }] } }],
      }),
    };
  };

  const judge = createCriteriaJudge({ apiKey: 'key', fetchImpl });
  await judge({ ...INPUT, candidatePrompt: 'prompt legivel', referenceImage: image });

  const parts = JSON.parse(sent[0]).contents[0].parts;
  assert.equal(parts.some((part) => part.inlineData), false, 'nenhuma imagem embutida');
  assert.equal(sent[0].includes(secret), false, 'os bytes da imagem nao podem aparecer no corpo');
  assert.equal(sent[0].includes('data:image'), false, 'nem a data URL da imagem');
  assert.equal(parts.length, 1, 'uma unica parte de texto');
});

test('gemini path parses structured scores when the API responds', async () => {
  const judge = createCriteriaJudge({
    apiKey: 'key',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          scores: [
            { criterion: 'objetivo', points: 18 },
            { criterion: 'contexto', points: 14 },
            { criterion: 'publico', points: 16 },
            { criterion: 'formato', points: 12 },
            { criterion: 'restricoes', points: 10 },
          ],
          feedback: 'Bom objetivo, mas defina melhor o formato.',
        }) }] } }],
        modelVersion: 'test-model',
      }),
    }),
  });
  const result = await judge({ ...INPUT, candidatePrompt: 'prompt' });
  assert.equal(result.metadata.provider, 'gemini');
  assert.equal(result.breakdown.objetivo, 18);
  assert.equal(result.metadata.modelVersion, 'test-model');
  // ponderado: (18*30 + 14*25 + 16*20 + 12*15 + 10*10) / (100*20)
  const expected = (18 * 30 + 14 * 25 + 16 * 20 + 12 * 15 + 10 * 10) / (100 * 20) * 100;
  assert.equal(result.percent, Math.round(expected * 100) / 100);
});