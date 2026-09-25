// Sonda: replica o fluxo do teste de transporte e mostra, passo a passo, em que
// sala cada conexao caiu e o que ela recebeu.
import { createServer } from 'node:http';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createRoomEventHub } from '../../src/server/events.mjs';
import { createApplication } from '../../src/server/start.mjs';

process.env.ADMIN_PASSWORD = 'arena-sse-test-pass';
process.env.ADMIN_SECRET = 'arena-sse-test-secret-at-least-32-chars';

const opened = openDatabase(':memory:');
await opened.migrate();
const repositories = createRepositories(opened.database);
await repositories.rooms.createCycle({ id: 'game', now: 9000 });

const hub = createRoomEventHub();
const app = createApplication({
  repositories,
  judge: createFakeJudge(),
  now: () => 9000,
  id: (() => { let n = 0; return () => `id-${++n}`; })(),
  eventHub: hub,
  adminPassword: 'arena-sse-test-pass',
  adminSecret: 'arena-sse-test-secret-at-least-32-chars',
});
const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

let lastCookie = '';
async function post(action, payload = {}) {
  const response = await fetch(`${base}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  lastCookie = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  return { status: response.status, body: await response.json() };
}
const token = () => (/arena_admin=([^;]+)/.exec(lastCookie) || [])[1] || '';

const caixas = [];
const controlador = new AbortController();
async function abrirStream(nome, query = '', cookie = '') {
  const response = await fetch(`${base}/events${query}`, {
    headers: cookie ? { cookie } : {},
    signal: controlador.signal,
  });
  const reader = response.body.getReader();
  const recebido = [];
  caixas.push({ nome, recebido });
  const decoder = new TextDecoder();
  (async () => {
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary < 0) break;
        const bloco = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (bloco.includes('event: room')) recebido.push(bloco.split('data: ')[1]);
      }
    }
  })().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 150));
  return reader;
}

const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function estado(passo) {
  console.log(passo, '| size:', hub.size, 'globalSize:', hub.globalSize,
    '| salas:', caixas.map((caixa) => `${caixa.nome}=${caixa.recebido.length}`).join(' '));
}

await abrirStream('anonima');
estado('1 anonima aberta');

await post('admin_login', { password: 'arena-sse-test-pass' });
const adminToken = token();
console.log('token?', Boolean(adminToken));
await post('arena_set_open', { admin_token: adminToken, open: true });
await pausa(200);
estado('2 global enviado');

const { body: criada } = await post('arena_create_room', { admin_token: adminToken, title: 'Turma SSE' });
const { body: outra } = await post('arena_create_room', { admin_token: adminToken, title: 'Outra Turma' });
console.log('salas:', criada.room.id, outra.room.id);

await post('arena_add_lesson', { admin_token: adminToken, lesson_id: 'aula2-fundacao', room_id: criada.room.id });
await pausa(300);
estado('3 primeira licao (silencio na anonima)');

await abrirStream('painel', `?room=${encodeURIComponent(criada.room.id)}`, `arena_admin=${adminToken}`);
estado('4 painel aberto');

const segunda = await post('arena_add_lesson', { admin_token: adminToken, lesson_id: 'aula2-fundacao', room_id: criada.room.id });
console.log('segunda licao (mesma):', segunda.status, JSON.stringify(segunda.body).slice(0, 120));
await pausa(400);
estado('5 depois da licao repetida');

const terceira = await post('arena_add_lesson', { admin_token: adminToken, lesson_id: 'aula1-fundacao', room_id: criada.room.id });
console.log('terceira licao (outra):', terceira.status, JSON.stringify(terceira.body).slice(0, 120));
await pausa(400);
estado('6 depois de outra licao');

console.log('caixas:', JSON.stringify(caixas.map((caixa) => ({ nome: caixa.nome, eventos: caixa.recebido }))));
controlador.abort();
server.closeAllConnections();
await new Promise((resolve) => server.close(resolve));
opened.close();
