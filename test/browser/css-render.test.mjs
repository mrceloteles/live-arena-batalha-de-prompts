// Portão 2 de 3: a cascata por ELEMENTO, na tela renderizada.
//
// Para cada elemento de cada tela, fotografa o estilo computado e guarda uma
// impressão digital. Qualquer mudança de estilo carimbada que mude o que o
// navegador resolve faz este teste reprovar — inclusive a que o portão 1 não
// consegue ver: um seletor que passa a ganhar (ou a perder) de OUTRO seletor no
// mesmo elemento (`.brand-identity` contra `.brand-identity--small`,
// `.report-date-field` contra `.text-field`).
//
// Só estilo, sem geometria: as medidas de caixa oscilam alguns sub-pixels entre
// duas capturas do MESMO estado (largura de texto), e comparar isso daria
// reprovação falsa. A geometria é consequência do estilo, então o estilo é o
// lugar certo para o portão.
//
// Se a mudança for intencional, regenere e revise o diff:
//   UPDATE_CSS_BASELINE=1 npm run test:browser
// Para saber QUEM causou uma reprovação, o instrumento detalhado é
// `tmp/qa/blame-faixa.mjs` (comparação de dois estados, com o seletor culpado).
//
// A suíte de navegador roda com `--test-concurrency=1` (ver `package.json`):
// cada arquivo levanta um navegador de verdade, e três ao mesmo tempo nesta
// máquina faziam um `page.goto` estourar o tempo limite de 30s de vez em quando.
// Um portão intermitente ensina a rodar de novo até ficar verde, que é
// exatamente como uma regressão de verdade passa despercebida.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test, { after, before } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { FOLHAS, FOLHA_DE_CONTRATO } from '../support/cascata-css.mjs';
import { abrirNavegador } from '../support/navegador.mjs';

const raiz = new URL('../../', import.meta.url);
const cartorio = new URL('test/css/render.json', raiz);
// Estritamente '1' — ver a nota em test/css/cascata.test.mjs.
const atualizar = process.env.UPDATE_CSS_BASELINE === '1';
const fusoOriginal = process.env.TZ;
const saida = new URL('tmp/qa/css-render/', raiz);
const SENHA = 'css-baseline-password';
const SEGREDO = 'css-baseline-secret-at-least-32-characters';

// Propriedades de estilo. Fora da lista: as medidas de caixa (`width`, `height`,
// `top/right/bottom/left`, `min-*`, `max-*`) e os `grid-template-*`, que o
// navegador devolve já resolvidos em pixels e oscilam entre capturas do mesmo
// estado.
const PROPS = [
  'display', 'position', 'z-index', 'float', 'visibility', 'opacity',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
  'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing',
  'line-height', 'text-align', 'text-transform', 'text-decoration-line', 'white-space',
  'text-overflow', 'text-shadow', 'overflow-x', 'overflow-y', 'cursor', 'pointer-events',
  'box-shadow', 'filter', 'backdrop-filter', 'mix-blend-mode', 'object-fit', 'aspect-ratio',
  'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-self',
  'flex-grow', 'flex-shrink', 'flex-basis', 'gap', 'order',
  'grid-column', 'grid-row', 'column-gap', 'row-gap',
  'transition', 'clip-path',
];

const LARGURAS = [
  [1440, 900],
  [390, 844],
];

let servidor;
let navegador;
let base;
let cookieAdmin;
let cookieTv;
let codigoDaSala;
let pinDaSala;
// As duas salas do detalhe: a publicada e aguardando, e a mesma coisa com a
// missao ja aberta. Sao a mesma tela em dois momentos, e por isso sao duas
// salas — uma sala que ja comecou nao volta a "aguardando", e cada tela do
// portao precisa de um estado so.
let salaAguardando;
let salaEmJogo;
// PIN e sessão de projeção das duas salas que só a TV mostra: a da rodada no ar
// e a do placar.
let pinEmJogo;
let pinComPlacar;
let cookieTvEmJogo;
let cookieTvComPlacar;
const folhasCarregadas = new Set();

/**
 * Abre o detalhe de uma sala como o professor abre: clicando em "Ver sala" no
 * cartão dela.
 *
 * O detalhe não tem URL própria — quem escolhe a sala é o cliente, ao clicar —
 * então o portão faz o mesmo gesto, em vez de inventar um atalho que só o teste
 * conhece. A espera é pelo que a tela precisa ter para estar pronta: o
 * cabeçalho, as linhas de missão e o QR do convite, que chega numa segunda
 * requisição. Sem esperar o QR, o retrato podia pegar a tela no meio da
 * montagem e a diferença de `display` reprovaria o portão sozinha.
 */
