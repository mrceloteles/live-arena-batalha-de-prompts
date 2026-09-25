// Por que a volta da aba nao disparou uma leitura? Sonda direta:
// abre o aluno, conta consultas no servidor e imprime o que a pagina ve.
import { createServer } from 'node:http';

import { abrirNavegador, abrirPagina } from '../../test/support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createRoomEventHub } from '../../src/server/events.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const opened = openDatabase(':memory:');
await opened.migrate();
const repositories = createRepositories(opened.database);
await repositories.rooms.createCycle({ id: 'probe-game', now: 40_000 });

const hub = createRoomEventHub();
let lobbyCalls = 0;
let cookie = '';
const handler = createApplication({
  repositories, judge: createFakeJudge(), eventHub: hub,
  adminPassword: 'probe-password', adminSecret: 'probe-secret-at-least-32-characters',
});
const server = createServer((request, response) => {
  if (String(request.url).includes('action=arena_lobby')) lobbyCalls += 1;
  handler(request, response);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const post = async (action, payload = {}) => {
  const response = await fetch(`${base}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  });
  const setCookie = response.headers.getSetCookie?.()[0] || '';
  const match = /arena_admin=([^;]+)/.exec(setCookie);
  if (match) cookie = `arena_admin=${match[1]}`;
  return response.json();
};

await post('admin_login', { password: 'probe-password' });
await post('arena_set_open', { open: true });
const { room } = await post('arena_create_room', { title: 'Sonda visibilidade', expected_players: 3 });
const { challenge } = await post('arena_save_challenge', {
  title: 'Missão', modality: 'precisao', mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
  criteria: [{ criterion: 'objetivo', weight: 50 }, { criterion: 'contexto', weight: 50 }],
  duration_seconds: 600, speed_weight: 'none', reference_text: 'Cartaz A3 da feira, com data e contato.',
});
await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
await post('arena_publish_room', { room_id: room.id });

const browser = await abrirNavegador();
const page = await abrirPagina(browser);
page.on('console', (m) => console.log('[pagina]', m.text()));
page.on('pageerror', (e) => console.log('[erro da pagina]', e.message));
await page.goto(`${base}/play?pin=${room.code}`);
await page.type('[data-arena-join-form] [name=name]', 'Ana');
await page.click('[data-arena-join-form] button[type=submit]');
await page.waitForSelector('[data-arena-screen="lobby"].is-active');
await dormir(1200);

const rajada = (n, roomId = room.id) => {
  for (let i = 0; i < n; i += 1) hub.broadcast('arena_submit', { serverNow: 40_000 + i, roomId });
};

console.log('antes:', lobbyCalls);
const rajadaAntes = lobbyCalls;
rajada(20);
await dormir(1500);
console.log('depois da rajada visivel:', lobbyCalls - rajadaAntes, 'total', lobbyCalls);

await page.evaluate(() => {
  window.__visEvents = 0;
  document.addEventListener('visibilitychange', () => { window.__visEvents += 1; });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});
console.log('estado escondido:', await page.evaluate(() => ({ vis: document.visibilityState, eventos: window.__visEvents })));
await dormir(4000);
console.log('depois de 4 s oculto (nao pode subir):', lobbyCalls);
const ocultaAntes = lobbyCalls;
rajada(20);
await dormir(1500);
console.log('rajada com aba oculta:', lobbyCalls - ocultaAntes, 'total', lobbyCalls);
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
});
console.log('estado visivel:', await page.evaluate(() => ({ vis: document.visibilityState, eventos: window.__visEvents })));
await dormir(1500);
console.log('depois de voltar:', lobbyCalls);

await browser.close();
server.closeAllConnections();
server.close();
opened.close();
