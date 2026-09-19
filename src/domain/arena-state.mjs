/**
 * Server-owned lifecycle for the Arena (Prompt Engineering modes).
 *
 * Room statuses follow the classroom flow:
 *   draft   -> professor montando a sala (nao aparece para alunos)
 *   waiting -> sala publicada, alunos entram pelo codigo
 *   open    -> professor liberou o inicio (alunos continuam entrando)
 *   playing -> pelo menos uma rodada (missao) ja iniciou
 *   ended   -> ultima rodada encerrada pelo professor
 *   archived-> professor arquivou a sala
 *
 * Join is allowed while the room is joinable (waiting/open/playing) unless the
 * teacher blocked entry; the global Arena gate is enforced separately by the
 * API (settings arena.global_open).
 *
 * Round statuses:
 *   pending   -> configurada, aguardando inicio
 *   open      -> missao em andamento (alunos enviam prompts)
 *   submitting-> encerramento em andamento (tempo esgotado; pontuacao dos faltantes)
 *   judging   -> avaliacao em andamento (transitorio)
 *   results   -> notas visiveis para a turma (professor controla o avancar)
 *   closed    -> rodada encerrada pelo professor
 */

export const ARENA_ROOM_STATUSES = new Set(['draft', 'waiting', 'open', 'playing', 'ended', 'archived']);
export const ARENA_ROUND_STATUSES = new Set(['pending', 'open', 'submitting', 'judging', 'results', 'closed']);

export const ARENA_JOINABLE = new Set(['waiting', 'open', 'playing']);

export const MODALITIES = Object.freeze({
  precisao: { label: 'Precisão', attempts: 1 },
  contexto: { label: 'Contexto', attempts: 1 },
  sprint: { label: 'Sprint', attempts: 1 },
  essencial: { label: 'Prompt Essencial', attempts: 1 },
  completo: { label: 'Prompt Completo', attempts: 1 },
  resgate: { label: 'Resgate', attempts: 1 },
  diagnostico: { label: 'Diagnóstico', attempts: 1 },
  refinamento: { label: 'Refinamento', attempts: 2 },
  reversa: { label: 'Engenharia Reversa', attempts: 1 },
  briefing: { label: 'Briefing de Cliente', attempts: 1 },
  boss: { label: 'Boss Battle', attempts: 1 },
  livre: { label: 'Livre', attempts: 1 },
});

export const CRITERIA = Object.freeze([
  'objetivo',
  'contexto',
  'publico',
  'formato',
  'restricoes',
  'criatividade',
  'clareza',
  'concisao',
  'especificidade',
  'estrutura',
]);

export const SPEED_WEIGHTS = Object.freeze(['none', 'low', 'medium', 'high']);

const ROOM_TRANSITIONS = Object.freeze({
  draft: new Set(['waiting']),
  waiting: new Set(['open', 'playing', 'ended']),
  open: new Set(['playing', 'ended']),
  playing: new Set(['ended']),
  ended: new Set(['archived']),
  archived: new Set([]),
});

const ROUND_TRANSITIONS = Object.freeze({
  pending: new Set(['open']),
  open: new Set(['submitting', 'results', 'closed']),
  submitting: new Set(['results', 'closed']),
  judging: new Set(['results', 'closed']),
  results: new Set(['closed']),
  closed: new Set([]),
});

function invalid(message) {
  throw new RangeError(message);
}

export function requireRoomStatus(status) {
  if (!ARENA_ROOM_STATUSES.has(status)) invalid(`unknown arena room status: ${status}`);
  return status;
}

export function requireRoundStatus(status) {
  if (!ARENA_ROUND_STATUSES.has(status)) invalid(`unknown arena round status: ${status}`);
  return status;
}

/** Room-level transition guard: returns the target status or throws. */
export function nextRoomStatus(current, target) {
  requireRoomStatus(current);
  requireRoomStatus(target);
  if (current === target) return target;
  const allowed = ROOM_TRANSITIONS[current];
  if (!allowed || !allowed.has(target)) {
    invalid(`room cannot transition from ${current} to ${target}`);
  }
  return target;
}

/** Round-level transition guard: returns the target status or throws. */
export function nextRoundStatus(current, target) {
  requireRoundStatus(current);
  requireRoundStatus(target);
  if (current === target) return target;
  const allowed = ROUND_TRANSITIONS[current];
  if (!allowed || !allowed.has(target)) {
    invalid(`round cannot transition from ${current} to ${target}`);
  }
  return target;
}

/** Whether a participant may still submit to an open round, given server time. */
export function roundAcceptsSubmissions(round, now) {
  if (!round) return false;
  if (round.status !== 'open') return false;
  if (Number.isFinite(round.pausedAt)) return false; // rodada pausada pelo professor
  if (!Number.isFinite(now)) invalid('now must be a finite server timestamp');
  if (Number.isFinite(round.deadlineAt) && now > round.deadlineAt + 2) return false;
  return true;
}

/** Clamp attempts to the challenge/mode limit (1..3). */
export function normalizeAttempts(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3) return fallback;
  return parsed;
}