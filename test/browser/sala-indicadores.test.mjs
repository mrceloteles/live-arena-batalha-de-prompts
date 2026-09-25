// A FAIXA DE INDICADORES DA SALA EM DESTAQUE (LA-09).
//
// Por que isto vira portão: a sala em destaque ganhou, no desenho da referência
// clara, quatro cartões que dizem de uma vez quem está dentro, quanto tempo
// resta, quantos já enviaram e como a turma está indo — e um número que a tela
// inventa é pior do que número nenhum, porque o professor decide por ele. O que
// este portão cobra:
//
//   1. A FAIXA EXISTE E DIZ O NOME DO DADO em cada cartão: participantes online,
//      rodada, envios de prompts e média do juiz.
//   2. O NÚMERO DA TELA É O NÚMERO DO SERVIDOR. Lugares e envios vêm do detalhe
//      da sala (a mesma leitura que o resto do painel faz), e a média do juiz é
//      a média das notas que o ranking da missão devolveu — não uma constante
//      escrita no cliente. O teste monta uma nota (78) e cobra as duas pontas.
//   3. O CARTÃO DA RODADA É O ESCURO. É a única peça da faixa com fundo próprio
//      na referência, e é o ponto de contraste dela: se alguém trocar o token e
//      ele voltar a ser um cartão claro como os outros, a faixa vira quatro
//      retângulos iguais e a leitura do cronômetro se perde.
//   4. A AÇÃO DA VEZ É O MAIOR LADRILHO — e o único. A linha de comando virou uma
//      grade, e a única coisa que não pode acontecer nela é o professor ter dois
//      botões do mesmo peso (o defeito que criou a ação da vez) ou nenhum.
//   5. O MENU ••• CONTINUA SENDO MENU. Quando a linha virou grade, a regra do
//      ladrilho alcançou por descendência os itens DENTRO do •••: cada um virou
//      um quadrado de 78 px, o menu foi a 256 px e a linha inteira esticou para
//      174 (a captura de tela mostrou). O portão mede a altura dos itens e a da
//      linha, porque o defeito não aparece em nenhuma asserção de conteúdo.
//   6. AS DUAS COLUNAS: participantes à esquerda e missões à direita em tela
//      larga; empilhadas abaixo de 1180 px; e nenhuma delas empurrando a página
//      para o lado em cinco larguras.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina, clicarAte, esperarPor } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createRoomEventHub } from '../../src/server/events.mjs';

const SENHA = 'sala-indicadores-password';
const TITULO = 'Aula dos indicadores';
const NOTA = 78;

/** A faixa como o professor a lê: um cartão por pergunta, rótulo e número. */
const lerFaixa = (pagina) => pagina.evaluate(() => {
  const limpar = (texto) => (texto || '').replace(/\s+/g, ' ').trim();
  return {
    cartoes: [...document.querySelectorAll('.arena-metrics .arena-metric')].map((no) => ({
      rotulo: limpar(no.querySelector('.arena-metric-label')?.textContent),
      valor: limpar(no.querySelector('.arena-metric-value')?.textContent),
      nota: limpar(no.querySelector('.arena-metric-note')?.textContent),
      fundo: getComputedStyle(no).backgroundColor,
    })),
    metricas: document.querySelectorAll('.arena-metrics').length,
  };
});

/**
 * A LINHA DE COMANDO DO CABEÇALHO — os controles do MEIO da aula (pausar,
 * encerrar a rodada, fechar o placar) e o ciclo de vida da sala.
 *
 * A AÇÃO DA VEZ não mora mais aqui: ela subiu para o PALCO DA PARTIDA, e quem a
 * mede é `lerPalco`. O ••• do detalhe também não existe mais (a gestão da sala
 * ficou visível na coluna de acesso). O que este leitor vigia é a linha: que ela
 * não estique e que nenhum controle dela vire ladrilho gigante.
 */
const lerComando = (pagina) => pagina.evaluate(() => {
  const linha = document.querySelector('.arena-detail-command');
  const altura = (no) => Math.round(no.getBoundingClientRect().height);
  return {
    existe: Boolean(linha),
    display: linha ? getComputedStyle(linha).display : '',
    altura: linha ? altura(linha) : 0,
    proximos: linha ? linha.querySelectorAll('[data-proximo]').length : 0,
    controles: [...(linha?.querySelectorAll('button[data-action], a') || [])].map((no) => ({
      acao: no.dataset.action || no.textContent.trim(),
      altura: altura(no),
      largura: Math.round(no.getBoundingClientRect().width),
    })),
  };
});

