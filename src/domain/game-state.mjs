/**
 * Server-owned lifecycle for the preserved three-station prompt battle.
 * Timestamps are epoch seconds (or any single server time unit used consistently).
 */
export const GAME_RULES = Object.freeze({
  players: 3,
  rounds: 3,
  roundDuration: 60,
  resultsDuration: 10,
  finalResultsDuration: 30,
});

const PHASES = new Set(['idle', 'registration', 'ready', 'playing', 'scoring', 'results', 'final_results']);

function invalid(message) {
  throw new RangeError(message);
}

function requireNow(now) {
  if (!Number.isFinite(now)) invalid('now must be a finite server timestamp');
}

function requireState(state) {
  if (!state || typeof state !== 'object' || !PHASES.has(state.phase)) {
    invalid('state has an unknown phase');
  }
  if (!Number.isInteger(state.round) || state.round < 0 || state.round > GAME_RULES.rounds) {
    invalid('state has an invalid round');
  }
  const players = playersOf(state);
  if (players.some((player) => !player || typeof player !== 'object' || player.id === undefined || player.id === null)) {
    invalid('state players must each have an id');
  }
  if (new Set(players.map((player) => player.id)).size !== players.length) {
    invalid('state players must have distinct ids');
  }
  if (state.phase === 'registration' && (state.round !== 0 || players.length > GAME_RULES.players)) {
    invalid('registration permits up to three players before round 1');
  }
  if (['ready', 'playing', 'scoring', 'results', 'final_results'].includes(state.phase) && players.length !== GAME_RULES.players) {
    invalid(`${state.phase} requires exactly three players`);
  }
  if (state.phase === 'ready' && (state.round < 0 || state.round >= GAME_RULES.rounds)) {
    invalid('ready requires round 0, 1, or 2');
  }
  if (['playing', 'scoring', 'results'].includes(state.phase) && (state.round < 1 || state.round > GAME_RULES.rounds)) {
    invalid(`${state.phase} requires round 1, 2, or 3`);
  }
  if (state.phase === 'results' && state.round === GAME_RULES.rounds) invalid('results requires round 1 or 2');
  if (state.phase === 'final_results' && state.round !== GAME_RULES.rounds) invalid('final_results requires round 3');
  if (['playing', 'results', 'final_results'].includes(state.phase) && !Number.isFinite(state.deadline_at)) {
    invalid(`${state.phase} requires a finite deadline_at`);
  }
}

function playersOf(state) {
  return Array.isArray(state.players) ? state.players : [];
}

function requirePhase(state, command, expected) {
  if (state.phase !== expected) {
    invalid(`${command.type} is not allowed from ${state.phase}`);
  }
}

function stateWithPlayers(phase, round, players, extra = {}) {
  return { phase, round, players: players.map((player) => ({ ...player })), ...extra };
}

function deadlineReached(state, now) {
  if (!Number.isFinite(state.deadline_at) || now < state.deadline_at) {
    invalid('server deadline has not been reached');
  }
}

/**
 * Applies one allowed server command. It is pure: neither the supplied state nor
 * command is mutated, and no client-provided time can advance a deadline.
 */
export function transitionGame(state, command, now) {
  requireState(state);
  requireNow(now);
  if (!command || typeof command.type !== 'string') invalid('command.type is required');

  const players = playersOf(state);
  switch (command.type) {
    case 'open_registration':
      requirePhase(state, command, 'idle');
      return stateWithPlayers('registration', 0, []);

    case 'register_player': {
      requirePhase(state, command, 'registration');
      const player = command.player;
      if (!player || typeof player !== 'object' || player.id === undefined || player.id === null) {
        invalid('register_player requires a player with an id');
      }
      if (players.some((registered) => registered.id === player.id)) invalid('player is already registered');
      if (players.length >= GAME_RULES.players) invalid('only three players may register');
      return stateWithPlayers('registration', state.round, [...players, player]);
    }

    case 'ready_players':
      requirePhase(state, command, 'registration');
      if (players.length !== GAME_RULES.players) invalid('ready requires exactly three registered players');
      return stateWithPlayers('ready', state.round, players);

    case 'start_round': {
      requirePhase(state, command, 'ready');
      const round = state.round + 1;
      if (round > GAME_RULES.rounds) invalid('all three rounds have already been played');
      return stateWithPlayers('playing', round, players, { deadline_at: now + GAME_RULES.roundDuration });
    }

    case 'end_round':
      requirePhase(state, command, 'playing');
      deadlineReached(state, now);
      return stateWithPlayers('scoring', state.round, players, {
        deadline_at: state.deadline_at,
      });

    case 'scores_ready': {
      requirePhase(state, command, 'scoring');
      if (state.round === GAME_RULES.rounds) {
        return stateWithPlayers('final_results', state.round, players, {
          deadline_at: now + GAME_RULES.finalResultsDuration,
        });
      }
      return stateWithPlayers('results', state.round, players, {
        deadline_at: now + GAME_RULES.resultsDuration,
      });
    }

    case 'close_results':
      requirePhase(state, command, 'results');
      deadlineReached(state, now);
      return stateWithPlayers('ready', state.round, players);

    case 'close_final_results':
      requirePhase(state, command, 'final_results');
      deadlineReached(state, now);
      return { phase: 'idle', round: 0, players: [] };

    default:
      invalid(`unknown game command: ${command.type}`);
  }
}
