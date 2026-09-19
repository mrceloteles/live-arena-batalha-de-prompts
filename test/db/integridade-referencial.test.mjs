import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { checkReferentialIntegrity, describeIntegrity } from '../../src/db/integrity.mjs';

// O defeito que este diagnóstico existe para pegar:
//   `test/db/remote-adapter.test.mjs` conferia a ORDEM das chamadas num cliente
//   SIMULADO — e continuaria verde mesmo com o banco aceitando referência órfã.
//   A auditoria de prontidão reproduziu o caso com o cliente libSQL real: o
//   `PRAGMA foreign_keys` ligado dentro de uma transação já aberta não valia.
//
// Aqui a pergunta vai ao banco: uma referência órfã nova é recusada? E os dados
// atuais têm lixo? Os dois casos de reprovação são exercitados de verdade — um
// criando um órfão com as FKs desligadas, o outro com um backend que aceita.
const temporarios = [];
function bancoTemporario(nome = 'banco.sqlite') {
  const diretorio = mkdtempSync(join(tmpdir(), 'integridade-'));
  temporarios.push(diretorio);
  return join(diretorio, nome);
}

process.on('exit', () => {
  for (const diretorio of temporarios) {
    try { rmSync(diretorio, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* arquivo preso pelo cliente */ }
  }
});

async function tabelasDeProva(opened) {
  const linhas = await opened.database
    .prepare("SELECT name FROM sqlite_master WHERE name LIKE '_prova_integridade%'")
    .all();
  return linhas.map((linha) => linha.name);
}

test('no banco local, a integridade referencial é comprovada e a sonda não deixa tabela', async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const report = await checkReferentialIntegrity(opened);
  assert.equal(report.ok, true, report.reason);
  assert.equal(report.backend, 'local');
  assert.equal(report.orphanRejected, true);
  assert.match(report.orphanError, /FOREIGN KEY/i);
  assert.equal(report.violations.length, 0);
  assert.deepEqual(await tabelasDeProva(opened), [], 'a sonda não persiste tabela no banco do produto');
  opened.close();
});

test('pelo adaptador remoto (cliente libSQL de verdade), a mesma pergunta é respondida pelo banco', async () => {
  // `file:` faz o @libsql/client atender de verdade — sem rede e sem simulação:
  // é o mesmo adaptador que produção usa no caminho remoto.
  const caminho = bancoTemporario('remoto.sqlite');
  const opened = openDatabase('', { url: `file:${caminho}` });
  assert.equal(opened.isRemote, true);
  await opened.migrate();
  const report = await checkReferentialIntegrity(opened);
  assert.equal(report.backend, 'remoto');
  assert.equal(report.orphanRejected, true, `o adaptador remoto recusou o órfão (${report.orphanError})`);
  assert.equal(report.ok, true, report.reason);
  assert.deepEqual(await tabelasDeProva(opened), []);
  opened.close();
});

test('a sonda ACHA os órfãos que já existem, mesmo com as FKs desligadas na escrita', async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  // O lixo que a auditoria descreve: referência gravada quando nada a impedia.
  await opened.database.exec('PRAGMA foreign_keys = OFF');
  await opened.database
    .prepare('INSERT INTO arena_participants (id, room_id, name, token, joined_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('p-orfao', 'sala-que-nao-existe', 'Ana', 'token-orfao', 1, 1);

  const report = await checkReferentialIntegrity(opened);
  assert.equal(report.ok, false, 'banco com lixo não pode ser aprovado');
  assert.equal(report.violations.length >= 1, true, `violações: ${JSON.stringify(report.violations)}`);
  assert.match(report.reason, /órfã/);
  assert.match(describeIntegrity(report), /REPROVADO/);
  opened.close();
});

test('um backend que aceita referência órfã é reprovado — e a mensagem diz o que fazer', async () => {
  // A sonda de um caminho remoto que não honra o pragma: o INSERT "passa".
  const aceitaTudo = {
    exec: async () => {},
    prepare: () => ({
      get: async () => ({ foreign_keys: 0 }),
      all: async () => [],
      run: async () => ({ changes: 1, lastInsertRowid: 1 }),
    }),
    transaction: async (work) => work(aceitaTudo),
  };
  const report = await checkReferentialIntegrity({ database: aceitaTudo, isRemote: true });
  assert.equal(report.orphanRejected, false);
  assert.equal(report.foreignKeys, 0);
  assert.equal(report.ok, false);
  assert.match(report.reason, /aceitou uma referência órfã/);
  const texto = describeIntegrity(report);
  assert.match(texto, /validar-integridade/);
  assert.equal(/TURSO_AUTH_TOKEN|GEMINI_API_KEY/.test(texto), false, 'o veredito não carrega valor de ambiente');
});
