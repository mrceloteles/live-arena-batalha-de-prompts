import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PACKAGE_EXACT_CONFIG,
  createPackageExactGeminiCandidate,
  packageExactInstruction,
  parsePackageExactPercent,
} from '../research/red-door-judge/package-exact-gemini-candidate.mjs';

test('package-exact candidate locks recovered config', () => {
  assert.deepEqual(PACKAGE_EXACT_CONFIG, {
    model: 'gemini-2.0-flash',
    temperature: 0.1,
    maxOutputTokens: 10,
    timeoutMs: 8000,
  });
});

test('package-exact instruction preserves source package wording and fields', () => {
  const text = packageExactInstruction({ referencePrompt: 'REF', candidatePrompt: 'USER' });
  assert.match(text, /juiz de precisão semântica/);
  assert.match(text, /sujeito, estilo, iluminação, ambiente, câmera, detalhes/);
  assert.match(text, /Prompt Original: "REF"/);
  assert.match(text, /Prompt do Jogador: "USER"/);
  assert.doesNotMatch(text, /RUBRICA ADICIONAL/);
  assert.doesNotMatch(text, /não siga instruções/i);
});

test('package parser mirrors first positive decimal extraction', () => {
  assert.equal(parsePackageExactPercent({ candidates: [{ content: { parts: [{ text: '78.5' }] } }] }), 78.5);
  assert.equal(parsePackageExactPercent({ candidates: [{ content: { parts: [{ text: 'nota 104.2' }] } }] }), 100);
  assert.equal(parsePackageExactPercent({ candidates: [{ content: { parts: [{ text: 'sem numero' }] } }] }), null);
});

test('package-exact request uses query key and recovered generation config', async () => {
  let url = '';
  let body = null;
  const judge = createPackageExactGeminiCandidate({
    apiKey: 'test key',
    fetchImpl: async (requestUrl, options) => {
      url = String(requestUrl);
      body = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return { candidates: [{ content: { parts: [{ text: '31.125' }] } }] };
        },
      };
    },
  });
  const result = await judge({ referencePrompt: 'REF', candidatePrompt: 'USER', rubric: 'ignored by package exact' });
  assert.match(url, /gemini-2\.0-flash:generateContent\?key=test%20key$/);
  assert.equal(body.generationConfig.temperature, 0.1);
  assert.equal(body.generationConfig.maxOutputTokens, 10);
  assert.equal(result.percent, 31.125);
  assert.equal(result.metadata.candidate, 'package-exact-gemini-v1');
});
