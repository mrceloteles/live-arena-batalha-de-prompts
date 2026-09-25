// Sonda da home: mede a composição dos três papéis nas larguras que importam.
// Boota o app numa porta efêmera (como os testes de navegador) para não
// depender do servidor de preview e não escrever no banco de verdade.
// Com CAPTURAR=1 grava também os prints em tmp/qa/portal/.
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { abrirNavegador } from '../../test/support/navegador.mjs';

const LARGURAS = [1440, 1200, 1024, 901, 900, 768, 640, 390];
const CAPTURAS = new URL('portal/', import.meta.url);
if (process.env.CAPTURAR === '1') mkdirSync(CAPTURAS, { recursive: true });

const opened = openDatabase(':memory:');
await opened.migrate();
const server = createServer(createApplication({
  repositories: createRepositories(opened.database),
  judge: createFakeJudge(),
  adminPassword: 'sonda-portal',
  adminSecret: 'sonda-portal-secret-at-least-32-characters',
}));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await abrirNavegador();
const page = await browser.newPage();

const medir = () => page.evaluate(() => {
  const cartao = document.querySelector('.portal-hero').getBoundingClientRect();
  const papéis = [...document.querySelectorAll('.portal-role')].map((item) => {
    const b = item.getBoundingClientRect();
    const acao = item.querySelector('.portal-role-action').getBoundingClientRect();
    const titulo = item.querySelector('.portal-role-title');
    return {
      x: Math.round(b.x), y: Math.round(b.y), l: Math.round(b.width), a: Math.round(b.height),
      acaoH: Math.round(acao.height),
      cortado: titulo.scrollWidth > titulo.clientWidth + 1 || titulo.scrollHeight > titulo.clientHeight + 1,
      vazio: getComputedStyle(item).backgroundColor === 'rgba(0, 0, 0, 0)',
    };
  });
  return {
    cartao: { x: Math.round(cartao.x), l: Math.round(cartao.width), a: Math.round(cartao.height) },
    papéis,
    linhas: new Set(papéis.map((p) => p.y)).size,
    rolagemLateral: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rolagemVertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    colunas: getComputedStyle(document.querySelector('.portal-roles')).gridTemplateColumns.split(' ').length,
  };
});

console.log('largura | cartão (x/l/a) | colunas | linhas | ação (alturas) | corte | rol. lateral | altura da página');
for (const largura of LARGURAS) {
  await page.setViewport({ width: largura, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 250));
  const m = await medir();
  if (process.env.CAPTURAR === '1') {
    await page.screenshot({ path: fileURLToPath(new URL(`portal-${largura}x900.png`, CAPTURAS)), fullPage: true });
  }
  const alturas = m.papéis.map((p) => p.acaoH).join('/');
  const cortes = m.papéis.filter((p) => p.cortado).length;
  const vazios = m.papéis.filter((p) => p.vazio).length;
  console.log(
    `${String(largura).padStart(4)} | ${String(m.cartao.x).padStart(4)}/${String(m.cartao.l).padStart(4)}/${String(m.cartao.a).padStart(4)} | ` +
      `${m.colunas} | ${m.linhas} | ${alturas} | ${cortes}${vazios ? ` (sem fundo: ${vazios})` : ''} | ${m.rolagemLateral} | ${m.rolagemVertical}`,
  );
}

await browser.close();
server.closeAllConnections();
await new Promise((resolve) => server.close(resolve));
opened.close();
