// Captura e mede a etapa 3 do refinamento visual de 16/09/2026: as AULAS
// (catálogo real de `src/domain/arena-lessons.mjs`) e o BANCO de desafios.
//
//   node output/qa/refino-etapa3.mjs antes
//   node output/qa/refino-etapa3.mjs depois
//
// Grava output/auditoria-refino-etapa3/<rotulo>/*.png e medida.json.
//
// O que cada número prova, e por quê. O plano pede três coisas concretas:
// 1. no estado fechado, mostrar título, descrição curta e NÚMERO de missões —
//    então mede-se o texto do resumo fechado e quantas palavras ele gasta;
// 2. alinhar as ações entre cartões da MESMA LINHA (a Aula 4 tinha menos linhas e
//    os botões começavam antes) — mede-se o topo dos botões de cada cartão, e a
//    comparação é entre cartões que dividem a mesma linha da grade;
// 3. diminuir o peso das ações secundárias — mede-se o estilo computado de cada
//    botão (fundo, borda, sombra, altura, fonte), em vez de julgar no olho.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { abrirNavegador, abrirPagina, esperarPor, carregar } from '../../test/support/navegador.mjs';

const rotulo = (process.argv[2] || 'antes').replace(/[^a-z0-9-]/gi, '');
const dir = new URL(`../auditoria-refino-etapa3/${rotulo}/`, import.meta.url);
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

await post('arena_set_open', { open: true });
// A sala existe para as aulas terem ação: sem sala selecionada, "Adicionar a
// sala" nasce desabilitado e o cartão não é o que o professor vê na aula.
const { room } = await post('arena_create_room', { title: 'Sala da aula', preset: 'personalizado', expected_players: 6 });
const criarDesafio = (titulo) => post('arena_save_challenge', {
  title: titulo, modality: 'precisao', mission: `Escreva o prompt para ${titulo}.`,
  context: 'Turma do ensino médio.', reference_text: `Referência de ${titulo}.`,
  duration_seconds: 180, criteria: [{ criterion: 'objetivo', weight: 100 }],
});
const { challenge: soUm } = await criarDesafio('Pedido do cliente');
// A sala com uma missão: é o detalhe que o professor abre e o que habilita as
// ações das aulas.
await post('arena_add_round', { room_id: room.id, challenge_id: soUm.id });

