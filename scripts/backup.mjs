#!/usr/bin/env node
// Backup do banco local, consistente e conferido.
//
//   npm run backup-banco                      (grava em ./var/backups/)
//   npm run backup-banco -- /caminho/fora/do/servidor.sqlite
//   npm run backup-banco -- conferir <arquivo>
//
// O destino padrão é DENTRO da máquina (./var/backups). Isso protege contra o
// erro de deploy, não contra a perda da máquina: guarde a cópia fora do
// servidor (outro disco, objeto remoto) — o `cron` do DEPLOYMENT.md mostra como.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { backupDatabase, inspectDatabase } from '../src/db/backup.mjs';
import { openDatabase } from '../src/db/database.mjs';

const root = join(import.meta.dirname, '..');
try { process.loadEnvFile(join(root, '.env')); } catch { /* sem .env: usa o ambiente */ }

const databasePath = process.env.DATABASE_PATH || './var/descubra-o-prompt.sqlite';
const [comando, ...resto] = process.argv.slice(2);

if (comando === 'conferir') {
  const arquivo = resto[0];
  if (!arquivo) {
    console.error('uso: npm run backup-banco -- conferir <arquivo>');
    process.exit(2);
  }
  const aberto = openDatabase(arquivo);
  try {
    const inspecao = await inspectDatabase(aberto);
    console.log(JSON.stringify({ arquivo, ...inspecao }, null, 2));
    if (inspecao.integrity !== 'ok') process.exitCode = 1;
  } finally {
    aberto.close();
  }
} else {
  const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const destino = comando || join(root, 'var', 'backups', `descubra-o-prompt-${carimbo}.sqlite`);
  mkdirSync(dirname(destino), { recursive: true });
  const aberto = openDatabase(databasePath);
  try {
    const resultado = await backupDatabase(aberto, destino);
    console.log(`backup: ${resultado.destination}`);
    console.log(`tamanho: ${resultado.bytes} bytes`);
    console.log(`origem — versão ${resultado.origem.version}, integrity_check ${resultado.origem.integrity}`);
    console.log(`contagens iguais na cópia: ${resultado.countsIguais}`);
    console.log(JSON.stringify(resultado.copia.counts, null, 2));
  } finally {
    aberto.close();
  }
}
