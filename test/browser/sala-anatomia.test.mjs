// A ANATOMIA DA SALA EM DESTAQUE: o código diz se recebe, cada aluno diz o que
// está fazendo, e as portas de inspeção seguem a sala escolhida.
//
// Por que isto vira portão: as três peças já existiam em algum lugar da tela, e
// cada uma mentia de um jeito próprio.
//
//   1. O CÓDIGO não dizia se estava valendo. A única pista era a frase "Alunos
//      entram com este código", que SUMIA durante a aula — justamente quando o
//      atrasado bate na porta e o professor precisa saber se ele ainda entra.
//      O selo agora responde pela MESMA regra do servidor, e este portão cobra as
//      duas juntas: com o selo dizendo que a sala recebe, entrar funciona; com o
//      selo dizendo que não, o servidor recusa o mesmo PIN.
//   2. A TABELA DE PARTICIPANTES dizia `online`/`ausente` em texto solto e, na
//      missão, `enviou`/`escrevendo` — quem já tinha enviado e esperava o juiz era
//      indistinguível de quem nem começou a escrever, que é a pergunta do
//      professor no meio da rodada. Cada aluno passa a carregar ROSTO (as
//      iniciais), o estado dele e o que a missão dele diz.
//   3. As PORTAS DE INSPEÇÃO (ver como o aluno, ver na TV) estavam atrás do •••
//      do detalhe, junto de editar, bloquear, arquivar e excluir. Subiram para o
//      cabeçalho do painel — e este portão cobra que elas apontem para a SALA EM
//      DESTAQUE, e não para uma sala qualquer.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { ESPERA, abrirNavegador, abrirPagina, clicarAte, esperarPor } from '../support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createRoomEventHub } from '../../src/server/events.mjs';

const SENHA = 'sala-anatomia-password';
const TITULO = 'Aula da anatomia';
const NOTA = 83;

/** O selo do código: o rótulo que o professor lê e a classe que o colore. */
const lerAcesso = (pagina) => pagina.evaluate(() => {
  const selo = document.querySelector('.arena-access-state');
  return {
    rotulo: selo?.textContent?.trim() ?? '',
    classe: selo?.className ?? '',
    pin: document.querySelector('.arena-detail-pin strong')?.textContent?.trim() ?? '',
  };
});

/**
 * Cada linha de participante como um humano a lê: rosto, nome, estado, missão.
 *
 * A tabela vive na seção "Participantes da arena" (`.arena-people`), aberta: ela
 * deixou de ser uma dobra `[data-fold-key=participantes]` quando a referência
 * clara pôs a lista no centro da tela — esconder trinta alunos atrás de uma alça
 * era trabalho a mais no meio da aula.
 */
const lerParticipantes = (pagina) => pagina.evaluate(() => {
  const secao = document.querySelector('.arena-people');
  const linhas = [...(secao?.querySelectorAll('.arena-table tbody tr') ?? [])];
  return {
    contagem: secao?.querySelector('.arena-table-count')?.textContent?.trim() ?? '',
    colunas: [...(secao?.querySelectorAll('.arena-table thead th') ?? [])].map((celula) => celula.textContent.trim()),
    linhas: linhas.map((linha) => ({
      iniciais: linha.querySelector('.arena-student-avatar')?.textContent?.trim() ?? '',
      nome: linha.querySelector('.arena-student-name strong')?.textContent?.trim() ?? '',
      estado: linha.querySelector('.arena-student-state')?.textContent?.trim() ?? '',
      estadoClasse: linha.querySelector('.arena-student-state')?.className ?? '',
      missao: linha.querySelector('.arena-student-mission')?.textContent?.trim() ?? '',
      missaoClasse: linha.querySelector('.arena-student-mission')?.className ?? '',
      relogio: linha.querySelector('.arena-student-clock')?.textContent?.trim() ?? '',
      rotulosDaLinha: [...linha.querySelectorAll('button, a, summary')].map((no) => no.dataset.action || no.tagName.toLowerCase()),
    })),
  };
});

/**
 * As portas de inspeção do painel.
 *
 * Elas moram em DOIS slots, por decisão do desenho: a do aluno é inspeção e fica
 * junto dos selos da sala (`[data-arena-chips-doors]`), a da projeção entra na
 * fila dos comandos (`[data-arena-topbar-quick]`). A leitura junta as duas na
 * ordem em que a tela as oferece — que é a mesma em que o professor as vê.
 */
