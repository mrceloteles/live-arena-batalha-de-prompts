import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient } from '@libsql/client';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const CURRENT_VERSION = 9;

// ---------------------------------------------------------------------------
// Adapter interface (async, unified for both backends):
//   prepare(sql) -> { run(...args), get(...args), all(...args) }  (Promises)
//   exec(sql) -> Promise
//   transaction(work) -> Promise  (work receives the transactional adapter)
//   close() -> void
//
// Backends:
//   - Local/dev/tests: serialize work on the single SQLite connection. Queries
//     inside a transaction retain its context across awaits; unrelated requests
//     wait until commit/rollback instead of joining another request's transaction.
//   - Production (Turso/libSQL remote): @libsql/client over WebSocket (hrana).
//     Each plain execute runs on a fresh stream, so PRAGMA state does not
//     persist between statements; transactions (BEGIN/COMMIT) do. For that
//     reason every remote transaction starts with PRAGMA foreign_keys = ON.
// ---------------------------------------------------------------------------

function wrapSyncDatabase(database) {
  const context = new AsyncLocalStorage();
  let tail = Promise.resolve();
  const run = (work) => {
    if (context.getStore()?.active) return Promise.resolve().then(work);
    const result = tail.then(work);
    tail = result.catch(() => {});
    return result;
  };
  const adapter = {
    prepare(sql) {
      return {
        run: (...args) => run(() => {
          const result = database.prepare(sql).run(...args);
          return {
            changes: result.changes,
            lastInsertRowid: Number(result.lastInsertRowid),
          };
        }),
        get: (...args) => run(() => database.prepare(sql).get(...args)),
        all: (...args) => run(() => database.prepare(sql).all(...args)),
      };
    },
    exec: (sql) => run(() => database.exec(sql)),
    transaction: (work) => run(async () => {
      const scope = { active: true };
      database.exec('BEGIN IMMEDIATE');
      try {
        const result = await context.run(scope, () => work(adapter));
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      } finally {
        scope.active = false;
      }
    }),
  };
  return adapter;
}

function mapRows(result) {
  const { columns, rows } = result;
  return rows.map((row) => {
    const mapped = {};
    for (let index = 0; index < columns.length; index += 1) mapped[columns[index]] = row[index];
    return mapped;
  });
}

export function wrapRemoteDatabase(client) {
  const makeDb = (execute, executeMultiple) => {
    const db = {
      prepare(sql) {
        return {
          run: async (...args) => {
            const result = await execute({ sql, args });
            return { changes: result.rowsAffected, lastInsertRowid: Number(result.lastInsertRowid) };
          },
          get: async (...args) => {
            const result = await execute({ sql, args });
            return result.rows.length ? mapRows(result)[0] : undefined;
          },
          all: async (...args) => {
            const result = await execute({ sql, args });
            return mapRows(result);
          },
        };
      },
      exec: async (sql) => { await executeMultiple(sql); },
      transaction: async (work) => {
        const tx = await client.transaction('write');
        // BEGIN is batched with the first statement on the same stream, so the
        // FK pragma is enforced for the whole transaction even though Turso
        // defaults foreign_keys to OFF.
        const txDb = makeDb(
          (statement) => tx.execute(statement),
          (sql) => tx.executeMultiple(sql),
        );
        try {
          await tx.execute('PRAGMA foreign_keys = ON');
          const result = await work(txDb);
          await tx.commit();
          return result;
        } catch (error) {
          try { await tx.rollback(); } catch { /* already rolled back */ }
          throw error;
        } finally {
          tx.close();
        }
      },
    };
    return db;
  };
  return makeDb(
    (statement) => client.execute(statement),
    (sql) => client.executeMultiple(sql),
  );
}