/**
 * O PALCO DA PARTIDA, onde a ação da vez vive.
 *
 * Ele carrega o que o desenho aprovado pôs no lugar do quarto cartão da faixa:
 * o KICKER ("RODADA 1 DE 1 · AO VIVO", "BATALHA DE 1 MISSÃO", "BATALHA
 * ENCERRADA") e o botão único da vez. O selo do cabeçalho continua sendo o outro
 * lugar que responde "em que rodada e em que pé" — os dois são lidos juntos.
 */
const lerPalco = (pagina) => pagina.evaluate(() => {
  const limpar = (texto) => (texto || '').replace(/\s+/g, ' ').trim();
  const palco = document.querySelector('.arena-match-stage');
  const marcados = [...document.querySelectorAll('[data-arena-detail] [data-proximo]')];
  return {
    kicker: limpar(document.querySelector('.arena-match-kicker')?.textContent),
    selo: limpar(document.querySelector('[data-arena-detail-state]')?.textContent),
    proxima: limpar(document.querySelector('.arena-state-cell.is-proxima b')?.textContent),
    primarios: marcados.map((no) => no.dataset.action),
    primarioTexto: marcados.map((no) => limpar(no.textContent)),
    primarioNoPalco: marcados.every((no) => Boolean(palco?.contains(no))),
    primarioLargura: marcados[0] ? Math.round(marcados[0].getBoundingClientRect().width) : 0,
  };
});

/**
 * A ORDEM DA SALA EM DESTAQUE, e onde a fila de desafios caiu.
 *
 * As DUAS COLUNAS do corpo — "quem está dentro" à esquerda e "a missão no ar"
 * à direita — não existem mais: o desenho aprovado põe a partida inteira no
 * cartão do topo (código + palco + faixa de indicadores) e desce o roteiro de
 * missões e os participantes em largura inteira. O que este leitor vigia agora é
 * a ORDEM, que é a pergunta que as colunas respondiam: a faixa de números fica
 * dentro do cartão da partida, o roteiro vem antes da lista de participantes, e a
 * bancada de comandos fica no cabeçalho.
 */
const lerOrdem = (pagina) => pagina.evaluate(() => {
  const antes = (a, b) => {
    const noA = document.querySelector(a);
    const noB = document.querySelector(b);
    if (!noA || !noB) return false;
    return Boolean(noA.compareDocumentPosition(noB) & Node.DOCUMENT_POSITION_FOLLOWING);
  };
  return {
    faixaNaPartida: Boolean(document.querySelector('[data-arena-detail-match] .arena-metrics')),
    comandoNoCabecalho: Boolean(document.querySelector('[data-arena-detail-head] .arena-detail-command')),
    faixaAntesDoRoteiro: antes('.arena-metrics', '.arena-rounds-grid'),
    roteiroAntesDosAlunos: antes('.arena-rounds-grid', '.arena-people'),
    filaTemRodadas: Boolean(document.querySelector('.arena-rounds-grid, .arena-empty')),
  };
});

