import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '../../src/db/database.mjs';

// O defeito medido: `server.close()` so resolve quando TODAS as conexoes morrem,
// e um stream de SSE é uma conexao viva por definicao. Com a turma conectada, o
// `SIGTERM` de um redeploy ficava esperando os navegadores fecharem sozinhos — e
// o host acabava matando o processo no meio de uma avaliacao.
//
// Aqui o aceite é de PROCESSO: com um stream aberto, o servidor tem de revogar a
// conexao, terminar sozinho e sair com 0, sem ninguem precisar mata-lo.

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const ENTRADA = join(RAIZ, 'src/server/start.mjs');
const AVULSO = join(RAIZ, 'test/support/servidor-para-teste.mjs');
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ESPERA_SUBIR = 30_000;
const ESPERA_SAIR = 15_000;

function ambiente(databasePath) {
  return {
    ...process.env,
    PORT: '0',
    DATABASE_PATH: databasePath,
    NODE_ENV: 'production',
    JUDGE_MODE: 'fallback',
    ADMIN_PASSWORD: 'senha-do-teste-de-encerramento',
    ADMIN_SECRET: 'segredo-do-teste-de-encerramento-32-chars',
    TRUSTED_PROXIES: '127.0.0.1,::1',
    SHUTDOWN_TIMEOUT_MS: '5000',
  };
}

/** Sobe a entrada de produção em outro processo e espera ela anunciar a porta. */
function subir(script, databasePath, extra = {}) {
  const filho = spawn(process.execPath, [script], {
    cwd: RAIZ,
    env: { ...ambiente(databasePath), ...extra },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const estado = { saida: '', erro: '', codigo: null, sinal: null, saiu: false };
  let resolverSaida;
  const saiu = new Promise((resolve) => { resolverSaida = resolve; });
  filho.on('exit', (codigo, sinal) => {
    estado.codigo = codigo;
    estado.sinal = sinal;
    estado.saiu = true;
    resolverSaida(estado);
  });
  const pronto = new Promise((resolve, reject) => {
    const prazo = setTimeout(
      () => reject(new Error(`o servidor nao subiu em ${ESPERA_SUBIR}ms:\n${estado.saida}\n${estado.erro}`)),
      ESPERA_SUBIR,
    );
    filho.stdout.on('data', (pedaco) => {
      estado.saida += pedaco.toString();
      const porta = /http:\/\/localhost:(\d+)/.exec(estado.saida);
      if (porta) { clearTimeout(prazo); resolve(Number(porta[1])); }
    });
    filho.stderr.on('data', (pedaco) => { estado.erro += pedaco.toString(); });
    filho.once('error', (erro) => { clearTimeout(prazo); reject(erro); });
  });
  return { filho, estado, pronto, saiu };
}

/** Abre o stream de tempo real e devolve o que ele receber. */
async function abrirStream(base, { timeoutMs = 30_000 } = {}) {
  const recebido = [];
  const resposta = await new Promise((resolve, reject) => {
    const pedido = get(`${base}/events`, (res) => resolve(res));
    pedido.on('error', reject);
    pedido.setTimeout(timeoutMs, () => reject(new Error('o stream nao abriu')));
  });
  resposta.on('data', (pedaco) => recebido.push(pedaco.toString()));
  // `retry:` chega no primeiro escrito: sem ele a conexao pode nem ter subido.
  const prazo = Date.now() + 5_000;
  while (Date.now() < prazo && !recebido.join('').includes('retry:')) await dormir(50);
  assert.ok(recebido.join('').includes('retry:'), 'o stream abriu de verdade');
  return { resposta, recebido: () => recebido.join('') };
}

async function conferirEncerramento({ filho, estado, saiu, base, stream }, diretorio, databasePath) {
  const terminou = await Promise.race([saiu, dormir(ESPERA_SAIR).then(() => null)]);
  assert.ok(terminou, `o processo nao saiu sozinho (stream ainda aberto?):\n${estado.saida}\n${estado.erro}`);
  assert.equal(terminou.sinal, null, `o processo foi morto por sinal em vez de sair sozinho:\n${estado.saida}`);
  assert.equal(terminou.codigo, 0, `codigo de saida ${terminou.codigo}:\n${estado.saida}\n${estado.erro}`);

  const texto = stream.recebido();
  assert.match(texto, /event: revoked/, 'a conexao de tempo real recebeu o aviso antes do fim');
  assert.match(texto, /server_shutdown/);
  assert.match(estado.saida, /drenou: true/, 'o encerramento registrou que a casa ficou vazia');
  // `cancelou: true` só aparece quando a entrada de produção liga o sinal de
  // cancelamento ao juiz: é o fio, visto de fora, e não uma reafirmação do que
  // o teste injetou.
  assert.match(estado.saida, /cancelou: true/, 'a rede externa foi cancelada no encerramento');
  stream.resposta.destroy();

  // O banco sai inteiro e destravado: e a prova de que ele foi fechado antes de o
  // processo terminar, e nao largado com um journal pela metade.
  const reaberto = openDatabase(databasePath);
  await reaberto.migrate();
  const salas = await reaberto.database.prepare('SELECT COUNT(*) AS total FROM arena_rooms').get();
  assert.equal(Number(salas.total), 0, 'o banco reabre e responde');
  reaberto.close();
  void diretorio;
  void filho;
}

test('encerramento com um stream aberto: a conexão é revogada e o processo sai sozinho', { timeout: 90_000 }, async () => {
  const diretorio = mkdtempSync(join(tmpdir(), 'shutdown-avulso-'));
  const databasePath = join(diretorio, 'arena.sqlite');
  const servidor = subir(AVULSO, databasePath, { DESLIGAR_EM_MS: '1200' });
  let stream;
  try {
    const porta = await servidor.pronto;
    const base = `http://127.0.0.1:${porta}`;
    const pronto = await fetch(`${base}/readyz`);
    assert.equal(pronto.status, 200, 'a instancia esta pronta antes de comecar');

    stream = await abrirStream(base);
    await conferirEncerramento({ ...servidor, base, stream }, diretorio, databasePath);
  } finally {
    stream?.resposta?.destroy();
    if (!servidor.estado.saiu) servidor.filho.kill('SIGKILL');
    rmSync(diretorio, { recursive: true, force: true });
  }
});

// O sinal de verdade: onde ele existe (o CI é Linux), a entrada de produção tem
// de tratar `SIGTERM` como o caminho de encerramento. No Windows a chamada vira
// termino imediato e nenhum handler roda, entao o caso é pulado com o motivo.
test('SIGTERM encerra a entrada de produção com código 0', {
  timeout: 90_000,
  skip: process.platform === 'win32'
    ? 'Windows nao entrega SIGTERM a outro processo: a chamada termina o processo sem rodar handler'
    : false,
}, async () => {
  const diretorio = mkdtempSync(join(tmpdir(), 'shutdown-sinal-'));
  const databasePath = join(diretorio, 'arena.sqlite');
  const servidor = subir(ENTRADA, databasePath);
  let stream;
  try {
    const porta = await servidor.pronto;
    const base = `http://127.0.0.1:${porta}`;
    stream = await abrirStream(base);

    servidor.filho.kill('SIGTERM');
    await conferirEncerramento({ ...servidor, base, stream }, diretorio, databasePath);
  } finally {
    stream?.resposta?.destroy();
    if (!servidor.estado.saiu) servidor.filho.kill('SIGKILL');
    rmSync(diretorio, { recursive: true, force: true });
  }
});
