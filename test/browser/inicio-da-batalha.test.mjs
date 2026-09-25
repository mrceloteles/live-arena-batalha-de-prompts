// O CLIQUE QUE TROCA AS TRÊS TELAS.
//
// A frente anterior fechou "Abrir sala": a sala passa a receber alunos e o telão
// entra junto. O passo seguinte do plano é o outro clique — "Iniciar batalha" —,
// e o que uma aula real cobra dele não é que o servidor abra a rodada (isso o
// portão de API já sabe), é que as TRÊS superfícies entrem na rodada pela mesma
// versão: o professor vê a missão no ar, a parede troca o lobby pela missão com
// o tempo correndo, e o aluno recebe o formulário.
//
// Nenhuma das três checagens sozinha prova isso. O telão podia continuar no
// lobby (o defeito que se viu em aula: a sala começava e a projeção seguia
// mostrando o código), o aluno podia continuar esperando o professor, e o painel
// podia abrir a rodada sem anunciar a ação da vez. Aqui as três são medidas no
// MESMO clique, com o aluno entrando pelo formulário de verdade e o telão sendo
// a projeção real de uma sessão própria (`arena_tv_token`).
//
// Também entra no portão a regra que o plano põe primeiro em "Iniciar batalha":
// cliques duplicados não abrem duas rodadas.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina, clicarAte, esperarPor } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

const SENHA = 'inicio-batalha-password';

/** O código como a tela escreve: 246723 -> "246 723". */
const codigoNaTela = (sala) => String(sala.pin || sala.code).replace(/^(\d{3})(\d{3})$/, '$1 $2');

