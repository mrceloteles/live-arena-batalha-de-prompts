// A LISTA SELECIONA, A SALA EM DESTAQUE COMANDA.
//
// Por que isto vira portão: cada frente do painel somou o seu controle à LINHA
// DA LISTA, e a linha chegou a seis botões (ver, abrir, iniciar, encerrar,
// arquivar, excluir), cinco selos e dois números — o painel de controle inteiro
// repetido por sala, tudo com o mesmo peso. O defeito não é um botão quebrado: é
// o professor tendo de decidir o que olhar antes de decidir o que fazer. A régua
// que separa "lista" de "painel de controle" não mora em nenhum arquivo sozinho:
// ela está no que a LINHA tem, no que o CABEÇALHO comanda e em como as duas
// metades conversam — e é isso que se mede aqui, com o navegador.
//
// O que este portão cobra:
//
//   1. A linha da lista tem UM controle (o de selecionar) e nada mais: sem
//      botão de abrir, iniciar, encerrar, arquivar, excluir. O que não muda de
//      sala para sala — estado e quem está online — fica.
//   2. Clicar em QUALQUER ponto da linha seleciona a sala: o cartão inteiro é o
//      alvo, e o detalhe passa a ser o daquela sala. Antes, o clique fora do
//      botão não fazia nada.
//   3. O cabeçalho comanda: UM botão primário — o da ação da vez, no palco da
//      partida — e os controles administrativos na coluna de acesso (editar,
//      bloquear, excluir) e no fim da linha de comando (encerrar, arquivar),
//      não soltos pela tela.
//   4. O controle de editar é de verdade, não desenho: clicar em "Editar" abre o
//      diálogo daquela sala.
//   5. A sala em destaque continua com o MESMO estado da lista quando a sala
//      abre pelo botão do cabeçalho (a lista se redescreve sozinha, sem recarga).
//   6. Em cinco larguras — 1440, 1280, 1024, 768 e 390 — nada rola para o lado,
//      a ação da vez e todos os comandos da linha continuam dentro da tela.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina, clicarAte, esperarPor } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createRoomEventHub } from '../../src/server/events.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

const SENHA = 'sala-em-destaque-password';
const TITULO = 'Aula do centro de comando';

/**
 * A lista como o professor a lê: por linha, o título, o estado, quem está online
 * e — o que este portão existe para medir — QUANTOS controles a linha carrega, e
 * quais são.
 */
const lerLista = (pagina) => pagina.evaluate(() => {
  const linhas = [...document.querySelectorAll('[data-arena-room-list] [data-room-id]')];
  return linhas.map((linha) => ({
    titulo: linha.querySelector('.arena-room-pick-title')?.textContent?.trim() ?? linha.textContent.trim(),
    estado: linha.querySelector('.arena-status-badge')?.textContent?.trim() ?? '',
    online: linha.querySelector('.arena-room-pick-online')?.textContent?.trim() ?? '',
    selecionada: linha.classList.contains('is-selected'),
    controles: [...linha.querySelectorAll('button, a[data-action], summary')].map((no) => no.dataset.action || 'summary'),
  }));
});

/**
 * O cabeçalho de comando: a ação da vez (a única marcada), o que está solto na
 * linha, o que está atrás do ••• — e se a faixa de estado vive no CABEÇALHO.
 */
