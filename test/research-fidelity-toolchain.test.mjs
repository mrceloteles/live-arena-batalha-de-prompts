import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { evaluateGoldenCase } from '../research/fidelity-lab/promptfoo/candidate-core.mjs';
import { createClassicHarness } from '../research/fidelity-lab/aalpy/classic-harness.mjs';

test('candidate reproduces every independently stored source-package score', async () => {
  const datasetUrl = new URL('../research/fidelity-lab/golden/judge-observations.jsonl', import.meta.url);
  const cases = (await readFile(datasetUrl, 'utf8')).trim().split('\n').map(JSON.parse);

  assert.equal(cases.length, 3, 'only three independently stored judge scores are currently proven');
  for (const fixture of cases) {
    assert.equal(evaluateGoldenCase(fixture), fixture.expected_percent, fixture.id);
  }
});

test('source-package score regression remains stable over ten repeated runs', async () => {
  const datasetUrl = new URL('../research/fidelity-lab/golden/judge-observations.jsonl', import.meta.url);
  const cases = (await readFile(datasetUrl, 'utf8')).trim().split('\n').map(JSON.parse);

  for (const fixture of cases) {
    const results = Array.from({ length: 10 }, () => evaluateGoldenCase(fixture));
    const passRate = results.filter((value) => value === fixture.expected_percent).length / results.length;
    assert.equal(passRate, 1, `${fixture.id} regressed below the required 100% fixture pass rate`);
    assert.equal(Math.round(results[0] * 100), fixture.expected_points, `${fixture.id} points conversion`);
  }
});

test('black-box harness exposes the complete classic phase sequence', async () => {
  const harness = await createClassicHarness();
  try {
    const observed = [];
    observed.push((await harness.step('status')).phase);
    observed.push((await harness.step('register_all')).phase);
    for (let round = 1; round <= 3; round += 1) {
      observed.push((await harness.step('accept_all')).phase);
      observed.push((await harness.step('submit_all')).phase);
      if (round < 3) observed.push((await harness.step('advance_window')).phase);
    }
    observed.push((await harness.step('advance_window')).phase);

    assert.deepEqual(observed, [
      'idle', 'ready',
      'playing', 'results', 'ready',
      'playing', 'results', 'ready',
      'playing', 'final_results', 'idle',
    ]);
  } finally {
    harness.close();
  }
});

test('a rejected repeated macro cannot corrupt the next valid transition', async () => {
  const harness = await createClassicHarness();
  try {
    assert.equal((await harness.step('register_all')).phase, 'ready');
    assert.equal((await harness.step('register_all')).status, 409);
    assert.equal((await harness.step('accept_all')).phase, 'playing');
  } finally {
    harness.close();
  }
});
