import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createAdminAuth } from '../../src/server/admin-auth.mjs';
import { createApi } from '../../src/server/api.mjs';
import { createArenaApi } from '../../src/server/arena-api.mjs';

/**
 * A CAUSA DA RECUSA, E NÃO SÓ O FATO DE ELA ACONTECER.
 *
 * O painel do professor tem três jeitos de não ter sessão, e a resposta certa
 * para cada um é diferente:
 *
 *   - o cookie expirou NO MEIO DA AULA (ele estava ali e venceu) -> "entre de
 *     novo", com o aviso na tela e a sala que ele acompanhava preservada;
 *   - a aba nunca teve sessão (URL aberta no navegador de outro aparelho) ->
 *     tela de login, sem prometer recuperação nenhuma;
 *   - a credencial é de outra instalação / foi adulterada -> login;
 *   - a senha está errada -> "senha incorreta", e não "sua sessão expirou".
 *
 * Os quatro casos respondiam a MESMA frase ("Acesso administrativo invalido ou
 * expirado."), e por isso a tela só podia dizer a mesma coisa para todos — ou,
 * pior, engolir o 401 e seguir consultando. O status continua 401 (o
 * comportamento do servidor não muda por causa do motivo); o que passa a existir
 * é `details.reason`, que é o que a tela lê.
 *
 * A sessão do ALUNO ganha o mesmo tratamento: `session_missing` (esta aba nunca
 * entrou) e `session_expired` (entrou e perdeu a validade) também não são a
 * mesma frase na cara dele.
 */
async function fixture(t, { ttlSeconds = 3600 } = {}) {
  const opened = openDatabase(':memory:');
  t.after(() => opened.close());
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  let clock = 1000;
  const auth = createAdminAuth({
    password: 'test-password',
    secret: 'test-secret-with-at-least-32-characters',
    now: () => clock,
    ttlSeconds,
  });
  const api = createArenaApi({
    repositories,
    adminAuth: auth,
    now: () => clock,
    judge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
  });
  // `admin_login` e `admin_status` moram no despachante do nucleo, e nao na
  // Arena: a entrada do professor nao pertence a uma sala.
  const core = createApi({
    repositories,
    judge: async () => ({ percent: 80, breakdown: {}, feedback: 'Avaliado' }),
    now: () => clock,
    adminPassword: 'test-password',
    adminSecret: 'test-secret-with-at-least-32-characters',
    adminAuth: auth,
  });
  const token = auth.login('test-password').token;
  return { api, core, auth, token, time: (value) => { clock = value; } };
}

/** A falha que a acao produziu, com status e motivo. */
async function falha(acao) {
  try {
    await acao();
  } catch (error) {
    return { status: error.status, reason: error.details?.reason, message: error.message };
  }
  throw new Error('esperava falha, e a chamada passou');
}

test('sessão ausente, vencida e inválida são o MESMO 401 com causas diferentes', async (t) => {
  const f = await fixture(t, { ttlSeconds: 60 });

  const semToken = await falha(() => f.api('arena_admin_status', {}));
  assert.equal(semToken.status, 401);
  assert.equal(semToken.reason, 'session_missing', 'sem token nenhum: a aba nunca teve sessão');

  const invalido = await falha(() => f.api('arena_admin_status', { admin_token: 'nao-e-um-token' }));
  assert.equal(invalido.status, 401);
  assert.equal(invalido.reason, 'session_invalid', 'texto que não é token');

  const adulterado = await falha(() => f.api('arena_admin_status', { admin_token: `${f.token}x` }));
  assert.equal(adulterado.status, 401);
  assert.equal(adulterado.reason, 'session_invalid', 'assinatura que não confere');

  f.time(1000 + 61);
  const vencido = await falha(() => f.api('arena_admin_status', { admin_token: f.token }));
  assert.equal(vencido.status, 401);
  assert.equal(vencido.reason, 'session_expired', 'o token era bom e venceu pelo relógio');

  // E os três casos continuam recusando a MESMA superfície: nada aqui afrouxou
  // a autorização — o que mudou foi só a explicação.
  assert.notEqual(semToken.reason, vencido.reason);
});

test('senha errada é credencial inválida, e não sessão expirada', async (t) => {
  const f = await fixture(t);
  const erro = await falha(() => f.core('admin_login', { password: 'senha-errada' }));
  assert.equal(erro.status, 401);
  assert.equal(erro.reason, 'invalid_credentials');
  assert.match(erro.message, /incorreta/i, 'a frase que o professor lê continua dizendo que a senha está errada');

  // O caminho feliz continua inteiro: a senha certa entra e a sessão vale.
  const entrar = await f.core('admin_login', { password: 'test-password' });
  assert.equal(entrar.ok, true);
  assert.deepEqual(await f.core('admin_status', { admin_token: entrar.admin_token }), { ok: true, authenticated: true });
});

test('a sessão do aluno separa "nunca entrou" de "perdeu a validade"', async (t) => {
  const f = await fixture(t);
  const auth = { admin_token: f.token };
  await f.api('arena_set_open', { ...auth, open: true });
  const { room } = await f.api('arena_create_room', { ...auth, title: 'Sala', preset: 'turma', expected_players: 35 });
  const ana = await f.api('arena_join', { code: room.code, name: 'Ana' });

  const semSessao = await falha(() => f.api('arena_lobby', {}));
  assert.equal(semSessao.status, 401);
  assert.equal(semSessao.reason, 'session_missing');

  const tokenErrado = await falha(() => f.api('arena_lobby', { participant_id: ana.participant.id, token: 'outro-token' }));
  assert.equal(tokenErrado.status, 401);
  assert.equal(tokenErrado.reason, 'session_expired', 'a sessão existiu e não vale mais');

  // E o aluno que ainda está na sala entra normalmente: a guarda não inventou
  // recusa para quem tem sessão viva.
  const lobby = await f.api('arena_lobby', { participant_id: ana.participant.id, token: ana.token });
  assert.equal(lobby.ok, true);
  assert.equal(lobby.lobby.room.id, room.id);
});

test('o motivo não vaza para a resposta HTTP além do corpo declarado', async (t) => {
  const f = await fixture(t);
  const erro = await falha(() => f.api('arena_admin_status', { admin_token: 'nao-e-um-token' }));
  // O 401 tem exatamente duas informações úteis para o cliente: a frase segura e
  // o motivo. Nada de stack, nada de detalhe do HMAC.
  assert.deepEqual(Object.keys(erro).sort(), ['message', 'reason', 'status']);
  assert.doesNotMatch(JSON.stringify(erro), /secret|hmac|stack/i);
});
