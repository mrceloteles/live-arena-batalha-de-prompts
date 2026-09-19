import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina, carregar, esperarPor } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { JudgeUnavailableError } from '../../src/judge/failure.mjs';
import { createEvaluationParking } from '../../src/judge/parking.mjs';
import { createApplication } from '../../src/server/start.mjs';

// O defeito medido: a avaliacao externa tem 12 s de timeout e uma repeticao, e o
// cliente desistia em 12 s. O aluno lia "nao foi possivel confirmar o envio"
// enquanto o servidor SEGUIA avaliando — e dependia de clicar de novo para ver a
// nota que ja estava sendo calculada.
//
// Aqui a avaliacao demora de proposito (600 ms) e o servidor responde
// "pendente" bem antes (150 ms): a tela tem de dizer a verdade (recebido, ainda
// avaliando) e mostrar a nota sozinha, pela consulta de estado que ela ja faz —
// sem segundo clique do aluno.
const SENHA = 'browser-test-password';
const SEGREDO = 'browser-test-secret-at-least-32-characters';
const AVALIACAO_MS = 600;
const ESPERA_SERVIDOR_MS = 150;
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A nota do aluno e um count-up de 1,2 s: o painel fica visivel ANTES de o
 * numero fechar. Esperar por `/83/` no texto NAO e esperar pelo fim — e esperar
 * por um PEDACO do numero. Medido (tmp/qa/quadros-83.mjs): os quadros passam por
 * "5,83 PTS" (3 ms de animacao) e "58,83 PTS" (meio dela), que contem "83", e o
 * quadro seguinte e "9,09 PTS". Foi assim que esta assercao reprovou com a tela
 * mostrando "6,17 PTS": um quadro inicial de uma animacao que ia ate 83.
 *
 * O contrato e o `dataset.target` — o texto final que a propria pagina declara,
 * e o quadro em que `textContent` casa com ele e o fim da animacao. O teste da
 * previa (`arena-ui.test.mjs`) ja espera por este mesmo par; era este cuidado
 * que faltava aqui.
 */
async function notaAssentada(pagina) {
  await esperarPor(pagina, () => {
    const el = document.querySelector('[data-arena-result-percent]');
    return Boolean(el && el.dataset.target) && el.textContent === el.dataset.target;
  }, { descricao: 'a nota terminar de aparecer (animacao assentada)', timeout: ESPERA.padrao });
  return pagina.$eval('[data-arena-result-percent]', (no) => no.textContent.trim());
}

