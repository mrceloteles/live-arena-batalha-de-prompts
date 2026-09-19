import assert from 'node:assert/strict';
import test from 'node:test';

import { validateJudgeInput, validateJudgeResult } from '../../src/judge/judge.mjs';

test('judge contract validates required input', () => {
  assert.throws(() => validateJudgeInput({ referencePrompt: '', rubric: 'x', candidatePrompt: 'y' }), /referencePrompt/);
  assert.doesNotThrow(() => validateJudgeInput({ referencePrompt: 'x', rubric: 'y', candidatePrompt: 'z' }));
});

test('judge contract rejects malformed output', () => {
  assert.throws(() => validateJudgeResult({ percent: -1, explanation: 'x', metadata: {} }), /percent/);
  assert.throws(() => validateJudgeResult({ percent: 2, explanation: '', metadata: {} }), /explanation/);
});

test('judge contract preserves four-decimal source percentages', () => {
  const result = validateJudgeResult({
    percent: 18.6325,
    explanation: 'fallback local',
    metadata: { provider: 'fallback' },
  });
  assert.equal(result.percent, 18.6325);
});
