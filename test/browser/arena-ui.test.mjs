import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESPERA, abrirNavegador, abrirPagina, clicarAte, esperarPor, recarregar } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

// Abrir o detalhe de uma sala no painel do professor.
//
// O painel relê o servidor a cada 2,5 s e troca o próprio DOM, então um clique
// comum pode cair num botão que já foi substituído e simplesmente sumir — foi
// assim que este arquivo reprovou no portão 2 sob carga, esperando 30 s por um
// diálogo que nunca abriu. `clicarAte` repete o clique até a tela seguinte
// aparecer, e é a tela seguinte que diz, em cada chamada, o que se espera.
const abrirDetalhe = (pagina, sala, condicao) => clicarAte(
  pagina, `[data-room-id="${sala.id}"] [data-action=detail]`, condicao,
  { descricao: `abrir o detalhe da sala "${sala.title}"` },
);

test('browser recovers a lost submission response without spending another attempt', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  let calls = 0;
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(),
    arenaJudge: async () => { calls++; return { percent: 80, breakdown: {}, feedback: 'Avaliado' }; },
    adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Recuperação', expected_players: 1 });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Missão', mission: 'Escreva um texto', modality: 'refinamento', attempts: 2,
      reference_text: 'Texto de referência com público, formato e restrições claras.',
    });
    const { round } = await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });
    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    await page.goto(`${base}/play?pin=${room.code}`);
    await page.type('[data-arena-join-form] [name=name]', 'Ana');
    await page.click('[data-arena-join-form] button[type=submit]');
    await page.waitForSelector('[data-arena-screen="lobby"].is-active');
    await post('arena_start_round', { room_id: room.id });
    await page.waitForSelector('[data-arena-prompt-form] textarea', { visible: true });
    // Missao sem cronometro (a rodada acaba quando o professor encerra): o
    // relogio do aluno diz o que e, em vez de um "--:--" que parece falha.
    const relogioSemTempo = await page.evaluate(() => {
      const node = document.querySelector('[data-arena-timer]');
      return { texto: node.textContent.trim(), classes: node.className };
    });
    assert.equal(relogioSemTempo.texto, 'Sem limite');
    assert.match(relogioSemTempo.classes, /is-untimed/);
    await page.type('[data-arena-prompt-form] textarea', 'Meu prompt recebido');
    let dropped = false;
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      if (!dropped && request.url().includes('action=arena_submit')) {
        dropped = true;
        await fetch(request.url(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: request.postData() });
        await request.abort('failed');
      } else await request.continue();
    });
    await page.click('[data-arena-send]');
    await page.waitForFunction(() => document.querySelector('[data-arena-mission-message]').textContent.includes('recuperada'));
    assert.equal(calls, 1);
    assert.equal((await repositories.arena.submissions.listByRound(round.id)).length, 1);
    assert.equal(await page.evaluate((id) => sessionStorage.getItem(`arena_pending_${id}`), round.id), null);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

