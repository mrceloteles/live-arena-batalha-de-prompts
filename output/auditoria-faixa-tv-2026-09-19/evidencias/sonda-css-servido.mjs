// O navegador mediu o CSS antigo com o arquivo mutado em disco. Aqui a mesma
// pagina busca o CSS e le a cascata, para separar cache de navegador de erro de
// medicao: sem isso, a evidencia das mutacoes nao vale nada.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { abrirNavegador, abrirPagina, esperarPor } from '../../test/support/navegador.mjs';

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
  const { room } = await post('arena_create_room', { title: 'Sala do css', preset: 'personalizado', expected_players: 2 });

  const r = await fetch(`${base}/public/assets/css/design.css?v=56`);
  const texto = await r.text();
  console.log('pelo node:', r.status, '| tem "padding: 1px 2px":', texto.includes('padding: 1px 2px'));

  browser = await abrirNavegador();
  const page = await abrirPagina(browser, { viewport: { width: 1280, height: 720 }, cookie: { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' } });
  await page.goto(`${base}/tv-preview.php?room=${room.id}`);
  await esperarPor(page, () => Boolean(document.querySelector('[data-tv-fullscreen]')), { descricao: 'o botao de tela cheia' });
  console.log('no navegador:', JSON.stringify(await page.evaluate(async () => {
    const t = await (await fetch('/public/assets/css/design.css?v=56')).text();
    const b = document.querySelector('[data-tv-fullscreen]');
    const s = getComputedStyle(b);
    const regras = [];
    for (const folha of document.styleSheets) {
      let lista; try { lista = [...folha.cssRules]; } catch { continue; }
      for (const regra of lista) {
        if (regra.selectorText === '.arena-tv-fullscreen-btn') regras.push(`${folha.href?.split('/').pop() || '<style>'} -> ${regra.style.padding}`);
      }
    }
    return {
      textoBaixadoTem1px: t.includes('padding: 1px 2px'),
      textoBaixadoTem7px: t.includes('padding: 7px 16px'),
      paddingComputado: s.padding,
      caixa: `${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`,
      regras,
    };
  }), null, 1));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  opened.close();
}