const abrirDetalhe = (roomId) => async (pagina) => {
  await pagina.waitForSelector(`[data-arena-room-list] [data-room-id="${roomId}"]`, { timeout: 30_000 });
  await pagina.click(`[data-arena-room-list] [data-room-id="${roomId}"] [data-action="detail"]`);
  await pagina.waitForSelector('[data-arena-detail]:not([hidden]) .arena-detail-head-bar', { timeout: 30_000 });
  await pagina.waitForSelector('.arena-rounds-grid .arena-round-card', { timeout: 30_000 });
  await pagina.waitForSelector('[data-qr-entry]:not([hidden])', { timeout: 30_000 });
};

/**
 * Só o que o CSS decide — nada de texto, nada de medida de caixa.
 *
 * Antes de medir, as animações e transições são desligadas por uma folha
 * adotada (não por um `<style>` no documento: isso mudaria os índices dos
 * elementos e portanto o próprio retrato). Sem isso, um elemento que pulsa
 * (a `.arena-tv-pulse` da projeção) tem `box-shadow` diferente a cada captura e
 * o portão reprovaria sozinho.
 */
const fotografar = (props) => {
  const congelar = new CSSStyleSheet();
  congelar.replaceSync('*, *::before, *::after { animation: none !important; transition: none !important; }');
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, congelar];
  const linhas = [];
  for (const elemento of document.querySelectorAll('*')) {
    const caminho = [];
    let no = elemento;
    while (no && no.nodeType === 1 && no !== document.documentElement) {
      const pai = no.parentNode;
      if (!pai) break;
      caminho.unshift(`${no.tagName.toLowerCase()}:${[...pai.children].indexOf(no) + 1}`);
      no = pai;
    }
    const estilo = getComputedStyle(elemento);
    // CSSOM resolves automatic margins to used pixels. Those pixels depend on
    // text metrics and are geometry, which this gate deliberately excludes.
    // Typed OM preserves the computed keyword; a change to an explicit margin
    // still changes the snapshot instead of being silently ignored.
    const computado = elemento.computedStyleMap();
    const valores = props.map((p) => {
      const automatico = p.startsWith('margin-') && computado.get(p)?.toString() === 'auto';
      return `${p}:${automatico ? 'auto' : estilo.getPropertyValue(p)}`;
    }).join(';');
    linhas.push(`${caminho.join('>')}\t${elemento.tagName.toLowerCase()}\t${elemento.getAttribute('class') || ''}\t${valores}`);
  }
  return { elementos: document.querySelectorAll('*').length, texto: linhas.join('\n') };
};

const normalizar = (texto, porta) =>
  texto
    .replaceAll(`127.0.0.1:${porta}`, '127.0.0.1:PORTA')
    .replace(/\r\n/g, '\n');

