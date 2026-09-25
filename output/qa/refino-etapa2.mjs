// Captura e mede a etapa 2 do refinamento visual de 16/09/2026: a barra da
// PRÉVIA DO ALUNO e os GRUPOS FECHADOS do aluno (o painel lateral da missão e
// do encerramento).
//
//   node output/qa/refino-etapa2.mjs antes
//   node output/qa/refino-etapa2.mjs depois
//
// Grava output/auditoria-refino-etapa2/<rotulo>/*.png e medida.json.
//
// O que cada número prova, e por quê:
// - barra: a altura e quantos controles ficam à vista. O plano pede que
//   identificação, voltar e seletor de estado continuem visíveis, e que a
//   navegação entre missões caia num grupo recolhível. Também pede que, com UMA
//   missão, os controles de navegação (anterior/próxima e a grade numerada)
//   desapareçam — sem perder a indicação da missão atual nem o gabarito.
// - dobras: onde fica o caret em relação ao título (a captura de referência
//   mostra a seta sozinha acima do título) e quanto ocupa o cartão fechado.
// - missão: a distância do título ao campo e do campo ao envio, que é o que
//   deixa a prévia da missão longa no celular.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { abrirNavegador, abrirPagina, esperarPor, carregar } from '../../test/support/navegador.mjs';

const rotulo = (process.argv[2] || 'antes').replace(/[^a-z0-9-]/gi, '');
const dir = new URL(`../auditoria-refino-etapa2/${rotulo}/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const senha = 'browser-test-password';
const opened = openDatabase(':memory:');
await opened.migrate();
const repositories = createRepositories(opened.database);
const server = createServer(createApplication({
  repositories,
  judge: createFakeJudge(),
  arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Bom caminho.' }),
  adminPassword: senha,
  adminSecret: 'browser-test-secret-at-least-32-characters',
}));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: senha }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const post = async (action, payload = {}) => {
  const response = await fetch(`${base}/api.php?action=${action}`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${action}: ${JSON.stringify(body)}`);
  return body;
};

const missao = (titulo) => `Crie um prompt para produzir ${titulo}. Informe o público, a finalidade e os dados que precisam aparecer.`;
const gabarito = (titulo) => `Produza ${titulo} para estudantes e famílias, com data, local, programação e contato.`;

await post('arena_set_open', { open: true });