const lerPortas = (pagina) => pagina.evaluate(() => {
  const slots = ['[data-arena-chips-doors]', '[data-arena-topbar-quick]']
    .map((seletor) => document.querySelector(seletor))
    .filter(Boolean);
  if (!slots.length) return null;
  return {
    escondido: slots.every((slot) => slot.hidden),
    portas: slots.flatMap((slot) => [...slot.querySelectorAll('a')].map((porta) => ({
      texto: porta.textContent.trim(),
      destino: porta.getAttribute('href'),
    }))),
  };
});

test('o código diz se recebe, cada aluno diz o que faz, as portas seguem a sala', { timeout: ESPERA.teste }, async () => {
  const aberto = openDatabase(':memory:');
  await aberto.migrate();
  const repositories = createRepositories(aberto.database);
  const servidor = createServer(createApplication({
    repositories,
    // O juiz é substituído nos TRÊS nomes que o servidor consulta (clássico,
    // critérios e o injetado): a nota desta sala é uma constante do teste, e é
    // ela que a linha do aluno precisa mostrar.
    judge: async () => ({ percent: NOTA, explanation: 'Avaliado', breakdown: {}, metadata: {} }),
    classicJudge: async () => ({ percent: NOTA, explanation: 'Avaliado', breakdown: {}, metadata: {} }),
    arenaJudge: async () => ({ percent: NOTA, explanation: 'Avaliado', breakdown: {}, metadata: {} }),
    eventHub: createRoomEventHub(),
    adminPassword: SENHA,
    adminSecret: 'sala-anatomia-secret-at-least-32-chars',
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
    /** O que ACONTECE com quem tenta entrar com o PIN — a resposta do servidor. */
    const tentarEntrar = async (pin, nome) => {
      const { status, corpo } = await post('arena_join', { code: pin, name: nome });
      return { status, mensagem: corpo?.error?.message ?? corpo?.message ?? '' };
    };

    const login = await post('admin_login', { password: SENHA });
    assert.equal(login.status, 200, 'o professor entra no painel');
    await post('arena_set_open', { open: true });
    const salvo = await post('arena_save_challenge', {
      title: 'Cartaz da feira', modality: 'precisao',
      mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
      reference_text: 'Cartaz A3 da feira, com data, local e contato.',
    });
    const desafio = salvo.corpo.challenge;

    // A SALA DA AULA: publicada, com a rodada no ar e três alunos dentro. Um deles
    // já enviou (e o juiz já deu a nota), os outros dois escrevem.
    // Cinco lugares: o quarto aluno do teste (o atrasado que o selo do código
    // promete que entra) precisa de um lugar livre para a tentativa significar
    // alguma coisa — com a sala cheia, o 409 seria da capacidade, não do código.
    const criada = await post('arena_create_room', { title: TITULO, preset: 'personalizado', expected_players: 5 });
    const room = { id: criada.corpo.room.id };
    await post('arena_add_round', { room_id: room.id, challenge_id: desafio.id });
    await post('arena_publish_room', { room_id: room.id });
    // O PIN nasce com a ABERTURA da sala (em rascunho ele ainda não existe), e é
    // por ele que a turma entra: o teste lê o que a sala de fato publicou.
    const publicada = (await post('arena_room_detail', { room_id: room.id })).corpo.detail.room;
    room.pin = publicada.pin ?? publicada.code;
    const turma = [];
    for (const nome of ['Ana Lima', 'Bruno', 'Carla Souza']) {
      const entrada = await post('arena_join', { code: room.pin, name: nome });
      assert.equal(entrada.status, 200, `${nome} entra com o PIN da sala (${entrada.corpo?.error ?? ''})`);
      turma.push({ ...entrada.corpo.participant, token: entrada.corpo.token });
    }
    await post('arena_start_round', { room_id: room.id });
    const rodada = (await post('arena_room_detail', { room_id: room.id })).corpo.detail.rounds.find((entry) => entry.status === 'open');
    await post('arena_submit', {
      participant_id: turma[2].id, token: turma[2].token, round_id: rodada.id,
      prompt: 'Cartaz A3 da feira de tecnologia, com data, local e contato para inscrição.',
    });

    // Uma segunda sala, em RASCUNHO: ela ainda não tem PIN (ele nasce com a
    // abertura), e é por isso que a tela dela nem oferece código.
    const outra = (await post('arena_create_room', { title: 'Aula vizinha', preset: 'personalizado', expected_players: 4 })).corpo.room;

    // A sala de LUGARES FIXOS (o Clássico dos três lugares), com a turma dentro:
    // é o caso em que o código continua na tela e NÃO recebe mais ninguém. Ela
    // precisa nascer antes de a página abrir, porque a lista de salas só se
    // redesenha em ação do professor (criar sala pelo painel) ou na recarga.
    const classica = (await post('arena_create_room', { title: 'Aula de lugares fixos', preset: 'classic', expected_players: 3 })).corpo.room;
    await post('arena_add_round', { room_id: classica.id, challenge_id: desafio.id });
    await post('arena_publish_room', { room_id: classica.id });
    const pinDaClassica = (await post('arena_room_detail', { room_id: classica.id })).corpo.detail.room.pin;
    for (const nome of ['Duda', 'Enzo', 'Fabi']) {
      const entrada = await post('arena_join', { code: pinDaClassica, name: nome });
      assert.equal(entrada.status, 200, `${nome} entra na sala de lugares fixos (${entrada.corpo?.error ?? ''})`);
    }

    navegador = await abrirNavegador();
    const painel = await abrirPagina(navegador, { viewport: { width: 1440, height: 900 } });
    const erros = [];
    painel.on('pageerror', (erro) => erros.push(erro.message));
    await painel.goto(`${base}/admin-arena.php`);
    await painel.type('[name=password]', SENHA);
    await Promise.all([painel.waitForNavigation(), painel.click('[data-admin-arena-login] button[type=submit]')]);
    await painel.waitForSelector('[data-arena-room-list] [data-room-id]');

    // 1) A PORTA DE INSPEÇÃO SEGUE A SALA ESCOLHIDA — e some quando não há sala.
    const antesDeEscolher = await lerPortas(painel);
    assert.ok(antesDeEscolher, 'o cabeçalho do painel tem o slot das portas de inspeção');
    assert.equal(antesDeEscolher.escondido, true, 'sem sala em destaque não há o que inspecionar');
    assert.deepEqual(antesDeEscolher.portas, [], 'e o slot fica vazio, em vez de abrir "a sala" sem dizer qual');

    await clicarAte(
      painel,
      `[data-room-id="${room.id}"]`,
      () => document.querySelector('[data-arena-detail-title]')?.textContent === 'Aula da anatomia',
      { descricao: 'selecionar a sala da aula' },
    );
    const comSala = await lerPortas(painel);
    assert.equal(comSala.escondido, false, 'com a sala em destaque as portas aparecem');
    assert.deepEqual(
      comSala.portas.map((porta) => porta.destino),
      [`/aluno-preview.php?room=${room.id}`, `/tv-preview.php?room=${room.id}`],
      `e as duas abrem a SALA EM DESTAQUE (leu ${JSON.stringify(comSala.portas)})`,
    );
    // A por que esta contagem existe: porta repetida em dois lugares da mesma
    // tela é o defeito que ela pega. O ••• do detalhe não existe mais; o que há
    // para vigiar é que cada porta apareça UMA vez no destaque.
    assert.deepEqual(
      await painel.evaluate(() => [...document.querySelectorAll('[data-arena-detail] a')]
        .map((a) => a.getAttribute('href') || '')
        .filter((href) => /(aluno|tv)-preview\.php/.test(href))),
      [`/aluno-preview.php?room=${room.id}`, `/tv-preview.php?room=${room.id}`],
      'e cada porta aparece uma vez só no destaque — nada de repetir a inspeção',
    );

    // 2) O CÓDIGO DIZ O ESTADO DELE — e o servidor confirma o que o selo promete.
    const acesso = await lerAcesso(painel);
    assert.equal(acesso.pin, room.pin, 'o selo fica ao lado do código da sala em destaque');
    assert.equal(acesso.rotulo, 'Ativo', `sala aberta e recebendo: o código está ativo (leu "${acesso.rotulo}")`);
    assert.match(acesso.classe, /is-ativo/, 'e a classe é a do estado ativo');

    // 2b) CADA ALUNO CARREGA ROSTO, ESTADO E O QUE A MISSÃO DELE DIZ. (Antes da
    //     entrada do atrasado, para a leitura ser dos três que a aula montou.)
    await esperarPor(painel, () => document.querySelectorAll('.arena-people .arena-table tbody tr').length === 3, {
      descricao: 'a tabela de participantes com os três alunos',
    });
    const tabela = await lerParticipantes(painel);
    assert.deepEqual(tabela.colunas.slice(0, 2), ['Nome', 'Status'], 'a tabela tem as colunas do aluno');
    // O cabeçalho da coluna é "Missão atual" (com acento); a comparação ignora
    // acento para a asserção continuar sendo sobre a COLUNA, e não sobre a
    // grafia do rótulo.
    assert.ok(
      tabela.colunas.some((coluna) => coluna.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'Missao atual'),
      `e a coluna da missão enquanto há rodada no ar (leu ${JSON.stringify(tabela.colunas)})`,
    );
    assert.equal(tabela.contagem, '3 de 3 conectados', 'o cabeçalho da seção conta quem está conectado');
    assert.deepEqual(
      tabela.linhas.map((linha) => [linha.iniciais, linha.nome, linha.estado, linha.missao]),
      [
        ['AL', 'Ana Lima', 'Conectado', '✎Escrevendo'],
        ['B', 'Bruno', 'Conectado', '✎Escrevendo'],
        ['CS', 'Carla Souza', 'Conectado', `★${NOTA}%`],
      ],
      `a linha diz as iniciais, o nome, o estado e a missão de cada aluno (leu ${JSON.stringify(tabela.linhas)})`,
    );
    assert.match(tabela.linhas[0].estadoClasse, /is-conectado/, 'o estado vem com a classe que o colore');
    assert.match(tabela.linhas[0].missaoClasse, /is-escrevendo/, 'e a missão do que ainda escreve tem a classe dela');
    assert.match(tabela.linhas[2].missaoClasse, /is-avaliado/, 'a de quem já tem nota, a da nota');
    for (const linha of tabela.linhas) {
      assert.match(linha.relogio, /^\d{2}:\d{2}:\d{2}$/, 'e a hora de entrada continua em relógio, na coluna dela');
      assert.ok(linha.rotulosDaLinha.includes('remove-participant'), 'sem perder as ações da linha');
    }

    // 2c) E O SERVIDOR CONFIRMA O QUE O SELO PROMETE: com o código ativo, quem
    //     digita o PIN entra — e o painel passa a mostrar o quarto aluno sozinho.
    const entrou = await tentarEntrar(room.pin, 'Aluno atrasado');
    assert.equal(entrou.status, 200, `e o servidor ACEITA quem digita o PIN que o selo diz estar ativo (leu ${entrou.status}: ${entrou.mensagem})`);
    await esperarPor(painel, () => document.querySelectorAll('.arena-people .arena-table tbody tr').length === 4, {
      descricao: 'o atrasado aparecer na tabela sem recarregar a página',
    });
    const comAtrasado = await lerParticipantes(painel);
    assert.equal(comAtrasado.contagem, '4 de 4 conectados', 'e o cabeçalho da seção passa a contar quatro');
    assert.equal(comAtrasado.linhas[3].missao, '✎Escrevendo', 'o que chegou depois entra na missão que está no ar');

    // O professor bloqueia a entrada pelo botão visível do cabeçalho — o mesmo
    // PIN passa a ser recusado, e o selo diz isso ANTES de alguém tentar.
    await clicarAte(
      painel,
      '.arena-room-management [data-action=room-block]',
      () => document.querySelector('.arena-access-state')?.textContent.trim() === 'Entrada bloqueada',
      { descricao: 'bloquear a entrada pelo botão visível da sala em destaque' },
    );
    const bloqueado = await lerAcesso(painel);
    assert.match(bloqueado.classe, /is-bloqueado/, 'o selo do código muda de estado com a entrada bloqueada');
    const recusado = await tentarEntrar(room.pin, 'Outro atrasado');
    assert.equal(recusado.status, 409, `e o servidor RECUSA o mesmo PIN (leu ${recusado.status}: ${recusado.mensagem})`);

    // 4) A SALA DE LUGARES FIXOS FECHA O CÓDIGO QUANDO A BATALHA COMEÇA. É o
    //    caso que já enganou este painel uma vez: o Clássico trava o cadastro nos
    //    três lugares, e o código continuava na tela como se recebesse gente.
    await post('arena_start_round', { room_id: classica.id });
    await clicarAte(
      painel,
      `[data-room-id="${classica.id}"]`,
      () => document.querySelector('[data-arena-detail-title]')?.textContent === 'Aula de lugares fixos',
      { descricao: 'selecionar a sala de lugares fixos' },
    );
    const fechada = await lerAcesso(painel);
    assert.equal(fechada.rotulo, 'Fechado', `com os três lugares tomados o código para de receber (leu "${fechada.rotulo}")`);
    assert.match(fechada.classe, /is-encerrado/, 'e o selo muda de estado com ele');
    const recusada = await tentarEntrar(pinDaClassica, 'Quinto aluno');
    assert.equal(recusada.status, 409, `e o servidor RECUSA o mesmo PIN, pelo mesmo motivo (leu ${recusada.status})`);
    const portasDaOutra = await lerPortas(painel);
    assert.deepEqual(
      portasDaOutra.portas.map((porta) => porta.destino),
      [`/aluno-preview.php?room=${classica.id}`, `/tv-preview.php?room=${classica.id}`],
      'e as portas de inspeção passam a apontar para a sala que está em destaque agora',
    );

    // 4b) A SALA EM RASCUNHO NEM MOSTRA O CÓDIGO: ela ainda não tem PIN (ele nasce
    //     com a abertura), e um número para digitar que não abre nada seria a
    //     mesma promessa vazia que o selo existe para não fazer.
    await clicarAte(
      painel,
      `[data-room-id="${outra.id}"]`,
      () => document.querySelector('[data-arena-detail-title]')?.textContent === 'Aula vizinha',
      { descricao: 'selecionar a sala em rascunho' },
    );
    assert.equal(await painel.evaluate(() => Boolean(document.querySelector('.arena-access-state'))), false, 'sala em rascunho não oferece código de entrada');
    const semSala = await tentarEntrar(outra.code, 'Curioso');
    assert.equal(semSala.status, 409, `e o servidor recusa quem tenta entrar antes de a sala abrir (leu ${semSala.status})`);

    // 5) TELA ESTREITA: a anatomia nova cabe, sem rolagem lateral — é a mesma
    //    régua que o resto do painel já obedecia.
    await clicarAte(
      painel,
      `[data-room-id="${room.id}"]`,
      () => document.querySelector('[data-arena-detail-title]')?.textContent === 'Aula da anatomia',
      { descricao: 'voltar para a sala da aula' },
    );
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await painel.setViewport(viewport);
      await esperarPor(painel, () => document.querySelectorAll('.arena-people .arena-table tbody tr').length === 4, {
        descricao: `a tabela de participantes em ${viewport.width}px`,
      });
      const medida = await painel.evaluate(() => {
        const selo = document.querySelector('.arena-access-state')?.getBoundingClientRect();
        const pilula = document.querySelector('.arena-student-mission')?.getBoundingClientRect();
        return {
          documento: document.documentElement.scrollWidth,
          // O BODY também, e não é redundância: com o `html` cortando o excesso,
          // o `scrollWidth` do documento fica igual à janela enquanto o conteúdo
          // transborda por dentro dele — foi assim que a sala em destaque passou
          // meses com 200 px de excesso em 390 px sem nenhum portão reprovar.
          corpo: document.body.scrollWidth,
          janela: window.innerWidth,
          selo: selo ? { esquerda: selo.left, direita: selo.right } : null,
          pilula: pilula ? { esquerda: pilula.left, direita: pilula.right } : null,
        };
      });
      const tela = `${viewport.width}×${viewport.height}`;
      assert.ok(
        medida.documento <= medida.janela + 1 && medida.corpo <= medida.janela + 1,
        `em ${tela} a página não pode rolar para o lado (documento ${medida.documento}, body ${medida.corpo}, janela ${medida.janela})`,
      );
      assert.ok(
        medida.selo && medida.selo.esquerda >= -1 && medida.selo.direita <= medida.janela + 1,
        `em ${tela} o selo do código tem de estar dentro da tela (leu ${JSON.stringify(medida.selo)})`,
      );
      assert.ok(
        medida.pilula && medida.pilula.esquerda >= -1 && medida.pilula.direita <= medida.janela + 1,
        `em ${tela} o selo da missão do aluno tem de estar dentro da tela (leu ${JSON.stringify(medida.pilula)})`,
      );
    }

    assert.deepEqual(erros, [], 'nenhum erro de página no caminho do código, dos alunos e das portas');
  } finally {
    await navegador?.close();
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
    aberto.close();
  }
});
