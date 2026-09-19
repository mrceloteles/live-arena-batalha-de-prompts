import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina, esperarPor } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

// O relatório é aberto em planilha, e planilha trata um campo que começa com
// `=`, `+`, `-` ou `@` como FÓRMULA — as aspas do CSV não impedem isso. O nome
// do aluno e o prompt são texto que o próprio aluno escreve, então o arquivo
// que o professor baixava era executável na máquina de quem abrisse. O aceite
// aqui é o arquivo de verdade: o texto do Blob que o clique em "Exportar CSV"
// produz, na tela real, com um aluno chamado `=1+1`.

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('o CSV do relatório neutraliza nome e prompt que começam com fórmula', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  await repositories.rooms.createCycle({ id: 'csv-formula-game', now: Date.now() / 1000 });

  const handler = createApplication({
    repositories,
    judge: createFakeJudge(),
    adminPassword: 'csv-formula-password',
    adminSecret: 'csv-formula-secret-at-least-32-chars',
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

    await post('admin_login', { password: 'csv-formula-password' });
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Turma do CSV', expected_players: 5 });
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
    const aberta = (await post('arena_room_detail', { room_id: room.id })).detail.rounds
      .find((round) => round.status === 'open');

    // O nome e o prompt são o vetor: os dois são texto do aluno.
    const aluno = await post('arena_join', { code: room.pin || room.code, name: '=1+1' });
    await post('arena_submit', {
      participant_id: aluno.participant.id,
      token: aluno.token,
      round_id: aberta.id,
      prompt: '=HYPERLINK("http://exemplo.test","clique")',
    });
    await post('arena_end_round', { room_id: room.id });

    browser = await abrirNavegador();
    const page = await abrirPagina(browser, { viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setCookie({ name: 'arena_admin', value: /arena_admin=(.+)/.exec(cookie)[1], domain: '127.0.0.1', path: '/' });
    await page.goto(`${base}/report.php`);
    // O relatório só é exportável depois de carregar as métricas; esperar pelos
    // indicadores do resumo evita exportar a tela ainda em branco.
    await esperarPor(page, () => Boolean(document.querySelector('[data-metric-cards] .metric-card')), {
      descricao: 'o resumo do relatório carregar',
    });

    // O clique é o do professor. O Blob é o arquivo que ele baixaria.
    const capturarCsv = () => page.evaluate(async () => {
      const capturados = [];
      const original = URL.createObjectURL;
      URL.createObjectURL = (blob) => {
        capturados.push(blob);
        return original.call(URL, blob);
      };
      try {
        document.querySelector('[data-export-report]')?.click();
      } finally {
        URL.createObjectURL = original;
      }
      return capturados.length ? capturados[0].text() : null;
    });

    let csv = null;
    const prazo = Date.now() + ESPERA.padrao;
    while (Date.now() < prazo) {
      csv = await capturarCsv();
      if (csv?.includes('Ranking dos participantes')) break;
      await dormir(100);
    }
    assert.ok(csv, 'o clique em Exportar CSV produziu um arquivo');
    assert.ok(csv.includes('Ranking dos participantes'), 'o CSV traz as seções do relatório');

    // Nome do aluno: sai como texto, nunca como texto executável.
    assert.ok(csv.includes(`"'=1+1"`), `o nome do aluno sai neutralizado — recebido:\n${csv}`);
    assert.ok(!csv.includes(`"=1+1"`), 'o nome do aluno não sai cru');
    // Prompt do aluno: mesma regra, no campo de resposta.
    assert.ok(!csv.includes('"=HYPERLINK'), 'o prompt do aluno não sai cru');
    assert.ok(csv.includes(`"'=HYPERLINK`), 'o prompt do aluno sai neutralizado');
    // E o dado comum continua legível, sem apostrofo nenhum na frente.
    assert.ok(!csv.includes(`"'Cartaz`), 'título de seção comum não ganha prefixo');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});