// --- Sala A: três missões, em operação (a barra com navegação) --------------
const { room: tres } = await post('arena_create_room', { title: 'Oficina de prompts', preset: 'personalizado', expected_players: 8 });
for (const titulo of ['o cartaz da feira', 'o post de robótica', 'o convite da mostra']) {
  const { challenge } = await post('arena_save_challenge', {
    title: `Missão ${titulo}`, modality: 'precisao', mission: missao(titulo),
    context: 'Turma do ensino médio organizando uma mostra de projetos.',
    reference_text: gabarito(titulo), duration_seconds: 180,
    criteria: [{ criterion: 'objetivo', weight: 100 }],
  });
  await post('arena_add_round', { room_id: tres.id, challenge_id: challenge.id });
}
await post('arena_publish_room', { room_id: tres.id });
const alunos = [];
for (const nome of ['Ana', 'Bruno', 'Caio', 'Duda', 'Elis', 'Fábio']) {
  const resposta = await fetch(`${base}/api.php?action=arena_join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: tres.pin || tres.code, name: nome }),
  });
  const corpo = await resposta.json();
  if (!corpo.ok) throw new Error(`join ${nome}: ${JSON.stringify(corpo)}`);
  alunos.push({ nome, id: corpo.participant.id, token: corpo.token });
}

// --- Sala B: UMA missão (o caso em que a navegação não serve para nada) -----
const { room: uma } = await post('arena_create_room', { title: 'Sala de uma missão', preset: 'personalizado', expected_players: 4 });
{
  const { challenge } = await post('arena_save_challenge', {
    title: 'Missão única', modality: 'precisao', mission: missao('o bilhete da reunião'),
    context: 'Reunião de pais.', reference_text: gabarito('o bilhete da reunião'), duration_seconds: 120,
    criteria: [{ criterion: 'objetivo', weight: 100 }],
  });
  await post('arena_add_round', { room_id: uma.id, challenge_id: challenge.id });
}
await post('arena_publish_room', { room_id: uma.id });

const browser = await abrirNavegador({ protocolTimeout: 300_000 });
const medidas = {};
const pendentes = [];
const cookieAdmin = { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' };
const novaPagina = (viewport, extra = {}) => abrirPagina(browser, { viewport, cookie: cookieAdmin, ...extra });

const registrar = async (pagina, nome) => {
  await pagina.bringToFront();
  try {
    await dormir(350);
    await pagina.screenshot({ path: fileURLToPath(new URL(`${nome}.png`, dir)) });
    console.log(`  ${nome}`);
  } catch (erro) {
    pendentes.push(`${nome}: ${erro.message.split('\n')[0]}`);
    console.log(`  PENDENTE ${nome}: ${erro.message.split('\n')[0]}`);
  }
};

// --- Medidas da barra da prévia --------------------------------------------
const medirBarra = (pagina) => pagina.evaluate(() => {
  const barra = document.querySelector('[data-arena-preview-bar]');
  if (!barra) return null;
  const altura = (no) => (no ? Math.round(no.getBoundingClientRect().height) : null);
  // `offsetParent`+altura não bastam: com o `details` fechado o Chromium mantém a
  // caixa dos filhos (o `innerText` esconde, o retângulo segue lá) e a primeira
  // rodada contou os botões da dobra como visíveis. `checkVisibility` responde o
  // que está pintado, que é o que o professor vê.
  const visivel = (no) => Boolean(no && (typeof no.checkVisibility === 'function'
    ? no.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    : no.offsetParent !== null && no.getBoundingClientRect().height > 0));
  const botoes = [...barra.querySelectorAll('button, a, summary')].map((no) => ({
    rotulo: no.textContent.replace(/\s+/g, ' ').trim().slice(0, 48),
    visivel: visivel(no),
  }));
  const dobraDeNavegacao = barra.querySelector('[data-preview-nav-fold]');
  return {
    alturaDaBarra: altura(barra),
    controlesVisiveis: botoes.filter((b) => b.visivel).map((b) => b.rotulo),
    controlesEmDobra: botoes.filter((b) => !b.visivel).map((b) => b.rotulo),
    temNavegacao: Boolean(barra.querySelector('[data-preview-step]')),
    temGradeNumerada: Boolean(barra.querySelector('[data-preview-jump]')),
    gradeVisivel: visivel(barra.querySelector('.arena-preview-jump')),
    navegacaoVisivel: visivel(barra.querySelector('[data-preview-step]')),
    dobraDeNavegacaoAberta: dobraDeNavegacao ? dobraDeNavegacao.open : null,
    alturaDaGrade: altura(barra.querySelector('.arena-preview-jump')),
    alturaDaLinhaDeNavegacao: altura(barra.querySelector('.arena-preview-nav-row')),
    avisos: [...barra.querySelectorAll('.arena-preview-note, .arena-preview-sample, .arena-preview-missing')]
      .map((no) => no.textContent.replace(/\s+/g, ' ').trim()),
    contagem: barra.querySelector('.arena-preview-count')?.textContent.replace(/\s+/g, ' ').trim() || null,
    temGabarito: Boolean(barra.querySelector('[data-preview-gabarito]')),
    textoDaBarra: barra.innerText.replace(/\s+/g, ' ').trim().slice(0, 400),
    topoDaMissao: (() => {
      const painel = document.querySelector('[data-arena-mission]');
      return painel && !painel.hidden ? Math.round(painel.getBoundingClientRect().top + window.scrollY) : null;
    })(),
  };
});

// --- Medidas das dobras do aluno -------------------------------------------
const medirDobras = (pagina) => pagina.evaluate(() => [...document.querySelectorAll('.arena-side details.arena-card[data-arena-fold]')].map((dobra) => {
  const summary = dobra.querySelector(':scope > summary');
  const titulo = summary?.querySelector('h2');
  const r = (no) => no.getBoundingClientRect();
  const caixaSummary = summary ? r(summary) : null;
  const caixaTitulo = titulo ? r(titulo) : null;
  return {
    classe: dobra.className,
    aberta: dobra.open,
    alturaDoCartao: Math.round(r(dobra).height),
    alturaDoSummary: caixaSummary ? Math.round(caixaSummary.height) : null,
    alturaDoTitulo: caixaTitulo ? Math.round(caixaTitulo.height) : null,
    // Se o summary é mais alto que o título, sobrou uma linha só para o caret.
    sobraDoSummary: (caixaSummary && caixaTitulo) ? Math.round(caixaSummary.height - caixaTitulo.height) : null,
    // O caret nativo vem antes do bloco do título: deslocamento vertical > 4 px
    // quer dizer que ele ficou sozinho numa linha.
    caretAcimaDoTitulo: (caixaSummary && caixaTitulo) ? (caixaTitulo.top - caixaSummary.top) > 4 : null,
  };
}));

// --- Medidas do espaço vertical da missão ----------------------------------
const medirMissao = (pagina) => pagina.evaluate(() => {
  const px = (no) => (no ? Math.round(no.getBoundingClientRect().top + window.scrollY) : null);
  const altura = (no) => (no ? Math.round(no.getBoundingClientRect().height) : null);
  const titulo = document.querySelector('[data-arena-mission-title]');
  const tentativas = document.querySelector('.round-composer-heading');
  const campo = document.querySelector('[data-arena-prompt-form] textarea');
  const envio = document.querySelector('[data-arena-send]');
  return {
    topoDoTitulo: px(titulo),
    topoTentativas: px(tentativas),
    topoDoCampo: px(campo),
    topoDoEnvio: px(envio),
    distanciaTituloAoCampo: (px(campo) !== null && px(titulo) !== null) ? px(campo) - px(titulo) : null,
    distanciaTentativasAoCampo: (px(campo) !== null && px(tentativas) !== null) ? px(campo) - px(tentativas) : null,
    distanciaCampoAoEnvio: (px(envio) !== null && px(campo) !== null) ? px(envio) - px(campo) : null,
    alturaDoCampo: altura(campo),
    alturaDaPagina: Math.round(document.documentElement.scrollHeight),
    alturaDaTela: window.innerHeight,
  };
});

let previa;
try {
  // --- A missão ao vivo, para as medidas de missão e das dobras -------------
  await post('arena_start_round', { room_id: tres.id });
  const aluno = alunos[0];
  const celular = await abrirPagina(browser, { viewport: { width: 390, height: 844, isMobile: true, hasTouch: true } });
  await carregar(celular, `${base}/play?pin=${encodeURIComponent(tres.pin || tres.code)}`);
  await celular.evaluate((sessao) => {
    localStorage.setItem('arena.participant_id', String(sessao.id));
    localStorage.setItem('arena.token', sessao.token);
  }, aluno);
  await carregar(celular, `${base}/play?pin=${encodeURIComponent(tres.pin || tres.code)}`);
  await esperarPor(celular, () => Boolean(document.querySelector('[data-arena-mission]:not([hidden])')), { descricao: 'a missão aberta do aluno' });
  await dormir(700);
  medidas.missaoCelular = await medirMissao(celular);
  medidas.dobrasCelular = await medirDobras(celular);
  await registrar(celular, '01-aluno-missao-celular');

  const desktop = await abrirPagina(browser, { viewport: { width: 1440, height: 900 } });
  await carregar(desktop, `${base}/play?pin=${encodeURIComponent(tres.pin || tres.code)}`);
  await desktop.evaluate((sessao) => {
    localStorage.setItem('arena.participant_id', String(sessao.id));
    localStorage.setItem('arena.token', sessao.token);
  }, aluno);
  await carregar(desktop, `${base}/play?pin=${encodeURIComponent(tres.pin || tres.code)}`);
  await esperarPor(desktop, () => Boolean(document.querySelector('[data-arena-mission]:not([hidden])')), { descricao: 'a missão aberta no desktop' });
  await dormir(700);
  medidas.missaoDesktop = await medirMissao(desktop);
  medidas.dobrasDesktop = await medirDobras(desktop);
  await registrar(desktop, '02-aluno-missao-desktop');
  await desktop.close();
  await celular.close();

  // --- Encerra a rodada: o aluno passa a ter resultado e classificação ------
  for (const participante of alunos.slice(0, 4)) {
    await post('arena_submit', {
      participant_id: participante.id, token: participante.token,
      round_id: (await post('arena_room_detail', { room_id: tres.id })).detail.rounds.find((r) => r.status === 'open').id,
      prompt: `Cartaz com título, data, local, programação e contato. (${participante.nome})`,
    });
  }
  await post('arena_end_round', { room_id: tres.id });
  // A sala terminada é o caso em que as dobras do encerramento existem de
  // verdade (classificação, resultados por missão e destaques).
  await post('arena_end_room', { room_id: tres.id });
  await dormir(1200);

  // --- A barra da prévia: três missões, três estados ------------------------
  previa = await novaPagina({ width: 1440, height: 900 });
  await carregar(previa, `${base}/aluno-preview.php?room=${tres.id}`);
  await esperarPor(previa, () => Boolean(document.querySelector('[data-arena-preview-bar]')), { descricao: 'a barra da prévia' });
  await dormir(600);
  for (const [modo, nome] of [['missao', '03-previa-tres-missoes'], ['resultado', '04-previa-resultado'], ['fim', '05-previa-fim']]) {
    await previa.evaluate((alvo) => document.querySelector(`[data-preview-mode="${alvo}"]`)?.click(), modo);
    await dormir(700);
    medidas[`barra_${modo}`] = await medirBarra(previa);
    await registrar(previa, nome);
  }
  await previa.evaluate(() => document.querySelector('[data-preview-mode="missao"]')?.click());
  await dormir(500);
  await previa.evaluate(() => {
    const dobra = document.querySelector('[data-preview-nav-fold]');
    if (dobra) dobra.open = true;
  });
  await dormir(400);
  medidas.barra_navegacaoAberta = await medirBarra(previa);
  await registrar(previa, '06-previa-navegacao-aberta');

  // Celular: a barra não pode empurrar o começo da atividade para fora da tela.
  await previa.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await dormir(500);
  medidas.barraCelular = await medirBarra(previa);
  await registrar(previa, '07-previa-celular');
  await previa.close();

  // --- Uma missão: a navegação não tem para onde ir -------------------------
  const previaUma = await novaPagina({ width: 1440, height: 900 });
  await carregar(previaUma, `${base}/aluno-preview.php?room=${uma.id}`);
  await esperarPor(previaUma, () => Boolean(document.querySelector('[data-arena-preview-bar]')), { descricao: 'a barra da prévia de uma missão' });
  await dormir(600);
  medidas.barraUmaMissao = await medirBarra(previaUma);
  await registrar(previaUma, '08-previa-uma-missao');
  await previaUma.setViewport({ width: 390, height: 844 });
  await dormir(400);
  medidas.barraUmaMissaoCelular = await medirBarra(previaUma);
  await registrar(previaUma, '09-previa-uma-missao-celular');
  await previaUma.close();

  // --- O aluno no encerramento: as dobras com resultado e destaques ---------
  const fim = await novaPagina({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await carregar(fim, `${base}/play?pin=${encodeURIComponent(tres.pin || tres.code)}`);
  await fim.evaluate((sessao) => {
    localStorage.setItem('arena.participant_id', String(sessao.id));
    localStorage.setItem('arena.token', sessao.token);
  }, aluno);
  await carregar(fim, `${base}/play?pin=${encodeURIComponent(tres.pin || tres.code)}`);
  await esperarPor(fim, () => Boolean(document.querySelector('.arena-side')), { descricao: 'o painel lateral do aluno' });
  await dormir(800);
  await fim.evaluate(() => document.querySelector('.arena-side')?.scrollIntoView({ block: 'start' }));
  await dormir(400);
  medidas.dobrasFimCelular = await medirDobras(fim);
  medidas.missaoFimCelular = await medirMissao(fim);
  await registrar(fim, '10-aluno-fim-celular');
  await fim.close();

  writeFileSync(new URL('medida.json', dir), JSON.stringify({ rotulo, medidas, pendentes }, null, 2));
  console.log(`\n${rotulo}: ${pendentes.length} pendente(s)`);
  for (const linha of pendentes) console.log(`  - ${linha}`);
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
  opened.close();
}
