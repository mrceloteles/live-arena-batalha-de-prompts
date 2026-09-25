// Captura e mede a etapa 4 do refinamento visual de 16/09/2026: o RELATÓRIO.
//
//   node output/qa/refino-etapa4.mjs antes
//   node output/qa/refino-etapa4.mjs depois
//
// Grava output/auditoria-refino-etapa4/<rotulo>/*.png, medida.json e medida.txt.
//
// O que cada número prova, e por quê. O plano pede quatro coisas concretas:
// 1. "menos rolagem no estado fechado" — mede-se a altura da página e a posição
//    do fim do conteúdo com todas as dobras fechadas, que é como o professor
//    chega; também a altura do painel FECHADO (padding, resumo, borda, sombra),
//    porque é ele que se repete seis vezes na tela;
// 2. "consultas agrupadas por assunto" — mede-se o título de cada grupo e quais
//    painéis ele contém, e conta-se dobras aninhadas (o plano reprova chegar a um
//    dado simples atravessando aberturas em série);
// 3. "o período escrito uma vez" — conta-se quantas vezes o rótulo do período
//    está pintado dentro da área de filtro;
// 4. "distinguir os dois Rodadas" — lê-se o título de cada painel.
// O estado vazio é medido separado: um aviso, não oito cartões, e a página curta.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication, DEFAULT_ROUNDS } from '../../src/server/start.mjs';
import { abrirNavegador, abrirPagina, esperarPor } from '../../test/support/navegador.mjs';

