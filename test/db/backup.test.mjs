import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { backupDatabase, inspectDatabase, restoreDatabase } from '../../src/db/backup.mjs';
import { openDatabase } from '../../src/db/database.mjs';

// A auditoria registrou: a documentação falava em backup, mas nenhuma
// restauração tinha sido exercitada. Aqui o ciclo é executado de verdade —
// gerar, conferir, restaurar — e o que é comparado são as CONTAGENS e o
// `integrity_check`, não a existência do arquivo.
const temporarios = [];
function caminho(nome) {
  const diretorio = mkdtempSync(join(tmpdir(), 'backup-'));
  temporarios.push(diretorio);
  return join(diretorio, nome);
}

process.on('exit', () => {
  for (const diretorio of temporarios) {
    try { rmSync(diretorio, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* arquivo preso */ }
  }
});

async function bancoComDados(nome = 'origem.sqlite') {
  const arquivo = caminho(nome);
  const aberto = openDatabase(arquivo);
  await aberto.migrate();
  const agora = Date.now() / 1000;
  await aberto.database
    .prepare("INSERT INTO arena_rooms (id, code, title, status, preset, expected_players, created_at, updated_at) VALUES (?, ?, ?, 'waiting', 'classic', 10, ?, ?)")
    .run('sala-1', 'ABC12', 'Turma de sexta', agora, agora);
  for (const [id, nome0] of [['p1', 'Ana'], ['p2', 'Bruno']]) {
    await aberto.database
      .prepare('INSERT INTO arena_participants (id, room_id, name, token, joined_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, 'sala-1', nome0, `token-${id}`, agora, agora);
  }
  await aberto.database
    .prepare('INSERT INTO challenges (id, title, modality, mission, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('desafio-1', 'Cartaz', 'precisao', 'Escreva o prompt do cartaz.', agora, agora);
  return { arquivo, aberto };
}

test('o backup é consistente, confere a origem e pode ser conferido depois', async () => {
  const { aberto } = await bancoComDados();
  const destino = caminho('copia.sqlite');
  const resultado = await backupDatabase(aberto, destino);

  assert.equal(resultado.origem.integrity, 'ok');
  assert.equal(resultado.copia.integrity, 'ok');
  assert.equal(resultado.countsIguais, true, 'a cópia tem as mesmas contagens da origem');
  assert.equal(resultado.copia.counts.arena_rooms, 1);
  assert.equal(resultado.copia.counts.arena_participants, 2);
  assert.equal(resultado.copia.counts.challenges, 1);
  assert.equal(resultado.copia.version, resultado.origem.version, 'a cópia traz a mesma versão de migração');
  assert.ok(resultado.bytes > 0);

  // A cópia é um banco de verdade, não um arquivo qualquer: abre e responde.
  const copia = openDatabase(destino);
  const inspecao = await inspectDatabase(copia);
  copia.close();
  assert.equal(inspecao.integrity, 'ok');
  assert.deepEqual(inspecao.counts, resultado.origem.counts);

  // E é cópia, não atalho: escrever na origem depois não muda o backup.
  await aberto.database
    .prepare("INSERT INTO arena_rooms (id, code, title, status, preset, expected_players, created_at, updated_at) VALUES (?, ?, ?, 'waiting', 'classic', 10, ?, ?)")
    .run('sala-2', 'DEF34', 'Turma de sábado', Date.now() / 1000, Date.now() / 1000);
  const depois = openDatabase(destino);
  const contagemDepois = await inspectDatabase(depois);
  depois.close();
  assert.equal(contagemDepois.counts.arena_rooms, 1, 'o backup ficou com o estado do momento em que foi tirado');
  aberto.close();
});

test('o exercício de restauração devolve o banco inteiro, com as mesmas contagens', async () => {
  const { aberto } = await bancoComDados();
  const copia = caminho('copia.sqlite');
  await backupDatabase(aberto, copia);
  const origem = await inspectDatabase(aberto);
  aberto.close();

  const destino = caminho('restaurado.sqlite');
  const resultado = await restoreDatabase({ backup: copia, destination: destino });
  assert.equal(resultado.restaurado.integrity, 'ok');
  assert.equal(resultado.restaurado.version, origem.version);
  assert.deepEqual(resultado.restaurado.counts, origem.counts, 'restaurou a mesma coisa que foi salva');

  // O banco restaurado é utilizável: recebe escrita nova e mantém o que veio.
  const restaurado = openDatabase(destino);
  await restaurado.migrate();
  await restaurado.database
    .prepare("INSERT INTO arena_rooms (id, code, title, status, preset, expected_players, created_at, updated_at) VALUES (?, ?, ?, 'draft', 'classic', 5, ?, ?)")
    .run('sala-nova', 'GHI56', 'Depois da restauração', Date.now() / 1000, Date.now() / 1000);
  const depois = await inspectDatabase(restaurado);
  restaurado.close();
  assert.equal(depois.counts.arena_rooms, origem.counts.arena_rooms + 1);
  assert.equal(depois.integrity, 'ok');
});

test('nada é sobrescrito por descuido, nem restaurado sem conferência', async () => {
  const { aberto } = await bancoComDados();
  const copia = caminho('copia.sqlite');
  await backupDatabase(aberto, copia);

  // Backup sobre backup: recusado (o "último bom" viraria "último tentado").
  await assert.rejects(backupDatabase(aberto, copia), /já existe/);
  // Cópia corrompida: recusada ANTES de tocar no destino.
  const corrompida = caminho('corrompida.sqlite');
  writeFileSync(corrompida, Buffer.from('isto não é um banco sqlite'));
  const destino = caminho('nao-deve-existir.sqlite');
  await assert.rejects(
    restoreDatabase({ backup: corrompida, destination: destino }),
    /integrity_check|cópia/,
  );
  // Restauração sobre arquivo existente: só com pedido explícito.
  writeFileSync(destino, Buffer.from('ocupado'));
  await assert.rejects(restoreDatabase({ backup: copia, destination: destino }), /já existe/);
  const restaurado = await restoreDatabase({ backup: copia, destination: destino, overwrite: true });
  assert.equal(restaurado.restaurado.integrity, 'ok');

  // Banco gerenciado não ganha cópia local: isso seria uma falsa cópia.
  await assert.rejects(
    backupDatabase({ isRemote: true, database: {} }, caminho('nao.sqlite')),
    /TURSO_URL/,
  );
  aberto.close();
});

test('backup de origem doente é recusado antes de gerar uma cópia com cara de boa', async () => {
  // Origem cujo integrity_check não é "ok": aqui, um adaptador que devolve o
  // veredito — o objetivo é o guarda, não corromper um arquivo de verdade.
  const doente = {
    isRemote: false,
    database: {
      prepare(sql) {
        if (sql.includes('integrity_check')) return { get: async () => ({ integrity_check: 'database disk image is malformed' }) };
        if (sql.includes('user_version')) return { get: async () => ({ user_version: 8 }) };
        return { get: async () => undefined, all: async () => [], run: async () => ({ changes: 0 }) };
      },
    },
  };
  const destino = caminho('copia-de-doente.sqlite');
  await assert.rejects(backupDatabase(doente, destino), /integrity_check/);
  assert.throws(() => readFileSync(destino), 'nenhum arquivo é promovido quando a origem reprova');
});
