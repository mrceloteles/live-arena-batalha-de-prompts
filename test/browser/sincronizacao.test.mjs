// A SINCRONIA DAS TELAS: o que o servidor registra e o que cada um le.
//
// Quatro cenarios, todos nacos no mesmo defeito de fundo — a tela acreditando
// num estado que ja passou:
//
//   1. SESSAO VENCIDA: o 401 do painel parava o professor numa tela que nao
//      atualizava mais, sem aviso, e o poll batia a cada 3 s para sempre. A
//      correcao promete que o detalhe CONTINUA na tela (o ultimo estado valido e
//      informacao), que a faixa diz o que houve e que a entrada de novo acontece
//      ali mesmo, sem recarga.
//   2. RECONEXAO DO ALUNO: com o stream caido, o que passou na queda nao pode
//      depender do relogio do poll. Aqui as leituras de lobby sao BLOQUEADAS
//      durante a queda — a unica porta que sobra para o estado novo e a releitura
//      que a reconexao dispara.
//   3. ENVIO CONFIRMADO: recarregar a pagina depois de enviar devolvia "Enviar
//      prompt" para uma resposta que o servidor ja tinha. A promessa e o rotulo
//      "Enviado ✓" preso ao envio, e nao ao formulario.
//   4. CLIQUE DUPLO: entrar, enviar e iniciar a missao executam UMA vez, mesmo
//      com dois cliques — sem resposta duplicada e sem um 409 que o professor
//      nao pediu.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina, clicarAte, esperarPor } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createAdminAuth } from '../../src/server/admin-auth.mjs';
import { createRoomEventHub } from '../../src/server/events.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApplication } from '../../src/server/start.mjs';

const SENHA = 'sincronia-password';
const SEGREDO = 'sincronia-secret-at-least-32-caracteres';
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera uma condição do SERVIDOR (o hub), que a página não pode responder. */
async function esperarNoServidor(condicao, { timeout = 10_000, passo = 100 } = {}) {
  const prazo = Date.now() + timeout;
  while (Date.now() < prazo) {
    if (condicao()) return true;
    await dormir(passo);
  }
  return condicao();
}

/**
 * Servidor de verdade, com banco em memoria e contagem de acoes.
 *
 * `contar` e a lista de acoes que o teste quer contar NO SERVIDOR — e a unica
 * testemunha honesta de "uma requisicao": contar no cliente mediria o que a tela
 * decidiu, nao o que chegou.
 */
