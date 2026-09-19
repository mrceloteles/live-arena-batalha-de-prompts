import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApplication } from '../../src/server/start.mjs';

let opened, repositories, server, baseUrl, controller;
// O login administrativo exige senha E segredo HMAC. Fixar só a senha deixava o
// teste dependente do `.env` local — que não é versionado —, e ele reprovava em
// checkout limpo (inclusive no CI) com "Acesso administrativo ainda nao
// configurado". Os dois valores entram aqui e são devolvidos ao ambiente no fim.
const originalPassword = process.env.ADMIN_PASSWORD;
const originalSecret = process.env.ADMIN_SECRET;

beforeEach(async () => {
  process.env.ADMIN_PASSWORD = 'arena-sse-test-pass';
  process.env.ADMIN_SECRET = 'arena-sse-test-secret-at-least-32-chars';
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  const now = 9000;
  await repositories.rooms.createCycle({ id: 'arena-events-game', now });
  const app = createApplication({
    repositories,
    judge: createFakeJudge(),
    now: () => now,
    id: (() => { let n = 0; return () => `arena-events-id-${++n}`; })(),
    // A autorizacao e reverificada a cada 60 ms neste arquivo: o teste da
    // revogacao nao pode depender do relogio de 10 s do produto, e o relogio do
    // quadro e curto de proposito para que a deteccao seja o proprio aceite.
    eventRevalidateMs: 60,
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  controller = new AbortController();
});

afterEach(async () => {
  controller.abort();
  await new Promise((resolve) => server.close(resolve));
  opened.close();
  if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = originalPassword;
  if (originalSecret === undefined) delete process.env.ADMIN_SECRET;
  else process.env.ADMIN_SECRET = originalSecret;
});

let lastSetCookie = '';
async function post(action, payload = {}) {
  const response = await fetch(`${baseUrl}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  lastSetCookie = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  const body = await response.json();
  assert.equal(response.ok, true, `${action}: ${JSON.stringify(body)}`);
  return body;
}

// O token admin so existe no cookie HttpOnly (o corpo do login nao o expoe).
function loginToken() {
  const match = /arena_admin=([^;]+)/.exec(lastSetCookie);
  return match ? match[1] : '';
}

/**
 * Conexao do stream com UMA leitura pendente so.
 *
 * A versao anterior deste arranjo lia o stream a cada `await nextRoomEvent()`, e
 * conferir silencio com um prazo curto deixava uma leitura pendente para tras:
 * ela engolia o proximo chunk e o `expectEvent` seguinte estourava o prazo com o
 * evento ja na rede. Aqui a conexao e drenada por um unico laco e as esperas
 * olham uma fila — um leitor, nenhum chunck perdido entre esperas.
 *
 * O laco tambem separa o que NAO e evento de sala: `event: revoked` (o servidor
 * fechou a conexao porque ela perdeu a autorizacao) entra numa segunda fila, e o
 * fim do corpo fica marcado — as duas coisas sao o que a revogacao prova.
 */
function leitor(reader) {
  const fila = [];
  const revogacoes = [];
  let encerrado = false;
  const laco = (async () => {
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary < 0) break;
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
        if (block.includes('event: revoked')) {
          revogacoes.push(dataLine ? JSON.parse(dataLine.slice(6)) : {});
          continue;
        }
        if (!block.includes('event: room')) continue;
        fila.push(dataLine ? JSON.parse(dataLine.slice(6)) : {});
      }
    }
    encerrado = true;
  })();
  laco.catch(() => { /* a conexao morre no fim do teste */ });
  return {
    get tamanho() { return fila.length; },
    /** O servidor ja fechou o corpo desta conexao. */
    get encerrado() { return encerrado; },
    /** Esvazia o que ja chegou, para medir so o que vier depois. */
    limpar() { fila.length = 0; },
    /** Aviso de revogacao (e o motivo), em ate `timeoutMs`; `null` se nao veio. */
    async revogacao(timeoutMs) {
      const fim = Date.now() + timeoutMs;
      for (;;) {
        if (revogacoes.length) return revogacoes.shift();
        if (Date.now() >= fim) return null;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
    /** Proximo evento em ate `timeoutMs`; `null` quando nao veio nenhum. */
    async proximo(timeoutMs) {
      const fim = Date.now() + timeoutMs;
      for (;;) {
        if (fila.length) return fila.shift();
        if (Date.now() >= fim) return null;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
  };
}

/** Abre uma conexao do stream e devolve o leitor com fila. */
async function stream(query = '', cookie = '') {
  const response = await fetch(`${baseUrl}/events${query}`, {
    headers: cookie ? { cookie } : {},
    signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/event-stream/);
  return leitor(response.body.getReader());
}

async function expectEvent(canal, expectedAction) {
  const started = performance.now();
  const event = await canal.proximo(1000);
  const elapsed = performance.now() - started;
  assert.ok(event, `nenhum evento chegou onde se esperava ${expectedAction}`);
  assert.equal(event.action, expectedAction);
  assert.ok(elapsed < 500, `SSE push for ${expectedAction} took ${elapsed.toFixed(1)}ms (polling would take longer)`);
  return event;
}

/** Nenhum evento do canal pode chegar nesta janela. */
async function expectSilence(canal, timeoutMs = 300) {
  const event = await canal.proximo(timeoutMs);
  assert.equal(event, null, `nao podia chegar evento nesta conexao: ${JSON.stringify(event)}`);
}

test('o stream entrega por escopo: a conexao presa a sala recebe a sala, a anonima recebe so o global', async () => {
  // 1) Conexao anonima, aberta ANTES dos eventos: prova que o global chega e que
  //    evento de sala nenhuma chega. Era exatamente o contrario antes deste
  //    portao — o hub transmitia tudo para todos.
  const anonimo = await stream();

  await post('admin_login', { password: 'arena-sse-test-pass' });
  const token = loginToken();
  assert.ok(token, 'admin token arrives only via Set-Cookie (HttpOnly)');

  const openWaiting = expectEvent(anonimo, 'arena_set_open');
  await post('arena_set_open', { admin_token: token, open: true });
  const openEvent = await openWaiting;
  // Abrir/fechar a entrada vale para toda a arena: evento global, sem sala — e
  // por isso que o campo continua ausente em vez de vir vazio.
  assert.equal(openEvent.room_id, undefined);

  const room = await post('arena_create_room', { admin_token: token, title: 'Turma SSE' });
  const outra = await post('arena_create_room', { admin_token: token, title: 'Outra Turma' });

  // Mutacao de sala: a conexao anonima nao pode ver nada disso.
  await post('arena_add_lesson', { admin_token: token, lesson_id: 'aula2-fundacao', room_id: room.room.id });
  await expectSilence(anonimo, 300);

  // 2) Conexao do painel: o cookie HttpOnly do professor autoriza, e a sala
  //    pedida e a unica que esta conexao segue.
  const painel = await stream(`?room=${encodeURIComponent(room.room.id)}`, `arena_admin=${token}`);

  const lessonWaiting = expectEvent(painel, 'arena_add_lesson');
  await post('arena_add_lesson', { admin_token: token, lesson_id: 'aula2-fundacao', room_id: room.room.id });
  assert.equal((await lessonWaiting).room_id, room.room.id);

  const publishWaiting = expectEvent(painel, 'arena_publish_room');
  await post('arena_publish_room', { admin_token: token, room_id: room.room.id });
  assert.equal((await publishWaiting).room_id, room.room.id);

  // Evento da OUTRA sala nao atravessa: a conexao e desta sala.
  await post('arena_add_lesson', { admin_token: token, lesson_id: 'aula2-fundacao', room_id: outra.room.id });
  await expectSilence(painel, 300);

  // Student joins: broadcast so para quem segue a sala (o painel desta sala).
  const joinWaiting = expectEvent(painel, 'arena_join');
  const joined = await post('arena_join', { code: room.room.code, name: 'Ana SSE' });
  assert.equal(joined.participant.name, 'Ana SSE');
  // Entrou pela sessao do aluno (sem `room_id` no payload): a sala sai do
  // resultado validado no servidor, nunca de um campo mandado pelo cliente.
  assert.equal((await joinWaiting).room_id, room.room.id);

  // A conexao anonima continua sem ver evento de sala — inclusive o do aluno.
  await expectSilence(anonimo, 300);

  // A read-only admin detail must NOT produce a broadcast.
  await post('arena_room_detail', { admin_token: token, room_id: room.room.id });
  await expectSilence(painel, 300);
});

test('o stream do aluno so recebe a sala dele, e o global tambem chega', async () => {
  await post('admin_login', { password: 'arena-sse-test-pass' });
  const token = loginToken();
  await post('arena_set_open', { admin_token: token, open: true });
  const room = await post('arena_create_room', { admin_token: token, title: 'Turma do Aluno' });
  const outra = await post('arena_create_room', { admin_token: token, title: 'Turma Vizinha' });
  await post('arena_add_lesson', { admin_token: token, lesson_id: 'aula2-fundacao', room_id: room.room.id });
  await post('arena_publish_room', { admin_token: token, room_id: room.room.id });
  const joined = await post('arena_join', { code: room.room.code, name: 'Bia SSE' });

  // A conexao entra com a sessao do aluno: sala + token, como a tela faz.
  const doAluno = await stream(
    `?room=${encodeURIComponent(room.room.id)}&participant_id=${encodeURIComponent(joined.participant.id)}&token=${encodeURIComponent(joined.token)}`,
  );

  const joinWaiting = expectEvent(doAluno, 'arena_join');
  await post('arena_join', { code: room.room.code, name: 'Caio SSE' });
  assert.equal((await joinWaiting).room_id, room.room.id);

  // Evento da outra sala: nao atravessa.
  await post('arena_add_lesson', { admin_token: token, lesson_id: 'aula2-fundacao', room_id: outra.room.id });
  await expectSilence(doAluno, 300);

  // Sessao invalida: a conexao nasce global. Ela recebe o evento global — que
  // vale para a arena inteira — e nada de sala nenhuma.
  const impostor = await stream(`?room=${encodeURIComponent(room.room.id)}&participant_id=${encodeURIComponent(joined.participant.id)}&token=token-forjado`);
  const globalWaiting = expectEvent(doAluno, 'arena_set_open');
  const globalDoImpostor = expectEvent(impostor, 'arena_set_open');
  await post('arena_set_open', { admin_token: token, open: false });
  assert.equal((await globalWaiting).room_id, undefined);
  assert.equal((await globalDoImpostor).room_id, undefined);

  // Nem o evento de sala do proprio aluno que ela diz ser.
  await post('arena_add_lesson', { admin_token: token, lesson_id: 'aula2-fundacao', room_id: room.room.id });
  await expectSilence(impostor, 300);
});

/** Espera o corpo da conexao terminar (fim de stream, nao fila vazia). */
async function esperarFim(canal, timeoutMs = 2000) {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim && !canal.encerrado) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return canal.encerrado;
}

test('a autorização é reverificada: quem perde a sala é fechado, e só ele', async () => {
  await post('admin_login', { password: 'arena-sse-test-pass' });
  const token = loginToken();
  await post('arena_set_open', { admin_token: token, open: true });
  const room = await post('arena_create_room', { admin_token: token, title: 'Turma da revogacao' });
  await post('arena_add_lesson', { admin_token: token, lesson_id: 'aula2-fundacao', room_id: room.room.id });
  await post('arena_publish_room', { admin_token: token, room_id: room.room.id });
  const ana = await post('arena_join', { code: room.room.code, name: 'Ana Revogada' });
  const bia = await post('arena_join', { code: room.room.code, name: 'Bia Permanece' });

  // Tres conexoes autorizadas na mesma sala: painel, a sessao da Ana e a da Bia.
  const painel = await stream(`?room=${encodeURIComponent(room.room.id)}`, `arena_admin=${token}`);
  const daAna = await stream(`?room=${encodeURIComponent(room.room.id)}&participant_id=${encodeURIComponent(ana.participant.id)}&token=${encodeURIComponent(ana.token)}`);
  const daBia = await stream(`?room=${encodeURIComponent(room.room.id)}&participant_id=${encodeURIComponent(bia.participant.id)}&token=${encodeURIComponent(bia.token)}`);

  // Prova de vida das tres antes de qualquer revogacao (e de que o relogio da
  // reverificacao nao derruba conexao boa).
  const chegou = [expectEvent(painel, 'arena_join'), expectEvent(daAna, 'arena_join'), expectEvent(daBia, 'arena_join')];
  await post('arena_join', { code: room.room.code, name: 'Caio Entra' });
  await Promise.all(chegou);

  // O professor remove a Ana: a sessao dela deixa de render a sala.
  const remocaoNoPainel = expectEvent(painel, 'arena_remove_participant');
  const remocaoNaBia = expectEvent(daBia, 'arena_remove_participant');
  await post('arena_remove_participant', { admin_token: token, room_id: room.room.id, participant_id: ana.participant.id });
  await remocaoNoPainel;
  await remocaoNaBia;
  const revogacao = await daAna.revogacao(3000);
  assert.deepEqual(revogacao, { reason: 'scope_lost' }, 'a conexao da Ana recebe o aviso de revogacao');
  assert.equal(await esperarFim(daAna), true, 'a conexao revogada e fechada, nao fica pendurada');

  // E so ela: o painel e a Bia continuam recebendo o que acontece na sala.
  daAna.limpar();
  const noPainel = expectEvent(painel, 'arena_add_lesson');
  const naBia = expectEvent(daBia, 'arena_add_lesson');
  await post('arena_add_lesson', { admin_token: token, lesson_id: 'aula2-fundacao', room_id: room.room.id });
  await noPainel;
  await naBia;
  await expectSilence(daAna, 300);

  // Reconectar nao devolve a sala: a credencial continua invalida, entao a
  // conexao nova nasce global (so o evento da arena) — sem oraculo de erro.
  const semSala = await stream(`?room=${encodeURIComponent(room.room.id)}&participant_id=${encodeURIComponent(ana.participant.id)}&token=${encodeURIComponent(ana.token)}`);
  const globalWaiting = expectEvent(semSala, 'arena_set_open');
  await post('arena_set_open', { admin_token: token, open: false });
  assert.equal((await globalWaiting).room_id, undefined);
  await post('arena_add_lesson', { admin_token: token, lesson_id: 'aula2-fundacao', room_id: room.room.id });
  await expectSilence(semSala, 300);
});
