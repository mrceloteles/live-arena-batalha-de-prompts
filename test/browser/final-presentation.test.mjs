import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { abrirNavegador, abrirPagina } from '../support/navegador.mjs';

async function fixture(t, judge, classic = false) {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const clock = Date.now() / 1000;
  const server = createServer(createApplication({ repositories, now: () => clock,
    judge: createFakeJudge(), arenaJudge: judge, classicJudge: judge,
    adminPassword: 'final-test-password', adminSecret: 'final-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'final-test-password' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const post = async (action, payload = {}) => {
    const response = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    assert.equal(response.status, 200, `${action}: ${JSON.stringify(data)}`);
    return data;
  };
  await post('arena_set_open', { open: true });
  const { room } = await post('arena_create_room', { title: 'Batalha final', preset: classic ? 'classic' : 'personalizado', expected_players: 3 });
  const { challenge } = await post('arena_save_challenge', { title: 'Cartaz da feira', modality: 'precisao',
    mission: 'Crie um prompt para divulgar a feira.', reference_text: 'Feira de tecnologia na escola.', speed_weight: 'none',
    criteria: [{ criterion: 'objetivo', weight: 100 }], attempts: 1 });
  const round = classic ? (await post('arena_room_detail', { room_id: room.id })).detail.rounds[0]
    : (await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id })).round;
  await post('arena_publish_room', { room_id: room.id });
  const actors = [];
  for (const name of ['Ana Martins', 'Bruno Costa', 'Clara Souza']) {
    const joined = await post('arena_join', { name, code: room.code });
    actors.push({ participant_id: joined.participant.id, token: joined.token });
  }
  const browser = await abrirNavegador();
  t.after(async () => {
    server.close();
    server.closeAllConnections();
    await browser.close();
    opened.close();
  });
  const student = await abrirPagina(browser, { viewport: { width: 1280, height: 720 } });
  await student.evaluateOnNewDocument((actor, code) => {
    localStorage.setItem('arena.participant_id', actor.participant_id);
    localStorage.setItem('arena.token', actor.token);
    localStorage.setItem('arena.room_code', code);
  }, actors[0], room.code);
  await student.goto(`${base}/play?pin=${room.code}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await student.waitForSelector('[data-arena-screen="lobby"].is-active');
  const tokenResponse = await fetch(`${base}/api.php?action=arena_tv_token`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ room_id: room.id }) });
  const tvCookie = tokenResponse.headers.get('set-cookie').split(';')[0];
  const tv = await abrirPagina(browser, { cookie: { name: tvCookie.split('=')[0], value: tvCookie.slice(tvCookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' } });
  await tv.goto(`${base}/tv.php?pin=${room.code}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await tv.waitForSelector('.arena-tv-pin strong');
  return { post, room, round, actors, student, tv, browser, base, cookie };
}

test('final honors shared first place, keeps every podium name, and preserves animation across refresh', { timeout: 120000 }, async (t) => {
  const f = await fixture(t, async ({ candidatePrompt }) => ({ percent: candidatePrompt === 'Terceiro' ? 60 : 90, breakdown: {}, feedback: 'Avaliado' }), true);
  await f.post('arena_start_round', { room_id: f.room.id });
  for (const [index, actor] of f.actors.entries()) await f.post('arena_submit', { ...actor, round_id: f.round.id, attempt: 1, prompt: index === 2 ? 'Terceiro' : 'Prompt empatado' });
  await f.post('arena_end_room', { room_id: f.room.id });
  await f.student.bringToFront();
  await f.student.waitForFunction(() => {
    const node = document.querySelector('.arena-victory.is-tied');
    return node && !node.hidden;
  });
  const result = await f.student.evaluate(() => ({
    heading: document.querySelector('[data-arena-empty-title]').textContent,
    names: [...document.querySelectorAll('.arena-victory-place > strong')].map((node) => node.textContent),
  }));
  assert.equal(result.heading, 'Temos campeões');
  assert.deepEqual(result.names, ['Ana Martins', 'Bruno Costa', 'Clara Souza']);
  const celebration = await f.student.$('.arena-victory-confetti');
  await f.student.reload({ waitUntil: 'domcontentloaded' });
  await f.student.waitForFunction(() => document.querySelector('.arena-victory.is-tied')?.hidden === false);
  const retained = await f.student.$('.arena-victory-confetti');
  await f.post('arena_lobby', f.actors[0]);
  await new Promise((resolve) => setTimeout(resolve, 3000));
  assert.equal(await retained.evaluate((node) => node === document.querySelector('.arena-victory-confetti')), true, 'live updates must keep the same celebration node');
  await celebration.dispose();
  await retained.dispose();
  await f.student.setViewport({ width: 390, height: 844 });
  assert.ok(await f.student.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await f.student.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  assert.equal(await f.student.$eval('.arena-victory', (node) => getComputedStyle(node).animationName), 'none');
  await f.tv.bringToFront();
  await f.tv.waitForFunction(() => document.querySelector('.arena-tv-results-head h1')?.textContent === 'Temos campeões');
  const leaders = await f.tv.$$eval('.arena-tv-rank.is-champion .arena-tv-rank-player strong', (nodes) => nodes.map((node) => node.textContent));
  assert.deepEqual(leaders, ['Ana Martins', 'Bruno Costa']);
});

test('TV waits for outstanding scores before showing a final champion', { timeout: 120000 }, async (t) => {
  let resolveJudge;
  const held = new Promise((resolve) => { resolveJudge = resolve; });
  t.after(() => resolveJudge({ percent: 95, breakdown: {}, feedback: 'Avaliado' }));
  const f = await fixture(t, async ({ candidatePrompt }) => candidatePrompt === 'Pendente' ? held : { percent: 80, breakdown: {}, feedback: 'Avaliado' });
  await f.post('arena_start_round', { room_id: f.room.id });
  await f.post('arena_submit', { ...f.actors[0], round_id: f.round.id, attempt: 1, prompt: 'Pronto' });
  const pending = f.post('arena_submit', { ...f.actors[1], round_id: f.round.id, attempt: 1, prompt: 'Pendente' });
  await new Promise((resolve) => setTimeout(resolve, 100));
  await f.post('arena_end_room', { room_id: f.room.id });
  await f.tv.waitForFunction(() => document.querySelector('.arena-tv-results-head h1')?.textContent === 'Conferindo resultado');
  assert.equal(await f.tv.$('.arena-tv-champion'), null);
  await f.student.bringToFront();
  await f.student.waitForFunction(() => document.querySelector('[data-arena-empty-title]')?.textContent === 'Conferindo resultado');
  assert.equal(await f.student.$eval('[data-arena-victory]', (node) => node.hidden), true);
  resolveJudge({ percent: 95, breakdown: {}, feedback: 'Avaliado' });
  await pending;
  await f.tv.bringToFront();
  await f.tv.waitForFunction(() => document.querySelector('.arena-tv-champion-copy strong')?.textContent === 'Bruno Costa');
  await f.student.bringToFront();
  await f.student.waitForFunction(() => document.querySelector('.arena-victory-copy > strong')?.textContent === 'Bruno Costa');
});

test('teacher saves once, shows progress and releases the form after a network failure', { timeout: 120000 }, async (t) => {
  const f = await fixture(t, async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }));
  const admin = await abrirPagina(f.browser, { cookie: { name: 'arena_admin', value: f.cookie.slice(f.cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' } });
  await admin.goto(`${f.base}/admin-arena.php`, { waitUntil: 'domcontentloaded' });
  await admin.waitForSelector('[data-arena-room-list] [data-room-id]');
  await admin.click('[onclick="openCreateRoomDialog()"]');
  await admin.waitForSelector('[data-arena-create-room]');
  await admin.type('[data-arena-create-room] [name=title]', 'Uma sala por clique');
  let requests = 0, release, fail = false;
  const held = new Promise((resolve) => { release = resolve; });
  t.after(() => release());
  await admin.setRequestInterception(true);
  admin.on('request', async (request) => {
    if (request.url().includes('action=arena_create_room')) {
      requests++;
      if (fail) return request.abort('failed');
      await held;
    }
    await request.continue();
  });
  await admin.evaluate(() => { const form = document.querySelector('[data-arena-create-room]'); form.requestSubmit(); form.requestSubmit(); });
  await admin.waitForSelector('[data-arena-create-room][aria-busy="true"]');
  assert.equal(await admin.$eval('[data-arena-create-room] button[type=submit]', (button) => button.disabled), true);
  release();
  await admin.waitForFunction(() => !document.querySelector('[data-arena-dialog]').open);
  assert.equal(requests, 1, 'double submit must create just one room');
  await admin.click('[data-arena-close-detail]');
  await admin.waitForSelector('[onclick="openCreateRoomDialog()"]', { visible: true });
  await admin.click('[onclick="openCreateRoomDialog()"]');
  await admin.waitForSelector('[data-arena-create-room]');
  await admin.type('[data-arena-create-room] [name=title]', 'Falha recuperável');
  fail = true;
  await admin.click('[data-arena-create-room] button[type=submit]');
  await admin.waitForFunction(() => document.querySelector('[data-arena-create-room]')?.getAttribute('aria-busy') !== 'true');
  assert.equal(await admin.$eval('[data-arena-create-room] button[type=submit]', (button) => button.disabled), false);
  assert.equal(await admin.$eval('[data-arena-create-room] [name=title]', (input) => input.value), 'Falha recuperável');
});