const browser = await abrirNavegador({ protocolTimeout: 300_000 });
const medidas = {};
const pendentes = [];
const pagina = await abrirPagina(browser, {
  viewport: { width: 1440, height: 900 },
  cookie: { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
});

const registrar = async (nome) => {
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

// Estilo do botão em número: é o que separa "secundário" de "primário" sem olho.
const ESTILO_DO_BOTAO = `(no) => {
  const s = getComputedStyle(no);
  const r = no.getBoundingClientRect();
  return {
    largura: Math.round(r.width), altura: Math.round(r.height),
    fundo: s.backgroundColor, gradiente: s.backgroundImage !== 'none',
    cor: s.color, borda: s.borderTopWidth + ' ' + s.borderTopColor,
    raio: s.borderRadius, sombra: s.boxShadow === 'none' ? null : s.boxShadow.slice(0, 40),
    fonte: s.fontSize, peso: s.fontWeight, padding: s.padding,
  };
}`;

const medirAulas = () => pagina.evaluate(`(() => {
  const estilo = ${ESTILO_DO_BOTAO};
  const grade = document.querySelector('[data-arena-lesson-list]');
  const g = getComputedStyle(grade);
  return {
    grade: {
      colunas: g.gridTemplateColumns, largura: Math.round(grade.getBoundingClientRect().width),
      gap: g.gap,
    },
    cartoes: [...grade.querySelectorAll('article')].map((c) => {
      const r = c.getBoundingClientRect();
      const fold = c.querySelector('.arena-lesson-fold');
      const resumo = fold?.querySelector('summary');
      const acoes = [...c.querySelectorAll('.arena-lesson-actions button')];
      return {
        titulo: c.querySelector('.arena-lesson-head strong')?.textContent.trim(),
        tituloNasLinhas: Math.round(c.querySelector('.arena-lesson-head strong')?.getBoundingClientRect().height || 0),
        resumo: resumo?.textContent.replace(/\\s+/g, ' ').trim(),
        palavrasDoResumo: (resumo?.textContent.trim().split(/\\s+/).length) || 0,
        alturaDoResumo: Math.round(resumo?.getBoundingClientRect().height || 0),
        mistura: c.querySelector('.arena-lesson-mix')?.textContent.replace(/\\s+/g, ' ').trim() || null,
        aberta: Boolean(fold?.open),
        itensNaDobra: c.querySelectorAll('.arena-lesson-chips li').length,
        alturaDaAcao: Math.round(c.querySelector('.arena-lesson-actions')?.getBoundingClientRect().height || 0),
        // Quantas linhas a área de ação usa: os dois botões cabem lado a lado?
        linhasDaAcao: new Set([...c.querySelectorAll('.arena-lesson-actions button')]
          .map((b) => Math.round(b.getBoundingClientRect().top))).size,
        topo: Math.round(r.top + window.scrollY), altura: Math.round(r.height), largura: Math.round(r.width),
        topoDaAcao: Math.round(acoes[0]?.getBoundingClientRect().top + window.scrollY || 0),
        fundoDaAcao: Math.round(acoes[0]?.getBoundingClientRect().bottom + window.scrollY || 0),
        acoes: acoes.map((b) => ({ rotulo: b.textContent.trim(), desabilitado: b.disabled, ...estilo(b) })),
      };
    }),
  };
})()`);

const medirBanco = () => pagina.evaluate(`(() => {
  const estilo = ${ESTILO_DO_BOTAO};
  const lista = document.querySelector('[data-arena-challenge-list]');
  const g = getComputedStyle(lista);
  return {
    grade: { colunas: g.gridTemplateColumns, largura: Math.round(lista.getBoundingClientRect().width), gap: g.gap },
    cartoes: [...lista.querySelectorAll('article')].map((c) => {
      const r = c.getBoundingClientRect();
      return {
        titulo: c.querySelector('.arena-challenge-head strong')?.textContent.trim(),
        largura: Math.round(r.width), altura: Math.round(r.height), topo: Math.round(r.top + window.scrollY),
        acoes: [...c.querySelectorAll('.arena-challenge-actions button')].map((b) => ({ rotulo: b.textContent.trim(), ...estilo(b) })),
      };
    }),
  };
})()`);

const rolarAte = async (seletor) => {
  await pagina.evaluate((alvo) => document.querySelector(alvo)?.scrollIntoView({ block: 'start' }), seletor);
  await dormir(400);
};

try {
  await pagina.goto(`${base}/admin-arena.php`);
  await esperarPor(pagina, () => Boolean(document.querySelector('[data-arena-room-list] [data-room-id]')), { descricao: 'a lista de salas' });
  // Seleciona a sala (é o que habilita "Adicionar a sala" nas aulas).
  await pagina.evaluate((id) => {
    document.querySelector(`[data-room-id="${id}"] [data-action=detail]`)?.click();
  }, room.id);
  await esperarPor(pagina, () => Boolean(document.querySelector('[data-arena-detail-body] .arena-round-card')), { descricao: 'o detalhe da sala' });
  await esperarPor(pagina, () => document.querySelectorAll('[data-arena-lesson-list] article').length >= 4, { descricao: 'as quatro aulas do catálogo' });
  await dormir(700);

  // --- Aulas, com as dobras fechadas (o estado em que o professor chega) ----
  await rolarAte('#lessons');
  medidas.aulasFechadas = await medirAulas();
  await registrar('01-aulas-fechadas');
  await pagina.setViewport({ width: 390, height: 844 });
  await dormir(400);
  await rolarAte('#lessons');
  medidas.aulasCelular = await medirAulas();
  await registrar('02-aulas-celular');
  await pagina.setViewport({ width: 1440, height: 900 });
  await dormir(300);
  await rolarAte('#lessons');

  // Uma aula aberta (a de sete missões) para ver o detalhe completo na dobra.
  await pagina.evaluate(() => {
    const folds = [...document.querySelectorAll('[data-arena-lesson-list] .arena-lesson-fold')];
    const alvo = folds[folds.length - 1];
    if (alvo) alvo.open = true;
  });
  await dormir(500);
  medidas.aulasUmaAberta = await medirAulas();
  await registrar('03-aulas-dobra-aberta');

  // --- Banco com UM desafio: é aqui que o cartão solitário estica ----------
  await rolarAte('#challenges');
  medidas.bancoUmDesafio = await medirBanco();
  await registrar('04-banco-um-desafio');
  await pagina.setViewport({ width: 390, height: 844 });
  await dormir(400);
  await rolarAte('#challenges');
  medidas.bancoUmDesafioCelular = await medirBanco();
  await registrar('05-banco-um-desafio-celular');
  await pagina.setViewport({ width: 1440, height: 900 });
  await dormir(300);

  // --- Banco com cinco: a grade cheia, para comparar largura e colunas ------
  for (const titulo of ['Cartaz da feira', 'Post de robótica', 'Convite da mostra', 'Bilhete da reunião']) await criarDesafio(titulo);
  await pagina.reload({ waitUntil: 'domcontentloaded' });
  await esperarPor(pagina, () => document.querySelectorAll('[data-arena-challenge-list] article').length >= 5, { descricao: 'os cinco desafios no banco' });
  await dormir(500);
  await rolarAte('#challenges');
  medidas.bancoCincoDesafios = await medirBanco();
  await registrar('06-banco-cinco-desafios');

  writeFileSync(new URL('medida.json', dir), JSON.stringify({ rotulo, medidas, pendentes }, null, 2));
  console.log(`\n${rotulo}: ${pendentes.length} pendente(s)`);
  for (const linha of pendentes) console.log(`  - ${linha}`);
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
  opened.close();
}