test('browser explains the used attempt and never reports the same criterion as easiest and hardest', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Tentativa única', preset: 'personalizado', expected_players: 2 });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Precisão de uma tentativa', modality: 'precisao', mission: 'Escreva o prompt do cartaz da feira.',
      reference_text: 'Cartaz A3 da feira, com data, local e contato.', duration_seconds: 600,
      criteria: [{ criterion: 'objetivo', weight: 60 }, { criterion: 'contexto', weight: 40 }],
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });

    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/play?pin=${room.code}`);
    await page.type('[data-arena-join-form] [name=name]', 'Ana');
    await page.click('[data-arena-join-form] button[type=submit]');
    await page.waitForSelector('[data-arena-screen="lobby"].is-active');
    await post('arena_start_round', { room_id: room.id });
    await page.waitForSelector('[data-arena-prompt-form] textarea', { visible: true });
    await page.type('[data-arena-prompt-form] textarea', 'Cartaz A3 da feira de ciências, com data, local, oficinas e contato, linguagem jovem.');
    await page.click('[data-arena-send]');
    await page.waitForFunction(() => !document.querySelector('[data-arena-result]')?.hidden);

    // Precisão dá UMA tentativa: o composer sai de cena com o motivo escrito,
    // em vez de deixar um campo editável e um botão Enviar apagado sem
    // explicação (o aluno digitava e nada acontecia).
    const esgotado = await page.evaluate(() => ({
      composerEscondido: Boolean(document.querySelector('[data-arena-prompt-form]')?.hidden),
      enviarDesabilitado: Boolean(document.querySelector('[data-arena-send]')?.disabled),
      mensagem: document.querySelector('[data-arena-mission-message]')?.textContent.trim(),
    }));
    assert.equal(esgotado.composerEscondido, true, 'sem tentativa restante o composer sai de cena');
    assert.equal(esgotado.enviarDesabilitado, true);
    assert.match(esgotado.mensagem, /já foi usada|já foram usadas/);
    assert.match(esgotado.mensagem, /Aguarde o professor/);

    // Relatório do professor: o mesmo critério não pode ser a facilidade E a
    // dificuldade da turma.
    const admin = await abrirPagina(browser);
    admin.on('pageerror', (error) => errors.push(error.message));
    await admin.goto(`${base}/admin-arena.php`);
    await admin.type('[name=password]', 'browser-test-password');
    await Promise.all([admin.waitForNavigation(), admin.click('[data-admin-arena-login] button[type=submit]')]);
    await admin.waitForSelector('[data-arena-room-list] [data-room-id]');
    await abrirDetalhe(admin, room, () => Boolean(document.querySelector('[data-arena-report-body] .arena-report-grid')));
    const relatorio = await admin.evaluate(() => ({
      corpo: document.querySelector('[data-arena-report-body]')?.textContent.replace(/\s+/g, ' ').trim(),
      insight: document.querySelector('[data-arena-report-body] .arena-report-insight')?.textContent.replace(/\s+/g, ' ').trim() || '',
    }));
    assert.match(relatorio.corpo, /Média por missão/);
    const facilidade = relatorio.insight.match(/Maior facilidade da turma: ([^.]+)\./)?.[1] || '';
    const dificuldade = relatorio.insight.match(/Maior dificuldade: ([^.]+)\./)?.[1] || '';
    assert.notEqual(facilidade && dificuldade && facilidade === dificuldade, true, `o mesmo critério nos dois: ${relatorio.insight}`);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

test('browser fixes a mission from the room card straight into the missing field', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Corrigir', preset: 'personalizado', expected_players: 5 });
    // Sem gabarito: a sala nao abre e o card da missao mostra o que falta.
    const { challenge } = await post('arena_save_challenge', {
      title: 'Cartaz da feira', modality: 'precisao', mission: 'Escreva um prompt para o cartaz da feira.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', 'browser-test-password');
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await page.waitForSelector('[data-arena-room-list] [data-room-id]');
    await abrirDetalhe(page, room, () => Boolean(document.querySelector('[data-arena-detail-body] [data-action=fix-round]')));
    const botao = await page.$eval('[data-arena-detail-body] [data-action=fix-round]', (node) => ({ challenge: node.dataset.challengeId, missing: node.dataset.missing }));
    assert.deepEqual(botao, { challenge: challenge.id, missing: 'gabarito' });
    await clicarAte(page, '[data-arena-detail-body] [data-action=fix-round]',
      () => Boolean(document.querySelector('[data-arena-dialog] [data-challenge-form]')),
      { descricao: 'o formulário da missão abrir no detalhe da sala' });
    // O formulario abre marcado e com o cursor no campo que falta, nao no titulo.
    await page.waitForFunction(() => document.activeElement?.name === 'reference_text');
    const destaque = await page.$eval('[data-arena-dialog] [data-fix-field=gabarito]', (node) => node.className);
    assert.match(destaque, /is-needs-fix/);
    assert.match(await page.$eval('[data-arena-dialog] h3', (node) => node.textContent), /Cartaz da feira/);
    assert.match(await page.$eval('[data-arena-dialog] .arena-fix-callout', (node) => node.textContent), /sem gabarito/);
    await page.type('[data-arena-dialog] textarea[name=reference_text]', 'Cartaz A3 da feira, com data, local e contato no rodape.');
    await page.click('[data-arena-dialog] [data-challenge-form] button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('[data-arena-dialog]').open);
    // Salvou de verdade e a sala liberou: o aviso sai e o botao de abrir destrava.
    await page.waitForFunction(() => !document.querySelector('[data-arena-detail-body] .arena-blockers'));
    assert.equal((await repositories.arena.challenges.getById(challenge.id)).referenceText, 'Cartaz A3 da feira, com data, local e contato no rodape.');
    await post('arena_publish_room', { room_id: room.id });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

test('browser fills every missing mission of a room in one screen', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Varias pendências', preset: 'personalizado', expected_players: 5 });
    const { challenge: semGabarito } = await post('arena_save_challenge', {
      title: 'Precisão sem gabarito', modality: 'precisao', mission: 'Escreva o prompt do cartaz.',
      duration_seconds: 120, speed_weight: 'high', criteria: [{ criterion: 'objetivo', weight: 100 }],
    });
    const { challenge: semImagem } = await post('arena_save_challenge', {
      title: 'Reversa sem imagem', modality: 'reversa', category: 'Imagem', mission: 'Escreva o prompt da imagem.',
      reference_text: 'Cartaz vertical de festival, tipografia grande e paleta neon.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
    });
    for (const challenge of [semGabarito, semImagem]) await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });

    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', 'browser-test-password');
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await page.waitForSelector('[data-arena-room-list] [data-room-id]');
    // A tela unica abre do proprio aviso da sala, com as duas missoes e so os
    // campos que cada uma precisa.
    await abrirDetalhe(page, room, () => Boolean(document.querySelector('.arena-blockers [data-action=fix-all]')));
    await clicarAte(page, '.arena-blockers [data-action=fix-all]',
      () => Boolean(document.querySelector('[data-bulk-fix-form] [data-bulk-item]')),
      { descricao: 'a tela única das missões pendentes abrir' });
    const itens = await page.evaluate(() => [...document.querySelectorAll('[data-bulk-item]')].map((item) => ({
      id: item.dataset.bulkItem,
      imagem: Boolean(item.querySelector('[data-bulk-image]')),
      gabarito: Boolean(item.querySelector('[data-bulk-gabarito]')),
    })));
    assert.deepEqual(itens, [
      { id: semGabarito.id, imagem: false, gabarito: true },
      { id: semImagem.id, imagem: true, gabarito: false },
    ]);
    await page.type(`[data-bulk-gabarito="${semGabarito.id}"]`, 'Cartaz A3 da feira, com data, local e contato no rodape.');
    const fileInput = await page.$(`[data-bulk-image="${semImagem.id}"]`);
    await fileInput.uploadFile(fileURLToPath(new URL('../../public/assets/figma/trophy-gold.png', import.meta.url)));
    await page.click('[data-bulk-fix-form] button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('[data-arena-dialog]').open);
    // As duas missoes ficaram prontas: os campos que nao estavam em jogo continuam iguais.
    const comGabarito = await repositories.arena.challenges.getById(semGabarito.id);
    assert.equal(comGabarito.referenceText, 'Cartaz A3 da feira, com data, local e contato no rodape.');
    assert.equal(comGabarito.durationSeconds, 120);
    assert.equal(comGabarito.speedWeight, 'high');
    const comImagem = await repositories.arena.challenges.getById(semImagem.id);
    assert.match(comImagem.referenceImage, /^data:image\/png;base64,/);
    assert.equal(comImagem.referenceText, 'Cartaz vertical de festival, tipografia grande e paleta neon.');
    await post('arena_publish_room', { room_id: room.id });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

test('browser fills several gabaritos from one pasted prompt', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Colar prompt', preset: 'personalizado', expected_players: 5 });
    // Uma missão só precisa do gabarito (o prompt que gerou a imagem serve de gabarito).
    const { challenge: soGabarito } = await post('arena_save_challenge', {
      title: 'Precisão sem gabarito', modality: 'precisao', mission: 'Escreva o prompt do cartaz.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
    });
    // Outra precisa dos dois: fica como a pendência que sobra depois do atalho.
    const { challenge: semNada } = await post('arena_save_challenge', {
      title: 'Reversa sem imagem', modality: 'reversa', category: 'Imagem', mission: 'Escreva o prompt da imagem.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
    });
    for (const challenge of [soGabarito, semNada]) await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });

    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', 'browser-test-password');
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await page.waitForSelector('[data-arena-room-list] [data-room-id]');
    await abrirDetalhe(page, room, () => Boolean(document.querySelector('.arena-blockers [data-action=fix-all]')));
    await clicarAte(page, '.arena-blockers [data-action=fix-all]',
      () => Boolean(document.querySelector('[data-bulk-fix-form] [data-bulk-fill-source]')),
      { descricao: 'a tela única das missões pendentes abrir' });
    const colar = (text) => page.$eval('[data-bulk-fill-source]', (node, value) => {
      node.value = value;
      node.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);
    // Um prompt colado e aplicado de uma vez em quem só pede gabarito: a missão
    // que também precisa de imagem continua esperando, com o campo vazio.
    const texto = 'Cartaz A3 da feira, com data, local e contato no rodape.';
    await colar(texto);
    await page.click('[data-bulk-apply=somente]');
    assert.equal(await page.$eval(`[data-bulk-item="${soGabarito.id}"] [data-bulk-gabarito]`, (node) => node.value), texto);
    assert.equal(await page.$eval(`[data-bulk-item="${semNada.id}"] [data-bulk-gabarito]`, (node) => node.value), '');
    assert.equal(await page.$eval('[data-bulk-fill-hint]', (node) => node.textContent), '1 gabarito em branco.');
    // Prompt colado e nao aplicado nao pode sumir em silencio: o salvamento para.
    await colar('Texto que ninguém aplicou');
    await page.click('[data-bulk-fix-form] button[type=submit]');
    await page.waitForFunction(() => document.querySelector('[data-bulk-fix-message]').textContent.includes('ainda não foi aplicado'));
    assert.equal(await page.$eval('[data-arena-dialog]', (node) => node.open), true);
    assert.equal((await repositories.arena.challenges.getById(soGabarito.id)).referenceText, '', 'nada foi salvo sem querer');
    // Aplicando de verdade (o mesmo prompt na restante) e subindo a imagem, a sala abre.
    await colar(texto);
    await page.click('[data-bulk-apply=todas]');
    await colar('');
    const fileInput = await page.$(`[data-bulk-image="${semNada.id}"]`);
    await fileInput.uploadFile(fileURLToPath(new URL('../../public/assets/figma/trophy-silver.png', import.meta.url)));
    await page.click('[data-bulk-fix-form] button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('[data-arena-dialog]').open);
    assert.equal((await repositories.arena.challenges.getById(soGabarito.id)).referenceText, texto);
    assert.equal((await repositories.arena.challenges.getById(semNada.id)).referenceText, texto, 'o texto aplicado vale também para quem precisava dos dois');
    assert.match((await repositories.arena.challenges.getById(semNada.id)).referenceImage, /^data:image\/png;base64,/);
    await post('arena_publish_room', { room_id: room.id });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

test('browser preserves challenge fields through editing and renders entry pages on mobile', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const challenge = await repositories.arena.challenges.save({
    id: 'ui-challenge', title: 'Desafio de revisão', modality: 'precisao', mission: 'Descreva o cenário.',
    context: 'Contexto original', referenceText: 'Texto original', expectedResult: 'Resultado original',
    referenceImage: '/public/assets/figma/live-arena-logo.svg', durationSeconds: 90, speedWeight: 'high',
    criteria: [{ criterion: 'objetivo', weight: 100 }], now: Date.now() / 1000,
  });
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', 'browser-test-password');
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await clicarAte(page, '[data-arena-challenge-list] [data-action=edit]',
      () => Boolean(document.querySelector('[data-challenge-form]')),
      { descricao: 'o formulário da missão abrir para edição' });
    const before = await page.$eval('[data-challenge-form]', (form) => Object.fromEntries(['reference_text', 'reference_image', 'expected_result', 'duration_seconds', 'speed_weight'].map((name) => [name, form.elements[name].value])));
    assert.deepEqual(before, { reference_text: 'Texto original', reference_image: challenge.referenceImage, expected_result: 'Resultado original', duration_seconds: '90', speed_weight: 'high' });
    // Duas leituras de trabalho abertas (o que o aluno recebe, o que o juiz
    // avalia) e o resto sob a alça: critérios com resumo fiel, campos opcionais e
    // ajustes da rodada. O `before` acima já provou o que importa do recolhido —
    // ele lê `expected_result` DENTRO da dobra fechada, e o valor está lá.
    const recolhido = await page.evaluate(() => ({
      grupos: [...document.querySelectorAll('[data-challenge-form] .arena-form-group > legend')].map((n) => n.textContent.trim()),
      criterios: document.querySelector('[data-form-criteria]')?.open,
      resumo: document.querySelector('[data-form-criteria] > summary')?.textContent.trim(),
      opcionais: document.querySelector('[data-form-fold="extras"]')?.open,
      ajustes: document.querySelector('[data-form-fold="rodada"] > summary')?.textContent.trim(),
      imagem: document.querySelector('[data-form-fold="imagem"]')?.open,
    }));
    assert.deepEqual(recolhido.grupos, ['O aluno recebe', 'O juiz avalia'], 'os grupos obrigatórios ficam abertos: nenhum campo pendente nasce dentro de dobra');
    assert.equal(recolhido.criterios, false, 'os critérios começam recolhidos, com o resumo no lugar do rótulo');
    assert.equal(recolhido.resumo, 'Critérios e pesos — 1 critério · 100%', 'o resumo diz quantos critérios e quanto eles somam');
    assert.equal(recolhido.opcionais, false);
    assert.equal(recolhido.ajustes, 'Ajustes da rodada — 1× · 1:30 · Influencia alta');
    assert.equal(recolhido.imagem, true, 'a missão que tem imagem abre o campo da imagem');
    // Erro dentro da dobra não fica escondido: submetido sem critério nenhum, o
    // grupo abre e o foco vai para o primeiro critério.
    await page.evaluate(() => {
      for (const caixa of document.querySelectorAll('[data-challenge-form] input[name=criteria]')) caixa.checked = false;
      document.querySelector('[data-challenge-form] button[type=submit]').click();
    });
    await page.waitForFunction(() => document.querySelector('[data-form-criteria]')?.open === true, { polling: 100 });
    assert.match(await page.$eval('[data-challenge-form-message]', (node) => node.textContent), /ao menos um criterio/i);
    assert.equal(await page.evaluate(() => document.activeElement?.name), 'criteria', 'o foco vai para o campo que precisa de atenção');
    await page.evaluate(() => { document.querySelector('[data-challenge-form] input[name=criteria]').checked = true; });
    await page.click('[data-challenge-form] button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('[data-arena-dialog]').open);
    const saved = await repositories.arena.challenges.getById(challenge.id);
    for (const key of ['referenceText', 'referenceImage', 'expectedResult', 'durationSeconds', 'speedWeight']) assert.equal(saved[key], challenge[key], key);
    for (const width of [390, 768, 1440]) {
      await page.setViewport({ width, height: 900 });
      for (const path of ['/', '/play', '/admin-arena.php']) {
        await page.goto(base + path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(overflow, false, `${path} overflows at ${width}px`);
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

test('browser reviews a room mission by mission the way the student will see it', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Sala em revisao', preset: 'personalizado', expected_players: 3 });
    const { challenge: pronta } = await post('arena_save_challenge', {
      title: 'Cartaz da feira', modality: 'precisao', mission: 'Escreva o prompt do cartaz.',
      reference_text: 'Cartaz A3 da feira, com data, local e contato.', duration_seconds: 120,
      speed_weight: 'high', criteria: [{ criterion: 'objetivo', weight: 100 }],
    });
    const { challenge: faltando } = await post('arena_save_challenge', {
      title: 'Reversa sem gabarito', modality: 'reversa', category: 'Imagem', mission: 'Escreva o prompt da imagem.',
      reference_image: '/public/assets/figma/trophy-gold.png', criteria: [{ criterion: 'objetivo', weight: 100 }],
    });
    for (const challenge of [pronta, faltando]) await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });

    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', 'browser-test-password');
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await page.waitForSelector('[data-arena-room-list] [data-room-id]');
    // A revisao abre do detalhe da sala, com o mesmo link que o professor clica.
    await abrirDetalhe(page, room, () => Boolean(document.querySelector('.arena-preview-open')));
    const href = await page.$eval('.arena-preview-open', (node) => node.getAttribute('href'));
    assert.equal(href, `/aluno-preview.php?room=${room.id}`);
    // O mesmo detalhe oferece a previa da projecao (TV da turma).
    assert.equal(await page.$eval('.arena-preview-open.is-tv', (node) => node.getAttribute('href')), `/tv-preview.php?room=${room.id}`);
    // O tempo da aula: o detalhe soma os cronometros e diz quantas missoes nao
    // tem nenhum — e o card de cada missao mostra o dela.
    const tempo = await page.evaluate(() => ({
      chip: document.querySelector('[data-room-timing]')?.textContent.trim(),
      cards: [...document.querySelectorAll('.arena-round-card')].map((card) => card.querySelector('[data-round-timer]')?.textContent.trim()),
    }));
    assert.match(tempo.chip, /^⏱ 2 min de aula · 1 missão sem cronômetro/);
    assert.match(tempo.chip, /ajustar$/, 'o chip é o atalho para ajustar os tempos');
    // O card sem cronômetro já mostra o que dá para aceitar (modalidade + tamanho).
    assert.deepEqual(tempo.cards, ['⏱ 2:00', '⏱ sem cronômetro · sugestão 2:45']);
    // Adicionar missão: o resumo da escolhida à vista e o gabarito do juiz fora
    // da leitura de quem só precisa confirmar que é a missão certa.
    await clicarAte(page, '[data-arena-detail-body] [data-action=add-round]',
      () => Boolean(document.querySelector('[data-add-round-form] [data-add-round-preview] .arena-round-summary')),
      { descricao: 'o diálogo de adicionar missão abrir com o resumo da escolhida' });
    await page.evaluate((id) => {
      const select = document.querySelector('[data-add-round-challenge]');
      select.value = id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, pronta.id);
    const adicionar = await page.evaluate(() => ({
      resumo: document.querySelector('[data-add-round-preview] .arena-round-summary')?.innerText.replace(/\s+/g, ' ').trim(),
      gabaritoNaTela: document.body.innerText.includes('Cartaz A3 da feira, com data, local e contato.'),
      dobras: [...document.querySelectorAll('[data-add-round-preview] details')].map((d) => ({ alca: d.querySelector('summary').textContent.trim(), aberto: d.open })),
    }));
    assert.match(adicionar.resumo, /Cartaz da feira/);
    assert.match(adicionar.resumo, /Precisão · 2:00/, 'o resumo diz a modalidade e o tempo da missão');
    assert.equal(adicionar.gabaritoNaTela, false, 'o gabarito não ocupa a tela antes de ser pedido');
    assert.deepEqual(adicionar.dobras, [{ alca: 'O aluno recebe', aberto: false }, { alca: 'Gabarito do juiz', aberto: false }]);
    await page.click('[data-add-round-preview] details:last-of-type > summary');
    assert.equal(
      await page.evaluate(() => document.body.innerText.includes('Cartaz A3 da feira, com data, local e contato.')),
      true,
      'o gabarito continua a um clique',
    );
    await page.evaluate(() => document.querySelector('[data-arena-dialog]').close());
    const preview = await abrirPagina(browser);
    preview.on('pageerror', (error) => errors.push(error.message));
    await preview.goto(`${base}${href}`);
    await preview.waitForSelector('[data-arena-preview-bar] [data-preview-jump]');
    // A navegação entre missões vive numa dobra, e a alça dela é a própria
    // contagem ("Missão 1 de 3") — nenhuma palavra nova na barra. Abrir antes de
    // clicar é o caminho de quem usa a prévia, e é o que a dobra promete.
    const abrirNavegacao = async () => {
      if (await preview.evaluate(() => document.querySelector('[data-preview-nav-fold]')?.open === true)) return;
      await preview.click('[data-preview-nav-fold] > summary');
      await preview.waitForFunction(() => document.querySelector('[data-preview-nav-fold]')?.open === true, { polling: 100 });
    };
    const read = () => preview.evaluate(() => ({
      tag: document.querySelector('.arena-preview-tag')?.textContent,
      count: document.querySelector('.arena-preview-count')?.textContent,
      state: document.querySelector('.arena-preview-missing, .arena-preview-ok')?.textContent,
      title: document.querySelector('[data-arena-mission-title]')?.textContent,
      chips: document.querySelectorAll('[data-preview-jump]').length,
      flagged: document.querySelectorAll('[data-preview-jump].has-issue').length,
      locked: Boolean(document.querySelector('[data-arena-prompt-form] textarea')?.disabled),
      sendLocked: Boolean(document.querySelector('[data-arena-send]')?.disabled),
    }));
    const first = await read();
    assert.equal(first.tag, 'PRÉVIA DO PROFESSOR');
    assert.equal(first.chips, 2);
    assert.equal(first.flagged, 1, 'a missao sem gabarito fica sinalizada na navegacao');
    assert.match(first.count, /Missão 1 de 2/);
    assert.match(first.state, /pronta para ir ao ar/);
    assert.equal(first.locked, true, 'a previa nao aceita resposta');
    assert.equal(first.sendLocked, true);
    // A previa repete o total da aula e marca, missao por missao, quem tem
    // cronometro e quem termina so quando o professor encerrar.
    const relogios = await preview.evaluate(() => ({
      total: document.querySelector('[data-preview-timing]')?.textContent.trim(),
      meta: document.querySelector('.arena-preview-meta')?.textContent,
      botoes: [...document.querySelectorAll('[data-preview-jump]')].map((button) => ({
        titulo: button.getAttribute('title'),
        semCronometro: button.classList.contains('is-untimed'),
      })),
      legenda: document.querySelector('.arena-preview-legend')?.textContent.trim(),
    }));
    assert.equal(relogios.total, '⏱ 2 min de aula · 1 missão sem cronômetro');
    assert.match(relogios.meta, /tempo 2:00/);
    assert.deepEqual(relogios.botoes.map((entry) => entry.semCronometro), [false, true]);
    assert.match(relogios.botoes[0].titulo, /tempo 2:00/);
    assert.match(relogios.botoes[1].titulo, /sem cronômetro/);
    assert.match(relogios.legenda, /tracejado = sem cronômetro/);
    // O gabarito do juiz nao aparece na tela em nenhum momento: quem decide ve-lo
    // e o professor, clicando em "Ver gabarito".
    const gabarito = 'Cartaz A3 da feira, com data, local e contato.';
    assert.equal(await preview.evaluate((texto) => document.body.innerText.includes(texto), gabarito), false, 'gabarito visivel para o aluno');
    await preview.click('[data-preview-gabarito]');
    await preview.waitForSelector('[data-preview-gabarito-panel]');
    assert.equal(await preview.$eval('[data-preview-gabarito-panel]', (node) => node.textContent.includes('O ALUNO NÃO VÊ ESTE TEXTO')), true);
    assert.equal(await preview.$eval('[data-preview-gabarito-panel]', (node, texto) => node.textContent.includes(texto), gabarito), true);
    await preview.click('[data-preview-gabarito]');
    await preview.waitForFunction(() => !document.querySelector('[data-preview-gabarito-panel]'));
    // A pendencia aparece antes de abrir a sala, nomeando a missao 2.
    await abrirNavegacao();
    await preview.click('[data-preview-step="1"]');
    await preview.waitForFunction(() => document.querySelector('.arena-preview-count')?.textContent.includes('Missão 2'));
    assert.equal(
      await preview.evaluate(() => document.querySelector('[data-preview-nav-fold]')?.open),
      true,
      'a navegação aberta não fecha quando a barra se redesenha na troca de missão',
    );
    const second = await read();
    assert.match(second.state, /sem gabarito/);
    // Sem cronometro, a meta da missao diz isso com as mesmas palavras da barra.
    assert.equal(await preview.$eval('.arena-preview-meta', (node) => node.textContent.trim()), 'Engenharia Reversa · sem cronômetro');
    assert.equal(second.title, 'Reversa sem gabarito');
    // Telas de fim: a nota logo depois de responder — nota, criterios, feedback,
    // form fora de cena e o selo dizendo que os numeros sao de exemplo.
    await preview.click('[data-preview-mode=resultado]');
    await preview.waitForSelector('[data-arena-result]:not([hidden])');
    // A nota é um count-up de 1,2 s: o painel aparece com o texto inicial ('0')
    // e o número sobe até o alvo. Esperar o painel não basta — ele fica visível
    // antes de fechar, e ler agora dava nota '0' em vez de 'N PTS' de tempos em
    // tempos (o PTS é montado por `toLocaleString`). O fim da animação é
    // exatamente quando o texto casa com o `data-target`.
    await preview.waitForFunction(() => {
      const el = document.querySelector('[data-arena-result-percent]');
      return Boolean(el && el.dataset.target && el.textContent === el.dataset.target);
    });
    const resultado = await preview.evaluate(() => ({
      rotulo: document.querySelector('[data-arena-result-label]')?.textContent,
      nota: document.querySelector('[data-arena-result-percent]')?.textContent,
      criterios: document.querySelectorAll('[data-arena-breakdown] .arena-breakdown-row').length,
      feedback: document.querySelector('[data-arena-feedback]')?.textContent,
      composerEscondido: Boolean(document.querySelector('[data-arena-prompt-form]')?.hidden),
      criteriosRecolhidos: document.querySelector('[data-arena-breakdown-fold]')?.open === false,
      selo: document.querySelector('.arena-preview-sample')?.textContent,
      // O anel da nota e o diagnóstico (referência LA-03D): o anel tem de
      // receber a qualidade medida (0–100) e o diagnóstico nomeia o melhor
      // critério e o que ainda dá ponto.
      anel: document.querySelector('[data-arena-score-ring]')?.style.getPropertyValue('--la-score'),
      unidade: document.querySelector('[data-arena-result-unit]')?.textContent,
      diagnostico: [...document.querySelectorAll('[data-arena-diagnosis] .arena-diagnosis-item')].map((no) => ({
        rotulo: no.querySelector('span')?.textContent,
        criterio: no.querySelector('strong')?.textContent,
        detalhe: no.querySelector('em')?.textContent,
      })),
      diagnosticoEscondido: document.querySelector('[data-arena-diagnosis]')?.hidden === true,
    }));
    assert.match(resultado.rotulo, /SUA NOTA|PONTOS/);
    assert.match(resultado.nota, /PTS/);
    assert.equal(resultado.criterios >= 1, true, 'a nota mostra os criterios');
    assert.match(resultado.feedback, /^Exemplo de retorno do juiz/);
    assert.equal(resultado.composerEscondido, true, 'na rodada encerrada o form sai de cena');
    const qualidade = Number(resultado.anel);
    assert.equal(
      resultado.anel !== '' && Number.isFinite(qualidade) && qualidade >= 0 && qualidade <= 100,
      true,
      `o anel da nota recebeu a qualidade medida (veio ${JSON.stringify(resultado.anel)})`,
    );
    assert.equal(resultado.unidade, 'de 100', 'a unidade do anel acompanha a escala da nota');
    // O diagnóstico é do PAR: aparece quando há dois critérios medidos para
    // comparar, e some quando há um só (não há "melhor" nem "pior" de um).
    assert.equal(
      resultado.diagnostico.length > 0,
      resultado.criterios >= 2,
      'o diagnóstico aparece exatamente quando há 2+ critérios medidos',
    );
    if (resultado.diagnostico.length) {
      assert.deepEqual(
        resultado.diagnostico.map((item) => item.rotulo),
        ['Melhor ponto', 'Foco agora'],
        'o diagnóstico lê o melhor critério e o que ainda dá ponto',
      );
      assert.equal(resultado.diagnostico.every((item) => item.criterio.trim().length > 0), true);
      assert.match(resultado.diagnostico[0].detalhe, /\/20$/);
      assert.match(resultado.diagnostico[1].detalhe, /^\+\d+ pts/);
      assert.equal(resultado.diagnosticoEscondido, false);
    }
    // Nota, feedback e proximo passo vem primeiro; o detalhe dos criterios existe
    // e abre sob demanda (a dobra)
    assert.equal(
      resultado.criteriosRecolhidos,
      true,
      'os criterios comecam recolhidos — quem quer o detalhe pede, quem quer a nota ja tem',
    );
    await preview.click('[data-arena-breakdown-fold] > summary');
    assert.equal(
      await preview.$eval('[data-arena-breakdown-fold]', (node) => node.open),
      true,
      'a dobra dos criterios abre no clique',
    );
    assert.match(resultado.selo, /NÚMEROS DE EXEMPLO/);
    // Fim da sala: resultado por missao, podio com campeao e destaques.
    await preview.click('[data-preview-mode=fim]');
    await preview.waitForFunction(() => document.querySelector('[data-arena-empty-title]')?.textContent.includes('Batalha encerrada'));
    const fim = await preview.evaluate(() => ({
      resultados: document.querySelectorAll('[data-arena-results-list] .arena-result-row').length,
      resultadosRecolhidos: document.querySelector('[data-arena-results-panel]')?.open === false,
      destaquesRecolhidos: document.querySelector('.arena-highlights-panel')?.open === false,
      classificacao: document.querySelectorAll('[data-arena-ranking] .arena-ranking-row').length,
      campeao: document.querySelectorAll('[data-arena-ranking] .arena-ranking-row.is-champion').length,
      destaques: document.querySelectorAll('[data-arena-highlights] .arena-highlight-row').length,
      missaoVisivel: !document.querySelector('[data-arena-mission]')?.hidden,
      navegacaoMissao: Boolean(document.querySelector('[data-preview-jump]')),
      selo: document.querySelector('.arena-preview-sample')?.textContent,
    }));
    assert.equal(fim.resultados, 2, 'uma linha de resultado por missao da sala');
    assert.equal(fim.classificacao, 4);
    assert.equal(fim.campeao, 1, 'so o primeiro lugar e campeao');
    assert.equal(fim.destaques, 4);
    // No encerramento a leitura principal e a classificacao: resultado por missao
    // e destaques continuam na tela, a um clique.
    assert.equal(fim.resultadosRecolhidos, true, 'os resultados por missao comecam recolhidos no fim');
    assert.equal(fim.destaquesRecolhidos, true, 'os destaques comecam recolhidos no fim');
    await preview.click('[data-arena-results-panel] > summary');
    assert.equal(
      await preview.$eval('[data-arena-results-panel]', (node) => node.open),
      true,
      'o resultado por missao abre no clique',
    );
    assert.equal(fim.missaoVisivel, false);
    assert.equal(fim.navegacaoMissao, false, 'sem missao na tela, sem navegacao de missao');
    assert.match(fim.selo, /NÚMEROS DE EXEMPLO/);
    // Voltar para a missao devolve a tela da missao aberta, sem nota.
    await preview.click('[data-preview-mode=missao]');
    await preview.waitForFunction(() => document.querySelector('[data-arena-result]')?.hidden === true);
    assert.equal(await preview.$eval('[data-arena-prompt-form] textarea', (node) => node.disabled), true);
    assert.equal(await preview.$eval('[data-preview-mode=missao]', (node) => node.classList.contains('is-current')), true);
    // A preparação da aula (código, tempo somado, estado da missão) abre na alça,
    // e a escolha sobrevive à troca de missão — o painel se redesenha a cada passo.
    // Aqui a navegação está na missão 2, a que não abre a sala. `innerText` é o
    // texto RENDERIZADO: o conteúdo de um `<details>` fechado não entra nele — é
    // a régua certa, porque o que a alça esconde deixa de existir para quem lê.
    const preparo = await preview.evaluate(() => ({
      alca: document.querySelector('[data-preview-prep] > summary')?.textContent.trim(),
      aberta: document.querySelector('[data-preview-prep]')?.open,
      textoDaBarra: document.querySelector('[data-arena-preview-bar]').innerText.replace(/\s+/g, ' ').trim(),
      estado: document.querySelector('.arena-preview-ok, .arena-preview-missing')?.textContent,
    }));
    assert.equal(preparo.alca, 'Nada disto está no ar.', 'o aviso de simulação é a própria alça: não some e não custa palavra nova');
    assert.equal(preparo.aberta, false);
    assert.equal(preparo.textoDaBarra.includes('PIN'), false, 'o código da sala não ocupa a barra antes do clique');
    assert.equal(preparo.textoDaBarra.includes('de aula'), false, 'o tempo somado da aula também não');
    assert.match(preparo.estado, /sem gabarito/, 'o que impede a sala de abrir fica à vista — o que só confirma é que pode esperar');
    await preview.click('[data-preview-prep] > summary');
    await preview.waitForFunction(() => document.querySelector('[data-preview-prep]')?.open === true, { polling: 100 });
    assert.match(await preview.$eval('[data-arena-preview-bar]', (node) => node.innerText), /PIN/);
    await abrirNavegacao();
    await preview.click('[data-preview-step="-1"]');
    await preview.waitForFunction(() => document.querySelector('.arena-preview-count')?.textContent.includes('Missão 1'), { polling: 100 });
    assert.equal(await preview.$eval('[data-preview-prep]', (node) => node.open), true, 'a alça aberta não fecha na troca de missão');
    await preview.click('[data-preview-prep] > summary');
    await preview.waitForFunction(() => document.querySelector('[data-preview-prep]')?.open === false, { polling: 100 });
    const missaoPronta = await preview.evaluate(() => ({
      naBarra: document.querySelector('[data-arena-preview-bar]').innerText.includes('pronta para ir ao ar'),
      noDocumento: document.querySelector('.arena-preview-ok')?.textContent.trim(),
    }));
    assert.equal(missaoPronta.naBarra, false, 'com a missão pronta, a confirmação vive na alça');
    assert.equal(missaoPronta.noDocumento, '✓ pronta para ir ao ar', 'e continua na tela, a um clique');
    // Critério de aceite do plano, medido em celular: o conteúdo do aluno começa
    // na primeira tela, com a barra ocupando menos de metade dela.
    await preview.setViewport({ width: 390, height: 844 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const celular = await preview.evaluate(() => {
      const barra = document.querySelector('[data-arena-preview-bar]').getBoundingClientRect();
      const missao = document.querySelector('[data-arena-mission]').getBoundingClientRect();
      return {
        fracaoDaPrimeiraTela: Number((barra.height / innerHeight).toFixed(2)),
        inicioDoAlunoNaPrimeiraTela: missao.top < innerHeight,
        missaoTop: Math.round(missao.top),
      };
    });
    assert.equal(
      celular.inicioDoAlunoNaPrimeiraTela,
      true,
      `o conteúdo do aluno começa fora da primeira tela (topo em ${celular.missaoTop}px) — a barra da prévia voltou a empurrar o aluno para baixo`,
    );
    assert.ok(
      celular.fracaoDaPrimeiraTela < 0.5,
      `a barra administrativa ocupa ${Math.round(celular.fracaoDaPrimeiraTela * 100)}% da primeira tela do celular`,
    );
    await preview.setViewport({ width: 1440, height: 900 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    // Revisar nao mexe na sala: nada enviado, ninguem entrou, segue em rascunho.
    const { detail } = await post('arena_room_detail', { room_id: room.id });
    assert.equal(detail.room.status, 'draft');
    assert.equal(detail.participants.length, 0);
    assert.equal(detail.rounds.every((round) => !round.submitted), true);

    // Com UMA missão não existe "ir para outra": anterior/próxima ficavam
    // desabilitados e a grade numerada repetia a única missão. A contagem da
    // missão atual e o gabarito continuam à vista.
    const { room: salaUnica } = await post('arena_create_room', { title: 'Sala de uma missão', preset: 'personalizado', expected_players: 3 });
    const { challenge: unica } = await post('arena_save_challenge', {
      title: 'Missão única', modality: 'precisao', mission: 'Escreva o prompt do bilhete.',
      reference_text: 'Bilhete da reunião de pais, com data e local.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
    });
    await post('arena_add_round', { room_id: salaUnica.id, challenge_id: unica.id });
    const previaUnica = await abrirPagina(browser);
    previaUnica.on('pageerror', (error) => errors.push(error.message));
    await previaUnica.goto(`${base}/aluno-preview.php?room=${salaUnica.id}`);
    await previaUnica.waitForSelector('[data-arena-preview-bar]');
    assert.deepEqual(await previaUnica.evaluate(() => ({
      contagem: document.querySelector('.arena-preview-count')?.textContent.replace(/\s+/g, ' ').trim(),
      navegacao: document.querySelectorAll('[data-preview-step]').length,
      grade: document.querySelectorAll('[data-preview-jump]').length,
      dobra: Boolean(document.querySelector('[data-preview-nav-fold]')),
      gabarito: Boolean(document.querySelector('[data-preview-gabarito]')),
    })), {
      contagem: 'Missão 1 de 1', navegacao: 0, grade: 0, dobra: false, gabarito: true,
    }, 'sem outra missão para onde ir, os controles de navegação não existem');
    await previaUnica.close();

    // Tempos da sala: o chip abre o ajuste, a sugestao da missao sem cronometro
    // e aceita com um clique e a outra e ajustada a mao — os dois caminhos que o
    // professor pediu. O tempo pertence ao desafio, entao e ele que muda.
    //
    // O clique vai por dentro da pagina, e repetido, de proposito: o detalhe se
    // redesenha sozinho a cada releitura, e um clique de fora pode mirar um
    // botao que acabou de ser trocado — sem repetir, a espera seguinte estoura
    // o tempo por inteiro.
    // A aba do painel volta para a frente: e nela que o professor mexe.
    await page.bringToFront();
    await clicarAte(page, '[data-room-timing]',
      () => Boolean(document.querySelector('[data-room-timing-form] [data-timing-item]')),
      { descricao: 'o ajuste dos tempos da aula abrir' });
    const linhas = await page.evaluate(() => [...document.querySelectorAll('[data-timing-item]')].map((item) => ({
      titulo: item.querySelector('legend strong')?.textContent,
      campo: item.querySelector('[data-timing-input]')?.value,
      sugestao: item.querySelector('[data-timing-use]')?.dataset.timingValue || '',
      outrasSalas: Boolean(item.querySelector('.arena-timing-shared')),
    })));
    assert.deepEqual(linhas, [
      // A missao com tempo tem a sua propria sugestao (Precisao, 5 palavras),
      // mas quem precisa de ajuda e a que esta sem cronometro.
      { titulo: 'Missão 1 — Cartaz da feira', campo: '2:00', sugestao: '105', outrasSalas: false },
      { titulo: 'Missão 2 — Reversa sem gabarito', campo: '', sugestao: '165', outrasSalas: false },
    ]);
    // A linha destaca o que se decide — missão, tempo de agora e sugestão — e o
    // formato do campo é explicado UMA vez, no aviso do topo, em vez de repetido
    // em cada missão. Enunciado e justificativa abrem sob a alça.
    const formato = await page.evaluate(() => ({
      aviso: document.querySelector('[data-room-timing-form] .arena-timing-lead')?.textContent.replace(/\s+/g, ' ').trim(),
      rotulos: [...document.querySelectorAll('[data-timing-item] .text-field > span')].map((n) => n.textContent.trim()),
      // O selo do tempo que está NO AR só é pintado quando ele difere do campo:
      // aqui o campo diz o que está gravado, então o selo não aparece.
      selos: [...document.querySelectorAll('[data-timing-item] .arena-timing-now')].map((n) => ({ texto: n.textContent.trim(), pintado: n.checkVisibility() })),
      dobras: [...document.querySelectorAll('[data-timing-item] details')].map((d) => ({ alca: d.querySelector('summary').textContent.trim(), aberto: d.open })),
      aplicar: [...document.querySelectorAll('[data-timing-apply-suggestions]')].map((n) => n.tagName),
    }));
    assert.match(formato.aviso, /Tempo em mm:ss/);
    assert.match(formato.aviso, /vazio = sem cronômetro/);
    assert.deepEqual(formato.rotulos, ['Tempo', 'Tempo'], 'o formato do campo não se repete em cada linha');
    assert.deepEqual(formato.selos, [{ texto: '', pintado: false }, { texto: '', pintado: false }],
      'enquanto campo e selo diriam a mesma coisa, a duração não se escreve duas vezes');
    assert.deepEqual(formato.dobras.map((d) => d.aberto), [false, false, false, false], 'enunciado e justificativa começam recolhidos');
    assert.deepEqual(formato.dobras.map((d) => d.alca), ['Sugestão: 1:45', 'O aluno recebe', 'Sugestão: 2:45', 'O aluno recebe']);
    assert.deepEqual(formato.aplicar, ['BUTTON'], 'com missão sem cronômetro o atalho existe — e não como botão desabilitado');
    await page.click('[data-timing-item] details > summary');
    assert.equal(await page.$eval('[data-timing-item] details', (node) => node.open), true, 'a alça abre a justificativa no clique');
    await page.evaluate(() => document.querySelector('[data-timing-item] details').open = false);
    assert.match(await page.$eval('[data-timing-total]', (node) => node.textContent), /2 min de aula · 1 missão sem cronômetro/);
    // Aceita a sugestao da missao sem cronometro (2:45) e ajusta a outra para 3:00.
    await page.evaluate(() => {
      const item = [...document.querySelectorAll('[data-timing-item]')][1];
      item.querySelector('[data-timing-use]').click();
    });
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[data-timing-input]')].map((input) => input.value)), ['2:00', '2:45']);
    // Aceitar a sugestão muda o campo, e só por isso o selo nasce — dizendo o que
    // está no ar, que é o que o campo não diz mais.
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[data-timing-item] .arena-timing-now')]
      .map((n) => ({ texto: n.textContent.trim(), pintado: n.checkVisibility() }))),
      [{ texto: '', pintado: false }, { texto: 'no ar: sem cronômetro', pintado: true }]);
    await page.evaluate(() => {
      const field = document.querySelector('[data-timing-input]');
      field.value = '';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.value = '3:00';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // O total ao vivo acompanha: 3:00 + 2:45, sem missao sem cronometro.
    await page.waitForFunction(() => document.querySelector('[data-timing-total]')?.textContent.includes('5 min 45 s'), { polling: 100 });
    assert.equal(await page.$eval('[data-timing-total]', (node) => node.textContent.includes('sem cronômetro')), false);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[data-timing-input]')].map((input) => input.value)), ['3:00', '2:45']);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[data-timing-item] .arena-timing-now')]
      .map((n) => ({ texto: n.textContent.trim(), pintado: n.checkVisibility() }))),
      [{ texto: 'no ar: 2:00', pintado: true }, { texto: 'no ar: sem cronômetro', pintado: true }],
      'com rascunho no campo, o selo é a única fonte do que já está gravado');
    await clicarAte(page, '[data-room-timing-form] button[type=submit]',
      () => !document.querySelector('[data-arena-dialog]').open,
      { descricao: 'os tempos salvos fecharem o ajuste' });
    assert.equal((await repositories.arena.challenges.getById(pronta.id)).durationSeconds, 180, 'a missão ajustada à mão');
    assert.equal((await repositories.arena.challenges.getById(faltando.id)).durationSeconds, 165, 'a sugestão aceita');
    // O detalhe volta com o tempo novo refletido no chip e no card.
    await page.waitForFunction(() => document.querySelector('[data-room-timing]')?.textContent.includes('5 min 45 s'), { polling: 100 });
    const depois = await page.evaluate(() => ({
      chip: document.querySelector('[data-room-timing]')?.textContent.trim(),
      cards: [...document.querySelectorAll('.arena-round-card')].map((card) => card.querySelector('[data-round-timer]')?.textContent.trim()),
      aviso: document.querySelector('.arena-fix-flash')?.textContent,
    }));
    assert.match(depois.chip, /^⏱ 5 min 45 s de aula/);
    assert.deepEqual(depois.cards, ['⏱ 3:00', '⏱ 2:45']);
    assert.match(depois.aviso, /2 tempos salvos/);
    // Reaberto com as duas missões cronometradas, o atalho de sugestões não
    // nasce: o aviso "todas as missões já têm cronômetro" não mudava decisão
    // nenhuma e ocupava uma linha do formulário.
    // A condicao exige o dialogo ABERTO: o markup do dialogo anterior continua
    // no DOM depois de fechar, e esperar so pelo formulario devolvia o antigo.
    await clicarAte(page, '[data-room-timing]',
      () => Boolean(document.querySelector('[data-arena-dialog]')?.open
        && document.querySelector('[data-room-timing-form] [data-timing-item]')),
      { descricao: 'o ajuste dos tempos reabrir' });
    assert.deepEqual(await page.evaluate(() => ({
      atalho: Boolean(document.querySelector('[data-room-timing-form] .arena-timing-actions')),
      linhas: document.querySelectorAll('[data-timing-item]').length,
      selosPintados: [...document.querySelectorAll('[data-timing-item] .arena-timing-now')]
        .filter((n) => n.checkVisibility()).length,
      salvar: (() => {
        const botao = document.querySelector('[data-room-timing-form] button[type=submit]');
        const corpo = document.querySelector('[data-arena-dialog-body]').getBoundingClientRect();
        const caixa = botao.getBoundingClientRect();
        return { posicao: getComputedStyle(botao.parentElement).position, dentro: caixa.top >= corpo.top && caixa.bottom <= corpo.bottom };
      })(),
    })), { atalho: false, linhas: 2, selosPintados: 0, salvar: { posicao: 'sticky', dentro: true } },
    'sem nada a sugerir, o atalho some; o campo em dia sem selo; salvar preso à janela do diálogo');
    await page.evaluate(() => document.querySelector('[data-arena-dialog-close]').click());
    await page.waitForFunction(() => !document.querySelector('[data-arena-dialog]').open);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

test('browser reviews the TV projection state by state, including the champion', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Sala na TV', preset: 'personalizado', expected_players: 4 });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Cartaz da feira', modality: 'precisao', mission: 'Escreva o prompt do cartaz.',
      reference_text: 'Cartaz A3 da feira, com data, local e contato.',
      reference_image: '/public/assets/figma/prompt-sample.png',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });

    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', 'browser-test-password');
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await page.waitForSelector('[data-arena-room-list]');
    await page.goto(`${base}/tv-preview.php?room=${room.id}`);
    await page.waitForSelector('[data-tv-preview-bar] [data-tv-preview-mode]');

    const ler = () => page.evaluate(() => ({
      tag: document.querySelector('.arena-tv-preview-tag')?.textContent,
      modo: document.querySelector('[data-tv-preview-mode].is-current')?.textContent,
      botoes: document.querySelectorAll('[data-tv-preview-mode]').length,
      estado: document.querySelector('[data-tv-content]')?.className,
      pin: document.querySelector('.arena-tv-pin strong')?.textContent,
      qr: Boolean(document.querySelector('.arena-tv-join-qr')),
      roster: document.querySelectorAll('.arena-tv-roster li').length,
      rodada: document.querySelector('[data-tv-content] h1')?.textContent,
      contagem: document.querySelector('[data-tv-countdown]')?.textContent,
      cabeçalho: document.querySelector('.arena-tv-results-head h1')?.textContent,
      // O selo do resultado: existia para repetir o título ("CLASSIFICAÇÃO
      // FINAL" acima de "Batalha encerrada!"). Um título principal por estado.
      seloTv: document.querySelector('[data-tv-content] .arena-tv-round-badge')?.textContent.replace(/\s+/g, ' ').trim() || '',
      campeao: document.querySelector('.arena-tv-champion strong')?.textContent,
      placar: document.querySelector('.arena-tv-rank-list li strong')?.textContent,
      selo: document.querySelector('.arena-tv-preview-sample')?.textContent,
      seloExemplo: Boolean(document.querySelector('.arena-tv-preview-sample.is-sample')),
      abrirTv: Boolean(document.querySelector('[data-tv-preview-open]')),
      foraDaTv: document.querySelector('[data-tv-room-title]')?.textContent,
    }));

    // Espera: PIN e QR reais, participantes e placar de exemplo, com o motivo.
    const espera = await ler();
    assert.equal(espera.tag, 'PRÉVIA DA PROJEÇÃO');
    assert.equal(espera.modo, 'Espera');
    assert.equal(espera.botoes, 4);
    assert.match(espera.estado, /is-lobby/);
    assert.equal(espera.pin, room.pin || room.code);
    assert.equal(espera.qr, true, 'a TV da espera mostra o QR de entrada');
    assert.equal(espera.roster, 4);
    assert.equal(espera.seloExemplo, true);
    assert.match(espera.selo, /ninguém entrou/);
    assert.equal(espera.abrirTv, true);
    assert.equal(espera.foraDaTv, room.title);

    // Rodada: a missao na tela grande, com tempo correndo.
    await page.click('[data-tv-preview-mode=round]');
    await page.waitForFunction(() => document.querySelector('[data-tv-content]')?.className.includes('is-round'));
    const rodada = await ler();
    assert.equal(rodada.rodada, 'Cartaz da feira');
    assert.match(rodada.contagem, /^\d{1,2}:\d{2}$/);
    assert.match(rodada.selo, /nenhuma missão está aberta/);
    // Na rodada em andamento o selo fica: ali ele dá o número, que o título da
    // missão não dá. É o que separa "selo redundante" de "selo informativo".
    assert.match(rodada.seloTv, /^MISSAO \d{2}\/\d{2}$/);

    // Resultado da rodada: sem campeao, é o resto da tela que muda.
    await page.click('[data-tv-preview-mode=results]');
    await page.waitForFunction(() => document.querySelector('[data-tv-content]')?.className.includes('is-results'));
    const resultado = await ler();
    assert.match(resultado.cabeçalho, /Resultado da rodada/);
    assert.equal(resultado.seloTv, '', 'o resultado da rodada tem UM título: o selo repetia o h1');
    assert.equal(resultado.campeao, undefined);
    assert.match(resultado.selo, /rodada terminou/);

    // Fim: classificacao final com o painel de campeao.
    await page.click('[data-tv-preview-mode=final]');
    await page.waitForFunction(() => document.querySelector('.arena-tv-champion'));
    const fim = await ler();
    assert.match(fim.cabeçalho, /Batalha encerrada/);
    assert.equal(fim.seloTv, '', 'o fim tem UM título: o selo repetia o h1');
    assert.equal(fim.campeao, 'Ana');
    assert.equal(fim.placar, 'Ana');
    assert.match(fim.selo, /a sala ainda não tem respostas/);

    // Setas do teclado percorrem os mesmos estados.
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('[data-tv-preview-mode].is-current')?.textContent === 'Resultado');

    // "Atualizar" relê a sala e mantém o estado escolhido (a turma pode ter
    // jogado desde que a prévia foi aberta).
    // Clique por dentro da pagina: a barra da previa se redesenha depois do
    // refresh, e um clique de fora pode mirar o botao que acabou de sair.
    await page.evaluate(() => document.querySelector('[data-tv-preview-refresh]').click());
    await page.waitForFunction(() => document.querySelector('[data-tv-preview-mode].is-current')?.textContent === 'Resultado');
    assert.match(await page.$eval('.arena-tv-preview-sample', (node) => node.textContent), /rodada terminou/);

    // Missao sem cronometro na TV: diz que nao tem limite, em vez de 0:00.
    await post('arena_join', { code: room.code, name: 'Ana' });
    await post('arena_start_round', { room_id: room.id });
    await page.click('[data-tv-preview-mode=round]');
    await page.waitForFunction(() => document.querySelector('[data-tv-content]')?.className.includes('is-round'));
    await page.waitForFunction(() => document.querySelector('[data-tv-countdown]')?.dataset.tvUntimed === '1');
    const semLimite = await page.evaluate(() => ({
      texto: document.querySelector('[data-tv-countdown]')?.textContent,
      pausada: document.querySelector('[data-tv-countdown]')?.dataset.tvPaused,
      selo: document.querySelector('.arena-tv-preview-sample')?.textContent,
    }));
    assert.equal(semLimite.texto, 'Sem limite de tempo');
    assert.notEqual(semLimite.pausada, '1');
    assert.match(semLimite.selo, /Dados reais desta sala/, 'a rodada aberta da sala é dado real');

    // Sorteio da vez na parede: a turma inteira ve quem entra em campo agora e,
    // no mata-mata, quem continua no jogo. Tudo o que a TV faz e mostrar — quem
    // sorteia continua sendo o painel.
    for (const name of ['Bia', 'Caio', 'Duda']) await post('arena_join', { code: room.code, name });
    await post('arena_draw_setup', { room_id: room.id, mode: 'mata-mata', group_size: 2 });
    const sorteio = (await post('arena_draw_next', { room_id: room.id })).room.draw;
    await page.click('[data-tv-preview-mode=lobby]');
    await page.waitForSelector('[data-tv-draw]');
    const tvSorteio = await page.evaluate(() => {
      const limpar = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : '');
      return {
        modo: limpar(document.querySelector('.arena-tv-draw-mode')),
        agora: limpar(document.querySelector('.arena-tv-draw-now small')),
        nomes: [...document.querySelectorAll('.arena-tv-draw-names li')].map((node) => node.textContent.trim()),
        jogo: limpar(document.querySelector('.arena-tv-draw-bracket .is-in')),
        fora: limpar(document.querySelector('.arena-tv-draw-bracket .is-out')),
      };
    });
    assert.equal(tvSorteio.agora, 'É A VEZ DE');
    assert.deepEqual(tvSorteio.nomes, sorteio.current.names, 'a parede mostra exatamente quem foi sorteado');
    assert.equal(tvSorteio.modo, 'Mata-mata · Rodada 1');
    assert.match(tvSorteio.jogo, /^4 ainda no jogo/);
    assert.equal(tvSorteio.fora, '', 'ninguém saiu antes de a primeira disputa terminar');

    // Durante a missão, a mesma linha diz quem está em campo.
    await page.click('[data-tv-preview-mode=round]');
    await page.waitForFunction(() => document.querySelector('.arena-tv-round-vez')?.textContent.includes('Vez de'));
    const vezNaRodada = await page.$eval('.arena-tv-round-vez', (node) => node.textContent.replace(/\s+/g, ' ').trim());
    assert.equal(vezNaRodada, `🎲 Vez de ${sorteio.current.names.join(' · ')}`);

    // Decidida a disputa, a parede troca o "É A VEZ DE" pela última disputa e o
    // chaveamento perde quem ficou pelo caminho.
    await post('arena_draw_settle', { room_id: room.id, winner_id: sorteio.current.ids[0] });
    await page.click('[data-tv-preview-mode=lobby]');
    await page.waitForSelector('.arena-tv-draw-last');
    const depois = await page.evaluate(() => {
      const limpar = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : '');
      return {
        ultima: limpar(document.querySelector('.arena-tv-draw-last')),
        jogo: limpar(document.querySelector('.arena-tv-draw-bracket .is-in')),
        fora: limpar(document.querySelector('.arena-tv-draw-bracket .is-out')),
        agora: Boolean(document.querySelector('.arena-tv-draw-now')),
      };
    });
    assert.equal(depois.agora, false);
    assert.match(depois.ultima, /^Última disputa .*🏆 /);
    assert.match(depois.jogo, /^3 ainda no jogo/);
    assert.match(depois.fora, /^1 fora do jogo — /);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});
test('browser draws the next players, keeps the winner in the bowl and runs the knockout', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Turma do sorteio', preset: 'personalizado', expected_players: 4 });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Cartaz', modality: 'precisao', mission: 'Escreva o prompt do cartaz.',
      reference_text: 'Cartaz A3 da feira, com data, local e contato.', criteria: [{ criterion: 'objetivo', weight: 100 }],
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });
    for (const name of ['Ana', 'Bia', 'Caio', 'Duda']) {
      const joined = await fetch(`${base}/api.php?action=arena_join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: room.code, name }) });
      assert.equal(joined.status, 200, await joined.text());
    }

    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', 'browser-test-password');
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await page.waitForSelector('[data-arena-room-list] [data-room-id]');
    const openDetail = () => abrirDetalhe(page, room, () => Boolean(document.querySelector('[data-arena-draw]')));
    // O detalhe se redesenha sozinho (poll/SSE): o clique vai por dentro da
    // pagina e e repetido enquanto o sorteio nao reagir — um unico evento pode
    // cair num botao ja substituido e nao fazer nada, e a espera seguinte
    // estoura o tempo por inteiro esperando algo que nunca foi pedido.
    const clickDraw = (selector, condicao) => clicarAte(page, selector, condicao,
      { descricao: `o sorteio responder a ${selector}` });
    const readDraw = () => page.evaluate(() => {
      const panel = document.querySelector('[data-arena-draw]');
      if (!panel) return null;
      const clean = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : '');
      return {
        modes: [...panel.querySelectorAll('.arena-draw-mode')].map((button) => ({
          label: button.querySelector('b').textContent.trim(),
          on: button.classList.contains('is-on'),
        })),
        size: panel.querySelector('[data-draw-size]')?.value,
        count: clean(panel.querySelector('.arena-draw-count')),
        names: [...panel.querySelectorAll('.arena-draw-names li')].map((node) => node.textContent.trim()),
        picks: [...panel.querySelectorAll('[data-action="draw-winner"]')].map((button) => button.textContent.replace('🏆', '').trim()),
        cta: clean(panel.querySelector('.arena-draw-cta')),
        blocked: clean(panel.querySelector('.arena-draw-blocked')),
        lead: clean(panel.querySelector('.arena-draw-lead')),
        champion: clean(panel.querySelector('.arena-draw-champion strong')),
        history: [...panel.querySelectorAll('.arena-draw-history li')].map(clean),
        out: clean(panel.querySelector('.arena-draw-out')),
        started: Boolean(panel.querySelector('[data-action="draw-reset"]')),
      };
    });
    await openDetail();

    // O painel nasce pronto: livre, 3 por vez, com a turma inteira no balaio.
    const initial = await readDraw();
    assert.deepEqual(initial.modes, [
      { label: 'Sorteio livre', on: true },
      { label: 'Mata-mata', on: false },
    ]);
    assert.equal(initial.size, '3');
    assert.equal(initial.count, '4 na sala · 4 no sorteio');
    assert.equal(initial.cta, '🎲 Sortear 3');
    assert.equal(initial.started, false, 'sem sorteio em andamento, nada de "Recomeçar"');

    // Sortear: 3 nomes, um botão de vencedor para cada, e o convite para decidir.
    await clickDraw('[data-action="draw-next"].arena-draw-cta', () => Boolean(document.querySelector('.arena-draw-names li')));
    const drawn = await readDraw();
    assert.equal(drawn.names.length, 3);
    assert.deepEqual(drawn.picks, drawn.names, 'quem pode vencer é exatamente quem foi sorteado');
    assert.match(drawn.lead, /quem venceu esta disputa/, 'o grupo da vez já pergunta quem venceu');

    // Vencer no sorteio livre não tira ninguém do balaio: os 4 continuam.
    await clickDraw('[data-action="draw-winner"]', () => document.querySelectorAll('.arena-draw-history li').length === 1);
    const settled = await readDraw();
    assert.deepEqual(settled.names, []);
    assert.equal(settled.count, '4 na sala · 4 no sorteio');
    assert.equal(settled.history.length, 1);
    assert.match(settled.history[0], /^R1 /);
    assert.match(settled.history[0], /🏆 /);

    // Recarregar a página no meio da aula não perde o sorteio (ele é do servidor).
    await recarregar(page);
    await page.waitForSelector('[data-arena-room-list] [data-room-id]');
    await openDetail();
    const afterReload = await readDraw();
    assert.equal(afterReload.history.length, 1);
    assert.equal(afterReload.count, '4 na sala · 4 no sorteio');

    // Trocar para o mata-mata recomeça (o professor confirma) e agora o perdedor sai.
    await clickDraw('.arena-draw-mode[data-mode="mata-mata"]', () => document.querySelector('.arena-draw-mode.is-on b')?.textContent.trim() === 'Mata-mata');
    const knockout = await readDraw();
    assert.equal(knockout.history.length, 0, 'trocar de modelo zera o sorteio');
    assert.equal(knockout.count, '4 na sala · 4 na disputa');
    // No mata-mata o grupo encolhe: 4 pessoas com grupos de 3 viram 2 + 2, e o
    // botao anuncia o que vai realmente acontecer.
    assert.equal(knockout.cta, '🎲 Sortear 2');

    // 2 por vez: o sorteio encolhe o grupo para não deixar ninguém sozinho.
    await page.$eval('[data-draw-size]', (input) => {
      input.value = '2';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('[data-draw-size]')?.value === '2' && document.querySelector('.arena-draw-cta')?.textContent.trim() === '🎲 Sortear 2');

    // Rodada 1, grupo 1: dois jogam, um vence e o outro sai do jogo.
    await clickDraw('[data-action="draw-next"].arena-draw-cta', () => Boolean(document.querySelector('.arena-draw-names li')));
    const grupo1 = await readDraw();
    assert.equal(grupo1.names.length, 2);
    assert.equal(grupo1.lead, 'Rodada 1 · vez de 2 — quem venceu esta disputa?');
    await clickDraw('[data-action="draw-winner"]', () => document.querySelectorAll('.arena-draw-history li').length === 1);
    const depois1 = await readDraw();
    assert.equal(depois1.count, '4 na sala · 2 na disputa', 'na rodada 1 todos ainda são "na disputa"');
    assert.doesNotMatch(depois1.out, /nenhum/);
    assert.match(depois1.out, /^Fora do jogo: /);

    // Rodada 1, grupo 2: fecha a rodada, e a rodada 2 nasce só com os vencedores.
    await clickDraw('[data-action="draw-next"].arena-draw-cta', () => Boolean(document.querySelector('.arena-draw-names li')));
    await clickDraw('[data-action="draw-winner"]', () => document.querySelectorAll('.arena-draw-history li').length === 2);
    const depois2 = await readDraw();
    assert.equal(depois2.count, '4 na sala · Rodada 2 · 2 vencedores na disputa');
    assert.deepEqual(depois2.names, [], 'sem grupo aberto entre as rodadas');

    // A final decide o campeão e o sorteio para de sortear.
    await clickDraw('[data-action="draw-next"].arena-draw-cta', () => Boolean(document.querySelector('.arena-draw-names li')));
    assert.equal((await readDraw()).lead, 'Rodada 2 · vez de 2 — quem venceu esta disputa?');
    await clickDraw('[data-action="draw-winner"]', () => Boolean(document.querySelector('.arena-draw-champion strong')));
    const final = await readDraw();
    assert.equal(final.history.length, 3);
    assert.ok(final.champion.length >= 2);
    assert.equal(final.cta, '');
    assert.match(final.blocked, /já tem campeão/);

    // Recomeçar devolve a turma inteira ao balaio, no mesmo modelo.
    await clickDraw('[data-action="draw-reset"]', () => !document.querySelector('.arena-draw-champion'));
    const fresh = await readDraw();
    assert.equal(fresh.history.length, 0);
    assert.equal(fresh.count, '4 na sala · 4 na disputa');

    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

test('browser reaches the mission dialog while the room detail redraws itself', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Redesenho', preset: 'personalizado', expected_players: 5 });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Cartaz da feira', modality: 'precisao', mission: 'Escreva o prompt para o cartaz da feira.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });

    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', 'browser-test-password');
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await abrirDetalhe(page, room, () => Boolean(document.querySelector('[data-arena-detail-body] [data-action=fix-round]')));
    // O painel troca o próprio DOM a cada releitura. Aqui a troca é ligada de
    // propósito, a cada 20 ms, no mesmo lugar onde o painel se redesenha, para
    // deixar aberta o tempo todo a janela entre achar o botão e o evento chegar
    // nele — a janela que a máquina carregada abre sozinha. Era assim que este
    // arquivo reprovava no portão 2: o clique caía num botão já substituído e a
    // espera seguinte gastava os 30 s do Puppeteer por inteiro. Medido: com o
    // clique comum (`page.click`), esta troca derruba o clique em 4 de 4
    // tentativas, com `Node is detached from document`.
    await page.evaluate(() => {
      window.__redesenho = window.setInterval(() => {
        const alvo = document.querySelector('[data-arena-detail-body] [data-action=fix-round]');
        if (alvo) alvo.replaceWith(alvo.cloneNode(true));
      }, 20);
    });
    try {
      await clicarAte(page, '[data-arena-detail-body] [data-action=fix-round]',
        () => {
          const dialogo = document.querySelector('[data-arena-dialog]');
          return Boolean(dialogo?.open) && Boolean(dialogo.querySelector('[data-challenge-form]'));
        },
        { descricao: 'o formulário da missão abrir com o detalhe se redesenhando' });
    } finally {
      await page.evaluate(() => { window.clearInterval(window.__redesenho); });
    }
    assert.match(await page.$eval('[data-arena-dialog] h3', (node) => node.textContent), /Cartaz da feira/);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

// O modo de jogo era "Preset", e os ajustes do Modo Arena decoravam o formulário
// antes de a escolha ser feita: um `fieldset` com a MESMA frase da opção escolhida
// no seletor logo acima. Esta é a asserção que impede a repetição de voltar — e a
// prova de que recolher não apaga valor, porque o que decide não é a tela: é o que
// o servidor recebeu com a dobra fechada.
test('a nova sala recolhe os ajustes do Modo Arena com o valor na alça, e os envia mesmo fechada', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', 'browser-test-password');
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await page.waitForSelector('[data-arena-room-list]');
    await page.click('button[onclick="openCreateRoomDialog()"]');
    await page.waitForSelector('[data-arena-create-room]');

    // A interface não fala "Preset", e antes de escolher o Modo Arena os ajustes
    // dele não estão na tela.
    const rotulos = await page.$$eval('[data-arena-create-room] label > span', (nodes) => nodes.map((node) => node.textContent.trim()));
    assert.ok(rotulos.includes('Modo de jogo'), `o campo do modo de jogo: ${rotulos.join(' · ')}`);
    assert.equal(rotulos.includes('Preset'), false, 'a tela não chama mais o campo de Preset');
    assert.equal(await page.$eval('[data-arena-room-arena]', (node) => node.hidden), true);

    await page.select('[data-arena-preset]', 'arena');
    await page.waitForFunction(() => !document.querySelector('[data-arena-room-arena]').hidden);
    const aberto = await page.evaluate(() => ({
      // A frase da opção escolhida não vira título de seção: o seletor já disse.
      repeticoes: (document.querySelector('[data-arena-create-room]').textContent.match(/Arena — Turma vs\. Juiz/g) || []).length,
      alca: document.querySelector('[data-arena-arena-summary]')?.textContent.replace(/\s+/g, ' ').trim(),
      aberta: document.querySelector('[data-arena-room-arena]').open,
    }));
    assert.equal(aberto.repeticoes, 1, 'a opção escolhida não é repetida como título de seção');
    assert.equal(aberto.aberta, false, 'os ajustes da partida começam recolhidos');
    assert.match(aberto.alca, /^Partida — 3 rodadas · Juiz 5 ♥ · dano a partir de 60% · 2 ataques$/);

    // O resumo acompanha o valor escolhido, e o valor sobrevive a fechar a dobra.
    await page.evaluate(() => document.querySelector('[data-arena-arena-summary]').click());
    await page.waitForFunction(() => document.querySelector('[data-arena-room-arena]').open);
    await page.evaluate(() => {
      const campo = document.querySelector('input[name="arena_rounds"]');
      campo.value = '5';
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => /5 rodadas/.test(document.querySelector('[data-arena-arena-summary]').textContent));
    await page.evaluate(() => document.querySelector('[data-arena-arena-summary]').click());
    await page.waitForFunction(() => !document.querySelector('[data-arena-room-arena]').open);

    await page.type('[data-arena-create-room] [name=title]', 'Sala com a dobra fechada');
    await page.click('[data-arena-create-room] button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('[data-arena-dialog]')?.open);

    const criada = (await repositories.arena.rooms.list()).find((sala) => sala.title === 'Sala com a dobra fechada');
    assert.ok(criada, 'a sala foi criada');
    assert.equal(criada.preset, 'arena');
    assert.equal(criada.settings.arenaRounds, 5, 'o valor escolhido dentro da dobra fechada foi enviado');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

// O cartão da aula é um RESUMO quando está fechado: título, descrição e tamanho.
// A enumeração completa das modalidades mora dentro da abertura, junto das
// missões. As ações dos cartões da mesma linha começam na mesma altura, e a
// secundária pesa menos que a principal — sem isso a Aula 5 gastava 28 palavras
// na linha fechada e as duas pílulas de 16 px não cabiam na largura do cartão.
test('browser resume as aulas no cartão fechado, com as ações alinhadas e a secundária mais leve', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const clock = Date.now() / 1000;
  await repositories.arena.challenges.save({
    id: 'ui-aula-challenge', title: 'Desafio da aula', modality: 'precisao', mission: 'Descreva o cenário.',
    criteria: [{ criterion: 'objetivo', weight: 100 }], now: clock,
  });
  const room = await repositories.arena.rooms.create({ id: 'ui-aula-room', code: 'AUL123', title: 'Sala das aulas', now: clock });
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await abrirNavegador();
    // Largura fixa: com o painel estreito a grade cai para uma faixa e a medida
    // da largura do cartão solitário não diria nada.
    const page = await abrirPagina(browser, { viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', 'browser-test-password');
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await abrirDetalhe(page, room, () => document.querySelectorAll('[data-arena-lesson-list] article').length >= 4);

    const aulas = await page.evaluate(() => [...document.querySelectorAll('[data-arena-lesson-list] article')].map((cartao) => {
      const fold = cartao.querySelector('.arena-lesson-fold');
      const estilo = (no) => {
        const s = getComputedStyle(no);
        return { fonte: s.fontSize, peso: Number(s.fontWeight), raio: s.borderRadius, sombra: s.boxShadow === 'none' ? null : 'sombra' };
      };
      return {
        titulo: cartao.querySelector('.arena-lesson-head strong')?.textContent.trim(),
        topoDoCartao: Math.round(cartao.getBoundingClientRect().top),
        alturaDoCartao: Math.round(cartao.getBoundingClientRect().height),
        aberta: fold.open,
        resumo: fold.querySelector('summary').textContent.replace(/\s+/g, ' ').trim(),
        // A enumeração está no DOM desde o primeiro desenho: o que se prova aqui
        // é que ela não está PINTADA enquanto a dobra está fechada.
        mistura: cartao.querySelector('.arena-lesson-mix')?.textContent.replace(/\s+/g, ' ').trim() || null,
        misturaNaTela: (() => { const no = cartao.querySelector('.arena-lesson-mix'); return no ? no.checkVisibility() : null; })(),
        itensNaDobra: cartao.querySelectorAll('.arena-lesson-chips li').length,
        acoes: [...cartao.querySelectorAll('.arena-lesson-actions button')].map((botao) => ({
          rotulo: botao.textContent.trim(), topo: Math.round(botao.getBoundingClientRect().top), ...estilo(botao),
        })),
      };
    }));

    assert.equal(aulas.length, 4, 'as quatro aulas do catálogo');
    for (const aula of aulas) {
      assert.equal(aula.aberta, false, `${aula.titulo}: o professor chega com as aulas fechadas`);
      assert.match(aula.resumo, /^\d+ missões( de .+)?$/, `${aula.titulo}: o resumo fechado diz o tamanho, não a lista — "${aula.resumo}"`);
      assert.ok(aula.misturaNaTela === false || aula.mistura === null,
        `${aula.titulo}: a enumeração das modalidades começa dentro da dobra`);
      assert.ok(aula.itensNaDobra >= 4, `${aula.titulo}: as missões continuam na abertura`);
    }
    // A aula de sete missões é o caso extremo: sete modalidades, uma linha de resumo.
    const sete = aulas.find((aula) => aula.resumo.startsWith('7 '));
    assert.equal(sete.resumo, '7 missões');
    assert.match(sete.mistura, /^1× Precisão · .* · 1× Boss Battle$/, 'a enumeração completa abre com a dobra');

    // As ações da mesma linha começam na mesma altura, mesmo com conteúdos de
    // alturas diferentes (era o caso da Aula 4, 19 px acima das vizinhas).
    const linhas = new Map();
    for (const aula of aulas) {
      const chave = aula.topoDoCartao;
      if (!linhas.has(chave)) linhas.set(chave, []);
      linhas.get(chave).push(...aula.acoes.map((acao) => acao.topo));
    }
    for (const [topo, toposDasAcoes] of linhas) {
      assert.ok(Math.max(...toposDasAcoes) - Math.min(...toposDasAcoes) <= 1,
        `as ações dos cartões da linha em ${topo}px começam na mesma altura: ${toposDasAcoes.join(' · ')}`);
    }

    // A secundária pesa menos que a principal: mesma família de botão do painel
    // (retângulo, texto pequeno) e só a principal com preenchimento e relevo.
    const [principal, secundaria] = aulas[0].acoes;
    assert.equal(principal.rotulo, 'Adicionar a sala');
    assert.equal(secundaria.rotulo, 'So criar no banco');
    assert.equal(principal.raio, secundaria.raio, 'as duas leem a mesma forma');
    assert.equal(principal.fonte, secundaria.fonte);
    assert.ok(secundaria.peso < principal.peso, `a secundária pesa menos: ${secundaria.peso} vs ${principal.peso}`);
    assert.equal(secundaria.sombra, null, 'a secundária não tem relevo');
    assert.ok(principal.sombra, 'a principal é a única com relevo');

    // Um desafio só no banco não estica o cartão pela largura do painel, e a
    // lista longa da aula não encolheu: as missões continuam a um clique.
    const banco = await page.evaluate(() => {
      const lista = document.querySelector('[data-arena-challenge-list]');
      const cartao = lista.querySelector('article');
      return {
        larguraDaGrade: Math.round(lista.getBoundingClientRect().width),
        larguraDoCartao: Math.round(cartao.getBoundingClientRect().width),
      };
    });
    assert.ok(banco.larguraDoCartao < banco.larguraDaGrade * 0.6,
      `o cartão solitário ocupa uma faixa da grade, não o painel inteiro: ${banco.larguraDoCartao}px de ${banco.larguraDaGrade}px`);
    await page.evaluate(() => document.querySelector('[data-arena-lesson-list] .arena-lesson-fold').open = true);
    await page.waitForFunction(() => document.querySelector('[data-arena-lesson-list] .arena-lesson-fold').open);
    assert.ok(await page.evaluate(() => document.querySelector('[data-arena-lesson-list] .arena-lesson-mix').checkVisibility()),
      'aberta a aula, a enumeração das modalidades aparece');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

// O formulário longo do desafio era caixa dentro de caixa: dois grupos com borda
// e, dentro deles, três dobras com a sua própria borda, fundo e raio. Fechadas,
// as dobras viram LINHAS do grupo — o divisor separa, o grupo continua a única
// caixa. E a ação do diálogo fica presa à base da janela: em 1280×720 o
// formulário rolava 1 142px de campos antes de chegar em "Salvar".
test('browser dobra o formulário longo em linhas e mantém a ação e o último campo alcançáveis', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await abrirNavegador();
    const page = await abrirPagina(browser, { viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', 'browser-test-password');
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await clicarAte(page, '[data-arena-new-challenge]',
      () => Boolean(document.querySelector('[data-challenge-form]')),
      { descricao: 'o formulário de novo desafio abrir' });

    const linhas = await page.evaluate(() => {
      const form = document.querySelector('[data-challenge-form]');
      const caixa = (n) => {
        const s = getComputedStyle(n);
        return {
          borda: `${s.borderTopWidth} ${s.borderBottomWidth}`, raio: s.borderRadius,
          fundo: s.backgroundColor, paddingIa: `${s.paddingLeft} ${s.paddingRight}`,
        };
      };
      const barra = form.querySelector('.arena-dialog-actions');
      const mensagem = form.querySelector('[data-challenge-form-message]');
      const corpo = document.querySelector('[data-arena-dialog-body]');
      const botao = barra.querySelector('button[type=submit]');
      const rc = corpo.getBoundingClientRect();
      const rb = botao.getBoundingClientRect();
      return {
        grupos: [...form.querySelectorAll('.arena-form-group')].map((g) => ({
          legenda: g.querySelector(':scope > legend').textContent.trim(),
          caixa: caixa(g),
          dobras: [...g.querySelectorAll('.arena-form-fold')].map(caixa),
        })),
        // A dobra que NÃO é linha de grupo (os ajustes da rodada) segue cartão.
        cartaoSoltou: caixa(form.querySelector('[data-form-fold="rodada"]')),
        mensagemAntesDaBarra: Boolean(mensagem.compareDocumentPosition(barra) & Node.DOCUMENT_POSITION_FOLLOWING),
        barra: {
          posicao: getComputedStyle(barra).position,
          fundo: getComputedStyle(barra).backgroundColor,
          dentroDaJanela: rb.top >= rc.top && rb.bottom <= rc.bottom,
          // A barra cancela as LATERAIS do corpo (para o fundo atravessar o
          // respiro) e deixa a reserva de baixo por conta da margem do corpo: foi
          // o `margin-bottom` negativo que, medido, prendia a barra 32px acima da
          // base e tapava o último campo.
          cancelaAsLateraisDoCorpo: getComputedStyle(barra).marginLeft === `-${getComputedStyle(corpo).paddingLeft}`
            && getComputedStyle(barra).marginBottom === '0px',
        },
      };
    });

    assert.deepEqual(linhas.grupos.map((g) => g.legenda), ['O aluno recebe', 'O juiz avalia']);
    for (const grupo of linhas.grupos) {
      assert.equal(grupo.caixa.borda, '1px 1px', `${grupo.legenda}: o grupo continua sendo a caixa`);
      for (const dobra of grupo.dobras) {
        assert.equal(dobra.borda, '1px 0px', `${grupo.legenda}: a dobra é uma linha, com divisor acima`);
        assert.equal(dobra.fundo, 'rgba(0, 0, 0, 0)', `${grupo.legenda}: sem fundo próprio dentro do grupo`);
        assert.equal(dobra.raio, '0px', `${grupo.legenda}: sem raio próprio dentro do grupo`);
        assert.equal(dobra.paddingIa, '0px 0px', `${grupo.legenda}: o divisor alinha com o grupo`);
      }
    }
    assert.equal(linhas.cartaoSoltou.borda, '1px 1px', 'a dobra fora de grupo (ajustes da rodada) continua cartão');
    assert.equal(linhas.mensagemAntesDaBarra, true, 'a mensagem do formulário fica acima da barra, onde o professor a lê');
    assert.equal(linhas.barra.posicao, 'sticky');
    assert.equal(linhas.barra.dentroDaJanela, true, 'em 1280×720 salvar está na janela antes de rolar qualquer campo');
    assert.equal(linhas.barra.cancelaAsLateraisDoCorpo, true, 'a barra atravessa o respiro lateral sem tirar a reserva de baixo do corpo');

    // Com tudo aberto — o formulário longo de verdade —, o fim da rolagem tem
    // de mostrar o último campo inteiro ACIMA da barra: é o que "reservar
    // espaço" quer dizer, e é o que um rodapé fixo sem reserva quebraria.
    await page.evaluate(() => {
      document.querySelectorAll('[data-challenge-form] details').forEach((d) => { d.open = true; });
    });
    await page.evaluate(() => { document.querySelector('[data-arena-dialog-body]').scrollTop = 99999; });
    await page.waitForFunction(() => document.querySelector('[data-challenge-form] [name="speed_weight"]').checkVisibility());
    const fim = await page.evaluate(() => {
      const form = document.querySelector('[data-challenge-form]');
      const corpo = document.querySelector('[data-arena-dialog-body]');
      const rc = corpo.getBoundingClientRect();
      const barra = form.querySelector('.arena-dialog-actions');
      const rb = barra.getBoundingClientRect();
      const pintado = (n) => n.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
      const ultimo = [...form.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(pintado).pop();
      const ru = ultimo.getBoundingClientRect();
      return {
        rolagem: Math.round(corpo.scrollHeight - corpo.clientHeight),
        ultimo: ultimo.name,
        ultimoNaJanela: [Math.round(ru.top - rc.top), Math.round(ru.bottom - rc.top)],
        barraNaJanela: [Math.round(rb.top - rc.top), Math.round(rb.bottom - rc.top)],
        ultimoInteiro: ru.top >= rc.top - 1 && ru.bottom <= rc.bottom + 1,
        sobreposto: ru.bottom > rb.top + 1,
        // O que sobra abaixo da barra no fim da rolagem é a reserva que o corpo
        // mantém: nada do formulário fica escondido atrás dela.
        reservaAbaixo: Math.round(rc.bottom - rb.bottom),
        margemDoCorpo: Math.round(Number.parseFloat(getComputedStyle(corpo).paddingBottom)),
      };
    });
    assert.ok(fim.rolagem > 600, `o formulário aberto é longo de verdade: ${fim.rolagem}px de rolagem`);
    assert.equal(fim.ultimoInteiro, true, `o último campo (${fim.ultimo}) fica inteiro na janela`);
    assert.equal(fim.sobreposto, false,
      `a barra de salvar não cobre o último campo (${fim.ultimo}: ${fim.ultimoNaJanela.join('→')} na janela; barra ${fim.barraNaJanela.join('→')})`);
    assert.equal(fim.reservaAbaixo, fim.margemDoCorpo,
      `no fim da rolagem a barra deixa a reserva do corpo embaixo de si (${fim.reservaAbaixo}px de ${fim.margemDoCorpo}px)`);
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => { document.querySelector('[data-arena-dialog-body]').scrollTop = 99999; });
    await page.waitForFunction(() => {
      const barra = document.querySelector('.arena-dialog-actions').getBoundingClientRect();
      const corpo = document.querySelector('[data-arena-dialog-body]').getBoundingClientRect();
      return barra.top >= corpo.top - 1 && barra.bottom <= corpo.bottom + 1;
    });
    // No celular o corpo aperta para 20px de margem; a barra acompanha, senão o
    // conteúdo apareceria nas laterais dela enquanto estivesse presa.
    assert.deepEqual(await page.evaluate(() => {
      const barra = document.querySelector('.arena-dialog-actions');
      const corpo = document.querySelector('[data-arena-dialog-body]');
      return {
        margem: getComputedStyle(barra).marginLeft,
        acompanhaOPadding: getComputedStyle(corpo).paddingLeft,
        mesmaLargura: Math.abs(barra.getBoundingClientRect().width - corpo.getBoundingClientRect().width) <= 1,
      };
    }), { margem: '-20px', acompanhaOPadding: '20px', mesmaLargura: true });

    await page.setViewport({ width: 1280, height: 720 });
    await page.evaluate(() => document.querySelector('[data-arena-dialog-close]').click());
    await page.waitForFunction(() => !document.querySelector('[data-arena-dialog]')?.open);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

// O diálogo tem UMA região de rolagem. A lista de missões da nova sala tinha um
// teto de 320px com a própria barra: no celular, o toque ficava preso na lista
// interna e a própria lista some da tela. A dica do modo de jogo também deixou de
// ser uma mensagem de formulário — ela não é erro nem status, é ajuda.
test('browser mantém uma única rolagem no diálogo e a lista de missões inteira na tela', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    for (const titulo of ['Cartaz da feira', 'Post de robótica', 'Convite da mostra', 'Bilhete da reunião', 'Legenda do vídeo', 'Roteiro do podcast']) {
      const response = await fetch(`${base}/api.php?action=arena_save_challenge`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ title: titulo, modality: 'precisao', mission: `Escreva o prompt de ${titulo}.`, reference_text: `Referência de ${titulo}.`, criteria: [{ criterion: 'objetivo', weight: 100 }] }),
      });
      assert.equal(response.status, 200);
    }
    browser = await abrirNavegador();
    const page = await abrirPagina(browser, { viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/admin-arena.php`);
    await page.type('[name=password]', 'browser-test-password');
    await Promise.all([page.waitForNavigation(), page.click('[data-admin-arena-login] button[type=submit]')]);
    await page.waitForSelector('[data-arena-room-list]');
    await clicarAte(page, 'button[onclick="openCreateRoomDialog()"]',
      () => Boolean(document.querySelector('[data-arena-create-room]')),
      { descricao: 'o formulário de nova sala abrir' });

    assert.deepEqual(await page.evaluate(() => {
      const dica = document.querySelector('[data-arena-preset-hint]');
      const sd = getComputedStyle(dica);
      return {
        tag: dica.tagName.toLowerCase(),
        // É ajuda, não mensagem: a classe diz isso e a altura não reserva linha
        // de erro embaixo do campo.
        classes: dica.classList.contains('arena-field-hint') && !dica.classList.contains('form-message'),
        reserva: sd.minHeight,
        margem: sd.marginTop,
        texto: dica.textContent.trim(),
      };
    }), { tag: 'p', classes: true, reserva: 'auto', margem: '8px', texto: 'O clássico para a turma inteira.' });

    await page.select('[data-arena-preset]', 'arena');
    await page.waitForFunction(() => !document.querySelector('[data-arena-room-missions]').hidden);
    const rolagens = await page.evaluate(() => {
      const dialogo = document.querySelector('[data-arena-dialog]');
      const lista = document.querySelector('.arena-room-missions-list');
      return {
        // Quem rola é o corpo do diálogo — e só ele. Uma lista com rolagem
        // própria dentro de um corpo que já rola prende o toque.
        rolam: [...dialogo.querySelectorAll('*')]
          .filter((n) => /auto|scroll/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 2)
          .map((n) => n.tagName.toLowerCase() + (n.dataset.arenaDialogBody !== undefined ? '[data-arena-dialog-body]' : '')),
        overflowDaLista: getComputedStyle(lista).overflowY,
        listaInteira: lista.scrollHeight <= lista.clientHeight + 1,
        opcoes: lista.querySelectorAll('.arena-room-mission-option').length,
        listaMaisAltaQueOTetoAntigo: lista.getBoundingClientRect().height > 320,
      };
    });
    assert.deepEqual(rolagens.rolam, ['div[data-arena-dialog-body]'], 'a única região de rolagem é o corpo do diálogo');
    assert.equal(rolagens.overflowDaLista, 'visible', 'a lista de missões não tem rolagem própria');
    assert.equal(rolagens.listaInteira, true, 'a lista inteira está no fluxo, sem teto de altura');
    assert.equal(rolagens.opcoes, 6);
    assert.equal(rolagens.listaMaisAltaQueOTetoAntigo, true, 'a lista passa dos 320px que antes a cortavam');
    // O que a lista faz continua sendo marcar missões: a contagem acompanha.
    await page.evaluate(() => {
      const caixa = document.querySelector('.arena-room-mission-option input');
      caixa.checked = true;
      caixa.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert.match(await page.$eval('[data-arena-room-missions-count]', (node) => node.textContent), /^1 missão/, 'marcar segue contando');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

// A faixa de ferramentas da TV e a família de botão/foco das duas entradas.
//
// Por que este teste existe: por muito tempo o botão "Tela cheia" ficou sozinho
// numa SEGUNDA linha do cabeçalho da TV. Não era escolha — era a grade: o selo
// LIVE é um pseudo-elemento com coluna fixa, e o botão, auto-colocado, caía na
// linha de baixo. Medido, isso custava 57 dos 126 px do cabeçalho, empurrando o
// palco para baixo em toda projeção. Um retrato de estilo não pega isso (a
// contagem de elementos não muda; a altura do cabeçalho, que é o defeito, sim),
// então a guarda mede a GEOMETRIA: quantas faixas horizontais os filhos da barra
// ocupam e se o botão divide a faixa com a marca.
//
// A segunda metade guarda as duas entradas irmãs: o login do professor ainda
// era a pílula antiga (999 px, 16 px, peso 900) enquanto a entrada do aluno já
// era o retângulo de 10 px/48 px, e os anéis de foco tinham larguras e azuis
// diferentes nas duas telas.
// A votação do Wild Card ocupa a tela sozinha.
//
// Este teste existe por um defeito que passou por três guardas sem ser visto, e
// vale registrar por quê. A tela da aluna pinta a missão OU a votação, e há mais
// de uma guarda vigiando isso — mas todas perguntavam ao ATRIBUTO `hidden`. A
// regra `.arena-mission-panel:has(.arena-mission-empty:not([hidden]))` declara
// `display: flex !important` com especificidade suficiente para vencer os três
// `[hidden]` da cascata, então o painel ficava com o atributo posto E pintado: o
// aluno que abria a página durante a votação via a pergunta, as três opções e,
// logo abaixo, o cartão de espera de meia tela com "Aguarde o professor
// iniciar". O atributo dizia uma coisa; a tela, outra.
//
// Duas consequências para este teste. A primeira: quem responde é
// `checkVisibility()`, que é o que a pessoa vê. A segunda: o caminho importa. O
// defeito aparece na página que CARREGA durante a votação (o cliente desenha o
// estado do zero); numa página que já estava aberta o cartão de espera foi
// escondido antes, na missão, e o defeito não aparece. Por isso aqui a aluna
// entra DEPOIS de a votação abrir.
//
test('a votação do Wild Card ocupa a tela da aluna sozinha, sem o cartão de espera', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({
    repositories, judge: createFakeJudge(),
    arenaJudge: async () => ({ percent: 80, breakdown: { objetivo: 80 }, feedback: 'objetivo claro' }),
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
      const response = await fetch(`${base}/api.php?action=${action}`, {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      assert.equal(response.status, 200, `${action}: ${JSON.stringify(body)}`);
      return body;
    };
    const entrar = async (nome) => {
      const response = await fetch(`${base}/api.php?action=arena_join`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: room.pin || room.code, name: nome }),
      });
      const corpo = await response.json();
      assert.equal(corpo.ok, true, `join ${nome}: ${JSON.stringify(corpo)}`);
      return { id: corpo.participant.id, token: corpo.token };
    };

    await post('arena_set_open', { open: true });
    // Três rodadas porque é a regra do motor: o Wild Card só abre quando o
    // `competitorPlan` tem 3 rodadas ou mais na configuração da partida.
    const { room } = await post('arena_create_room', {
      title: 'Wild Card no navegador', preset: 'arena', expected_players: 8,
      arena_rounds: 3, arena_boss_health: 3, arena_damage_threshold: 60, arena_attacks_per_round: 2,
    });
    // Três missões porque a partida tem três rodadas: com uma só, encerrar a
    // primeira rodada encerra a PARTIDA (a sala vai para `final_results`) e a
    // aluna perde a sessão de jogadora — o cartão de votação abre sem opção
    // nenhuma, como se ela estivesse em campo. O Wild Card abre na rodada 1 e a
    // partida tem de seguir viva para a votação ser votável.
    for (const titulo of ['Post do lançamento', 'Cartaz da feira', 'Convite da mostra']) {
      const { challenge } = await post('arena_save_challenge', {
        title: titulo, modality: 'precisao',
        mission: `Escreva o prompt d${titulo === 'Post do lançamento' ? 'o post de lançamento do clube de robótica' : `a ${titulo.toLowerCase()}`}.`,
        reference_text: 'Com data, local e chamada para ação.',
        criteria: [{ criterion: 'objetivo', weight: 100 }],
      });
      await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    }
    await post('arena_publish_room', { room_id: room.id });

    const turma = [];
    for (const nome of ['Ana', 'Bia', 'Caio', 'Duda', 'Eva', 'Fábio']) turma.push(await entrar(nome));
    await post('arena_start_round', { room_id: room.id });
    const rodada = (await post('arena_room_detail', { room_id: room.id })).detail.rounds.find((entry) => entry.status === 'open');
    for (const [indice, aluno] of turma.entries()) {
      await post('arena_submit', {
        participant_id: aluno.id, token: aluno.token, round_id: rodada.id,
        prompt: `Prompt ${indice + 1}: post com objetivo, contexto, público, formato e uma chamada para ação.`,
      });
    }
    await post('arena_end_round', { room_id: room.id });
    await post('arena_mode_draw', { room_id: room.id, wildcard: true });
    const arena = (await post('arena_room_detail', { room_id: room.id })).detail.arena;
    assert.equal(arena.phase, 'wildcard', `a sala precisa estar no Wild Card (fase ${arena.phase})`);
    assert.equal(arena.wildcard.options.length, 3, 'o Wild Card oferece 3 prompts');
    // Quem está no Wild Card não vota (`voteWildcard` recusa); o votante sai de
    // quem ficou fora — e a regra é do motor, não do teste.
    const dentro = new Set(arena.wildcard.options.map((option) => String(option.participant_id)));
    const votante = turma.find((aluno) => !dentro.has(String(aluno.id)));
    const emCampo = turma.find((aluno) => dentro.has(String(aluno.id)));
    assert.ok(votante && emCampo, 'a turma precisa ter alguém dentro e alguém fora do Wild Card');

    browser = await abrirNavegador();
    const errors = [];
    const abrirAluna = async (aluno) => {
      const pagina = await abrirPagina(browser, { viewport: { width: 390, height: 844 } });
      pagina.on('pageerror', (error) => errors.push(error.message));
      await pagina.goto(`${base}/play`, { waitUntil: 'domcontentloaded' });
      await pagina.evaluate((sessao) => {
        localStorage.setItem('arena.participant_id', String(sessao.id));
        localStorage.setItem('arena.token', sessao.token);
      }, aluno);
      await pagina.goto(`${base}/play`, { waitUntil: 'domcontentloaded' });
      // O cartão de votação, e SÓ ele: quem está em campo recebe o mesmo cartão
      // sem opção nenhuma (a regra diz que quem está em campo não vota), então
      // esperar por opções aqui dentro reprovaria o lado certo da regra.
      await esperarPor(pagina, () => {
        const cartao = document.querySelector('[data-arena-mode-vote]');
        return Boolean(cartao) && cartao.checkVisibility();
      }, { descricao: 'o cartão de votação' });
      return pagina;
    };
    // `checkVisibility` e não o atributo `hidden`: é esta a pergunta do teste.
    const pintado = (pagina, seletor) => pagina.evaluate((sel) => {
      const node = document.querySelector(sel);
      return Boolean(node) && node.checkVisibility();
    }, seletor);

    // --- quem vota ---------------------------------------------------------
    const votantePagina = await abrirAluna(votante);
    await esperarPor(votantePagina, () => document.querySelectorAll('[data-arena-vote-choice]').length === 3, { descricao: 'as três opções do Wild Card' });
    const cartao = await votantePagina.evaluate(() => ({
      pergunta: document.querySelector('[data-arena-vote-question]')?.textContent?.trim(),
      opcoes: document.querySelectorAll('[data-arena-vote-choice]').length,
      status: document.querySelector('[data-arena-vote-status]')?.textContent?.trim(),
    }));
    assert.equal(cartao.pergunta, 'Qual prompt merece entrar na Arena?');
    assert.equal(cartao.opcoes, 3);
    assert.equal(await pintado(votantePagina, '[data-arena-mission-panel]'), false,
      'o painel da missão não pode estar pintado durante a votação');
    assert.equal(await pintado(votantePagina, '[data-arena-mission-empty]'), false,
      'o cartão de espera não pode estar na tela junto das opções de voto');
    assert.equal(await pintado(votantePagina, '[data-arena-mission]'), false,
      'a missão não pode estar na tela junto da votação');
    assert.equal(await pintado(votantePagina, '[data-arena-vote-choice]'), true);
    // O voto sai do clique, e a tela confirma — a votação é usável, não só bonita.
    await votantePagina.click('[data-arena-vote-choice]');
    await esperarPor(votantePagina, () => /Voto registrado/.test(document.querySelector('[data-arena-vote-status]')?.textContent || ''), { descricao: 'a confirmação do voto' });
    const votos = (await post('arena_room_detail', { room_id: room.id })).detail.arena;
    assert.ok(Number(votos.wildcard.votes) >= 1, 'o voto do celular chega no servidor');
    await votantePagina.close();

    // --- quem está em campo não vota ---------------------------------------
    const campoPagina = await abrirAluna(emCampo);
    assert.equal(await pintado(campoPagina, '[data-arena-vote-choice]'), false,
      'quem está no Wild Card não recebe opções de voto');
    assert.equal(await pintado(campoPagina, '[data-arena-mission-empty]'), false,
      'o cartão de espera não pode reaparecer para quem está em campo');
    assert.match(
      await campoPagina.$eval('[data-arena-vote-status]', (no) => no.textContent.trim()),
      /Você está no Wild Card/,
      'a tela de quem está em campo diz por que ele não vota',
    );
    await campoPagina.close();

    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});

test('a faixa da TV cabe numa linha e as duas entradas usam o mesmo botão e o mesmo anel de foco', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const server = createServer(createApplication({ repositories, judge: createFakeJudge(), adminPassword: 'browser-test-password', adminSecret: 'browser-test-secret-at-least-32-characters' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'browser-test-password' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = async (action, payload = {}) => {
      const response = await fetch(`${base}/api.php?action=${action}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body;
    };
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Sala na TV', preset: 'personalizado', expected_players: 4 });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Cartaz da feira', modality: 'precisao', mission: 'Escreva o prompt do cartaz.',
      reference_text: 'Cartaz A3 da feira, com data, local e contato.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });

    browser = await abrirNavegador();
    const errors = [];
    // A janela abre SEM cookie e começa pelas entradas: o cookie é do navegador,
    // não da página, então medir o login depois de autenticar é impossível — o
    // `/admin-arena.php` abre o painel e não o formulário. A ordem do teste é a
    // ordem de quem chega: primeiro as duas portas, depois o painel.
    const page = await abrirPagina(browser, { viewport: { width: 390, height: 844 } });
    page.on('pageerror', (error) => errors.push(error.message));

    const lerEntrada = async (url, campo, botao) => {
      await page.goto(url);
      await esperarPor(page, (alvo) => Boolean(document.querySelector(alvo)), { descricao: `o campo ${campo} em ${url}`, args: campo });
      // O anel só nasce com o TECLADO: `:focus-visible` não casa com foco de
      // script, e é por isso que a leitura de foco programático mentia.
      await page.keyboard.press('Tab');
      return page.evaluate((alvos) => {
        const estiloBotao = (no) => {
          const s = getComputedStyle(no);
          const r = no.getBoundingClientRect();
          return {
            altura: Math.round(r.height), raio: s.borderTopLeftRadius, fonte: s.fontSize, peso: s.fontWeight,
            fundo: s.backgroundImage, sombra: s.boxShadow,
          };
        };
        const ativo = document.activeElement;
        const s = getComputedStyle(ativo);
        return {
          botao: estiloBotao(document.querySelector(alvos.botao)),
          foco: { alvo: `${ativo.tagName.toLowerCase()}[name=${ativo.name}]`, anel: s.boxShadow, borda: s.borderTopColor },
          rotulo: document.querySelector(alvos.botao).textContent.trim(),
        };
      }, { campo, botao });
    };
    const aluno = await lerEntrada(`${base}/play`, '[data-arena-join-form] [name=code]', '[data-arena-join-form] button[type=submit]');
    const professor = await lerEntrada(`${base}/admin-arena.php`, '[data-admin-arena-login] [name=password]', '[data-admin-arena-login] button[type=submit]');

    assert.equal(aluno.foco.alvo, 'input[name=code]', 'o Tab entra no campo do código');
    assert.equal(professor.foco.alvo, 'input[name=password]', 'o Tab entra no campo da senha');
    assert.deepEqual(
      professor.botao, aluno.botao,
      `as duas entradas usam o mesmo botão (aluno ${JSON.stringify(aluno.botao)}, professor ${JSON.stringify(professor.botao)})`,
    );
    assert.equal(professor.foco.anel, aluno.foco.anel, 'o anel de foco é o mesmo nas duas entradas');
    assert.equal(aluno.foco.anel, 'rgba(12, 92, 255, 0.1) 0px 0px 0px 4px', 'o anel é o de todo campo do produto');

    // Agora sim: a sessão do painel e a da TV, para as telas da projeção.
    await page.setCookie({ name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' });
    await page.setViewport({ width: 1920, height: 1080 });

    // Quem lê a barra é a GEOMETRIA: a faixa de cada filho, com 20 px de
    // tolerância, porque marca e botão não ficam alinhados no pixel.
    const lerBarra = () => page.evaluate(() => {
      const barra = document.querySelector('.arena-tv-topbar');
      const rb = barra.getBoundingClientRect();
      const filhos = [...barra.children].map((nó) => ({ classe: String(nó.className).split(' ')[0], caixa: nó.getBoundingClientRect() }));
      const faixas = [];
      for (const filho of filhos) {
        const topo = Math.round(filho.caixa.top - rb.top);
        const faixa = faixas.find((f) => Math.abs(f.topo - topo) < 20);
        if (faixa) faixa.itens.push(filho.classe);
        else faixas.push({ topo, itens: [filho.classe] });
      }
      let sobreposicao = 0;
      for (const a of filhos) for (const b of filhos) {
        if (a === b) continue;
        const h = Math.min(a.caixa.right, b.caixa.right) - Math.max(a.caixa.left, b.caixa.left);
        const v = Math.min(a.caixa.bottom, b.caixa.bottom) - Math.max(a.caixa.top, b.caixa.top);
        if (h > 0 && v > 0) sobreposicao = Math.max(sobreposicao, Math.round(Math.min(h, v)));
      }
      return {
        altura: Math.round(rb.height),
        faixas: faixas.sort((a, b) => a.topo - b.topo).map((f) => f.itens.sort().join('+')),
        sobreposicao,
        topoDoBotao: Math.round(document.querySelector('[data-tv-fullscreen]').getBoundingClientRect().top - rb.top),
        topoDaMarca: Math.round(document.querySelector('.arena-tv-brand').getBoundingClientRect().top - rb.top),
        palco: Math.round(document.querySelector('[data-tv-stage]').getBoundingClientRect().top),
      };
    });

    for (const [largura, altura] of [[1920, 1080], [1280, 720]]) {
      await page.setViewport({ width: largura, height: altura });
      await page.goto(`${base}/tv-preview.php?room=${room.id}`);
      await esperarPor(page, () => Boolean(document.querySelector('.arena-tv-topbar')), { descricao: `a barra da TV em ${largura}px` });
      const barra = await lerBarra();
      assert.equal(barra.faixas.length, 1, `em ${largura}×${altura} a faixa de ferramentas tem de ser UMA linha: ${JSON.stringify(barra.faixas)}`);
      assert.equal(
        barra.topoDoBotao - barra.topoDaMarca < 20,
        true,
        `em ${largura}×${altura} o botão Tela cheia divide a linha com a marca (marca ${barra.topoDaMarca}, botão ${barra.topoDoBotao})`,
      );
      assert.equal(barra.altura <= 80, true, `cabeçalho de ${barra.altura}px em ${largura}×${altura} — era 126`);
      assert.equal(barra.sobreposicao, 0, `nada se sobrepõe na barra em ${largura}×${altura}`);
    }

    // A projeção DE VERDADE: é ela que não tem a barra da prévia no meio, e é
    // nela que "o palco começa onde a barra termina" significa alguma coisa.
    const token = await fetch(`${base}/api.php?action=arena_tv_token`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ room_id: room.id }),
    });
    assert.equal(token.status, 200);
    const cookieTv = token.headers.get('set-cookie').split(';')[0];
    const tv = await abrirPagina(browser, {
      viewport: { width: 1920, height: 1080 },
      cookie: { name: cookieTv.split('=')[0], value: cookieTv.slice(cookieTv.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
    });
    tv.on('pageerror', (error) => errors.push(error.message));
    await tv.goto(`${base}/tv.php?pin=${encodeURIComponent(room.pin || room.code)}`);
    await esperarPor(tv, () => Boolean(document.querySelector('[data-tv-content]')), { descricao: 'a projeção real' });
    const projecao = await tv.evaluate(() => {
      const barra = document.querySelector('.arena-tv-topbar');
      const rb = barra.getBoundingClientRect();
      const filhos = [...barra.children].map((nó) => ({ classe: String(nó.className).split(' ')[0], caixa: nó.getBoundingClientRect() }));
      const faixas = [];
      for (const filho of filhos) {
        const topo = Math.round(filho.caixa.top - rb.top);
        const faixa = faixas.find((f) => Math.abs(f.topo - topo) < 20);
        if (faixa) faixa.itens.push(filho.classe);
        else faixas.push({ topo, itens: [filho.classe] });
      }
      return {
        altura: Math.round(rb.height),
        faixas: faixas.length,
        palco: Math.round(document.querySelector('[data-tv-stage]').getBoundingClientRect().top),
        barraDaPrevia: Boolean(document.querySelector('[data-tv-preview-bar]')),
      };
    });
    await tv.close();
    assert.equal(projecao.barraDaPrevia, false, 'a projeção real não carrega a barra da prévia');
    assert.equal(projecao.faixas, 1, 'a faixa de ferramentas também é única na projeção real');
    assert.equal(projecao.palco, projecao.altura, `o palco começa onde a barra termina (barra ${projecao.altura}, palco ${projecao.palco})`);

    // Estreito: a sala desce para a segunda faixa (regra própria do cabeçalho) e
    // o botão continua na primeira, sem sobreposição.
    await page.setViewport({ width: 640, height: 900 });
    await page.goto(`${base}/tv-preview.php?room=${room.id}`);
    await esperarPor(page, () => Boolean(document.querySelector('.arena-tv-topbar')), { descricao: 'a barra da TV a 640px' });
    const estreita = await lerBarra();
    assert.equal(estreita.faixas.length, 2, `a 640px só a sala muda de faixa: ${JSON.stringify(estreita.faixas)}`);
    assert.match(estreita.faixas[0], /arena-tv-brand\+arena-tv-fullscreen-btn/, 'marca e botão seguem juntos na primeira faixa');
    assert.equal(estreita.sobreposicao, 0);

    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});
