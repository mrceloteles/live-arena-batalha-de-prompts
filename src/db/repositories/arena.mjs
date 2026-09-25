import { randomUUID } from 'node:crypto';

import { requireRoomStatus, requireRoundStatus } from '../../domain/arena-state.mjs';

function now(value) {
  if (!Number.isFinite(value)) throw new RangeError('now must be a finite server timestamp');
  return value;
}

const bool = (value) => Boolean(value);

/**
 * Status de sala em que uma submissão sem nota ainda é TRABALHO.
 *
 * Só essas entram na retomada do pátio (`listAwaitingScore`). `ended`/`archived`
 * são aulas encerradas: disparar uma avaliação externa no boot para uma sala que
 * acabou seria custo e surpresa — e a submissão continua sem nota, visível no
 * histórico, sem ser promessa de nada.
 */
export const AWAITING_ROOM_STATUSES = Object.freeze(['draft', 'waiting', 'open', 'playing']);

function room(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    code: row.code,
    pin: row.pin ?? null,
    title: row.title,
    status: row.status,
    preset: row.preset ?? 'personalizado',
    expectedPlayers: Number(row.expected_players),
    settings: parseSettings(row.settings_json),
    // Batalha viva desta sala. A sala pode ser jogada mais de uma vez: ver
    // `room_rounds.cycle`.
    currentCycle: Number(row.current_cycle ?? 1),
    // Versao MONOTONA do estado da sala (ver o comentario de `revision` no
    // schema). Ela so sobe, e quem le compara antes de pintar.
    revision: Number(row.revision ?? 0),
    entryBlocked: bool(row.entry_blocked),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

function parseSettings(raw) {
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Rotulo do registro arquivado de quem saiu. Tem de ser unico dentro da sala
// (a tabela tem UNIQUE (room_id, name)) e legivel no relatorio: "Ana (saiu)" e,
// quando o mesmo nome ja saiu outras vezes, "Ana (saiu 2)".
async function rotuloDeArquivado(tx, roomId, clean) {
  for (let numero = 1; ; numero += 1) {
    const rotulo = numero === 1 ? `${clean} (saiu)` : `${clean} (saiu ${numero})`;
    const existe = await tx.prepare('SELECT 1 AS existe FROM arena_participants WHERE room_id = ? AND name = ?')
      .get(roomId, rotulo);
    if (!existe) return rotulo;
  }
}

function participant(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    token: row.token,
    stationNumber: row.station_number === null || row.station_number === undefined ? null : Number(row.station_number),
    email: row.email ?? '',
    role: row.role ?? '',
    company: row.company ?? '',
    consent: bool(row.consent ?? 0),
    active: bool(row.active),
    joinedAt: row.joined_at,
    lastSeenAt: row.last_seen_at,
  };
}

function challenge(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    title: row.title,
    modality: row.modality,
    mission: row.mission,
    context: row.context,
    referenceText: row.reference_text,
    referenceImage: row.reference_image,
    expectedResult: row.expected_result,
    attempts: Number(row.attempts),
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    speedWeight: row.speed_weight,
    category: row.category,
    judgeKind: row.judge_kind ?? 'criteria',
    referencePrompt: row.reference_prompt ?? '',
    rubric: row.rubric ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function round(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    roomId: row.room_id,
    cycle: Number(row.cycle ?? 1),
    position: Number(row.position),
    challengeId: row.challenge_id,
    modality: row.modality,
    status: row.status,
    startedAt: row.started_at,
    deadlineAt: row.deadline_at,
    pausedAt: row.paused_at ?? null,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

export function createArenaRepositories(database) {
  const rooms = {
    async create({
      id, code, title, status = 'draft', expectedPlayers = 0,
      preset = 'personalizado', pin = null, settings = {}, entryBlocked = false,
      now: timestamp,
    }) {
      now(timestamp);
      requireRoomStatus(status);
      const result = await database.prepare(`INSERT INTO arena_rooms
        (id, code, pin, title, status, preset, expected_players, settings_json,
         entry_blocked, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, code, pin ?? null, title, status, preset, expectedPlayers,
          JSON.stringify(settings || {}), entryBlocked ? 1 : 0, timestamp, timestamp);
      if (result.changes !== 1) throw new Error('could not create arena room');
      return rooms.getById(id);
    },
    async getById(id) { return room(await database.prepare('SELECT * FROM arena_rooms WHERE id = ?').get(id)); },
    async getByCode(code) { return room(await database.prepare('SELECT * FROM arena_rooms WHERE code = ?').get(String(code).trim().toUpperCase())); },
    async getByPin(pin) {
      return room(await database.prepare('SELECT * FROM arena_rooms WHERE pin = ?').get(String(pin ?? '').trim()));
    },
    async findByPinOrCode(value) {
      const clean = String(value ?? '').trim().toUpperCase();
      const pin = /^\d{6}$/.test(clean) ? clean : null;
      const rows = await database.prepare('SELECT * FROM arena_rooms WHERE pin = ? OR code = ? ORDER BY created_at DESC LIMIT 1')
        .all(pin, clean);
      return rows.length ? room(rows[0]) : undefined;
    },
    async list() {
      return (await database.prepare('SELECT * FROM arena_rooms ORDER BY created_at DESC').all()).map(room);
    },
    /**
     * Sobe a revisao da sala em um e devolve o valor NOVO.
     *
     * Chamado pelo funil unico de mutacao (`onRoomChanged`), e nao por cada
     * handler: e o unico ponto por onde TODA mudanca de sala passa, entao uma
     * mutacao nova nasce contando sem ninguem lembrar de incrementar. O que a
     * leitura usa e o valor da linha; o que o evento leva e este valor novo.
     */
    async bumpRevision({ id, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare(`UPDATE arena_rooms
        SET revision = revision + 1, updated_at = ?
        WHERE id = ?`)
        .run(timestamp, id);
      if (result.changes !== 1) throw new Error('arena room not found');
      const row = await database.prepare('SELECT revision FROM arena_rooms WHERE id = ?').get(id);
      return Number(row?.revision ?? 0);
    },

    async updateStatus({ id, status, now: timestamp, startedAt, endedAt }) {
      now(timestamp);
      requireRoomStatus(status);
      const result = await database.prepare(`UPDATE arena_rooms
        SET status = ?, updated_at = ?,
            started_at = COALESCE(?, started_at),
            ended_at = COALESCE(?, ended_at)
        WHERE id = ?`)
        .run(status, timestamp, startedAt ?? null, endedAt ?? null, id);
      if (result.changes !== 1) throw new Error('arena room not found');
      return rooms.getById(id);
    },
    /**
     * Devolve a sala ao estado de espera para a BATALHA NOVA.
     *
     * `started_at`/`ended_at` voltam a NULL porque sao da batalha, nao da sala:
     * quem quiser o inicio da batalha anterior le a rodada dela (o relatorio faz
     * isso). Os horarios antigos nao se perdem — ficam nas rodadas do ciclo
     * anterior, que e de onde o historico os le.
     */
    async reopenForNewBattle({ id, cycle, now: timestamp }) {
      now(timestamp);
      requireRoomStatus('open');
      const result = await database.prepare(`UPDATE arena_rooms
        SET status = 'open', current_cycle = ?, started_at = NULL, ended_at = NULL, updated_at = ?
        WHERE id = ?`)
        .run(cycle, timestamp, id);
      if (result.changes !== 1) throw new Error('arena room not found');
      return rooms.getById(id);
    },
    async update({ id, title, expectedPlayers, entryBlocked, now: timestamp }) {
      now(timestamp);
      if (title !== undefined && (typeof title !== 'string' || title.trim().length < 2)) {
        throw new RangeError('title must be a non-empty string');
      }
      if (expectedPlayers !== undefined && (!Number.isInteger(expectedPlayers) || expectedPlayers < 0 || expectedPlayers > 50)) {
        throw new RangeError('expectedPlayers must be between 0 and 50');
      }
      const result = await database.prepare(`UPDATE arena_rooms
        SET title = COALESCE(?, title),
            expected_players = COALESCE(?, expected_players),
            entry_blocked = COALESCE(?, entry_blocked),
            updated_at = ?
        WHERE id = ?`)
        .run(
          title !== undefined ? title.trim() : null,
          expectedPlayers !== undefined ? expectedPlayers : null,
          entryBlocked !== undefined ? (entryBlocked ? 1 : 0) : null,
          timestamp,
          id,
        );
      if (result.changes !== 1) throw new Error('arena room not found');
      return rooms.getById(id);
    },
    async delete(id) {
      await database.transaction(async (db) => {
        await db.prepare('DELETE FROM arena_judge_attempts WHERE submission_id IN (SELECT id FROM arena_submissions WHERE room_id = ?)').run(id);
        await db.prepare('DELETE FROM arena_scores WHERE submission_id IN (SELECT id FROM arena_submissions WHERE room_id = ?)').run(id);
        await db.prepare('DELETE FROM arena_submissions WHERE room_id = ?').run(id);
        await db.prepare('DELETE FROM room_rounds WHERE room_id = ?').run(id);
        await db.prepare('DELETE FROM arena_participants WHERE room_id = ?').run(id);
        await db.prepare('DELETE FROM arena_rooms WHERE id = ?').run(id);
      });
    },
  };

  const participants = {
    async join({
      id, roomId, name, token, now: timestamp,
      stationNumber = null, email = '', role = '', company = '', consent = false,
    }) {
      now(timestamp);
      const clean = String(name).trim();
      if (clean.length < 2) throw new RangeError('name must be at least 2 characters');
      const result = await database.prepare(`INSERT INTO arena_participants
        (id, room_id, name, token, station_number, email, role, company, consent,
         active, joined_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
        .run(id, roomId, clean, token,
          stationNumber ?? null, String(email || ''), String(role || ''), String(company || ''),
          consent ? 1 : 0, timestamp, timestamp);
      if (result.changes !== 1) throw new Error('could not join arena room');
      return participants.getById(id);
    },
    // Alocacao ATOMICA de estacao: leitura + insert dentro de uma transacao
    // (BEGIN IMMEDIATE). Com 30/50 alunos chegando juntos, a leitura fora da
    // transacao fazia varios escolherem a mesma estacao livre e colidirem no
    // indice unico — com a transacao, as alocacoes se serializam.
    async joinWithNextStation({ id, roomId, name, token, limit, now: timestamp }) {
      return database.transaction(async (tx) => {
        const clean = String(name).trim();
        if (clean.length < 2) throw new RangeError('name must be at least 2 characters');
        const rows = await tx.prepare('SELECT station_number FROM arena_participants WHERE room_id = ? AND active = 1 AND station_number IS NOT NULL')
          .all(roomId);
        const occupied = new Set(rows.map((row) => Number(row.station_number)));
        let station = null;
        for (let candidate = 1; candidate <= limit; candidate += 1) {
          if (!occupied.has(candidate)) { station = candidate; break; }
        }
        if (station == null) return { full: true };
        const result = await tx.prepare(`INSERT INTO arena_participants
          (id, room_id, name, token, station_number, email, role, company, consent,
           active, joined_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, '', '', '', 0, 1, ?, ?)`)
          .run(id, roomId, clean, token, station, timestamp, timestamp);
        if (result.changes !== 1) throw new Error('could not join arena room');
        return { full: false, station };
      });
    },
    async reactivate({ id, token, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare('UPDATE arena_participants SET active = 1, token = ?, joined_at = ?, last_seen_at = ? WHERE id = ?')
        .run(token, timestamp, timestamp, id);
      if (result.changes !== 1) throw new Error('participant not found');
      return participants.getById(id);
    },
    // Reentrada de quem o professor JA tinha removido. Nome+PIN nao provam que
    // a pessoa e o titular, entao devolver o registro antigo (token novo no
    // mesmo id) entregava a quem digitasse o nome o e-mail, a empresa, o
    // consentimento e os pontos de outro aluno. Aqui o registro antigo e
    // ARQUIVADO com um rotulo que o professor le no relatorio e o aluno entra
    // como participante NOVO: sem PII e sem historico. O token antigo e
    // rotacionado na mesma transacao (a sessao ja estava morta pelo `active`).
    // Tudo dentro de BEGIN IMMEDIATE: o nome unico da sala nao pode ser
    // liberado e reocupado por dois caminhos ao mesmo tempo.
    async rejoin({ id, retiredId, roomId, name, token, limit, now: timestamp }) {
      return database.transaction(async (tx) => {
        const clean = String(name).trim();
        if (clean.length < 2) throw new RangeError('name must be at least 2 characters');
        const previous = await tx.prepare('SELECT id, active FROM arena_participants WHERE room_id = ? AND name = ?')
          .get(roomId, clean);
        if (previous?.active) return { taken: true };
        if (previous && String(previous.id) !== String(retiredId)) return { taken: true };
        if (previous) {
          await tx.prepare('UPDATE arena_participants SET name = ?, token = ? WHERE id = ?')
            .run(await rotuloDeArquivado(tx, roomId, clean), randomUUID(), previous.id);
        }
        const rows = await tx.prepare('SELECT station_number FROM arena_participants WHERE room_id = ? AND active = 1 AND station_number IS NOT NULL')
          .all(roomId);
        const occupied = new Set(rows.map((row) => Number(row.station_number)));
        let station = null;
        for (let candidate = 1; candidate <= limit; candidate += 1) {
          if (!occupied.has(candidate)) { station = candidate; break; }
        }
        if (station == null) return { full: true };
        const result = await tx.prepare(`INSERT INTO arena_participants
          (id, room_id, name, token, station_number, email, role, company, consent,
           active, joined_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, '', '', '', 0, 1, ?, ?)`)
          .run(id, roomId, clean, token, station, timestamp, timestamp);
        if (result.changes !== 1) throw new Error('could not rejoin arena room');
        return { full: false, station };
      });
    },
    async setProfile({ id, email, role, company, consent, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare(`UPDATE arena_participants
        SET email = ?, role = ?, company = ?, consent = ?, last_seen_at = ?
        WHERE id = ? AND active = 1`)
        .run(String(email || ''), String(role || ''), String(company || ''), consent ? 1 : 0, timestamp, id);
      if (result.changes !== 1) throw new Error('participant not found');
      return participants.getById(id);
    },
    async activeStations(roomId) {
      const rows = await database.prepare('SELECT station_number FROM arena_participants WHERE room_id = ? AND active = 1 AND station_number IS NOT NULL')
        .all(roomId);
      return rows.map((row) => Number(row.station_number)).sort((a, b) => a - b);
    },
    async getById(id) { return participant(await database.prepare('SELECT * FROM arena_participants WHERE id = ?').get(id)); },
    async getByName(roomId, name) {
      return participant(await database.prepare('SELECT * FROM arena_participants WHERE room_id = ? AND name = ?').get(roomId, String(name).trim()));
    },
    async listByRoom(roomId) {
      return (await database.prepare('SELECT * FROM arena_participants WHERE room_id = ? ORDER BY joined_at').all(roomId)).map(participant);
    },
    async countActive(roomId) {
      const row = await database.prepare('SELECT COUNT(*) AS count FROM arena_participants WHERE room_id = ? AND active = 1').get(roomId);
      return Number(row.count || 0);
    },
    async remove({ id, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare('UPDATE arena_participants SET active = 0, last_seen_at = ? WHERE id = ? AND active = 1')
        .run(timestamp, id);
      if (result.changes !== 1) throw new Error('participant not found');
      return participants.getById(id);
    },
    /**
     * Tira a turma inteira da sala, para a batalha nova com a PRÓXIMA turma.
     *
     * O registro não é apagado — `active = 0` é o mesmo caminho de "remover
     * participante" e é o que mantém nome, e-mail e notas no relatório. Os
     * tokens morrem junto, então quem estava na tela volta ao formulário de
     * entrada em vez de continuar jogando na batalha que não é dele.
     */
    async deactivateAll({ roomId, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare('UPDATE arena_participants SET active = 0, last_seen_at = ? WHERE room_id = ? AND active = 1')
        .run(timestamp, roomId);
      return Number(result.changes || 0);
    },
    async rename({ id, name, now: timestamp }) {
      now(timestamp);
      const clean = String(name).trim();
      if (clean.length < 2) throw new RangeError('name must be at least 2 characters');
      const result = await database.prepare('UPDATE arena_participants SET name = ?, last_seen_at = ? WHERE id = ? AND active = 1')
        .run(clean, timestamp, id);
      if (result.changes !== 1) throw new Error('participant not found');
      return participants.getById(id);
    },
    async heartbeat({ id, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare('UPDATE arena_participants SET last_seen_at = ? WHERE id = ? AND active = 1')
        .run(timestamp, id);
      if (result.changes !== 1) throw new Error('participant session not found');
      return participants.getById(id);
    },
  };

  /** Upsert de um desafio no adaptador informado (da transacao, quando houver). */
  const applyChallenge = async (db, { id, title, modality, mission, context = '', referenceText = '', referenceImage = '',
    expectedResult = '', attempts = 1, durationSeconds = null, speedWeight = 'none', category = 'Fundamentos',
    judgeKind = 'criteria', referencePrompt = '', rubric = '', criteria = [], now: timestamp }) => {
    now(timestamp);
    if (!Array.isArray(criteria)) throw new TypeError('criteria must be an array');
    await db.prepare(`INSERT INTO challenges
      (id, title, modality, mission, context, reference_text, reference_image,
       expected_result, attempts, duration_seconds, speed_weight, category,
       judge_kind, reference_prompt, rubric, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title, modality = excluded.modality, mission = excluded.mission,
        context = excluded.context, reference_text = excluded.reference_text,
        reference_image = excluded.reference_image, expected_result = excluded.expected_result,
        attempts = excluded.attempts, duration_seconds = excluded.duration_seconds,
        speed_weight = excluded.speed_weight, category = excluded.category,
        judge_kind = excluded.judge_kind, reference_prompt = excluded.reference_prompt,
        rubric = excluded.rubric,
        updated_at = excluded.updated_at`)
      .run(id, title, modality, mission, context, referenceText, referenceImage,
        expectedResult, attempts, durationSeconds, speedWeight, category,
        judgeKind, referencePrompt, rubric, timestamp, timestamp);
    await db.prepare('DELETE FROM challenge_criteria WHERE challenge_id = ?').run(id);
    const insert = db.prepare('INSERT INTO challenge_criteria (challenge_id, criterion, weight) VALUES (?, ?, ?)');
    for (const entry of criteria) {
      await insert.run(id, entry.criterion, Number(entry.weight));
    }
  };

  const challenges = {
    async save(input) {
      await database.transaction((db) => applyChallenge(db, input));
      return challenges.getById(input.id);
    },
    /**
     * Varios desafios numa transacao so: ou entra tudo, ou nao entra nada. E o
     * que a tela unica das pendencias usa — uma chamada, sem lote pela metade.
     */
    async saveMany(inputs) {
      await database.transaction(async (db) => {
        for (const input of inputs) await applyChallenge(db, input);
      });
      const saved = [];
      for (const input of inputs) saved.push(await challenges.getById(input.id));
      return saved;
    },
    /**
     * Grava SO a duracao de varios desafios, numa transacao. O tempo vive no
     * desafio (nao na rodada), entao aceitar as sugestoes de tempo de uma sala
     * passa por aqui — sem tocar em texto, imagem ou criterio nenhum.
     */
    async setDurations({ entries = [], now: timestamp } = {}) {
      now(timestamp);
      await database.transaction(async (db) => {
        for (const entry of entries) {
          const result = await db.prepare('UPDATE challenges SET duration_seconds = ?, updated_at = ? WHERE id = ?')
            .run(entry.durationSeconds ?? null, timestamp, entry.id);
          if (result.changes !== 1) throw new Error(`challenge not found: ${entry.id}`);
        }
      });
      const saved = [];
      for (const entry of entries) saved.push(await challenges.getById(entry.id));
      return saved;
    },
    async getById(id) {
      const row = await database.prepare('SELECT * FROM challenges WHERE id = ?').get(id);
      if (!row) return undefined;
      const criteria = (await database.prepare('SELECT criterion, weight FROM challenge_criteria WHERE challenge_id = ? ORDER BY weight DESC').all(id))
        .map((entry) => ({ criterion: entry.criterion, weight: Number(entry.weight) }));
      return { ...challenge(row), criteria };
    },
    async list() {
      const rows = await database.prepare('SELECT * FROM challenges ORDER BY updated_at DESC').all();
      const criteriaRows = await database.prepare('SELECT challenge_id, criterion, weight FROM challenge_criteria').all();
      const byChallenge = new Map();
      for (const entry of criteriaRows) {
        const list = byChallenge.get(entry.challenge_id) || [];
        list.push({ criterion: entry.criterion, weight: Number(entry.weight) });
        byChallenge.set(entry.challenge_id, list);
      }
      return rows.map((row) => ({
        ...challenge(row),
        criteria: (byChallenge.get(row.id) || []).sort((a, b) => b.weight - a.weight),
      }));
    },
    async delete(id) {
      await database.transaction(async (db) => {
        await db.prepare('DELETE FROM challenge_criteria WHERE challenge_id = ?').run(id);
        await db.prepare('DELETE FROM challenges WHERE id = ?').run(id);
      });
    },
  };

  const rounds = {
    async add({ id, roomId, cycle, position, challengeId, modality, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare(`INSERT INTO room_rounds
        (id, room_id, cycle, position, challenge_id, modality, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`)
        .run(id, roomId, cycle ?? 1, position, challengeId, modality, timestamp);
      if (result.changes !== 1) throw new Error('could not add round');
      return rounds.getById(id);
    },
    async getById(id) { return round(await database.prepare('SELECT * FROM room_rounds WHERE id = ?').get(id)); },
    /**
     * Em quantas OUTRAS salas este desafio e usado. O tempo pertence ao desafio,
     * entao mudar aqui muda a aula das outras salas — o painel precisa dizer isso
     * antes do professor aceitar a sugestao.
     */
    async countOtherRoomsByChallenge(challengeId, roomId) {
      const row = await database.prepare('SELECT COUNT(DISTINCT room_id) AS rooms FROM room_rounds WHERE challenge_id = ? AND room_id <> ?')
        .get(String(challengeId), String(roomId));
      return Number(row?.rooms || 0);
    },
    /**
     * As rodadas da BATALHA VIVA da sala.
     *
     * O recorte e do ciclo corrente (`arena_rooms.current_cycle`), e nao de
     * todas as rodadas da sala: quem consome esta leitura — prontidao, avanco
     * automatico, painel, tela do aluno, TV, ranking — esta perguntando pelo
     * jogo de agora. As rodadas das batalhas anteriores continuam no banco, com
     * os envios e as notas presos a elas, e sao lidas por `listByRoomCycle`.
     *
     * Passar o ciclo pelo chamador teria 30 oportunidades de esquecer; o
     * `current_cycle` e uma coluna, e nao um `MAX(cycle)`, justamente para que
     * apagar as missoes do ciclo novo nao faca a tela voltar para a batalha
     * anterior.
     */
    async listByRoom(roomId) {
      const rows = await database.prepare(`SELECT room_rounds.* FROM room_rounds
        JOIN arena_rooms ON arena_rooms.id = room_rounds.room_id
          AND arena_rooms.current_cycle = room_rounds.cycle
        WHERE room_rounds.room_id = ?
        ORDER BY room_rounds.position`).all(roomId);
      return rows.map(round);
    },
    /** As rodadas de UM ciclo — o caminho do historico e do relatorio. */
    async listByRoomCycle(roomId, cycle) {
      return (await database.prepare('SELECT * FROM room_rounds WHERE room_id = ? AND cycle = ? ORDER BY position')
        .all(roomId, cycle)).map(round);
    },
    /**
     * As batalhas da sala, da primeira para a ultima, com o que a tela precisa
     * para dizer "o que ja foi jogado aqui": quantas missoes, quando comecou e
     * quando terminou a ultima delas.
     */
    async cycles(roomId) {
      const rows = await database.prepare(`SELECT cycle, COUNT(*) AS rounds,
          MIN(created_at) AS created_at,
          MAX(COALESCE(ended_at, started_at)) AS last_at,
          SUM(CASE WHEN status <> 'pending' THEN 1 ELSE 0 END) AS started
        FROM room_rounds WHERE room_id = ? GROUP BY cycle ORDER BY cycle`).all(roomId);
      return rows.map((row) => ({
        cycle: Number(row.cycle),
        rounds: Number(row.rounds),
        started: Number(row.started || 0),
        createdAt: Number(row.created_at),
        lastAt: row.last_at === null || row.last_at === undefined ? null : Number(row.last_at),
      }));
    },
    /**
     * A batalha nova: clona as rodadas do ciclo atual como `pending` no ciclo
     * seguinte, com ids novos.
     *
     * Tudo numa transacao porque o numero do ciclo e o `MAX(cycle)` lido la
     * dentro: duas requisicoes simultaneas leriam o mesmo N e a segunda colidiria
     * na chave `(room_id, cycle, position)`. A originalidade das rodadas vem de
     * `id` novo — reaproveitar os ids faria as submissoes do ciclo anterior
     * aparecerem como se fossem desta batalha.
     */
    async cloneForNewCycle({ roomId, now: timestamp }) {
      now(timestamp);
      return database.transaction(async (tx) => {
        const source = await tx.prepare(`SELECT * FROM room_rounds WHERE room_id = ? AND cycle = (
            SELECT current_cycle FROM arena_rooms WHERE id = ?) ORDER BY position`).all(roomId, roomId);
        if (source.length === 0) return { rounds: [], cycle: null, room: undefined };
        const cycle = Number((await tx.prepare('SELECT COALESCE(MAX(cycle), 0) AS cycle FROM room_rounds WHERE room_id = ?').get(roomId)).cycle) + 1;
        const insert = tx.prepare(`INSERT INTO room_rounds
          (id, room_id, cycle, position, challenge_id, modality, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`);
        for (const row of source) {
          await insert.run(randomUUID(), roomId, cycle, Number(row.position), row.challenge_id, row.modality, timestamp);
        }
        // O ponteiro da batalha e o estado da sala viram NA MESMA transacao: um
        // ciclo clonado que nao se torna o corrente seria uma batalha invisivel,
        // e o proximo pedido criaria outro ciclo em cima dele.
        const reopened = await rooms.reopenForNewBattle({ id: roomId, cycle, now: timestamp });
        return {
          cycle,
          room: reopened,
          rounds: source.map((row) => ({ position: Number(row.position), challengeId: row.challenge_id })),
        };
      });
    },
    async remove(id) {
      await database.transaction(async (db) => {
        const removed = await db.prepare('SELECT room_id FROM room_rounds WHERE id = ?').get(id);
        await db.prepare('DELETE FROM arena_judge_attempts WHERE submission_id IN (SELECT id FROM arena_submissions WHERE round_id = ?)').run(id);
        await db.prepare('DELETE FROM arena_scores WHERE submission_id IN (SELECT id FROM arena_submissions WHERE round_id = ?)').run(id);
        await db.prepare('DELETE FROM arena_submissions WHERE round_id = ?').run(id);
        await db.prepare('DELETE FROM room_rounds WHERE id = ?').run(id);
        if (removed) {
          const remaining = await db.prepare('SELECT id FROM room_rounds WHERE room_id = ? ORDER BY position').all(removed.room_id);
          const update = db.prepare('UPDATE room_rounds SET position = ? WHERE id = ?');
          for (let index = 0; index < remaining.length; index += 1) await update.run(index + 1, remaining[index].id);
        }
      });
    },
    async reorder({ roomId, positions }) {
      return database.transaction(async (db) => {
        // Passo 1: desloca todas para fora do intervalo (evita conflito UNIQUE ao trocar).
        await db.prepare('UPDATE room_rounds SET position = position + 10000 WHERE room_id = ?').run(roomId);
        // Passo 2: aplica a ordem final.
        const statement = db.prepare('UPDATE room_rounds SET position = ? WHERE id = ? AND room_id = ?');
        for (let index = 0; index < positions.length; index += 1) {
          const result = await statement.run(index + 1, positions[index], roomId);
          if (result.changes !== 1) throw new Error('round not found');
        }
      });
    },
    async updateStatus({ id, status, now: timestamp, startedAt, deadlineAt, endedAt }) {
      now(timestamp);
      requireRoundStatus(status);
      const result = await database.prepare(`UPDATE room_rounds
        SET status = ?, started_at = COALESCE(?, started_at),
            deadline_at = COALESCE(?, deadline_at),
            ended_at = COALESCE(?, ended_at)
        WHERE id = ?`)
        .run(status, startedAt ?? null, deadlineAt ?? null, endedAt ?? null, id);
      if (result.changes !== 1) throw new Error('round not found');
      return rounds.getById(id);
    },
    async setPaused({ id, pausedAt, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare('UPDATE room_rounds SET paused_at = ? WHERE id = ?')
        .run(pausedAt, id);
      if (result.changes !== 1) throw new Error('round not found');
      return rounds.getById(id);
    },
    async resume({ id, pausedAt, now: timestamp }) {
      // Estende o prazo pela duracao da pausa quando havia deadline; sem prazo, apenas limpa a pausa.
      now(timestamp);
      const result = await database.prepare(`UPDATE room_rounds
        SET paused_at = NULL,
            deadline_at = CASE
              WHEN deadline_at IS NOT NULL AND ? IS NOT NULL THEN deadline_at + (? - ?)
              ELSE deadline_at
            END
        WHERE id = ?`)
        .run(pausedAt, timestamp, pausedAt, id);
      if (result.changes !== 1) throw new Error('round not found');
      return rounds.getById(id);
    },
  };

  const submissions = {
    async create({ id, roomId, participantId, roundId, attempt, prompt, submittedAt }) {
      now(submittedAt);
      const result = await database.prepare(`INSERT INTO arena_submissions
        (id, room_id, participant_id, round_id, attempt, prompt, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, roomId, participantId, roundId, attempt, prompt, submittedAt);
      if (result.changes !== 1) throw new Error('could not create submission');
      return submissions.getById(id);
    },
    async getById(id) {
      const row = await database.prepare('SELECT * FROM arena_submissions WHERE id = ?').get(id);
      if (!row) return undefined;
      return {
        id: row.id, roomId: row.room_id, participantId: row.participant_id,
        roundId: row.round_id, attempt: Number(row.attempt), prompt: row.prompt,
        submittedAt: row.submitted_at,
      };
    },
    async listByRound(roundId) {
      return (await database.prepare('SELECT * FROM arena_submissions WHERE round_id = ? ORDER BY submitted_at').all(roundId))
        .map((row) => ({
          id: row.id, roomId: row.room_id, participantId: row.participant_id,
          roundId: row.round_id, attempt: Number(row.attempt), prompt: row.prompt,
          submittedAt: row.submitted_at,
        }));
    },
    async listByParticipant(participantId) {
      return (await database.prepare('SELECT * FROM arena_submissions WHERE participant_id = ? ORDER BY submitted_at').all(participantId))
        .map((row) => ({
          id: row.id, roomId: row.room_id, participantId: row.participant_id,
          roundId: row.round_id, attempt: Number(row.attempt), prompt: row.prompt,
          submittedAt: row.submitted_at,
        }));
    },
    /**
     * As submissões que ficaram SEM nota — a fila que o pátio sustenta.
     *
     * Por que existe: o pátio das avaliações (`src/judge/parking.mjs`) vive na
     * memória do processo, e o plano de hospedagem assume uma instância só — um
     * redeploy ou reinício descartava as esperas e a submissão correspondente
     * ficava sem nota até o aluno reenviar. A FILA, no entanto, sempre esteve no
     * banco: submissão sem linha em `arena_scores` é exatamente "ainda esperando
     * nota". Esta consulta lê essa verdade, com o que a retomada precisa saber:
     * quantas tentativas já foram gastas (linhas em `arena_judge_attempts`, que o
     * envio e cada reprocessamento gravam) e quando foi a última — para o teto
     * contar através dos reinícios e a espera não recomeçar do zero.
     *
     * `since` corta o passado distante: uma submissão de uma semana atrás numa
     * sala que continua aberta não é motivo para chamar o provedor no boot.
     *
     * O JOIN com `room_rounds` e a igualdade com `current_cycle` são a guarda da
     * BATALHA: a sala que voltou a `open` para uma batalha nova continua sendo
     * uma sala viva, e sem esse recorte o vigia sairia reavaliando envios da
     * batalha anterior — cota gasta e nota velha escrita muito depois de a aula
     * ter acabado.
     */
    async listAwaitingScore({ since = 0, limit = 500, roomStatuses = AWAITING_ROOM_STATUSES } = {}) {
      now(since);
      const statuses = [...roomStatuses];
      if (statuses.length === 0) return [];
      const placeholders = statuses.map(() => '?').join(', ');
      const rows = await database.prepare(`SELECT s.*, r.status AS room_status,
          (SELECT COUNT(*) FROM arena_judge_attempts a WHERE a.submission_id = s.id) AS attempts,
          (SELECT MAX(a.created_at) FROM arena_judge_attempts a WHERE a.submission_id = s.id) AS last_attempt_at
        FROM arena_submissions s
        JOIN arena_rooms r ON r.id = s.room_id
        JOIN room_rounds rr ON rr.id = s.round_id AND rr.cycle = r.current_cycle
        LEFT JOIN arena_scores sc ON sc.submission_id = s.id
        WHERE sc.id IS NULL AND s.submitted_at >= ? AND r.status IN (${placeholders})
        ORDER BY s.submitted_at
        LIMIT ?`).all(since, ...statuses, limit);
      return rows.map((row) => ({
        id: row.id, roomId: row.room_id, participantId: row.participant_id,
        roundId: row.round_id, attempt: Number(row.attempt), prompt: row.prompt,
        submittedAt: row.submitted_at, roomStatus: row.room_status,
        attempts: Number(row.attempts || 0),
        lastAttemptAt: row.last_attempt_at === null || row.last_attempt_at === undefined
          ? null : Number(row.last_attempt_at),
      }));
    },
  };

  function score(row) {
    return {
      id: row.id,
      submissionId: row.submission_id,
      participantId: row.participant_id ?? null,
      roundId: row.round_id ?? null,
      attempt: row.attempt === undefined || row.attempt === null ? null : Number(row.attempt),
      percent: Number(row.percent),
      breakdown: JSON.parse(row.breakdown_json),
      feedback: row.feedback,
      judgeStatus: row.judge_status,
      points: row.points === null || row.points === undefined ? null : Number(row.points),
      position: row.position === null || row.position === undefined ? null : Number(row.position),
      scoringVersion: row.scoring_version ?? null,
      model: row.model,
      createdAt: row.created_at,
    };
  }

  const scores = {
    async record({
      id, submissionId, percent, breakdown, feedback, judgeStatus = 'scored',
      points = null, position = null, scoringVersion = null, model = null, now: timestamp,
    }) {
      now(timestamp);
      const result = await database.prepare(`INSERT INTO arena_scores
        (id, submission_id, percent, breakdown_json, feedback, judge_status,
         points, position, scoring_version, model, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, submissionId, percent, JSON.stringify(breakdown), feedback, judgeStatus,
          points ?? null, position ?? null, scoringVersion ?? null, model, timestamp);
      if (result.changes !== 1) throw new Error('could not record score');
      return scores.getBySubmission(submissionId);
    },
    async updateClassicMetrics({ submissionId, points, position, scoringVersion, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare(`UPDATE arena_scores
        SET points = ?, position = ?, scoring_version = ?, created_at = ?
        WHERE submission_id = ?`)
        .run(points ?? null, position ?? null, scoringVersion ?? null, timestamp, submissionId);
      if (result.changes !== 1) throw new Error('score not found');
      return scores.getBySubmission(submissionId);
    },
    async getBySubmission(submissionId) {
      const row = await database.prepare('SELECT * FROM arena_scores WHERE submission_id = ?').get(submissionId);
      return row ? score(row) : undefined;
    },
    async listByRound(roundId) {
      const rows = await database.prepare(`SELECT arena_scores.*, arena_submissions.participant_id, arena_submissions.attempt
        FROM arena_scores
        JOIN arena_submissions ON arena_submissions.id = arena_scores.submission_id
        WHERE arena_submissions.round_id = ?
        ORDER BY arena_scores.percent DESC`).all(roundId);
      return rows.map((row) => score({
        ...row,
        participant_id: row.participant_id,
        attempt: row.attempt,
      }));
    },
    async listByParticipant(participantId) {
      const rows = await database.prepare(`SELECT arena_scores.*, arena_submissions.round_id, arena_submissions.attempt
        FROM arena_scores
        JOIN arena_submissions ON arena_submissions.id = arena_scores.submission_id
        WHERE arena_submissions.participant_id = ?
        ORDER BY arena_submissions.submitted_at`).all(participantId);
      return rows.map((row) => score({
        ...row,
        round_id: row.round_id,
        attempt: row.attempt,
      }));
    },
  };

  const judgeAttempts = {
    async record({ id, submissionId, attempt, status, model = null, responseJson = null, error = null, now: timestamp }) {
      now(timestamp);
      const result = await database.prepare(`INSERT INTO arena_judge_attempts
        (id, submission_id, attempt, status, model, response_json, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, submissionId, attempt, status, model, responseJson, error, timestamp);
      if (result.changes !== 1) throw new Error('could not record judge attempt');
    },
    async listBySubmission(submissionId) {
      return (await database.prepare('SELECT * FROM arena_judge_attempts WHERE submission_id = ? ORDER BY attempt').all(submissionId))
        .map((row) => ({
          id: row.id, submissionId: row.submission_id, attempt: Number(row.attempt),
          status: row.status, model: row.model, responseJson: row.response_json,
          error: row.error, createdAt: row.created_at,
        }));
    },
    /**
     * Tentativas de avaliacao de UMA rodada, numa consulta so.
     *
     * Existe para o professor poder ver a procedencia das notas (quem avaliou,
     * se o juiz local assumiu e por que) sem uma consulta por aluno — o detalhe
     * da sala e' relido enquanto a aula acontece.
     */
    async listByRound(roundId) {
      const rows = await database.prepare(`SELECT arena_judge_attempts.*, arena_submissions.id AS submission, arena_submissions.participant_id AS participant
        FROM arena_judge_attempts
        JOIN arena_submissions ON arena_submissions.id = arena_judge_attempts.submission_id
        WHERE arena_submissions.round_id = ?
        ORDER BY arena_judge_attempts.created_at`).all(roundId);
      return rows.map((row) => ({
        id: row.id, submissionId: row.submission, participantId: row.participant,
        attempt: Number(row.attempt), status: row.status, model: row.model,
        responseJson: row.response_json, error: row.error, createdAt: row.created_at,
      }));
    },
  };

  return { rooms, participants, challenges, rounds, submissions, scores, judgeAttempts };
}
