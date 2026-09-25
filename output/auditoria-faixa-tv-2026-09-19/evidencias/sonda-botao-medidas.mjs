// O tamanho do botao de tela cheia e a unica coisa que a assercao de toque mede.
// Aqui ele e medido cru e com um estilo minusculo injetado, para provar que a
// assercao consegue falhar (nao e uma linha sempre-verdadeira).
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
  const { room } = await post('arena_create_room', { title: 'Sala do botao', preset: 'personalizado', expected_players: 2 });
  browser = await abrirNavegador();
  const page = await abrirPagina(browser, { viewport: { width: 1280, height: 720 }, cookie: { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' } });
  await page.goto(`${base}/tv-preview.php?room=${room.id}`);
  await esperarPor(page, () => Boolean(document.querySelector('[data-tv-fullscreen]')), { descricao: 'o botao de tela cheia' });
  const ler = () => page.evaluate(() => {
    const b = document.querySelector('[data-tv-fullscreen]');
    const s = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    const vindas = [];
    for (const folha of document.styleSheets) {
      let lista; try { lista = [...folha.cssRules]; } catch { continue; }
      for (const regra of lista) {
        if (!regra.selectorText || !regra.style || !/fullscreen/.test(regra.selectorText)) continue;
        let casa = false; try { casa = b.matches(regra.selectorText); } catch { casa = false; }
        vindas.push(`${folha.href?.split('/').pop()} ${regra.selectorText} casa=${casa} padding=${regra.style.padding || '-'} fonte=${regra.style.fontSize || '-'} minW=${regra.style.minWidth || '-'}`);
      }
    }
    return { caixa: `${Math.round(r.width)}x${Math.round(r.height)}`, padding: s.padding, fonte: s.fontSize, minWidth: s.minWidth, vindas };
  });
  console.log('natural:', JSON.stringify(await ler(), null, 1));
  await page.addStyleTag({ content: '.arena-tv-fullscreen-btn { padding: 1px 2px !important; font-size: 1px !important; }' });
  console.log('minusculo:', JSON.stringify(await ler()));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  opened.close();
}
