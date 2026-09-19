import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'prompt-base-repo-'));
  const connection = openDatabase(join(directory, 'game.sqlite'));
  await connection.migrate();
  // os hooks t.after rodam na ordem de registro; fechar a conexao antes de remover
  // a pasta evita EBUSY (arquivo .sqlite bloqueado) no Windows.
  t.after(() => connection.close());
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { connection, repositories: createRepositories(connection.database) };
}

test('room repository starts a new cycle without deleting historical games', async (t) => {
  const { repositories } = await fixture(t);
  const first = await repositories.rooms.createCycle({ id: 'g1', now: 100 });
  await repositories.sessions.register({
    id: 'old-session', gameId: 'g1', stationId: 1, token: 'old-token',
    playerName: 'Ana', consent: true, now: 110,
  });
  await repositories.rooms.updateState({ id: 'g1', phase: 'final_results', currentRound: 3, now: 200 });
  const second = await repositories.rooms.createCycle({ id: 'g2', now: 300 });

  assert.equal(first.cycle, 1);
  assert.equal(second.cycle, 2);
  assert.equal((await repositories.rooms.getById('g1')).phase, 'final_results');
  assert.equal((await repositories.rooms.getActive()).id, 'g2');
  assert.equal((await repositories.rooms.list()).length, 2);
  assert.deepEqual(await repositories.sessions.getByToken('old-token'), {
    id: 'old-session', gameId: 'g1', stationId: 1, token: 'old-token', playerName: 'Ana',
    email: '', role: '', company: '',
    consent: true, active: false, registeredAt: 110, lastSeenAt: 300, endedAt: 300,
  });
});
test('session tokens and one active session per station are unique', async (t) => {
  const { repositories } = await fixture(t);
  await repositories.rooms.createCycle({ id: 'g1', now: 100 });
  await repositories.sessions.register({
    id: 's1', gameId: 'g1', stationId: 1, token: 'token-1', playerName: 'Ana', consent: true, now: 110,
  });

  await assert.rejects(() => repositories.sessions.register({
    id: 's2', gameId: 'g1', stationId: 2, token: 'token-1', playerName: 'Bia', consent: true, now: 111,
  }), /UNIQUE/);
  await assert.rejects(() => repositories.sessions.register({
    id: 's3', gameId: 'g1', stationId: 1, token: 'token-3', playerName: 'Caio', consent: true, now: 112,
  }), /UNIQUE/);

  await repositories.sessions.end({ id: 's1', now: 120 });
  await repositories.sessions.register({
    id: 's3', gameId: 'g1', stationId: 1, token: 'token-3', playerName: 'Caio', consent: true, now: 121,
  });
  assert.equal((await repositories.sessions.getActiveByStation('g1', 1)).id, 's3');
  assert.equal((await repositories.sessions.getByToken('token-1')).active, false);
});

test('session repository persists the complete participant registration', async (t) => {
  const { repositories } = await fixture(t);
  await repositories.rooms.createCycle({ id: 'g1', now: 100 });
  const saved = await repositories.sessions.register({
    id: 's1', gameId: 'g1', stationId: 1, token: 'token-1', playerName: 'Ana Souza',
    email: 'ana@escola.edu.br', role: 'Professora', company: 'Escola Horizonte',
    consent: true, now: 110,
  });

  assert.equal(saved.email, 'ana@escola.edu.br');
  assert.equal(saved.role, 'Professora');
  assert.equal(saved.company, 'Escola Horizonte');
  assert.deepEqual((await repositories.reports.forGame('g1')).sessions[0], saved);
});

test('room, session and match can be reconstructed after writes', async (t) => {
  const { repositories } = await fixture(t);
  await repositories.rooms.createCycle({ id: 'g1', now: 100 });
  await repositories.rooms.putRounds('g1', [
    { number: 1, referencePrompt: 'secret', rubric: 'rubric', imagePath: '/round-1.png' },
  ], 101);
  await repositories.sessions.register({
    id: 's1', gameId: 'g1', stationId: 1, token: 'tok', playerName: 'Ana', consent: true, now: 102,
  });
  await repositories.matches.create({
    id: 'm1', gameId: 'g1', roundNumber: 1, startedAt: 110, deadlineAt: 170, now: 110,
  });

  assert.deepEqual((await repositories.rooms.getState('g1')).rounds[0], {
    number: 1, imagePath: '/round-1.png', referencePrompt: 'secret', rubric: 'rubric',
  });
  assert.equal((await repositories.sessions.getByToken('tok')).playerName, 'Ana');
  assert.equal((await repositories.matches.getById('m1')).deadlineAt, 170);
  assert.equal((await repositories.matches.listByGame('g1')).length, 1);
});