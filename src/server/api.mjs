import { randomUUID } from 'node:crypto';

import { GAME_RULES } from '../domain/game-state.mjs';
import { calculatePoints, SCORING_VERSION } from '../domain/scoring.mjs';
import { rankFinal, rankRound } from '../domain/ranking.mjs';
import { budgetRejection } from '../judge/budget.mjs';
import { ApiError, comCausa, consent, integer, object, text } from './validation.mjs';
import { createAdminAuth } from './admin-auth.mjs';
import { createLoginLimiter } from './rate-limit.mjs';
import { reportSources } from './report-sources.mjs';

const publicSession = (row, mode = 'wait_all') => ({
  id: row.id,
  station_id: row.stationId,
  player_name: row.playerName,
  first_name: String(row.playerName || '').trim().split(/\s+/)[0] || '',
  mode,
});

const acceptanceKey = (gameId, roundNumber) => `round_acceptance:${gameId}:${roundNumber}`;
const modeKey = (gameId, roundNumber, sessionId) => `round_mode:${gameId}:${roundNumber}:${sessionId}`;
const classroomKey = (gameId) => `classroom:${gameId}`;
const resetAt = (game) => Number(game?.created_at || 0);

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0] || '';
}

function publicMatchHandle(game, roundNumber, stationId) {
  return `m-${game.cycle}-${roundNumber}-${stationId}`;
}

function decodePublicMatchHandle(value) {
  const raw = String(value ?? '').trim();
  const modern = /^m-(\d+)-([1-3])-(\d{1,2})$/.exec(raw);
  if (modern) {
    const [, cycle, roundNumber, stationId] = modern.map(Number);
    if (cycle >= 1 && stationId >= 1 && stationId <= 50) return { raw, cycle, roundNumber, stationId };
  }
  if (!/^\d{3,}$/.test(raw)) throw new ApiError(422, 'Identificador da partida invalido.');
  const stationId = Number(raw.at(-1));
  const roundNumber = Number(raw.at(-2));
  const cycle = Number(raw.slice(0, -2));
  if (![1, 2, 3].includes(stationId) || ![1, 2, 3].includes(roundNumber) || !Number.isInteger(cycle) || cycle < 1) {
    throw new ApiError(422, 'Identificador da partida invalido.');
  }
  return { raw, cycle, roundNumber, stationId };
}

/**
 * Recusa do teto de avaliacoes externas nao e falha do provedor: a resposta e
 * recuperavel e a tentativa do aluno continua sendo a mesma. Devolve `null`
 * quando o erro e outro — quem chama decide o que fazer com ele.
 */
function falhaDoTeto(error) {
  const recusa = budgetRejection(error);
  if (!recusa) return null;
  const falha = comCausa(new ApiError(recusa.status, recusa.message), error);
  falha.details = { retry_after: recusa.retryAfter };
  falha.retryAfter = recusa.retryAfter;
  return falha;
}

