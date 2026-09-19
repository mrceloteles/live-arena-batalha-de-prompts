import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRoomEventHub, roomIdFromOutcome, roomScope } from '../../src/server/events.mjs';

// A sala de um evento de tempo real sai do resultado validado no servidor ou do
// `room_id` que o proprio handler ja conferiu. Estes casos são os formatos reais
// dos handlers da arena: se um deles mudar de forma, o teste avisa antes de o
// roteamento por sala entregar o evento para quem nao devia.

test('a sala do evento sai do resultado validado, nunca de um campo do aluno', () => {
  assert.equal(roomIdFromOutcome({}, { room: { id: 'sala-1' } }), 'sala-1');
  assert.equal(roomIdFromOutcome({}, { detail: { room: { id: 'sala-2' } } }), 'sala-2');
  assert.equal(roomIdFromOutcome({}, { participant: { room: { id: 'sala-3' } } }), 'sala-3');
  assert.equal(roomIdFromOutcome({}, { round: { roomId: 'sala-4' } }), 'sala-4');
  assert.equal(roomIdFromOutcome({}, { room_id: 'sala-5' }), 'sala-5');
  // Sem nada no resultado, vale o `room_id` que o handler validou.
  assert.equal(roomIdFromOutcome({ room_id: 'sala-6' }, { ok: true }), 'sala-6');
  // O que o aluno manda no corpo nao vira sala de evento.
  assert.equal(roomIdFromOutcome({ room_id: 'sala-do-aluno' }, {}), 'sala-do-aluno');
  assert.equal(roomIdFromOutcome({}, { room: { id: 42 } }), '42');
});

test('acao global (abrir/fechar a entrada) fica sem sala e o payload antigo nao muda', () => {
  assert.equal(roomIdFromOutcome({ open: true }, { ok: true, open: true }), null);
  assert.equal(roomIdFromOutcome({}, { room: {} }), null);
  assert.equal(roomIdFromOutcome({}, {}), null);
});

test('escopo de conexao: sala vira escopo de sala, vazio vira global', () => {
  assert.deepEqual(roomScope('sala-1'), { kind: 'room', roomId: 'sala-1' });
  assert.deepEqual(roomScope(7), { kind: 'room', roomId: '7' });
  assert.deepEqual(roomScope(''), { kind: 'global' });
  assert.deepEqual(roomScope(null), { kind: 'global' });
  assert.deepEqual(roomScope(undefined), { kind: 'global' });
});

/** Conexao de mentira: guarda o que o hub escreveu e separa os eventos do canal. */
function conexao() {
  const written = [];
  const response = {
    writeHead() {},
    write(chunk) { written.push(String(chunk)); },
    destroyed: false,
    writableEnded: false,
    once() {},
  };
  const eventos = () => written
    .filter((chunk) => chunk.includes('event: room'))
    .map((chunk) => JSON.parse(chunk.split('data: ')[1]));
  return { response, eventos };
}

test('hub: evento com sala carrega room_id; evento global mantem o formato de antes', () => {
  const hub = createRoomEventHub();
  const assinante = conexao();
  hub.subscribe({ once() {} }, assinante.response, { scope: roomScope('sala-9') });

  hub.broadcast('arena_submit', { serverNow: 10, roomId: 'sala-9' });
  hub.broadcast('arena_set_open', { serverNow: 11 });
  hub.broadcast('arena_join', { serverNow: 12, roomId: null });

  const eventos = assinante.eventos();
  assert.equal(eventos.length, 3);
  assert.deepEqual(eventos[0], { action: 'arena_submit', server_now: 10, room_id: 'sala-9' });
  assert.deepEqual(eventos[1], { action: 'arena_set_open', server_now: 11 });
  assert.deepEqual(eventos[2], { action: 'arena_join', server_now: 12 });
});

test('hub: a conexao de sala recebe a propria sala e o global; a de outra sala nao recebe nada', () => {
  const hub = createRoomEventHub();
  const daSalaA = conexao();
  const daSalaB = conexao();
  hub.subscribe({ once() {} }, daSalaA.response, { scope: roomScope('sala-a') });
  hub.subscribe({ once() {} }, daSalaB.response, { scope: roomScope('sala-b') });

  hub.broadcast('arena_submit', { serverNow: 20, roomId: 'sala-a' });
  hub.broadcast('arena_set_open', { serverNow: 21 });

  assert.deepEqual(daSalaA.eventos().map((evento) => evento.action), ['arena_submit', 'arena_set_open']);
  // Nem por engano: a sala B nao ve nada da sala A.
  assert.deepEqual(daSalaB.eventos().map((evento) => evento.action), ['arena_set_open']);
  assert.equal(hub.sizeFor('sala-a'), 1);
  assert.equal(hub.sizeFor('sala-b'), 1);
});

test('hub: conexao sem escopo (sem prova de sala) so recebe o evento global', () => {
  const hub = createRoomEventHub();
  const semProva = conexao();
  hub.subscribe({ once() {} }, semProva.response);

  hub.broadcast('arena_submit', { serverNow: 30, roomId: 'sala-a' });
  hub.broadcast('arena_publish_room', { serverNow: 31, roomId: 'sala-b' });
  assert.deepEqual(semProva.eventos(), []);

  hub.broadcast('arena_set_open', { serverNow: 32 });
  assert.deepEqual(semProva.eventos().map((evento) => evento.action), ['arena_set_open']);
  assert.equal(hub.globalSize, 1);
  assert.equal(hub.sizeFor('sala-a'), 0);
});

test('hub: socket morto sai da sala e o evento deixa de ser escrito nele', () => {
  const hub = createRoomEventHub();
  const vivo = conexao();
  const morto = conexao();
  morto.response.destroyed = true;
  hub.subscribe({ once() {} }, vivo.response, { scope: roomScope('sala-a') });
  hub.subscribe({ once() {} }, morto.response, { scope: roomScope('sala-a') });

  hub.broadcast('arena_submit', { serverNow: 40, roomId: 'sala-a' });

  assert.equal(vivo.eventos().length, 1);
  // O morto recebeu so o `retry:` da abertura (nada de evento).
  assert.deepEqual(morto.eventos(), []);
  assert.equal(hub.sizeFor('sala-a'), 1, 'a conexao morta sai da sala na primeira entrega');
  assert.equal(hub.size, 1);
});