const rotulo = (process.argv[2] || 'antes').replace(/[^a-z0-9-]/gi, '');
const dir = new URL(`../auditoria-refino-etapa4/${rotulo}/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const senha = 'browser-test-password';
const aberto = openDatabase(':memory:');
await aberto.migrate();
const repositories = createRepositories(aberto.database);
const agora = Date.now();
if (!(await repositories.rooms.getActive())) {
  const jogo = await repositories.rooms.createCycle({ id: 'qa-etapa4', now: agora });
  await repositories.rooms.putRounds(jogo.id, DEFAULT_ROUNDS, agora);
}
const server = createServer(createApplication({
  repositories,
  judge: createFakeJudge(),
  arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Bom caminho.' }),
  adminPassword: senha,
  adminSecret: 'browser-test-secret-at-least-32-characters',
  // Sem isto o motor clássico recusa `register`/`start_match` no HTTP, e sem
  // partidas gravadas o relatório nasce vazio — e um relatório vazio esconde
  // justamente o que esta etapa mede.
  allowLegacyPublicApi: true,
}));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const post = async (action, payload = {}, cookie = '') => {
  const response = await fetch(`${base}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${action}: ${JSON.stringify(body)}`);
  return { body, cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
};

// Três alunos jogam a rodada inteira: é o mínimo que faz o relatório ter gráfico,
// ranking e tabela ao mesmo tempo.
const sessoes = [];
for (let estacao = 1; estacao <= 3; estacao += 1) {
  const { body } = await post('register', {
    station_id: estacao, name: `Jogador ${estacao}`, email: `j${estacao}@exemplo.com`,
    role: 'Aluno', company: 'Escola', lgpd_accept: true, mode: 'wait_all',
  });
  sessoes.push(body.session);
}
const partidas = [];
for (const sessao of sessoes) {
  const { body } = await post('start_match', { session_id: sessao.id, mode: 'wait_all' });
  partidas.push(body.match);
}
for (const [indice, partida] of partidas.entries()) {
  await post('submit_prompt', {
    match_id: partida.id, session_id: sessoes[indice].id, token: `qa-${indice}`,
    prompt: `resposta ${indice + 1} da turma`,
  });
}

const login = await post('admin_login', { password: senha });
const cookie = login.cookie;
const conferencia = await post('report_metrics', {}, cookie);
console.log('cards do relatório:', JSON.stringify(conferencia.body.metrics.cards));

const browser = await abrirNavegador({ protocolTimeout: 300_000 });
const medidas = {};
const pendentes = [];
const pagina = await abrirPagina(browser, {
  viewport: { width: 1440, height: 900 },
  cookie: { name: cookie.split('=')[0], value: cookie.slice(cookie.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
});

const registrar = async (nome) => {
  await pagina.bringToFront();
  await dormir(350);
  try {
    await pagina.screenshot({ path: fileURLToPath(new URL(`${nome}.png`, dir)) });
    console.log(`  ${nome}`);
  } catch (erro) {
    pendentes.push(`${nome}: ${erro.message.split('\n')[0]}`);
    console.log(`  PENDENTE ${nome}: ${erro.message.split('\n')[0]}`);
  }
};

// Tudo medido no DOM pintado. `checkVisibility` porque o relatório esconde blocos
// inteiros no período vazio, e um elemento escondido não conta como leitura.
const MEDIR = `(() => {
  const frase = (el) => (el?.textContent || '').replace(/\\s+/g, ' ').trim();
  const pintado = (el) => Boolean(el && el.checkVisibility && el.checkVisibility());
  const shell = document.querySelector('.report-page-shell');
  const paineis = [...document.querySelectorAll('details.report-panel')];
  const fechados = paineis.filter((p) => !p.open);
  const estilo = (el) => {
    const s = getComputedStyle(el);
    return {
      padding: s.padding, raio: s.borderTopLeftRadius, sombra: s.boxShadow,
      borda: s.borderTopWidth + ' ' + s.borderTopColor,
    };
  };
  const blocos = [...document.querySelectorAll('[data-report-data]')];
  const visiveis = blocos.filter(pintado);
  return {
    altura: Math.round(shell.scrollHeight),
    rolagem: Math.round(shell.scrollHeight - shell.clientHeight),
    fimDoConteudo: Math.round(visiveis.reduce((max, el) => Math.max(max, el.getBoundingClientRect().bottom + window.scrollY), 0)),
    grupos: [...document.querySelectorAll('[data-report-group]')].map((g) => {
      const dobra = g.querySelector('.report-group-fold');
      return {
        chave: g.dataset.reportGroup || null,
        titulo: frase(g.querySelector('.report-group-title') || dobra?.querySelector('summary h2')),
        paineis: g.querySelectorAll('details.report-panel').length,
        blocos: g.querySelectorAll('.report-block').length,
        titulos: [...g.querySelectorAll('details.report-panel > summary h2, .report-block > h3')].map(frase),
        alturaFechado: dobra && !dobra.open ? Math.round(dobra.getBoundingClientRect().height) : null,
        caret: dobra ? getComputedStyle(dobra.querySelector('summary'), '::before').content : null,
        visivel: pintado(g),
      };
    }),
    titulosDosPaineis: paineis.map((p) => frase(p.querySelector('h2'))),
    dobradas: {
      quantas: fechados.length,
      alturas: fechados.map((p) => Math.round(p.getBoundingClientRect().height)),
      estilo: fechados.length ? estilo(fechados[0]) : null,
      resumo: fechados.length
        ? { margem: getComputedStyle(fechados[0].querySelector('summary')).marginBottom, altura: Math.round(fechados[0].querySelector('summary').getBoundingClientRect().height) }
        : null,
      soma: fechados.reduce((total, p) => total + p.getBoundingClientRect().height + 16, 0),
    },
    periodo: [...document.querySelectorAll('.report-filters *')]
      .filter((el) => el.children.length === 0 && /todo o per/i.test(el.textContent || ''))
      .map((el) => ({ classe: el.className, texto: frase(el), pintado: pintado(el) })),
    dobrasAninhadas: document.querySelectorAll('details details').length,
    avisosVazios: [...document.querySelectorAll('.report-page-shell *')]
      .filter((el) => el.children.length === 0 && /sem dados no periodo/i.test(el.textContent || '') && pintado(el)).length,
    blocosEscondidos: blocos.filter((el) => el.hidden).length,
    gruposPintados: [...document.querySelectorAll('[data-report-group]')].filter(pintado).length,
  };
})()`;

const medir = () => pagina.evaluate(MEDIR);
const rolarAte = async (seletor) => {
  await pagina.evaluate((alvo) => document.querySelector(alvo)?.scrollIntoView({ block: 'start' }), seletor);
  await dormir(350);
};

try {
  await pagina.goto(`${base}/report.php`, { waitUntil: 'networkidle2', timeout: 45_000 });
  await esperarPor(pagina, () => document.querySelectorAll('[data-player-table] tbody tr').length > 0, { descricao: 'as partidas jogadas' });
  await dormir(600);

  // --- Fechado, como o professor chega -------------------------------------
  await pagina.evaluate(() => { window.scrollTo(0, 0); });
  medidas.fechado1440 = await medir();
  await registrar('01-fechado-1440');
  await rolarAte('[data-report-group]:last-of-type');
  await registrar('02-fim-da-pagina-1440');

  // --- A impressão ainda mostra o período? ---------------------------------
  // Tirar a segunda cópia da TELA não pode ter tirado o período do PAPEL. A
  // filtragem removeu o `data-report-print-period`, então o que sustenta a
  // impressão é a pílula do filtro — e isso só se prova com a mídia print.
  const sessaoCdp = await pagina.createCDPSession();
  await sessaoCdp.send('Emulation.setEmulatedMedia', { media: 'print' });
  await dormir(400);
  medidas.fechado1440.impressao = await pagina.evaluate(`(() => {
    const pintado = (el) => Boolean(el && el.checkVisibility && el.checkVisibility());
    const iguais = [...document.querySelectorAll('.report-page-shell *')]
      .filter((el) => el.children.length === 0 && /todo o per/i.test(el.textContent || '') && pintado(el));
    return { quantos: iguais.length, onde: iguais.map((el) => el.className || el.tagName) };
  })()`);
  await registrar('07-impressao-1440');
  await sessaoCdp.send('Emulation.setEmulatedMedia', { media: '' });
  await dormir(300);

  // --- Uma consulta aberta, por assunto ------------------------------------
  await pagina.evaluate(() => {
    document.querySelectorAll('details.report-panel').forEach((dobra, indice) => { dobra.open = indice < 2; });
  });
  await dormir(500);
  medidas.consultaAberta = await medir();
  await rolarAte('[data-report-group]');
  await registrar('03-consulta-aberta-1440');

  // --- Período sem dados ---------------------------------------------------
  await pagina.evaluate(() => {
    const form = document.querySelector('[data-report-filters]');
    form.elements.start_date.value = '2030-01-01';
    form.elements.end_date.value = '2030-01-31';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await esperarPor(pagina, () => document.querySelector('[data-report-empty]')?.hidden === false, { descricao: 'o estado vazio' });
  await dormir(500);
  await pagina.evaluate(() => { window.scrollTo(0, 0); });
  medidas.vazio1440 = await medir();
  await registrar('04-periodo-vazio-1440');

  // --- Celular -------------------------------------------------------------
  await pagina.evaluate(() => {
    const form = document.querySelector('[data-report-filters]');
    form.elements.start_date.value = '';
    form.elements.end_date.value = '';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await esperarPor(pagina, () => document.querySelector('[data-report-empty]')?.hidden === true, { descricao: 'o relatório de volta cheio' });
  await pagina.setViewport({ width: 390, height: 844 });
  await dormir(600);
  await pagina.evaluate(() => {
    document.querySelectorAll('details.report-panel').forEach((dobra) => { dobra.open = false; });
    window.scrollTo(0, 0);
  });
  await dormir(400);
  medidas.fechado390 = await medir();
  await registrar('05-fechado-390');
  await rolarAte('[data-report-group]:last-of-type');
  await registrar('06-fim-da-pagina-390');
} finally {
  writeFileSync(new URL('medida.json', dir), `${JSON.stringify(medidas, null, 2)}\n`);
  writeFileSync(new URL('medida.txt', dir), `${linhas(medidas)}\n`);
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  aberto.close();
}

// Uma página de números em texto para o AUDIT e para o diff entre rodadas.
function linhas(dados) {
  const saida = [];
  for (const [estado, m] of Object.entries(dados)) {
    saida.push(`## ${estado}`);
    saida.push(`altura=${m.altura} rolagem=${m.rolagem} fimDoConteudo=${m.fimDoConteudo}`);
    saida.push(`paineis fechados: ${m.dobradas.quantas} alturas=[${m.dobradas.alturas.join(', ')}] soma=${Math.round(m.dobradas.soma)}`);
    if (m.impressao) saida.push(`impressao: ${m.impressao.quantos} x o periodo ${JSON.stringify(m.impressao.onde)}`);
    saida.push(`painel fechado: ${JSON.stringify(m.dobradas.estilo)} resumo=${JSON.stringify(m.dobradas.resumo)}`);
    saida.push(`periodo pintado: ${m.periodo.filter((p) => p.pintado).length} ${JSON.stringify(m.periodo)}`);
    saida.push(`dobras aninhadas=${m.dobrasAninhadas} avisos vazios=${m.avisosVazios} blocos escondidos=${m.blocosEscondidos} grupos pintados=${m.gruposPintados}`);
    for (const g of m.grupos) {
      saida.push(`  grupo ${g.chave || '(sem chave)'} "${g.titulo}" paineis=${g.paineis} blocos=${g.blocos} alturaFechado=${g.alturaFechado} caret=${g.caret} -> ${JSON.stringify(g.titulos)}`);
    }
    saida.push(`titulos: ${JSON.stringify(m.titulosDosPaineis)}`);
    saida.push('');
  }
  return saida.join('\n');
}
