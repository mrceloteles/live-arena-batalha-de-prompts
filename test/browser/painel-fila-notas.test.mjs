import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina, clicarAte, esperarPor } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { JudgeUnavailableError } from '../../src/judge/failure.mjs';
import { createEvaluationParking } from '../../src/judge/parking.mjs';
import { createApplication } from '../../src/server/start.mjs';

// O aceite de tela do bloco "quem ainda espera nota".
//
// O defeito medido: com o provedor fora, o painel mostrava "1 envio · 0
// avaliados" e nada mais. O professor não tinha como saber se a nota vinha
// sozinha, se dependia de o aluno reenviar, ou se a aula tinha acabado e ninguém
// mais iria avaliar aquilo — a fila existia, mas só para quem lê o `/readyz`.
//
// Aqui o provedor é de verdade (o `fetch` do adaptador falha) e o painel é o de
// verdade: o bloco tem de aparecer com NOME, missão, tempo de espera e motivo, e
// tem de SUMIR sozinho quando a nota chega — sem ninguém recarregar a página.
const SENHA = 'browser-fila-password';
const SEGREDO = 'browser-fila-secret-at-least-32-characters';

test('browser: o painel mostra quem espera nota, e o bloco some quando a nota chega', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);

  // O provedor começa FORA e volta quando o caso mandar. Cada avaliação gasta
  // uma chamada; a espera do pátio (3 s) é o que mantém a pendência viva o
  // bastante para o painel ser lido antes de a nota chegar.
  let provedorFora = true;
  const parking = createEvaluationParking({ baseDelayMs: 3_000, maxDelayMs: 3_000, maxAttempts: 10 });
  const server = createServer(createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => {
      if (provedorFora) throw new JudgeUnavailableError(undefined, { reason: 'gemini_http_503', status: 503 });
      return { percent: 83, breakdown: { objetivo: 12, contexto: 11 }, feedback: 'Nota do provedor.' };
    },
    adminPassword: SENHA,
    adminSecret: SEGREDO,
    parking,
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  let browser;
  try {
    let cookie = '';
    const post = async (action, payload = {}, { comCookie = true } = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(comCookie && cookie ? { cookie } : {}) },
        body: JSON.stringify(payload),
      });
      const setCookie = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
      const match = /arena_admin=([^;]+)/.exec(setCookie);
      if (match) cookie = `arena_admin=${match[1]}`;
      const body = await response.json();
      assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`);
      return body;
    };

    await post('admin_login', { password: SENHA });
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Turma da fila', preset: 'personalizado', expected_players: 20 });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Cartaz',
      modality: 'precisao',
      mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
      criteria: [{ criterion: 'objetivo', weight: 60 }, { criterion: 'contexto', weight: 40 }],
      duration_seconds: 600,
      speed_weight: 'none',
      reference_text: 'Cartaz A3 da feira, com data, local e contato.',
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });
    await post('arena_start_round', { room_id: room.id });

    // A aluna envia e o provedor não entrega: a submissão fica SEM nota, no
    // pátio. É essa pendência que o painel tem de mostrar.
    const aluna = await post('arena_join', { code: room.pin || room.code, name: 'Ana' }, { comCookie: false });
    const enviado = await post('arena_submit', {
      participant_id: aluna.participant.id,
      token: aluna.token,
      round_id: (await post('arena_room_detail', { room_id: room.id })).detail.rounds[0].id,
      prompt: 'Crie um cartaz A3 com data, local e contato para a feira.',
      attempt: 1,
    }, { comCookie: false });
    assert.equal(enviado.parked, true, 'a avaliação ficou no pátio: é essa a pendência do painel');
    assert.equal(enviado.reason, 'gemini_http_503');
    assert.equal((await repositories.arena.scores.listByRound((await post('arena_room_detail', { room_id: room.id })).detail.rounds[0].id)).length, 0);

    browser = await abrirNavegador();
    const page = await abrirPagina(browser, { viewport: { width: 1440, height: 900 } });
    const erros = [];
    page.on('pageerror', (erro) => erros.push(erro.message));

    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', SENHA);
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await page.waitForSelector('[data-arena-room-list] [data-room-id]');
    // O clique espera o bloco: abrir o detalhe e ver a pendência são o mesmo passo.
    await clicarAte(
      page,
      `[data-room-id="${room.id}"] [data-action=detail]`,
      () => Boolean(document.querySelector('[data-arena-waiting]')),
      { descricao: 'abrir o detalhe da sala com a fila de avaliação visível' },
    );

    const bloco = await page.$eval('[data-arena-waiting]', (no) => no.textContent.replace(/\s+/g, ' ').trim());
    assert.match(bloco, /1 envio ainda sem nota/, `o bloco anuncia a pendência (leu: "${bloco}")`);
    assert.match(bloco, /Ana/, 'com o nome da aluna');
    assert.match(bloco, /Missão 1/, 'e a missão de que se trata');
    assert.match(bloco, /há \d+ s/, 'e há quanto tempo ela espera');
    assert.match(bloco, /na fila/, 'e que a nota está a caminho');
    assert.match(bloco, /nova tentativa em \d+ s/, 'com o prazo da próxima tentativa');
    assert.match(bloco, /erro do provedor/, `o motivo em português (leu: "${bloco}")`);
    assert.doesNotMatch(bloco, /gemini_http_503/, 'o vocabulário do provedor não vaza para a tela');

    // O professor não faz nada: o provedor volta, o pátio reprocessa e a nota
    // chega. O bloco tem de sumir SOZINHO, na mesma página.
    provedorFora = false;
    await esperarPor(page, () => !document.querySelector('[data-arena-waiting]'), {
      descricao: 'o bloco de espera sair da tela quando a nota chega',
      timeout: ESPERA.padrao,
    });
    // A nota avaliada aparece na LINHA DE ESTATÍSTICAS da missão, dentro do
    // roteiro ("1 envio · 1 avaliado"): com um só, o plural do texto é singular,
    // e a asserção é pela contagem, não pela flexão.
    await esperarPor(
      page,
      () => /\b1\s+avaliado/.test(document.querySelector('[data-arena-detail-body]')?.textContent || ''),
      { descricao: 'a missão aparecer com a nota avaliada' },
    );
    assert.equal(erros.length, 0, `a página não pode acumular erro de script: ${erros.join(' | ')}`);
  } finally {
    await browser?.close();
    parking.stop();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});
