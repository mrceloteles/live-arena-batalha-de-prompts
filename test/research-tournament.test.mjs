import test from 'node:test';
import assert from 'node:assert/strict';

import { median, spearman, scoreCandidate, tournament } from '../research/red-door-judge/tournament.mjs';

test('median handles odd and even samples', () => {
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(median([1, 4, 2, 3]), 2.5);
});

test('spearman detects identical and reversed ordering', () => {
  assert.ok(Math.abs(spearman([10, 20, 30], [1, 2, 3]) - 1) < 1e-12);
  assert.ok(Math.abs(spearman([10, 20, 30], [3, 2, 1]) + 1) < 1e-12);
});

test('candidate passes strict gate when predictions reproduce observations', () => {
  const rows = [
    { id: 'P01_BASELINE', observed: 30, split: 'holdout' },
    { id: 'P02_CASE', observed: 30, split: 'holdout' },
    { id: 'P04_REORDER', observed: 20, split: 'holdout' },
    { id: 'P11_RANDOM', observed: 6, split: 'holdout' },
  ];
  const result = scoreCandidate({
    id: 'perfect',
    predictions: { P01_BASELINE: 30, P02_CASE: 30, P04_REORDER: 20, P11_RANDOM: 6 },
  }, rows);
  assert.equal(result.status, 'PASS');
  assert.equal(result.mae, 0);
  assert.equal(result.medianAe, 0);
  assert.equal(result.spearman, 1);
  assert.equal(result.metamorphicAgreement, 1);
});

test('tournament prefers lower holdout error over dev fit', () => {
  const document = {
    probes: [
      { id: 'P01_BASELINE', candidate_prompt: 'base', runs: [30], split: 'holdout' },
      { id: 'P04_REORDER', candidate_prompt: 'reorder', runs: [20], split: 'holdout' },
      { id: 'D1', candidate_prompt: 'dev', runs: [50], split: 'dev' },
      { id: 'D2', candidate_prompt: 'dev2', runs: [60], split: 'dev' },
    ],
  };
  const result = tournament(document, [
    { id: 'overfit', predictions: { P01_BASELINE: 60, P04_REORDER: 50, D1: 50, D2: 60 } },
    { id: 'generalizes', predictions: { P01_BASELINE: 30, P04_REORDER: 20, D1: 40, D2: 50 } },
  ]);
  assert.equal(result.candidates[0].overall.id, 'generalizes');
});
