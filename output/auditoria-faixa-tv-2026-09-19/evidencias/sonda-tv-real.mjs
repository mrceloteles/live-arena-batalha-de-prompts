// A PROJECAO REAL (tv.php, sessao de 8h) nas cinco viewports do plano. O teste
// do portao so mede a projecao real em 1920x1080; aqui ela e medida tambem em
// 1280x720, 1024x768 e 390x844, com o selo LIVE medido pelo efeito na barra.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { abrirNavegador, abrirPagina, esperarPor } from '../../test/support/navegador.mjs';

const TITULO = 'Aula 003 — Turma B do período noturno, com missões de argumentação escrita';

const opened = openDatabase(':memory:');
await opened.migrate();
const repositories = createRepositories(opened.database);
const server = createServer(createApplication({
  repositories, judge: createFakeJudge(),
  adminPassword: 'browser-test-password',
  adminSecret: 'browser-test-secret-at-least-32-characters',
}));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const post = async (action, payload = {}) => {
    const r = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await r.json();
    assert.equal(r.status, 200, `${action}: ${JSON.stringify(body)}`);
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

  browser = await abrirNavegador();
  const page = await abrirPagina(browser, { cookie: { name: cookieTv.split('=')[0], value: cookieTv.slice(cookieTv.indexOf('=') + 1), domain: '127.0.0.1', path: '/' } });

  const ler = () => page.evaluate(() => {
    const barra = document.querySelector('.arena-tv-topbar');
    const rb = barra.getBoundingClientRect();
    const filhos = [...barra.children].map((n) => ({ classe: String(n.className).split(' ')[0], caixa: n.getBoundingClientRect(), oculto: n.hidden }));
    const faixas = [];
    for (const f of filhos.filter((x) => !x.oculto)) {
      const topo = Math.round(f.caixa.top - rb.top);
      const faixa = faixas.find((x) => Math.abs(x.topo - topo) < 12);
      if (faixa) faixa.itens.push(f.classe);
      else faixas.push({ topo, itens: [f.classe] });
    }
    const selo = getComputedStyle(barra, '::after');
    let sobreposicao = 0;
    for (const a of filhos) for (const b of filhos) {
      if (a === b) continue;
      const h = Math.min(a.caixa.right, b.caixa.right) - Math.max(a.caixa.left, b.caixa.left);
      const v = Math.min(a.caixa.bottom, b.caixa.bottom) - Math.max(a.caixa.top, b.caixa.top);
      if (h > 0 && v > 0) sobreposicao = Math.max(sobreposicao, Math.round(Math.min(h, v)));
    }
    return {
      altura: Math.round(rb.height),
      faixas: faixas.map((f) => `${f.topo}:${f.itens.sort().join('+')}`),
      sobreposicao,
      rolagemHorizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rolagemVertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      selo: `${selo.gridRowStart}/${selo.gridColumnStart} ${selo.width}x${selo.height}`,
      temFase: document.querySelector('[data-tv-content]')?.className.replace('arena-tv-content', '').trim(),
      palco: Math.round(document.querySelector('[data-tv-stage]').getBoundingClientRect().top),
      barraDaPrevia: Boolean(document.querySelector('[data-tv-preview-bar]')),
    };
  });

  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [390, 844]]) {
    await page.setViewport({ width: w, height: h });
    await page.goto(`${base}/tv.php?pin=${encodeURIComponent(room.pin || room.code)}`);
    await esperarPor(page, () => Boolean(document.querySelector('[data-tv-content]')), { descricao: `a projecao real em ${w}x${h}` });
    await esperarPor(page, () => !document.querySelector('[data-tv-content]').classList.contains('is-connect'), { descricao: `a sala carregar em ${w}x${h}` });
    const m = await ler();
    console.log(`${w}x${h} altura=${m.altura}px fase=${m.temFase} selo=${m.selo} sobreposicao=${m.sobreposicao} rolagemH=${m.rolagemHorizontal} rolagemV=${m.rolagemVertical} palco=${m.palco} previa=${m.barraDaPrevia}`);
    console.log(`    faixas: ${JSON.stringify(m.faixas)}`);
    if (m.faixas.length > 1 && w > 900) console.log(`    ^^ QUEBRA em ${w}x${h}`);
    if (m.sobreposicao) console.log(`    ^^ SOBREPOSICAO em ${w}x${h}: ${m.sobreposicao}px`);
    if (m.rolagemHorizontal) console.log(`    ^^ ROLAGEM HORIZONTAL em ${w}x${h}: ${m.rolagemHorizontal}px`);
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  opened.close();
}
