// Capturas antes/depois das superfícies mapeadas em `MAPA-INTEGRACAO.md`.
//
// Por que o "antes" é servido por troca de folha, e não por uma cópia do
// projeto: o que mudou nesta rodada são as folhas de estilo e algumas marcas
// decorativas na marcação (`brand-tape`, `brand-swoosh`, `signal-tape`). Sem as
// folhas novas, essas marcas não pintam nada — então servir o MESMO render com
// as folhas do HEAD é o "antes" de verdade, e não uma aproximação. Também prova,
// de passagem, que a mudança é de pele: o HTML e o JS são os mesmos.
//
// O servidor é próprio e em memória (banco `:memory:`, juiz falso, relógio
// parado), como o portão 2: assim o banco de desenvolvimento do repositório
// fica fora da conta e as duas rodadas partem do mesmo estado.
//
//   node output/qa/redesign-capturas.mjs
//
// Escreve em `output/redesign-2026-09-18/<modo>/` e a tabela de estilo
// computado em `output/redesign-2026-09-18/medida.json`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { abrirNavegador, abrirPagina } from '../../test/support/navegador.mjs';

const OUT = process.env.SAIDA || 'output/redesign-2026-09-18';
const FOLHAS = ['app-authorial.css', 'arena.css', 'design.css', 'refinement.css', 'round.css'];
const SENHA = 'redesign-capturas-password';
const SEGREDO = 'redesign-capturas-secret-at-least-32-characters';

