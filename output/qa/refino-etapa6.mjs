// Captura e mede a etapa 6 do refinamento visual de 16/09/2026: PORTAL, ACESSOS
// (entrada do aluno e login do professor) e TV (cabeçalho e diálogo de projeção).
//
//   node output/qa/refino-etapa6.mjs antes
//   node output/qa/refino-etapa6.mjs depois
//
// Grava output/auditoria-refino-etapa6/<rotulo>/*.png e medida.json.
//
// O que cada número prova, e por quê. O plano pede quatro coisas:
// 1. TV — "avaliar o excesso de altura do cabeçalho, incluindo a LINHA ISOLADA
//    do botão Tela cheia". A barra é uma grade de três colunas com o selo LIVE
//    num pseudo-elemento com posição explícita (coluna 3, linha 1); o botão é
//    auto-colocado e sobra para a linha 2. Isso não se vê no CSS lido, só no
//    layout: por isso se mede a altura da barra, quantas linhas de topo os
//    filhos ocupam e se o botão está sozinho na linha dele;
// 2. TV — "reunir ferramentas numa faixa discreta, sem obstruir o conteúdo":
//    mede-se onde começa o palco e o conteúdo do estado, e compara-se com a
//    altura da barra (quanto da tela a administração consome antes da turma ver
//    o que interessa). As duas resoluções de projeção entram;
// 3. projeção — "priorizar QR e código e manter a alternativa por endereço":
//    mede-se a ordem no DOM e a altura de cada peça, o tamanho do código e
//    quantas vezes a URL aparece escrita;
// 4. acessos e portal — "uniformizar botões e foco com o resto do produto" e
//    "não ampliar o cartão": mede-se o estilo computado do botão de cada tela
//    ao lado do botão padrão do produto (o `arena-submit` da rodada) e o anel de
//    foco, além de a composição do portal caber na primeira tela.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { abrirNavegador, abrirPagina, esperarPor } from '../../test/support/navegador.mjs';

const rotulo = (process.argv[2] || 'antes').replace(/[^a-z0-9-]/gi, '');
const dir = new URL(`../auditoria-refino-etapa6/${rotulo}/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const senha = 'browser-test-password';
const opened = openDatabase(':memory:');
await opened.migrate();
const repositories = createRepositories(opened.database);
const server = createServer(createApplication({
  repositories,
  judge: createFakeJudge(),
  arenaJudge: async () => ({
    percent: 80,
    breakdown: { objetivo: 80, contexto: 80, formato: 80 },
    feedback: 'O objetivo está claro. Especifique o público e o formato da resposta.',
  }),
  adminPassword: senha,
  adminSecret: 'browser-test-secret-at-least-32-characters',
}));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: senha }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
let cookieTv = '';
const post = async (action, payload = {}) => {
  const response = await fetch(`${base}/api.php?action=${action}`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${action}: ${JSON.stringify(body)}`);
  return body;
};

const missao = (titulo) => `Crie um prompt para produzir ${titulo}. Informe o público, a finalidade e os dados que precisam aparecer. A resposta deve estar pronta para uso pela escola.`;