before(async () => {
  // The API groups report activity using the server's local hour as well.
  // Fix both sides of this test fixture; changing the browser alone is not
  // enough to make the heatmap's input data reproducible.
  process.env.TZ = 'UTC';
  const aberto = openDatabase(':memory:');
  await aberto.migrate();
  const repositories = createRepositories(aberto.database);
  let sequencia = 0;
  servidor = createServer(
    createApplication({
      repositories,
      judge: createFakeJudge(),
      arenaJudge: async ({ candidatePrompt }) => ({
        percent: 50 + Number(/Aluno (\d+)/.exec(String(candidatePrompt || ''))?.[1] || 0),
        breakdown: {},
        feedback: 'Avaliado',
      }),
      adminPassword: SENHA,
      adminSecret: SEGREDO,
      // Relógio parado: nenhuma tela pode mudar de estilo porque o tempo passou.
      now: () => 5000,
      id: () => `css-baseline-${++sequencia}`,
    }),
  );
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${servidor.address().port}`;

  const postar = async (action, payload = {}, cookie) => {
    const resposta = await fetch(`${base}/api.php?action=${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(payload),
    });
    const corpo = await resposta.json();
    assert.equal(resposta.status, 200, `${action}: ${JSON.stringify(corpo)}`);
    return { corpo, resposta };
  };

  const login = await fetch(`${base}/api.php?action=admin_login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: SENHA }),
  });
  assert.equal(login.status, 200);
  cookieAdmin = login.headers.get('set-cookie').split(';')[0];

  // Três salas de Arena publicadas, com alunos dentro: são elas que dão conteúdo
  // às telas do painel, da projeção e do relatório — e, com a missão aberta, ao
  // detalhe da sala, que é onde vivem as duas colunas, a faixa de indicadores e
  // as linhas de missão.
  //
  // As três salas usam as MESMAS duas missões: no produto o desafio vive numa
  // biblioteca e a sala só o referencia, e criar uma missão nova para a segunda
  // sala faria o painel crescer por um motivo que não é o que esta rodada mede.
  const desafios = [];
  for (const [indice, missao] of ['Cartaz da feira de ciências.', 'Post do clube de robótica.'].entries()) {
    const { challenge } = (await postar('arena_save_challenge', {
      title: `Missão ${indice + 1}`, modality: 'precisao', mission: missao,
      context: 'Turma do ensino médio.',
      criteria: [{ criterion: 'objetivo', weight: 40 }, { criterion: 'contexto', weight: 30 }, { criterion: 'formato', weight: 30 }],
      reference_text: `Material do projeto com data, local e público. Missão ${indice + 1}.`,
    }, cookieAdmin)).corpo;
    desafios.push(challenge.id);
  }

  // `tempos` só entra quando a tela fotografada precisa dele: a sala da rodada
  // no ar precisa (o detalhe mostra o cronômetro correndo), e a que só espera
  // não — o ajuste de tempo é recusado com a sala em jogo, e é assim mesmo que
  // as duas variantes do cronômetro (com tempo e `.is-untimed`) entram no
  // retrato, uma em cada sala.
  const montarSala = async (titulo, tempos = null) => {
    const { room } = (await postar('arena_create_room', {
      title: titulo, preset: 'arena', expected_players: 8,
      arena_rounds: 2, arena_boss_health: 3, arena_damage_threshold: 60, arena_attacks_per_round: 2,
      arena_teams: true,
    }, cookieAdmin)).corpo;
    for (const challenge_id of desafios) {
      await postar('arena_add_round', { room_id: room.id, challenge_id }, cookieAdmin);
    }
    if (tempos) {
      await postar('arena_set_round_times', {
        room_id: room.id,
        times: desafios.map((challenge_id) => ({ challenge_id, duration_seconds: tempos })),
      }, cookieAdmin);
    }
    await postar('arena_publish_room', { room_id: room.id }, cookieAdmin);
    const entradas = [];
    for (let n = 1; n <= 4; n += 1) {
      const entrada = await fetch(`${base}/api.php?action=arena_join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: room.code, name: `Aluno ${n}` }),
      });
      assert.equal(entrada.status, 200);
      entradas.push(await entrada.json());
    }
    return { room, entradas };
  };

  await postar('arena_set_open', { open: true }, cookieAdmin);

  // Sala 1: publicada e aguardando — o professor ainda não abriu a missão. É a
  // dela que saem o PIN da projeção, o código da tela de entrada e o relatório.
  const { room: aguardando } = await montarSala('Sala do portão de CSS');
  codigoDaSala = aguardando.code;
  pinDaSala = aguardando.pin || aguardando.code;
  salaAguardando = aguardando.id;
  const tv = await postar('arena_tv_token', { room_id: aguardando.id }, cookieAdmin);
  cookieTv = tv.resposta.headers.get('set-cookie').split(';')[0];

  // Sala 2: a mesma coisa com a rodada viva. É o que dá ao detalhe o painel da
  // rodada no ar, o cronômetro correndo e o convite dobrado — e, na projeção, o
  // cronômetro no alto.
  const { room: emJogo } = await montarSala('Sala do portão de CSS — em jogo', 300);
  salaEmJogo = emJogo.id;
  pinEmJogo = emJogo.pin || emJogo.code;
  const tvEmJogo = await postar('arena_tv_token', { room_id: emJogo.id }, cookieAdmin);
  cookieTvEmJogo = tvEmJogo.resposta.headers.get('set-cookie').split(';')[0];
  await postar('arena_start_round', { room_id: emJogo.id }, cookieAdmin);

  // Sala 3: a rodada fechada, com placar. O placar não existe na rodada ABERTA
  // — a projeção desenha a missão e o cronômetro, e mais nada —, ele aparece
  // quando a rodada fecha, com a nota de quem enviou. A nota sai na própria
  // requisição do envio, e a rodada fecha AQUI, antes de qualquer captura: o
  // portão fotografa estado parado, nunca um placar se montando.
  const { room: comPlacar, entradas } = await montarSala('Sala do portão de CSS — com placar', 300);
  pinComPlacar = comPlacar.pin || comPlacar.code;
  const placarAberto = await postar('arena_start_round', { room_id: comPlacar.id }, cookieAdmin);
  const rodadaDoPlacar = placarAberto.corpo.room.rounds[0].id;
  for (const [indice, jogador] of entradas.slice(0, 3).entries()) {
    await postar('arena_submit', {
      participant_id: jogador.participant.id, token: jogador.token, round_id: rodadaDoPlacar,
      // O juiz de mentira pontua pelo nome que estiver no prompt: notas
      // diferentes ajudam a olhar a ordem do placar.
      prompt: `Cartaz da feira de ciências do Aluno ${indice + 1}, com data, local e público.`,
    }, cookieAdmin);
  }
  await postar('arena_end_round', { room_id: comPlacar.id }, cookieAdmin);
  const tvComPlacar = await postar('arena_tv_token', { room_id: comPlacar.id }, cookieAdmin);
  cookieTvComPlacar = tvComPlacar.resposta.headers.get('set-cookie').split(';')[0];

  navegador = await abrirNavegador();
  mkdirSync(saida, { recursive: true });
});