async function subir({ opcoes = {}, contar = [] } = {}) {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const handler = createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
    adminPassword: SENHA,
    adminSecret: SEGREDO,
    ...opcoes,
  });
  const contagem = new Map();
  const server = createServer((request, response) => {
    const alvo = /action=([a-z_]+)/.exec(String(request.url || ''));
    if (alvo && contar.includes(alvo[1])) contagem.set(alvo[1], (contagem.get(alvo[1]) || 0) + 1);
    handler(request, response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const cookies = new Map();
  const post = async (action, payload = {}, { esperarOk = true } = {}) => {
    const response = await fetch(`${base}/api.php?action=${action}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookies.has('arena_admin') ? { cookie: `arena_admin=${cookies.get('arena_admin')}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const recebidos = response.headers.getSetCookie?.() || [response.headers.get('set-cookie') || ''];
    for (const bruto of recebidos) {
      const par = /^([^=]+)=([^;]*)/.exec(bruto || '');
      if (par) cookies.set(par[1], par[2]);
    }
    const body = await response.json();
    if (esperarOk) assert.equal(response.ok, true, `${action}: ${JSON.stringify(body)}`);
    return body;
  };

  return {
    opened, repositories, server, base, post,
    pedidos: (acao) => contagem.get(acao) || 0,
    /**
     * Cookie da projecao (a TV so projeta com ele) no formato do Puppeteer.
     *
     * O valor vem do ultimo `arena_tv_token`, entao quem precisa projetar DUAS
     * salas guarda o cookie da primeira antes de pedir o token da segunda.
     */
    cookieDaTv: () => ({ name: 'arena_tv_session', value: cookies.get('arena_tv_session'), domain: '127.0.0.1', path: '/' }),
    async fechar() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      opened.close();
    },
  };
}

/** Sala publicada com UMA missao pronta (o menor caminho ate a rodada viva). */
async function salaComMissao(api, { titulo = 'Sala da sincronia', duracao = 600 } = {}) {
  // Toda acao administrativa viaja com o cookie da sessao (a camada HTTP injeta
  // o token do cookie no payload). Sem entrar, o servidor recusa com 401.
  await api.post('admin_login', { password: SENHA });
  await api.post('arena_set_open', { open: true });
  const { room } = await api.post('arena_create_room', { title: titulo, preset: 'personalizado', expected_players: 8 });
  const { challenge } = await api.post('arena_save_challenge', {
    title: 'Missão 1',
    modality: 'precisao',
    mission: 'Escreva o prompt do cartaz da feira de ciências.',
    criteria: [{ criterion: 'objetivo', weight: 50 }, { criterion: 'contexto', weight: 50 }],
    reference_text: 'Cartaz A3 com data, local e contato.',
    duration_seconds: duracao,
  });
  await api.post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
  await api.post('arena_publish_room', { room_id: room.id });
  // Preset fora do classico nasce sem PIN numerico: o codigo alfabetico e o PIN
  // que o aluno digita (o mesmo `pin || code` que todas as telas leem).
  return { room, challenge };
}

const abrirPainel = async (pagina, api) => {
  await pagina.goto(`${api.base}/admin-arena.php`);
  await pagina.type('[name=password]', SENHA);
  await Promise.all([pagina.waitForNavigation(), pagina.click('[data-admin-arena-login] button[type=submit]')]);
  await pagina.waitForSelector('[data-arena-room-list] [data-room-id]');
};

test('painel: a sessão vencida para o poll, avisa na faixa e preserva o que estava na tela', { timeout: ESPERA.teste }, async () => {
  let relogio = 100_000;
  // O relogio da credencial e do teste: a sessao vence DURANTE a aula, com o
  // painel aberto — que e como ela vence de verdade.
  //
  // O MESMO relogio vale para o servidor (`now`): em producao as duas pontas sao
  // `Date.now()`, e separa-las faz o `Max-Age` do cookie sair de uma conta com
  // outro relogio (medido: sobrava `Max-Age=1`, e o navegador apagava o cookie
  // antes da primeira leitura seguinte — o teste mediria o proprio defeito).
  const auth = createAdminAuth({ password: SENHA, secret: SEGREDO, now: () => relogio, ttlSeconds: 60 });
  const api = await subir({ opcoes: { adminAuth: auth, now: () => relogio }, contar: ['arena_room_detail'] });
  let browser;
  try {
    const { room } = await salaComMissao(api, { titulo: 'Sala da sessão vencida' });
    await api.post('arena_start_round', { room_id: room.id });

    browser = await abrirNavegador();
    const pagina = await abrirPagina(browser, { viewport: { width: 1440, height: 900 } });
    const erros = [];
    pagina.on('pageerror', (erro) => erros.push(erro.message));
    await abrirPainel(pagina, api);
    await clicarAte(
      pagina,
      `[data-room-id="${room.id}"] [data-action=detail]`,
      () => Boolean(document.querySelector('[data-arena-detail]:not([hidden])')),
      { descricao: 'abrir o detalhe da sala' },
    );
    await pagina.evaluate(() => { window.__semRecarga = true; });
    const antes = await pagina.evaluate(() => ({
      codigo: document.querySelector('.arena-detail-pin strong')?.textContent?.trim() || '',
      url: `${location.pathname}${location.search}`,
    }));
    assert.ok(antes.codigo.length >= 4, `o detalhe abriu com o PIN na tela (leu "${antes.codigo}")`);

    // A sessao vence.
    relogio += 120;
    await esperarPor(pagina, () => {
      const faixa = document.querySelector('[data-arena-session-banner]');
      return Boolean(faixa) && !faixa.hidden;
    }, { descricao: 'a faixa da sessão vencida aparecer', timeout: ESPERA.curta });

    const faixa = await pagina.evaluate(() => ({
      texto: document.querySelector('[data-arena-session-text]')?.textContent?.trim() || '',
      reentrar: !document.querySelector('[data-arena-session-retry]')?.hidden,
    }));
    assert.match(faixa.texto, /expirou/i, `a faixa diz a causa (leu "${faixa.texto}")`);
    assert.equal(faixa.reentrar, true, 'a faixa oferece entrar de novo');

    // A tela NAO foi trocada nem recarregada: o ultimo estado valido ficou.
    const depois = await pagina.evaluate(() => ({
      codigo: document.querySelector('.arena-detail-pin strong')?.textContent?.trim() || '',
      url: `${location.pathname}${location.search}`,
      semRecarga: window.__semRecarga === true,
    }));
    assert.equal(depois.url, antes.url, 'o professor continua no painel (nada de redirecionar para o login)');
    assert.equal(depois.semRecarga, true, 'a página não foi recarregada');
    assert.equal(depois.codigo, antes.codigo, 'o detalhe que já estava pintado não é apagado pelo 401');

    // E o poll PARA: era o 401 a cada 3 s, para sempre.
    const paradas = api.pedidos('arena_room_detail');
    await dormir(7000);
    assert.equal(api.pedidos('arena_room_detail'), paradas, 'a consulta de fundo precisa parar depois do 401');

    // Entrar de novo ALI MESMO — e nao numa tela vazia: a pagina autenticada
    // nao tem o cartao de login no DOM, entao o campo da senha mora na faixa.
    await clicarAte(
      pagina,
      '[data-arena-session-retry]',
      () => {
        const formulario = document.querySelector('[data-arena-session-retry-form]');
        return Boolean(formulario) && !formulario.hidden;
      },
      { descricao: 'a faixa abrir a reentrada' },
    );
    const semCartaoDeLogin = await pagina.evaluate(() => !document.querySelector('[data-admin-arena-login-panel]'));
    assert.equal(semCartaoDeLogin, true, 'esta página não tem cartão de login: a reentrada é a da faixa');
    // Visível de verdade (nao so presente no DOM): o portao de estilo pede a
    // prova de que a faixa ganhou um controle, e nao um campo escondido.
    const naTela = await pagina.evaluate(() => {
      const campo = document.querySelector('[data-arena-session-retry-form] input');
      const botao = document.querySelector('[data-arena-session-retry-form] button');
      const caixa = campo?.getBoundingClientRect();
      return {
        campo: Boolean(campo) && campo.offsetParent !== null,
        botao: Boolean(botao) && botao.offsetParent !== null,
        altura: caixa ? Math.round(caixa.height) : 0,
        foco: document.activeElement === campo,
      };
    });
    assert.equal(naTela.campo, true, 'o campo da reentrada aparece na faixa');
    assert.equal(naTela.botao, true, 'com o botão de entrar de novo ao lado');
    assert.ok(naTela.altura >= 28, `o campo tem alvo de toque (${naTela.altura}px)`);
    assert.equal(naTela.foco, true, 'e já nasce com o foco, pronto para digitar');
    await pagina.type('[data-arena-session-retry-form] [name=password]', SENHA);
    await pagina.click('[data-arena-session-retry-form] button[type=submit]');
    await esperarPor(pagina, () => {
      const faixa = document.querySelector('[data-arena-session-banner]');
      const lista = document.querySelector('[data-arena-room-list] [data-room-id]');
      return Boolean(lista) && (!faixa || faixa.hidden);
    }, { descricao: 'o painel voltar com a sessão nova', timeout: ESPERA.curta });

    const voltou = await pagina.evaluate(() => ({
      semRecarga: window.__semRecarga === true,
      conteudo: !document.querySelector('[data-admin-arena-content]')?.hidden,
      url: `${location.pathname}${location.search}`,
    }));
    assert.equal(voltou.semRecarga, true, 'entrar de novo não recarrega a página');
    assert.equal(voltou.conteudo, true, 'e o painel volta a ficar visível');
    assert.equal(voltou.url, antes.url);

    // O acompanhamento volta a andar sozinho.
    const reanimadas = api.pedidos('arena_room_detail');
    await dormir(4000);
    assert.ok(api.pedidos('arena_room_detail') > reanimadas, 'depois de entrar de novo o detalhe volta a ser consultado');
    assert.deepEqual(erros, []);
  } finally {
    await browser?.close();
    await api.fechar();
  }
});

test('aluno: a queda do stream avisa, e a volta busca o que passou sem recarregar a página', { timeout: ESPERA.teste }, async () => {
  const hub = createRoomEventHub();
  // Envelope do hub: o teste derruba as conexoes e tranca as novas, que e o que
  // uma queda de rede faz vista do servidor.
  const clientes = new Set();
  let streamBloqueado = false;
  const eventHub = {
    subscribe(request, response, options) {
      if (streamBloqueado) { response.destroy(); return () => {}; }
      clientes.add(response);
      response.once('close', () => clientes.delete(response));
      return hub.subscribe(request, response, options);
    },
    broadcast: (action, data) => hub.broadcast(action, data),
    derrubar() { for (const response of [...clientes]) response.destroy(); },
    get size() { return hub.size; },
    naSala: (roomId) => hub.sizeFor(roomId),
    get anonimas() { return hub.globalSize; },
  };
  const api = await subir({ opcoes: { eventHub } });
  let browser;
  try {
    const { room } = await salaComMissao(api, { titulo: 'Sala da reconexão' });

    browser = await abrirNavegador();
    const pagina = await abrirPagina(browser);
    const erros = [];
    pagina.on('pageerror', (erro) => erros.push(erro.message));
    await pagina.goto(`${api.base}/play?pin=${room.code}`);
    await pagina.type('[data-arena-join-form] [name=name]', 'Ana');
    await pagina.click('[data-arena-join-form] button[type=submit]');
    await pagina.waitForSelector('[data-arena-screen="lobby"].is-active');
    await api.post('arena_start_round', { room_id: room.id });
    await pagina.waitForSelector('[data-arena-prompt-form] textarea', { visible: true });
    await pagina.evaluate(() => { window.__semRecarga = true; });
    assert.ok(eventHub.naSala(room.id) >= 1, 'a conexão do aluno está na sala dele');

    // A queda: conexoes derrubadas e novas recusadas, e as LEITURAS de lobby
    // bloqueadas — sem isso, o estado novo poderia chegar pelo poll e o teste
    // mediria a sorte do relogio em vez da releitura da reconexao.
    let leiturasBloqueadas = false;
    await pagina.setRequestInterception(true);
    pagina.on('request', (request) => {
      if (leiturasBloqueadas && request.url().includes('action=arena_lobby')) return request.abort();
      return request.continue();
    });
    streamBloqueado = true;
    eventHub.derrubar();
    leiturasBloqueadas = true;
    await esperarPor(pagina, () => {
      const aviso = document.querySelector('[data-arena-offline]');
      return Boolean(aviso) && !aviso.hidden;
    }, { descricao: 'o aviso de reconexão aparecer na queda', timeout: ESPERA.curta });

    // Enquanto ela esta offline, o professor encerra a rodada. Numa sala de
    // missoes (fora do classico) isso tira a missao do ar: a tela de espera
    // volta, e e ela que a recuperacao precisa mostrar.
    await api.post('arena_end_round', { room_id: room.id });
    await dormir(1500);
    const estadoDoSalao = () => ({
      missao: !document.querySelector('[data-arena-mission]')?.hidden,
      espera: !document.querySelector('[data-arena-mission-empty]')?.hidden,
      titulo: document.querySelector('[data-arena-empty-title]')?.textContent?.trim() || '',
    });
    const offline = await pagina.evaluate(estadoDoSalao);
    assert.equal(offline.missao, true, 'sem stream e sem leitura, a tela continua no estado que já tinha');
    assert.equal(offline.espera, false, 'o estado novo ainda não chegou (o teste só vale assim)');

    // A volta: o EventSource reconecta sozinho e a releitura da reconexão é a
    // unica porta que sobrou.
    leiturasBloqueadas = false;
    streamBloqueado = false;
    await esperarPor(pagina, () => {
      const aviso = document.querySelector('[data-arena-offline]');
      return (!aviso || aviso.hidden)
        && document.querySelector('[data-arena-mission]')?.hidden === true
        && /Missão concluída/.test(document.querySelector('[data-arena-empty-title]')?.textContent || '');
    }, { descricao: 'a volta do stream recuperar o estado que passou na queda', timeout: ESPERA.padrao });

    const voltou = await pagina.evaluate(() => ({
      semRecarga: window.__semRecarga === true,
      aviso: document.querySelector('[data-arena-offline]')?.hidden,
      missao: !document.querySelector('[data-arena-mission]')?.hidden,
      espera: !document.querySelector('[data-arena-mission-empty]')?.hidden,
      titulo: document.querySelector('[data-arena-empty-title]')?.textContent?.trim() || '',
    }));
    assert.equal(voltou.semRecarga, true, 'a recuperação não recarrega a página');
    assert.equal(voltou.aviso, true, 'e o aviso de reconexão sai');
    assert.equal(voltou.missao, false, 'a missão saiu do ar na tela');
    // A rodada acabou de encerrar e a batalha segue: a tela do aluno cai no
    // estado entre-rodadas ("Missão concluída"), que é mais específico que a
    // espera genérica do início da batalha.
    assert.match(voltou.titulo, /Missão concluída/, 'e o aluno lê o estado entre rodadas');
    // A conexão do stream sobe com a credencial na URL — quem reconecta prova a
    // sala de novo, e não cai no escopo global (onde não receberia nada dela).
    assert.equal(
      await esperarNoServidor(() => eventHub.naSala(room.id) >= 1),
      true,
      'a conexão voltou provando a mesma sala',
    );
    assert.equal(eventHub.anonimas, 0, 'e não ficou no escopo global');
    assert.deepEqual(erros, []);
  } finally {
    await browser?.close();
    await api.fechar();
  }
});

test('aluno: depois de enviar, recarregar a página não devolve "Enviar prompt"', { timeout: ESPERA.teste }, async () => {
  const api = await subir({ contar: ['arena_submit'] });
  let browser;
  try {
    const { room } = await salaComMissao(api, { titulo: 'Sala do envio confirmado' });

    browser = await abrirNavegador();
    const pagina = await abrirPagina(browser, { viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } });
    const erros = [];
    pagina.on('pageerror', (erro) => erros.push(erro.message));
    await pagina.goto(`${api.base}/play?pin=${room.code}`);
    await pagina.type('[data-arena-join-form] [name=name]', 'Ana');
    await pagina.click('[data-arena-join-form] button[type=submit]');
    await pagina.waitForSelector('[data-arena-screen="lobby"].is-active');
    await api.post('arena_start_round', { room_id: room.id });
    await pagina.waitForSelector('[data-arena-prompt-form] textarea', { visible: true });

    // Cada rotulo que o botao assumir, na ordem: e assim que "Enviando…" pode
    // ser preso sem depender de a requisicao demorar.
    await pagina.evaluate(() => {
      const botao = document.querySelector('[data-arena-send]');
      window.__rotulos = [botao.querySelector('span').textContent.trim()];
      new MutationObserver(() => window.__rotulos.push(botao.querySelector('span').textContent.trim()))
        .observe(botao, { childList: true, characterData: true, subtree: true });
    });
    await pagina.type('[data-arena-prompt-form] textarea', 'Cartaz A3 da feira de ciências, com data, local e contato.');
    await pagina.click('[data-arena-send]');
    await pagina.waitForFunction(() => !document.querySelector('[data-arena-result]')?.hidden);

    const enviado = await pagina.evaluate(() => ({
      rotulos: window.__rotulos,
      estado: document.querySelector('[data-arena-send]')?.dataset?.sendState,
      texto: document.querySelector('[data-arena-send] span')?.textContent?.trim(),
    }));
    assert.ok(enviado.rotulos.includes('Enviando…'), `a tela mostra o envio em andamento (leu ${JSON.stringify(enviado.rotulos)})`);
    assert.equal(enviado.estado, 'confirmado', 'o botão fica preso ao envio');
    assert.equal(enviado.texto, 'Enviado ✓');
    assert.equal(api.pedidos('arena_submit'), 1, 'um envio, uma requisição');

    // A RECARGA: o que a tela mostra tem de vir do servidor, nao da memoria da aba.
    await pagina.reload({ waitUntil: 'domcontentloaded' });
    await pagina.waitForSelector('[data-arena-screen="lobby"].is-active');
    await esperarPor(pagina, () => {
      const botao = document.querySelector('[data-arena-send]');
      return Boolean(botao) && botao.dataset.sendState === 'confirmado';
    }, { descricao: 'o botão voltar já com o envio confirmado', timeout: ESPERA.padrao });

    const recarregada = await pagina.evaluate(() => ({
      texto: document.querySelector('[data-arena-send] span')?.textContent?.trim(),
      estado: document.querySelector('[data-arena-send]')?.dataset?.sendState,
      desabilitado: Boolean(document.querySelector('[data-arena-send]')?.disabled),
      formulario: Boolean(document.querySelector('[data-arena-prompt-form]')?.hidden),
      mensagem: document.querySelector('[data-arena-mission-message]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      nota: document.querySelector('[data-arena-result]')?.hidden === false,
    }));
    assert.equal(recarregada.texto, 'Enviado ✓', 'recarregar não pode devolver "Enviar prompt"');
    assert.equal(recarregada.estado, 'confirmado');
    assert.equal(recarregada.desabilitado, true, 'a tentativa usada não fica reaberta');
    assert.equal(recarregada.formulario, true, 'e o composer sai de cena com o motivo escrito');
    // A mensagem é a do estado "tentativas usadas": diz que o envio chegou e
    // manda aguardar o professor, sem reabrir o composer.
    assert.match(recarregada.mensagem, /Resposta enviada\. Aguarde o professor/);
    assert.equal(recarregada.nota, true, 'a própria pontuação continua na tela depois de recarregar');
    assert.equal(api.pedidos('arena_submit'), 1, 'recarregar não reenvia nada');
    assert.deepEqual(erros, []);
  } finally {
    await browser?.close();
    await api.fechar();
  }
});

test('TV: a queda não apaga a parede, e outro código limpa o palco da sala anterior', { timeout: ESPERA.teste }, async () => {
  const hub = createRoomEventHub();
  const clientes = new Set();
  let streamBloqueado = false;
  const eventHub = {
    subscribe(request, response, options) {
      if (streamBloqueado) { response.destroy(); return () => {}; }
      clientes.add(response);
      response.once('close', () => clientes.delete(response));
      return hub.subscribe(request, response, options);
    },
    broadcast: (action, data) => hub.broadcast(action, data),
    derrubar() { for (const response of [...clientes]) response.destroy(); },
    get size() { return hub.size; },
    naSala: (roomId) => hub.sizeFor(roomId),
  };
  const api = await subir({ opcoes: { eventHub } });
  let browser;
  try {
    const { room: salaA } = await salaComMissao(api, { titulo: 'Sala A da parede' });
    await api.post('arena_start_round', { room_id: salaA.id });
    const { room: salaB } = await salaComMissao(api, { titulo: 'Sala B da parede' });

    await api.post('arena_tv_token', { room_id: salaA.id });
    const cookieA = api.cookieDaTv();
    const tokenB = await api.post('arena_tv_token', { room_id: salaB.id });

    browser = await abrirNavegador();
    const pagina = await abrirPagina(browser, { viewport: { width: 1280, height: 720 }, cookie: cookieA });
    const erros = [];
    pagina.on('pageerror', (erro) => erros.push(erro.message));

    // O que a PAREDE mostra: o nome da sala só conta quando a barra de cima o
    // está exibindo (textContent lê o que está escondido também, e um teste que
    // lê o escondido mede o DOM, não a parede).
    const parede = () => ({
      titulo: document.querySelector('[data-tv-room]')?.hidden
        ? ''
        : (document.querySelector('[data-tv-room-title]')?.textContent?.trim() || ''),
      palco: document.querySelector('[data-tv-content]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      chip: !document.querySelector('[data-tv-reconnect]')?.hidden,
      url: location.search,
    });

    await pagina.goto(`${api.base}/tv.php?pin=${encodeURIComponent(salaA.code)}`);
    await esperarPor(pagina, () => /Sala A da parede/.test(document.querySelector('[data-tv-room-title]')?.textContent || ''),
      { descricao: 'a parede abrir na sala A', timeout: ESPERA.padrao });
    const aberta = await pagina.evaluate(parede);
    assert.ok(aberta.palco.length > 0, 'a sala viva pintou algo no palco');
    assert.equal(aberta.chip, false, 'conexão saudável não mostra chip');
    assert.ok(await esperarNoServidor(() => eventHub.naSala(salaA.id) >= 1), 'a TV se conectou à sala que está projetando');

    // A queda: a parede continua mostrando o último estado válido, com o aviso.
    streamBloqueado = true;
    eventHub.derrubar();
    await esperarPor(pagina, () => {
      const chip = document.querySelector('[data-tv-reconnect]');
      return Boolean(chip) && !chip.hidden;
    }, { descricao: 'o chip de reconexão aparecer', timeout: ESPERA.curta });
    const naQueda = await pagina.evaluate(parede);
    assert.equal(naQueda.titulo, 'Sala A da parede', 'a queda não apaga a sala da parede');
    assert.equal(naQueda.palco, aberta.palco, 'nem o conteúdo: o último estado válido ainda serve');

    // A volta: o chip sai sem ninguém recarregar nada.
    streamBloqueado = false;
    await esperarPor(pagina, () => {
      const chip = document.querySelector('[data-tv-reconnect]');
      return !chip || chip.hidden;
    }, { descricao: 'o chip sair na volta do stream', timeout: ESPERA.padrao });
    assert.equal(await pagina.evaluate(() => window.__semRecarga === undefined), true);

    // A SESSÃO DE PROJEÇÃO MORRE NO MEIO DA AULA (aqui: o professor revoga o
    // token) e o operador digita o código de OUTRA sala. A parede não pode
    // continuar exibindo a sala anterior enquanto isso: ela pede o código, e é
    // a sala B que sobe — sem sobra nenhuma da A.
    await api.repositories.settings.delete(`arena.tv.${salaA.id}`);
    await esperarPor(pagina, () => Boolean(document.querySelector('[data-tv-code-form]')),
      { descricao: 'a parede pedir o código de projeção', timeout: ESPERA.padrao });
    const semSessao = await pagina.evaluate(parede);
    assert.equal(/Sala A/.test(`${semSessao.titulo} ${semSessao.palco}`), false,
      'sem sessão válida, a parede não fica repetindo a sala anterior');

    await pagina.type('[data-tv-code-input]', tokenB.tv_code);
    await pagina.click('[data-tv-code-form] button[type=submit]');
    await esperarPor(pagina, () => /Sala B da parede/.test(document.querySelector('[data-tv-room-title]')?.textContent || ''),
      { descricao: 'a parede subir com a sala B', timeout: ESPERA.padrao });
    const trocada = await pagina.evaluate(parede);
    assert.equal(/Sala A/.test(trocada.titulo), false, 'o nome da sala anterior sai da parede');
    assert.equal(/Sala A/.test(trocada.palco), false, 'e nada do palco dela fica para trás');
    assert.equal(/code=/.test(trocada.url), false, 'o código curto não fica na URL');
    assert.equal(await esperarNoServidor(() => eventHub.naSala(salaB.id) >= 1), true,
      'a conexão da parede passou a ser da sala B');
    assert.deepEqual(erros, []);
  } finally {
    await browser?.close();
    await api.fechar();
  }
});

test('cliques duplos: um aluno, um envio e uma missão iniciada', { timeout: ESPERA.teste }, async () => {
  const api = await subir({ contar: ['arena_join', 'arena_submit', 'arena_start_round'] });
  let browser;
  try {
    const { room } = await salaComMissao(api, { titulo: 'Sala do clique duplo' });

    browser = await abrirNavegador();
    const aluno = await abrirPagina(browser);
    const erros = [];
    aluno.on('pageerror', (erro) => erros.push(erro.message));
    await aluno.goto(`${api.base}/play?pin=${room.code}`);
    await aluno.type('[data-arena-join-form] [name=name]', 'Ana');
    // Dois cliques no mesmo instante: o segundo chega com o botao ja desabilitado.
    await aluno.evaluate(() => {
      const botao = document.querySelector('[data-arena-join-form] button[type=submit]');
      botao.click();
      botao.click();
    });
    await aluno.waitForSelector('[data-arena-screen="lobby"].is-active');
    assert.equal(api.pedidos('arena_join'), 1, 'clique duplo em Entrar não cria dois pedidos');
    const participantes = (await api.post('arena_room_detail', { room_id: room.id })).detail.participants;
    assert.equal(participantes.length, 1, `um aluno, uma linha (leu ${participantes.length})`);

    // O professor inicia a missao com DOIS cliques no botao da acao da vez: a
    // segunda acao nao pode virar um 409 na cara dele. O botao mora no PALCO DA
    // PARTIDA da SALA EM DESTAQUE (a lista seleciona, o destaque comanda), entao
    // o caminho comeca escolhendo a sala — que e o que o professor faz.
    const painel = await abrirPagina(browser, { viewport: { width: 1440, height: 900 } });
    painel.on('pageerror', (erro) => erros.push(erro.message));
    const alertas = [];
    painel.on('dialog', async (dialog) => { alertas.push(dialog.message()); await dialog.dismiss(); });
    await abrirPainel(painel, api);
    await clicarAte(
      painel,
      `[data-room-id="${room.id}"] [data-action=detail]`,
      () => Boolean(document.querySelector('[data-arena-detail] [data-action=start]')),
      { descricao: 'abrir a sala em destaque para iniciar a missão' },
    );
    await painel.evaluate(() => {
      const botao = document.querySelector('[data-arena-detail] [data-action=start]');
      botao.click();
      botao.click();
    });
    await esperarPor(painel, () => {
      const detalhe = document.querySelector('[data-arena-room-list] [data-room-id]');
      return Boolean(detalhe);
    }, { descricao: 'a lista de salas se redesenhar', timeout: ESPERA.curta });
    await dormir(1500);
    assert.equal(api.pedidos('arena_start_round'), 1, 'clique duplo em Iniciar missão não inicia duas vezes');
    assert.deepEqual(alertas, [], `nenhum alerta que o professor não pediu (leu ${JSON.stringify(alertas)})`);

    // E o envio: um clique duplo manda UMA resposta.
    await aluno.waitForSelector('[data-arena-prompt-form] textarea', { visible: true });
    await aluno.type('[data-arena-prompt-form] textarea', 'Cartaz A3 da feira de ciências, com data, local e contato.');
    await aluno.evaluate(() => {
      const botao = document.querySelector('[data-arena-send]');
      botao.click();
      botao.click();
    });
    await aluno.waitForFunction(() => !document.querySelector('[data-arena-result]')?.hidden);
    assert.equal(api.pedidos('arena_submit'), 1, 'clique duplo em Enviar não cria duas respostas');
    const rodada = (await api.post('arena_room_detail', { room_id: room.id })).detail.rounds[0];
    assert.equal(Number(rodada.submitted), 1, 'no banco, uma submissão');
    assert.deepEqual(erros, []);
  } finally {
    await browser?.close();
    await api.fechar();
  }
});