// Tables introduced by each schema version beyond the very first release.
// Arena tables (v4) use IF NOT EXISTS so the same DDL is safe on any base.
const ARENA_TABLES = `
  CREATE TABLE IF NOT EXISTS arena_rooms (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    pin TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft','waiting','open','playing','ended','archived')),
    preset TEXT NOT NULL DEFAULT 'personalizado' CHECK (preset IN ('classic','turma','personalizado','arena')),
    expected_players INTEGER NOT NULL DEFAULT 0 CHECK (expected_players BETWEEN 0 AND 50),
    settings_json TEXT NOT NULL DEFAULT '{}',
    entry_blocked INTEGER NOT NULL DEFAULT 0 CHECK (entry_blocked IN (0, 1)),
    current_cycle INTEGER NOT NULL DEFAULT 1 CHECK (current_cycle > 0),
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    started_at REAL,
    ended_at REAL
  ) STRICT;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_arena_rooms_pin ON arena_rooms(pin) WHERE pin IS NOT NULL;
  CREATE TABLE IF NOT EXISTS arena_participants (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES arena_rooms(id),
    name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    station_number INTEGER CHECK (station_number IS NULL OR station_number BETWEEN 1 AND 50),
    email TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    consent INTEGER NOT NULL DEFAULT 0 CHECK (consent IN (0, 1)),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    joined_at REAL NOT NULL,
    last_seen_at REAL NOT NULL,
    UNIQUE (room_id, name)
  ) STRICT;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_arena_station_per_room
    ON arena_participants(room_id, station_number) WHERE active = 1 AND station_number IS NOT NULL;
  CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    modality TEXT NOT NULL,
    mission TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '',
    reference_text TEXT NOT NULL DEFAULT '',
    reference_image TEXT NOT NULL DEFAULT '',
    expected_result TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 3),
    duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds > 0),
    speed_weight TEXT NOT NULL DEFAULT 'none' CHECK (speed_weight IN ('none','low','medium','high')),
    category TEXT NOT NULL DEFAULT 'Fundamentos',
    judge_kind TEXT NOT NULL DEFAULT 'criteria' CHECK (judge_kind IN ('classic','criteria')),
    reference_prompt TEXT NOT NULL DEFAULT '',
    rubric TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS challenge_criteria (
    challenge_id TEXT NOT NULL REFERENCES challenges(id),
    criterion TEXT NOT NULL,
    weight REAL NOT NULL CHECK (weight >= 0),
    PRIMARY KEY (challenge_id, criterion)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS room_rounds (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES arena_rooms(id),
    cycle INTEGER NOT NULL DEFAULT 1 CHECK (cycle > 0),
    position INTEGER NOT NULL CHECK (position > 0),
    challenge_id TEXT NOT NULL REFERENCES challenges(id),
    modality TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','open','submitting','judging','results','closed')),
    started_at REAL,
    deadline_at REAL,
    paused_at REAL,
    ended_at REAL,
    created_at REAL NOT NULL,
    UNIQUE (room_id, cycle, position)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS arena_submissions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES arena_rooms(id),
    participant_id TEXT NOT NULL REFERENCES arena_participants(id),
    round_id TEXT NOT NULL REFERENCES room_rounds(id),
    attempt INTEGER NOT NULL CHECK (attempt > 0),
    prompt TEXT NOT NULL,
    submitted_at REAL NOT NULL,
    UNIQUE (round_id, participant_id, attempt)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS arena_scores (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL UNIQUE REFERENCES arena_submissions(id),
    percent REAL NOT NULL CHECK (percent BETWEEN 0 AND 100),
    breakdown_json TEXT NOT NULL,
    feedback TEXT NOT NULL DEFAULT '',
    judge_status TEXT NOT NULL DEFAULT 'scored' CHECK (judge_status IN ('scored','failed','timeout')),
    points REAL CHECK (points IS NULL OR points >= 0),
    position INTEGER CHECK (position IS NULL OR position BETWEEN 1 AND 50),
    scoring_version TEXT,
    model TEXT,
    created_at REAL NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS arena_judge_attempts (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES arena_submissions(id),
    attempt INTEGER NOT NULL CHECK (attempt > 0),
    status TEXT NOT NULL,
    model TEXT,
    response_json TEXT,
    error TEXT,
    created_at REAL NOT NULL,
    UNIQUE (submission_id, attempt)
  ) STRICT;
`;

