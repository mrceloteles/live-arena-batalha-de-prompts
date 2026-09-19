import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SOURCE_CANDIDATE_CONFIG,
  createSourceGeminiCandidate,
  parseFirstPercent,
} from '../research/red-door-judge/source-gemini-candidate.mjs';

test('source candidate preserves recovered model configuration', () => {
  assert.equal(SOURCE_CANDIDATE_CONFIG.model, 'gemini-2.0-flash');
  assert.equal(SOURCE_CANDIDATE_CONFIG.temperature, 0.1);
  assert.equal(SOURCE_CANDIDATE_CONFIG.maxOutputTokens, 10);
});

test('parseFirstPercent accepts a short numeric Gemini answer and clamps it', () => {
  assert.equal(parseFirstPercent({ candidates: [{ content: { parts: [{ text: '31.75' }] } }] }), 31.75);
  assert.equal(parseFirstPercent({ candidates: [{ content: { parts: [{ text: 'Nota: 104,2%' }] } }] }), 100);
  assert.equal(parseFirstPercent({ candidates: [{ content: { parts: [{ text: '-3' }] } }] }), 0);
});

test('source candidate sends Gemini 2.0 Flash request with recovered generation settings', async () => {
  let capturedUrl = '';
  let capturedBody = null;
  const judge = createSourceGeminiCandidate({
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return {
            modelVersion: 'gemini-2.0-flash-test',
            candidates: [{ content: { parts: [{ text: '30.8686' }] } }],
          };
        },
      };
    },
  });

  const result = await judge({
    referencePrompt: 'uma mulher de jaqueta vermelha em uma trilha de montanha',
    candidatePrompt: 'mulher de jaqueta vermelha tirando selfie em uma montanha',
    rubric: 'compare sujeito, ambiente e composição',
  });

  assert.match(capturedUrl, /models\/gemini-2\.0-flash:generateContent$/);
  assert.equal(capturedBody.generationConfig.temperature, 0.1);
  assert.equal(capturedBody.generationConfig.maxOutputTokens, 10);
  assert.match(capturedBody.contents[0].parts[0].text, /sujeito\/personagens/);
  assert.match(capturedBody.contents[0].parts[0].text, /PROMPT DO JOGADOR/);
  assert.equal(result.percent, 30.8686);
  assert.equal(result.metadata.candidate, 'source-driven-v1');
});
