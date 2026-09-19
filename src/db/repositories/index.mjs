function now(value) {
  if (!Number.isFinite(value)) throw new RangeError('now must be a finite server timestamp');
  return value;
}

const bool = (value) => Boolean(value);

function session(row) {
  if (!row) return undefined;
  return {
    id: row.id, gameId: row.game_id, stationId: row.station_id, token: row.token,
    playerName: row.player_name, email: row.email, role: row.role, company: row.company,
    consent: bool(row.consent), active: bool(row.active),
    registeredAt: row.registered_at, lastSeenAt: row.last_seen_at, endedAt: row.ended_at,
  };
}

function match(row) {
  if (!row) return undefined;
  return {
    id: row.id, gameId: row.game_id, roundNumber: row.round_number,
    startedAt: row.started_at, deadlineAt: row.deadline_at, endedAt: row.ended_at,
  };
}

import { createArenaRepositories } from './arena.mjs';

export function createRepositories(database) {
  const rooms = {
    async createCycle({ id, now: timestamp }) {
      now(timestamp);
      return database.transaction(async (db) => {
        await db.prepare(`UPDATE sessions
          SET active = 0, ended_at = ?, last_seen_at = ?
          WHERE active = 1 AND game_id IN (SELECT id FROM games WHERE active = 1)`)
          .run(timestamp, timestamp);
        await db.prepare('UPDATE games SET active = 0, updated_at = ? WHERE active = 1').run(timestamp);
        const cycle = (await db.prepare('SELECT COALESCE(MAX(cycle), 0) + 1 AS cycle FROM games').get()).cycle;
        await db.prepare(`INSERT INTO games
          (id, cycle, phase, current_round, active, created_at, updated_at)
          VALUES (?, ?, 'idle', 0, 1, ?, ?)`)
          .run(id, cycle, timestamp, timestamp);
        const stationInsert = db.prepare('INSERT INTO stations (game_id, station_id, label) VALUES (?, ?, ?)');
        for (let stationId = 1; stationId <= 3; stationId += 1) {
          await stationInsert.run(id, stationId, `Jogador ${stationId}`);
        }
        return rooms.getById(id);
      });
    },
    async updateState({ id, phase, currentRound, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare(`
        UPDATE games SET phase = ?, current_round = ?, updated_at = ? WHERE id = ?
      `).run(phase, currentRound, timestamp, id);
      if (result.changes !== 1) throw new Error('game not found');
      return rooms.getById(id);
    },
    async getById(id) { return database.prepare('SELECT * FROM games WHERE id = ?').get(id); },
    async getActive() { return database.prepare('SELECT * FROM games WHERE active = 1').get(); },
    async list() { return database.prepare('SELECT * FROM games ORDER BY cycle').all(); },
    async putRounds(gameId, rows, timestamp) {
      now(timestamp);
      return database.transaction(async (db) => {
        const statement = db.prepare(`INSERT INTO rounds
          (game_id, number, reference_prompt, rubric, image_path, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(game_id, number) DO UPDATE SET
            reference_prompt = excluded.reference_prompt,
            rubric = excluded.rubric,
            image_path = excluded.image_path`);
        for (const row of rows) {
          await statement.run(gameId, row.number, row.referencePrompt, row.rubric, row.imagePath, timestamp);
        }
      });
    },
    async ensureStations(gameId, count) {
      return database.transaction(async (db) => {
        const statement = db.prepare('INSERT OR IGNORE INTO stations (game_id, station_id, label) VALUES (?, ?, ?)');
        for (let stationId = 1; stationId <= count; stationId += 1) {
          await statement.run(gameId, stationId, `Jogador ${stationId}`);
        }
      });
    },
    async getState(id) {
      const game = await rooms.getById(id);
      if (!game) return undefined;
      const rounds = (await database.prepare('SELECT * FROM rounds WHERE game_id = ? ORDER BY number').all(id))
        .map((row) => ({ number: row.number, imagePath: row.image_path, referencePrompt: row.reference_prompt, rubric: row.rubric }));
      return { game, rounds };
    },
  };

  const sessions = {
    async register({ id, gameId, stationId, token, playerName, email = '', role = '', company = '', consent, now: timestamp }) {
      now(timestamp);
      await database.prepare(`INSERT INTO sessions
        (id, game_id, station_id, token, player_name, email, role, company, consent, active, registered_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
        .run(id, gameId, stationId, token, playerName, email, role, company, consent ? 1 : 0, timestamp, timestamp);
      return sessions.getByToken(token);
    },
    async heartbeat({ token, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ? AND active = 1').run(timestamp, token);
      if (result.changes !== 1) throw new Error('active session not found');
      return sessions.getByToken(token);
    },
    async end({ id, now: timestamp }) {
      now(timestamp);
      await database.prepare('UPDATE sessions SET active = 0, ended_at = ?, last_seen_at = ? WHERE id = ? AND active = 1')
        .run(timestamp, timestamp, id);
    },
    async getByToken(token) { return session(await database.prepare('SELECT * FROM sessions WHERE token = ?').get(token)); },
    async getActiveByStation(gameId, stationId) {
      return session(await database.prepare('SELECT * FROM sessions WHERE game_id = ? AND station_id = ? AND active = 1').get(gameId, stationId));
    },
    async listByGame(gameId) {
      return (await database.prepare('SELECT * FROM sessions WHERE game_id = ? ORDER BY registered_at').all(gameId)).map(session);
    },
  };

  const matches = {
    async create({ id, gameId, roundNumber, startedAt, deadlineAt, now: timestamp }) {
      now(timestamp);
      await database.prepare(`INSERT INTO matches
        (id, game_id, round_number, started_at, deadline_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, gameId, roundNumber, startedAt, deadlineAt, timestamp);
      return matches.getById(id);
    },
    async getById(id) { return match(await database.prepare('SELECT * FROM matches WHERE id = ?').get(id)); },
    async listByGame(gameId) {
      return (await database.prepare('SELECT * FROM matches WHERE game_id = ? ORDER BY round_number').all(gameId)).map(match);
    },
  };

  const submissions = {
    async getByIdempotencyKey(key) { return database.prepare('SELECT * FROM submissions WHERE idempotency_key = ?').get(key); },
    async listByMatch(matchId) {
      return database.prepare('SELECT * FROM submissions WHERE match_id = ? ORDER BY submitted_at').all(matchId);
    },
  };
  const scores = {
    async listByMatch(matchId) {
      return database.prepare(`SELECT scores.* FROM scores
        JOIN submissions ON submissions.id = scores.submission_id
        WHERE submissions.match_id = ? ORDER BY scores.position, scores.station_id`).all(matchId);
    },
    async updatePositions(rows) {
      return database.transaction(async (db) => {
        const statement = db.prepare('UPDATE scores SET position = ? WHERE submission_id = ?');
        for (const row of rows) {
          const result = await statement.run(row.position, row.submissionId);
          if (result.changes !== 1) throw new Error('score not found');
        }
      });
    },
  };

  const insertSubmission = (db, input) => db.prepare(`INSERT INTO submissions
    (id, match_id, session_id, idempotency_key, prompt, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(input.id, input.matchId, input.sessionId, input.idempotencyKey, input.prompt, input.submittedAt);
  const insertAttempt = (db, attempt) => db.prepare(`INSERT INTO judge_attempts
    (id, submission_id, attempt, status, model, rubric_version, response_json, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(attempt.id, attempt.submissionId, attempt.attempt, attempt.status,
      attempt.model ?? null, attempt.rubricVersion ?? null, attempt.responseJson ?? null,
      attempt.error ?? null, attempt.now);
  const insertScore = (db, row) => db.prepare(`INSERT INTO scores
    (id, submission_id, session_id, station_id, percent, points, elapsed_seconds,
     position, scoring_version, explanation, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const writeScores = async (db, scoreRows, matchId) => {
    for (const row of scoreRows) {
      now(row.now);
      if (matchId) {
        const owner = await db.prepare('SELECT match_id FROM submissions WHERE id = ?').get(row.submissionId);
        if (!owner || owner.match_id !== matchId) throw new Error('score submission does not belong to match');
      }
      await insertScore(db, row).run(row.id, row.submissionId, row.sessionId, row.stationId,
        row.percent, row.points, row.elapsedSeconds, row.position, row.scoringVersion, row.explanation, row.now);
    }
  };

  const judgeAttempts = {
    async listBySubmission(submissionId) {
      return database.prepare('SELECT * FROM judge_attempts WHERE submission_id = ? ORDER BY attempt')
        .all(submissionId);
    },
  };

  const results = {
    async submit(input) {
      now(input.submittedAt);
      const existing = await submissions.getByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        if (existing.id !== input.id || existing.match_id !== input.matchId ||
            existing.session_id !== input.sessionId || existing.prompt !== input.prompt) {
          throw new Error('idempotency key belongs to a different submission');
        }
        return existing;
      }
      await insertSubmission(database, input);
      return submissions.getByIdempotencyKey(input.idempotencyKey);
    },
    async recordJudgeAttempt(attempt) {
      now(attempt.now);
      await insertAttempt(database, attempt);
      return (await judgeAttempts.listBySubmission(attempt.submissionId)).at(-1);
    },
    async finalizeRound({ matchId, scores: scoreRows }) {
      return database.transaction(async (db) => {
        await writeScores(db, scoreRows, matchId);
        return scores.listByMatch(matchId);
      });
    },
    async record({ submission: input, scores: scoreRows, judgeAttempt }) {
      now(input.submittedAt);
      for (const row of scoreRows) now(row.now);
      if (judgeAttempt) now(judgeAttempt.now);
      return database.transaction(async (db) => {
        await insertSubmission(db, input);
        if (judgeAttempt) await insertAttempt(db, judgeAttempt);
        await writeScores(db, scoreRows, input.matchId);
        return submissions.getByIdempotencyKey(input.idempotencyKey);
      });
    },
  };

  const events = {
    async append({ gameId = null, type, data = {}, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare('INSERT INTO events (game_id, type, data_json, created_at) VALUES (?, ?, ?, ?)')
        .run(gameId, type, JSON.stringify(data), timestamp);
      return Number(result.lastInsertRowid);
    },
  };
  const clientLogs = {
    async append({ gameId = null, sessionId = null, level, message, context = {}, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare(`INSERT INTO client_logs
        (game_id, session_id, level, message, context_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(gameId, sessionId, level, message, JSON.stringify(context), timestamp);
      return Number(result.lastInsertRowid);
    },
  };
  const settings = {
    async set(key, value, timestamp) {
      now(timestamp);
      await database.prepare(`INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`)
        .run(key, JSON.stringify(value), timestamp);
    },
    async get(key) {
      const row = await database.prepare('SELECT value_json FROM settings WHERE key = ?').get(key);
      return row ? JSON.parse(row.value_json) : undefined;
    },
    /**
     * O valor E o texto cru guardado — o compare-and-swap compara o que foi
     * lido, e para isso precisa do byte que estava la, nao do objeto remontado.
     * `raw` e `null` quando a chave ainda nao existe.
     */
    async getComBruto(key) {
      const row = await database.prepare('SELECT value_json FROM settings WHERE key = ?').get(key);
      return row ? { value: JSON.parse(row.value_json), raw: row.value_json } : { value: undefined, raw: null };
    },
    /**
     * Grava SO se o que esta guardado ainda for o que `esperado` dizia ser.
     * Devolve `true` quando a gravacao aconteceu e `false` quando alguem gravou
     * no meio — o chamador rele e reaplica em cima do estado novo.
     *
     * `esperado === null` significa "a chave nao existia": a criacao usa
     * `DO NOTHING`, entao uma segunda criacao concorrente nao sobrescreve a
     * primeira (uma das duas descobre que perdeu e refaz a conta).
     *
     * Com `raw` (o texto) nada depende da ORDEM das chaves do JSON, que nao e
     * preservada por todo caminho de leitura.
     */
    async setSeIntacto(key, value, esperado, timestamp) {
      now(timestamp);
      const json = JSON.stringify(value);
      const result = esperado === null
        ? await database.prepare(`INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO NOTHING`).run(key, json, timestamp)
        : await database.prepare(`UPDATE settings SET value_json = ?, updated_at = ?
            WHERE key = ? AND value_json = ?`).run(json, timestamp, key, esperado);
      return result.changes === 1;
    },
    /** Remove uma chave de verdade: e o que evita estado orfao quando a sala sai. */
    async delete(key) {
      await database.prepare('DELETE FROM settings WHERE key = ?').run(key);
    },
  };
  const reports = {
    async forGame(gameId) {
      const game = await rooms.getById(gameId);
      if (!game) return undefined;
      const matchRows = await matches.listByGame(gameId);
      const ids = matchRows.map(({ id }) => id);
      const all = (table) => Promise.all(ids.map((id) => table(id)));
      const submissionRows = (await all(submissions.listByMatch)).flat();
      const scoreRows = (await all(scores.listByMatch)).flat();
      const judgeAttempts = await database.prepare(`SELECT judge_attempts.* FROM judge_attempts
        JOIN submissions ON submissions.id = judge_attempts.submission_id
        JOIN matches ON matches.id = submissions.match_id
        WHERE matches.game_id = ? ORDER BY judge_attempts.created_at`).all(gameId);
      return { game, sessions: await sessions.listByGame(gameId), matches: matchRows, submissions: submissionRows, scores: scoreRows, judgeAttempts };
    },
  };

  return { rooms, sessions, matches, submissions, scores, judgeAttempts, results, reports, events, clientLogs, settings, arena: createArenaRepositories(database) };
}