import assert from 'node:assert/strict';
import test from 'node:test';

import { SCORING_VERSION, calculatePoints } from '../../src/domain/scoring.mjs';

test('reproduces the live Red Door speed bonus observed on 2026-09-04', () => {
  // Live isolated-room observation: 20% submitted after 47 of 60 seconds => 2217 points.
  assert.equal(calculatePoints(20, 47, 60), 2_217);
});

test('points combine accuracy with up to one thousand live speed-bonus points', () => {
  assert.match(SCORING_VERSION, /^v\d+/);
  assert.equal(calculatePoints(0, 0, 60), 1_000);
  assert.equal(calculatePoints(100, 60, 60), 10_000);
  assert.equal(calculatePoints(60, 1, 60), 6_983);
  assert.equal(calculatePoints(60, 59, 60), 6_017);
  assert.equal(calculatePoints(29.071, 30, 60), 3_407);
  assert.equal(calculatePoints(18.6325, 30, 60), 2_363);
  assert.equal(calculatePoints(12.6992, 30, 60), 1_770);
});

test('scoring still rejects out-of-range or non-finite server values', () => {
  for (const args of [[-1, 0, 60], [101, 0, 60], [50, -1, 60], [50, 61, 60], [50, 0, 0], [NaN, 0, 60]]) {
    assert.throws(() => calculatePoints(...args), /percent|elapsed|duration/i);
  }
});
