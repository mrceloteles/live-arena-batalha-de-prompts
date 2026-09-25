import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';

/**
 * A SALA QUE PASSA A TER BATALHAS.
 *
 * O banco em produção tem salas jogadas: rodadas com envios e notas presos a
 * elas, e a chave `UNIQUE (room_id, position)` — que só cabia uma batalha por
 * sala. A v8 acrescenta o ciclo na rodada e o ponteiro na sala, e a migração
 * tem de fazer isso sem perder nada e sem inventar um segundo ciclo onde não
 * houve um: tudo o que existe é da batalha 1.
 *
 * Aqui a base é a v7 de verdade (o formato publicado), com uma sala jogada, e o
 * que se prova é o estado depois de migrar — inclusive pelo repositório, que é
 * quem lê a batalha viva.
 */
const V7_DDL = `
  CREATE TABLE arena_rooms (
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
  CREATE UNIQUE INDEX ux_arena_rooms_pin ON arena_rooms(pin) WHERE pin IS NOT NULL;
  CREATE TABLE arena_participants (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES arena_rooms(id),
    name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    station_number INTEGER,
    email TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    consent INTEGER NOT NULL DEFAULT 0,
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
    attempts INTEGER NOT NULL DEFAULT 1,
    duration_seconds INTEGER,
    speed_weight TEXT NOT NULL DEFAULT 'none',
    category TEXT NOT NULL DEFAULT 'Fundamentos',
    judge_kind TEXT NOT NULL DEFAULT 'criteria',
    reference_prompt TEXT NOT NULL DEFAULT '',
    rubric TEXT NOT NULL DEFAULT '',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
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
    points REAL,
    position INTEGER,
    scoring_version TEXT,
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
let banco;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'batalha-ciclo-'));
  banco = join(dir, 'sala-jogada.sqlite');
  const raw = new DatabaseSync(banco);
  raw.exec(V7_DDL);
  raw.exec(`
    INSERT INTO arena_rooms (id, code, pin, title, status, preset, expected_players, created_at, updated_at, started_at)
      VALUES ('room-a', 'TURMA1', '123456', 'Turma A', 'ended', 'turma', 35, 1000, 1090, 1005);
    INSERT INTO arena_participants (id, room_id, name, token, station_number, active, joined_at, last_seen_at) VALUES
      ('p1', 'room-a', 'Ana', 'tok-ana', 1, 1, 1000, 1010),
      ('p2', 'room-a', 'Bia', 'tok-bia', 2, 1, 1001, 1011);
    INSERT INTO challenges (id, title, modality, mission, attempts, duration_seconds, created_at, updated_at) VALUES
      ('ch-1', 'Missao 1', 'precisao', 'Escreva um prompt', 1, 120, 1000, 1000),
      ('ch-2', 'Missao 2', 'refinamento', 'Melhore um prompt', 2, 120, 1000, 1000);
    INSERT INTO room_rounds (id, room_id, position, challenge_id, modality, status, started_at, deadline_at, ended_at, created_at) VALUES
      ('rr-1', 'room-a', 1, 'ch-1', 'precisao', 'closed', 1005, 1125, 1130, 1000),
      ('rr-2', 'room-a', 2, 'ch-2', 'refinamento', 'closed', 1131, 1251, 1260, 1000);
    INSERT INTO arena_submissions (id, room_id, participant_id, round_id, attempt, prompt, submitted_at) VALUES
      ('sub-1', 'room-a', 'p1', 'rr-1', 1, 'um prompt da Ana', 1010),
      ('sub-2', 'room-a', 'p1', 'rr-2', 1, 'a segunda tentativa', 1140);
    INSERT INTO arena_scores (id, submission_id, percent, breakdown_json, feedback, judge_status, points, position, created_at) VALUES
      ('sc-1', 'sub-1', 80, '{"objetivo":16}', 'bom', 'scored', 86.67, 1, 1011),
      ('sc-2', 'sub-2', 45, '{"clareza":9}', 'regular', 'scored', 40, 2, 1141);
    INSERT INTO arena_judge_attempts (id, submission_id, attempt, status, model, created_at)
      VALUES ('at-1', 'sub-1', 1, 'succeeded', 'gemini', 1011);
    PRAGMA user_version = 7;
  `);
  raw.close();
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('a v7 migra ate a versao de hoje sem perder a sala jogada — e tudo o que existe é da batalha 1', async () => {
  const opened = openDatabase(banco);
  try {
    await opened.migrate();

    const versao = await opened.database.prepare('PRAGMA user_version').get();
    assert.equal(versao.user_version, 9);

    const sala = await opened.database.prepare('SELECT current_cycle, pin, status FROM arena_rooms WHERE id = ?').get('room-a');
    assert.equal(sala.current_cycle, 1, 'a sala que já existe não ganha uma batalha: ela É a batalha 1');
    assert.equal(sala.pin, '123456', 'e nada mais da sala se move');

    const rodadas = await opened.database.prepare('SELECT cycle, position, status FROM room_rounds WHERE room_id = ? ORDER BY position').all('room-a');
    assert.deepEqual(rodadas.map((row) => [row.cycle, row.position, row.status]), [[1, 1, 'closed'], [1, 2, 'closed']]);

    // O histórico continua preso às rodadas dele — nota, posição e tentativa de juiz.
    const nota = await opened.database.prepare('SELECT percent, points, position FROM arena_scores WHERE id = ?').get('sc-1');
    assert.deepEqual({ ...nota }, { percent: 80, points: 86.67, position: 1 });
    const tentativa = await opened.database.prepare('SELECT COUNT(*) AS total FROM arena_judge_attempts').get();
    assert.equal(tentativa.total, 1);

    // A chave nova é o que permite a batalha 2 na MESMA sala: posição 1 de novo.
    await opened.database.prepare(`INSERT INTO room_rounds
      (id, room_id, cycle, position, challenge_id, modality, status, created_at)
      VALUES ('rr-3', 'room-a', 2, 1, 'ch-1', 'precisao', 'pending', 2000)`).run();
    const depois = await opened.database.prepare('SELECT cycle, position FROM room_rounds WHERE room_id = ? ORDER BY cycle, position').all('room-a');
    assert.deepEqual(depois.map((row) => [row.cycle, row.position]), [[1, 1], [1, 2], [2, 1]]);

    // E a posição repetida DENTRO do mesmo ciclo continua barrada.
    await assert.rejects(
      opened.database.prepare(`INSERT INTO room_rounds
        (id, room_id, cycle, position, challenge_id, modality, status, created_at)
        VALUES ('rr-4', 'room-a', 1, 1, 'ch-1', 'precisao', 'pending', 2000)`).run(),
      /UNIQUE/,
      'a chave única agora é (sala, batalha, posição)',
    );

    // A leitura do jogo segue a batalha VIVA (a sala ainda aponta para a 1) e a
    // do histórico lê a batalha que se pedir.
    const repositories = createRepositories(opened.database);
    assert.deepEqual((await repositories.arena.rounds.listByRoom('room-a')).map((entry) => entry.id), ['rr-1', 'rr-2']);
    assert.deepEqual((await repositories.arena.rounds.listByRoomCycle('room-a', 1)).map((entry) => entry.id), ['rr-1', 'rr-2']);
    assert.deepEqual((await repositories.arena.rounds.cycles('room-a')).map((entry) => entry.cycle), [1, 2]);

    // Com o ponteiro na batalha 2, o jogo passa a ser dela — e a batalha 1
    // continua inteira para o relatório.
    await repositories.arena.rooms.reopenForNewBattle({ id: 'room-a', cycle: 2, now: 2001 });
    assert.deepEqual((await repositories.arena.rounds.listByRoom('room-a')).map((entry) => entry.id), ['rr-3']);
    assert.deepEqual((await repositories.arena.rounds.listByRoomCycle('room-a', 1)).map((entry) => entry.id), ['rr-1', 'rr-2']);
  } finally {
    opened.close();
  }
});

test('migrar de novo não muda nada (a v8 é idempotente)', async () => {
  const opened = openDatabase(banco);
  try {
    await opened.migrate();
    await opened.migrate();
    const colunas = (await opened.database.prepare("SELECT name FROM pragma_table_info('room_rounds')").all()).map((row) => row.name);
    assert.equal(colunas.filter((nome) => nome === 'cycle').length, 1, 'a coluna nova não é criada duas vezes');
    const rodadas = await opened.database.prepare('SELECT COUNT(*) AS total FROM room_rounds').get();
    assert.equal(rodadas.total, 2, 'e nenhuma rodada é duplicada');
  } finally {
    opened.close();
  }
});
