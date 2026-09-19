#!/usr/bin/env node
// Exercício de restauração: confere a cópia e escreve o banco restaurado.
//
//   npm run restaurar-banco -- ./var/backups/copia.sqlite ./var/restaurado.sqlite
//   npm run restaurar-banco -- ./backups/copia.sqlite /data/banco.sqlite --sobrescrever
//
// O destino é SEMPRE explícito. Restaurar por cima do banco em uso é uma
// decisão, não um atalho: por isso o destino tem de ser escrito por quem chama e
// o destino existente só é tocado com `--sobrescrever`.
//
// O `--sobrescrever` troca o arquivo — para o banco em uso isso significa parar o
// servidor antes (ou apontar DATABASE_PATH para o novo arquivo e reiniciar).
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

import { restoreDatabase } from '../src/db/backup.mjs';

const root = join(import.meta.dirname, '..');
try { process.loadEnvFile(join(root, '.env')); } catch { /* sem .env: usa o ambiente */ }

const argumentos = process.argv.slice(2);
const sobrescrever = argumentos.includes('--sobrescrever');
const [backup, destino] = argumentos.filter((argumento) => !argumento.startsWith('--'));

if (!backup || !destino) {
  console.error('uso: npm run restaurar-banco -- <arquivo-de-backup> <destino> [--sobrescrever]');
  process.exit(2);
}

mkdirSync(dirname(destino), { recursive: true });
const resultado = await restoreDatabase({ backup, destination: destino, overwrite: sobrescrever });
console.log(`restaurado: ${resultado.destination} (${resultado.bytes} bytes)`);
console.log(`cópia — versão ${resultado.conferida.version}, integrity_check ${resultado.conferida.integrity}`);
console.log(`restaurado — versão ${resultado.restaurado.version}, integrity_check ${resultado.restaurado.integrity}`);
console.log(JSON.stringify(resultado.restaurado.counts, null, 2));
console.log('\nConfira antes de apontar o servidor para este arquivo: as contagens acima são as do banco restaurado.');
