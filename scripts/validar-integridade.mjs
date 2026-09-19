#!/usr/bin/env node
// Prova, no banco CONFIGURADO (o mesmo que o servidor vai usar), que a
// integridade referencial vale nele: cria uma referência órfã de verdade e
// confere se o banco a recusa, além de varrer os dados atuais com
// `PRAGMA foreign_key_check`.
//
//   node scripts/validar-integridade.mjs
//   npm run validar-integridade
//
// Sai com 0 quando comprova e com 1 quando reprova. No caso do backend remoto
// (`TURSO_URL`), 0 é o que autoriza o operador a definir
// `TURSO_INTEGRITY_VERIFIED=1` — a marca que destrava o boot em produção.
//
// NÃO altera dados do produto: a sonda roda em transação e as tabelas de prova
// são derrubadas antes do commit.
import { join } from 'node:path';

import { openDatabase } from '../src/db/database.mjs';
import { checkReferentialIntegrity, describeIntegrity } from '../src/db/integrity.mjs';
import { INTEGRITY_VERIFIED_FLAG } from '../src/server/hosting.mjs';

const root = join(import.meta.dirname, '..');
try { process.loadEnvFile(join(root, '.env')); } catch { /* sem .env: usa o ambiente */ }

const databasePath = process.env.DATABASE_PATH || './var/descubra-o-prompt.sqlite';
const remote = Boolean(String(process.env.TURSO_URL || '').trim());
console.log(`banco: ${remote ? 'gerenciado (TURSO_URL)' : databasePath}`);

const opened = openDatabase(databasePath);
try {
  if (!remote) await opened.migrate();
  const report = await checkReferentialIntegrity(opened);
  console.log(describeIntegrity(report));
  if (!report.ok) process.exitCode = 1;
  else if (remote) {
    console.log(
      `\nComprovação registrada. Para a instalação poder subir em produção, defina no ambiente do serviço:\n`
      + `  ${INTEGRITY_VERIFIED_FLAG}=1`,
    );
  }
} catch (error) {
  console.error(`falha ao validar a integridade referencial: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  opened.close();
}
