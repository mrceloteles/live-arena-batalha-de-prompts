import assert from 'node:assert/strict';
import test from 'node:test';

import { createSourceCompatibleJudge, SOURCE_COMPATIBLE_CONFIG } from '../../src/judge/source-compatible-judge.mjs';
import { sourceFallbackPercent } from '../../src/judge/fake-judge.mjs';
import { judgeUnavailable } from '../../src/judge/failure.mjs';

const input = {
  referencePrompt: 'Um astronauta flutuando no espaço sideral com a Terra refletida no capacete, iluminação dramática de cinema, estilo fotorrealista 8k, lentes anamórficas e cores neon sutis.',
  rubric: 'rubrica moderna não deve alterar o prompt histórico',
  candidatePrompt: 'Astronauta no espaco com capacete refletivo e luz neon dramatica 8k',
  image: '/public/assets/figma/prompt-sample.png',
};

function response(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

test('source-compatible judge locks package Gemini configuration', () => {
  assert.deepEqual(SOURCE_COMPATIBLE_CONFIG, {
    model: 'gemini-3.6-flash',
    temperature: 0.1,
    maxOutputTokens: 10,
    timeoutMs: 8000,
    // A repetição passou a fazer parte da configuração travada em 17/09/2026:
    // antes deste adaptador não repetia NADA e o primeiro 429 virava nota local.
    retries: 1,
    baseDelayMs: 150,
    rateLimitDelayMs: 1000,
    maxWaitMs: 2000,
    // O prazo total cabe nos 12 s que o navegador clássico espera (`app.js`).
    deadlineMs: 11000,
  });
});

test('source-compatible judge uses source fallback when API key is absent', async () => {
  let fetchCalls = 0;
  const judge = createSourceCompatibleJudge({
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('fetch must not run without an API key');
    },
  });
  const result = await judge(input);
  assert.equal(fetchCalls, 0);
  assert.equal(result.percent, sourceFallbackPercent(input.referencePrompt, input.candidatePrompt));
  assert.equal(result.metadata.provider, 'fallback');
  assert.equal(result.metadata.fallback_used, true);
  assert.equal(result.metadata.fallback_reason, 'gemini_api_key_missing');
});

test('source-compatible judge gives zero to unreadable answers without calling Gemini', async () => {
  let fetchCalls = 0;
  const judge = createSourceCompatibleJudge({
    apiKey: 'secret key',
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('fetch must not run for unreadable text');
    },
  });

  for (const candidatePrompt of ['123456', 'asdasdasd asdasd kkk', '!!! ??? ###']) {
    const result = await judge({ ...input, candidatePrompt });
    assert.equal(result.percent, 0, candidatePrompt);
    assert.equal(result.metadata.unreadable_text, true, candidatePrompt);
    assert.equal(result.metadata.provider, 'fallback');
  }
  assert.equal(fetchCalls, 0);
});

test('source-compatible judge sends the package instruction and parses numeric score', async () => {
  let request;
  const judge = createSourceCompatibleJudge({
    apiKey: 'secret key',
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return response({
        modelVersion: 'gemini-2.0-flash-001',
        candidates: [{ content: { parts: [{ text: '31.7500' }] } }],
      });
    },
  });

  const result = await judge(input);
  const body = JSON.parse(request.options.body);
  const instruction = body.contents[0].parts[0].text;

  assert.match(request.url, /gemini-3\.6-flash:generateContent\?key=secret%20key$/);
  assert.equal(body.generationConfig.temperature, 0.1);
  assert.equal(body.generationConfig.maxOutputTokens, 10);
  assert.match(instruction, /juiz de precisão semântica/);
  assert.match(instruction, /sujeito, estilo, iluminação, ambiente, câmera, detalhes/);
  assert.match(instruction, /Prompt Original:/);
  assert.match(instruction, /Prompt do Jogador:/);
  assert.equal(instruction.includes(input.rubric), false);
  assert.equal(result.percent, 31.75);
  assert.equal(result.metadata.provider, 'gemini');
  assert.equal(result.metadata.fallback_used, false);
});

// O contrato histórico do pacote-base — "falha do provedor vira nota local" —
// continua existindo, mas como OPT-IN: desde 17/09/2026 o padrão é sinalizar
// indisponibilidade para o servidor estacionar a avaliação. Estes três casos
// passam `onProviderFailure: 'fallback'` de propósito, porque o que eles medem é
// a nota heurística do pacote (equivalência com as 47 observações), não a
// política de produção.
test('source-compatible judge falls back exactly when Gemini returns HTTP failure', async () => {
  const judge = createSourceCompatibleJudge({
    apiKey: 'k',
    onProviderFailure: 'fallback',
    fetchImpl: async () => response({}, { ok: false, status: 503 }),
  });
  const result = await judge(input);
  assert.equal(result.percent, sourceFallbackPercent(input.referencePrompt, input.candidatePrompt));
  assert.equal(result.metadata.provider, 'fallback');
  assert.equal(result.metadata.model, 'source-fallback-v1');
  assert.equal(result.metadata.fallback_used, true);
  assert.equal(result.metadata.gemini_status, 503);
});

test('source-compatible judge falls back when Gemini output has no numeric score', async () => {
  const judge = createSourceCompatibleJudge({
    apiKey: 'k',
    onProviderFailure: 'fallback',
    fetchImpl: async () => response({ candidates: [{ content: { parts: [{ text: 'sem nota' }] } }] }),
  });
  const result = await judge(input);
  assert.equal(result.percent, 29.071);
  assert.equal(result.metadata.fallback_used, true);
});

// E o padrão tem de ser o outro: sem o opt-in, esquecer o parâmetro não pode
// voltar a produzir uma nota que ninguém avaliou.
test('esquecer `onProviderFailure` não faz a heurística voltar: o padrão sinaliza indisponibilidade', async () => {
  const judge = createSourceCompatibleJudge({
    apiKey: 'k',
    fetchImpl: async () => response({}, { ok: false, status: 503 }),
  });
  await assert.rejects(() => judge(input), (error) => {
    const falha = judgeUnavailable(error);
    assert.ok(falha, `deveria sair como indisponibilidade (saiu: ${error?.name})`);
    assert.equal(falha.reason, 'gemini_http_503');
    assert.equal(falha.parkable, true, 'e é estacionável: a nota ainda vem, depois');
    return true;
  });
});

test('source-compatible judge falls back on timeout instead of surfacing 502', async () => {
  const judge = createSourceCompatibleJudge({
    apiKey: 'k',
    onProviderFailure: 'fallback',
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }),
  });
  const result = await judge(input);
  assert.equal(result.percent, 29.071);
  assert.equal(result.metadata.fallback_used, true);
  assert.match(result.metadata.fallback_reason, /timeout/i);
});
