import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { afterEach, beforeEach } from 'node:test';
import { openDatabase } from '../../src/db/database.mjs';

/**
 * v9 — A REVISÃO DA SALA (a versão monotônica do estado).
 *
 * A revisão existe para uma resposta atrasada não repintar por cima de um estado
 * mais novo. Ela é uma COLUNA, e não um contador do processo, por dois motivos:
 * as três telas (aluno, painel, TV) precisam concordar, e o número precisa
 * sobreviver ao reinício do servidor — um contador em memória morreria junto com
 * o processo e duas instâncias discordariam entre si.
 *
 * O que este teste prende é a MIGRAÇÃO, e não a contagem (essa é do teste de
 * revisão): a base que já existe ganha a coluna com 0, nada se move, e rodar de
 * novo não faz nada. Base v8 → v9 é o caso real (a produção e o banco local
 * estavam em v8 quando esta frente começou).
 */
let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'v9-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const banco = () => join(dir, 'arena.sqlite');

/** Uma base v8 de verdade: o esquema de hoje SEM a coluna, e `user_version = 8`. */
function bancoV8(caminho) {
  const raw = new DatabaseSync(caminho);
  raw.exec(`
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
      current_cycle INTEGER NOT NULL DEFAULT 1 CHECK (current_cycle > 0),
      created_at REAL NOT NULL,
      updated_at REAL NOT NULL,
      started_at REAL,
      ended_at REAL
    ) STRICT;
    INSERT INTO arena_rooms
      (id, code, pin, title, status, preset, expected_players, settings_json, entry_blocked,
       current_cycle, created_at, updated_at, started_at, ended_at)
    VALUES
      ('room-1', 'ABCD23', '123456', 'Aula que já rodou', 'playing', 'turma', 35, '{"rounds":3}', 0,
       2, 1000, 1200, 1100, NULL);
    PRAGMA user_version = 8;
  `);
  raw.close();
}

test('a v8 vira v9 ganhando a revisão, sem perder nada da sala', async () => {
  bancoV8(banco());
  const opened = openDatabase(banco());
  try {
    await opened.migrate();

    const versao = await opened.database.prepare('PRAGMA user_version').get();
    assert.equal(versao.user_version, 9);

    const sala = await opened.database.prepare(
      'SELECT title, status, preset, expected_players, current_cycle, revision FROM arena_rooms WHERE id = ?',
    ).get('room-1');
    // A sala que já existia chega inteira, e começa contando do zero: nenhuma
    // mutação desta base aconteceu DEPOIS da migração para já ter subido.
    assert.deepEqual({ ...sala }, {
      title: 'Aula que já rodou',
      status: 'playing',
      preset: 'turma',
      expected_players: 35,
      current_cycle: 2,
      revision: 0,
    });
  } finally {
    opened.close();
  }
});

test('rodar a migração de novo é inofensivo e não zera a revisão', async () => {
  bancoV8(banco());
  const primeira = openDatabase(banco());
  await primeira.migrate();
  await primeira.database.prepare('UPDATE arena_rooms SET revision = 7 WHERE id = ?').run('room-1');
  primeira.close();

  const segunda = openDatabase(banco());
  try {
    await segunda.migrate();
    const sala = await segunda.database.prepare('SELECT revision FROM arena_rooms WHERE id = ?').get('room-1');
    assert.equal(sala.revision, 7, 'migrar de novo não pode zerar a contagem que já subiu');
  } finally {
    segunda.close();
  }
});

test('base nova nasce em v9 já com a coluna (o esquema e a migração concordam)', async () => {
  const opened = openDatabase(banco());
  try {
    await opened.migrate();
    const colunas = (await opened.database.prepare("SELECT name FROM pragma_table_info('arena_rooms')").all())
      .map((linha) => linha.name);
    assert.ok(colunas.includes('revision'), 'o schema.sql tem de criar a coluna, e não só a migração');
    const versao = await opened.database.prepare('PRAGMA user_version').get();
    assert.equal(versao.user_version, 9);
  } finally {
    opened.close();
  }
});