test('browser: o envio que demora responde pendente, e a nota chega sem novo clique', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  let avaliacoes = 0;
  const server = createServer(createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => {
      avaliacoes += 1;
      await dormir(AVALIACAO_MS);
      return { percent: 83, breakdown: { objetivo: 12 }, feedback: 'Bom prompt, com atraso.' };
    },
    adminPassword: SENHA,
    adminSecret: SEGREDO,
    submitWaitMs: ESPERA_SERVIDOR_MS,
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, {
      method: 'POST', body: JSON.stringify({ password: SENHA }),
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`);
      return body;
    };

    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Turma do envio pendente', expected_players: 8 });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Missão 1', modality: 'precisao', mission: 'Crie um cartaz para a feira de ciências.',
      context: 'Turma do ensino médio.',
      criteria: [{ criterion: 'objetivo', weight: 60 }, { criterion: 'contexto', weight: 40 }],
      reference_text: 'Cartaz A3 com data, local e contato.',
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });
    await post('arena_start_round', { room_id: room.id });

    browser = await abrirNavegador();
    const page = await abrirPagina(browser, { viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } });
    const erros = [];
    page.on('pageerror', (erro) => erros.push(erro.message));

    await carregar(page, `${base}/play?pin=${room.code}`);
    await page.type('[data-arena-join-form] [name=name]', 'Aluna 1');
    await page.click('[data-arena-join-form] button[type=submit]');
    await page.waitForSelector('[data-arena-screen="lobby"].is-active');
    await esperarPor(page, () => Boolean(document.querySelector('[data-arena-prompt-form]')),
      { descricao: 'o campo de resposta aparecer na missão', timeout: ESPERA.padrao });

    // Gravacao dos quadros da nota + o relogio da pagina adiantado (ver a
    // assercao dos quadros negativos mais abaixo).
    await page.evaluate(() => {
      const agora = performance.now.bind(performance);
      performance.now = () => agora() + 50;
      const el = document.querySelector('[data-arena-result-percent]');
      window.__quadrosDaNota = [];
      new MutationObserver(() => window.__quadrosDaNota.push(el.textContent))
        .observe(el, { childList: true, characterData: true, subtree: true });
    });
    await page.type('[data-arena-prompt-form] textarea', 'Crie um cartaz A3 com data, local e contato para a feira.');
    await page.click('[data-arena-send]');

    // A tela NAO pode anunciar falha: o envio foi aceito e a avaliação continua.
    const mensagem = async () => (await page.$eval('[data-arena-mission-message]', (no) => no.textContent.replace(/\s+/g, ' ').trim()));
    await esperarPor(page, () => /conferindo o envio|continua e a nota|avaliação continua/i.test(
      document.querySelector('[data-arena-mission-message]')?.textContent || '',
    ), { descricao: 'a tela assumir que o envio foi aceito e a nota ainda vem', timeout: ESPERA.curta });
    const aviso = await mensagem();
    assert.equal(/não foi possível confirmar/i.test(aviso), false, `a tela nao pode anunciar falha definitiva (leu: "${aviso}")`);

    // A nota aparece SOZINHA: ninguém clica de novo — e aparece RÁPIDO, porque o
    // servidor avisa a sala quando termina. Sem esse aviso a tela só veria a
    // nota no próximo ciclo de consulta (até 8 s, já que com SSE recente o poll
    // é aliviado de propósito): o teto aqui é o que separa "avisou" de "esperou
    // a sorte do relógio".
    const esperandoNota = Date.now();
    await esperarPor(page, () => {
      const painel = document.querySelector('[data-arena-result]');
      return Boolean(painel) && !painel.hidden;
    }, { descricao: 'a nota chegar pela consulta de estado, sem novo envio', timeout: 4000 });
    console.log(`[espera] ${((Date.now() - esperandoNota) / 1000).toFixed(1)}s (teto 4s) — a nota aparecer sozinha`);
    const nota = await notaAssentada(page);
    assert.equal(nota, '83 PTS', `a nota do provedor chegou na tela (leu: "${nota}")`);
    // Nenhum quadro da subida pode mostrar nota negativa: o primeiro quadro da
    // animacao recebe o instante em que ele COMECOU, que pode ser anterior ao
    // `performance.now()` do disparo (medido: "-0,94 PTS" em 2 de 3 execucoes).
    // O relogio adiantado em 50 ms fixa essa defasagem, para o caso ser
    // comprovavel em vez de sorteado.
    const quadros = await page.evaluate(() => window.__quadrosDaNota || []);
    const negativos = quadros.filter((texto) => Number(texto.replace('PTS', '').replace(',', '.')) < 0);
    assert.deepEqual(negativos, [], `nenhum quadro mostra nota negativa (leu: ${JSON.stringify(negativos)})`);
    assert.equal(quadros[quadros.length - 1], '83 PTS', 'a animacao termina no valor do provedor');
    assert.equal(avaliacoes, 1, 'uma avaliacao so, mesmo com a resposta pendente no meio');
    assert.deepEqual(erros, [], 'sem erro de script na tela do aluno');

    // E a tela volta ao estado de "já respondi": o texto enviado continua
    // visível para conferência e a única tentativa não fica reaberta para envio.
    const campo = await page.$eval('[data-arena-prompt-form] textarea', (no) => no.value);
    assert.match(campo, /cartaz A3/i, 'o texto enviado continua visível');
    const enviar = await page.$eval('[data-arena-send]', (no) => no.disabled);
    assert.equal(enviar, true, 'a tentativa ja usada nao fica reaberta');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

// O outro lado da mesma promessa: quando o JUIZ está fora, a resposta do aluno
// fica GUARDADA (não vira nota heurística nem erro) e a nota chega sozinha
// quando o provedor volta.
//
// O que se prende aqui é o que o aluno lê: dizer "avaliado!" quando a nota não
// existe é a mentira que a heurística de consolo escondia — quem recebia uma
// nota heurística não tinha como saber que ninguém avaliou o prompt dela.
test('browser: com o juiz fora, a resposta fica guardada e a nota chega sozinha quando ele volta', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  let avaliacoes = 0;
  // A espera do pátio é LONGA de propósito: o que o caso precisa ver é o estado
  // intermediário na tela ("guardada") antes de a nota chegar sozinha. Com a
  // espera curta a nota apareceria antes de a asserção olhar, e o teste mediria
  // a velocidade da máquina em vez do comportamento.
  const parking = createEvaluationParking({ baseDelayMs: 2500, maxDelayMs: 2500, maxAttempts: 3 });
  const server = createServer(createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => {
      avaliacoes += 1;
      if (avaliacoes === 1) {
        // A falha como o adaptador a entrega: indisponibilidade do provedor.
        throw new JudgeUnavailableError(undefined, { reason: 'gemini_http_503', status: 503 });
      }
      return { percent: 83, breakdown: { objetivo: 12 }, feedback: 'Bom prompt, com atraso.' };
    },
    adminPassword: SENHA,
    adminSecret: SEGREDO,
    submitWaitMs: ESPERA_SERVIDOR_MS,
    parking,
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, {
      method: 'POST', body: JSON.stringify({ password: SENHA }),
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`);
      return body;
    };

    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Turma do juiz fora', expected_players: 8 });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Missão 1', modality: 'precisao', mission: 'Crie um cartaz para a feira de ciências.',
      context: 'Turma do ensino médio.',
      criteria: [{ criterion: 'objetivo', weight: 60 }, { criterion: 'contexto', weight: 40 }],
      reference_text: 'Cartaz A3 com data, local e contato.',
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });
    await post('arena_start_round', { room_id: room.id });

    browser = await abrirNavegador();
    const page = await abrirPagina(browser, { viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } });
    const erros = [];
    page.on('pageerror', (erro) => erros.push(erro.message));

    await carregar(page, `${base}/play?pin=${room.code}`);
    await page.type('[data-arena-join-form] [name=name]', 'Aluna 1');
    await page.click('[data-arena-join-form] button[type=submit]');
    await page.waitForSelector('[data-arena-screen="lobby"].is-active');
    await esperarPor(page, () => Boolean(document.querySelector('[data-arena-prompt-form]')),
      { descricao: 'o campo de resposta aparecer na missão', timeout: ESPERA.padrao });

    await page.type('[data-arena-prompt-form] textarea', 'Crie um cartaz A3 com data, local e contato para a feira.');
    await page.click('[data-arena-send]');

    // A tela diz que guardou — e NÃO diz que avaliou.
    const mensagem = async () => (await page.$eval('[data-arena-mission-message]', (no) => no.textContent.replace(/\s+/g, ' ').trim()));
    await esperarPor(page, () => /guardada/i.test(document.querySelector('[data-arena-mission-message]')?.textContent || ''),
      { descricao: 'a tela dizer que a resposta ficou guardada', timeout: ESPERA.curta });
    const aviso = await mensagem();
    assert.match(aviso, /juiz esta indisponivel/i, `a tela diz por que ainda não há nota (leu: "${aviso}")`);
    assert.equal(/avaliado!/i.test(aviso), false, 'e nao anuncia avaliacao que nao aconteceu');
    assert.equal(avaliacoes, 1, 'uma tentativa no envio: nenhuma repeticao do aluno foi necessaria');

    // A nota chega SOZINHA: ninguém clica de novo — o pátio tentou outra vez e o
    // servidor avisou a sala (o teto aqui é a espera do pátio mais a consulta,
    // não a próxima batida do relógio).
    await esperarPor(page, () => {
      const painel = document.querySelector('[data-arena-result]');
      return Boolean(painel) && !painel.hidden;
    }, { descricao: 'a nota chegar sozinha depois do reprocessamento', timeout: 8000 });
    const nota = await notaAssentada(page);
    assert.equal(nota, '83 PTS', `a tela mostra a nota do provedor (leu: "${nota}")`);
    assert.equal(avaliacoes, 2, 'exatamente uma nova tentativa, no patio');

    // No banco: UMA nota, a do reprocessamento. Nem heurística, nem nota dupla.
    const detalhe = await post('arena_room_detail', { room_id: room.id });
    const roundId = detalhe.detail.rounds[0].id;
    const scores = await repositories.arena.scores.listByRound(roundId);
    assert.equal(scores.length, 1, 'uma nota, gravada uma vez');
    assert.equal(Number(scores[0].percent), 83);
    assert.equal(parking.state().resolved, 1, 'o patio entregou a nota e esvaziou');
    assert.equal(parking.state().exhausted, 0);
    assert.deepEqual(erros, [], 'sem erro de script na tela do aluno');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});