after(async () => {
  if (navegador) await navegador.close();
  if (servidor) await new Promise((resolve) => servidor.close(resolve));
  if (fusoOriginal === undefined) delete process.env.TZ;
  else process.env.TZ = fusoOriginal;
});

/**
 * As telas do retrato: nome, URL, cookie e — quando a tela só existe depois de
 * um gesto — o quarto item, que monta esse estado na página antes da foto
 * (é o caso do detalhe da sala, que o professor abre clicando no cartão).
 */
const TELAS = () => [
  ['portal', '/', null],
  ['entrada-do-aluno', '/play', null],
  ['entrada-do-aluno-com-codigo', `/play?pin=${codigoDaSala}`, null],
  ['painel-login', '/admin-arena.php', null],
  ['painel-do-professor', '/admin-arena.php', cookieAdmin],
  ['sala-em-destaque-em-espera', '/admin-arena.php', cookieAdmin, abrirDetalhe(salaAguardando)],
  ['sala-em-destaque-em-jogo', '/admin-arena.php', cookieAdmin, abrirDetalhe(salaEmJogo)],
  ['previa-do-aluno', '/aluno-preview.php', cookieAdmin],
  ['previa-da-tv', '/tv-preview.php', cookieAdmin],
  ['projecao-da-tv', `/tv.php?pin=${pinDaSala}`, cookieTv],
  ['projecao-da-tv-rodada-viva', `/tv.php?pin=${pinEmJogo}`, cookieTvEmJogo],
  ['projecao-da-tv-placar', `/tv.php?pin=${pinComPlacar}`, cookieTvComPlacar],
  ['relatorio', '/report.php', cookieAdmin],
];

