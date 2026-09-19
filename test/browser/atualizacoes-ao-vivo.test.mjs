import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createRoomEventHub } from '../../src/server/events.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

// O que este teste mede: quantas consultas a tela do aluno faz em cada janela
// de tempo, com o SSE no ar, com o SSE caido, com rajada de eventos e com a aba
// oculta. Nao e uma medida de tempo de tela — e a conta de rede, que so o
// servidor pode fazer com honestidade (uma requisicao pode ser otima e mesmo
// assim serem vinte quando deveria ser uma).
//
// O hub recebido pelo `createApplication` e de proposito: e por ele que o teste
// empurra os eventos e derruba as conexoes, sem depender de sorte de tempo.

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('a sala do aluno nao multiplica consultas: rajada de SSE, sala alheia, aba oculta e queda do stream', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  await repositories.rooms.createCycle({ id: 'live-updates-game', now: 40_000 });

  const hub = createRoomEventHub();
  const clients = new Set();
  let sseBlocked = false;
  const eventHub = {
    subscribe(request, response, options) {
      if (sseBlocked) { response.destroy(); return () => {}; }
      clients.add(response);
      response.once('close', () => clients.delete(response));
      return hub.subscribe(request, response, options);
    },
    broadcast(action, data) { hub.broadcast(action, data); },
    killAll() { for (const response of [...clients]) response.destroy(); },
    get size() { return hub.size; },
    naSala(roomId) { return hub.sizeFor(roomId); },
    get anonimas() { return hub.globalSize; },
  };

  // Contabilidade das consultas de lobby: total e simultaneidade maxima.
  let lobbyCalls = 0;
  let lobbyInFlight = 0;
  let lobbyPeak = 0;
  const handler = createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
    eventHub,
    adminPassword: 'live-updates-password',
    adminSecret: 'live-updates-secret-at-least-32-chars',
  });
  const server = createServer((request, response) => {
    if (String(request.url).includes('action=arena_lobby')) {
      lobbyCalls += 1;
      lobbyInFlight += 1;
      lobbyPeak = Math.max(lobbyPeak, lobbyInFlight);
      response.once('close', () => { lobbyInFlight -= 1; });
    }
    handler(request, response);
  });
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

    await post('admin_login', { password: 'live-updates-password' });
    await post('arena_set_open', { open: true });
    const { room } = await post('arena_create_room', { title: 'Atualizações ao vivo', expected_players: 3 });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Missão',
      modality: 'precisao',
      mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
      criteria: [{ criterion: 'objetivo', weight: 50 }, { criterion: 'contexto', weight: 50 }],
      duration_seconds: 600,
      speed_weight: 'none',
      reference_text: 'Cartaz A3 da feira, com data, local e contato.',
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });

    browser = await abrirNavegador();
    const page = await abrirPagina(browser);
    await page.goto(`${base}/play?pin=${room.code}`);
    await page.type('[data-arena-join-form] [name=name]', 'Ana');
    await page.click('[data-arena-join-form] button[type=submit]');
    await page.waitForSelector('[data-arena-screen="lobby"].is-active');
    // O stream precisa estar de pé para a medida valer.
    await dormir(1200);
    assert.ok(hub.size >= 1, 'a pagina do aluno abriu o EventSource');
    // A conexao da pagina nao e anonima: ela entrou na sala que esta vendo, com
    // a propria sessao (sala + participante + token) na query do stream.
    assert.equal(eventHub.naSala(room.id), 1, 'a conexão do aluno entrou na sala dele');
    assert.equal(eventHub.anonimas, 0, 'a página do aluno não abre conexão sem prova de sala');

    const rajada = (n, roomId = room.id) => {
      for (let i = 0; i < n; i += 1) eventHub.broadcast('arena_submit', { serverNow: 40_000 + i, roomId });
    };
    // Base de referencia de cada janela medida: sem os numeros impressos, um
    // ajuste futuro nao teria contra o que comparar.
    const janelas = [];
    const medir = (nome, antes, janelaMs) => {
      const consultas = lobbyCalls - antes;
      janelas.push({ janela: nome, consultas, janelaMs, picoSimultaneo: lobbyPeak });
      return consultas;
    };

    // 1) Estado estavel: com SSE vivo e leitura recente, o poll nao consulta.
    const estavelAntes = lobbyCalls;
    await dormir(5000);
    const estavel = medir('estavel (sem evento, 5 s)', estavelAntes, 5000);
    assert.ok(estavel <= 1, `estado estavel deveria consultar no maximo 1 vez em 5 s, consultou ${estavel}`);

    // 2) Rajada: 20 eventos nao podem abrir 20 consultas (nem duas ao mesmo tempo).
    const rajadaAntes = lobbyCalls;
    rajada(20);
    await dormir(1500);
    const naRajada = medir('rajada de 20 eventos', rajadaAntes, 1500);
    assert.ok(naRajada >= 1, 'a rajada precisa provocar alguma leitura para o teste valer');
    assert.ok(naRajada <= 3, `20 eventos viraram ${naRajada} consultas — o coalescimento nao esta segurando`);
    assert.equal(lobbyPeak, 1, 'nunca pode haver duas consultas de lobby simultaneas');

    // 3) Evento de outra sala: nao vale consulta. Com o roteamento no servidor
    //    ele nem chega na conexao — que agora e da sala, e nao uma conexao que
    //    recebia tudo para depois descartar.
    await dormir(500);
    const alheiaAntes = lobbyCalls;
    rajada(5, 'sala-de-outro-professor');
    await dormir(1000);
    const naAlheia = medir('evento de outra sala', alheiaAntes, 1000);
    assert.equal(naAlheia, 0, 'evento de outra sala nao pode acordar a consulta');
    assert.equal(eventHub.naSala('sala-de-outro-professor'), 0, 'nenhuma conexão segue a sala alheia');

    // 4) Evento global (abrir/fechar a entrada) continua valendo para todos.
    const globalAntes = lobbyCalls;
    eventHub.broadcast('arena_set_open', { serverNow: 40_100 });
    await dormir(1000);
    const noGlobal = medir('evento global', globalAntes, 1000);
    assert.ok(noGlobal >= 1, 'evento global precisa chegar a tela');

    // 5) Aba oculta: o batimento para; evento continua sendo lido (uma vez).
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Aba oculta: o batimento espaca para um a cada 10 s. A janela de 11 s cobre
    // um intervalo inteiro, com folga para a maquina carregada — com o ritmo de
    // 2,5 s seriam 4 ou 5 consultas aqui.
    const ocultaAntes = lobbyCalls;
    await dormir(11_000);
    const naOcultaParada = medir('aba oculta (sem evento, 11 s)', ocultaAntes, 11_000);
    assert.ok(naOcultaParada <= 2, `aba oculta deveria consultar no maximo 2 vezes em 11 s, consultou ${naOcultaParada}`);
    const ocultaRajadaAntes = lobbyCalls;
    rajada(20);
    await dormir(1500);
    const naOculta = medir('aba oculta + rajada de 20', ocultaRajadaAntes, 1500);
    assert.ok(naOculta <= 3, `aba oculta abriu ${naOculta} consultas para 20 eventos`);
    assert.equal(lobbyPeak, 1, 'simultaneidade continua 1');

    // 6) Ao voltar, uma leitura imediata (sem esperar o proximo ciclo).
    // A base e lida ANTES do disparo: a leitura imediata sai no mesmo instante
    // do evento, e conferir o contador depois do `evaluate` a perderia de vista.
    const voltaAntes = lobbyCalls;
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await dormir(1500);
    const naVolta = medir('volta da aba', voltaAntes, 1500);
    assert.ok(naVolta >= 1, 'voltar para a aba precisa disparar uma leitura imediata');

    // 7) SSE caido: o polling de recuperacao assume e o stream volta depois.
    sseBlocked = true;
    eventHub.killAll();
    await dormir(1000);
    const caidoAntes = lobbyCalls;
    await dormir(6000);
    const naQueda = medir('SSE caido (6 s)', caidoAntes, 6000);
    assert.ok(naQueda >= 2, `com SSE caido o polling deveria consultar (consultou ${naQueda} em 6 s)`);

    sseBlocked = false;
    await dormir(3000);
    assert.ok(hub.size >= 1, 'o EventSource precisa voltar sozinho depois da queda');
    // Reconectar tambem e provar a sala de novo: a credencial viaja na propria
    // URL da reconexao do EventSource.
    assert.equal(eventHub.naSala(room.id), 1, 'a conexão reconectada voltou para a sala do aluno');
    assert.equal(eventHub.anonimas, 0, 'a reconexão não pode ficar no escopo global');
    const reconectadoAntes = lobbyCalls;
    eventHub.broadcast('arena_submit', { serverNow: 40_200, roomId: room.id });
    await dormir(1000);
    const noReconectado = medir('SSE de volta + evento', reconectadoAntes, 1000);
    assert.ok(noReconectado >= 1, 'com o SSE de volta, o evento volta a empurrar a leitura');

    console.log('consultas de lobby por janela:', JSON.stringify(janelas));

    // 8) Digitar durante a atualizacao ao vivo: o texto e o cursor continuam
    //    ali. O render do lobby nao pode ser um `innerHTML` cego do formulario.
    await post('arena_start_round', { room_id: room.id });
    await page.waitForSelector('[data-arena-prompt-form] textarea', { visible: true });
    await page.type('[data-arena-prompt-form] textarea', 'Meu prompt em construcao');
    await page.evaluate(() => document.querySelector('[data-arena-prompt-form] textarea').setSelectionRange(10, 10));
    const bia = await post('arena_join', { code: room.code, name: 'Bia' });
    assert.ok(bia.participant.id);
    await dormir(1500);
    const digitado = await page.evaluate(() => {
      const campo = document.querySelector('[data-arena-prompt-form] textarea');
      return {
        valor: campo.value,
        cursor: campo.selectionStart,
        conectados: document.querySelector('[data-arena-connected]').textContent,
      };
    });
    assert.equal(digitado.valor, 'Meu prompt em construcao', 'o texto digitado nao pode ser perdido pela releitura');
    assert.equal(digitado.cursor, 10, 'o cursor tambem fica onde o aluno deixou');
    assert.equal(digitado.conectados, '2', 'a tela se atualizou de verdade durante a digitacao');
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});