async function migrateDatabase(database) {
  const versionRow = await database.prepare('PRAGMA user_version').get();
  const version = Number(versionRow?.user_version || 0);
  if (version > CURRENT_VERSION) {
    throw new Error(`database version ${version} is newer than supported version ${CURRENT_VERSION}`);
  }
  if (version === CURRENT_VERSION) return;
  // The whole migration runs inside one real transaction: for node:sqlite it
  // is BEGIN/COMMIT on the same connection; for Turso it is a hrana
  // transaction (BEGIN batched with the first statement on one stream).
  // PRAGMA foreign_keys is a no-op inside a transaction, so it must be turned
  // OFF before BEGIN (only legacy local files reach this branch; Turso
  // databases are always created fresh at version 0).
  await database.exec('PRAGMA foreign_keys = OFF').catch(() => {});
  try {
    await database.transaction(async (db) => {
      if (version === 0) {
        await db.exec(schema);
      }
      if (version === 1) {
        await db.exec(`
          ALTER TABLE sessions ADD COLUMN email TEXT NOT NULL DEFAULT '';
          ALTER TABLE sessions ADD COLUMN role TEXT NOT NULL DEFAULT '';
          ALTER TABLE sessions ADD COLUMN company TEXT NOT NULL DEFAULT '';
        `);
      }
      if (version >= 1 && version <= 2) {
        await db.exec(`
          CREATE TABLE stations_v3 (
            game_id TEXT NOT NULL REFERENCES games(id),
            station_id INTEGER NOT NULL CHECK (station_id BETWEEN 1 AND 50),
            label TEXT NOT NULL,
            PRIMARY KEY (game_id, station_id)
          ) STRICT;
          INSERT INTO stations_v3 SELECT * FROM stations;
          DROP TABLE stations;
          ALTER TABLE stations_v3 RENAME TO stations;
        `);
        const hasScores = await db.prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'scores'",
        ).get();
        if (hasScores) {
          await db.exec(`
            CREATE TABLE scores_v3 (
              id TEXT PRIMARY KEY,
              submission_id TEXT NOT NULL REFERENCES submissions(id),
              session_id TEXT NOT NULL REFERENCES sessions(id),
              station_id INTEGER NOT NULL CHECK (station_id BETWEEN 1 AND 50),
              percent REAL NOT NULL CHECK (percent BETWEEN 0 AND 100),
              points INTEGER NOT NULL CHECK (points >= 0),
              elapsed_seconds REAL NOT NULL CHECK (elapsed_seconds >= 0),
              position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 50),
              scoring_version TEXT NOT NULL,
              explanation TEXT NOT NULL,
              created_at REAL NOT NULL,
              UNIQUE (submission_id, session_id)
            ) STRICT;
            INSERT INTO scores_v3 SELECT * FROM scores;
            DROP TABLE scores;
            ALTER TABLE scores_v3 RENAME TO scores;
          `);
        }
      }
      if (version <= 3) {
        await db.exec(ARENA_TABLES);
      }
      if (version <= 4) {
        // v5: pause/resume de rodada. Idempotente: base nova ja cria a coluna via ARENA_TABLES.
        const hasPaused = await db.prepare("SELECT 1 FROM pragma_table_info('room_rounds') WHERE name = 'paused_at'").get();
        if (!hasPaused) await db.exec('ALTER TABLE room_rounds ADD COLUMN paused_at REAL;');
      }
      if (version <= 5) {
        // v6: sala unificada — preset + PIN + settings, station interno com
        // perfil opcional, pontos classicos na nota da sala, desafios classicos.
        const column = async (table, name) => Boolean(
          await db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(name),
        );
        if (!(await column('arena_rooms', 'pin'))) {
          await db.exec("ALTER TABLE arena_rooms ADD COLUMN pin TEXT;");
          await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_arena_rooms_pin ON arena_rooms(pin) WHERE pin IS NOT NULL;');
        }
        if (!(await column('arena_rooms', 'preset'))) {
          await db.exec("ALTER TABLE arena_rooms ADD COLUMN preset TEXT NOT NULL DEFAULT 'personalizado';");
        }
        if (!(await column('arena_rooms', 'settings_json'))) {
          await db.exec("ALTER TABLE arena_rooms ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}';");
        }
        if (!(await column('arena_participants', 'station_number'))) {
          await db.exec('ALTER TABLE arena_participants ADD COLUMN station_number INTEGER;');
          await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_arena_station_per_room ON arena_participants(room_id, station_number) WHERE active = 1 AND station_number IS NOT NULL;');
        }
        if (!(await column('arena_participants', 'email'))) {
          await db.exec("ALTER TABLE arena_participants ADD COLUMN email TEXT NOT NULL DEFAULT '';");
          await db.exec("ALTER TABLE arena_participants ADD COLUMN role TEXT NOT NULL DEFAULT '';");
          await db.exec("ALTER TABLE arena_participants ADD COLUMN company TEXT NOT NULL DEFAULT '';");
          await db.exec('ALTER TABLE arena_participants ADD COLUMN consent INTEGER NOT NULL DEFAULT 0;');
        }
        if (!(await column('arena_scores', 'points'))) {
          await db.exec('ALTER TABLE arena_scores ADD COLUMN points REAL;');
          await db.exec('ALTER TABLE arena_scores ADD COLUMN position INTEGER;');
          await db.exec('ALTER TABLE arena_scores ADD COLUMN scoring_version TEXT;');
        }
        if (!(await column('challenges', 'judge_kind'))) {
          await db.exec("ALTER TABLE challenges ADD COLUMN judge_kind TEXT NOT NULL DEFAULT 'criteria';");
          await db.exec("ALTER TABLE challenges ADD COLUMN reference_prompt TEXT NOT NULL DEFAULT '';");
          await db.exec("ALTER TABLE challenges ADD COLUMN rubric TEXT NOT NULL DEFAULT '';");
        }
        // Backfill: salas antigas sao salas de missoes manuais (personalizado);
        // participantes ganham station pela ordem de entrada; desafios antigos
        // continuam avaliados por criterios.
        await db.exec(`UPDATE arena_rooms SET preset = 'personalizado', settings_json = '{}'
          WHERE preset IS NULL OR settings_json IS NULL OR settings_json = '';`);
        await db.exec(`UPDATE arena_participants SET station_number = seq.station
          FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY room_id ORDER BY joined_at, id) AS station
            FROM arena_participants WHERE active = 1 AND station_number IS NULL
          ) AS seq
          WHERE arena_participants.id = seq.id;`);
        await db.exec(`UPDATE challenges SET judge_kind = 'criteria'
          WHERE judge_kind IS NULL OR judge_kind = '';`);
      }
      if (version <= 6) {
        // v7: o preset `arena` (Modo Arena — Turma vs. Juiz). SQLite nao altera
        // CHECK in place, entao a tabela e reconstruida — com as FKs desligadas
        // (a transacao roda depois do PRAGMA foreign_keys = OFF).
        const presetSql = await db.prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'arena_rooms'",
        ).get();
        if (presetSql?.sql && !String(presetSql.sql).includes("'arena'")) {
          await db.exec(`
            CREATE TABLE arena_rooms_v7 (
              id TEXT PRIMARY KEY,
              code TEXT NOT NULL UNIQUE,
              pin TEXT,
              title TEXT NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('draft','waiting','open','playing','ended','archived')),
              preset TEXT NOT NULL DEFAULT 'personalizado' CHECK (preset IN ('classic','turma','personalizado','arena')),
              expected_players INTEGER NOT NULL DEFAULT 0 CHECK (expected_players BETWEEN 0 AND 50),
              settings_json TEXT NOT NULL DEFAULT '{}',
              entry_blocked INTEGER NOT NULL DEFAULT 0 CHECK (entry_blocked IN (0, 1)),
              created_at REAL NOT NULL,
              updated_at REAL NOT NULL,
              started_at REAL,
              ended_at REAL
            ) STRICT;
            INSERT INTO arena_rooms_v7
              SELECT id, code, pin, title, status, preset, expected_players,
                     settings_json, entry_blocked, created_at, updated_at, started_at, ended_at
              FROM arena_rooms;
            DROP TABLE arena_rooms;
            ALTER TABLE arena_rooms_v7 RENAME TO arena_rooms;
            CREATE UNIQUE INDEX IF NOT EXISTS ux_arena_rooms_pin
              ON arena_rooms(pin) WHERE pin IS NOT NULL;
          `);
        }
      }
      if (version <= 7) {
        // v8: a sala passa a ter BATALHAS (ciclos).
        //
        // O ciclo vive na RODADA, e nao num id novo de sala, porque e a rodada
        // que a submissao referencia: um ciclo novo clona as mesmas missoes e o
        // ciclo anterior fica inteiro (envios, notas, tentativas de juiz) como
        // historico. O que muda de verdade e a chave: `UNIQUE (room_id,
        // position)` so cabia uma batalha por sala, ja que `position` volta a 1
        // em cada ciclo. O SQLite nao altera constraint em lugar, entao a tabela
        // e reconstruida — com as FKs desligadas (a transacao roda depois do
        // `PRAGMA foreign_keys = OFF`), que e o que faz o `REFERENCES
        // room_rounds(id)` das tabelas filhas continuar valendo na tabela nova.
        const column = async (table, name) => Boolean(
          await db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(name),
        );
        if (!(await column('room_rounds', 'cycle'))) {
          await db.exec(`
            CREATE TABLE room_rounds_v8 (
              id TEXT PRIMARY KEY,
              room_id TEXT NOT NULL REFERENCES arena_rooms(id),
              cycle INTEGER NOT NULL DEFAULT 1 CHECK (cycle > 0),
              position INTEGER NOT NULL CHECK (position > 0),
              challenge_id TEXT NOT NULL REFERENCES challenges(id),
              modality TEXT NOT NULL,
              status TEXT NOT NULL CHECK (status IN ('pending','open','submitting','judging','results','closed')),
              started_at REAL,
              deadline_at REAL,
              paused_at REAL,
              ended_at REAL,
              created_at REAL NOT NULL,
              UNIQUE (room_id, cycle, position)
            ) STRICT;
            INSERT INTO room_rounds_v8
              (id, room_id, cycle, position, challenge_id, modality, status,
               started_at, deadline_at, paused_at, ended_at, created_at)
              SELECT id, room_id, 1, position, challenge_id, modality, status,
                     started_at, deadline_at, paused_at, ended_at, created_at
              FROM room_rounds;
            DROP TABLE room_rounds;
            ALTER TABLE room_rounds_v8 RENAME TO room_rounds;
          `);
        }
        if (!(await column('arena_rooms', 'current_cycle'))) {
          await db.exec('ALTER TABLE arena_rooms ADD COLUMN current_cycle INTEGER NOT NULL DEFAULT 1;');
        }
      }
      if (version <= 8) {
        // v9: a REVISAO da sala — a versao monotona do estado.
        //
        // Por que uma coluna persistida e nao um contador em memoria: o numero
        // precisa valer para as tres telas (aluno, painel, TV) e sobreviver ao
        // reinicio do processo. Um contador do hub SSE morreria com o servidor
        // e duas instancias discordariam entre si. Como o valor so e lido e
        // comparado (e nunca usado como chave), a coluna entra por `ALTER
        // TABLE` com default 0 — sem reconstruir nada.
        const column = async (table, name) => Boolean(
          await db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(name),
        );
        if (!(await column('arena_rooms', 'revision'))) {
          await db.exec('ALTER TABLE arena_rooms ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;');
        }
      }
      await db.exec(`PRAGMA user_version = ${CURRENT_VERSION}`);
    });
  } finally {
    // Re-enable FK enforcement for the connection (sync backend).
    await database.exec('PRAGMA foreign_keys = ON').catch(() => {});
  }
}

export function openDatabase(filename, options = {}) {
  const remoteUrl = options.url || process.env.TURSO_URL || '';
  const authToken = options.authToken || process.env.TURSO_AUTH_TOKEN || '';
  let database;
  let close;
  if (remoteUrl) {
    const client = createClient({ url: remoteUrl, authToken: authToken || undefined });
    database = wrapRemoteDatabase(client);
    close = () => client.close();
  } else {
    if (typeof filename !== 'string' || filename.length === 0) {
      throw new TypeError('database filename is required');
    }
    const opened = new DatabaseSync(filename);
    opened.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000');
    database = wrapSyncDatabase(opened);
    close = () => opened.close();
  }
  let closed = false;
  return {
    database,
    isRemote: Boolean(remoteUrl),
    migrate() {
      if (closed) throw new Error('database is closed');
      return migrateDatabase(database);
    },
    close() {
      if (!closed) {
        close();
        closed = true;
      }
    },
  };
}
