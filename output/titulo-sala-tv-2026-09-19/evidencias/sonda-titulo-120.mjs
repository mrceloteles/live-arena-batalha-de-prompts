// Pior caso exato do produto: titulo de 120 caracteres (o limite da API) na
// parede. Confere o que importa: o nome aparece INTEIRO, em no maximo duas
// linhas, a barra nao passa de 80 px e a linha 1 da grade continua com marca,
// sala e botao lado a lado.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { abrirNavegador, abrirPagina, esperarPor } from '../../test/support/navegador.mjs';

const TITULO = 'Aula 003 — Turma B do período noturno, oficina de prompts para o cartaz da feira de tecnologia, com três rodadas de dez minutos e revisão'.slice(0, 120);
console.log('titulo de', TITULO.length, 'caracteres (limite da API: 120)');

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

  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [640, 900]]) {
    await page.setViewport({ width: w, height: h });
    await page.goto(`${base}/tv-preview.php?room=${room.id}`);
    await esperarPor(page, () => { const s = document.querySelector('[data-tv-room-title]'); return Boolean(s && s.textContent.trim()); }, { descricao: `o titulo em ${w}x${h}` });
    const m = await page.evaluate((esperado) => {
      const barra = document.querySelector('.arena-tv-topbar');
      const forte = document.querySelector('[data-tv-room-title]');
      const cb = barra.getBoundingClientRect();
      const cf = forte.getBoundingClientRect();
      const linha = Number.parseFloat(getComputedStyle(forte).lineHeight);
      const filhos = [...barra.children].map((n) => ({ classe: String(n.className).split(' ')[0], caixa: n.getBoundingClientRect(), oculto: n.hidden }));
      const faixas = [];
      for (const f of filhos.filter((x) => !x.oculto)) {
        const topo = Math.round(f.caixa.top - cb.top);
        const faixa = faixas.find((x) => Math.abs(x.topo - topo) < 20);
        if (faixa) faixa.itens.push(f.classe);
        else faixas.push({ topo, itens: [f.classe] });
      }
      return {
        alturaDaBarra: Math.round(cb.height),
        fonte: getComputedStyle(forte).fontSize,
        linhas: Math.round(cf.height / linha),
        escondidoVertical: Math.max(0, forte.scrollHeight - Math.ceil(cf.height)),
        escondidoHorizontal: Math.max(0, forte.scrollWidth - Math.ceil(cf.width)),
        textoIgual: forte.textContent.trim() === esperado,
        faixas: faixas.map((f) => f.itens.sort().join('+')),
        rolagemHorizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    }, String(room.title));
    const inteiro = m.escondidoVertical === 0 && m.escondidoHorizontal === 0;
    console.log(`${w}x${h} barra=${m.alturaDaBarra}px fonte=${m.fonte} ${m.linhas} linha(s) | inteiro=${inteiro} (escondido v${m.escondidoVertical} h${m.escondidoHorizontal}) | textoConfere=${m.textoIgual} | faixas=${JSON.stringify(m.faixas)} rolagem=${m.rolagemHorizontal}`);
    if (!inteiro) console.log(`    ^^ AINDA ESCONDE TEXTO em ${w}x${h}`);
    if (!m.textoIgual) console.log(`    ^^ TEXTO DIFERENTE do gravado em ${w}x${h}`);
    if (m.linhas > 2) console.log(`    ^^ MAIS DE DUAS LINHAS em ${w}x${h}`);
    if (m.alturaDaBarra > 80 && w > 900) console.log(`    ^^ BARRA ACIMA DE 80px em ${w}x${h}`);
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  opened.close();
}
