// Backup e restauração do banco, exercitados de verdade.
//
// A auditoria de prontidão registrou o buraco: a documentação falava em backup,
// mas não havia exercício de restauração verificado. Um procedimento que nunca
// foi executado não é um procedimento — é uma esperança.
//
// Aqui o backup é `VACUUM INTO`: o SQLite escreve um banco NOVO e consistente a
// partir do estado atual, sem parar o servidor e sem depender de copiar o
// arquivo por baixo (o que poderia pegar um WAL pela metade). Vale para o
// backend escolhido — arquivo local em volume persistente.
//
// O que este módulo se recusa a fazer, e por quê:
//   - backend remoto (Turso): `VACUUM INTO` escreveria no disco do SERVIDOR do
//     provedor, não no do operador. O backup de um banco gerenciado é do
//     provedor (dump/ponto no tempo), e inventar aqui um arquivo local daria
//     uma falsa sensação de cópia;
//   - sobrescrever arquivo existente: um backup em cima de outro transforma o
//     "último bom" no "último tentado". Quem restaura pede explicitamente;
//   - restaurar sem conferir a cópia: um backup corrompido restaurado por cima
//     do banco bom é a forma mais rápida de perder os dois.

import { copyFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs';

import { openDatabase } from './database.mjs';

/** Tabelas que o exercício de restauração confere. Ausente = ignorada. */
export const CONTAGEM_TABELAS = Object.freeze([
  'arena_rooms',
  'arena_participants',
  'challenges',
  'room_rounds',
  'arena_submissions',
  'arena_scores',
]);

/**
 * Contagens e sanidade de um banco (o de origem, a cópia ou o restaurado).
 * `user_version` também, para a restauração provar que trouxe a migração certa.
 */
export async function inspectDatabase(opened) {
  const integridade = await opened.database.prepare('PRAGMA integrity_check').get();
  const versao = await opened.database.prepare('PRAGMA user_version').get();
  const counts = {};
  for (const tabela of CONTAGEM_TABELAS) {
    const existe = await opened.database
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tabela);
    if (!existe) continue;
    const linha = await opened.database.prepare(`SELECT COUNT(*) AS total FROM ${tabela}`).get();
    counts[tabela] = Number(linha.total);
  }
  return {
    integrity: String(Object.values(integridade || {})[0] ?? ''),
    version: Number(versao?.user_version ?? 0),
    counts,
  };
}

/**
 * Copia consistente do banco para `destination`.
 * Recusa destino existente e origem remota; confere a origem antes (um banco
 * corrompido não deve gerar uma cópia com cara de boa).
 */
/**
 * Abre um arquivo só para conferir. Um arquivo que não é banco (ou que o SQLite
 * recusa) tem de virar recusa EXPLICADA — a mensagem crua do driver não diz a
 * quem opera o que fazer.
 */
async function conferirArquivo(arquivo, papel) {
  let aberto;
  try {
    aberto = openDatabase(arquivo);
    return await inspectDatabase(aberto);
  } catch (error) {
    throw new Error(`${papel} não é um banco SQLite legível (${error?.message || error})`);
  } finally {
    aberto?.close?.();
  }
}

export async function backupDatabase(opened, destination, { overwrite = false } = {}) {
  if (!destination) throw new TypeError('o destino do backup é obrigatório');
  if (opened?.isRemote) {
    throw new Error(
      'backup de banco gerenciado (TURSO_URL) não é feito por aqui: VACUUM INTO escreveria no disco do provedor. '
      + 'Use o dump/ponto-no-tempo do provedor e restaure com `npm run restaurar-banco`.',
    );
  }
  if (existsSync(destination) && !overwrite) {
    throw new Error(`o destino do backup já existe (${destination}): escolha outro nome ou peça overwrite explicitamente`);
  }
  const origem = await inspectDatabase(opened);
  if (origem.integrity !== 'ok') {
    throw new Error(`a origem reprovou o integrity_check (${origem.integrity}): corrija antes de gerar cópia`);
  }
  const parcial = `${destination}.parcial`;
  rmSync(parcial, { force: true });
  try {
    await opened.database.prepare('VACUUM INTO ?').run(parcial);
    // Só promove a cópia depois de ela mesma se declarar sã.
    const conferida = await conferirArquivo(parcial, 'a cópia');
    if (conferida.integrity !== 'ok') {
      throw new Error(`a cópia reprovou o integrity_check (${conferida.integrity})`);
    }
    renameSync(parcial, destination);
    return {
      destination,
      bytes: statSync(destination).size,
      origem,
      copia: conferida,
      countsIguais: JSON.stringify(origem.counts) === JSON.stringify(conferida.counts),
    };
  } finally {
    rmSync(parcial, { force: true });
  }
}

/**
 * Exercício de restauração: confere a cópia e o arquivo restaurado, e devolve os
 * dois lados para comparar. Recusa usar uma cópia doente.
 */
export async function restoreDatabase({ backup, destination, overwrite = false } = {}) {
  if (!backup || !destination) throw new TypeError('backup e destino são obrigatórios');
  if (!existsSync(backup)) throw new Error(`o arquivo de backup não existe: ${backup}`);
  if (existsSync(destination) && !overwrite) {
    throw new Error(`o destino da restauração já existe (${destination}): escolha outro caminho ou peça overwrite`);
  }
  // Nada é escrito no destino antes de a cópia se declarar sã.
  const conferida = await conferirArquivo(backup, 'a cópia');
  if (conferida.integrity !== 'ok') {
    throw new Error(`a cópia reprovou o integrity_check (${conferida.integrity}): não restaurada`);
  }
  copyFileSync(backup, destination);
  const conferidoRestaurado = await conferirArquivo(destination, 'o banco restaurado');
  if (JSON.stringify(conferida.counts) !== JSON.stringify(conferidoRestaurado.counts)) {
    throw new Error('as contagens do banco restaurado não batem com as da cópia');
  }
  return { backup, destination, bytes: statSync(destination).size, conferida, restaurado: conferidoRestaurado };
}
