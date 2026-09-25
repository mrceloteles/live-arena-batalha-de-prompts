import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApplication } from '../../src/server/start.mjs';

/**
 * A REVISÃO DA SALA — A VERSÃO MONOTÔNICA DO ESTADO.
 *
 * O problema que ela resolve é de CORRIDA, e não de conteúdo: uma resposta de
 * ação que demorou (ou uma leitura que partiu antes de um evento) pode chegar
 * DEPOIS de um estado mais novo já estar na tela. Sem uma versão, quem decide o
 * desenho final é o relógio da rede — e a tela volta para um estado que já
 * passou (o placar de duas rodadas atrás, o lobby depois de a rodada começar).
 *
 * As três regras que este teste prende, e que são contrato do servidor:
 *
 *   1. MUTAÇÃO sobe a revisão — qualquer uma, uma vez cada;
 *   2. LEITURA não sobe: duas leituras do mesmo estado devolvem o MESMO número,
 *      senão a guarda do cliente recusaria a própria leitura seguinte;
 *   3. o EVENTO de tempo real sai DEPOIS do número ter subido, e a leitura que
 *      ele dispara já nasce com a versão nova (a ordem está em `anunciarSala`).
 *
 * O mesmo número vale para as três telas na mesma sala: o que separa aluno,
 * painel e TV é o recorte do payload, não a versão.
 */
const originalPassword = process.env.ADMIN_PASSWORD;
const originalSecret = process.env.ADMIN_SECRET;

let opened, server, baseUrl, cookie, tvCookie, room, challenge;
let clock = 1000;