await post('arena_set_open', { open: true });
const { room: operando } = await post('arena_create_room', { title: 'Oficina de prompts', preset: 'personalizado', expected_players: 8 });
for (const titulo of ['o cartaz da feira', 'o post de robótica', 'o convite da mostra']) {
  const { challenge } = await post('arena_save_challenge', {
    title: `Missão ${titulo}`,
    modality: 'precisao',
    mission: missao(titulo),
    context: 'Turma do ensino médio organizando uma mostra de projetos.',
    reference_text: 'Produza o material para estudantes e famílias, com data, local, programação e contato.',
    duration_seconds: 180,
    criteria: [{ criterion: 'objetivo', weight: 40 }, { criterion: 'contexto', weight: 30 }, { criterion: 'formato', weight: 30 }],
  });
  await post('arena_add_round', { room_id: operando.id, challenge_id: challenge.id });
}
await post('arena_publish_room', { room_id: operando.id });
const alunosDoFixture = [];
for (const nome of ['Ana', 'Bruno', 'Caio', 'Duda', 'Elis', 'Fábio', 'Gabi', 'Hugo']) {
  const resposta = await fetch(`${base}/api.php?action=arena_join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: operando.pin || operando.code, name: nome }),
  });
  const corpo = await resposta.json();
  if (!corpo.ok) throw new Error(`join ${nome}: ${JSON.stringify(corpo)}`);
  alunosDoFixture.push({ nome, id: corpo.participant.id, token: corpo.token });
}
const pin = operando.pin || operando.code;
// Sessão de projeção de verdade: a prévia (`/tv-preview.php`) traz uma barra
// administrativa ENTRE a barra da TV e o palco, então medir só a prévia mentiria
// sobre quanto a administração consome antes de a turma ver o conteúdo.
const respostaTv = await fetch(`${base}/api.php?action=arena_tv_token`, {
  method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ room_id: operando.id }),
});
if (!respostaTv.ok) throw new Error(`arena_tv_token: ${await respostaTv.text()}`);
cookieTv = respostaTv.headers.get('set-cookie').split(';')[0];

const browser = await abrirNavegador({ protocolTimeout: 300_000 });
const medidas = {};
const pendentes = [];
const doAdmin = { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' };

const registrar = async (pagina, nome) => {
  // Sem `bringToFront` a captura de uma página que não está na frente paga o
  // custo de um quadro parado: já foram 112 s por captura numa rodada anterior.
  await pagina.bringToFront();
  try {
    await dormir(320);
    await pagina.screenshot({ path: fileURLToPath(new URL(`${nome}.png`, dir)) });
    console.log(`  ${nome}`);
  } catch (erro) {
    pendentes.push(`${nome}: ${erro.message.split('\n')[0]}`);
    console.log(`  PENDENTE ${nome}: ${erro.message.split('\n')[0]}`);
  }
};

const tentar = async (nome, tarefa) => {
  try {
    await tarefa();
  } catch (erro) {
    pendentes.push(`${nome}: ${erro.message.split('\n')[0]}`);
    console.log(`  PENDENTE ${nome}: ${erro.message.split('\n')[0]}`);
  }
};

const medir = (pagina, fn, arg) => pagina.evaluate(fn, arg);

// Estilo que interessa para comparar botões entre telas: forma, tamanho, peso e
// relevo. É o mesmo recorte que a etapa 3 usou para provar que a ação secundária
// pesava como a principal.
//
// Fonte de função, e não função de verdade, porque `evaluate` roda no navegador:
// o que atravessa é o TEXTO. E ele precisa ir dentro de uma expressão
// auto-invocada — uma arrow nua passa como valor e a serialização a devolve como
// `{}`; foi o que esvaziou a primeira rodada destas medidas.
const ESTILO_BOTAO = `(no) => {
  if (!no) return null;
  const s = getComputedStyle(no);
  const r = no.getBoundingClientRect();
  return {
    largura: Math.round(r.width), altura: Math.round(r.height),
    raio: s.borderRadius, padding: s.padding, fonte: s.fontSize, peso: s.fontWeight,
    fundo: s.backgroundColor, gradiente: s.backgroundImage !== 'none',
    sombra: s.boxShadow === 'none' ? null : s.boxShadow.slice(0, 44),
    anel: s.outlineWidth + ' ' + s.outlineStyle + ' ' + s.outlineColor + ' / ' + s.outlineOffset,
  };
}`;

// --- TV: cabeçalho ---------------------------------------------------------
// A pergunta é objetiva: o botão "Tela cheia" está sozinho numa linha? Quantos
// pixels a barra consome antes do palco começar? O selo LIVE vem de um
// pseudo-elemento, então o que se conta é a caixa dos filhos de verdade e o
// topo de cada um relativo à barra.
const medirTV = (alvo) => alvo.evaluate(`(() => {
  const px = (nó) => (nó ? Math.round(nó.getBoundingClientRect().top) : null);
  const barra = document.querySelector('.arena-tv-topbar');
  const rb = barra.getBoundingClientRect();
  const filhos = [...barra.children].map((nó) => {
    const b = nó.getBoundingClientRect();
    return { classe: String(nó.className).split(' ')[0], topo: Math.round(b.top - rb.top), altura: Math.round(b.height), largura: Math.round(b.width) };
  });
  const botao = document.querySelector('[data-tv-fullscreen]');
  const topoDoBotao = botao ? Math.round(botao.getBoundingClientRect().top - rb.top) : null;
  const estilosDosFilhosNoTopo = new Set(filhos.map((f) => f.topo));
  const palco = document.querySelector('[data-tv-stage]');
  const conteudo = document.querySelector('[data-tv-content]');
  const s = getComputedStyle(barra);
  return {
    alturaDaBarra: Math.round(rb.height),
    fundoDaBarra: s.backgroundColor,
    colunas: s.gridTemplateColumns,
    filhos,
    linhasDeTopo: [...estilosDosFilhosNoTopo].sort((a, b) => a - b),
    topoDoBotao,
    botaoSozinhoNaLinha: topoDoBotao !== null && filhos.filter((f) => f.topo === topoDoBotao).length === 1,
    alturaDoBotao: botao ? Math.round(botao.getBoundingClientRect().height) : null,
    topoDoPalco: px(palco),
    topoDoConteudo: px(conteudo),
    alturaDoConteudo: conteudo ? Math.round(conteudo.getBoundingClientRect().height) : null,
    rolagemDaPagina: Math.round(document.documentElement.scrollHeight),
  };
})()`);

try {
  // --- Portal --------------------------------------------------------------
  const portal = await abrirPagina(browser, { viewport: { width: 1440, height: 900 } });
  await portal.goto(base);
  await dormir(500);
  medidas.portal1440 = await medir(portal, (alturaDaJanela) => {
    const hero = document.querySelector('.portal-hero');
    const rh = hero.getBoundingClientRect();
    const casca = document.querySelector('.portal-shell');
    const textura = getComputedStyle(casca, '::before');
    const filhos = [...hero.children].map((nó) => {
      const b = nó.getBoundingClientRect();
      return { classe: String(nó.className).split(' ')[0], topo: Math.round(b.top), altura: Math.round(b.height) };
    });
    return {
      alturaDaJanela,
      alturaDoHero: Math.round(rh.height),
      larguraDoHero: Math.round(rh.width),
      topoDoHero: Math.round(rh.top),
      baseDoHero: Math.round(rh.bottom),
      cabeNaPrimeiraTela: rh.bottom <= alturaDaJanela && rh.top >= 0,
      filhos,
      texturaDoPortal: { imagem: textura.backgroundImage.slice(0, 90), tamanho: textura.backgroundSize, mascara: textura.maskImage.slice(0, 60) },
      fundoDaCasca: getComputedStyle(casca).backgroundColor,
      texto: hero.innerText.trim(),
    };
  }, 900);
  await registrar(portal, '01-portal-1440');
  await portal.setViewport({ width: 390, height: 844 });
  await dormir(400);
  medidas.portal390 = await medir(portal, () => {
    const hero = document.querySelector('.portal-hero');
    const rh = hero.getBoundingClientRect();
    return {
      alturaDaJanela: 844,
      alturaDoHero: Math.round(rh.height), larguraDoHero: Math.round(rh.width),
      topoDoHero: Math.round(rh.top), baseDoHero: Math.round(rh.bottom),
      cabeNaPrimeiraTela: rh.bottom <= 844 && rh.top >= 0,
      margemLateral: Math.round(rh.left),
      titulo: getComputedStyle(document.querySelector('.portal-hero-headline')).fontSize,
    };
  });
  await registrar(portal, '02-portal-390');
  await portal.close();

  // --- Entrada do aluno ----------------------------------------------------
  const entrada = await abrirPagina(browser, { viewport: { width: 1440, height: 900 } });
  await entrada.goto(`${base}/play?pin=${encodeURIComponent(pin)}`);
  await esperarPor(entrada, () => Boolean(document.querySelector('[data-arena-join-form]')), { descricao: 'a entrada do aluno' });
  await dormir(500);
  const medirEntrada = (janela) => entrada.evaluate(`(() => {
    const px = (nó) => (nó ? Math.round(nó.getBoundingClientRect().top) : null);
    const cartao = document.querySelector('.join-card');
    const rc = cartao.getBoundingClientRect();
    const estilo = ${ESTILO_BOTAO};
    const entrar = document.querySelector('[data-arena-join-form] button[type=submit]');
    const referencia = document.querySelector('.arena-submit');
    return {
      alturaDaJanela: ${janela},
      alturaDoCartao: Math.round(rc.height), larguraDoCartao: Math.round(rc.width),
      topoDoCartao: Math.round(rc.top), baseDoCartao: Math.round(rc.bottom),
      cabeNaPrimeiraTela: rc.top >= 0 && rc.bottom <= ${janela},
      titulo: document.querySelector('.join-head h1')?.textContent.trim(),
      kicker: document.querySelector('.arena-kicker')?.textContent.trim() || null,
      elementosDoCartao: [...cartao.children].map((nó) => String(nó.className).split(' ')[0]),
      botaoEntrar: estilo(entrar),
      botaoDeReferencia: estilo(referencia),
      rotuloDoBotao: entrar?.textContent.trim(),
      fundoDoCartao: getComputedStyle(cartao).backgroundColor,
      raioDoCartao: getComputedStyle(cartao).borderRadius,
      sombraDoCartao: getComputedStyle(cartao).boxShadow.slice(0, 44),
    };
  })()`);
  // Foco por TECLADO, e não por `.focus()` de script: `:focus-visible` não casa
  // com foco programático, e era por isso que a primeira medição lia
  // `outline-style: none` nas duas telas. A leitura é do que a pessoa vê: quantos
  // anéis o campo focado ganha (o contorno da folha + a sombra do próprio campo).
  const medirFoco = (pagina, campo) => pagina.evaluate((alvo) => {
    document.querySelector(alvo)?.focus();
    const nó = document.activeElement;
    const s = getComputedStyle(nó);
    const aneis = [];
    if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) aneis.push(`outline ${s.outlineWidth} ${s.outlineColor} +${s.outlineOffset}`);
    if (s.boxShadow && s.boxShadow !== 'none') aneis.push(`sombra ${s.boxShadow}`);
    return { alvo: nó.tagName.toLowerCase() + (nó.name ? `[name=${nó.name}]` : ''), aneis, quantosAneis: aneis.length, borda: `${s.borderTopWidth} ${s.borderTopColor}` };
  }, campo);
  medidas.entrada1440 = await medirEntrada(900);
  await registrar(entrada, '03-entrada-1440');
  // O contorno só nasce com o teclado: Tab do primeiro controle até o campo.
  await entrada.keyboard.press('Tab');
  await entrada.keyboard.press('Tab');
  await dormir(200);
  medidas.focoEntrada = await medirFoco(entrada, '[data-arena-join-form] [name=code]');
  await entrada.setViewport({ width: 390, height: 844 });
  await dormir(400);
  medidas.entrada390 = await medirEntrada(844);
  await registrar(entrada, '04-entrada-390');
  await entrada.close();

  // --- Login do professor --------------------------------------------------
  const loginPagina = await abrirPagina(browser, { viewport: { width: 1440, height: 900 } });
  await loginPagina.goto(`${base}/admin-arena.php`);
  await esperarPor(loginPagina, () => Boolean(document.querySelector('[data-admin-arena-login]')), { descricao: 'o login do professor' });
  await dormir(400);
  const medirLogin = (janela) => loginPagina.evaluate(`(() => {
    const estilo = ${ESTILO_BOTAO};
    const cartao = document.querySelector('.admin-login-card');
    const rc = cartao.getBoundingClientRect();
    const botao = document.querySelector('[data-admin-arena-login] button[type=submit]');
    const voltar = document.querySelector('.admin-login-back');
    return {
      alturaDaJanela: ${janela},
      alturaDoCartao: Math.round(rc.height), larguraDoCartao: Math.round(rc.width),
      topoDoCartao: Math.round(rc.top), baseDoCartao: Math.round(rc.bottom),
      cabeNaPrimeiraTela: rc.top >= 0 && rc.bottom <= ${janela},
      titulo: document.querySelector('.admin-login-head h1')?.textContent.trim(),
      botaoEntrar: estilo(botao),
      voltar: estilo(voltar),
      texto: cartao.innerText.trim(),
    };
  })()`);
  medidas.login1440 = await medirLogin(900);
  await registrar(loginPagina, '05-login-1440');
  await loginPagina.keyboard.press('Tab');
  await dormir(200);
  medidas.focoLogin = await medirFoco(loginPagina, '[data-admin-arena-login] [name=password]');
  await loginPagina.setViewport({ width: 390, height: 844 });
  await dormir(400);
  medidas.login390 = await medirLogin(844);
  await registrar(loginPagina, '06-login-390');
  await loginPagina.close();

  // --- TV (prévia): espera, rodada, resultado e fim -------------------------
  for (const [largura, altura, sufixo] of [[1920, 1080, '1920x1080'], [1280, 720, '1280x720']]) {
    const tv = await abrirPagina(browser, { viewport: { width: largura, height: altura }, cookie: doAdmin });
    await tv.goto(`${base}/tv-preview.php?room=${operando.id}`);
    await dormir(1200);
    medidas[`tv${sufixo}`] = {};
    for (const modo of ['lobby', 'round', 'results', 'final']) {
      await tentar(`tv-${sufixo}-${modo}`, async () => {
        const existe = await tv.evaluate((alvo) => Boolean(document.querySelector(`[data-tv-preview-mode=${alvo}]`)), modo);
        if (existe) {
          await tv.evaluate((alvo) => document.querySelector(`[data-tv-preview-mode=${alvo}]`).click(), modo);
          await dormir(700);
        }
        const medida = await medirTV(tv);
        // A barra da prévia fica ENTRE a barra da TV e o palco: sem medi-la, o
        // topo do palco da prévia pareceria culpa do cabeçalho da TV.
        medida.barraDaPrevia = await tv.evaluate(() => {
          const barra = document.querySelector('.arena-tv-preview-bar, [data-arena-preview-bar]');
          return barra ? Math.round(barra.getBoundingClientRect().height) : null;
        });
        medidas[`tv${sufixo}`][modo] = medida;
        await registrar(tv, `07-tv-${modo}-${sufixo}`);
      });
    }
    await tv.close();
  }

  // --- TV estreita: a faixa única tem de sobreviver à largura de celular ---
  // (Só existe no "depois": o "antes" foi medido antes desta captura existir.)
  for (const [largura, altura] of [[900, 700], [640, 900]]) {
    const tvEstreita = await abrirPagina(browser, { viewport: { width: largura, height: altura }, cookie: doAdmin });
    await tentar(`tv-estreita-${largura}`, async () => {
      await tvEstreita.goto(`${base}/tv-preview.php?room=${operando.id}`);
      await dormir(1000);
      const medida = await medirTV(tvEstreita);
      medida.sobreposicao = await tvEstreita.evaluate(() => {
        const filhos = [...document.querySelector('.arena-tv-topbar').children].map((nó) => nó.getBoundingClientRect());
        let pior = 0;
        for (const a of filhos) for (const b of filhos) {
          if (a === b) continue;
          const h = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const v = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (h > 0 && v > 0) pior = Math.max(pior, Math.round(Math.min(h, v)));
        }
        return pior;
      });
      medidas[`tvEstreita${largura}`] = medida;
      await registrar(tvEstreita, `10-tv-estreita-${largura}`);
    });
    await tvEstreita.close();
  }

  // --- TV de verdade (sem a barra da prévia no meio) ------------------------
  for (const [largura, altura, sufixo] of [[1920, 1080, '1920x1080'], [1280, 720, '1280x720']]) {
    const tvReal = await abrirPagina(browser, {
      viewport: { width: largura, height: altura },
      cookie: { name: cookieTv.split('=')[0], value: cookieTv.slice(cookieTv.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
    });
    await tentar(`tv-real-${sufixo}`, async () => {
      await tvReal.goto(`${base}/tv.php?pin=${encodeURIComponent(pin)}`);
      await esperarPor(tvReal, () => Boolean(document.querySelector('.arena-tv-content')), { descricao: 'a projeção real' });
      // A barra da PRÉVIA mora fora da TV: medir a diferença é o que separa
      // "cabeçalho da TV" de "andaime do professor".
      const medida = await medirTV(tvReal);
      medida.trechoDoPalco = await tvReal.evaluate(() => document.querySelector('[data-tv-stage]')?.innerText.trim().slice(0, 80) || null);
      medidas[`tvReal${sufixo}`] = medida;
      await registrar(tvReal, `09-tv-real-${sufixo}`);
    });
    await tvReal.close();
  }

  // --- Projeção REAL em missão, resultado e fim ----------------------------
  // Capturas que o plano lista como faltantes: a projeção da turma durante a
  // partida, e não a prévia. Cada estado é montado pelo motor de verdade.
  // A sala do fixture tem oito lugares e já está cheia: a turma da partida é
  // maior, então o limite da sala sobe antes de entrar quem falta.
  await post('arena_update_room', { room_id: operando.id, expected_players: 16 });
  const alunos = [...alunosDoFixture];
  // Nomes diferentes dos oito do fixture: a sala não aceita nome repetido.
  for (const nome of ['Igor', 'Joana', 'Kaio', 'Lia', 'Murilo']) {
    const resposta = await fetch(`${base}/api.php?action=arena_join`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: pin, name: nome }),
    });
    const corpo = await resposta.json();
    if (!corpo.ok) throw new Error(`join ${nome}: ${JSON.stringify(corpo)}`);
    alunos.push({ nome, id: corpo.participant.id, token: corpo.token });
  }
  await post('arena_start_round', { room_id: operando.id });
  const rodada = (await post('arena_room_detail', { room_id: operando.id })).detail.rounds.find((r) => r.status === 'open');
  for (const aluno of alunos) {
    await post('arena_submit', {
      participant_id: aluno.id, token: aluno.token, round_id: rodada.id,
      prompt: `Cartaz para a mostra ${aluno.nome}: título, data, local, programação e contato, em linguagem clara.`,
    });
  }
  const tvPartida = await abrirPagina(browser, {
    viewport: { width: 1920, height: 1080 },
    cookie: { name: cookieTv.split('=')[0], value: cookieTv.slice(cookieTv.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
  });
  tvPartida.on('pageerror', (erro) => console.log('  [tv pageerror]', erro.message.split('\n')[0]));
  await tentar('tv-real-partida', async () => {
    await tvPartida.goto(`${base}/tv.php?pin=${encodeURIComponent(pin)}`);
    await esperarPor(tvPartida, () => /rodada|missão|Cartaz/i.test(document.querySelector('[data-tv-stage]')?.innerText || ''), { descricao: 'a missão na projeção real' });
    medidas.tvRealRodada = await medirTV(tvPartida);
    await registrar(tvPartida, '11-tv-real-rodada');
  });
  // O resultado e o fim vêm DEPOIS do cockpit: encerrar a sala tira o botão da
  // projeção do "Gerenciar sala", e a captura do diálogo (logo abaixo) ficaria
  // sem alvo — foi o que aconteceu na primeira tentativa.

  // --- Diálogo de projeção no cockpit --------------------------------------
  const admin = await abrirPagina(browser, { viewport: { width: 1440, height: 900 }, cookie: doAdmin });
  await admin.goto(`${base}/admin-arena.php`);
  // A sala do diálogo é uma sala NOVA, em preparação: quando a partida já está
  // correndo, o botão da projeção deixa de abrir o diálogo do código curto e
  // passa a abrir a projeção real em outra aba — e o alvo do roteiro deixa de
  // existir. Medir o diálogo exige o estado em que ele existe.
  const { room: salaDaProjecao } = await post('arena_create_room', { title: 'Sala da projeção', preset: 'personalizado', expected_players: 4 });
  const { challenge: missaoDaProjecao } = await post('arena_save_challenge', {
    title: 'Convite da mostra', modality: 'precisao', mission: missao('o convite da mostra'),
    reference_text: 'Convite com data, local e contato.', criteria: [{ criterion: 'objetivo', weight: 100 }],
  });
  await post('arena_add_round', { room_id: salaDaProjecao.id, challenge_id: missaoDaProjecao.id });
  await post('arena_publish_room', { room_id: salaDaProjecao.id });
  await admin.reload({ waitUntil: 'domcontentloaded' });
  await esperarPor(admin, (alvo) => Boolean(document.querySelector(`[data-room-id="${alvo}"] [data-action=detail]`)), { descricao: 'o cartão da sala', args: salaDaProjecao.id });
  await admin.evaluate((alvo) => document.querySelector(`[data-room-id="${alvo}"] [data-action=detail]`)?.click(), salaDaProjecao.id);
  await esperarPor(admin, () => Boolean(document.querySelector('[data-arena-detail-body] .arena-round-card')), { descricao: 'o detalhe da sala' });
  await dormir(600);
  await tentar('dialogo-de-projecao', async () => {
    // O botão da projeção vive dentro de "Gerenciar sala": abrir a dobra é o que
    // o professor faz, e sem isso o clique não teria efeito.
    await admin.evaluate(() => { const dobra = document.querySelector('[data-arena-detail-body] .arena-admin-tools'); if (dobra) dobra.open = true; });
    await dormir(300);
    await admin.click('[data-arena-detail-body] [data-action=open-tv]');
    await admin.waitForSelector('dialog[open]', { timeout: 5000 });
    await esperarPor(admin, () => Boolean(document.querySelector('[data-proj-qr] img, .arena-proj-url')), { descricao: 'o QR da projeção' });
    await dormir(500);
    const pins = { pin: salaDaProjecao.pin || salaDaProjecao.code };
    medidas.projecao = await admin.evaluate(`(() => {
      const pins = ${JSON.stringify(pins)};
      const px = (nó) => (nó ? Math.round(nó.getBoundingClientRect().top) : null);
      const altura = (nó) => (nó ? Math.round(nó.getBoundingClientRect().height) : null);
      const texto = (nó) => (nó ? nó.textContent.trim() : null);
      const caixa = document.querySelector('.arena-proj-box');
      const qr = document.querySelector('[data-proj-qr]');
      const codigo = document.querySelector('.arena-proj-code');
      const acoes = document.querySelector('.arena-proj-actions');
      const pista = document.querySelector('.arena-proj-hint');
      const url = document.querySelector('.arena-proj-url');
      const dialog = document.querySelector('dialog[open]');
      const tinta = dialog.innerText;
      const contar = (agulha) => (agulha ? tinta.split(agulha).length - 1 : 0);
      // O endereço é comparado pelo que está ESCRITO na tela: a URL do QR aponta
      // para o IP da máquina na rede local, não para o host do teste.
      const enderecoEscrito = url ? url.textContent.trim() : '';
      return {
        ordemNoDom: [...caixa.children].map((nó) => String(nó.className).split(' ')[0]),
        topoDoQr: px(qr), alturaDoQr: altura(qr),
        topoDoCodigo: px(codigo), alturaDoCodigo: altura(codigo),
        fonteDoCodigo: codigo ? getComputedStyle(codigo).fontSize : null,
        pesoDoCodigo: codigo ? getComputedStyle(codigo).fontWeight : null,
        primeiroNaTela: [['qr', px(qr)], ['codigo', px(codigo)], ['acoes', px(acoes)], ['pista', px(pista)]]
          .filter(([, t]) => t !== null).sort((a, b) => a[1] - b[1]).map(([nome]) => nome),
        alturaDoCartao: altura(caixa),
        enderecoEscrito,
        vezesQueOEnderecoAparece: contar(enderecoEscrito),
        vezesQueOPinAparece: contar(pins.pin),
        temAlternativaPorEndereco: Boolean(url),
        rotulosDasAcoes: [...(acoes?.children || [])].map((nó) => nó.textContent.trim()),
        pista: texto(pista),
      };
    })()`);
    await registrar(admin, '08-projecao');
    medidas.projecao.texto = await medir(admin, () => document.querySelector('dialog[open]').innerText.trim());
    // Fechar antes da captura seguinte: com o diálogo da projeção aberto, o
    // clique da edição cai nele e a captura 14 saía como uma segunda cópia.
    await admin.keyboard.press('Escape');
    await dormir(300);
  });
  // Captura que faltava na rodada anterior: a edição da sala pelo controle
  // "Gerenciar sala". A tentativa de 16/09 não abriu o diálogo — e isso podia ser
  // defeito do roteiro, não do produto. Aqui a dobra é aberta antes do clique.
  await tentar('editar-sala', async () => {
    await admin.evaluate(() => {
      const dobra = document.querySelector('[data-arena-detail-body] .arena-admin-tools');
      if (dobra) dobra.open = true;
    });
    await dormir(300);
    await admin.click('[data-arena-detail-body] [data-action=room-edit]');
    await admin.waitForSelector('dialog[open]', { timeout: 5000 });
    await dormir(400);
    medidas.editarSala = await medir(admin, () => {
      const dialogo = document.querySelector('dialog[open]');
      const corpo = dialogo.querySelector('[data-arena-dialog-body]');
      const titulo = dialogo.querySelector('h2, h3')?.textContent.trim() || null;
      return {
        titulo,
        campos: [...corpo.querySelectorAll('input, select, textarea')].map((nó) => nó.name || nó.tagName.toLowerCase()),
        alturaDoCartao: Math.round(dialogo.querySelector('.arena-dialog-card').getBoundingClientRect().height),
        texto: corpo.innerText.trim().slice(0, 240),
      };
    });
    await registrar(admin, '14-editar-sala');
    await admin.keyboard.press('Escape');
  });
  await admin.close();

  // --- O fim da partida, que muda o estado da sala --------------------------
  // Renovar a sessão da sala em cena. A sessão da projeção viaja num cookie do
  // navegador, e abrir o diálogo de projeção de OUTRA sala (o do cockpit, logo
  // acima) emite um token novo para aquela sala — o mesmo cookie. A TV da
  // partida passou a levar 403 e caiu sozinha em "Conectando a sala...": o
  // estado na tela era `is-connect`, com a rodada já em `results` no servidor.
  const renovada = await fetch(`${base}/api.php?action=arena_tv_token`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ room_id: operando.id }),
  });
  cookieTv = renovada.headers.get('set-cookie').split(';')[0];
  await tvPartida.setCookie({ name: cookieTv.split('=')[0], value: cookieTv.slice(cookieTv.indexOf('=') + 1), domain: '127.0.0.1', path: '/' });
  await tvPartida.reload({ waitUntil: 'domcontentloaded' });
  await dormir(1500);
  await post('arena_end_round', { room_id: operando.id });
  // Trazer a TV para a frente antes de esperar: numa aba de fundo o Chrome
  // estrangula os temporizadores (a leitura do estado é um `setInterval`), e a
  // espera de 60 s falhava enquanto o estado já tinha mudado no servidor.
  await tvPartida.bringToFront();
  await dormir(900);
  await tentar('tv-real-resultado', async () => {
    // O estado é lido pela CLASSE do conteúdo (`is-results`), e não pelo texto:
    // o palco muda de texto em cada variação de placar, e uma espera por palavra
    // reprovava o roteiro sem que houvesse defeito na tela.
    await esperarPor(tvPartida, () => document.querySelector('[data-tv-content]')?.className.includes('is-results'), { descricao: 'o resultado na projeção real' });
    medidas.tvRealResultado = await medirTV(tvPartida);
    await registrar(tvPartida, '12-tv-real-resultado');
  });
  await post('arena_end_room', { room_id: operando.id });
  await tvPartida.bringToFront();
  await dormir(900);
  await tentar('tv-real-fim', async () => {
    await esperarPor(tvPartida, () => /is-final|is-results/.test(document.querySelector('[data-tv-content]')?.className || '')
      && /campe|encerrad|final|classifica/i.test(document.querySelector('[data-tv-content]')?.innerText || ''), { descricao: 'o encerramento na projeção real' });
    medidas.tvRealFim = await medirTV(tvPartida);
    await registrar(tvPartida, '13-tv-real-fim');
  });
  await tvPartida.close();

  writeFileSync(new URL('medida.json', dir), JSON.stringify({ rotulo, medidas, pendentes }, null, 2));
  console.log(`\n${rotulo}: ${pendentes.length} pendente(s)`);
  for (const linha of pendentes) console.log(`  - ${linha}`);
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
  opened.close();
}