test('"Iniciar batalha" muda as três telas no mesmo clique', { timeout: ESPERA.teste }, async () => {
  const aberto = openDatabase(':memory:');
  await aberto.migrate();
  const repositories = createRepositories(aberto.database);
  const servidor = createServer(createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
    adminPassword: SENHA,
    adminSecret: 'inicio-batalha-secret-at-least-32-chars',
  }));
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  let navegador;
  try {
    let cookie = '';
    const post = async (acao, carga = {}) => {
      const resposta = await fetch(`${base}/api.php?action=${acao}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(carga),
      });
      const set = resposta.headers.getSetCookie?.()[0] || resposta.headers.get('set-cookie') || '';
      const achado = /arena_admin=([^;]+)/.exec(set);
      if (achado) cookie = `arena_admin=${achado[1]}`;
      const corpo = await resposta.json();
      assert.equal(resposta.status, 200, `${acao}: ${JSON.stringify(corpo)}`);
      return corpo;
    };

    await post('admin_login', { password: SENHA });
    await post('arena_set_open', { open: true });

    // Sala pronta para abrir, com dois lugares: a turma fica COMPLETA com dois
    // alunos, e é essa a condição que o telão anuncia antes do clique.
    const { room } = await post('arena_create_room', {
      title: 'Aula que começa no clique', preset: 'personalizado', expected_players: 2,
    });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Cartaz da feira', modality: 'refinamento', attempts: 2, duration_seconds: 300,
      mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
      reference_text: 'Cartaz A3 da feira, com data, local e contato.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });

    // A sessão de projeção sai no Set-Cookie, não no corpo: o telão tem sessão
    // própria e não depende da senha do professor.
    const respostaTv = await fetch(`${base}/api.php?action=arena_tv_token`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ room_id: room.id }),
    });
    assert.equal(respostaTv.status, 200);
    const sessaoTv = respostaTv.headers.get('set-cookie').split(';')[0];

    navegador = await abrirNavegador();
    const contextoDoProfessor = await navegador.createBrowserContext();
    const contextoDaAluna = await navegador.createBrowserContext();
    const contextoDoAluno = await navegador.createBrowserContext();
    const painel = await abrirPagina(navegador, { viewport: { width: 1440, height: 960 }, context: contextoDoProfessor });
    const aluna = await abrirPagina(navegador, { viewport: { width: 390, height: 844 }, context: contextoDaAluna });
    const aluno = await abrirPagina(navegador, { viewport: { width: 390, height: 844 }, context: contextoDoAluno });
    const telao = await abrirPagina(navegador, {
      viewport: { width: 1920, height: 1080 },
      cookie: { name: sessaoTv.split('=')[0], value: sessaoTv.slice(sessaoTv.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
    });
    const erros = [];
    painel.on('pageerror', (erro) => erros.push(erro.message));

    // ---- o LOBBY: dois alunos entram pelo formulário, e a parede os mostra
    await entrarNaSala(aluna, `${base}/play?pin=${room.code}`, 'Ana');
    await entrarNaSala(aluno, `${base}/play?pin=${room.code}`, 'Bia');
    await telao.goto(`${base}/tv.php?pin=${room.code}`);
    await telao.waitForSelector('.arena-tv-pin strong');

    assert.equal(
      await telao.$eval('.arena-tv-pin strong', (no) => no.textContent.trim()),
      codigoNaTela(room),
      'a parede mostra o mesmo código do painel',
    );
    assert.equal(
      await telao.$eval('.arena-tv-join-qr', (no) => Boolean(no.getAttribute('src'))),
      true,
      'com o QR da entrada',
    );

    // A parede é do coletivo: nenhum controle administrativo mora nela.
    assert.deepEqual(
      await telao.$$eval('[data-action]', (nos) => nos.map((no) => no.dataset.action)),
      [],
      'o telão não carrega controle de professor',
    );

    // Antes do clique do professor, a missão NÃO está em lugar nenhum: o aluno
    // espera, e a parede anuncia a turma pronta — e só isso.
    for (const pagina of [aluna, aluno]) {
      await pagina.waitForSelector('[data-arena-screen="lobby"].is-active');
      assert.equal(
        await pagina.$eval('[data-arena-empty-title]', (no) => no.textContent.trim()),
        'Aguarde o professor iniciar',
        'o aluno sabe que a vez é do professor',
      );
      assert.equal(await visivel(pagina, '[data-arena-prompt-form] textarea'), false, 'e não tem missão para responder ainda');
    }
    await esperarPor(telao, () => document.querySelector('.arena-tv-waiting')?.classList.contains('is-ready'), {
      descricao: 'a parede anunciar a turma pronta quando o último aluno entrar',
    });
    assert.match(
      await telao.$eval('.arena-tv-waiting', (no) => no.textContent.trim()),
      /^Todos estão prontos/,
      'e dizer o que aconteceu, não só mudar de cor',
    );
    assert.deepEqual(
      await telao.$$eval('.arena-tv-roster li:not(.arena-tv-empty-li)', (itens) => itens.map((no) => no.textContent.trim())),
      ['Ana', 'Bia'],
      'com os nomes de quem chegou',
    );

    // ---- o PAINEL, pronto para começar: a faixa aponta o botão do início
    await painel.goto(`${base}/admin-arena.php`);
    await painel.type('[name=password]', SENHA);
    await Promise.all([
      painel.waitForNavigation(),
      painel.click('[data-admin-arena-login] button[type=submit]'),
    ]);
    await painel.waitForSelector('[data-arena-room-list] [data-room-id]');
    await clicarAte(
      painel,
      `[data-room-id="${room.id}"] [data-action=detail]`,
      () => document.querySelector('[data-arena-detail-state]')?.textContent === 'Pronta para começar',
      { descricao: 'abrir o detalhe da sala com a turma completa' },
    );
    const antes = await lerFaixa(painel);
    // A linha de números diz a turma ("2 participantes"); a conta dos lugares —
    // quantos cabem — vive na cabeça da partida, e as duas são conferidas.
    assert.equal(antes['is-alunos'], '2', 'a faixa conta a turma inteira dentro');
    assert.match(
      await painel.$eval('.arena-match-places', (no) => no.textContent.replace(/\s+/g, ' ').trim()),
      /2 lugares usados · 0 disponíveis/,
      'e a sala está cheia: os dois lugares preenchidos',
    );
    // A sala é do preset Personalizado, e o produto chama o clique de "Iniciar
    // missão" fora do Clássico — o rótulo é o do botão que a faixa aponta, não
    // uma frase escrita aqui.
    assert.equal(antes['is-proxima'], 'Iniciar missão', 'a faixa diz qual é a ação da vez');
    const apontado = await painel.evaluate(() => {
      const botao = document.querySelector('[data-arena-detail] [data-proximo]');
      return {
        acao: botao?.dataset.action ?? '',
        desabilitado: Boolean(botao?.disabled),
        texto: botao?.textContent?.trim() ?? '',
      };
    });
    assert.equal(apontado.acao, 'start', 'e é o botão de iniciar que carrega o peso de primário');
    assert.equal(apontado.desabilitado, false, 'habilitado, com a turma completa');
    assert.match(apontado.texto, /Iniciar missão/);

    // ---- O CLIQUE. Dois cliques no mesmo quadro: o botão se desabilita no
    //      primeiro e o servidor recebe um pedido só — a regra que o plano põe
    //      antes de tudo no início da batalha.
    await painel.evaluate(() => {
      const botao = document.querySelector('[data-arena-detail] [data-proximo]');
      botao.click();
      botao.click();
    });
    await painel.waitForSelector('[data-arena-detail] [data-action=end-round]');

    const rodadas = await repositories.arena.rounds.listByRoom(room.id);
    assert.equal(rodadas.length, 1, 'o clique duplo não abriu uma segunda rodada');
    assert.equal(rodadas.filter((rodada) => rodada.status === 'open').length, 1, 'e há uma rodada aberta, não duas');
    assert.equal(rodadas[0].position, 1, 'que é a primeira da batalha');

    // 1) O PAINEL: a missão no ar e a ação da vez já é acompanhar.
    const depois = await lerFaixa(painel);
    assert.match(depois['is-estado'], /Missão 1 de 1/, 'a faixa diz qual missão está no ar');
    assert.equal(depois['is-proxima'], 'Acompanhar os envios', 'e qual é a ação do professor agora');
    assert.equal(
      await painel.$$eval('[data-arena-detail] [data-proximo]', (nos) => nos.length),
      0,
      'com a turma escrevendo, a ação é esperar — nenhum botão ganha o peso de primário',
    );

    // 2) A PAREDE: saiu do lobby e entrou na missão, com o tempo correndo.
    await telao.waitForSelector('.arena-tv-round-badge');
    assert.equal(
      await telao.$eval('.arena-tv-round-badge', (no) => no.textContent.trim()),
      'MISSÃO 01/01',
      'o telão anuncia a missão que começou',
    );
    const cronometro = await telao.$eval('.arena-tv-timer', (no) => ({
      texto: no.textContent.trim(),
      classes: no.className,
    }));
    assert.match(cronometro.texto, /^\d+:\d{2}$/, 'com o tempo restante em números');
    assert.equal(
      /is-paused|is-untimed/.test(cronometro.classes),
      false,
      'e nem no tom de pausa nem no de missão sem limite: o relógio está andando',
    );
    assert.match(
      await telao.$eval('.arena-tv-progress', (no) => no.textContent.replace(/\s+/g, ' ').trim()),
      /^0 de 2 prompts recebidos$/,
      'com o placar coletivo da missão zerado',
    );
    assert.deepEqual(
      await telao.$$eval('[data-action]', (nos) => nos.map((no) => no.dataset.action)),
      [],
      'e continua sem controle de professor depois do início',
    );

    // 3) OS ALUNOS: os dois recebem o formulário da rodada, sem recarregar nada.
    for (const pagina of [aluna, aluno]) {
      await pagina.waitForSelector('[data-arena-prompt-form] textarea', { visible: true });
      assert.match(
        await pagina.$eval('[data-arena-round-count]', (no) => no.textContent.trim()),
        /1\b/,
        'a missão que chegou é a primeira',
      );
    }

    assert.deepEqual(erros, [], 'nenhum erro de página no fluxo de início');
  } finally {
    await navegador?.close();
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
    aberto.close();
  }
});

/** A faixa de estado, célula por célula: `is-estado` -> o texto que ela diz. */
async function lerFaixa(pagina) {
  return pagina.$$eval('.arena-state-cell', (celulas) => Object.fromEntries(celulas.map((celula) => {
    const classe = [...celula.classList].find((nome) => nome.startsWith('is-'));
    return [classe, celula.querySelector('b')?.textContent?.trim() ?? ''];
  })));
}

/** O nó existe E ocupa área na tela (quem mede é o retângulo, não a existência). */
function visivel(pagina, seletor) {
  return pagina.evaluate((alvo) => {
    const no = document.querySelector(alvo);
    if (!no) return false;
    const area = no.getBoundingClientRect();
    return area.width > 0 && area.height > 0;
  }, seletor);
}

/** Entrar na sala pelo formulário do aluno (o código já vem na URL). */
async function entrarNaSala(pagina, url, nome) {
  await pagina.goto(url);
  await pagina.type('[data-arena-join-form] [name=name]', nome);
  await pagina.click('[data-arena-join-form] button[type=submit]');
}
