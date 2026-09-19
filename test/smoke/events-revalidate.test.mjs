import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import { createRoomEventHub, sameScope } from '../../src/server/events.mjs';

// O que este teste protege: a autorizacao de uma conexao do stream nao e um
// selo de entrada. De tempos em tempos o hub refaz a pergunta "esta conexao
// ainda pode seguir esta sala?" e fecha quem deixou de poder — sem derrubar
// quem continua autorizado e sem interpretar uma falha de leitura como perda de
// acesso. Quem responde e a funcao que a superficie passou (o resolver das
// credenciais), nunca uma copia da regra aqui dentro: e por isso que a
// reverificacao e testada com uma funcao de mentira, e nao com um banco.

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera uma condicao virar verdadeira, com prazo. */
async function ate(condicao, timeoutMs = 1000) {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
    if (condicao()) return true;
    await dormir(5);
  }
  return condicao();
}

/**
 * O par requisicao/resposta que o hub exige, sem socket: o que interessa aqui e
 * o que ele ESCREVE e quando ele encerra, nao o HTTP por tras.
 */
function conexao() {
  const escritos = [];
  const request = new EventEmitter();
  const response = new EventEmitter();
  response.destroyed = false;
  response.writableEnded = false;
  response.writeHead = () => {};
  response.write = (chunk) => { escritos.push(String(chunk)); return true; };
  response.end = () => {
    response.writableEnded = true;
    response.emit('close');
  };
  return {
    request,
    response,
    get escrito() { return escritos.join(''); },
    get quadros() { return escritos.filter((chunk) => chunk.startsWith('event:')); },
  };
}

test('perder a sala fecha a conexao, com o aviso antes do fim', async () => {
  const hub = createRoomEventHub({ revalidateMs: 10 });
  const canal = conexao();
  let escopo = { kind: 'room', roomId: 'sala-a' };
  hub.subscribe(canal.request, canal.response, { scope: escopo, revalidate: async () => escopo });
  assert.equal(hub.sizeFor('sala-a'), 1);

  // Conexao boa nao pode ser derrubada pelo proprio relogio que a vigia.
  await dormir(60);
  assert.equal(hub.revoked, 0);
  assert.equal(hub.sizeFor('sala-a'), 1);
  assert.equal(canal.response.writableEnded, false);

  // A credencial deixou de render a sala (aluno removido, token vencido).
  escopo = { kind: 'global' };
  assert.equal(await ate(() => canal.response.writableEnded), true, 'a conexao tinha de ser fechada');
  assert.match(canal.escrito, /event: revoked\ndata: \{"reason":"scope_lost"\}\n\n/);
  assert.equal(hub.revoked, 1);
  assert.equal(hub.sizeFor('sala-a'), 0, 'sai do indice da sala ao ser fechada');
  assert.equal(hub.size, 0);

  // Nada mais chega por ela: o evento da sala nao tem para quem ir.
  const antesDoBroadcast = canal.escrito;
  hub.broadcast('arena_join', { roomId: 'sala-a' });
  assert.equal(canal.escrito, antesDoBroadcast);
});

test('a revogacao e por conexao: a vizinha autorizada continua recebendo', async () => {
  const hub = createRoomEventHub({ revalidateMs: 10 });
  const daAna = conexao();
  const daBia = conexao();
  let escopoDaAna = { kind: 'room', roomId: 'sala-a' };
  hub.subscribe(daAna.request, daAna.response, { scope: escopoDaAna, revalidate: async () => escopoDaAna });
  hub.subscribe(daBia.request, daBia.response, { scope: { kind: 'room', roomId: 'sala-a' }, revalidate: async () => ({ kind: 'room', roomId: 'sala-a' }) });

  escopoDaAna = { kind: 'global' };
  assert.equal(await ate(() => daAna.response.writableEnded), true);
  await dormir(40);
  assert.equal(daBia.response.writableEnded, false, 'quem manteve a sala nao pode ser fechado junto');
  assert.equal(hub.sizeFor('sala-a'), 1);
  assert.equal(hub.revoked, 1);

  hub.broadcast('arena_join', { roomId: 'sala-a' });
  assert.match(daBia.escrito, /"action":"arena_join"/);
});