const lerComando = (pagina) => pagina.evaluate(() => {
  const cabecalho = document.querySelector('[data-arena-detail-head]');
  const linha = cabecalho?.querySelector('.arena-detail-command');
  // O CICLO DE VIDA herda o papel do •••: encerrar a sala e arquivar moram no fim
  // da linha de comando, e a gestão da sala (editar, bloquear, excluir) ficou
  // visível na coluna de acesso. O menu antigo não existe mais — esta leitura
  // continua perguntando o mesmo: que CONTROLES DE FIM DE AULA estão soltos.
  const ciclo = linha?.querySelector('[data-arena-room-danger]');
  // A AÇÃO DA VEZ mora no cartão da partida, não no corpo do detalhe; os dois
  // estão debaixo da casca `[data-arena-detail]`.
  const daVez = [...document.querySelectorAll('[data-arena-detail] [data-proximo]')];
  const limpar = (texto) => (texto || '').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return {
    // A faixa de estado tem de estar DENTRO da casca do cabeçalho (é ela que
    // carrega o selo, o título e os números) e VIVA — uma faixa vazia no lugar
    // certo não é a faixa: é o mesmo que não tê-la.
    faixaNoCabecalho: Boolean(
      document.querySelector('.arena-detail-head-bar [data-arena-state-bar] .arena-state-cell'),
    ),
    faixaCelulas: document.querySelectorAll('.arena-detail-head-bar [data-arena-state-bar] .arena-state-cell').length,
    primario: daVez.map((no) => no.dataset.action),
    primarioTexto: daVez.map((no) => limpar(no.textContent)),
    // A AÇÃO DA VEZ mora no PALCO DA PARTIDA (o cartão da rodada), e não na linha
    // de comando: a linha ficou com os controles do MEIO da aula (pausar,
    // encerrar, fechar o placar), com as portas de inspeção e com o ciclo de vida.
    // A primária é uma só, e ela fica onde a decisão acontece.
    primarioNoPalco: daVez.every((no) => Boolean(document.querySelector('.arena-match-stage')?.contains(no))),
    soltos: [...(linha ? linha.querySelectorAll('button[data-action], a[data-action], summary') : [])]
      .filter((no) => !no.hasAttribute('data-proximo'))
      .filter((no) => !ciclo || !ciclo.contains(no))
      .map((no) => no.dataset.action || no.tagName.toLowerCase()),
    // O ciclo de vida tem leitura própria: ele é o que o ••• guardava, agora com
    // um só lugar e sempre à vista.
    cicloDeVida: ciclo ? [...ciclo.querySelectorAll('[data-action]')].map((no) => no.dataset.action) : [],
    gerenciamento: [...document.querySelectorAll('.arena-room-management [data-action]')].map((no) => ({
      acao: no.dataset.action,
      desabilitado: no.disabled,
    })),
    proximaCelula: document.querySelector('.arena-state-cell.is-proxima b')?.textContent?.trim() ?? '',
    estado: document.querySelector('[data-arena-detail-state]')?.textContent ?? '',
    titulo: document.querySelector('[data-arena-detail-title]')?.textContent ?? '',
  };
});

