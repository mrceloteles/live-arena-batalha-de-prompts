/**
 * Canonical room phases for the unified engine.
 *
 * The database keeps the arena room/round statuses (backward compatible with
 * existing rooms and migrations), and `roomPhase` derives the canonical state
 * that every screen speaks:
 *
 *   lobby -> playing -> round_results -> playing -> ... -> final_results -> finished
 *
 * Derivation is pure and read-only: restarting the server or replaying old
 * rooms always yields the same phases because they come from persisted state.
 */

export const ROOM_PHASES = Object.freeze([
  'lobby',        // antes da 1a rodada OU entre rodadas (aguardando o professor)
  'playing',      // uma rodada (missao) esta aberta e aceitando envios
  'round_results',// resultados da rodada em exibicao (ainda faltam rodadas)
  'final_results',// resultados finais da ultima rodada em exibicao
  'finished',     // sala encerrada/arquivada pelo professor
]);

export const ROOM_PHASE_SET = new Set(ROOM_PHASES);

const ROUND_OPEN = new Set(['open', 'submitting', 'judging']);
const ROUND_RESULTS = new Set(['results']);

function invalid(message) {
  throw new RangeError(message);
}

export function requireRoomPhase(phase) {
  if (!ROOM_PHASE_SET.has(phase)) invalid(`unknown room phase: ${phase}`);
  return phase;
}

function requireRoomStatus(status) {
  if (!['draft', 'waiting', 'open', 'playing', 'ended', 'archived'].includes(status)) {
    invalid(`unknown arena room status: ${status}`);
  }
}

function requireRoundList(rounds) {
  if (!Array.isArray(rounds)) throw new TypeError('rounds must be an array');
  for (const round of rounds) {
    if (!round || !['pending', 'open', 'submitting', 'judging', 'results', 'closed'].includes(round.status)) {
      invalid('round has an unknown status');
    }
  }
  return rounds;
}

/** Rounds ordered by position; missing position/status treated defensively. */
export function sortRounds(rounds) {
  return [...requireRoundList(rounds)].sort((left, right) => Number(left.position) - Number(right.position));
}

/**
 * Canonical phase of a room given its persisted status and round list.
 * @param {{status: string}} room
 * @param {Array} rounds round rows (at least {position, status})
 */
export function roomPhase(room, rounds) {
  if (!room || typeof room !== 'object') throw new TypeError('room is required');
  requireRoomStatus(room.status);
  const list = sortRounds(rounds);

  const open = list.find((round) => ROUND_OPEN.has(round.status));
  if (open) return 'playing';

  const showingResults = list.filter((round) => ROUND_RESULTS.has(round.status));
  if (showingResults.length) {
    const highest = showingResults.at(-1);
    // E a ultima rodada configurada? entao e o placar final.
    const lastConfigured = list.at(-1);
    const isFinalBoard = !lastConfigured
      || highest.position >= lastConfigured.position
      || Number(lastConfigured.position) === Number(highest.position);
    return isFinalBoard ? 'final_results' : 'round_results';
  }

  if (room.status === 'ended' || room.status === 'archived') return 'finished';
  if (room.status === 'draft' || room.status === 'waiting' || room.status === 'open') return 'lobby';
  if (room.status === 'playing') {
    // Em jogo, sem rodada aberta nem resultados na tela: ou aguarda o
    // professor iniciar a proxima rodada, ou nada resta por jogar.
    return list.some((round) => round.status === 'pending') ? 'lobby' : 'finished';
  }
  return 'finished';
}

/**
 * Whether students may still join the room. Presets that lock the roster at
 * the first round (classic) stop accepting joins once a round started; the
 * arena-style rooms keep accepting while playing (validated behavior).
 */
export function canJoinRoom(room, rounds, { rosterLocksAtStart = false } = {}) {
  if (!room || typeof room !== 'object') return false;
  requireRoomStatus(room.status);
  if (room.status === 'draft' || room.status === 'ended' || room.status === 'archived') return false;
  if (room.status === 'waiting' || room.status === 'open') return true;
  if (room.status === 'playing' && rosterLocksAtStart) return false;
  if (room.status === 'playing') {
    const list = sortRounds(rounds);
    const last = list.at(-1);
    // Apos a ultima rodada ninguem novo entra.
    const finishedPlaying = list.length > 0
      && list.every((round) => round.status === 'closed')
      && (!last || last.status === 'closed');
    return !finishedPlaying;
  }
  return false;
}

/**
 * Short human label of a phase for the cockpit chip, in pt-BR (sem acento no
 * banco, o cliente exibe com acento quando quiser).
 */
export function phaseLabel(phase) {
  requireRoomPhase(phase);
  return {
    lobby: 'Aguardando inicio',
    playing: 'Em andamento',
    round_results: 'Resultados da rodada',
    final_results: 'Resultado final',
    finished: 'Encerrada',
  }[phase];
}