export function createApi({
  repositories,
  judge,
  now = () => Date.now() / 1000,
  id = randomUUID,
  adminPassword = process.env.ADMIN_PASSWORD,
  adminSecret = process.env.ADMIN_SECRET,
  adminAuth: sharedAdminAuth,
} = {}) {
  if (!repositories) throw new TypeError('repositories are required');
  if (typeof judge !== 'function') throw new TypeError('judge is required');
  const adminAuth = sharedAdminAuth || createAdminAuth({ password: adminPassword, secret: adminSecret, now });
  const requireAdmin = (token) => {
    if (!adminAuth.verify(token)) throw new ApiError(401, 'Acesso administrativo invalido ou expirado.');
  };

  const activeRoom = async () => {
    const game = (await repositories.rooms.getActive());
    if (!game) throw new ApiError(409, 'Nenhuma sala ativa.');
    return game;
  };

  const sessionsFor = async (game) => (await repositories.sessions.listByGame(game.id)).filter((row) => row.active);
  const roundsFor = async (game) => (await repositories.rooms.getState(game.id))?.rounds || [];
  const roundFor = async (game, roundNumber) => (await roundsFor(game)).find((row) => row.number === roundNumber);
  const matchFor = async (game, roundNumber) => (await repositories.matches.listByGame(game.id)).find((row) => row.roundNumber === roundNumber);
  const roomConfig = async (game) => {
    const stored = (await repositories.settings.get(classroomKey(game.id)));
    return stored?.mode === 'classroom'
      ? { mode: 'classroom', expectedPlayers: Number(stored.expectedPlayers), rosterLocked: Boolean(stored.rosterLocked) }
      : { mode: 'classic', expectedPlayers: GAME_RULES.players, rosterLocked: false };
  };
  const expectedPlayersFor = async (game) => (await roomConfig(game)).expectedPlayers;

  const acceptedFor = async (game, roundNumber) => {
    const stored = (await repositories.settings.get(acceptanceKey(game.id, roundNumber)));
    return Array.isArray(stored) ? stored.map(String) : [];
  };

  const acceptSession = async (game, roundNumber, session, mode, timestamp) => {
    const accepted = new Set((await acceptedFor(game, roundNumber)));
    accepted.add(String(session.id));
    (await repositories.settings.set(acceptanceKey(game.id, roundNumber), [...accepted], timestamp));
    (await repositories.settings.set(modeKey(game.id, roundNumber, session.id), mode || 'wait_all', timestamp));
    return [...accepted];
  };

  const sessionById = async (sessionId) => {
    const game = (await activeRoom());
    const wanted = String(sessionId);
    const session = (await sessionsFor(game)).find((row) => String(row.id) === wanted);
    if (!session) throw new ApiError(401, 'Sessao invalida ou expirada.');
    return { game, session };
  };

  const resolvePublicMatch = async (handleValue) => {
    const handle = decodePublicMatchHandle(handleValue);
    const game = (await activeRoom());
    if (Number(game.cycle) !== handle.cycle) throw new ApiError(404, 'Partida nao encontrada.');
    const session = (await repositories.sessions.getActiveByStation(game.id, handle.stationId));
    if (!session) throw new ApiError(401, 'Sessao invalida ou expirada.');
    const match = (await matchFor(game, handle.roundNumber));
    return { game, session, match, roundNumber: handle.roundNumber, handle };
  };

  async function advanceGame(inputGame, timestamp) {
    let game = inputGame;
    if (!game) return game;

    const sessions = (await sessionsFor(game));
    const config = (await roomConfig(game));
    if (game.phase === 'registration' && config.mode === 'classic' && sessions.length >= config.expectedPlayers) {
      game = (await repositories.rooms.updateState({ id: game.id, phase: 'ready', currentRound: 0, now: timestamp }));
    }

    if (game.phase === 'playing') {
      game = (await closeExpiredRound(game, timestamp));
    }

    if (game.phase === 'results' && timestamp >= Number(game.updated_at) + GAME_RULES.resultsDuration) {
      game = (await repositories.rooms.updateState({ id: game.id, phase: 'ready', currentRound: game.current_round, now: timestamp }));
    }

    if (game.phase === 'final_results' && timestamp >= Number(game.updated_at) + GAME_RULES.finalResultsDuration) {
      const previousRounds = (await roundsFor(game)).map((round) => ({
        number: round.number,
        referencePrompt: round.referencePrompt,
        rubric: round.rubric,
        imagePath: round.imagePath,
      }));
      game = (await repositories.rooms.createCycle({ id: id(), now: timestamp }));
      (await repositories.rooms.putRounds(game.id, previousRounds, timestamp));
    }

    return game;
  }

  function visibleRoundNumber(game) {
    if (['idle', 'registration'].includes(game.phase)) return 1;
    if (game.phase === 'ready') return Math.min(GAME_RULES.rounds, Number(game.current_round) + 1);
    return Math.max(1, Math.min(GAME_RULES.rounds, Number(game.current_round) || 1));
  }

  async function publicMatchView({ game, roundNumber, session, match, timestamp, mode = 'wait_all' }) {
    const round = (await roundFor(game, roundNumber));
    if (!round) throw new ApiError(503, 'Rodada sem configuracao de avaliacao.');
    const submission = match
      ? (await repositories.submissions.listByMatch(match.id)).find((row) => String(row.session_id) === String(session.id))
      : null;
    const score = match
      ? (await repositories.scores.listByMatch(match.id)).find((row) => String(row.session_id) === String(session.id))
      : null;
    const resolvedMode = (await repositories.settings.get(modeKey(game.id, roundNumber, session.id))) || mode || 'wait_all';
    const startedAt = match?.startedAt ?? null;
    const deadlineAt = match?.deadlineAt ?? (timestamp + GAME_RULES.roundDuration);
    const timeoutEmpty = Boolean(
      score
      && submission?.prompt === ''
      && Number(submission?.submitted_at) >= Number(deadlineAt),
    );
    return {
      id: publicMatchHandle(game, roundNumber, session.stationId),
      image_url: round.imagePath,
      round_number: roundNumber,
      total_rounds: GAME_RULES.rounds,
      deadline_at: deadlineAt,
      started_at: startedAt,
      submitted_at: submission?.submitted_at ?? null,
      scored_at: score?.created_at ?? null,
      server_now: timestamp,
      player_name: session.playerName,
      first_name: firstName(session.playerName),
      user_prompt: submission?.prompt ?? '',
      percent: Number(score?.percent ?? 0),
      points: Number(score?.points ?? 0),
      scored: Boolean(score),
      submitted: Boolean(submission),
      status: score ? 'scored' : submission ? 'submitted' : match ? 'playing' : 'ready',
      gemini_status: timeoutEmpty ? 'timeout_empty' : score ? 'scored' : submission ? 'pending' : '',
      feedback: score?.explanation ?? null,
      fallback_used: timeoutEmpty ? false : undefined,
      duration_seconds: GAME_RULES.roundDuration,
      mode: resolvedMode,
    };
  }

  async function roundRanking(game, match) {
    if (!match) return [];
    const sessions = (await sessionsFor(game));
    const scores = (await repositories.scores.listByMatch(match.id));
    if (scores.length === 0) return [];
    return rankRound(scores).map((row) => {
      const session = sessions.find((item) => String(item.id) === String(row.session_id));
      return {
        ...row,
        player_name: session?.playerName || '',
        first_name: firstName(session?.playerName),
        duration_label: `${Math.floor(Number(row.elapsed_seconds || 0) / 60)}:${String(Math.floor(Number(row.elapsed_seconds || 0) % 60)).padStart(2, '0')}`,
      };
    });
  }

  async function finalRanking(game) {
    const sessions = (await sessionsFor(game));
    const totals = new Map(sessions.map((session) => [String(session.id), {
      station_id: session.stationId,
      session_id: session.id,
      player_name: session.playerName,
      first_name: firstName(session.playerName),
      total_points: 0,
      percent_sum: 0,
      rounds_completed: 0,
      total_time: 0,
    }]));

    for (const match of (await repositories.matches.listByGame(game.id))) {
      for (const score of (await repositories.scores.listByMatch(match.id))) {
        const row = totals.get(String(score.session_id));
        if (!row) continue;
        row.total_points += Number(score.points || 0);
        row.percent_sum += Number(score.percent || 0);
        row.rounds_completed += 1;
        row.total_time += Number(score.elapsed_seconds || 0);
      }
    }

    const rows = [...totals.values()].map((row) => ({
      ...row,
      avg_percent: row.rounds_completed ? row.percent_sum / row.rounds_completed : 0,
    }));
    return rankFinal(rows).map((row) => ({
      ...row,
      wins: row.position === 1 ? 1 : 0,
      duration_label: `${Math.floor(Number(row.total_time || 0) / 60)}:${String(Math.floor(Number(row.total_time || 0) % 60)).padStart(2, '0')}`,
    }));
  }

  async function roomView(game, timestamp) {
    const sessions = (await sessionsFor(game));
    const roundNumber = visibleRoundNumber(game);
    const round = (await roundFor(game, roundNumber));
    const match = (await matchFor(game, roundNumber));
    const accepted = new Set((await acceptedFor(game, roundNumber)));
    const submissions = match ? (await repositories.submissions.listByMatch(match.id)) : [];
    const scores = match ? (await repositories.scores.listByMatch(match.id)) : [];
    const submittedBySession = new Map(submissions.map((row) => [String(row.session_id), row]));
    const scoreBySession = new Map(scores.map((row) => [String(row.session_id), row]));
    const roundsCompletedBySession = new Map();
    for (const playedMatch of (await repositories.matches.listByGame(game.id))) {
      for (const playedScore of (await repositories.scores.listByMatch(playedMatch.id))) {
        const sessionId = String(playedScore.session_id);
        roundsCompletedBySession.set(sessionId, (roundsCompletedBySession.get(sessionId) || 0) + 1);
      }
    }

    const config = (await roomConfig(game));
    const expectedPlayers = config.expectedPlayers;
    const stations = await Promise.all(Array.from({ length: expectedPlayers }, (_, index) => index + 1).map(async (stationId) => {
      const session = sessions.find((row) => row.stationId === stationId);
      const sessionId = session ? String(session.id) : '';
      const acceptedRound = Boolean(session && accepted.has(sessionId));
      const submission = session ? submittedBySession.get(sessionId) : null;
      const score = session ? scoreBySession.get(sessionId) : null;
      const timeoutEmpty = Boolean(
        score
        && submission?.prompt === ''
        && match
        && Number(submission?.submitted_at) >= Number(match.deadlineAt),
      );
      const elapsed = submission && match
        ? Math.max(0, Number(submission.submitted_at) - Number(match.startedAt))
        : null;
      return {
        id: stationId,
        label: `PC ${stationId}`,
        session_id: session?.id ?? null,
        player_name: session?.playerName ?? '',
        first_name: firstName(session?.playerName),
        registered: Boolean(session),
        online: Boolean(session && timestamp - Number(session.lastSeenAt) <= 10),
        match_id: acceptedRound ? publicMatchHandle(game, roundNumber, stationId) : null,
        submitted: Boolean(submission),
        scored: Boolean(score),
        status: score ? 'scored' : submission ? 'submitted' : acceptedRound ? 'playing' : session ? 'registered' : 'idle',
        game_mode: session
          ? (await repositories.settings.get(modeKey(game.id, roundNumber, session.id))) || 'wait_all'
          : 'wait_all',
        total_rounds: GAME_RULES.rounds,
        rounds_completed: session ? roundsCompletedBySession.get(sessionId) || 0 : 0,
        match_status: score ? 'scored' : submission ? 'submitted' : acceptedRound ? 'playing' : null,
        gemini_status: timeoutEmpty ? 'timeout_empty' : score ? 'scored' : submission ? 'pending' : '',
        started_at: acceptedRound && match ? match.startedAt : null,
        submitted_at: submission?.submitted_at ?? null,
        elapsed_seconds: elapsed,
        duration_label: elapsed === null ? '' : `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`,
        percent: Number(score?.percent ?? 0),
        points: Number(score?.points ?? 0),
      };
    }));

    return {
      id: game.id,
      mode: config.mode,
      phase: game.phase,
      current_round: game.current_round,
      expected_stations: expectedPlayers,
      registered: sessions.length,
      playing_stations: accepted.size,
      scored: scores.length,
      all_registered: sessions.length === expectedPlayers,
      all_submitted: submissions.length === expectedPlayers,
      all_scored: scores.length === expectedPlayers,
      round: round ? {
        id: `${game.id}:${roundNumber}`,
        round_number: roundNumber,
        total_rounds: GAME_RULES.rounds,
        started_at: match?.startedAt ?? null,
        deadline_at: match?.deadlineAt ?? null,
        results_at: game.phase === 'results' ? Number(game.updated_at) : null,
        image_url: round.imagePath,
      } : null,
      game: {
        total_rounds: GAME_RULES.rounds,
        finished_at: game.phase === 'final_results' ? Number(game.updated_at) : null,
        tie_breaker: 'Criterio de desempate: maior pontuacao, depois acerto e menor tempo.',
      },
      stations,
      round_ranking: (await roundRanking(game, match)),
      final_ranking: (await finalRanking(game)),
    };
  }

  async function scoreSubmission({ match, session, submission, round, attempt }) {
    const result = await judge({
      referencePrompt: round.referencePrompt,
      rubric: round.rubric,
      candidatePrompt: submission.prompt,
      image: round.imagePath,
    });
    const scoredAt = now();
    (await repositories.results.recordJudgeAttempt({
      id: id(),
      submissionId: submission.id,
      attempt,
      status: 'succeeded',
      model: result.metadata?.model,
      rubricVersion: SCORING_VERSION,
      responseJson: JSON.stringify(result),
      now: scoredAt,
    }));
    const elapsed = Math.max(0, Math.min(GAME_RULES.roundDuration, submission.submitted_at - match.startedAt));
    const previous = (await repositories.scores.listByMatch(match.id)).filter((row) => row.submission_id !== submission.id);
    const ranked = rankRound([...previous, {
      id: id(),
      submission_id: submission.id,
      session_id: session.id,
      station_id: session.stationId,
      percent: result.percent,
      points: calculatePoints(result.percent, elapsed, GAME_RULES.roundDuration),
      elapsed_seconds: elapsed,
      scoring_version: SCORING_VERSION,
      explanation: result.explanation,
      created_at: scoredAt,
    }]);
    const current = ranked.find((row) => row.submission_id === submission.id);
    (await repositories.results.finalizeRound({ matchId: match.id, scores: [{
      id: current.id,
      submissionId: current.submission_id,
      sessionId: current.session_id,
      stationId: current.station_id,
      percent: current.percent,
      points: current.points,
      elapsedSeconds: current.elapsed_seconds,
      position: current.position,
      scoringVersion: current.scoring_version,
      explanation: current.explanation,
      now: scoredAt,
    }] }));
    (await repositories.scores.updatePositions(ranked.map((row) => ({ position: row.position, submissionId: row.submission_id }))));
    return result;
  }

  async function scoreTimeoutEmpty({ match, session, submission, attempt }) {
    const scoredAt = now();
    const explanation = 'Tempo encerrado sem prompt enviado. Pontuacao zerada nesta rodada.';
    (await repositories.results.recordJudgeAttempt({
      id: id(),
      submissionId: submission.id,
      attempt,
      status: 'skipped',
      rubricVersion: SCORING_VERSION,
      error: 'timeout_empty',
      now: scoredAt,
    }));
    const previous = (await repositories.scores.listByMatch(match.id)).filter((row) => row.submission_id !== submission.id);
    const ranked = rankRound([...previous, {
      id: id(),
      submission_id: submission.id,
      session_id: session.id,
      station_id: session.stationId,
      percent: 0,
      points: 0,
      elapsed_seconds: GAME_RULES.roundDuration,
      scoring_version: SCORING_VERSION,
      explanation,
      created_at: scoredAt,
    }]);
    const current = ranked.find((row) => row.submission_id === submission.id);
    (await repositories.results.finalizeRound({ matchId: match.id, scores: [{
      id: current.id,
      submissionId: current.submission_id,
      sessionId: current.session_id,
      stationId: current.station_id,
      percent: 0,
      points: 0,
      elapsedSeconds: GAME_RULES.roundDuration,
      position: current.position,
      scoringVersion: SCORING_VERSION,
      explanation,
      now: scoredAt,
    }] }));
    (await repositories.scores.updatePositions(ranked.map((row) => ({ position: row.position, submissionId: row.submission_id }))));
  }

  async function finishRoundIfReady(game, match, timestamp) {
    const scoreCount = (await repositories.scores.listByMatch(match.id)).length;
    if (scoreCount < (await expectedPlayersFor(game))) return game;
    const phase = match.roundNumber >= GAME_RULES.rounds ? 'final_results' : 'results';
    return (await repositories.rooms.updateState({ id: game.id, phase, currentRound: match.roundNumber, now: timestamp }));
  }

  async function closeExpiredRound(game, timestamp) {
    const match = (await matchFor(game, Number(game.current_round)));
    if (!match || timestamp <= Number(match.deadlineAt) + 2) return game;

    const submissions = (await repositories.submissions.listByMatch(match.id));
    const scores = (await repositories.scores.listByMatch(match.id));
    const submissionBySession = new Map(submissions.map((row) => [String(row.session_id), row]));
    const scoredSessions = new Set(scores.map((row) => String(row.session_id)));

    for (const session of (await sessionsFor(game))) {
      const sessionKey = String(session.id);
      if (scoredSessions.has(sessionKey)) continue;

      let submission = submissionBySession.get(sessionKey);
      if (!submission) {
        submission = {
          id: id(),
          matchId: match.id,
          sessionId: session.id,
          idempotencyKey: `timeout:${match.id}:${session.id}`,
          prompt: '',
          submittedAt: Number(match.deadlineAt),
        };
        (await repositories.results.submit(submission));
        submission = (await repositories.submissions.getByIdempotencyKey(submission.idempotencyKey));
      }

      (await repositories.results.recordJudgeAttempt({
        id: id(),
        submissionId: submission.id,
        attempt: (await repositories.judgeAttempts.listBySubmission(submission.id)).length + 1,
        status: 'skipped',
        rubricVersion: SCORING_VERSION,
        error: 'deadline_expired',
        now: timestamp,
      }));
      (await repositories.results.finalizeRound({ matchId: match.id, scores: [{
        id: id(),
        submissionId: submission.id,
        sessionId: session.id,
        stationId: session.stationId,
        percent: 0,
        points: 0,
        elapsedSeconds: GAME_RULES.roundDuration,
        position: (await expectedPlayersFor(game)),
        scoringVersion: SCORING_VERSION,
        explanation: 'Tempo esgotado antes da avaliacao.',
        now: timestamp,
      }] }));
      scoredSessions.add(sessionKey);
    }

    const ranked = rankRound((await repositories.scores.listByMatch(match.id)));
    (await repositories.scores.updatePositions(ranked.map((row) => ({
      position: row.position,
      submissionId: row.submission_id,
    }))));
    return (await finishRoundIfReady(game, match, timestamp));
  }

  function fmtStamp(seconds) {
    if (seconds === null || seconds === undefined) return '';
    const date = new Date(Number(seconds) * 1000);
    if (Number.isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hour}:${minute}`;
  }

  function fmtDurationLabel(seconds) {
    if (!Number.isFinite(Number(seconds)) || Number(seconds) < 0) return '';
    const total = Math.round(Number(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function dateKey(seconds) {
    const date = new Date(Number(seconds) * 1000);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function dayLabel(key) {
    return key ? `${key.slice(8, 10)}/${key.slice(5, 7)}` : '';
  }

  function fileBaseName(path) {
    if (!path) return '';
    return String(path).split('/').filter(Boolean).pop() || '';
  }

  async function reportMetrics(payload) {
    const startAt = payload.start_date ? Date.parse(`${payload.start_date}T00:00:00Z`) / 1000 : -Infinity;
    const endAt = payload.end_date ? (Date.parse(`${payload.end_date}T00:00:00Z`) / 1000) + 86400 : Infinity;
    if (Number.isNaN(startAt) || Number.isNaN(endAt) || startAt >= endAt) {
      throw new ApiError(422, 'Periodo do relatorio invalido.');
    }
    const nowSeconds = now();

    // O acumulado do relatorio e POR PESSOA, e nao por entrada de origem: uma
    // sala repetida ("Nova batalha nesta sala") entra uma vez para cada batalha
    // — e o recorte por batalha vive na tabela de salas —, mas quem jogou as
    // duas nao pode virar duas linhas na tabela de jogadores.
    const jogadoresDoRelatorio = new Map();
    const sessoesVistas = new Set();
    const playerRows = [];
    const matchRows = [];
    const gameRows = [];
    const sessionRows = [];
    const roundTotals = new Map();
    const scoredByDay = new Map(); // dia -> { matches_scored }
    const startedByDay = new Map(); // dia -> { matches_started }
    const sessionsByDay = new Map(); // dia -> { sessions }
    const scoredByHour = new Map(); // hora -> { matches_scored }
    const scoredByDayHour = new Map(); // "dia#hora" -> { matches_scored }
    const stationTotals = new Map();
    const modeTotals = new Map();
    const seenPlayers = new Set();
    const fallbackSubmissionIds = new Set();
    let activeStations = 0;

    for await (const { game, report, mode: gameMode, rounds: reportRounds } of reportSources(repositories)) {
      const sessions = new Map(report.sessions.map((session) => [String(session.id), session]));
      const matches = new Map(report.matches.map((match) => [String(match.id), match]));
      const submissions = report.submissions.filter((row) => row.submitted_at >= startAt && row.submitted_at < endAt);
      const scoresBySubmission = new Map(report.scores.map((score) => [String(score.submission_id), score]));
      const bestByRound = new Map();
      for (const submission of submissions) {
        const score = scoresBySubmission.get(String(submission.id));
        if (!score) continue;
        const key = `${submission.session_id}:${submission.match_id}`;
        const previous = bestByRound.get(key);
        if (!previous || Number(score.points ?? score.percent) > Number(previous.score.points ?? previous.score.percent)
          || (Number(score.points ?? score.percent) === Number(previous.score.points ?? previous.score.percent) && Number(score.percent) > Number(previous.score.percent))) {
          bestByRound.set(key, { id: submission.id, score });
        }
      }
      const countedSubmissions = new Set([...bestByRound.values()].map((entry) => entry.id));
      const playerTotals = new Map();

      // Sessoes cadastradas no periodo (participantes, mesmo sem envios)
      for (const session of report.sessions) {
        if (session.registeredAt < startAt || session.registeredAt >= endAt) continue;
        // Cadastro é da PESSOA: a mesma sessão aparece em cada batalha da sala
        // repetida, e listá-la duas vezes inflaria "cadastros" e o dia da
        // entrada. A primeira ocorrência fica e diz em que batalha entrou.
        if (sessoesVistas.has(String(session.id))) continue;
        sessoesVistas.add(String(session.id));
        sessionRows.push({
          session_id: session.id,
          station_id: session.stationId,
          player_name: session.playerName,
          email: session.email,
          role: session.role,
          company: session.company,
          lgpd_accepted: Boolean(session.consent),
          started_at: session.registeredAt,
          started_label: fmtStamp(session.registeredAt),
          mode: gameMode,
          game_id: game.id,
          cycle: game.cycle,
        });
        seenPlayers.add((session.email || session.playerName || '').toLowerCase());
        if (nowSeconds - Number(session.lastSeenAt) <= 600) activeStations += 1;
        const sessionDay = dateKey(session.registeredAt);
        if (sessionDay) {
          const bucket = sessionsByDay.get(sessionDay) || { sessions: 0 };
          bucket.sessions += 1;
          sessionsByDay.set(sessionDay, bucket);
        }
      }

      for (const submission of submissions) {
        const session = sessions.get(String(submission.session_id));
        const match = matches.get(String(submission.match_id));
        const score = scoresBySubmission.get(String(submission.id));
        if (!session || !match) continue;
        const round = reportRounds.find((entry) => entry.number === match.roundNumber);
        const fallbackUsed = [...(report.judgeAttempts || [])]
          .some((attempt) => String(attempt.submission_id) === String(submission.id)
            && typeof attempt.model === 'string' && attempt.model.startsWith('source-fallback'));
        if (fallbackUsed) fallbackSubmissionIds.add(String(submission.id));
        const submittedKey = dateKey(submission.submitted_at);
        if (submittedKey) {
          const startedBucket = startedByDay.get(submittedKey) || { matches_started: 0 };
          startedBucket.matches_started += 1;
          startedByDay.set(submittedKey, startedBucket);
          const hour = new Date(Number(submission.submitted_at) * 1000).getHours();
          const hourBucket = scoredByHour.get(hour) || { matches_scored: 0, matches_started: 0 };
          hourBucket.matches_started += 1;
          if (score) hourBucket.matches_scored += 1;
          scoredByHour.set(hour, hourBucket);
        }
        matchRows.push({
          game_id: game.id,
          cycle: game.cycle,
          round_number: match.roundNumber,
          station_id: session.stationId,
          player_name: session.playerName,
          email: session.email,
          role: session.role,
          company: session.company,
          user_prompt: submission.prompt,
          attempt: submission.attempt ?? 1,
          counts_for_ranking: countedSubmissions.has(submission.id),
          base_prompt: round?.referencePrompt ?? '',
          image_url: round?.imagePath ?? '',
          image_file: fileBaseName(round?.imagePath),
          submitted_at: submission.submitted_at,
          started_at: match.startedAt,
          started_label: fmtStamp(match.startedAt),
          submitted_label: fmtStamp(submission.submitted_at),
          percent: score?.percent ?? null,
          points: score?.points ?? null,
          elapsed_seconds: score?.elapsed_seconds ?? null,
          duration_label: fmtDurationLabel(score?.elapsed_seconds),
          status: score ? 'Pontuada' : 'Enviada',
          fallback_used: fallbackUsed,
          mode: gameMode,
        });
        if (score) {
          const day = dateKey(score.created_at || submission.submitted_at);
          const scoreDate = new Date(Number(score.created_at || submission.submitted_at) * 1000);
          const scoreHour = Number.isNaN(scoreDate.getTime()) ? -1 : scoreDate.getHours();
          if (day && scoreHour >= 0) {
            const scoredBucket = scoredByDay.get(day) || { matches_scored: 0 };
            scoredBucket.matches_scored += 1;
            scoredByDay.set(day, scoredBucket);
            const dayHourKey = `${day}#${scoreHour}`;
            const dayHourBucket = scoredByDayHour.get(dayHourKey) || { matches_scored: 0 };
            dayHourBucket.matches_scored += 1;
            scoredByDayHour.set(dayHourKey, dayHourBucket);
          }
          const stationKey = `PC ${session.stationId}`;
          const stationTotal = stationTotals.get(stationKey) || {
            label: stationKey,
            station_id: session.stationId,
            matches_started: 0,
            matches_scored: 0,
            percent_sum: 0,
          };
          stationTotal.matches_started += 1;
          stationTotal.matches_scored += 1;
          stationTotal.percent_sum += Number(score.percent || 0);
          stationTotals.set(stationKey, stationTotal);
          const modeTotal = modeTotals.get(gameMode) || {
            label: gameMode === 'classroom' ? 'Turma' : gameMode === 'arena' ? 'Arena' : 'Classico',
            mode: gameMode,
            matches_started: 0,
            matches_scored: 0,
            percent_sum: 0,
          };
          modeTotal.matches_started += 1;
          modeTotal.matches_scored += 1;
          modeTotal.percent_sum += Number(score.percent || 0);
          modeTotals.set(gameMode, modeTotal);
        }

        const key = String(session.id);
        const total = playerTotals.get(key) || {
          session_id: session.id,
          station_id: session.stationId,
          player_name: session.playerName,
          email: session.email,
          role: session.role,
          company: session.company,
          rounds_completed: 0,
          attempts_scored: 0,
          matches_started: 0,
          total_points: 0,
          percent_sum: 0,
          best_percent: 0,
          total_time: 0,
        };
        total.matches_started += 1;
        if (score) total.attempts_scored += 1;
        if (score && countedSubmissions.has(submission.id)) {
          total.rounds_completed += 1;
          total.total_points += Number(score.points || 0);
          total.percent_sum += Number(score.percent || 0);
          total.best_percent = Math.max(total.best_percent, Number(score.percent || 0));
          total.total_time += Number(score.elapsed_seconds || 0);
          const roundKey = `${game.id}:${match.roundNumber}`;
          const roundTotal = roundTotals.get(roundKey) || {
            game_id: game.id,
            cycle: game.cycle,
            round_number: match.roundNumber,
            matches_scored: 0,
            matches_started: 0,
            percent_sum: 0,
            points_sum: 0,
            started_at: match.startedAt,
            image_path: round?.imagePath ?? '',
          };
          roundTotal.matches_scored += 1;
          roundTotal.matches_started += 1;
          roundTotal.percent_sum += Number(score.percent || 0);
          roundTotal.points_sum += Number(score.points || 0);
          roundTotals.set(roundKey, roundTotal);
        }
        playerTotals.set(key, total);
      }

      const players = [...playerTotals.values()].map((row) => ({
        ...row,
        avg_percent: row.rounds_completed ? row.percent_sum / row.rounds_completed : 0,
        avg_response_seconds: row.rounds_completed ? row.total_time / row.rounds_completed : 0,
      }));
      for (const row of players) {
        const chave = String(row.session_id);
        const acumulado = jogadoresDoRelatorio.get(chave);
        if (!acumulado) {
          jogadoresDoRelatorio.set(chave, { ...row });
          continue;
        }
        acumulado.rounds_completed += row.rounds_completed;
        acumulado.attempts_scored += row.attempts_scored;
        acumulado.matches_started += row.matches_started;
        acumulado.total_points += row.total_points;
        acumulado.percent_sum += row.percent_sum;
        acumulado.total_time += row.total_time;
        acumulado.best_percent = Math.max(Number(acumulado.best_percent || 0), Number(row.best_percent || 0));
      }
      if (submissions.length || (game.created_at >= startAt && game.created_at < endAt)) {
        gameRows.push({
          id: game.id,
          cycle: game.cycle,
          phase: game.phase,
          mode: gameMode,
          players: players.length,
          matches_scored: players.reduce((sum, row) => sum + row.attempts_scored, 0),
          rounds_completed: players.reduce((sum, row) => sum + row.rounds_completed, 0),
          matches: submissions.length,
          sessions: report.sessions.filter((row) => row.registeredAt >= startAt && row.registeredAt < endAt).length,
          total_points: players.reduce((sum, row) => sum + row.total_points, 0),
          avg_percent: players.length ? players.reduce((sum, row) => sum + row.avg_percent, 0) / players.length : 0,
          created_at: game.created_at,
          created_label: fmtStamp(game.created_at),
          status: game.phase,
        });
      }
    }

    // Fim da varredura: as linhas de jogador saem do acumulado por pessoa, com
    // as medias recalculadas sobre o total de rodadas que ela jogou (duas
    // batalhas na mesma sala somam rodadas, e nao duas linhas).
    playerRows.push(...[...jogadoresDoRelatorio.values()].map((row) => ({
      ...row,
      avg_percent: row.rounds_completed ? row.percent_sum / row.rounds_completed : 0,
      avg_response_seconds: row.rounds_completed ? row.total_time / row.rounds_completed : 0,
    })));

    const scored = matchRows.filter((row) => row.percent !== null);
    const avgPercent = scored.length ? scored.reduce((sum, row) => sum + Number(row.percent), 0) / scored.length : 0;
    const avgResponse = scored.length ? scored.reduce((sum, row) => sum + Number(row.elapsed_seconds || 0), 0) / scored.length : 0;

    // Series diarias completas (ordem cronologica)
    const allDays = new Set([...scoredByDay.keys(), ...startedByDay.keys(), ...sessionsByDay.keys()]);
    const byDay = [...allDays].sort().map((day) => ({
      label: dayLabel(day),
      sessions: sessionsByDay.get(day)?.sessions || 0,
      matches_started: startedByDay.get(day)?.matches_started || 0,
      matches_scored: scoredByDay.get(day)?.matches_scored || 0,
    }));
    const byHour = Array.from({ length: 24 }, (_, hour) => {
      const bucket = scoredByHour.get(hour) || { matches_scored: 0, matches_started: 0 };
      return { label: `${String(hour).padStart(2, '0')}h`, value: bucket.matches_scored };
    });
    const byRound = [...roundTotals.values()].sort((a, b) => a.cycle - b.cycle || a.round_number - b.round_number).map((row) => ({
      ...row,
      label: `Rodada ${row.round_number}`,
      game_id: row.game_id,
      created_label: fmtStamp(row.started_at),
      image_file: fileBaseName(row.image_path),
      status: row.matches_started ? 'Rodada finalizada' : 'Sem partidas',
      matches: row.matches_started,
      scored: row.matches_scored,
      avg_percent: row.matches_scored ? row.percent_sum / row.matches_scored : 0,
      avg_points: row.matches_scored ? row.points_sum / row.matches_scored : 0,
    }));
    // Heatmap dia x hora (somente dias com pontuacao)
    const daysWithScores = new Set([...scoredByDayHour.keys()].map((key) => key.split('#')[0]));
    const byDayHour = [...daysWithScores].sort().map((day) => ({
      label: dayLabel(day),
      hours: Array.from({ length: 24 }, (_, hour) => ({
        label: `${String(hour).padStart(2, '0')}h`,
        matches_scored: scoredByDayHour.get(`${day}#${hour}`)?.matches_scored || 0,
      })),
    }));

    const topPlayers = [...playerRows]
      .sort((a, b) => Number(b.total_points || 0) - Number(a.total_points || 0)
        || Number(b.avg_percent || 0) - Number(a.avg_percent || 0)
        || String(a.player_name).localeCompare(String(b.player_name)))
      .map((row, index) => ({
        ...row,
        position: index + 1,
        matches_started: row.matches_started || row.rounds_completed,
        avg_seconds: row.avg_response_seconds || 0,
      }));
    const byStation = [...stationTotals.values()].map((row) => ({
      ...row,
      avg_percent: row.matches_scored ? row.percent_sum / row.matches_scored : 0,
    }));
    const byMode = [...modeTotals.values()].map((row) => ({
      ...row,
      avg_percent: row.matches_scored ? row.percent_sum / row.matches_scored : 0,
    }));

    const dayPeaks = [...scoredByDay.entries()]
      .map(([day, value]) => ({ day: dayLabel(day), value: value.matches_scored }))
      .sort((a, b) => b.value - a.value);
    const hourPeaks = [...scoredByHour.entries()]
      .map(([hour, value]) => ({ hour: `${String(hour).padStart(2, '0')}h`, value: value.matches_scored }))
      .sort((a, b) => b.value - a.value);

    // Sessoes (tabela do relatorio) enriquecidas com aproveitamento
    const totalsBySession = new Map(playerRows.map((row) => [String(row.session_id), row]));
    const decoratedSessions = sessionRows.map((row) => {
      const totals = totalsBySession.get(String(row.session_id));
      return {
        ...row,
        matches_started: totals?.matches_started || totals?.rounds_completed || 0,
        matches_scored: totals?.attempts_scored || 0,
        rounds_completed: totals?.rounds_completed || 0,
        avg_percent: totals?.avg_percent || 0,
        total_points: totals?.total_points || 0,
        best_percent: totals?.best_percent || 0,
        avg_seconds: totals?.avg_response_seconds || 0,
      };
    });

    const startDate = payload.start_date || null;
    const endDate = payload.end_date || null;
    const periodLabel = startDate && endDate
      ? `${dayLabel(startDate)}/${startDate.slice(0, 4)} a ${dayLabel(endDate)}/${endDate.slice(0, 4)}`
      : startDate
        ? `Desde ${dayLabel(startDate)}/${startDate.slice(0, 4)}`
        : endDate
          ? `Ate ${dayLabel(endDate)}/${endDate.slice(0, 4)}`
          : 'Todo o periodo';

    const rounds = [...roundTotals.values()].map((row) => ({
      ...row,
      avg_percent: row.matches_scored ? row.percent_sum / row.matches_scored : 0,
      avg_points: row.matches_scored ? row.points_sum / row.matches_scored : 0,
    }));
    return {
      period: { start_date: startDate, end_date: endDate, label: periodLabel },
      cards: {
        players: playerRows.length,
        total_sessions: sessionRows.length,
        unique_players: seenPlayers.size,
        games_started: gameRows.length,
        matches_started: matchRows.length,
        matches_scored: scored.length,
        completion_rate: matchRows.length ? scored.length / matchRows.length * 100 : 0,
        avg_percent: avgPercent,
        best_percent: scored.length ? Math.max(...scored.map((row) => Number(row.percent))) : 0,
        avg_response_seconds: avgResponse,
        peak_day: dayPeaks[0]?.day || '-',
        peak_day_value: dayPeaks[0]?.value || 0,
        peak_hour: hourPeaks[0]?.hour || '-',
        peak_hour_value: hourPeaks[0]?.value || 0,
        fallback_count: fallbackSubmissionIds.size,
        active_stations: activeStations,
      },
      tables: {
        players: playerRows,
        sessions: decoratedSessions,
        matches: matchRows,
        games: gameRows,
        rounds,
      },
      series: { by_day: byDay, by_hour: byHour, by_round: byRound, by_day_hour: byDayHour },
      by_day: byDay,
      by_hour: byHour,
      by_round: byRound,
      by_day_hour: byDayHour,
      top_players: topPlayers,
      by_station: byStation,
      by_mode: byMode,
    };
  }

  const loginLimiter = createLoginLimiter({ now });

  return async function dispatch(action, payload = {}, meta = {}) {
    object(payload);
    const timestamp = now();
    if (!Number.isFinite(timestamp)) throw new TypeError('now must be finite');

    switch (action) {
      case 'admin_login': {
        if (!adminAuth.configured) throw new ApiError(503, 'Acesso administrativo ainda nao configurado.');
        const loginKey = String(meta.ip || 'unknown');
        const limit = loginLimiter.check(loginKey);
        if (!limit.allowed) {
          throw new ApiError(429, `Muitas tentativas de acesso. Aguarde ${limit.retryAfter}s e tente novamente.`);
        }
        const login = adminAuth.login(text(payload.password, 'password', { min: 1, max: 200 }));
        if (!login) {
          loginLimiter.registerFailure(loginKey);
          // A causa viaja com a recusa: a tela de login precisa dizer "a senha esta
          // errada" (credencial invalida) e nao "sua sessao venceu" (o cookie que
          // estava ali). Mesmo status, mesma frase segura — o que muda e o motivo.
          throw new ApiError(401, 'Senha administrativa incorreta.', { reason: 'invalid_credentials' });
        }
        loginLimiter.reset(loginKey);
        return {
          ok: true,
          admin_token: login.token,
          expires_at: login.expiresAt,
          max_age: Math.max(1, Math.floor(login.expiresAt - timestamp)),
        };
      }

      case 'admin_logout': {
        // Idempotente: o cookie e limpo na camada HTTP; aqui so confirma.
        return { ok: true };
      }

      case 'admin_status': {
        requireAdmin(payload.admin_token);
        return { ok: true, authenticated: true };
      }

      case 'report_metrics': {
        requireAdmin(payload.admin_token);
        return { ok: true, metrics: (await reportMetrics(payload)) };
      }

      case 'configure_classroom': {
        requireAdmin(payload.admin_token);
        const expectedPlayers = integer(payload.expected_players, 'expected_players', { min: 1, max: 50 });
        const game = (await activeRoom());
        if (!['idle', 'registration'].includes(game.phase) || (await sessionsFor(game)).length) {
          throw new ApiError(409, 'Configure a turma antes do primeiro cadastro.');
        }
        (await repositories.rooms.ensureStations(game.id, expectedPlayers));
        (await repositories.settings.set(classroomKey(game.id), {
          mode: 'classroom', expectedPlayers, rosterLocked: false,
        }, timestamp));
        return { ok: true, room: (await roomView(game, timestamp)), server_now: timestamp, reset_at: resetAt(game) };
      }

      case 'start_classroom': {
        requireAdmin(payload.admin_token);
        const game = (await activeRoom());
        const config = (await roomConfig(game));
        const sessions = (await sessionsFor(game));
        if (config.mode !== 'classroom') throw new ApiError(409, 'A sala nao esta no modo turma.');
        if (game.phase !== 'registration') throw new ApiError(409, 'A turma ja foi iniciada.');
        if (sessions.length < 1) throw new ApiError(409, 'Cadastre ao menos um participante antes de iniciar.');

        (await repositories.settings.set(classroomKey(game.id), {
          ...config, expectedPlayers: sessions.length, rosterLocked: true,
        }, timestamp));
        // Abre a fase de instrucoes: o relogio da rodada 1 so comeca quando um
        // jogador clicar em "Pronto para a batalha!" (start_match aceita todos e
        // cria a partida com o prazo completo). Evita zerar quem ainda le as regras.
        const updated = (await repositories.rooms.updateState({ id: game.id, phase: 'ready', currentRound: 0, now: timestamp }));
        return { ok: true, room: (await roomView(updated, timestamp)), server_now: timestamp, reset_at: resetAt(game) };
      }

      case 'admin_reset': {
        requireAdmin(payload.admin_token);
        const previous = (await activeRoom());
        const rounds = (await roundsFor(previous)).map((round) => ({
          number: round.number,
          referencePrompt: round.referencePrompt,
          rubric: round.rubric,
          imagePath: round.imagePath,
        }));
        const game = (await repositories.rooms.createCycle({ id: id(), now: timestamp }));
        (await repositories.rooms.putRounds(game.id, rounds, timestamp));
        return { ok: true, room: (await roomView(game, timestamp)), server_now: timestamp, reset_at: resetAt(game) };
      }

      case 'register': {
        const playerName = text(payload.name, 'name', { min: 2, max: 120 });
        const email = text(payload.email, 'email', { min: 3, max: 254 });
        const role = text(payload.role, 'role', { max: 120 });
        const company = text(payload.company, 'company', { max: 160 });
        consent(payload.lgpd_accept);
        let game = (await repositories.rooms.getActive());
        if (!game) {
          game = (await repositories.rooms.createCycle({ id: id(), now: timestamp }));
          throw new ApiError(503, 'Sala criada sem desafios configurados.');
        }
        if (game.phase === 'idle') {
          game = (await repositories.rooms.updateState({ id: game.id, phase: 'registration', currentRound: 0, now: timestamp }));
        }
        game = (await advanceGame(game, timestamp));
        if (game.phase !== 'registration') throw new ApiError(409, 'O cadastro desta rodada esta encerrado.');
        const config = (await roomConfig(game));
        const occupied = new Set((await sessionsFor(game)).map((row) => row.stationId));
        const stationId = config.mode === 'classroom' && (payload.station_id === undefined || payload.station_id === null || payload.station_id === '')
          ? Array.from({ length: config.expectedPlayers }, (_, index) => index + 1).find((value) => !occupied.has(value))
          : integer(payload.station_id, 'station_id', { min: 1, max: config.expectedPlayers });
        if (!stationId) throw new ApiError(409, 'A turma atingiu o limite de participantes.');
        if ((await repositories.sessions.getActiveByStation(game.id, stationId))) throw new ApiError(409, 'Esta estacao ja foi cadastrada.');
        const sessionId = `${game.cycle}${stationId}`;
        const row = (await repositories.sessions.register({
          id: sessionId,
          gameId: game.id,
          stationId,
          token: id(),
          playerName,
          email,
          role,
          company,
          consent: true,
          now: timestamp,
        }));
        if (config.mode === 'classic' && (await sessionsFor(game)).length === config.expectedPlayers) {
          (await repositories.rooms.updateState({ id: game.id, phase: 'ready', currentRound: 0, now: timestamp }));
        }
        return { ok: true, session: publicSession(row, payload.mode || 'wait_all'), server_now: timestamp, reset_at: resetAt(game) };
      }

      case 'heartbeat': {
        const sessionId = text(String(payload.session_id ?? ''), 'session_id', { max: 200 });
        const { game, session } = (await sessionById(sessionId));
        (await repositories.sessions.heartbeat({ token: session.token, now: timestamp }));
        return { ok: true, server_now: timestamp, reset_at: resetAt(game) };
      }

      case 'room_status': {
        let game = (await advanceGame((await activeRoom()), timestamp));
        return { ok: true, room: (await roomView(game, timestamp)), server_now: timestamp, reset_at: resetAt(game) };
      }

      case 'start_match': {
        const resolved = (await sessionById(text(String(payload.session_id ?? ''), 'session_id', { max: 200 })));
        let game = (await advanceGame(resolved.game, timestamp));
        const session = resolved.session;
        const room = (await roomView(game, timestamp));
        if (room.mode === 'classic' && !room.all_registered) throw new ApiError(409, 'Aguardando o cadastro dos tres jogadores.');
        if (!['ready', 'playing', 'scoring'].includes(game.phase)) {
          throw new ApiError(409, 'Aguarde a proxima rodada.');
        }

        const roundNumber = game.phase === 'ready' ? Number(game.current_round) + 1 : Number(game.current_round);
        if (roundNumber < 1 || roundNumber > GAME_RULES.rounds) throw new ApiError(409, 'Todas as rodadas foram concluidas.');
        if (!(await roundFor(game, roundNumber))) throw new ApiError(503, 'Rodada sem configuracao de avaliacao.');

        let accepted;
        if (room.mode === 'classroom' && game.phase === 'ready') {
          for (const registered of (await sessionsFor(game))) (await acceptSession(game, roundNumber, registered, 'wait_all', timestamp));
          accepted = (await acceptedFor(game, roundNumber));
        } else {
          accepted = (await acceptSession(game, roundNumber, session, payload.mode || 'wait_all', timestamp));
        }
        let match = (await matchFor(game, roundNumber));
        if (accepted.length >= (await expectedPlayersFor(game)) && !match) {
          match = (await repositories.matches.create({
            id: `match-${game.id}-${roundNumber}`,
            gameId: game.id,
            roundNumber,
            startedAt: timestamp,
            deadlineAt: timestamp + GAME_RULES.roundDuration,
            now: timestamp,
          }));
          game = (await repositories.rooms.updateState({ id: game.id, phase: 'playing', currentRound: roundNumber, now: timestamp }));
        }

        return {
          ok: true,
          match: (await publicMatchView({ game, roundNumber, session, match, timestamp, mode: payload.mode || 'wait_all' })),
          session: publicSession(session, payload.mode || 'wait_all'),
          server_now: timestamp,
          reset_at: resetAt(game),
        };
      }

      case 'match_status': {
        const resolved = (await resolvePublicMatch(payload.match_id));
        const game = (await advanceGame(resolved.game, timestamp));
        const match = (await matchFor(game, resolved.roundNumber));
        return {
          ok: true,
          match: (await publicMatchView({ game, roundNumber: resolved.roundNumber, session: resolved.session, match, timestamp })),
          room: (await roomView(game, timestamp)),
          server_now: timestamp,
          reset_at: resetAt(game),
        };
      }

      case 'submit_prompt': {
        const handle = (await resolvePublicMatch(payload.match_id));
        let { game, match } = handle;
        const { session } = (await sessionById(text(String(payload.session_id ?? ''), 'session_id', { max: 200 })));
        if (!match) throw new ApiError(409, 'A rodada ainda aguarda o aceite dos tres jogadores.');
        if (timestamp > match.deadlineAt + 2 && !payload.timeout) throw new ApiError(409, 'O prazo desta rodada terminou.');
        if (session.stationId !== handle.handle.stationId || String(session.gameId) !== String(game.id)) {
          throw new ApiError(403, 'Partida nao pertence a esta sessao.');
        }

        const rawPrompt = String(payload.prompt ?? '').trim();

        const candidatePrompt = payload.timeout

          ? rawPrompt

          : text(payload.prompt, 'prompt', { min: 3 });
        const key = text(payload.token, 'token', { max: 200 });
        const idempotentSubmission = (await repositories.submissions.getByIdempotencyKey(key));
        if (idempotentSubmission) {
          if (idempotentSubmission.match_id !== match.id
              || String(idempotentSubmission.session_id) !== String(session.id)
              || idempotentSubmission.prompt !== candidatePrompt) {
            throw new ApiError(409, 'Token de envio ja utilizado.');
          }
        }

        const previousSubmission = (await repositories.submissions.listByMatch(match.id))
          .find((row) => String(row.session_id) === String(session.id));
        if (previousSubmission && previousSubmission.prompt !== candidatePrompt) {
          throw new ApiError(409, 'Uma resposta diferente ja foi enviada por esta estacao.');
        }

        const existing = idempotentSubmission || previousSubmission;
        if (existing) {
          const existingScore = (await repositories.scores.listByMatch(match.id))
            .find((row) => String(row.submission_id) === String(existing.id));
          if (!existingScore) {
            const round = (await roundFor(game, match.roundNumber));
            if (!round) throw new ApiError(503, 'Rodada sem configuracao de avaliacao.');
            const attempt = (await repositories.judgeAttempts.listBySubmission(existing.id)).length + 1;
            try {
              if (existing.prompt === '' && Number(existing.submitted_at) >= Number(match.deadlineAt)) {
                (await scoreTimeoutEmpty({ match, session, submission: existing, attempt }));
              } else {
                await scoreSubmission({ match, session, submission: existing, round, attempt });
              }
            } catch (error) {
              (await repositories.results.recordJudgeAttempt({
                id: id(),
                submissionId: existing.id,
                attempt,
                status: 'failed',
                error: String(error.message),
                now: timestamp,
              }));
              throw falhaDoTeto(error) || comCausa(new ApiError(502, 'Nao foi possivel avaliar o prompt agora.'), error);
            }
          }
          game = (await finishRoundIfReady(game, match, timestamp));
          return {
            ok: true,
            match: (await publicMatchView({ game, roundNumber: match.roundNumber, session, match, timestamp })),
            room: (await roomView(game, timestamp)),
            idempotent: true,
            server_now: timestamp,
            reset_at: resetAt(game),
          };
        }

        const round = (await roundFor(game, match.roundNumber));
        if (!round) throw new ApiError(503, 'Rodada sem configuracao de avaliacao.');
        const submission = {
          id: id(),
          matchId: match.id,
          sessionId: session.id,
          idempotencyKey: key,
          prompt: candidatePrompt,
          submittedAt: payload.timeout ? Number(match.deadlineAt) : timestamp,
        };
        (await repositories.results.submit(submission));
        try {
          const storedSubmission = (await repositories.submissions.getByIdempotencyKey(key));
          if (payload.timeout && candidatePrompt === '') {
            (await scoreTimeoutEmpty({ match, session, submission: storedSubmission, attempt: 1 }));
          } else {
            await scoreSubmission({
              match,
              session,
              submission: storedSubmission,
              round,
              attempt: 1,
            });
          }
        } catch (error) {
          (await repositories.results.recordJudgeAttempt({
            id: id(),
            submissionId: submission.id,
            attempt: 1,
            status: 'failed',
            error: String(error.message),
            now: timestamp,
          }));
          throw comCausa(new ApiError(502, 'Nao foi possivel avaliar o prompt agora.'), error);
        }

        game = (await finishRoundIfReady(game, match, now()));
        return {
          ok: true,
          match: (await publicMatchView({ game, roundNumber: match.roundNumber, session, match, timestamp: now() })),
          room: (await roomView(game, now())),
          server_now: now(),
          reset_at: resetAt(game),
        };
      }

      case 'retry_score': {
        const resolved = (await resolvePublicMatch(payload.match_id));
        let { game, session, match } = resolved;
        if (!match) throw new ApiError(404, 'Partida nao encontrada.');
        const submission = (await repositories.submissions.listByMatch(match.id))
          .find((row) => String(row.session_id) === String(session.id));
        if (!submission) throw new ApiError(404, 'Submissao nao encontrada.');
        const existingScore = (await repositories.scores.listByMatch(match.id))
          .find((row) => String(row.session_id) === String(session.id));
        if (!existingScore) {
          const round = (await roundFor(game, match.roundNumber));
          const attempt = (await repositories.judgeAttempts.listBySubmission(submission.id)).length + 1;
          try {
            await scoreSubmission({ match, session, submission, round, attempt });
          } catch (error) {
            (await repositories.results.recordJudgeAttempt({
              id: id(),
              submissionId: submission.id,
              attempt,
              status: 'failed',
              error: String(error.message),
              now: timestamp,
            }));
            throw falhaDoTeto(error) || comCausa(new ApiError(502, 'Nao foi possivel reavaliar o prompt agora.'), error);
          }
        }
        game = (await finishRoundIfReady(game, match, now()));
        return {
          ok: true,
          match: (await publicMatchView({ game, roundNumber: match.roundNumber, session, match, timestamp: now() })),
          room: (await roomView(game, now())),
          retry_queued: false,
          server_now: now(),
          reset_at: resetAt(game),
        };
      }

      case 'client_log': {
        const game = (await repositories.rooms.getActive());
        let sessionId = null;
        if (payload.session_id) sessionId = (await sessionById(String(payload.session_id))).session.id;
        (await repositories.clientLogs.append({
          gameId: game?.id ?? null,
          sessionId,
          level: String(payload.level || 'info').slice(0, 20),
          message: text(payload.message || payload.event, 'message', { max: 1000 }),
          context: payload.context || {},
          now: timestamp,
        }));
        return { ok: true };
      }

      case 'metrics': {
        const game = (await repositories.rooms.getActive());
        (await repositories.events.append({ gameId: game?.id ?? null, type: 'metrics', data: payload, now: timestamp }));
        return { ok: true };
      }

      default:
        throw new ApiError(404, 'Acao de API desconhecida.');
    }
  };
}