const post = async (action, payload = {}, { usarCookie = true, esperarOk = true } = {}) => {
  const response = await fetch(`${baseUrl}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(usarCookie && cookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  });
  const setCookie = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  if (setCookie && action === 'admin_login') cookie = setCookie.split(';')[0];
  if (setCookie && action === 'arena_tv_token') tvCookie = setCookie.split(';')[0];
  const body = await response.json();
  if (esperarOk) assert.equal(response.ok, true, `${action}: ${JSON.stringify(body)}`);
  return body;
};

beforeEach(async () => {
  process.env.ADMIN_PASSWORD = 'revisao-test-pass';
  process.env.ADMIN_SECRET = 'revisao-test-secret-at-least-32-chars';
  clock = 1000;
  opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const app = createApplication({
    repositories,
    judge: createFakeJudge(),
    arenaJudge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
    now: () => clock,
    id: (() => { let n = 0; return () => `revisao-${++n}`; })(),
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  cookie = '';
  tvCookie = '';
  await post('admin_login', { password: 'revisao-test-pass' });
  await post('arena_set_open', { open: true });
  // Preset `personalizado`: os presets de regras clássicas (classic/turma)
  // nascem com as três rodadas oficiais e não aceitam acrescentar missão — a
  // revisão não depende do preset, e a sala montada aqui é a menor possível.
  ({ room } = await post('arena_create_room', { title: 'Sala da revisão', preset: 'personalizado', expected_players: 35 }));
  ({ challenge } = await post('arena_save_challenge', {
    title: 'Missão',
    mission: 'Escreva um prompt com público e formato definidos.',
    modality: 'refinamento',
    duration_seconds: 300,
    reference_text: 'Prompt de referência com objetivo, público, formato e restrições.',
  }));
  await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
  await post('arena_publish_room', { room_id: room.id });
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  opened.close();
  if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = originalPassword;
  if (originalSecret === undefined) delete process.env.ADMIN_SECRET;
  else process.env.ADMIN_SECRET = originalSecret;
});

const detalhe = async () => (await post('arena_room_detail', { room_id: room.id })).detail.room.revision;

/** O aluno entra e lê o lobby: a revisão que a tela DELE recebe. */
async function alunoLe() {
  const ana = await post('arena_join', { code: room.code, name: 'Ana' }, { usarCookie: false });
  const sessao = { participant_id: ana.participant.id, token: ana.token };
  const lobby = await post('arena_lobby', sessao, { usarCookie: false });
  return { sessao, revision: lobby.lobby.room.revision };
}

test('mutação sobe a revisão, leitura não — e as três telas leem o mesmo número', async () => {
  // A ENTRADA da aluna é mutação (a sala mudou: há mais gente nela), então a
  // comparação entre as telas começa DEPOIS dela — comparar antes mediria dois
  // estados diferentes e o teste estaria mentindo.
  const aluna = await alunoLe();
  const antes = await detalhe();
  assert.equal(aluna.revision, antes, 'aluno e painel leem a MESMA revisão da mesma sala');

  const leituras = [];
  for (let i = 0; i < 3; i += 1) {
    leituras.push(await detalhe());
    await post('arena_lobby', aluna.sessao, { usarCookie: false });
  }
  assert.deepEqual(new Set(leituras).size, 1, `leitura não pode subir a revisão: ${leituras.join(',')}`);

  // A TV entra com a própria sessão de projeção (o token só viaja em cookie) e
  // com a MESMA identidade que o aluno digita: preset fora do clássico nasce
  // sem PIN numérico (`pin: null` é contrato), e o código alfabético faz esse
  // papel — é o `pin || code` que todas as telas leem.
  await post('arena_tv_token', { room_id: room.id });
  const tv = await fetch(`${baseUrl}/api.php?action=arena_tv`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: tvCookie },
    body: JSON.stringify({ pin: room.pin || room.code }),
  }).then((r) => r.json());
  assert.equal(tv.ok, true);
  assert.equal(tv.tv.room.revision, antes, 'a parede lê a mesma revisão que o painel');

  const subiu = await detalhe();
  assert.equal(subiu, antes, 'nenhuma mutação aconteceu: o número não anda sozinho');

  const comecou = await post('arena_start_round', { room_id: room.id });
  assert.equal(comecou.ok, true);
  const depois = await detalhe();
  assert.ok(depois > antes, `iniciar a rodada tem de subir a revisão (${antes} -> ${depois})`);
  const lobbyDepois = await post('arena_lobby', aluna.sessao, { usarCookie: false });
  assert.equal(lobbyDepois.lobby.room.revision, depois, 'o aluno vê a rodada já com a revisão nova');
});

test('o evento de tempo real sai DEPOIS de a revisão subir', async () => {
  const antes = await detalhe();
  const stream = await fetch(`${baseUrl}/events?room=${encodeURIComponent(room.id)}`, {
    headers: { cookie, accept: 'text/event-stream' },
  });
  assert.equal(stream.status, 200);
  const leitor = stream.body.getReader();
  const eventos = [];
  const coletando = (async () => {
    const decoder = new TextDecoder();
    let guardado = '';
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) return;
      guardado += decoder.decode(value, { stream: true });
      // Cada bloco do stream termina em linha vazia; o payload vem em `data:`.
      for (const bloco of guardado.split('\n\n').slice(0, -1)) {
        // O tipo do evento é sempre `room`; a ação viaja DENTRO do payload (é
        // assim que o cliente filtra, por `data.action`).
        const evento = /^event: (\S+)/m.exec(bloco)?.[1];
        const dados = /^data: (.*)$/m.exec(bloco)?.[1];
        if (evento && dados) eventos.push({ evento, dados: JSON.parse(dados), acao: JSON.parse(dados).action });
      }
      guardado = guardado.split('\n\n').slice(-1)[0];
      if (eventos.some((e) => e.acao === 'arena_start_round')) return;
    }
  })();

  await post('arena_start_round', { room_id: room.id });
  await Promise.race([coletando, new Promise((resolve) => setTimeout(resolve, 3000))]);
  await leitor.cancel().catch(() => {});

  const evento = eventos.find((e) => e.acao === 'arena_start_round');
  assert.ok(evento, `o evento da ação tem de chegar: ${JSON.stringify(eventos.map((e) => e.acao))}`);
  assert.ok(evento.dados.revision > antes, `o evento carrega a versão NOVA (${evento.dados.revision} > ${antes})`);
  assert.equal(evento.dados.revision, await detalhe(), 'e é a mesma que a leitura seguinte devolve');
  assert.equal(evento.dados.room_id, room.id, 'o evento continua dizendo de que sala ele é');
});

test('ação global não mexe na revisão de sala nenhuma', async () => {
  const antes = await detalhe();
  await post('arena_set_open', { open: false });
  assert.equal(await detalhe(), antes, 'abrir/fechar a Arena vale para todas as salas, e não é estado de uma sala');
  await post('arena_set_open', { open: true });
  assert.equal(await detalhe(), antes);
});