test('a lista seleciona e o cabeçalho comanda: um primário e gestão visível', { timeout: ESPERA.teste }, async () => {
  const aberto = openDatabase(':memory:');
  await aberto.migrate();
  const repositories = createRepositories(aberto.database);
  const servidor = createServer(createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
    eventHub: createRoomEventHub(),
    adminPassword: SENHA,
    adminSecret: 'sala-em-destaque-secret-at-least-32-chars',
  }));
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  let navegador;
  try {
    let cookie = '';
    const post = async (action, payload = {}) => {
      const resposta = await fetch(`${base}/api.php?action=${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(payload),
      });
      const set = resposta.headers.getSetCookie?.()[0] || resposta.headers.get('set-cookie') || '';
      const achado = /arena_admin=([^;]+)/.exec(set);
      if (achado) cookie = `arena_admin=${achado[1]}`;
      const corpo = await resposta.json();
      assert.equal(resposta.status, 200, `${action}: ${JSON.stringify(corpo)}`);
      return corpo;
    };

    await post('admin_login', { password: SENHA });
    await post('arena_set_open', { open: true });
    const { challenge } = await post('arena_save_challenge', {
      title: 'Cartaz da feira',
      modality: 'precisao',
      mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
      reference_text: 'Cartaz A3 da feira, com data, local e contato.',
    });
    // Duas salas: a que o teste conduz (em RASCUNHO — o estado que tem "Abrir
    // sala" como ação da vez) e uma segunda, para a lista ter mais de uma linha
    // e a seleção significar alguma coisa.
    const { room } = await post('arena_create_room', {
      title: TITULO, preset: 'personalizado', expected_players: 2,
    });
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    const { room: outra } = await post('arena_create_room', {
      title: 'Aula vizinha', preset: 'personalizado', expected_players: 4,
    });
    await post('arena_add_round', { room_id: outra.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: outra.id });
    await post('arena_join', { code: outra.code, name: 'Aluno da vizinha' });

    navegador = await abrirNavegador();
    const painel = await abrirPagina(navegador, { viewport: { width: 1440, height: 900 } });
    const erros = [];
    painel.on('pageerror', (erro) => erros.push(erro.message));

    await painel.goto(`${base}/admin-arena.php`);
    await painel.type('[name=password]', SENHA);
    await Promise.all([
      painel.waitForNavigation(),
      painel.click('[data-admin-arena-login] button[type=submit]'),
    ]);
    await painel.waitForSelector('[data-arena-room-list] [data-room-id]');

    // 1) A LINHA TEM UM CONTROLE. Seis botões com o mesmo peso era o defeito; o
    //    que a linha guarda é o que muda de sala para sala — estado e online.
    const lista = await lerLista(painel);
    assert.equal(lista.length, 2, 'as duas salas do teste estão na lista');
    for (const linha of lista) {
      assert.deepEqual(
        linha.controles,
        ['detail'],
        `a linha de "${linha.titulo}" carrega UM controle (o de selecionar): leu ${JSON.stringify(linha.controles)}`,
      );
      assert.notEqual(linha.estado, '', `a linha de "${linha.titulo}" diz em que pé a sala está`);
      assert.match(linha.online, /^\d+ online$/, `e quantos estão online (leu "${linha.online}")`);
      assert.equal(linha.selecionada, false, 'nenhuma sala selecionada antes do clique');
    }

    // 2) O CLIQUE NA LINHA SELECIONA — em qualquer ponto dela, não só no título.
    //    A sala que o professor escolhe é a que passa a mandar no destaque.
    await clicarAte(
      painel,
      `[data-room-id="${room.id}"]`,
      () => document.querySelector('[data-arena-detail-title]')?.textContent === 'Aula do centro de comando',
      { descricao: 'selecionar a sala clicando na linha' },
    );
    const selecionada = await lerLista(painel);
    assert.deepEqual(
      selecionada.filter((linha) => linha.selecionada).map((linha) => linha.titulo),
      [TITULO],
      'e a linha selecionada se marca na lista',
    );

    // 3) O CABEÇALHO COMANDA. A ação da vez é abrir a sala, ela é a ÚNICA
    //    primária, está na linha de comando, e a gestão da sala fica visível no
    //    cabeçalho sem competir com os comandos da batalha.
    const rascunho = await lerComando(painel);
    assert.equal(rascunho.faixaNoCabecalho, true, 'a faixa de estado vive no cabeçalho da sala em destaque');
    assert.ok(rascunho.faixaCelulas >= 3, `e diz o estado, os lugares e a ação da vez (leu ${rascunho.faixaCelulas} células)`);
    assert.equal(rascunho.titulo, TITULO, 'e o cabeçalho é o da sala selecionada');
    assert.deepEqual(rascunho.primario, ['publish'], 'a ação da vez da sala em rascunho é abrir a sala, uma só');
    assert.deepEqual(rascunho.primarioTexto, ['Abrir sala'], 'e o botão diz o mesmo que a faixa');
    assert.equal(rascunho.proximaCelula, 'Abrir sala', 'a célula "Próxima ação" aponta a mesma frase');
    assert.equal(rascunho.primarioNoPalco, true, 'o botão da ação da vez está no palco da partida, uma vez só');
    assert.deepEqual(
      rascunho.soltos,
      [],
      `fora o botão da vez, a linha não carrega comando solto: leu ${JSON.stringify(rascunho.soltos)}`,
    );
    assert.deepEqual(rascunho.cicloDeVida, [], 'em rascunho não existe controle de fim de aula na linha');
    for (const comando of ['room-edit', 'room-block', 'delete']) {
      assert.ok(
        rascunho.gerenciamento.some((entrada) => entrada.acao === comando && !entrada.desabilitado),
        `o comando ${comando} está visível e disponível no cabeçalho (leu ${JSON.stringify(rascunho.gerenciamento)})`,
      );
    }

    // 4) O BOTÃO VISÍVEL É CONTROLE DE VERDADE: clicar em "Editar" abre o
    //    diálogo DAQUELA sala.
    const temEditar = await painel.$eval(
      '.arena-room-management [data-action=room-edit]',
      (no) => no.getBoundingClientRect().height > 0,
    );
    assert.equal(temEditar, true, 'o comando de editar já está visível');
    await clicarAte(
      painel,
      '.arena-room-management [data-action=room-edit]',
      () => {
        const dialogo = document.querySelector('[data-arena-dialog][open]');
        return Boolean(dialogo && dialogo.querySelector('[name=room_id]')?.value);
      },
      { descricao: 'editar a sala pelo botão visível' },
    );
    const alvoDoDialogo = await painel.$eval('[data-arena-dialog][open] [name=room_id]', (no) => no.value);
    assert.equal(alvoDoDialogo, String(room.id), 'o diálogo é o da sala selecionada, não o de outra');
    await painel.evaluate(() => document.querySelector('[data-arena-dialog][close], [data-arena-dialog] [data-arena-dialog-close]')?.click());
    await esperarPor(painel, () => !document.querySelector('[data-arena-dialog][open]'), {
      descricao: 'o diálogo fechar antes do próximo passo',
    });

    // 5) A AÇÃO DA VEZ MUDA COM O ESTADO, e a lista acompanha sem recarga: a
    //    aula começa pelo botão do cabeçalho, e a linha passa a dizer "Aberta".
    await clicarAte(
      painel,
      '[data-arena-detail] [data-action=publish]',
      () => document.querySelector('[data-arena-detail-state]')?.textContent === 'Aguardando participantes',
      { descricao: 'abrir a sala pelo botão da ação da vez' },
    );
    const publicada = await lerComando(painel);
    assert.deepEqual(publicada.primario, ['start'], 'aberta a sala, a ação da vez passa a ser começar');
    assert.deepEqual(publicada.primarioTexto, ['Iniciar missão'], 'e o botão diz o mesmo que a faixa');
    assert.equal(
      await painel.evaluate(() => Boolean(document.querySelector('[data-arena-detail] [data-action=publish]'))),
      false,
      'o botão de abrir a sala sai da tela depois de apertado — em qualquer lugar do destaque',
    );
    // 5b) A AULA EM ANDAMENTO NÃO OFERECE "NOVA BATALHA". O botão de repetir a
    //     partida é de FIM de batalha: ao lado de "Encerrar rodada" ele é um
    //     botão que o professor não procura no meio da aula — e que estraga a
    //     rodada se ele apertar por engano. (Achado olhando a tela, não no papel:
    //     o cartão da sala em jogo mostrava os dois lado a lado.)
    await clicarAte(
      painel,
      '[data-arena-detail] [data-action=start]',
      () => document.querySelector('.arena-state-cell.is-estado b')?.textContent.includes('Em jogo'),
      { descricao: 'começar a missão pelo botão da ação da vez' },
    );
    const emJogo = await lerComando(painel);
    assert.deepEqual(emJogo.primario, ['end-round'], 'em jogo, a ação da vez é encerrar a rodada');
    assert.equal(
      emJogo.gerenciamento.find((entrada) => entrada.acao === 'delete')?.desabilitado,
      true,
      'excluir continua visível durante a aula, mas bloqueado para evitar apagar uma batalha em andamento',
    );
    assert.equal(
      await painel.evaluate(() => Boolean(document.querySelector('[data-arena-detail] [data-action=new-battle]'))),
      false,
      'e a sala em jogo não oferece repetir a batalha — nem na linha, nem no •••',
    );
    assert.ok(
      emJogo.soltos.includes('pause-round'),
      `os controles da aula seguem à vista ao lado da ação da vez (leu ${JSON.stringify(emJogo.soltos)})`,
    );

    // A lista conta o mesmo que o cabeçalho, sem recarga nenhuma: um dado, uma
    // frase — as duas metades da tela não podem discordar sobre a mesma sala.
    await esperarPor(
      painel,
      (id) => {
        const selo = document.querySelector(`[data-room-id="${id}"] .arena-status-badge`);
        const estado = document.querySelector('[data-arena-detail-state]');
        if (!selo || !estado) return false;
        // O selo do cabeçalho diz o estado E o detalhe vivo da rodada ("Em jogo ·
        // Missão 1 de 1"); a lista diz o estado. As duas metades continuam
        // proibidas de discordar sobre a mesma sala: o selo da lista tem de
        // estar contido na frase do cabeçalho — a frase da lista que sumisse do
        // cabeçalho (ou o contrário) reprova aqui.
        const daLista = selo.textContent.trim();
        return daLista !== '' && estado.textContent.includes(daLista);
      },
      { descricao: 'a lista dizer o mesmo estado que o cabeçalho, sem recarga', args: room.id },
    );

    // 6) CINCO LARGURAS. A composição tem de caber: nada de rolagem lateral, a
    //    ação da vez sempre dentro da tela, e o ••• aberto também.
    const larguras = [
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ];
    for (const viewport of larguras) {
      await painel.setViewport(viewport);
      await esperarPor(painel, () => document.querySelector('[data-arena-detail] [data-proximo]'), {
        descricao: `a ação da vez estar na tela em ${viewport.width}px`,
      });
      // O QUE TEM DE CABER na linha de comando: cada comando vivo dela. O •••
      // aberto deixou de existir como sujeito desta medida (o menu saiu da tela);
      // quem ocupa aquele lugar agora são os controles de aula e o de ciclo de
      // vida, e é a linha inteira que precisa caber.
      const medida = await painel.evaluate(() => {
        const vivos = (seletor) => {
          const no = document.querySelector(seletor);
          if (!no) return null;
          const area = no.getBoundingClientRect();
          return { esquerda: area.left, direita: area.right, largura: area.width };
        };
        const janela = window.innerWidth;
        const foraDaTela = [...document.querySelectorAll('.arena-detail-command button[data-action], .arena-detail-command a')]
          .filter((no) => {
            const area = no.getBoundingClientRect();
            return area.width > 0 && (area.left < -1 || area.right > janela + 1);
          })
          .map((no) => no.dataset.action || no.textContent.trim());
        return {
          documento: document.documentElement.scrollWidth,
          // O BODY entra junto, e não é redundância: quando o `html` corta o
          // excesso, o `scrollWidth` do documento fica igual à janela enquanto o
          // conteúdo transborda por dentro dele. Era essa a folga que deixava a
          // sala em destaque passar de 390 px sem este portão reprovar — a tabela
          // de participantes impunha 539 px de largura mínima ao painel, e o
          // documento continuava dizendo 390.
          corpo: document.body.scrollWidth,
          janela,
          primario: vivos('[data-arena-detail] [data-proximo]'),
          comandos: vivos('.arena-detail-command'),
          gerenciamento: vivos('.arena-room-management'),
          foraDaTela,
        };
      });
      const tela = `${viewport.width}×${viewport.height}`;
      assert.ok(
        medida.documento <= medida.janela + 1 && medida.corpo <= medida.janela + 1,
        `em ${tela} a página não pode rolar para o lado (documento ${medida.documento}, body ${medida.corpo} > janela ${medida.janela})`,
      );
      assert.ok(
        medida.primario && medida.primario.esquerda >= -1 && medida.primario.direita <= medida.janela + 1,
        `em ${tela} a ação da vez tem de estar dentro da tela (leu ${JSON.stringify(medida.primario)})`,
      );
      assert.deepEqual(
        medida.foraDaTela,
        [],
        `em ${tela} nenhum comando da linha pode sair da tela (leu ${JSON.stringify(medida.foraDaTela)})`,
      );
      assert.ok(
        medida.gerenciamento && medida.gerenciamento.esquerda >= -1 && medida.gerenciamento.direita <= medida.janela + 1,
        `em ${tela} editar, bloquear e excluir ficam dentro da tela (leu ${JSON.stringify(medida.gerenciamento)})`,
      );
    }

    assert.deepEqual(erros, [], 'nenhum erro de página no caminho da lista para o cabeçalho');
  } finally {
    await navegador?.close();
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
    aberto.close();
  }
});
