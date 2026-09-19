import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';

// V5 (pre-unification) arena schema, exactly as shipped before the room preset/pin.
const OLD_ARENA_DDL = `
  CREATE TABLE arena_rooms (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft','waiting','open','playing','ended','archived')),
    expected_players INTEGER NOT NULL DEFAULT 0 CHECK (expected_players BETWEEN 0 AND 50),
    entry_blocked INTEGER NOT NULL DEFAULT 0 CHECK (entry_blocked IN (0, 1)),
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    started_at REAL,
    ended_at REAL
  ) STRICT;
  CREATE TABLE arena_participants (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES arena_rooms(id),
    name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    joined_at REAL NOT NULL,
    last_seen_at REAL NOT NULL,
    UNIQUE (room_id, name)
  ) STRICT;
  CREATE TABLE challenges (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    modality TEXT NOT NULL,
    mission TEXT NOT NULL,
    context TEXT NOT NULL DEFAULT '',
    reference_text TEXT NOT NULL DEFAULT '',
    reference_image TEXT NOT NULL DEFAULT '',
    expected_result TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 3),
    duration_seconds INTEGER,
    speed_weight TEXT NOT NULL DEFAULT 'none' CHECK (speed_weight IN ('none','low','medium','high')),
    category TEXT NOT NULL DEFAULT 'Fundamentos',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
  ) STRICT;
  CREATE TABLE challenge_criteria (
    challenge_id TEXT NOT NULL REFERENCES challenges(id),
    criterion TEXT NOT NULL,
    weight REAL NOT NULL CHECK (weight >= 0),
    PRIMARY KEY (challenge_id, criterion)
  ) STRICT;
  CREATE TABLE room_rounds (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES arena_rooms(id),
    position INTEGER NOT NULL CHECK (position > 0),
    challenge_id TEXT NOT NULL REFERENCES challenges(id),
    modality TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','open','submitting','judging','results','closed')),
    started_at REAL,
    deadline_at REAL,
    paused_at REAL,
    ended_at REAL,
    created_at REAL NOT NULL,
    UNIQUE (room_id, position)
  ) STRICT;
  CREATE TABLE arena_submissions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES arena_rooms(id),
    participant_id TEXT NOT NULL REFERENCES arena_participants(id),
    round_id TEXT NOT NULL REFERENCES room_rounds(id),
    attempt INTEGER NOT NULL CHECK (attempt > 0),
    prompt TEXT NOT NULL,
    submitted_at REAL NOT NULL,
    UNIQUE (round_id, participant_id, attempt)
  ) STRICT;
  CREATE TABLE arena_scores (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL UNIQUE REFERENCES arena_submissions(id),
    percent REAL NOT NULL CHECK (percent BETWEEN 0 AND 100),
    breakdown_json TEXT NOT NULL,
    feedback TEXT NOT NULL DEFAULT '',
    judge_status TEXT NOT NULL DEFAULT 'scored' CHECK (judge_status IN ('scored','failed','timeout')),
    model TEXT,
    created_at REAL NOT NULL
  ) STRICT;
  CREATE TABLE arena_judge_attempts (
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

let dir;
let path;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'batalha-migrate-'));
  path = join(dir, 'fixture-v5.sqlite');
  const raw = new DatabaseSync(path);
  raw.exec(OLD_ARENA_DDL);
  raw.exec(`
    INSERT INTO arena_rooms (id, code, title, status, expected_players, created_at, updated_at)
      VALUES ('room-a', 'RAFA27', 'Turma A', 'waiting', 35, 1000, 1000);
    INSERT INTO arena_participants (id, room_id, name, token, active, joined_at, last_seen_at) VALUES
      ('p1', 'room-a', 'Ana', 'tok-ana', 1, 1000, 1010),
      ('p2', 'room-a', 'Bia', 'tok-bia', 1, 1001, 1011);
    INSERT INTO challenges (id, title, modality, mission, attempts, created_at, updated_at)
      VALUES ('ch-1', 'Missao 1', 'precisao', 'Escreva um prompt', 1, 1000, 1000);
    INSERT INTO challenge_criteria (challenge_id, criterion, weight) VALUES ('ch-1', 'objetivo', 20);
    INSERT INTO room_rounds (id, room_id, position, challenge_id, modality, status, created_at)
      VALUES ('rr-1', 'room-a', 1, 'ch-1', 'precisao', 'results', 1000);
    INSERT INTO arena_submissions (id, room_id, participant_id, round_id, attempt, prompt, submitted_at)
      VALUES ('sub-1', 'room-a', 'p1', 'rr-1', 1, 'um prompt', 1005);
    INSERT INTO arena_scores (id, submission_id, percent, breakdown_json, feedback, created_at)
      VALUES ('sc-1', 'sub-1', 80, '{"objetivo":16}', 'bom', 1006);
    PRAGMA user_version = 5;
  `);
  raw.close();
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('v5 arena database migrates to the current schema preserving data', async () => {
  const opened = openDatabase(path);
  try {
    await opened.migrate();

    const columns = (table) => opened.database
      .prepare(`SELECT name FROM pragma_table_info('${table}')`)
      .all()
      .then((rows) => rows.map((row) => row.name));

    const roomCols = await columns('arena_rooms');
    for (const expected of ['pin', 'preset', 'settings_json']) assert.ok(roomCols.includes(expected), `arena_rooms.${expected}`);

    const participantCols = await columns('arena_participants');
    for (const expected of ['station_number', 'email', 'role', 'company', 'consent']) {
      assert.ok(participantCols.includes(expected), `arena_participants.${expected}`);
    }

    const scoreCols = await columns('arena_scores');
    for (const expected of ['points', 'position', 'scoring_version']) assert.ok(scoreCols.includes(expected), `arena_scores.${expected}`);

    const challengeCols = await columns('challenges');
    for (const expected of ['judge_kind', 'reference_prompt', 'rubric']) assert.ok(challengeCols.includes(expected), `challenges.${expected}`);

    const room = await opened.database.prepare('SELECT preset, pin, settings_json FROM arena_rooms WHERE id = ?').get('room-a');
    assert.equal(room.preset, 'personalizado');
    assert.equal(room.pin, null);
    assert.equal(room.settings_json, '{}');

    const participants = await opened.database.prepare(
      'SELECT name, station_number FROM arena_participants WHERE room_id = ? ORDER BY joined_at',
    ).all('room-a');
    assert.deepEqual(participants.map((row) => row.station_number), [1, 2]);

    const challenge = await opened.database.prepare('SELECT judge_kind FROM challenges WHERE id = ?').get('ch-1');
    assert.equal(challenge.judge_kind, 'criteria');

    const score = await opened.database.prepare('SELECT percent, points, position FROM arena_scores WHERE id = ?').get('sc-1');
    assert.equal(score.percent, 80);
    assert.equal(score.points, null);
  } finally {
    opened.close();
  }
});

test('migration is idempotent on the upgraded database', async () => {
  const opened = openDatabase(path);
  try {
    await opened.migrate();
    await opened.migrate(); // segunda execucao nao deve falhar nem duplicar nada

    const version = await opened.database.prepare('PRAGMA user_version').get();
    assert.equal(version.user_version, 7);

    const rooms = await opened.database.prepare('SELECT COUNT(*) AS count FROM arena_rooms').get();
    assert.equal(rooms.count, 1);
    const pinIndexes = await opened.database.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'ux_arena_rooms_pin'",
    ).get();
    assert.equal(pinIndexes.count, 1);
  } finally {
    opened.close();
  }
});
