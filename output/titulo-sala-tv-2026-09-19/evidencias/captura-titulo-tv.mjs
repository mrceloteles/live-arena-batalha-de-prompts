// Captura a projecao REAL (tv.php com sessao de projecao) com o titulo maximo,
// em 1920x1080, 1280x720 e 1024x768, e grava os PNGs como evidencia visual.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { abrirNavegador, abrirPagina, esperarPor } from '../../test/support/navegador.mjs';

const TITULO = 'Aula 003 — Turma B do período noturno, oficina de prompts para o cartaz da feira de tecnologia, com três rodadas'.slice(0, 120);
const SAIDA = new URL('../../output/titulo-sala-tv-2026-09-19/evidencias/', import.meta.url);
mkdirSync(SAIDA, { recursive: true });

const opened = openDatabase(':memory:');
await opened.migrate();
const server = createServer(createApplication({
  repositories: createRepositories(opened.database), judge: createFakeJudge(),
  adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters',
}));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const post = async (a, p = {}, extra = {}) => {
    const r = await fetch(`${base}/api.php?action=${a}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', ...extra }, body: JSON.stringify(p) });
    const body = await r.json();
    assert.equal(r.status, 200, `${a}: ${JSON.stringify(body)}`);
    return { body, cookie: r.headers.get('set-cookie') };
  };
  await post('arena_set_open', { open: true });
  const { room } = (await post('arena_create_room', { title: TITULO, preset: 'personalizado', expected_players: 2 })).body;
  const { challenge } = (await post('arena_save_challenge', {
    title: 'Cartaz da feira', modality: 'precisao', mission: 'Escreva o prompt do cartaz.',
    reference_text: 'Cartaz A3 da feira, com data, local e contato.',
    criteria: [{ criterion: 'objetivo', weight: 100 }],
  })).body;
  await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
  await post('arena_publish_room', { room_id: room.id });
  for (const nome of ['Ana', 'Bia']) {
    const r = await fetch(`${base}/api.php?action=arena_join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: room.code, name: nome }) });
    assert.equal(r.status, 200, `${nome}: ${JSON.stringify(await r.json())}`);
  }
  await post('arena_start_round', { room_id: room.id });
  const token = await post('arena_tv_token', { room_id: room.id });
  const cookieTv = token.cookie.split(';')[0];
  console.log('titulo gravado:', String(room.title).length, 'caracteres | rodada viva');

  browser = await abrirNavegador();
  const page = await abrirPagina(browser, { viewport: { width: 1920, height: 1080 }, cookie: { name: cookieTv.split('=')[0], value: cookieTv.slice(cookieTv.indexOf('=') + 1), domain: '127.0.0.1', path: '/' } });
  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [1024, 768]]) {
    await page.setViewport({ width: w, height: h });
    await page.goto(`${base}/tv.php?pin=${encodeURIComponent(room.pin || room.code)}`);
    await esperarPor(page, () => !document.querySelector('[data-tv-content]').classList.contains('is-connect'), { descricao: `a sala carregar em ${w}x${h}` });
    // Recorte do CABECALHO: e ele que esta em revisao.
    const alvo = fileURLToPath(new URL(`cabecalho-da-tv__${w}x${h}.png`, SAIDA));
    await page.screenshot({ path: alvo, clip: await page.evaluate(() => { const r = document.querySelector('.arena-tv-topbar').getBoundingClientRect(); return { x: 0, y: 0, width: Math.round(r.width), height: Math.round(r.height) }; }) });
    console.log(`gravado ${alvo}`);
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  opened.close();
}
