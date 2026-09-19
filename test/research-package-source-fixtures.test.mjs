import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { sourceFallbackPercent } from '../src/judge/fake-judge.mjs';

const fixtures = JSON.parse(fs.readFileSync(new URL('../research/red-door-judge/package-source-fixtures.json', import.meta.url), 'utf8'));

test('recovered source package database scores match fallback exactly', () => {
  for (const row of fixtures.fixtures) {
    const recomputed = sourceFallbackPercent(fixtures.reference_prompt, row.candidate_prompt);
    assert.equal(recomputed, row.stored_percent);
    assert.equal(recomputed, row.fallback_recomputed_percent);
    assert.equal(Math.round(recomputed * 100), row.stored_points);
  }
});

test('source package Gemini configuration provenance remains explicit', () => {
  assert.equal(fixtures.judge_source.gemini.model, 'gemini-2.0-flash');
  assert.equal(fixtures.judge_source.gemini.temperature, 0.1);
  assert.equal(fixtures.judge_source.gemini.max_output_tokens, 10);
  assert.equal(fixtures.judge_source.gemini.curl_timeout_seconds, 8);
  assert.equal(fixtures.judge_source.gemini.failure_behavior, 'falls back to scorePromptFallback');
});
