import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARENA_JOINABLE, CRITERIA, MODALITIES, SPEED_WEIGHTS,
  nextRoomStatus, nextRoundStatus, roundAcceptsSubmissions, requireRoomStatus, requireRoundStatus,
} from '../../src/domain/arena-state.mjs';

test('room statuses follow the classroom lifecycle', () => {
  assert.equal(nextRoomStatus('draft', 'waiting'), 'waiting');
  assert.equal(nextRoomStatus('waiting', 'open'), 'open');
  assert.equal(nextRoomStatus('waiting', 'playing'), 'playing');
  assert.equal(nextRoomStatus('open', 'playing'), 'playing');
  assert.equal(nextRoomStatus('playing', 'ended'), 'ended');
  assert.equal(nextRoomStatus('ended', 'archived'), 'archived');
  assert.throws(() => nextRoomStatus('draft', 'playing'), /cannot transition/);
  assert.throws(() => nextRoomStatus('archived', 'waiting'), /cannot transition/);
  assert.throws(() => nextRoomStatus('playing', 'draft'), /cannot transition/);
});

test('round statuses progress and never rewind', () => {
  assert.equal(nextRoundStatus('pending', 'open'), 'open');
  assert.equal(nextRoundStatus('open', 'results'), 'results');
  assert.equal(nextRoundStatus('open', 'submitting'), 'submitting');
  assert.equal(nextRoundStatus('submitting', 'results'), 'results');
  assert.equal(nextRoundStatus('results', 'closed'), 'closed');
  assert.throws(() => nextRoundStatus('closed', 'open'), /cannot transition/);
  assert.throws(() => nextRoundStatus('results', 'pending'), /cannot transition/);
});

test('joinability covers waiting, open and playing only', () => {
  assert.deepEqual([...ARENA_JOINABLE].sort(), ['open', 'playing', 'waiting']);
  assert.equal(ARENA_JOINABLE.has('draft'), false);
  assert.equal(ARENA_JOINABLE.has('ended'), false);
});

test('rounds accept submissions only while open and before the deadline', () => {
  const open = { status: 'open', deadlineAt: 100 };
  assert.equal(roundAcceptsSubmissions(open, 90), true);
  assert.equal(roundAcceptsSubmissions(open, 102), true); // tolerancia de 2s
  assert.equal(roundAcceptsSubmissions(open, 103), false);
  assert.equal(roundAcceptsSubmissions({ status: 'results', deadlineAt: 100 }, 50), false);
  assert.equal(roundAcceptsSubmissions({ status: 'open', deadlineAt: null }, 5000), true);
  assert.equal(roundAcceptsSubmissions(null, 0), false);
});

test('a paused round rejects submissions regardless of deadline', () => {
  const paused = { status: 'open', deadlineAt: 10_000, pausedAt: 5_000 };
  assert.equal(roundAcceptsSubmissions(paused, 6_000), false);
  assert.equal(roundAcceptsSubmissions(paused, 9_999), false);
  const noDeadline = { status: 'open', deadlineAt: null, pausedAt: 5_000 };
  assert.equal(roundAcceptsSubmissions(noDeadline, 9_999), false);
  const unpaused = { status: 'open', deadlineAt: 10_000, pausedAt: null };
  assert.equal(roundAcceptsSubmissions(unpaused, 9_999), true);
});

test('modality and criteria catalogs are stable', () => {
  assert.ok(MODALITIES.refinamento.attempts === 2);
  assert.ok(MODALITIES.sprint.label === 'Sprint');
  assert.ok(CRITERIA.includes('objetivo'));
  assert.ok(CRITERIA.includes('restricoes'));
  assert.ok(SPEED_WEIGHTS.includes('none'));
  assert.ok(SPEED_WEIGHTS.includes('high'));
});

test('status validators reject unknown values', () => {
  assert.throws(() => requireRoomStatus('explodida'), /unknown arena room status/);
  assert.throws(() => requireRoundStatus('voando'), /unknown arena round status/);
  assert.equal(requireRoomStatus('playing'), 'playing');
});