const DESKTOP = { w: 1440, h: 900 };
const CELULAR = { w: 390, h: 844 };
const TV = { w: 1920, h: 1080 };

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// O que a identidade do redesign mexe em cada alvo. Uma linha por alvo, e só o
// que MUDOU entre os dois modos aparece na tabela final.
const MEDIDAS = [
  // --- a VOZ e a composição desta rodada: fonte por papel, faixa do painel,
  // anel da nota e diagnóstico. O "antes" serve a mesma marcação com as folhas
  // do HEAD, então cada linha aqui mede o que a folha nova fez com o MESMO HTML.
  { tela: '01-portal', alvo: 'body', props: ['fontFamily'] },
  { tela: '01-portal', alvo: '.portal-hero-headline', props: ['fontFamily', 'fontWeight'] },
  { tela: '02-entrada-aluno', alvo: '.join-head h1', props: ['fontFamily'] },
  { tela: '03-login-painel', alvo: '.admin-login-head h1', props: ['fontFamily'] },
  { tela: '01-portal', alvo: '.portal-hero', props: ['borderRadius', 'boxShadow', 'backgroundColor', 'overflow'] },
  { tela: '01-portal', alvo: '.portal-hero', props: ['height', 'backgroundImage'], rotulo: '.portal-hero::before (fita)', pseudo: '::before' },
  { tela: '01-portal', alvo: '.portal-enter', props: ['borderRadius', 'height', 'backgroundColor', 'fontWeight'] },
  { tela: '01-portal', alvo: '.brand-swoosh', props: ['height', 'width', 'display'] },
  { tela: '01-portal', alvo: 'body[data-page=index]', props: ['backgroundColor', 'backgroundImage'] },
  { tela: '02-entrada-aluno', alvo: '.join-card', props: ['borderRadius', 'boxShadow'] },
  { tela: '02-entrada-aluno', alvo: '.join-card', props: ['height', 'backgroundImage'], rotulo: '.join-card::before (fita)', pseudo: '::before' },
  { tela: '02-entrada-aluno', alvo: '.join-card .arena-submit', props: ['borderRadius', 'height', 'textTransform'] },
  { tela: '02-entrada-aluno', alvo: '.join-card .arena-field input[name=code]', props: ['fontFamily', 'height', 'textAlign'] },
  { tela: '06-painel-do-professor', alvo: '.admin-arena-hero', props: ['paddingTop', 'paddingLeft', 'borderTopLeftRadius'] },
  { tela: '06-painel-do-professor', alvo: '.arena-hero-stats', props: ['gridTemplateColumns', 'columnGap'] },
  { tela: '06-painel-do-professor', alvo: '.arena-hero-stat > span', props: ['fontFamily', 'textTransform'] },
  { tela: '06-painel-do-professor', alvo: '.arena-hero-stat > strong', props: ['fontFamily', 'fontSize', 'color'] },
  { tela: '06-painel-do-professor', alvo: '.admin-arena-room-list', props: ['rowGap', 'marginTop'] },
  { tela: '06-painel-do-professor', alvo: '.arena-room-card', props: ['borderTopWidth', 'borderTopStyle'] },
  { tela: '08-relatorio', alvo: '.metric-card > span', props: ['fontFamily', 'textTransform'] },
  { tela: '12-aluno-espera', alvo: '.arena-room-code', props: ['fontFamily'] },
  { tela: '13-aluno-missao', alvo: '.arena-round-count', props: ['fontFamily'] },
  { tela: '14-aluno-resultado', alvo: '.arena-result-score', props: ['backgroundColor', 'boxShadow', 'paddingTop'] },
  { tela: '14-aluno-resultado', alvo: '.arena-score-ring', props: ['width', 'height', 'backgroundImage'] },
  { tela: '14-aluno-resultado', alvo: '.arena-diagnosis-item', props: ['backgroundColor', 'borderTopLeftRadius', 'paddingLeft'] },
  { tela: '14-aluno-resultado', alvo: '.arena-diagnosis-item.is-focus > span', props: ['color', 'fontFamily'] },
  { tela: '03-login-painel', alvo: '.admin-login-card', props: ['borderRadius', 'boxShadow'] },
  { tela: '03-login-painel', alvo: '.admin-login-submit', props: ['borderRadius', 'height', 'textTransform'] },
  { tela: '05-tv-conecta', alvo: 'body[data-page=tv]', props: ['backgroundColor', 'backgroundImage'] },
  { tela: '05-tv-conecta', alvo: '.arena-tv-stage', props: ['borderRadius', 'borderTopWidth', 'backgroundImage'] },
  { tela: '05-tv-conecta', alvo: '.arena-tv-stage', props: ['height', 'backgroundImage'], rotulo: '.arena-tv-stage::after (fita)', pseudo: '::after' },
  { tela: '05-tv-conecta', alvo: '.arena-tv', props: ['backgroundImage'], rotulo: '.arena-tv (camada escura da página)' },
  { tela: '06-painel-do-professor', alvo: '.arena-admin-layout', props: ['backgroundColor', 'backgroundImage'] },
  { tela: '06-painel-do-professor', alvo: '.arena-room-card', props: ['borderRadius', 'boxShadow', 'backgroundColor'] },
  { tela: '08-relatorio', alvo: '.report-shell', props: ['backgroundColor', 'backgroundImage'] },
  { tela: '08-relatorio', alvo: '.report-panel', props: ['borderRadius', 'boxShadow', 'backgroundColor'] },
  { tela: '08-relatorio', alvo: '.arena-admin-titles .brand-swoosh', props: ['height', 'width', 'display'] },
  { tela: '13-aluno-missao', alvo: 'body[data-page=arena]', props: ['backgroundColor', 'backgroundImage'] },
  { tela: '13-aluno-missao', alvo: '.round-workspace', props: ['borderRadius', 'boxShadow', 'backgroundColor'] },
  { tela: '13-aluno-missao', alvo: '.round-workspace', props: ['height', 'backgroundImage'], rotulo: '.round-workspace::before (fita)', pseudo: '::before' },
  { tela: '13-aluno-missao', alvo: '.round-workspace .brand-swoosh', props: ['height', 'width', 'display'] },
  { tela: '13-aluno-missao', alvo: '.round-workspace .arena-submit', props: ['borderRadius', 'backgroundColor'] },
  { tela: '12-aluno-espera', alvo: 'body[data-page=arena]', props: ['backgroundColor', 'backgroundImage'] },
  { tela: '12-aluno-espera', alvo: '.arena-lobby', props: ['backgroundColor', 'backgroundImage'] },
  { tela: '12-aluno-espera', alvo: '.arena-mission-panel', props: ['borderRadius', 'boxShadow'] },
  { tela: '12-aluno-espera', alvo: '.signal-tape', props: ['height', 'backgroundImage'] },

  // --- rodada 3 (tela de jogo do aluno). O gradiente da marca estava sendo
  // LADRILHADO por um `background-size: 34px 35.5px` que sobrevivia à troca de
  // `background-image` (o atalho `background` é o que zera tamanho, posição e
  // repetição). As outras linhas medem a linha do campo, a linha do envio e o
  // número do anel, que precisa caber no disco branco de 114 px.
  { tela: '12-aluno-espera', alvo: '.arena-lobby', props: ['backgroundSize', 'backgroundPosition', 'backgroundRepeat'] },
  { tela: '13-aluno-missao', alvo: '.round-attempts-group', props: ['display', 'marginTop'] },
  { tela: '13-aluno-missao', alvo: '.arena-attempts', props: ['margin', 'gap'] },
  { tela: '13-aluno-missao', alvo: '.arena-field', props: ['display', 'gridTemplateColumns'] },
  { tela: '13-aluno-missao', alvo: '.arena-counter', props: ['fontFamily', 'textAlign', 'marginTop'] },
  { tela: '13-aluno-missao', alvo: '.round-submit-row', props: ['display', 'justifyContent'] },
  { tela: '14-aluno-resultado', alvo: '.arena-score-ring strong', props: ['fontSize', 'whiteSpace'] },

  // --- rodada 4 (SALA EM DESTAQUE, referência LA-06). O "antes" serve a MESMA
  // marcação com as folhas do HEAD, então cada linha mede o que a folha nova
  // fez com o mesmo HTML: o cabeçalho de dois selos, as duas colunas, a faixa de
  // indicadores do modo Arena e a linha de missão no lugar do cartão.
  { tela: '07-sala-detalhe', alvo: '.arena-detail-head-bar h1', props: ['fontFamily', 'fontSize', 'fontWeight', 'borderTopWidth'] },
  { tela: '07-sala-detalhe', alvo: '.arena-detail-state', props: ['display', 'fontFamily', 'textTransform', 'backgroundColor', 'borderTopLeftRadius'] },
  { tela: '07-sala-detalhe', alvo: '.arena-detail-meta', props: ['display', 'fontSize', 'columnGap'] },
  { tela: '07-sala-detalhe', alvo: '.arena-detail-head .arena-room-card-actions button', props: ['borderRadius', 'backgroundColor', 'paddingLeft', 'justifyContent'] },
  { tela: '07-sala-detalhe', alvo: '.arena-detail-head .arena-room-card-actions .is-primary', props: ['backgroundColor', 'color', 'boxShadow'] },
  { tela: '07-sala-detalhe', alvo: '.arena-detail-head .arena-room-card-actions .is-danger', props: ['backgroundColor', 'color', 'borderTopColor'] },
  { tela: '07-sala-detalhe', alvo: '.arena-detail-access', props: ['backgroundColor', 'borderTopLeftRadius', 'paddingTop', 'borderRightWidth'] },
  { tela: '07-sala-detalhe', alvo: '.arena-detail-pin strong', props: ['fontFamily', 'fontSize', 'color'] },
  { tela: '07-sala-detalhe', alvo: '.arena-detail-access .arena-tv-open', props: ['backgroundColor', 'borderRadius', 'justifyContent'] },
  { tela: '07-sala-detalhe', alvo: '.arena-detail-match', props: ['backgroundColor', 'borderTopLeftRadius', 'paddingTop'] },
  { tela: '07-sala-detalhe', alvo: '.arena-detail-current', props: ['backgroundColor', 'borderTopLeftRadius', 'paddingTop'] },
  { tela: '07-sala-detalhe', alvo: '.arena-detail-start', props: ['display', 'justifyContent', 'backgroundColor', 'paddingTop'] },
  { tela: '07-sala-detalhe', alvo: '.arena-rounds-grid', props: ['gridTemplateColumns', 'gap'] },
  { tela: '07-sala-detalhe', alvo: '.arena-round-row', props: ['display', 'alignItems', 'gap'] },
  { tela: '07-sala-detalhe', alvo: '.arena-round-num', props: ['display', 'fontFamily', 'fontSize', 'borderTopLeftRadius'] },
  { tela: '07-sala-detalhe', alvo: '.arena-round-title', props: ['fontFamily', 'fontSize', 'fontWeight'] },
  { tela: '07-sala-detalhe', alvo: '.arena-round-manage button', props: ['borderRadius', 'backgroundColor', 'fontSize'] },
  { tela: '07b-sala-detalhe-arena', alvo: '.arena-detail-stats', props: ['display', 'gridTemplateColumns', 'borderTopWidth'] },
  { tela: '07b-sala-detalhe-arena', alvo: '.arena-stat-card', props: ['display', 'backgroundColor', 'borderTopLeftRadius', 'paddingTop'] },
  { tela: '07b-sala-detalhe-arena', alvo: '.arena-stat-card.is-boss', props: ['backgroundColor', 'borderTopColor'] },
  { tela: '07b-sala-detalhe-arena', alvo: '.arena-stat-card.is-energy', props: ['backgroundColor', 'borderTopColor'] },
  { tela: '07b-sala-detalhe-arena', alvo: '.arena-stat-card.is-accuracy', props: ['backgroundColor', 'borderTopColor'] },
  { tela: '07b-sala-detalhe-arena', alvo: '.arena-stat-card > small', props: ['fontFamily', 'textTransform', 'color', 'letterSpacing'] },
  { tela: '07b-sala-detalhe-arena', alvo: '.arena-stat-card > strong', props: ['fontFamily', 'fontSize', 'color'] },
  { tela: '07b-sala-detalhe-arena', alvo: '.arena-detail-seats', props: ['fontSize', 'fontWeight', 'color'] },
];

