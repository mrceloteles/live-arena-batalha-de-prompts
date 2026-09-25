// As prints do fluxo desta frente: "Abrir sala" (lobby + telão), a turma entrando
// e o clique de "Iniciar batalha" trocando as três telas.
//
// Além das imagens, mede o que o relatório precisa: quanto tempo cada superfície
// levou para entrar na rodada depois do clique — é a diferença entre "as três
// concordam" e "as três concordam no mesmo instante".
//
// Uso: node tmp/qa/captura-inicio-batalha.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { abrirNavegador, abrirPagina, clicarAte } from '../../test/support/navegador.mjs';

const SAIDA = new URL('../../output/inicio-da-batalha-2026-09-20/evidencias/', import.meta.url);
mkdirSync(SAIDA, { recursive: true });
const arquivo = (nome) => fileURLToPath(new URL(nome, SAIDA));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const abertos = openDatabase(':memory:');
await abertos.migrate();
const repositories = createRepositories(abertos.database);
const servidor = createServer(createApplication({
  repositories, judge: createFakeJudge(),
  arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
  adminPassword: 'captura-password', adminSecret: 'captura-secret-at-least-32-characters',
}));
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const medidas = {};

const login = await fetch(`${base}/api.php?action=admin_login`, { method: 'POST', body: JSON.stringify({ password: 'captura-password' }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const post = async (acao, carga = {}) => {
  const resposta = await fetch(`${base}/api.php?action=${acao}`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(carga),
  });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 200, `${acao}: ${JSON.stringify(corpo)}`);
  return corpo;
};
await post('arena_set_open', { open: true });
const { room } = await post('arena_create_room', { title: 'Aula que abre a sala', preset: 'personalizado', expected_players: 2 });
const { challenge } = await post('arena_save_challenge', {
  title: 'Cartaz da feira', modality: 'refinamento', attempts: 2, duration_seconds: 300,
  mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
  reference_text: 'Cartaz A3 da feira, com data, local e contato.', criteria: [{ criterion: 'objetivo', weight: 100 }],
});
await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
console.log(`sala ${room.pin || room.code} | ${room.status}`);

let navegador;
try {
  navegador = await abrirNavegador();
  const ctxProf = await navegador.createBrowserContext();
  const ctxA = await navegador.createBrowserContext();
  const ctxB = await navegador.createBrowserContext();
  const painel = await abrirPagina(navegador, { viewport: { width: 1440, height: 960 }, context: ctxProf });
  const aluna = await abrirPagina(navegador, { viewport: { width: 390, height: 844 }, context: ctxA });
  const aluno = await abrirPagina(navegador, { viewport: { width: 390, height: 844 }, context: ctxB });

  // --- o aluno espera na entrada (print do que ele vê antes de entrar)
  await aluna.goto(`${base}/play?pin=${room.code}`);
  await aluna.type('[data-arena-join-form] [name=name]', 'Ana');
  await aluna.screenshot({ path: arquivo('00-entrada-do-aluno.png') });

  // --- o professor entra e abre a sala: o telão nasce no mesmo clique
  await painel.goto(`${base}/admin-arena.php`);
  await painel.type('[name=password]', 'captura-password');
  await Promise.all([painel.waitForNavigation(), painel.click('[data-admin-arena-login] button[type=submit]')]);
  await painel.waitForSelector('[data-arena-room-list] [data-room-id]');
  await clicarAte(painel, `[data-room-id="${room.id}"] [data-action=detail]`, () => document.body.textContent.includes('Abrir'), {
    descricao: 'abrir o detalhe da sala em rascunho',
  });
  await esperar(400);
  await painel.screenshot({ path: arquivo('01-painel-sala-fechada.png') });

  const alvoDoTelao = navegador.waitForTarget((alvo) => alvo.url().includes('/tv.php'), { timeout: 20_000 });
  const tAbrir = Date.now();
  await painel.click(`[data-room-id="${room.id}"] [data-action=publish]`);
  const alvo = await alvoDoTelao;
  const telao = await alvo.page();
  await telao.setViewport({ width: 1920, height: 1080 });
  await telao.bringToFront();
  medidas.telaoAbriuMs = Date.now() - tAbrir;
  await telao.waitForSelector('.arena-tv-pin strong');
  await esperar(700);
  await telao.screenshot({ path: arquivo('02-telao-lobby-vazio.png') });
  console.log(`telão abriu em ${medidas.telaoAbriuMs} ms: ${alvo.url()}`);

  // --- um aluno entra e o outro também: o telão muda sozinho
  await aluno.goto(`${base}/play?pin=${room.code}`);
  await aluno.type('[data-arena-join-form] [name=name]', 'Bia');
  await aluno.click('[data-arena-join-form] button[type=submit]');
  await aluna.click('[data-arena-join-form] button[type=submit]');
  await telao.waitForFunction(() => document.querySelectorAll('.arena-tv-roster li:not(.arena-tv-empty-li)').length === 2, { timeout: 20_000 });
  await esperar(700);
  await telao.screenshot({ path: arquivo('03-telao-turma-completa.png') });
  await aluna.screenshot({ path: arquivo('04-aluno-aguardando.png') });

  // --- o painel, com a turma completa
  await painel.bringToFront();
  await clicarAte(painel, `[data-room-id="${room.id}"] [data-action=detail]`, () => document.querySelector('[data-arena-detail-state]')?.textContent === 'Pronta para começar', {
    descricao: 'o painel dizer que a sala está pronta',
  });
  await esperar(400);
  await painel.screenshot({ path: arquivo('05-painel-pronta-para-comecar.png') });

  // --- O CLIQUE: as três telas na mesma versão. O cronômetro começa aqui.
  const tClique = Date.now();
  await painel.evaluate(() => {
    const botao = document.querySelector('[data-arena-detail-body] [data-proximo]');
    botao.click();
    botao.click();
  });
  await painel.waitForSelector('[data-arena-detail-body] [data-action=end-round]');
  medidas.painelMs = Date.now() - tClique;
  await telao.waitForSelector('.arena-tv-round-badge');
  medidas.telaoMs = Date.now() - tClique;
  for (const pagina of [aluna, aluno]) {
    await pagina.waitForSelector('[data-arena-prompt-form] textarea', { visible: true });
  }
  medidas.alunoMs = Date.now() - tClique;
  console.log(`no clique: painel ${medidas.painelMs} ms | telão ${medidas.telaoMs} ms | alunos ${medidas.alunoMs} ms`);

  const rodadas = await repositories.arena.rounds.listByRoom(room.id);
  medidas.rodadasAbertas = rodadas.filter((r) => r.status === 'open').length;
  medidas.rodadasTotais = rodadas.length;
  console.log(`rodadas: ${medidas.rodadasTotais} (abertas: ${medidas.rodadasAbertas})`);

  await esperar(900);
  await painel.screenshot({ path: arquivo('06-painel-missao-no-ar.png') });
  await telao.bringToFront();
  await esperar(400);
  await telao.screenshot({ path: arquivo('07-telao-missao-cronometro.png') });
  await aluna.bringToFront();
  await esperar(300);
  await aluna.screenshot({ path: arquivo('08-aluno-missao-aberta.png') });

  // --- a barra de estado do painel, lida por extenso (é ela que diz a ação da vez)
  await painel.bringToFront();
  const faixa = await painel.evaluate(() => [...document.querySelectorAll('.arena-state-cell')]
    .map((celula) => `${celula.querySelector('small').textContent.trim()}: ${celula.querySelector('b').textContent.trim()}`));
  console.log('faixa de estado:', faixa.join(' | '));
  medidas.faixa = faixa;
} finally {
  writeFileSync(arquivo('medidas.json'), JSON.stringify(medidas, null, 2));
  console.log('gravado em', SAIDA.pathname);
  await navegador?.close();
  servidor.closeAllConnections();
  await new Promise((r) => servidor.close(r));
  abertos.close();
}
