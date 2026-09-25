import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createAdminAuth } from '../../src/server/admin-auth.mjs';
import { createArenaApi } from '../../src/server/arena-api.mjs';

/**
 * O INÍCIO DA BATALHA E O TAMANHO DO CADASTRO.
 *
 * Falha relatada em aula: o professor criou a sala, três alunos entraram e não
 * havia como iniciar. A sala tinha sido criada com o PADRÃO do formulário —
 * modo Turma e 35 "participantes" — e as duas pontas do produto liam esse número
 * como quantidade OBRIGATÓRIA:
 *
 *   - `arena_admin_status` só marcava `can_start` quando o número de ativos era
 *     exatamente o da capacidade, em qualquer sala de regras clássicas;
 *   - a tela do detalhe desabilitava "Iniciar batalha" pela mesma conta.
 *
 * A capacidade (quantos CABEM) e o mínimo (quantos são NECESSÁRIOS) são coisas
 * diferentes, e o produto já sabia disso: `rosterLocksAtStart` existe para
 * dizer se a sala trava o cadastro. O preset Clássico (3 lugares fixos) trava; o
 * preset Turma é clássico no juiz e LIVRE na entrada. A ação do servidor sempre
 * olhou a bandeira — a lista é que estava mais exigente que a ação.
 *
 * Este teste prende os dois lados da regra para que a confusão não volte.
 */
async function fixture(t, { preset, capacity } = {}) {
  const opened = openDatabase(':memory:');
  t.after(() => opened.close());
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  let clock = 1000;
  const now = () => clock;
  const auth = createAdminAuth({ password: 'test-password', secret: 'test-secret-with-at-least-32-characters', now });
  const admin = { admin_token: auth.login('test-password').token };
  const api = createArenaApi({
    repositories,
    adminAuth: auth,
    now,
    judge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
  });
  await api('arena_set_open', { ...admin, open: true });
  const { room } = await api('arena_create_room', {
    ...admin, title: 'Sala de teste', preset, expected_players: capacity,
  });
  const join = async (name) => {
    const value = await api('arena_join', { code: room.code, name });
    return { participant_id: value.participant.id, token: value.token };
  };
  const status = async () => (await api('arena_admin_status', admin)).rooms.find((entry) => entry.id === room.id);
  return { api, admin, room, repositories, join, status, time: (value) => { clock = value; } };
}

test('sala do preset Turma inicia com os alunos que entraram, sem esperar a sala encher', async (t) => {
  const f = await fixture(t, { preset: 'turma', capacity: 35 });
  await f.status();
  await f.join('Ana');
  await f.join('Bia');
  await f.join('Carla');

  const antes = await f.status();
  assert.equal(antes.expected_players, 35, 'a capacidade continua sendo 35 lugares');
  assert.equal(antes.participants, 3);
  // O defeito: aqui era `false`, e por isso o botão de iniciar nem era desenhado.
  assert.equal(antes.can_start, true, 'a turma presente basta para começar — 35 é capacidade, não exigência');

  const iniciada = await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  assert.equal(iniciada.ok, true);
  const rodada = iniciada.room.rounds.find((entry) => entry.status === 'open');
  assert.ok(rodada, 'a rodada abriu para a turma');
});

test('sala do preset Clássico continua exigindo os 3 lugares fixos', async (t) => {
  const f = await fixture(t, { preset: 'classic' });
  const antes = await f.status();
  assert.equal(antes.expected_players, 3, 'o preset clássico tem 3 lugares fixos');
  assert.equal(antes.can_start, false, 'sala vazia não começa no modo de lugares fixos');

  await f.join('Ana');
  await f.join('Bia');
  const comDois = await f.status();
  assert.equal(comDois.can_start, false, 'faltando um lugar, o clássico ainda espera');
  await assert.rejects(
    () => f.api('arena_start_round', { ...f.admin, room_id: f.room.id }),
    (erro) => erro.status === 409 && /3 jogadores/.test(erro.message),
    'a ação do servidor recusa a sala incompleta com o motivo legível',
  );

  await f.join('Carla');
  const comTres = await f.status();
  assert.equal(comTres.can_start, true, 'com os 3 lugares preenchidos, o clássico começa');
  const iniciada = await f.api('arena_start_round', { ...f.admin, room_id: f.room.id });
  assert.equal(iniciada.ok, true);
});

test('o detalhe da sala publica a bandeira que decide o início, para a tela não adivinhar', async (t) => {
  const turma = await fixture(t, { preset: 'turma', capacity: 35 });
  const { detail } = await turma.api('arena_room_detail', { ...turma.admin, room_id: turma.room.id });
  assert.equal(detail.room.settings.rosterLocksAtStart, false, 'Turma não trava o cadastro');

  const classica = await fixture(t, { preset: 'classic' });
  const detalheClassico = (await classica.api('arena_room_detail', { ...classica.admin, room_id: classica.room.id })).detail;
  assert.equal(detalheClassico.room.settings.rosterLocksAtStart, true, 'Clássico trava o cadastro');
});