const conteudoDoHead = (folha) =>
  execFileSync('git', ['show', `HEAD:public/assets/css/${folha}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

async function subirServidor() {
  const aberto = openDatabase(':memory:');
  await aberto.migrate();
  const repositories = createRepositories(aberto.database);
  const servidor = createServer(
    createApplication({
      repositories,
      judge: createFakeJudge(),
      // O juiz de exemplo entrega o BREAKDOWN por critério: é ele que alimenta as
      // barras da nota e o diagnóstico (melhor ponto / foco agora). Com
      // `breakdown: {}` o diagnóstico não tem par para comparar e some — e a
      // captura não mostraria a peça.
      arenaJudge: async ({ candidatePrompt }) => ({
        percent: 50 + (Number(/\d+/.exec(String(candidatePrompt || ''))?.[0] || 70) % 40),
        breakdown: { objetivo: 18, contexto: 11, formato: 7 },
        feedback: 'Avaliado',
      }),
      adminPassword: SENHA,
      adminSecret: SEGREDO,
      // Relógio parado: nenhuma captura muda porque o tempo passou.
      now: () => 6000,
      id: (() => { let n = 0; return () => `redesign-${++n}`; })(),
    }),
  );
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  return { servidor, aberto, base: `http://127.0.0.1:${servidor.address().port}` };
}

// Uma sala por modo: cada rodada parte de sala nova, com os mesmos três alunos,
// a mesma dupla de missões e a mesma rodada pronta para começar.
async function prepararSala(base) {
  const login = await fetch(`${base}/api.php?action=admin_login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: SENHA }),
  });
  const cookieAdmin = login.headers.get('set-cookie').split(';')[0];
  const postar = async (action, payload = {}, cookie = cookieAdmin) => {
    const resposta = await fetch(`${base}/api.php?action=${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(payload),
    });
    const corpo = await resposta.json();
    if (resposta.status !== 200) throw new Error(`${action}: ${resposta.status} ${JSON.stringify(corpo)}`);
    return { corpo, resposta };
  };

  await postar('arena_set_open', { open: true });
  const { corpo: criada } = await postar('arena_create_room', {
    title: 'Batalha de prompts — turma da manhã',
    preset: 'personalizado',
    expected_players: 12,
  });
  const desafios = [
    {
      title: 'Cartaz da feira de ciências',
      modality: 'precisao',
      mission: 'Escreva o prompt que produz o cartaz da feira de ciências da escola, pronto para impressão.',
      context: 'Turma do 2º ano do ensino médio, linguagem jovem e direta.',
      reference_text: 'Cartaz A3 da feira de ciências, com data, local, oficinas e contato.',
      criteria: [{ criterion: 'objetivo', weight: 40 }, { criterion: 'contexto', weight: 30 }, { criterion: 'formato', weight: 30 }],
    },
    {
      title: 'Refinamento: peça futurista',
      modality: 'refinamento',
      mission: 'Melhore o prompt de partida até a peça publicitária ficar pronta para o cliente.',
      context: 'Festival de tecnologia, público de 18 a 30 anos.',
      reference_text: 'Peça com paleta ciano e roxo, luz neon e hierarquia clara de títulos.',
      criteria: [{ criterion: 'especificidade', weight: 50 }, { criterion: 'clareza', weight: 50 }],
    },
  ];
  for (const desafio of desafios) {
    const { corpo } = await postar('arena_save_challenge', desafio);
    await postar('arena_add_round', { room_id: criada.room.id, challenge_id: corpo.challenge.id });
  }
  await postar('arena_publish_room', { room_id: criada.room.id });
  // Segunda sala, no modo ARENA: é a única superfície onde a faixa de
  // indicadores (Juiz/Boss, energia e acerto) existe de verdade. Capturá-la
  // separada mantém a comparação honesta — a sala Personalizada não deve
  // ganhar indicador que ela não tem.
  const { corpo: criadaArena } = await postar('arena_create_room', {
    title: 'Arena — turma contra o Juiz',
    preset: 'arena',
    expected_players: 12,
  });
  for (const desafio of desafios) {
    const { corpo } = await postar('arena_save_challenge', desafio);
    await postar('arena_add_round', { room_id: criadaArena.room.id, challenge_id: corpo.challenge.id });
  }
  await postar('arena_publish_room', { room_id: criadaArena.room.id });
  // A aluna do retrato entra pelo navegador, como a turma entra: os três nomes
  // de apoio são outros, porque nome repetido é entrada recusada pelo servidor.
  for (const nome of ['Bruno', 'Carla', 'Davi']) {
    await fetch(`${base}/api.php?action=arena_join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: criada.room.code, name: nome }),
    });
  }
  const tv = await postar('arena_tv_token', { room_id: criada.room.id });
  return {
    postar,
    cookieAdmin,
    cookieTv: tv.resposta.headers.get('set-cookie').split(';')[0],
    room: criada.room,
    roomArena: criadaArena.room,
    pin: criada.room.pin || criada.room.code,
  };
}

async function capturarModo(modo, contexto) {
  const { base } = contexto;
  console.log(`\n=== modo ${modo} ===`);
  const sala = await prepararSala(base);
  const navegador = await abrirNavegador();
  const pagina = await abrirPagina(navegador);
  const linhas = [];
  const falhas = [];
  const pasta = join(OUT, modo);
  mkdirSync(pasta, { recursive: true });

  if (modo === 'antes') {
    await pagina.setRequestInterception(true);
    const cache = new Map();
    pagina.on('request', (req) => {
      const url = new URL(req.url());
      const folha = FOLHAS.find((nome) => url.pathname.endsWith(`/${nome}`));
      if (req.method() !== 'GET' || !folha) return req.continue();
      if (!cache.has(folha)) cache.set(folha, conteudoDoHead(folha));
      return req.respond({ status: 200, contentType: 'text/css; charset=utf-8', body: cache.get(folha) });
    });
  }

  const semCookie = async (sessao) => {
    // `deleteCookie` recebe as FICHAS inteiras, não os nomes: uma lista vazia
    // (ou de strings) morre na serialização do protocolo e derrubava toda
    // captura autenticada com "mandatory field missing".
    const fichas = await pagina.cookies();
    if (fichas.length) await pagina.deleteCookie(...fichas);
    if (sessao) {
      await pagina.setCookie({
        name: sessao.split('=')[0],
        value: sessao.slice(sessao.indexOf('=') + 1),
        domain: new URL(base).hostname,
        path: '/',
        httpOnly: true,
      });
    }
  };

  // `rolar` existe porque o retrato é da DOBRA, não da página: sem ele, a região
  // que fica abaixo de 900 px (o roteiro de missões, por exemplo) não aparece em
  // captura nenhuma. Ele recebe um seletor e traz essa âncora para o topo.
  const retrato = async (nome, url, { cookie = null, tamanhos = [DESKTOP], agir = null, medir = true, esperarPor = null, rolar = null } = {}) => {
    try {
      await semCookie(cookie);
      for (const tamanho of tamanhos) {
        await pagina.setViewport({ width: tamanho.w, height: tamanho.h, deviceScaleFactor: 1 });
        await pagina.goto(`${base}${url}`, { waitUntil: 'networkidle2', timeout: 45_000 });
        if (esperarPor) await pagina.waitForSelector(esperarPor, { timeout: 45_000 });
        if (agir) await agir(pagina, tamanho);
        if (rolar) {
          await pagina.waitForSelector(rolar, { timeout: 45_000 });
          await pagina.evaluate((alvo) => document.querySelector(alvo)?.scrollIntoView({ block: 'start' }), rolar);
        }
        await espera(350);
        await pagina.screenshot({ path: join(pasta, `${nome}-${tamanho.w}x${tamanho.h}.png`) });
        if (!medir || tamanho.w !== DESKTOP.w) continue;
        for (const medida of MEDIDAS.filter((m) => m.tela === nome)) {
          const valores = await pagina.evaluate(
            ([alvo, props, pseudo]) => {
              const no = document.querySelector(alvo);
              if (!no) return null;
              const estilo = getComputedStyle(no, pseudo || undefined);
              return Object.fromEntries(props.map((p) => [p, estilo[p]]));
            },
            [medida.alvo, medida.props, medida.pseudo || ''],
          );
          linhas.push({ modo, tela: medida.tela, alvo: medida.rotulo || medida.alvo, ...(valores || { ausente: true }) });
        }
      }
    } catch (erro) {
      falhas.push(`${nome}: ${erro.message}`);
    }
  };

  // ---- superfícies públicas -------------------------------------------------
  await retrato('01-portal', '/', { tamanhos: [DESKTOP, CELULAR] });
  await retrato('02-entrada-aluno', '/play', { tamanhos: [DESKTOP, CELULAR] });
  await retrato('03-login-painel', '/admin-arena.php', { tamanhos: [DESKTOP, CELULAR] });
  await retrato('04-nao-encontrada', '/nao-existe', { tamanhos: [DESKTOP, CELULAR] });
  await retrato('05-tv-conecta', '/tv.php', { tamanhos: [TV, DESKTOP] });

  // ---- painel e relatório ---------------------------------------------------
  await retrato('06-painel-do-professor', '/admin-arena.php', { cookie: sala.cookieAdmin, tamanhos: [DESKTOP] });
  await retrato('07-sala-detalhe', '/admin-arena.php', {
    cookie: sala.cookieAdmin,
    tamanhos: [DESKTOP, CELULAR],
    agir: async (p) => {
      await p.waitForSelector(`[data-room-id="${sala.room.id}"] [data-action=detail]`, { timeout: 45_000 });
      await p.click(`[data-room-id="${sala.room.id}"] [data-action=detail]`);
      await p.waitForSelector('[data-arena-detail]:not([hidden])', { timeout: 45_000 });
      await espera(600);
    },
  });
  // O roteiro de missões: a outra metade do desenho da referência (linhas, no
  // lugar do cartão). Fica abaixo da dobra, então esta captura rola até ele.
  await retrato('07c-sala-detalhe-missoes', '/admin-arena.php', {
    cookie: sala.cookieAdmin,
    tamanhos: [DESKTOP, CELULAR],
    agir: async (p) => {
      await p.waitForSelector(`[data-room-id="${sala.room.id}"] [data-action=detail]`, { timeout: 45_000 });
      await p.click(`[data-room-id="${sala.room.id}"] [data-action=detail]`);
      await p.waitForSelector('[data-arena-detail]:not([hidden]) .arena-round-row', { timeout: 45_000 });
      await espera(600);
    },
    rolar: '.arena-detail-section-head',
  });
  // A mesma tela no modo Arena: é a única que tem a faixa de indicadores.
  await retrato('07b-sala-detalhe-arena', '/admin-arena.php', {
    cookie: sala.cookieAdmin,
    tamanhos: [DESKTOP, CELULAR],
    agir: async (p) => {
      await p.waitForSelector(`[data-room-id="${sala.roomArena.id}"] [data-action=detail]`, { timeout: 45_000 });
      await p.click(`[data-room-id="${sala.roomArena.id}"] [data-action=detail]`);
      await p.waitForSelector('[data-arena-detail]:not([hidden]) .arena-detail-stats', { timeout: 45_000 });
      await espera(600);
    },
  });
  await retrato('08-relatorio', '/report.php', { cookie: sala.cookieAdmin, tamanhos: [DESKTOP] });

  // ---- prévias --------------------------------------------------------------
  await retrato('09-previa-aluno', `/aluno-preview.php?room=${sala.room.id}`, { cookie: sala.cookieAdmin, tamanhos: [DESKTOP, CELULAR] });
  await retrato('10-previa-tv', `/tv-preview.php?room=${sala.room.id}`, { cookie: sala.cookieAdmin, tamanhos: [TV] });

  // ---- projeção autorizada --------------------------------------------------
  await retrato('11-tv-projecao', `/tv.php?pin=${sala.pin}`, { cookie: sala.cookieTv, tamanhos: [TV] });

  // ---- aluno: espera, missão, resultado e fim -------------------------------
  try {
    await semCookie(null);
    await pagina.setViewport({ width: CELULAR.w, height: CELULAR.h, deviceScaleFactor: 1 });
    await pagina.goto(`${base}/play?pin=${sala.room.code}`, { waitUntil: 'networkidle2', timeout: 45_000 });
    await pagina.type('[data-arena-join-form] [name=name]', 'Ana');
    await pagina.click('[data-arena-join-form] button[type=submit]');
    await pagina.waitForSelector('[data-arena-screen="lobby"].is-active', { timeout: 45_000 });
    await espera(500);
    for (const tamanho of [CELULAR, DESKTOP]) {
      await pagina.setViewport({ width: tamanho.w, height: tamanho.h, deviceScaleFactor: 1 });
      await espera(400);
      await pagina.screenshot({ path: join(pasta, `12-aluno-espera-${tamanho.w}x${tamanho.h}.png`) });
      if (tamanho === DESKTOP) {
        for (const medida of MEDIDAS.filter((m) => m.tela === '12-aluno-espera')) {
          const valores = await pagina.evaluate(
            ([alvo, props, pseudo]) => {
              const no = document.querySelector(alvo);
              if (!no) return null;
              const estilo = getComputedStyle(no, pseudo || undefined);
              return Object.fromEntries(props.map((p) => [p, estilo[p]]));
            },
            [medida.alvo, medida.props, medida.pseudo || ''],
          );
          linhas.push({ modo, tela: medida.tela, alvo: medida.rotulo || medida.alvo, ...(valores || { ausente: true }) });
        }
      }
    }

    await sala.postar('arena_start_round', { room_id: sala.room.id });
    await pagina.waitForSelector('[data-arena-prompt-form] textarea', { visible: true, timeout: 45_000 });
    await espera(700);
    for (const tamanho of [CELULAR, DESKTOP]) {
      await pagina.setViewport({ width: tamanho.w, height: tamanho.h, deviceScaleFactor: 1 });
      await espera(400);
      await pagina.screenshot({ path: join(pasta, `13-aluno-missao-${tamanho.w}x${tamanho.h}.png`) });
      if (tamanho !== DESKTOP) continue;
      for (const medida of MEDIDAS.filter((m) => m.tela === '13-aluno-missao')) {
        const valores = await pagina.evaluate(
          ([alvo, props, pseudo]) => {
            const no = document.querySelector(alvo);
            if (!no) return null;
            const estilo = getComputedStyle(no, pseudo || undefined);
            return Object.fromEntries(props.map((p) => [p, estilo[p]]));
          },
          [medida.alvo, medida.props, medida.pseudo || ''],
        );
        linhas.push({ modo, tela: medida.tela, alvo: medida.rotulo || medida.alvo, ...(valores || { ausente: true }) });
      }
    }

    await pagina.setViewport({ width: CELULAR.w, height: CELULAR.h, deviceScaleFactor: 1 });
    await pagina.type('[data-arena-prompt-form] textarea', 'Cartaz A3 da feira de ciências de 2026, com data, local, oficinas e contato, linguagem jovem.');
    await pagina.click('[data-arena-send]');
    await pagina.waitForFunction(() => !document.querySelector('[data-arena-result]')?.hidden, { timeout: 45_000 });
    await espera(600);
    await pagina.screenshot({ path: join(pasta, '14-aluno-resultado-390x844.png') });
    await pagina.setViewport({ width: DESKTOP.w, height: DESKTOP.h, deviceScaleFactor: 1 });
    await espera(400);
    await pagina.screenshot({ path: join(pasta, '14-aluno-resultado-1440x900.png') });
    for (const medida of MEDIDAS.filter((m) => m.tela === '14-aluno-resultado')) {
      const valores = await pagina.evaluate(
        ([alvo, props, pseudo]) => {
          const no = document.querySelector(alvo);
          if (!no) return null;
          const estilo = getComputedStyle(no, pseudo || undefined);
          return Object.fromEntries(props.map((p) => [p, estilo[p]]));
        },
        [medida.alvo, medida.props, medida.pseudo || ''],
      );
      linhas.push({ modo, tela: medida.tela, alvo: medida.rotulo || medida.alvo, ...(valores || { ausente: true }) });
    }

    // Fim da rodada. Neste produto o aluno VOLTA à espera quando a rodada
    // termina — o nome do arquivo diz isso, para ninguém procurar aqui uma
    // tela de classificação que a rodada não abre.
    await sala.postar('arena_end_round', { room_id: sala.room.id });
    await espera(1500);
    await pagina.screenshot({ path: join(pasta, '15-aluno-pos-rodada-1440x900.png') });
    await pagina.setViewport({ width: CELULAR.w, height: CELULAR.h, deviceScaleFactor: 1 });
    await espera(400);
    await pagina.screenshot({ path: join(pasta, '15-aluno-pos-rodada-390x844.png') });

    // Resultados fechados pelo professor: mesma espera, com a classificação à vista.
    await sala.postar('arena_close_round', { room_id: sala.room.id });
    await espera(1500);
    await pagina.screenshot({ path: join(pasta, '16-aluno-pos-fechamento-390x844.png') });
    await pagina.setViewport({ width: DESKTOP.w, height: DESKTOP.h, deviceScaleFactor: 1 });
    await espera(400);
    await pagina.screenshot({ path: join(pasta, '16-aluno-pos-fechamento-1440x900.png') });
  } catch (erro) {
    falhas.push(`aluno (espera/missão/resultado/fim): ${erro.message}`);
  }

  await navegador.close();
  return { linhas, falhas };
}

const { servidor, aberto: banco, base } = await subirServidor();
const medidas = [];
const problemas = [];
try {
  for (const modo of ['antes', 'depois']) {
    const { linhas, falhas } = await capturarModo(modo, { base, aberto: banco });
    medidas.push(...linhas);
    problemas.push(...falhas.map((f) => `${modo} — ${f}`));
  }
} finally {
  servidor.closeAllConnections?.();
  await new Promise((resolve) => servidor.close(resolve));
  banco.close();
}

writeFileSync(join(OUT, 'medida.json'), `${JSON.stringify(medidas, null, 2)}\n`);

// Tabela antes/depois para leitura humana: uma linha por alvo, uma coluna por
// propriedade, e só o que MUDOU aparece.
const pares = new Map();
for (const linha of medidas) {
  const chave = `${linha.tela}${linha.alvo}`;
  if (!pares.has(chave)) pares.set(chave, { tela: linha.tela, alvo: linha.alvo, props: {} });
  Object.assign(pares.get(chave).props[linha.modo] ??= {}, linha);
}
let mudancas = 0;
for (const { tela, alvo, props } of pares.values()) {
  const antes = props.antes || {};
  const depois = props.depois || {};
  for (const prop of Object.keys({ ...antes, ...depois })) {
    if (['modo', 'tela', 'alvo', 'ausente'].includes(prop)) continue;
    if (antes[prop] === depois[prop]) continue;
    mudancas += 1;
    console.log(`${tela} ${alvo} ${prop}: ${String(antes[prop] ?? '-').slice(0, 70)} -> ${String(depois[prop] ?? '-').slice(0, 70)}`);
  }
}
for (const medida of medidas.filter((m) => m.ausente)) console.log(`alvo ausente: ${medida.modo} ${medida.tela} ${medida.alvo}`);
for (const problema of problemas) console.log(`não capturado — ${problema}`);
console.log(`\n${mudancas} propriedade(s) mudaram; capturas em ${OUT}/{antes,depois}`);
