import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina, clicarAte } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createRoomEventHub } from '../../src/server/events.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

// O que este teste protege: o painel rele o servidor sozinho (SSE + poll) e o
// corpo do detalhe e substituido por markup inteiro. Se a releitura trocar os
// botoes por baixo do professor, um clique vira zero acao (o no sumiu) ou duas
// (o teste do arquivo vizinho clicava varias vezes para compensar). Aqui o
// aceite e: UM clique durante mudancas reais executa UMA vez, e o foco de quem
// esta no teclado sobrevive ao redesenho.

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('um clique durante a atualizacao ao vivo executa uma vez e o foco sobrevive ao redesenho', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  await repositories.rooms.createCycle({ id: 'panel-live-game', now: 60_000 });

  const hub = createRoomEventHub();
  const handler = createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
    eventHub: hub,
    adminPassword: 'painel-live-password',
    adminSecret: 'painel-live-secret-at-least-32-chars',
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  let browser;
  try {
    let cookie = '';
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(payload),
      });
      const setCookie = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
      const match = /arena_admin=([^;]+)/.exec(setCookie);
      if (match) cookie = `arena_admin=${match[1]}`;
      const body = await response.json();
      assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`);
      return body;
    };

    await post('admin_login', { password: 'painel-live-password' });
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Operação ao vivo', preset: 'personalizado', expected_players: 20 });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Cartaz da feira',
      modality: 'precisao',
      mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
      criteria: [{ criterion: 'objetivo', weight: 50 }, { criterion: 'contexto', weight: 50 }],
      duration_seconds: 600,
      speed_weight: 'none',
      reference_text: 'Cartaz A3 da feira, com data, local e contato.',
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });
    await post('arena_start_round', { room_id: room.id });

    browser = await abrirNavegador();
    const page = await abrirPagina(browser, { viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let pausas = 0;
    page.on('request', (request) => {
      if (request.url().includes('action=arena_pause_round')) pausas += 1;
    });

    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', 'painel-live-password');
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await page.waitForSelector('[data-arena-room-list] [data-room-id]');
    // Abrir o detalhe e preparacao, nao o aceite: aqui o clique pode se repetir.
    await clicarAte(
      page,
      `[data-room-id="${room.id}"] [data-action=detail]`,
      () => Boolean(document.querySelector('[data-action="pause-round"]')),
      { descricao: 'abrir o detalhe da sala com a missão em andamento' },
    );

    // A fonte das mudancas reais: alunos entrando, um a cada 180 ms. Cada
    // entrada muda a contagem de participantes e conectados, entao o detalhe
    // muda de verdade e o corpo e redesenhado.
    let aluno = 0;
    const entramAlunos = async (quantos) => {
      for (let i = 0; i < quantos; i += 1) {
        aluno += 1;
        await post('arena_join', { code: room.code, name: `Aluno ${aluno}` });
        await dormir(180);
      }
    };

    // 1) O redesenho vem das mudancas ao vivo (sem clique nenhum ainda): a
    //    marca no botao some quando o corpo e trocado.
    await page.evaluate(() => { document.querySelector('[data-action="pause-round"]').dataset.probe = 'v1'; });
    await entramAlunos(2);
    await dormir(1200);
    assert.equal(
      await page.evaluate(() => !document.querySelector('[data-probe]')),
      true,
      'o corpo do detalhe precisa ser redesenhado pelas mudancas ao vivo (sem isto o teste nao mede nada)',
    );

    // 2) UM clique durante a rajada: uma acao, um pedido.
    const rajada = entramAlunos(6);
    await dormir(300);
    const clicou = await page.evaluate(() => {
      const botao = document.querySelector('[data-action="pause-round"]');
      if (!botao) return false;
      botao.click();
      return true;
    });
    assert.equal(clicou, true, 'o botão de pausar estava na tela');
    await rajada;
    await dormir(1500);
    assert.equal(pausas, 1, `um clique deve virar exatamente uma ação; foram ${pausas}`);
    const pausada = await post('arena_room_detail', { room_id: room.id });
    const rodada = pausada.detail.rounds[0];
    assert.ok(Number.isFinite(Number(rodada.paused_at)), 'a missão ficou pausada com um clique só');

    // 3) Teclado: foco no controle sobrevive a tres redesenhos e o Enter age uma vez.
    await post('arena_resume_round', { room_id: room.id });
    await page.waitForSelector('[data-action="pause-round"]');
    await page.evaluate(() => document.querySelector('[data-action="pause-round"]').focus());
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.action), 'pause-round');
    await entramAlunos(3);
    await dormir(1200);
    const foco = await page.evaluate(() => ({
      action: document.activeElement?.dataset?.action ?? null,
      noCorpo: Boolean(document.activeElement?.closest('[data-arena-detail-body]')),
    }));
    assert.equal(foco.action, 'pause-round', 'o foco precisa continuar no mesmo controle depois dos redesenhos');
    assert.equal(foco.noCorpo, true, 'e continuar dentro do corpo do detalhe');

    const pausasAntesDoEnter = pausas;
    await page.keyboard.press('Enter');
    await dormir(1500);
    assert.equal(pausas - pausasAntesDoEnter, 1, 'Enter executa a ação uma vez, no controle que estava focado');

    // 4) Dobra aberta nao volta ao padrao por causa de uma mudanca real.
    await page.evaluate(() => { document.querySelector('[data-fold-key="participantes"] summary').click(); });
    assert.equal(await page.evaluate(() => document.querySelector('[data-fold-key="participantes"]').open), true);
    await page.evaluate(() => { document.querySelector('[data-fold-key="participantes"] summary').dataset.probe = 'dobra'; });
    await entramAlunos(1);
    await dormir(1500);
    const dobra = await page.evaluate(() => ({
      aberta: document.querySelector('[data-fold-key="participantes"]')?.open ?? null,
      redesenhou: !document.querySelector('[data-probe="dobra"]'),
    }));
    assert.equal(dobra.redesenhou, true, 'a mudança real precisa ter redesenhado o corpo');
    assert.equal(dobra.aberta, true, 'a dobra que o professor abriu continua aberta');

    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});
