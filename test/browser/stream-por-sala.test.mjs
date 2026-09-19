import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina, clicarAte, esperarPor } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createRoomEventHub } from '../../src/server/events.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

// O que este teste protege, com as PAGINAS de verdade: cada superficie entra no
// stream com a credencial que ja tem — cookie do painel, cookie da projecao,
// sessao do aluno — e cai na sala que esta vendo. O hub e injetado justamente
// para dizer em que sala cada conexao aterrissou: uma conexao sem prova entrar
// no escopo global, e isso reprova aqui.
//
// Nao e um teste de unidade do roteamento (esse mora em test/smoke): e a prova
// de que o cliente manda a credencial certa em cada uma das tres telas.

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('as três superfícies entram no stream na própria sala, e nenhuma entra anônima', { timeout: ESPERA.teste }, async () => {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  await repositories.rooms.createCycle({ id: 'stream-por-sala-game', now: 70_000 });

  // Relogio de reverificacao curto: e o proprio aceite da revogacao que este
  // teste mede, e o produto usa 10 s — esperar o relogio do produto seria medir
  // o cronometro, nao a regra.
  const hub = createRoomEventHub({ revalidateMs: 250 });
  const conexoes = new Set();
  const eventHub = {
    subscribe(request, response, options) {
      conexoes.add(response);
      response.once('close', () => conexoes.delete(response));
      return hub.subscribe(request, response, options);
    },
    broadcast: (action, data) => hub.broadcast(action, data),
    derrubarTodas() { for (const response of [...conexoes]) response.destroy(); },
    naSala: (roomId) => hub.sizeFor(roomId),
    get anonimas() { return hub.globalSize; },
    get total() { return hub.size; },
    get revogadas() { return hub.revoked; },
  };

  const handler = createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
    eventHub,
    adminPassword: 'stream-password',
    adminSecret: 'stream-secret-at-least-32-chars-long',
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Preenchidos no preparo, abaixo: a espera precisa dos ids para explicar a
  // falha quando ela acontece.
  let salaDaAula;
  let salaVizinha;

  async function esperarAte(condicao, descricao, ms = 20_000) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      if (await condicao()) return;
      await dormir(100);
    }
    throw new Error(`espera falhou: ${descricao} (na sala: ${salaDaAula ? eventHub.naSala(salaDaAula.id) : '—'}, anônimas: ${eventHub.anonimas}, total: ${eventHub.total})`);
  }

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
      return { body, setCookie };
    };

    const { body: login } = await post('admin_login', { password: 'stream-password' });
    assert.equal(login.ok, true);
    await post('arena_set_open', { open: true });

    const { challenge } = (await post('arena_save_challenge', {
      title: 'Cartaz da feira',
      modality: 'precisao',
      mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
      criteria: [{ criterion: 'objetivo', weight: 50 }, { criterion: 'contexto', weight: 50 }],
      duration_seconds: 600,
      speed_weight: 'none',
      reference_text: 'Cartaz A3 da feira, com data, local e contato.',
    })).body;

    const criarSala = async (title) => {
      const { body } = await post('arena_create_room', { title });
      await post('arena_add_round', { room_id: body.room.id, challenge_id: challenge.id });
      await post('arena_publish_room', { room_id: body.room.id });
      return body.room;
    };
    salaDaAula = await criarSala('Sala da aula');
    salaVizinha = await criarSala('Sala vizinha');

    browser = await abrirNavegador();

    // 1) Painel do professor: entra pelo formulario (o cookie HttpOnly nasce ali).
    const painel = await abrirPagina(browser, { viewport: { width: 1440, height: 900 } });
    const errosPainel = [];
    painel.on('pageerror', (error) => errosPainel.push(error.message));
    await painel.goto(`${base}/admin-arena.php`);
    await painel.type('[name=password]', 'stream-password');
    await Promise.all([painel.waitForNavigation(), painel.click('[data-admin-arena-login] button[type=submit]')]);
    await painel.waitForSelector('[data-arena-room-list] [data-room-id]');
    await clicarAte(
      painel,
      `[data-room-id="${salaDaAula.id}"] [data-action=detail]`,
      () => Boolean(document.querySelector('[data-arena-detail-body]')?.innerHTML?.trim()),
      { descricao: 'abrir o detalhe da sala da aula' },
    );

    // 2) Tela do aluno, em contexto próprio: o aluno de verdade não carrega o
    //    cookie do painel do professor, e a conexão dele tem de ser autorizada
    //    pela PRÓPRIA sessão — é o que a revogação abaixo exercita.
    const contextoDoAluno = await browser.createBrowserContext();
    const aluno = await abrirPagina(browser, { viewport: { width: 390, height: 844 }, context: contextoDoAluno });
    const errosAluno = [];
    aluno.on('pageerror', (error) => errosAluno.push(error.message));
    await aluno.goto(`${base}/play?pin=${salaDaAula.code}`);
    await aluno.type('[data-arena-join-form] [name=name]', 'Ana');
    await aluno.click('[data-arena-join-form] button[type=submit]');
    await aluno.waitForSelector('[data-arena-screen="lobby"].is-active');

    // 3) Projecao: o cookie de 8h vem do cockpit e e o que autoriza a TV.
    const tvToken = await fetch(`${base}/api.php?action=arena_tv_token`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ room_id: salaDaAula.id }),
    });
    assert.equal(tvToken.status, 200);
    const cookieTv = (tvToken.headers.getSetCookie?.()[0] || tvToken.headers.get('set-cookie') || '').split(';')[0];
    const tv = await abrirPagina(browser, {
      viewport: { width: 1920, height: 1080 },
      cookie: { name: cookieTv.split('=')[0], value: cookieTv.slice(cookieTv.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
    });
    const errosTv = [];
    tv.on('pageerror', (error) => errosTv.push(error.message));
    await tv.goto(`${base}/tv.php?pin=${encodeURIComponent(salaDaAula.pin || salaDaAula.code)}`);
    await esperarPor(tv, () => Boolean(document.querySelector('[data-tv-content]')), { descricao: 'a projecao real' });

    // As tres conexoes na sala que cada tela esta vendo — e nenhuma anonima.
    await esperarAte(() => eventHub.naSala(salaDaAula.id) === 3, 'as três telas entrarem na sala da aula');
    assert.equal(eventHub.anonimas, 0, 'nenhuma tela pode abrir conexão sem prova de sala');
    assert.equal(eventHub.naSala(salaVizinha.id), 0, 'nenhuma tela desta aula segue a sala vizinha');
    assert.equal(eventHub.total, 3, 'exatamente uma conexão por superfície');

    // Reconectar tambem e autorizar de novo: derrubar tudo nao pode deixar
    // nenhuma tela no escopo global.
    eventHub.derrubarTodas();
    await esperarAte(() => eventHub.naSala(salaDaAula.id) === 3, 'as três telas reconectarem na sala da aula');
    assert.equal(eventHub.anonimas, 0, 'a reconexão também precisa provar a sala');

    // E o evento chega: um aluno novo na sala empurra a tela do aluno sem
    // esperar o ciclo do poll.
    await post('arena_join', { code: salaDaAula.code, name: 'Bia' });
    await esperarPor(aluno, () => document.querySelector('[data-arena-connected]')?.textContent === '2', {
      descricao: 'a tela do aluno receber o aluno novo pelo stream',
      timeout: ESPERA.curta,
    });

    // Revogacao: o professor remove a Ana. A sessao dela deixa de render a sala,
    // e a conexao dela tem de ser fechada na reverificacao seguinte — sem levar
    // junto o painel e a TV, que continuam autorizados.
    const ana = (await repositories.arena.participants.listByRoom(salaDaAula.id))
      .find((entry) => entry.name === 'Ana');
    assert.ok(ana, 'o aluno entrou pela tela e tem sessao registrada');
    await post('arena_remove_participant', { room_id: salaDaAula.id, participant_id: ana.id });

    await esperarAte(() => eventHub.revogadas >= 1, 'a conexão do aluno removido ser revogada');
    await esperarAte(() => eventHub.naSala(salaDaAula.id) === 2, 'só a conexão revogada sair da sala');
    // O cliente fechou em vez de reconectar — e a janela abaixo é maior que o
    // `retry: 1000` do EventSource, para que a reconexão tivesse tempo de
    // acontecer e ser vista: sem o fechamento, ela cairia no escopo global.
    await dormir(1500);
    assert.equal(eventHub.anonimas, 0, 'a superfície revogada não reconecta sem prova de sala');
    assert.equal(eventHub.naSala(salaDaAula.id), 2, 'painel e TV seguem na sala, e só eles');

    // E a tela devolve o aluno para a entrada, que e o estado real da sessao.
    await esperarPor(aluno, () => document.querySelector('[data-arena-screen="join"].is-active'), {
      descricao: 'a tela do aluno removido voltar para a entrada',
      timeout: ESPERA.curta,
    });
    assert.equal(hub.sizeFor(salaVizinha.id), 0, 'a sala vizinha segue sem ninguém');

    assert.deepEqual(errosPainel, [], 'o painel não pode ter erro de página');
    assert.deepEqual(errosAluno, [], 'a tela do aluno não pode ter erro de página');
    assert.deepEqual(errosTv, [], 'a TV não pode ter erro de página');
    await tv.close();
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    opened.close();
  }
});
