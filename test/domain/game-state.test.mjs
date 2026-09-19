import assert from 'node:assert/strict';
import test from 'node:test';

import { transitionGame } from '../../src/domain/game-state.mjs';

const PLAYERS = [{ id: 1 }, { id: 2 }, { id: 3 }];

function transition(state, type, now, extra = {}) {
  return transitionGame(state, { type, ...extra }, now);
}

test('runs the fixed three-player, three-round lifecycle from idle to idle', () => {
  let state = { phase: 'idle', round: 0 };
  state = transition(state, 'open_registration', 0);
  state = transition(state, 'register_player', 1, { player: PLAYERS[0] });
  state = transition(state, 'register_player', 2, { player: PLAYERS[1] });
  state = transition(state, 'register_player', 3, { player: PLAYERS[2] });
  state = transition(state, 'ready_players', 4);

  for (const round of [1, 2, 3]) {
    state = transition(state, 'start_round', round * 100);
    assert.equal(state.phase, 'playing');
    assert.equal(state.round, round);
    assert.equal(state.deadline_at, round * 100 + 60);

    state = transition(state, 'end_round', state.deadline_at);
    state = transition(state, 'scores_ready', state.deadline_at + 13);

    if (round < 3) {
      assert.equal(state.phase, 'results');
      assert.equal(state.deadline_at, round * 100 + 83);
      state = transition(state, 'close_results', state.deadline_at);
      assert.equal(state.phase, 'ready');
    } else {
      assert.equal(state.phase, 'final_results');
      assert.equal(state.deadline_at, round * 100 + 103);
      state = transition(state, 'close_final_results', state.deadline_at);
      assert.deepEqual(state, { phase: 'idle', round: 0, players: [] });
    }
  }
});

test('accepts only exactly three distinct registered players before ready', () => {
  let state = transition({ phase: 'idle', round: 0 }, 'open_registration', 0);
  state = transition(state, 'register_player', 0, { player: PLAYERS[0] });
  state = transition(state, 'register_player', 0, { player: PLAYERS[1] });

  assert.throws(() => transition(state, 'ready_players', 0), /three registered players/i);
  assert.throws(() => transition(state, 'register_player', 0, { player: PLAYERS[1] }), /already registered/i);

  state = transition(state, 'register_player', 0, { player: PLAYERS[2] });
  state = transition(state, 'ready_players', 0);
  assert.deepEqual(state.players, PLAYERS);
});

test('rejects invalid transitions without mutating the current state', () => {
  const state = { phase: 'idle', round: 0 };
  assert.throws(() => transition(state, 'start_round', 0), /not allowed.*idle/i);
  assert.deepEqual(state, { phase: 'idle', round: 0 });

  const playing = { phase: 'playing', round: 1, players: PLAYERS, deadline_at: 60 };
  assert.throws(() => transition(playing, 'end_round', 59), /server deadline/i);
  assert.throws(() => transition(playing, 'scores_ready', 60), /not allowed.*playing/i);
  assert.deepEqual(playing, { phase: 'playing', round: 1, players: PLAYERS, deadline_at: 60 });
});

test('server time, not caller intent, controls phase deadlines', () => {
  const results = { phase: 'results', round: 1, players: PLAYERS, deadline_at: 70 };
  const final = { phase: 'final_results', round: 3, players: PLAYERS, deadline_at: 90 };

  assert.throws(() => transition(results, 'close_results', 69.999), /server deadline/i);
  assert.throws(() => transition(final, 'close_final_results', 89.999), /server deadline/i);
  assert.equal(transition(results, 'close_results', 70).phase, 'ready');
  assert.equal(transition(final, 'close_final_results', 90).phase, 'idle');
});

test('rehydrated phase state must satisfy player, round, and deadline invariants', () => {
  assert.throws(
    () => transition({ phase: 'ready', round: 0, players: PLAYERS.slice(0, 2) }, 'start_round', 0),
    /ready requires exactly three players/i,
  );
  assert.throws(
    () => transition({ phase: 'playing', round: 1, players: PLAYERS }, 'end_round', 60),
    /playing requires a finite deadline_at/i,
  );
  assert.throws(
    () => transition({ phase: 'results', round: 3, players: PLAYERS, deadline_at: 10 }, 'close_results', 10),
    /results requires round 1 or 2/i,
  );
  assert.throws(
    () => transition({ phase: 'final_results', round: 2, players: PLAYERS, deadline_at: 10 }, 'close_final_results', 10),
    /final_results requires round 3/i,
  );
});
