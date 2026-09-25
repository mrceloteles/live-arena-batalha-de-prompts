// Geometria da caixa do titulo: chip, caixa do strong, caixa da sala e coluna da
// grade. E com ela a largura do TEXTO em cada fonte candidata, para escolher o
// `clamp` pelo numero que faz o titulo de 120 caracteres caber em duas linhas.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { abrirNavegador, abrirPagina, esperarPor } from '../../test/support/navegador.mjs';

const TITULO = 'Aula 003 — Turma B do período noturno, oficina de prompts para o cartaz da feira de tecnologia, com três rodadas'.padEnd(120, ' e revisão final').slice(0, 120);
console.log('titulo de', TITULO.length, 'caracteres');

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
  const post = async (a, p = {}) => {
    const r = await fetch(`${base}/api.php?action=${a}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(p) });
    const body = await r.json();
    assert.equal(r.status, 200, `${a}: ${JSON.stringify(body)}`);
    return body;
  };
  const { room } = await post('arena_create_room', { title: TITULO, preset: 'personalizado', expected_players: 2 });
  console.log('gravado com', String(room.title).length, 'caracteres');

  browser = await abrirNavegador();
  const page = await abrirPagina(browser, { viewport: { width: 1920, height: 1080 }, cookie: { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' } });

  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [1024, 768]]) {
    await page.setViewport({ width: w, height: h });
    await page.goto(`${base}/tv-preview.php?room=${room.id}`);
    await esperarPor(page, () => { const s = document.querySelector('[data-tv-room-title]'); return Boolean(s && s.textContent.trim()); }, { descricao: `o titulo em ${w}x${h}` });
    const m = await page.evaluate(() => {
      const barra = document.querySelector('.arena-tv-topbar');
      const sala = document.querySelector('[data-tv-room]');
      const forte = document.querySelector('[data-tv-room-title]');
      const chip = document.querySelector('[data-tv-preset]');
      const medida = document.createElement('span');
      medida.textContent = forte.textContent;
      medida.style.cssText = 'position:absolute;left:-9999px;white-space:nowrap;font-weight:700;font-family:' + getComputedStyle(forte).fontFamily;
      document.body.append(medida);
      const larguras = {};
      for (const px of [12, 13, 14, 15, 16, 18, 20]) {
        medida.style.fontSize = px + 'px';
        larguras[px] = Math.round(medida.getBoundingClientRect().width);
      }
      medida.remove();
      const grade = getComputedStyle(barra).gridTemplateColumns.split(' ').map((v) => Math.round(Number.parseFloat(v)));
      return {
        grade,
        chip: chip ? Math.round(chip.getBoundingClientRect().width) : 0,
        caixaDaSala: Math.round(sala.getBoundingClientRect().width),
        caixaDoTitulo: Math.round(forte.getBoundingClientRect().width),
        gapDaSala: getComputedStyle(sala).columnGap,
        fonte: getComputedStyle(forte).fontSize,
        escondido: Math.max(0, forte.scrollHeight - Math.ceil(forte.getBoundingClientRect().height)),
        larguras,
      };
    });
    console.log(`${w}x${h} grade=${JSON.stringify(m.grade)} chip=${m.chip} sala=${m.caixaDaSala} titulo=${m.caixaDoTitulo} gap=${m.gapDaSala} fonte=${m.fonte} escondido=${m.escondido}`);
    console.log(`    texto por fonte: ${JSON.stringify(m.larguras)}  -> linhas necessarias: ${JSON.stringify(Object.fromEntries(Object.entries(m.larguras).map(([px, larg]) => [px, Math.ceil(larg / m.caixaDoTitulo)])))}`);
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  opened.close();
}
