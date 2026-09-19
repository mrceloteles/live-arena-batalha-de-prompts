import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ROOM_PHASE_SET, canJoinRoom, phaseLabel, roomPhase, requireRoomPhase,
} from '../../src/domain/room-phases.mjs';

const round = (position, status) => ({ id: `r-${position}`, position, status });

test('rooms before the first round are in lobby', () => {
  assert.equal(roomPhase({ status: 'draft' }, []), 'lobby');
  assert.equal(roomPhase({ status: 'waiting' }, []), 'lobby');
  assert.equal(roomPhase({ status: 'open' }, []), 'lobby');
  assert.equal(roomPhase({ status: 'waiting' }, [round(1, 'pending')]), 'lobby');
});

test('an open/submitting/judging round means playing', () => {
  for (const status of ['open', 'submitting', 'judging']) {
    assert.equal(roomPhase({ status: 'playing' }, [round(1, status), round(2, 'pending')]), 'playing');
  }
  assert.equal(roomPhase({ status: 'waiting' }, [round(1, 'open')]), 'playing');
});

test('results on a non-final round are round_results', () => {
  const rounds = [round(1, 'results'), round(2, 'pending'), round(3, 'pending')];
  assert.equal(roomPhase({ status: 'playing' }, rounds), 'round_results');
});

test('results of the last configured round are final_results', () => {
  const rounds = [round(1, 'closed'), round(2, 'closed'), round(3, 'results')];
  assert.equal(roomPhase({ status: 'playing' }, rounds), 'final_results');
});

test('ended and archived rooms are finished', () => {
  assert.equal(roomPhase({ status: 'ended' }, [round(1, 'closed')]), 'finished');
  assert.equal(roomPhase({ status: 'archived' }, [round(1, 'closed')]), 'finished');
});

test('between rounds, while the professor has not started the next round, it is lobby again', () => {
  const rounds = [round(1, 'closed'), round(2, 'pending')];
  assert.equal(roomPhase({ status: 'playing' }, rounds), 'lobby');
});

test('playing with every round closed and nothing pending is finished', () => {
  assert.equal(roomPhase({ status: 'playing' }, [round(1, 'closed'), round(2, 'closed')]), 'finished');
});

test('canonical set and labels are stable', () => {
  assert.deepEqual([...ROOM_PHASE_SET].sort(), ['final_results', 'finished', 'lobby', 'playing', 'round_results']);
  assert.throws(() => requireRoomPhase('explodida'), /unknown room phase/);
  assert.equal(phaseLabel('lobby'), 'Aguardando inicio');
});

test('joinability follows the roster-lock rule of the preset', () => {
  const threeRounds = [round(1, 'pending'), round(2, 'pending'), round(3, 'pending')];
  assert.equal(canJoinRoom({ status: 'draft' }, threeRounds), false);
  assert.equal(canJoinRoom({ status: 'waiting' }, threeRounds), true);
  assert.equal(canJoinRoom({ status: 'open' }, threeRounds), true);

  // Classic (roster locks at start): while playing nobody joins.
  assert.equal(canJoinRoom({ status: 'playing' }, [round(1, 'open')], { rosterLocksAtStart: true }), false);
  assert.equal(canJoinRoom({ status: 'playing' }, [round(1, 'results')], { rosterLocksAtStart: true }), false);

  // Arena-style: late joins stay allowed while playing, not after the end.
  assert.equal(canJoinRoom({ status: 'playing' }, [round(1, 'open')], { rosterLocksAtStart: false }), true);
  assert.equal(canJoinRoom({ status: 'playing' }, [round(1, 'results'), round(2, 'pending')], { rosterLocksAtStart: false }), true);
  assert.equal(canJoinRoom({ status: 'playing' }, [round(1, 'closed'), round(2, 'closed')], { rosterLocksAtStart: false }), false);
  assert.equal(canJoinRoom({ status: 'ended' }, [round(1, 'closed')]), false);
  assert.equal(canJoinRoom({ status: 'archived' }, []), false);
});