async function capturar() {
  const porta = new URL(base).port;
  const retratos = {};
  const pagina = await navegador.newPage();
  const sessao = await pagina.createCDPSession();
  // The heatmap groups timestamps by the browser's local weekday/hour. Fix
  // this fixture's zone so a Brazilian laptop and the UTC CI render one state.
  await sessao.send('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });
  pagina.on('response', (resposta) => {
    const caminho = new URL(resposta.url()).pathname;
    if (caminho.endsWith('.css')) folhasCarregadas.add(caminho.split('/').pop());
  });
  try {
    for (const [largura, altura] of LARGURAS) {
      await pagina.setViewport({ width: largura, height: altura, deviceScaleFactor: 1 });
      for (const [nome, url, cookie, preparar] of TELAS()) {
        const alvo = new URL(base + url);
        // Cada tela começa limpa: sem isso o cookie do painel continua valendo
        // para as telas seguintes e a "tela de login" era fotografada já
        // autenticada — cobertura perdida sem nenhum aviso.
        await sessao.send('Storage.clearDataForOrigin', { origin: base, storageTypes: 'all' });
        if (cookie) {
          await pagina.setCookie({
            name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1),
            domain: '127.0.0.1', path: '/', httpOnly: true,
          });
        }
        await pagina.goto(alvo.href, { waitUntil: 'networkidle2', timeout: 45_000 });
        await new Promise((resolve) => setTimeout(resolve, 400));
        // Telas que só existem depois de um gesto (o detalhe da sala) montam o
        // próprio estado aqui, antes de a foto ser tirada.
        if (preparar) await preparar(pagina);
        // O ponteiro do mouse fica onde o clique o deixou, e depois que a tela se
        // redesenha ele pode acabar em cima de OUTRO elemento — com o `:hover`
        // dele dentro do retrato. Foi medido: em 4 rodadas seguidas do mesmo
        // código, o `a.arena-preview-open` da "sala em destaque em jogo" (390px)
        // saiu branco em duas e tingido pelas cores do `:hover` nas outras duas
        // (`refinement.css` manda `#f7f9fd` / `#c3d2ea` no hover) — um portão
        // intermitente, que ensina a rodar de novo até ficar verde. Retrato é do
        // estilo DA TELA, não do repouso do ponteiro: manda o mouse para longe
        // antes de ler, e ele passa a ser o mesmo em toda rodada.
        await pagina.mouse.move(0, 0);
        // Lê até que duas leituras seguidas batam. Uma espera fixa não garante
        // que a tela parou de se montar (as telas buscam dados depois do load),
        // e um retrato tirado no meio da montagem reprova o portão sozinho.
        let estilo = await pagina.evaluate(fotografar, PROPS);
        for (let tentativa = 0; tentativa < 5; tentativa += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          const seguinte = await pagina.evaluate(fotografar, PROPS);
          if (seguinte.texto === estilo.texto && seguinte.elementos === estilo.elementos) break;
          estilo = seguinte;
        }
        const texto = normalizar(estilo.texto, porta);
        const identificador = `${nome}__${largura}x${altura}`;
        retratos[identificador] = {
          elementos: estilo.elementos,
          hash: createHash('sha256').update(texto).digest('hex').slice(0, 16),
        };
        writeFileSync(new URL(`${identificador}.txt`, saida), `# ${url} ${largura}x${altura} elementos=${estilo.elementos}\n${texto}\n`);
      }
    }
  } finally {
    await pagina.close();
  }
  return retratos;
}

test('browser: nenhuma tela muda de estilo sem atualizar o instantâneo', { timeout: 240_000 }, async () => {
  const retratos = await capturar();
  const atual = {
    folhasCarregadas: [...folhasCarregadas].sort(),
    telas: retratos,
  };
  if (atualizar) {
    writeFileSync(cartorio, `${JSON.stringify(atual, null, 2)}\n`);
    return;
  }
  const esperado = JSON.parse(readFileSync(cartorio, 'utf8'));

  const alteradas = [];
  for (const identificador of Object.keys({ ...esperado.telas, ...retratos })) {
    const antes = esperado.telas[identificador];
    const depois = retratos[identificador];
    if (!antes) alteradas.push(`${identificador}: tela nova, não existia no instantâneo`);
    else if (!depois) alteradas.push(`${identificador}: tela desapareceu do teste`);
    else if (antes.hash !== depois.hash) {
      alteradas.push(`${identificador}: o estilo computado mudou (${antes.elementos} -> ${depois.elementos} elementos)`);
    }
  }
  assert.equal(
    alteradas.length,
    0,
    `estilo computado mudou em ${alteradas.length} tela(s):\n  ${alteradas.join('\n  ')}\n\n` +
      `O retrato de agora está em tmp/qa/css-render/ (fora do versionamento).\n` +
      'Se a mudança é intencional e você provou que a tela mudou como queria, regenere:\n' +
      '  UPDATE_CSS_BASELINE=1 npm run test:browser\n',
  );
});

test('browser: toda folha de estilo em disco é carregada por alguma página', { timeout: 240_000 }, async () => {
  if (!folhasCarregadas.size) await capturar();
  const emDisco = readdirSync(new URL('public/assets/css', raiz)).filter((nome) => nome.endsWith('.css'));
  const orfas = emDisco.filter((nome) => nome !== FOLHA_DE_CONTRATO && !folhasCarregadas.has(nome));
  assert.deepEqual(
    orfas,
    [],
    `folhas em disco que nenhuma página carrega: ${orfas.join(', ')}\n` +
      'Ou elas voltaram a alguma página, ou devem ser apagadas (como append.css e neutral.css).',
  );
  for (const folha of FOLHAS) {
    assert.ok(folhasCarregadas.has(folha.nome), `${folha.nome} deixou de ser carregada por alguma página`);
  }
});
