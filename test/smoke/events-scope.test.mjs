import assert from 'node:assert/strict';
import { test } from 'node:test';

import { tvTokenKey } from '../../src/server/arena-api.mjs';
import { createEventsScopeResolver } from '../../src/server/events-scope.mjs';

// O que este teste protege: quem entra no stream de tempo real, e de que sala.
// A decisao e do servidor (o hub so entrega o que a conexao provou seguir), e
// as tres provas possiveis sao as credenciais que cada superficie ja tem:
// cookie do painel, cookie da projecao e a sessao do aluno.

const AGORA = 1000;

function banco({ participantes = {}, salas = {} } = {}) {
  return {
    arena: {
      participants: {
        async getById(id) { return participantes[String(id)]; },
      },
    },
    settings: {
      async get(key) { return salas[key]; },
    },
  };
}

function resolver(repositories) {
  return createEventsScopeResolver({
    repositories,
    adminAuth: { verify: (token) => token === 'cookie-do-professor' },
    now: () => AGORA,
  });
}

function pedido({ query = '', cookie } = {}) {
  return {
    request: { headers: cookie ? { cookie } : {} },
    url: new URL(`http://local/events${query}`),
  };
}

const alunoDaSalaA = {
  'p-1': { id: 'p-1', token: 'token-da-ana', active: true, roomId: 'sala-a' },
  'p-2': { id: 'p-2', token: 'token-do-bruno', active: false, roomId: 'sala-a' },
};

test('aluno: a sala vem da sessao validada, e o `room` pedido nao muda nada', async () => {
  const resolve = resolver(banco({ participantes: alunoDaSalaA }));
  const { request, url } = pedido({ query: '?room=sala-b&participant_id=p-1&token=token-da-ana' });
  assert.deepEqual(await resolve(request, url), { kind: 'room', roomId: 'sala-a' });
});

test('aluno: token errado, sessao inativa ou sessao ausente nao ganham sala', async () => {
  const resolve = resolver(banco({ participantes: alunoDaSalaA }));
  const tokenErrado = pedido({ query: '?room=sala-a&participant_id=p-1&token=outro' });
  assert.deepEqual(await resolve(tokenErrado.request, tokenErrado.url), { kind: 'global' });

  const inativo = pedido({ query: '?room=sala-a&participant_id=p-2&token=token-do-bruno' });
  assert.deepEqual(await resolve(inativo.request, inativo.url), { kind: 'global' });

  const semToken = pedido({ query: '?room=sala-a&participant_id=p-1&token=' });
  assert.deepEqual(await resolve(semToken.request, semToken.url), { kind: 'global' });

  const semSessao = pedido({ query: '?room=sala-a' });
  assert.deepEqual(await resolve(semSessao.request, semSessao.url), { kind: 'global' });
});

test('painel: o cookie assinado abre a sala pedida, e o alias `room_id` vale igual', async () => {
  const resolve = resolver(banco());
  const painel = pedido({ query: '?room=sala-b', cookie: 'arena_admin=cookie-do-professor' });
  assert.deepEqual(await resolve(painel.request, painel.url), { kind: 'room', roomId: 'sala-b' });

  const alias = pedido({ query: '?room_id=sala-c', cookie: 'arena_admin=cookie-do-professor' });
  assert.deepEqual(await resolve(alias.request, alias.url), { kind: 'room', roomId: 'sala-c' });

  // Cookie sem sala pedida nao vira sala nenhuma: o painel informa a sua.
  const semPedido = pedido({ cookie: 'arena_admin=cookie-do-professor' });
  assert.deepEqual(await resolve(semPedido.request, semPedido.url), { kind: 'global' });

  const cookieFalso = pedido({ query: '?room=sala-b', cookie: 'arena_admin=forjado' });
  assert.deepEqual(await resolve(cookieFalso.request, cookieFalso.url), { kind: 'global' });
});

test('projecao: o token de 8h abre a sala dele; expirado ou de outra sala, nao', async () => {
  const salas = {
    [tvTokenKey('sala-a')]: { tokens: { 'tv-vivo': AGORA + 60, 'tv-vencido': AGORA - 60 } },
  };
  const resolve = resolver(banco({ salas }));

  const vivo = pedido({ query: '?room=sala-a', cookie: 'arena_tv_session=tv-vivo' });
  assert.deepEqual(await resolve(vivo.request, vivo.url), { kind: 'room', roomId: 'sala-a' });

  const vencido = pedido({ query: '?room=sala-a', cookie: 'arena_tv_session=tv-vencido' });
  assert.deepEqual(await resolve(vencido.request, vencido.url), { kind: 'global' });

  // Token da sala A pedindo a sala B: a TV nao passeia por salas.
  const outraSala = pedido({ query: '?room=sala-b', cookie: 'arena_tv_session=tv-vivo' });
  assert.deepEqual(await resolve(outraSala.request, outraSala.url), { kind: 'global' });
});

test('a precedencia e do painel: o cookie do professor manda sobre a sessao de aluno sobrando', async () => {
  const resolve = resolver(banco({ participantes: alunoDaSalaA }));
  const misturado = pedido({
    query: '?room=sala-z&participant_id=p-1&token=token-da-ana',
    cookie: 'arena_admin=cookie-do-professor; arena_tv_session=tv-vencido',
  });
  // O painel do professor pode ter o `localStorage` de um aluno de outra aula;
  // e o cookie do painel que diz qual sala esta conexao segue.
  assert.deepEqual(await resolve(misturado.request, misturado.url), { kind: 'room', roomId: 'sala-z' });
});

test('sem prova nenhuma, a conexao nasce global — e id de sala absurdo nao entra', async () => {
  const resolve = resolver(banco());
  const anonima = pedido({ query: '?room=sala-a' });
  assert.deepEqual(await resolve(anonima.request, anonima.url), { kind: 'global' });

  const gigante = pedido({ query: `?room=${'a'.repeat(200)}`, cookie: 'arena_admin=cookie-do-professor' });
  assert.deepEqual(await resolve(gigante.request, gigante.url), { kind: 'global' });
});
