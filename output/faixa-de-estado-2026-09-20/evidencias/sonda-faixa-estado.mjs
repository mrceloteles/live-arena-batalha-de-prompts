// A faixa de estado do painel, medida e fotografada na tela de verdade.
//
// O porteiro (`test/browser/painel-estado.test.mjs`) cobra o CONTEÚDO por
// estado: a faixa diz o estado vivo, o placar de envios e a ação da vez, e o
// botão marcado diz a mesma frase. O que ele não mede é o DESENHO: quantas
// pílulas azuis ficam na linha de ações (a regra da casa é uma), se a faixa
// cabe sem rolagem lateral e o que acontece com ela em 390 px. É isto — mais as
// capturas que o professor vai olhar — que sai daqui.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { abrirNavegador, abrirPagina, clicarAte, esperarPor } from '../../test/support/navegador.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createApplication } from '../../src/server/start.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

const SENHA = 'sonda-faixa-password';
const SAIDA = new URL('../../output/faixa-de-estado-2026-09-20/evidencias/', import.meta.url);
mkdirSync(SAIDA, { recursive: true });

const aberto = openDatabase(':memory:');
await aberto.migrate();
const servidor = createServer(createApplication({
  repositories: createRepositories(aberto.database),
  judge: createFakeJudge(),
  arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
  adminPassword: SENHA,
  adminSecret: 'sonda-faixa-secret-at-least-32-chars',
}));
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let navegador;
try {
  const login = await fetch(`${base}/api.php?action=admin_login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: SENHA }),
  });
  const cookieAdmin = login.headers.get('set-cookie').split(';')[0];
  const post = async (acao, carga = {}) => {
    const resposta = await fetch(`${base}/api.php?action=${acao}`, {
      method: 'POST',
      headers: { cookie: cookieAdmin, 'content-type': 'application/json' },
      body: JSON.stringify(carga),
    });
    const corpo = await resposta.json();
    assert.equal(resposta.status, 200, `${acao}: ${JSON.stringify(corpo)}`);
    return corpo;
  };

  await post('arena_set_open', { open: true });
  const { room } = await post('arena_create_room', {
    title: 'Aula de prompts — turma do noturno', preset: 'personalizado', expected_players: 3,
  });
  const { challenge } = await post('arena_save_challenge', {
    title: 'Cartaz da feira', modality: 'precisao',
    mission: 'Escreva o prompt do cartaz da feira de tecnologia.',
    reference_text: 'Cartaz A3 da feira, com data, local e contato.',
    criteria: [{ criterion: 'objetivo', weight: 100 }], duration_seconds: 600, speed_weight: 'none',
  });
  await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
  await post('arena_publish_room', { room_id: room.id });
  const alunos = [];
  for (const nome of ['Ana', 'Bia', 'Caio']) {
    const entrada = await fetch(`${base}/api.php?action=arena_join`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: room.code, name: nome }),
    });
    const corpo = await entrada.json();
    alunos.push({ ...corpo.participant, token: corpo.token });
  }

  navegador = await abrirNavegador();
  const painel = await abrirPagina(navegador, {
    viewport: { width: 1440, height: 900 },
    cookie: { name: 'arena_admin', value: cookieAdmin.slice(cookieAdmin.indexOf('=') + 1), domain: '127.0.0.1', path: '/' },
  });

  // A leitura do desenho: quantas pílulas primárias a linha de ações mostra
  // (a família que a folha pinta de azul) e como a faixa se comporta na largura.
  const medir = (pagina) => pagina.evaluate(() => {
    const linha = document.querySelector('[data-arena-detail-body] .arena-room-card-actions');
    const primarias = linha
      ? [...linha.querySelectorAll(':is(.is-primary, [data-action=start], [data-action=publish], [data-proximo])')]
      : [];
    const faixa = document.querySelector('[data-arena-state-bar]');
    const celulas = [...(faixa?.querySelectorAll('.arena-state-cell') ?? [])].map((celula) => ({
      papel: [...celula.classList].find((classe) => classe.startsWith('is-')),
      rotulo: celula.querySelector('small')?.textContent.trim() ?? '',
      valor: celula.querySelector('b')?.textContent.trim() ?? '',
      largura: Math.round(celula.getBoundingClientRect().width),
      linhas: Math.round(celula.getBoundingClientRect().height / parseFloat(getComputedStyle(celula).lineHeight || '20')),
    }));
    const caixa = faixa?.getBoundingClientRect();
    return {
      celulas,
      alturaDaFaixa: caixa ? Math.round(caixa.height) : null,
      rolagemLateral: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      primarias: primarias.map((no) => no.getAttribute('data-action')),
      // O cabeçalho e a faixa, na largura de agora: a foto é do recorte.
      topo: caixa ? Math.round(caixa.top) : 0,
    };
  });

  const capturar = async (estado) => {
    for (const [largura, altura] of [[1440, 900], [1280, 720], [390, 844]]) {
      await painel.setViewport({ width: largura, height: altura });
      await esperarPor(painel, () => Boolean(document.querySelector('[data-arena-state-bar]')), {
        descricao: `a faixa existir em ${estado} ${largura}px`,
      });
      const medida = await medir(painel);
      console.log(`\n${estado} @ ${largura}x${altura}`);
      console.log('  células:', medida.celulas.map((c) => `${c.rotulo}=${c.valor}`).join(' | '));
      console.log(`  altura da faixa: ${medida.alturaDaFaixa}px · rolagem lateral: ${medida.rolagemLateral}px`);
      console.log('  pílulas primárias na linha de ações:', medida.primarias.length ? medida.primarias.join(', ') : 'nenhuma');
      const recorte = { x: 0, y: medida.topo - 90, width: largura, height: 220 };
      await painel.screenshot({ path: fileURLToPath(new URL(`faixa__${estado}__${largura}.png`, SAIDA)), clip: recorte });
    }
    await painel.setViewport({ width: 1440, height: 900 });
  };

  await painel.goto(`${base}/admin-arena.php`);
  await clicarAte(
    painel,
    `[data-room-id="${room.id}"] [data-action=detail]`,
    () => Boolean(document.querySelector('[data-arena-state-bar]')),
    { descricao: 'abrir a sala em destaque' },
  );
  await capturar('1-espera');

  await clicarAte(painel, '[data-arena-detail-body] [data-proximo]', () => Boolean(document.querySelector('[data-arena-detail-body] [data-action=end-round]')), {
    descricao: 'iniciar a missão',
  });
  await capturar('2-missao-no-ar');

  const rodada = (await post('arena_room_detail', { room_id: room.id })).detail.rounds[0].id;
  for (const [indice, aluno] of alunos.entries()) {
    await post('arena_submit', {
      participant_id: aluno.id, token: aluno.token, round_id: rodada,
      prompt: `Cartaz A3 da feira de tecnologia, com data, local e contato. Aluno ${indice + 1}.`,
    });
    if (indice === 0) {
      // Metade da turma enviou: a faixa tem de contar isso sem marcar botão
      // nenhum — é o estado em que o professor só espera.
      await capturar('3-metade-dos-envios');
    }
  }
  await esperarPor(painel, () => document.querySelector('.arena-state-cell.is-envios b')?.textContent.trim() === '3 de 3', {
    descricao: 'a faixa contar os três envios',
  });
  await capturar('4-turma-inteira-enviou');

  await clicarAte(painel, '[data-arena-detail-body] [data-proximo]', () => Boolean(document.querySelector('[data-arena-detail-body] [data-action=close-round]')), {
    descricao: 'encerrar a missão',
  });
  await capturar('5-resultados-no-ar');

  await clicarAte(painel, '[data-arena-detail-body] [data-proximo]', () => document.querySelector('.arena-state-cell.is-estado b')?.textContent.trim() === 'Encerrada', {
    descricao: 'fechar os resultados',
  });
  await capturar('6-batalha-encerrada');
} finally {
  await navegador?.close();
  servidor.closeAllConnections();
  await new Promise((r) => servidor.close(r));
  aberto.close();
}
