import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { calculatePoints } from '../src/domain/scoring.mjs';

test('current motor reproduces the isolated live scoring counterexample', async () => {
  const file = new URL('../research/fidelity-lab/evidence/live-isolated-cycle-2026-09-04.json', import.meta.url);
  const evidence = JSON.parse(await readFile(file, 'utf8'));
  const scored = evidence.observations.find((row) => row.kind === 'non_empty_fallback');

  assert.equal(evidence.isolation.main_room_used, false);
  assert.equal(scored.elapsed_seconds, scored.submitted_at - scored.started_at);
  assert.equal(calculatePoints(scored.percent, scored.elapsed_seconds, evidence.round.duration_seconds), scored.points);
});

test('isolated live timeout establishes the exact zero-score boundary', async () => {
  const file = new URL('../research/fidelity-lab/evidence/live-isolated-cycle-2026-09-04.json', import.meta.url);
  const evidence = JSON.parse(await readFile(file, 'utf8'));
  const timeout = evidence.observations.find((row) => row.kind === 'empty_timeout');

  assert.equal(timeout.candidate_prompt, '');
  assert.equal(timeout.submitted_at, timeout.deadline_at);
  assert.equal(timeout.gemini_status, 'timeout_empty');
  assert.equal(timeout.percent, 0);
  assert.equal(timeout.points, 0);
  assert.equal(timeout.fallback_used, false);
});
