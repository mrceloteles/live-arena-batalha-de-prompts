// A barra de controles da previa da TV (modos Espera/Rodada/Resultado/Fim,
// Atualizar, Abrir a TV de verdade) e a unica "faixa superior" da projecao que
// carrega controles de verdade. Aqui ela e medida linha por linha, nas cinco
// viewports do plano. O clique vai por `evaluate` porque a previa se redesenha
// a cada leitura e um clique por ElementHandle morre com o no solto.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { abrirNavegador, abrirPagina, clicarAte, esperarPor } from '../../test/support/navegador.mjs';

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
  for (const nome of ['Ana', 'Bia']) {
    const r = await fetch(`${base}/api.php?action=arena_join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: room.code, name: nome }) });
    assert.equal(r.status, 200, `${nome}: ${JSON.stringify(await r.json())}`);
  }
  await post('arena_start_round', { room_id: room.id });

  browser = await abrirNavegador();
  const page = await abrirPagina(browser, { cookie: { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' } });

  const ler = () => page.evaluate(() => {
    const lerLinhas = (raiz, alvos) => {
      if (!raiz) return null;
      const rb = raiz.getBoundingClientRect();
      const no = [...raiz.querySelectorAll(alvos)];
      const filhos = no.map((n) => ({ texto: (n.textContent || '').trim().slice(0, 16), caixa: n.getBoundingClientRect(), oculto: n.hidden || getComputedStyle(n).display === 'none' }));
      const faixas = [];
      for (const f of filhos.filter((x) => !x.oculto)) {
        const topo = Math.round(f.caixa.top - rb.top);
        const faixa = faixas.find((x) => Math.abs(x.topo - topo) < 12);
        if (faixa) faixa.itens.push(f.texto);
        else faixas.push({ topo, itens: [f.texto] });
      }
      let estoura = 0;
      for (const f of filhos) estoura = Math.max(estoura, Math.round(f.caixa.right - rb.right), Math.round(rb.left - f.caixa.left));
      const cortado = no.some((n) => n.scrollWidth > Math.ceil(n.getBoundingClientRect().width) + 1);
      return { altura: Math.round(rb.height), faixas: faixas.map((f) => `${f.topo}:${f.itens.join('|')}`), estoura, cortado, total: no.length, ocultos: filhos.filter((x) => x.oculto).length };
    };
    const barra = document.querySelector('[data-tv-preview-bar]');
    return {
      controles: lerLinhas(barra, 'button, .arena-tv-preview-sample'),
      topbar: lerLinhas(document.querySelector('.arena-tv-topbar'), ':scope > *'),
      rolagemHorizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      palco: Math.round(document.querySelector('[data-tv-stage]').getBoundingClientRect().top),
    };
  });

  for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [390, 844]]) {
    await page.setViewport({ width: w, height: h });
    await page.goto(`${base}/tv-preview.php?room=${room.id}`);
    await esperarPor(page, () => Boolean(document.querySelector('[data-tv-preview-bar] button')), { descricao: `os controles da previa em ${w}x${h}` });
    for (const modo of ['lobby', 'round', 'results', 'final']) {
      await clicarAte(page, `[data-tv-preview-mode="${modo}"]`,
        (m) => document.querySelector(`[data-tv-preview-mode="${m}"]`)?.classList.contains('is-current'),
        { descricao: `o modo ${modo} em ${w}x${h}`, args: modo, timeout: 20000 });
      const m = await ler();
      console.log(`${w}x${h} [${modo}] rolagem=${m.rolagemHorizontal} palco=${m.palco} | topbar ${m.topbar.altura}px estoura ${m.topbar.estoura} ${JSON.stringify(m.topbar.faixas)}`);
      console.log(`    controles: ${m.total} no, ${m.ocultos} ocultos, estoura ${m.controles.estoura}, cortado ${m.controles.cortado} | ${JSON.stringify(m.controles.faixas)}`);
      if (m.controles.faixas.length > 1) console.log(`    ^^ CONTROLES EM ${m.controles.faixas.length} LINHAS`);
      if (m.controles.ocultos) console.log(`    ^^ ${m.controles.ocultos} CONTROLE(S) ESCONDIDO(S)`);
      if (m.controles.estoura > 0) console.log(`    ^^ CONTROLE FORA DA BARRA: ${m.controles.estoura}px`);
      if (m.rolagemHorizontal) console.log(`    ^^ ROLAGEM HORIZONTAL: ${m.rolagemHorizontal}px`);
    }
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  opened.close();
}