test('a faixa de indicadores diz o número do servidor, e a linha de comando é grade', { timeout: ESPERA.teste }, async () => {
  const aberto = openDatabase(':memory:');
  await aberto.migrate();
  const repositories = createRepositories(aberto.database);
  const servidor = createServer(createApplication({
    repositories,
    judge: async () => ({ percent: NOTA, explanation: 'Avaliado', breakdown: {}, metadata: {} }),
    classicJudge: async () => ({ percent: NOTA, explanation: 'Avaliado', breakdown: {}, metadata: {} }),
    arenaJudge: async () => ({ percent: NOTA, explanation: 'Avaliado', breakdown: {}, metadata: {} }),
    eventHub: createRoomEventHub(),
    adminPassword: SENHA,
    adminSecret: 'sala-indicadores-secret-at-least-32ch',
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
      return { status: resposta.status, corpo: await resposta.json() };
    };

    await post('admin_login', { password: SENHA });
    await post('arena_set_open', { open: true });
    const { challenge } = (await post('arena_save_challenge', {
      title: 'Cartaz da feira', modality: 'precisao',
      mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
      reference_text: 'Cartaz A3 da feira, com data, local e contato.',
    })).corpo;
    // Duas salas com uma missão cada: a da aula (que este teste conduz) e uma
    // vizinha, para que a lista tenha mais de uma linha.
    const { room } = (await post('arena_create_room', { title: TITULO, preset: 'personalizado', expected_players: 2 })).corpo;
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    const vizinha = (await post('arena_create_room', { title: 'Aula vizinha', preset: 'personalizado', expected_players: 4 })).corpo.room;
    await post('arena_add_round', { room_id: vizinha.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });
    const publicada = (await post('arena_room_detail', { room_id: room.id })).corpo.detail.room;
    const pin = publicada.pin ?? publicada.code;

    const turma = [];
    for (const nome of ['Ana Lima', 'Bruno Costa']) {
      const entrada = await post('arena_join', { code: pin, name: nome });
      assert.equal(entrada.status, 200, `${nome} entra na sala (${JSON.stringify(entrada.corpo)})`);
      turma.push({ ...entrada.corpo.participant, token: entrada.corpo.token });
    }

    navegador = await abrirNavegador();
    const painel = await abrirPagina(navegador, { viewport: { width: 1440, height: 900 } });
    const erros = [];
    painel.on('pageerror', (erro) => erros.push(erro.message));
    await painel.goto(`${base}/admin-arena.php`);
    await painel.type('[name=password]', SENHA);
    await Promise.all([painel.waitForNavigation(), painel.click('[data-admin-arena-login] button[type=submit]')]);
    await painel.waitForSelector('[data-arena-room-list] [data-room-id]');
    await clicarAte(
      painel,
      `[data-room-id="${room.id}"]`,
      // O predicado roda NO NAVEGADOR: o título tem de ser literal aqui.
      () => document.querySelector('[data-arena-detail-title]')?.textContent === 'Aula dos indicadores',
      { descricao: 'selecionar a sala da aula' },
    );

    // 1) A FAIXA EXISTE, COM UM CARTÃO POR PERGUNTA — e ela nasce ANTES da
    //    batalha: no lobby, quem está dentro já é a primeira pergunta da aula.
    //
    //    SÃO TRÊS, e não quatro: o cartão "Rodada" (com o relógio e o nome da
    //    missão) saiu da faixa quando o palco da partida passou a carregar o
    //    kicker ("RODADA 1 DE 1 · AO VIVO") e o selo do cabeçalho passou a dizer
    //    o estado vivo. A pergunta continua sendo feita — logo abaixo.
    await esperarPor(painel, () => document.querySelectorAll('.arena-metrics .arena-metric').length === 3, {
      descricao: 'os três cartões da faixa de indicadores',
    });
    const noLobby = await lerFaixa(painel);
    assert.equal(noLobby.metricas, 1, 'a faixa entra uma vez só na sala em destaque');
    assert.deepEqual(
      noLobby.cartoes.map((cartao) => cartao.rotulo),
      ['Conectados', 'Envios de prompts', 'Média do juiz'],
      `a faixa diz o NOME do dado de cada cartão (leu ${JSON.stringify(noLobby.cartoes.map((c) => c.rotulo))})`,
    );
    assert.match(noLobby.cartoes[0].valor, /^\d+\s*\/\s*\d+$/, `e quantos estão conectados (leu "${noLobby.cartoes[0].valor}")`);
    assert.equal(
      noLobby.cartoes[1].nota,
      'abra a missão para acompanhar',
      'a rodada que não abriu diz o que fazer, em vez de mostrar zeros',
    );
    // O "em que rodada, e em que pé": o palco da partida diz de quantas missões
    // é a batalha e o selo diz o estado — uma pergunta, dois lugares certos.
    const palcoLobby = await lerPalco(painel);
    assert.match(palcoLobby.kicker, /^BATALHA DE \d+ MISS/i, `o palco diz de quantas missões é a batalha (leu "${palcoLobby.kicker}")`);
    assert.match(palcoLobby.selo, /Pronta para começar|Aguardando participantes/, `e o selo diz em que pé a sala está (leu "${palcoLobby.selo}")`);

    // 1b) A ORDEM DA SALA EM DESTAQUE: a faixa de números vive DENTRO do cartão
    //     da partida, antes do roteiro de missões, que vem antes da lista de
    //     participantes; a bancada de comandos fica no cabeçalho, acima de tudo.
    //     A ordem é a mesma pergunta que as duas colunas respondiam (o número
    //     antes do que ele explica), e é ela que este portão impede de embaralhar.
    const ordem = await lerOrdem(painel);
    assert.equal(ordem.faixaNaPartida, true, 'a faixa de indicadores vive no cartão da partida');
    assert.equal(ordem.comandoNoCabecalho, true, 'e a bancada de comandos, no cabeçalho');
    assert.equal(ordem.faixaAntesDoRoteiro, true, 'os números vêm antes do que ainda vai acontecer');
    assert.equal(ordem.roteiroAntesDosAlunos, true, 'e o roteiro das missões, antes da lista de participantes');
    assert.equal(ordem.filaTemRodadas, true, 'com as missões da sala dentro dele');

    // 3) NENHUM CARTÃO É ESCURO. O quarto cartão (o da rodada) era o ponto de
    //    contraste da faixa, e a faixa inteira vivia em fundo navy; o desenho
    //    aprovado é claro, com um tom próprio por cartão. A asserção é invertida
    //    em relação ao desenho antigo, para o mesmo defeito (faixa escura) não
    //    voltar sem ninguém notar.
    const escuros = noLobby.cartoes.filter((cartao) => /^rgba?\((6, 24, 60|8, 36, 91|10, 15, 29)/.test(cartao.fundo));
    assert.deepEqual(
      escuros,
      [],
      `nenhum cartão escuro: o desenho da faixa é claro (leu ${JSON.stringify(noLobby.cartoes.map((c) => c.fundo))})`,
    );

    // 4) E 5) A LINHA DE COMANDO — que agora carrega os controles do MEIO da
    //    aula e o ciclo de vida da sala, e não mais o ladrilho da ação da vez.
    //    As duas perguntas do desenho antigo continuam vivas: o ladrilho grande
    //    existe UM só (e é o do palco — ver 1), e nenhum controle da linha vira
    //    ladrilho gigante.
    const noComando = await lerComando(painel);
    assert.equal(noComando.existe, true, 'o cabeçalho da sala em destaque tem a linha de comando');
    assert.equal(noComando.proximos, 0, 'nenhuma ação da vez fica na linha: ela é do palco da partida');
    assert.equal(palcoLobby.primarios.length, 1, `um botão com o peso da ação da vez, e um só (leu ${palcoLobby.primarios.length})`);
    assert.equal(palcoLobby.primarioTexto[0], 'Iniciar missão', 'e é o de começar a aula');
    assert.equal(palcoLobby.primarioNoPalco, true, 'e ele mora no palco da partida');
    assert.ok(noComando.altura <= 120, `e a linha não estica por causa do que vem junto (leu ${noComando.altura}px)`);
    for (const item of noComando.controles) {
      assert.ok(
        item.altura <= 48,
        `o controle "${item.acao}" da linha é pílula, não ladrilho (leu ${item.altura}px de altura)`,
      );
    }

    // 2) O NÚMERO DA TELA É O DO SERVIDOR. A missão abre, um aluno envia, o juiz
    //    devolve a nota — e a faixa tem de contar as três coisas por si.
    await clicarAte(
      painel,
      '[data-arena-detail] [data-proximo]',
      () => document.querySelector('.arena-state-cell.is-estado b')?.textContent.includes('Em jogo'),
      { descricao: 'iniciar a missão pelo botão da ação da vez' },
    );
    const detalhe = (await post('arena_room_detail', { room_id: room.id })).corpo.detail;
    const rodada = detalhe.rounds.find((entrada) => entrada.status === 'open');
    const envio = await post('arena_submit', {
      participant_id: turma[1].id, token: turma[1].token, round_id: rodada.id,
      prompt: 'Cartaz A3 da feira de tecnologia, com data, local e contato para inscrição.',
    });
    assert.equal(envio.status, 200, `o aluno envia (${JSON.stringify(envio.corpo)})`);

    await esperarPor(painel, () => /1 avaliado/.test(document.querySelector('.arena-metric.is-judge')?.textContent || '')
      && /RODADA 1 DE \d+ · AO VIVO/.test(document.querySelector('.arena-match-kicker')?.textContent || ''), {
      descricao: 'a faixa contar o envio e a nota do juiz',
    });
    const emJogo = await lerFaixa(painel);
    const emJogoPalco = await lerPalco(painel);
    const porRotulo = Object.fromEntries(emJogo.cartoes.map((cartao) => [cartao.rotulo, cartao]));
    // A rodada que abriu se nomeia no KICKER do palco (o cartão que a dizia saiu
    // da faixa quando o quarto cartão virou palco), e o selo do cabeçalho diz o
    // mesmo em palavras.
    assert.match(emJogoPalco.kicker, /^RODADA 1 DE \d+ · AO VIVO$/, `a rodada que abriu nomeia a missão pelo número dela (leu "${emJogoPalco.kicker}")`);
    assert.match(emJogoPalco.selo, /Em jogo · Missão 1/, `e o selo do cabeçalho diz o mesmo estado (leu "${emJogoPalco.selo}")`);
    assert.match(porRotulo['Envios de prompts'].valor, /^1\s*\/\s*2$/, `os envios são os do servidor, não uma constante (leu "${porRotulo['Envios de prompts'].valor}")`);
    assert.match(porRotulo['Envios de prompts'].nota, /^50% concluído · 1 digitando$/, 'e o que ainda está sendo escrito aparece');
    assert.equal(porRotulo['Média do juiz'].valor, `${NOTA}%`, 'a média é a nota que o juiz devolveu');
    assert.equal(porRotulo['Média do juiz'].nota, '1 avaliado', 'com a contagem de quem o juiz já avaliou na linha de apoio');

    // A média da tela é a média do RANKING do servidor — a mesma lista que o
    // relatório e o telão leem depois.
    const depois = (await post('arena_room_detail', { room_id: room.id })).corpo.detail;
    const noAr = depois.rounds.find((entrada) => entrada.id === rodada.id);
    const notas = noAr.ranking.map((linha) => Number(linha.percent));
    const media = Math.round(notas.reduce((soma, valor) => soma + valor, 0) / notas.length);
    assert.equal(porRotulo['Média do juiz'].valor, `${media}%`, 'e ela bate com o ranking que o servidor guardou');
    assert.equal(porRotulo['Média do juiz'].nota, `${notas.length} avaliado`, 'com o mesmo número de avaliados do ranking');

    // 4b) EM JOGO, COM GENTE AINDA ESCREVENDO, NÃO HÁ LADRILHO NENHUM MARCADO — a
    //     ação do professor é esperar, e inventar um botão ("pular", "forçar")
    //     seria criar um controle que ninguém pediu. Quem diz o que está
    //     acontecendo é a faixa.
    const emJogoParado = await lerPalco(painel);
    assert.equal(emJogoParado.primarios.length, 0, `com a turma escrevendo não há ação da vez (leu ${emJogoParado.primarios.length})`);
    assert.equal(
      await painel.evaluate(() => document.querySelector('.arena-state-cell.is-proxima b')?.textContent.trim() ?? ''),
      'Acompanhar os envios',
      'e a faixa de estado diz o que o professor faz agora',
    );

    // 6) AS DUAS COLUNAS DO CARTÃO DA SALA: o acesso (código, cópias, QR, telão)
    //    a quatro partes e a partida a oito, lado a lado em tela larga e
    //    empilhadas abaixo de 1180 — a mesma régua de antes, medida na grade que
    //    existe hoje (o corpo de duas colunas virou roteiro + lista em largura
    //    inteira).
    const lerGrade = (pagina) => pagina.evaluate(() => {
      const grade = document.querySelector('.arena-detail-grid');
      const trilhas = grade ? getComputedStyle(grade).gridTemplateColumns.split(' ').filter((v) => v !== '0px') : [];
      return {
        existe: Boolean(grade),
        colunas: trilhas.length,
        acesso: Boolean(grade?.querySelector('[data-arena-hero-access]')),
        partida: Boolean(grade?.querySelector('[data-arena-detail-match]')),
      };
    });
    await painel.setViewport({ width: 1440, height: 900 });
    await esperarPor(painel, () => document.querySelector('.arena-detail-grid'), { descricao: 'a grade do cartão da sala' });
    const largo = await lerGrade(painel);
    assert.equal(largo.existe, true, 'a sala em destaque tem a grade do cartão');
    assert.equal(largo.colunas, 2, `e em 1440 px são duas colunas (leu ${largo.colunas})`);
    assert.equal(largo.acesso, true, 'com o acesso à esquerda');
    assert.equal(largo.partida, true, 'e a partida à direita');
    await painel.setViewport({ width: 1024, height: 768 });
    // UMA trilha só, e o navegador devolve o valor USADO: `674px` ou
    // `673.531px`, conforme a largura do pai caia em subpixel. O instrumento
    // aceita as duas — a primeira versão exigia inteiro e reprovava a grade
    // certa por causa da fração.
    await esperarPor(painel, () => /^\d+(\.\d+)?px$/.test(getComputedStyle(document.querySelector('.arena-detail-grid')).gridTemplateColumns), {
      descricao: 'a grade empilhar em 1024 px',
    });
    const estreito = await lerGrade(painel);
    assert.equal(estreito.colunas, 1, `e em 1024 px elas empilham (leu ${estreito.colunas})`);

    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 },
      { width: 768, height: 1024 }, { width: 390, height: 844 },
    ]) {
      await painel.setViewport(viewport);
      const medida = await painel.evaluate(() => ({
        documento: document.documentElement.scrollWidth,
        corpo: document.body.scrollWidth,
        janela: window.innerWidth,
        faixa: (() => {
          const no = document.querySelector('.arena-metrics');
          const area = no.getBoundingClientRect();
          return { esquerda: Math.round(area.left), direita: Math.round(area.right) };
        })(),
        // A COLUNA DA SALA EM DESTAQUE. A referência desenha o painel numa faixa
        // de 1440 px; aqui a seção era uma coluna de 1080 px em qualquer janela,
        // e numa de 1920 a sala continuava com 1080. O teto é medido, não
        // presumido — e medido na SALA, que é o que o plano pede que ocupe a
        // largura: o contêiner de rolagem logo acima segue com a largura do
        // painel, que é quem tem de rolar.
        sala: Math.round(document.querySelector('[data-arena-detail]').getBoundingClientRect().width),
      }));
      const tela = `${viewport.width}×${viewport.height}`;
      assert.ok(
        medida.documento <= medida.janela + 1 && medida.corpo <= medida.janela + 1,
        `em ${tela} a página não pode rolar para o lado (documento ${medida.documento}, body ${medida.corpo}, janela ${medida.janela})`,
      );
      assert.ok(
        medida.faixa.esquerda >= -1 && medida.faixa.direita <= medida.janela + 1,
        `em ${tela} a faixa de indicadores tem de estar dentro da tela (leu ${JSON.stringify(medida.faixa)})`,
      );
      assert.ok(
        medida.sala <= 1441,
        `em ${tela} a sala em destaque não passa da coluna de 1440 px (leu ${medida.sala})`,
      );
      // E ela USA a coluna: numa janela larga a sala não pode encolher para o
      // tamanho antigo (1080). A régua é a mesma medida, com o outro sentido.
      if (viewport.width >= 1920) {
        assert.ok(medida.sala > 1300, `e numa janela de ${tela} ela aproveita a coluna (leu ${medida.sala})`);
      }
    }

    assert.deepEqual(erros, [], 'nenhum erro de página no caminho da faixa e dos ladrilhos');
  } finally {
    await navegador?.close();
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
    aberto.close();
  }
});

