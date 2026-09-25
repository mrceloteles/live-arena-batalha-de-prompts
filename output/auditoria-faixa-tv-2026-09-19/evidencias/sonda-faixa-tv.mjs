// Sonda da faixa superior da TV: mede a barra nas cinco viewports do plano, com
// titulo longo e rodada viva, e responde a pergunta que o teste do portao nao
// responde — o selo LIVE e um `::after`, ou seja, nao aparece em `children` e
// por isso pode estar numa faixa propria sem que a contagem antiga perceba.
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
    return body;
  };
  await post('arena_set_open', { open: true });
  const { room } = await post('arena_create_room', { title: TITULO, preset: 'personalizado', expected_players: 2 });
  const { challenge } = await post('arena_save_challenge', {
    title: 'Cartaz da feira', modality: 'precisao', mission: 'Escreva o prompt do cartaz.',
    reference_text: 'Cartaz A3 da feira, com data, local e contato.',
    criteria: [{ criterion: 'objetivo', weight: 100 }],
  });
  await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
  await post('arena_publish_room', { room_id: room.id });
  console.log(`sala ${room.id} (${room.code}) — titulo de ${TITULO.length} caracteres`);

  const entrar = async (nome) => {
    const r = await fetch(`${base}/api.php?action=arena_join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: room.code, name: nome }) });
    const body = await r.json();
    assert.equal(r.status, 200, JSON.stringify(body));
  };
  await entrar('Ana');
  await entrar('Bia');
  const iniciada = await post('arena_start_round', { room_id: room.id });
  const detalhe = await post('arena_room_detail', { room_id: room.id });
  console.log('start_round ->', JSON.stringify(iniciada).slice(0, 200));
  console.log('status depois do start ->', detalhe.room?.status, '| rodada', detalhe.room?.current_round);

  browser = await abrirNavegador();
  const page = await abrirPagina(browser, { cookie: { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' } });

  const lerBarra = () => page.evaluate(() => {
    const barra = document.querySelector('.arena-tv-topbar');
    if (!barra) return null;
    const rb = barra.getBoundingClientRect();
    const filhos = [...barra.children].map((n) => ({ classe: String(n.className).split(' ')[0], caixa: n.getBoundingClientRect(), hidden: n.hidden }));
    const faixas = [];
    for (const f of filhos.filter((x) => !x.hidden)) {
      const topo = Math.round(f.caixa.top - rb.top);
      const faixa = faixas.find((x) => Math.abs(x.topo - topo) < 20);
      if (faixa) faixa.itens.push(f.classe);
      else faixas.push({ topo, itens: [f.classe] });
    }
    let estoura = 0;
    for (const f of filhos) estoura = Math.max(estoura, Math.round(f.caixa.right - rb.right), Math.round(rb.left - f.caixa.left));
    let sobreposicao = 0;
    for (const a of filhos) for (const b of filhos) {
      if (a === b) continue;
      const h = Math.min(a.caixa.right, b.caixa.right) - Math.max(a.caixa.left, b.caixa.left);
      const v = Math.min(a.caixa.bottom, b.caixa.bottom) - Math.max(a.caixa.top, b.caixa.top);
      if (h > 0 && v > 0) sobreposicao = Math.max(sobreposicao, Math.round(Math.min(h, v)));
    }
    const selo = getComputedStyle(barra, '::after');
    const titulo = document.querySelector('[data-tv-room-title]');
    const botao = document.querySelector('[data-tv-fullscreen]').getBoundingClientRect();
    return {
      altura: Math.round(rb.height),
      faixas: faixas.map((f) => ({ topo: f.topo, itens: f.itens.sort().join('+') })),
      sobreposicao, estoura,
      rolagemHorizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      selo: { linha: selo.gridRowStart, coluna: selo.gridColumnStart, altura: selo.height, largura: selo.width, display: selo.display },
      titulo: titulo && !titulo.closest('[hidden]') ? { largura: Math.round(titulo.getBoundingClientRect().width), cortado: titulo.scrollWidth > Math.ceil(titulo.getBoundingClientRect().width) + 1 } : null,
      botao: { altura: Math.round(botao.height), largura: Math.round(botao.width), topo: Math.round(botao.top - rb.top) },
      fase: document.querySelector('[data-tv-content]')?.className,
    };
  });

  // A/B do selo: com `display:none` nele, se a barra encolher ou os filhos
  // mudarem de topo, o selo ocupava uma faixa so dele.
  const abrirSelo = async () => {
    const antes = await page.evaluate(() => {
      const b = document.querySelector('.arena-tv-topbar').getBoundingClientRect();
      return { altura: Math.round(b.height), filhos: [...document.querySelector('.arena-tv-topbar').children].map((n) => Math.round(n.getBoundingClientRect().top - b.top)) };
    });
    if (!(await page.evaluate(() => Boolean(document.getElementById('sonda-selo'))))) {
      await page.addStyleTag({ content: '.arena-tv-topbar::after { display: none !important; }', id: undefined }).catch(() => {});
    }
    const depois = await page.evaluate(() => {
      const b = document.querySelector('.arena-tv-topbar').getBoundingClientRect();
      return { altura: Math.round(b.height), filhos: [...document.querySelector('.arena-tv-topbar').children].map((n) => Math.round(n.getBoundingClientRect().top - b.top)) };
    });
    return { antes, depois };
  };

  const viewports = [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [390, 844]];
  for (const [w, h] of viewports) {
    await page.setViewport({ width: w, height: h });
    await page.goto(`${base}/tv-preview.php?room=${room.id}`);
    await esperarPor(page, () => Boolean(document.querySelector('.arena-tv-topbar')), { descricao: `a barra em ${w}x${h}` });
    await esperarPor(page, () => { const s = document.querySelector('[data-tv-room-title]'); return Boolean(s && s.textContent.trim()); }, { descricao: 'o titulo da sala' });
    const m = await lerBarra();
    console.log(`${w}x${h}`, JSON.stringify(m));
    if (m.faixas.length > 1 && m.rolagemHorizontal === 0) console.log(`  ^^ QUEBRA em ${w}x${h}`);
    if (m.rolagemHorizontal) console.log(`  ^^ ROLAGEM HORIZONTAL em ${w}x${h}: ${m.rolagemHorizontal}px`);
    if (m.estoura > 0) console.log(`  ^^ FILHO FORA DA BARRA em ${w}x${h}: ${m.estoura}px`);
    if (m.sobreposicao > 0) console.log(`  ^^ SOBREPOSICAO em ${w}x${h}: ${m.sobreposicao}px`);
    if (w >= 1024) {
      const ab = await abrirSelo();
      const mudou = ab.antes.altura !== ab.depois.altura || ab.antes.filhos.join() !== ab.depois.filhos.join();
      console.log(`  selo LIVE desligado: barra ${ab.antes.altura}->${ab.depois.altura}px, filhos ${ab.antes.filhos.join(',')} -> ${ab.depois.filhos.join(',')}${mudou ? '  ^^ O SELO OCUPA FAIXA PROPRIA' : '  (nada muda: o selo divide a linha)'}`);
      await page.evaluate(() => { const n = document.querySelector('[data-tv-reconnect]'); if (n) n.hidden = false; });
      console.log('  com aviso de reconexao:', JSON.stringify(await page.evaluate(() => {
        const b = document.querySelector('.arena-tv-topbar').getBoundingClientRect();
        const a = document.querySelector('[data-tv-reconnect]').getBoundingClientRect();
        return { alturaBarra: Math.round(b.height), cobreABarra: a.top < b.bottom - 1, topoAviso: Math.round(a.top), baseBarra: Math.round(b.bottom) };
      })));
    }
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  opened.close();
}