test('trocar de sala tambem revoga: o escopo novo tem de ser o mesmo, nao outro', async () => {
  const hub = createRoomEventHub({ revalidateMs: 10 });
  const canal = conexao();
  hub.subscribe(canal.request, canal.response, { scope: { kind: 'room', roomId: 'sala-a' }, revalidate: async () => ({ kind: 'room', roomId: 'sala-b' }) });
  assert.equal(await ate(() => canal.response.writableEnded), true);
  assert.equal(hub.sizeFor('sala-b'), 0, 'a conexao nao migra para a sala nova');
});

test('falha de leitura nao revoga: banco que pisca nao corta a aula', async () => {
  const hub = createRoomEventHub({ revalidateMs: 10 });
  const canal = conexao();
  let falhar = true;
  const escopo = { kind: 'room', roomId: 'sala-a' };
  hub.subscribe(canal.request, canal.response, {
    scope: escopo,
    revalidate: async () => {
      if (falhar) throw new Error('banco indisponivel');
      return { kind: 'global' };
    },
  });

  await dormir(60);
  assert.equal(canal.response.writableEnded, false, 'erro transitorio nao pode fechar a conexao');
  assert.equal(hub.revoked, 0);
  assert.equal(hub.sizeFor('sala-a'), 1);

  // Quando a leitura volta a responder, a perda de verdade e aplicada.
  falhar = false;
  assert.equal(await ate(() => canal.response.writableEnded), true);
  assert.equal(hub.revoked, 1);
});

test('conexao global nao ganha relogio: nao ha credencial para perder', async () => {
  const hub = createRoomEventHub({ revalidateMs: 10 });
  const canal = conexao();
  let consultas = 0;
  hub.subscribe(canal.request, canal.response, {
    scope: { kind: 'global' },
    revalidate: async () => { consultas += 1; return { kind: 'global' }; },
  });

  await dormir(60);
  assert.equal(consultas, 0, 'sem prova de sala, a reverificacao nem roda');
  assert.equal(canal.response.writableEnded, false);
  assert.equal(hub.globalSize, 1);
  assert.equal(hub.revoked, 0);

  // E o evento global continua chegando nela.
  hub.broadcast('arena_set_open', {});
  assert.match(canal.escrito, /"action":"arena_set_open"/);
});

test('a conexao fechada pelo cliente sai do indice sem contar revogacao', async () => {
  const hub = createRoomEventHub({ revalidateMs: 10 });
  const canal = conexao();
  hub.subscribe(canal.request, canal.response, { scope: { kind: 'room', roomId: 'sala-a' }, revalidate: async () => ({ kind: 'room', roomId: 'sala-a' }) });
  assert.equal(hub.sizeFor('sala-a'), 1);
  canal.response.emit('close');
  assert.equal(hub.sizeFor('sala-a'), 0);
  assert.equal(hub.revoked, 0, 'sair por conta propria nao e revogacao');
});

test('sameScope: so a mesma sala casa, e `global` nao vira sala nenhuma', () => {
  assert.equal(sameScope({ kind: 'room', roomId: 'a' }, { kind: 'room', roomId: 'a' }), true);
  assert.equal(sameScope({ kind: 'room', roomId: 'a' }, { kind: 'room', roomId: 'b' }), false);
  assert.equal(sameScope({ kind: 'global' }, { kind: 'room', roomId: 'a' }), false);
  assert.equal(sameScope({ kind: 'room', roomId: 'a' }, { kind: 'global' }), false);
  assert.equal(sameScope({ kind: 'global' }, { kind: 'global' }), true);
  assert.equal(sameScope({ kind: 'global' }, undefined), true, 'resposta vazia nao inventa sala');
});