// A SALA ENCERRADA NÃO É UMA SALA VAZIA.
//
// Este portão nasceu do estado que a tela mostrava depois da aula: o cartão da
// sala perdia o SELO DO CÓDIGO e as portas, e os quatro números ficavam em branco
// — "sem missão no ar", "aguardando o juiz" — enquanto a faixa de estado, três
// linhas acima, escrevia os envios da missão que acabara de terminar. O dado
// estava no servidor; o cartão dizia não ter. Duas coisas ficam presas aqui:
//
//   1. O CÓDIGO FICA. É a "Nova batalha nesta sala" que reabre a MESMA sala com
//      o MESMO código: o número é justamente o que o professor precisa ter na
//      mão quando a turma atrasada da aula anterior volta a digitar. O que sai da
//      tela é a porta de trancar (a entrada já está fechada por definição — um
//      "Bloquear entrada" aqui seria um controle morto), e não o selo.
//   2. OS NÚMEROS FICAM, com o nome do que são: a última missão e a palavra
//      "encerrada" no relógio, porque um `--:--` promete um tempo que não vem.
test('a sala encerrada mostra o código dela e os números da última missão', { timeout: ESPERA.teste }, async () => {
  const aberto = openDatabase(':memory:');
  await aberto.migrate();
  const repositories = createRepositories(aberto.database);
  const servidor = createServer(createApplication({
    repositories,
    judge: async () => ({ percent: NOTA, explanation: 'Avaliado', breakdown: {}, metadata: {} }),
    classicJudge: async () => ({ percent: NOTA, explanation: 'Avaliado', breakdown: {}, metadata: {} }),
    arenaJudge: async () => ({ percent: NOTA, explanation: 'Avaliado', breakdown: {}, metadata: {} }),
    eventHub: createRoomEventHub(),
    adminPassword: SENHA,
    adminSecret: 'sala-encerrada-secret-at-least-32ch',
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
      return { status: resposta.status, corpo: await resposta.json() };
    };

    await post('admin_login', { password: SENHA });
    await post('arena_set_open', { open: true });
    const { challenge } = (await post('arena_save_challenge', {
      title: 'Cartaz da feira encerrada', modality: 'precisao',
      mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
      reference_text: 'Cartaz A3 da feira, com data, local e contato.',
    })).corpo;
    const { room } = (await post('arena_create_room', { title: TITULO, preset: 'personalizado', expected_players: 2 })).corpo;
    await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
    await post('arena_publish_room', { room_id: room.id });
    const publicada = (await post('arena_room_detail', { room_id: room.id })).corpo.detail.room;
    const pin = publicada.pin ?? publicada.code;

    const turma = [];
    for (const nome of ['Ana Lima', 'Bruno Costa']) {
      const entrada = await post('arena_join', { code: pin, name: nome });
      assert.equal(entrada.status, 200, `${nome} entra na sala (${JSON.stringify(entrada.corpo)})`);
      turma.push({ ...entrada.corpo.participant, token: entrada.corpo.token });
    }
    // A aula inteira, pelo servidor: abrir a missão, um envio com nota, fechar os
    // resultados e encerrar a sala. O que este portão mede começa aqui.
    const aberta = await post('arena_start_round', { room_id: room.id });
    assert.equal(aberta.status, 200, `a missão abre (${JSON.stringify(aberta.corpo)})`);
    const rodada = aberta.corpo.room.rounds.find((entrada) => entrada.status === 'open');
    await post('arena_submit', {
      participant_id: turma[1].id, token: turma[1].token, round_id: rodada.id,
      prompt: 'Cartaz A3 da feira de tecnologia, com data, local e contato para inscrição.',
    });
    await post('arena_end_round', { room_id: room.id });
    await post('arena_close_round', { room_id: room.id });
    const encerrada = await post('arena_end_room', { room_id: room.id });
    assert.equal(encerrada.status, 200, `a sala encerra (${JSON.stringify(encerrada.corpo)})`);

    navegador = await abrirNavegador();
    const painel = await abrirPagina(navegador, { viewport: { width: 1440, height: 900 } });
    const erros = [];
    painel.on('pageerror', (erro) => erros.push(erro.message));
    await painel.goto(`${base}/admin-arena.php`);
    await painel.type('[name=password]', SENHA);
    await Promise.all([painel.waitForNavigation(), painel.click('[data-admin-arena-login] button[type=submit]')]);
    await painel.waitForSelector('[data-arena-room-list] [data-room-id]');
    await clicarAte(
      painel,
      `[data-room-id="${room.id}"]`,
      // O predicado roda NO NAVEGADOR: o título tem de ser literal aqui.
      () => document.querySelector('[data-arena-detail-title]')?.textContent === 'Aula dos indicadores',
      { descricao: 'selecionar a sala encerrada' },
    );
    await esperarPor(painel, () => document.querySelector('[data-arena-detail-state]')?.textContent.trim() === 'Encerrada', {
      descricao: 'o selo do estado dizer que a sala encerrou',
    });

    // 1) O SELO DO CÓDIGO FICA, com o estado do acesso ao lado — e as portas que
    //    continuam fazendo sentido. A de trancar não está entre elas.
    // Onde cada controle vive hoje: as cópias e a gestão da sala ficam na COLUNA
    // DE ACESSO (o ••• do detalhe deixou de existir), e as portas de inspeção nos
    // dois slots do cabeçalho — a do aluno junto dos selos, a da TV na fila dos
    // comandos. O `open-tv` do desenho antigo (um botão com data-action) virou o
    // link do slot; o `copy-link` virou "Copiar acesso" ao lado do código.
    const cabecalho = await painel.evaluate(() => {
      const acesso = document.querySelector('[data-arena-hero-access]');
      const acoes = [...(acesso?.querySelectorAll('[data-action]') || [])].map((no) => no.dataset.action);
      const portas = [...document.querySelectorAll('[data-arena-chips-doors] a, [data-arena-topbar-quick] a')]
        .map((no) => no.getAttribute('href') || '');
      const trancar = document.querySelector('[data-action=room-block]');
      return {
        codigo: (acesso?.textContent || '').replace(/\s+/g, ' ').trim(),
        visivel: Boolean(acesso && !acesso.hidden),
        acoes,
        portas,
        trancar: trancar ? { desabilitado: Boolean(trancar.disabled), title: trancar.title || '' } : null,
      };
    });
    assert.equal(cabecalho.visivel, true, 'o selo do código continua no cabeçalho da sala encerrada');
    assert.match(
      cabecalho.codigo,
      new RegExp(String(pin)),
      `e ele é o código da sala, e não outro (leu "${cabecalho.codigo}" contra o PIN ${pin})`,
    );
    assert.match(cabecalho.codigo, /Fechado/, `com o estado do acesso escrito ao lado (leu "${cabecalho.codigo}"`);
    assert.ok(
      cabecalho.acoes.includes('copy-link') && cabecalho.acoes.includes('copy-code'),
      `os dois convites (código e link) continuam na mão (leu ${JSON.stringify(cabecalho.acoes)})`,
    );
    assert.ok(
      cabecalho.portas.some((href) => /aluno-preview\.php/.test(href)) && cabecalho.portas.some((href) => /tv-preview\.php/.test(href)),
      `e as duas portas de inspeção também (leu ${JSON.stringify(cabecalho.portas)})`,
    );
    // TRANCA: o desenho aprovado mantém o controle VISÍVEL e desabilitado — o
    // mesmo contrato que o portão da sala em destaque cobra do excluir durante a
    // aula. Um controle que some deixa o professor procurando; um que age
    // depois do fim não teria o que fazer. O que não pode é ele agir calado.
    assert.ok(cabecalho.trancar, 'o controle de trancar continua na tela da sala encerrada');
    assert.equal(cabecalho.trancar.desabilitado, true, 'desabilitado: a entrada já está encerrada');
    assert.match(cabecalho.trancar.title, /encerrada/i, `com o motivo escrito nele (leu "${cabecalho.trancar.title}")`);

    // 2) OS CARTÕES CONTAM A ÚLTIMA MISSÃO, em vez de dizerem que não há nada.
    // A espera é pelos quatro cartões — o que existe nos DOIS desenhos, o certo e
    // o errado. Esperar a palavra do número certo transformava a reprovação num
    // estouro de tempo limite, e o portão precisa dizer o que está errado, não
    // que demorou: o detalhe se monta numa passada de `innerHTML` só.
    await esperarPor(painel, () => document.querySelectorAll('.arena-metrics .arena-metric').length === 3, {
      descricao: 'os três cartões da sala encerrada',
    });
    const faixa = await lerFaixa(painel);
    const porRotulo = Object.fromEntries(faixa.cartoes.map((cartao) => [cartao.rotulo, cartao]));
    // O número da tela é o do SERVIDOR — e aqui ele tem uma sutileza que este
    // teste registra em vez de esconder: fechar a missão PONTUA quem não escreveu
    // (zero por tempo esgotado), então a contagem de "entregues" inclui os
    // zerados. O cartão não inventa nem filtra: mostra o mesmo número que a faixa
    // de estado, três linhas acima, que é o que impede a mesma sala dizer dois
    // números diferentes na mesma tela.
    const detalhe = (await post('arena_room_detail', { room_id: room.id })).corpo.detail;
    const ativos = detalhe.participants.filter((entrada) => entrada.active).length;
    const ultima = detalhe.rounds[detalhe.rounds.length - 1];
    assert.match(
      porRotulo['Envios de prompts'].valor,
      new RegExp(`^${ultima.submitted}\\s*/\\s*${ativos}$`),
      `os envios da última missão continuam no cartão (leu "${porRotulo['Envios de prompts']?.valor}")`,
    );
    const notas = (ultima.ranking || []).map((linha) => Number(linha.percent));
    const media = Math.round(notas.reduce((soma, valor) => soma + valor, 0) / notas.length);
    assert.equal(
      porRotulo['Média do juiz'].valor,
      `${media}%`,
      `e a média do juiz também, lida do ranking do servidor (leu "${porRotulo['Média do juiz']?.valor}")`,
    );
    assert.equal(
      porRotulo['Média do juiz'].nota,
      `${notas.length} ${notas.length === 1 ? 'avaliado' : 'avaliados'} · última missão`,
      `com a contagem e a marca de que a missão fechou (leu "${porRotulo['Média do juiz']?.nota}")`,
    );
    // O FIM DA BATALHA: o cartão que dizia "Missão 1 de 1 · encerrada" saiu da
    // faixa; quem diz isso agora é o palco — "BATALHA ENCERRADA" no kicker, a
    // mesma palavra que o selo do cabeçalho carrega.
    const palcoFim = await lerPalco(painel);
    assert.equal(palcoFim.kicker, 'BATALHA ENCERRADA', `o palco diz que a batalha acabou (leu "${palcoFim.kicker}")`);
    assert.equal(palcoFim.selo, 'Encerrada', 'e o selo do cabeçalho diz a mesma palavra');
    assert.equal(palcoFim.proxima, 'Nova batalha nesta sala', 'com a próxima ação nomeada no mesmo lugar');
    assert.deepEqual(palcoFim.primarios, ['new-battle'], 'e ela é o único botão com o peso da vez');

    assert.deepEqual(erros, [], 'nenhum erro de página no caminho da sala encerrada');
  } finally {
    await navegador?.close();
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
    aberto.close();
  }
});
