import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';

const TABLES = [
  'settings', 'games', 'rounds', 'stations', 'sessions', 'matches',
  'submissions', 'scores', 'events', 'client_logs', 'judge_attempts',
  'arena_rooms', 'arena_participants', 'challenges', 'challenge_criteria',
  'room_rounds', 'arena_submissions', 'arena_scores', 'arena_judge_attempts',
];

test('unrelated concurrent writes are not rolled back with another transaction', async () => {
  const opened = openDatabase(':memory:');
  try {
    await opened.database.exec('CREATE TABLE isolation_test (value TEXT)');
    let release, entered;
    const barrier = new Promise((resolve) => { release = resolve; });
    const started = new Promise((resolve) => { entered = resolve; });
    const transaction = opened.database.transaction(async (db) => {
      await db.prepare('INSERT INTO isolation_test VALUES (?)').run('rollback');
      entered();
      await barrier;
      throw new Error('rollback deliberately');
    });
    const rejected = assert.rejects(transaction, /rollback deliberately/);
    await started;
    const independent = opened.database.prepare('INSERT INTO isolation_test VALUES (?)').run('preserve');
    release();
    await Promise.all([rejected, independent]);
    assert.deepEqual((await opened.database.prepare('SELECT value FROM isolation_test').all()).map((row) => row.value), ['preserve']);
  } finally { opened.close(); }
});

async function temporaryDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), 'prompt-base-db-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, 'game.sqlite');
}

test('migration creates every required table and is idempotent', async (t) => {
  const filename = await temporaryDatabase(t);
  const first = openDatabase(filename);
  await first.migrate();
  await first.migrate();

  const tables = (await first.database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all()).map(({ name }) => name);
  assert.deepEqual(tables, [...TABLES].sort());
  assert.equal((await first.database.prepare('PRAGMA user_version').get()).user_version, 7);
  first.close();
});

test('reopening the same file preserves official state', async (t) => {
  const filename = await temporaryDatabase(t);
  const first = openDatabase(filename);
  await first.migrate();
  await first.database.prepare(`
    INSERT INTO games (id, cycle, phase, current_round, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('game-1', 1, 'registration', 0, 100, 100);
  first.close();

  const second = openDatabase(filename);
  await second.migrate();
  assert.deepEqual({ ...(await second.database.prepare('SELECT id, phase, current_round FROM games').get()) }, {
    id: 'game-1', phase: 'registration', current_round: 0,
  });
  second.close();
});

test('migration upgrades a v1 database without losing participant data', async (t) => {
  const filename = await temporaryDatabase(t);
  const legacy = new DatabaseSync(filename);
  legacy.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE games (
      id TEXT PRIMARY KEY, cycle INTEGER NOT NULL UNIQUE, phase TEXT NOT NULL,
      current_round INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      created_at REAL NOT NULL, updated_at REAL NOT NULL
    ) STRICT;
    CREATE TABLE stations (
      game_id TEXT NOT NULL REFERENCES games(id), station_id INTEGER NOT NULL,
      label TEXT NOT NULL, PRIMARY KEY (game_id, station_id)
    ) STRICT;
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id), station_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE, player_name TEXT NOT NULL, consent INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, registered_at REAL NOT NULL,
      last_seen_at REAL NOT NULL, ended_at REAL,
      FOREIGN KEY (game_id, station_id) REFERENCES stations(game_id, station_id)
    ) STRICT;
    INSERT INTO games VALUES ('g1', 1, 'registration', 0, 1, 100, 100);
    INSERT INTO stations VALUES ('g1', 1, 'Jogador 1');
    INSERT INTO sessions VALUES ('s1', 'g1', 1, 'token', 'Ana', 1, 1, 110, 110, NULL);
    PRAGMA user_version = 1;
  `);
  legacy.close();

  const upgraded = openDatabase(filename);
  await upgraded.migrate();
  const participant = await upgraded.database.prepare(
    'SELECT player_name, email, role, company FROM sessions WHERE id = ?',
  ).get('s1');
  assert.deepEqual({ ...participant }, {
    player_name: 'Ana', email: '', role: '', company: '',
  });
  assert.equal((await upgraded.database.prepare('PRAGMA user_version').get()).user_version, 7);
  upgraded.close();
});

test('migration rejects an unknown future version without partially applying the schema', async () => {
  const connection = openDatabase(':memory:');
  await connection.database.exec('PRAGMA user_version = 8');
  await assert.rejects(() => connection.migrate(), /newer than supported/);
  const tables = await connection.database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'games'
  `).all();
  assert.equal(tables.length, 0);
  assert.equal((await connection.database.prepare('PRAGMA user_version').get()).user_version, 8);
  connection.close();
});
