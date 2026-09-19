import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createApplication, DEFAULT_ROUNDS } from '../../src/server/start.mjs';

let opened, server, baseUrl, clock, sequence;

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  clock = 20_000;
  sequence = 0;
  const game = await repositories.rooms.createCycle({ id: 'http-admin-game', now: clock });
  await repositories.rooms.putRounds(game.id, DEFAULT_ROUNDS, clock);
  const app = createApplication({
    repositories,
    judge: createFakeJudge(),
    now: () => clock,
    id: () => `http-admin-id-${++sequence}`,
    adminPassword: 'senha-admin',
    adminSecret: 'segredo-http-admin-com-32-caracteres',
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  opened.close();
});

async function post(action, payload = {}, { cookie = '' } = {}) {
  const response = await fetch(`${baseUrl}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  });
  return { response, body: await response.json() };
}

// O token admin viaja so no cookie HttpOnly; a resposta do login nao o expoe.
function cookieToken(response) {
  const setCookie = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  const match = /arena_admin=([^;]+)/.exec(setCookie);
  return match ? match[1] : '';
}

// Liveness e prontidao sao perguntas diferentes, e agora respondem em rotas
// diferentes. Antes o `/healthz` era a unica e misturava as duas: respondia 200
// com o banco de pe mesmo com o painel administrativo desabilitado, e o host
// marcava como pronta uma instalacao em que o professor nao conseguia entrar.
test('liveness confirma o processo; prontidao confirma banco, configuracao e juiz', async () => {
  const sadio = await fetch(`${baseUrl}/healthz`);
  assert.equal(sadio.status, 200);
  // Liveness NAO toca no banco: banco que pisca nao pode virar reinicio em laco.
  assert.deepEqual(await sadio.json(), { ok: true, service: 'up' });

  const pronto = await fetch(`${baseUrl}/readyz`);
  assert.equal(pronto.status, 200);
  const corpo = await pronto.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.service, 'up');
  assert.equal(corpo.database, 'ready');
  assert.equal(corpo.config, 'valid');
  assert.equal(corpo.draining, false);
  assert.equal(typeof corpo.judge, 'string', 'a prontidao diz com qual modo de juiz a turma está sendo avaliada');
});

test('admin HTTP flow logs in via HttpOnly cookie, reads a report and starts a clean cycle', async () => {
  const adminPage = await fetch(`${baseUrl}/admin-arena.php`);
  const adminHtml = await adminPage.text();
  assert.match(adminHtml, /data-admin-arena-login/);

  const logged = await post('admin_login', { password: 'senha-admin' });
  assert.equal(logged.response.status, 200);
  // O token nao vaza no corpo JSON (HttpOnly): vai apenas no Set-Cookie.
  assert.equal(logged.body.admin_token, undefined);
  assert.equal(logged.body.ok, true);
  const setCookie = logged.response.headers.getSetCookie?.()[0] || logged.response.headers.get('set-cookie') || '';
  assert.match(setCookie, /arena_admin=[^;]+/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Path=\//);

  const token = cookieToken(logged.response);
  assert.ok(token, 'Set-Cookie carrega o token admin');

  // Sem cookie o relatorio fica 401; com o cookie HttpOnly o servidor injeta
  // o token sozinho (nada no corpo vindo do cliente).
  const forbidden = await post('report_metrics');
  assert.equal(forbidden.response.status, 401);
  const report = await post('report_metrics', {}, { cookie: `arena_admin=${token}` });
  assert.equal(report.response.status, 200);
  assert.equal(report.body.metrics.cards.players, 0);

  // admin_reset aceita o token explicito no corpo (testes em processo/drivers).
  const reset = await post('admin_reset', { admin_token: token });
  assert.equal(reset.response.status, 200);
  assert.equal(reset.body.room.phase, 'idle');

  // O relatorio e superficie admin: anonimo e redirecionado para o login do
  // painel; com o cookie valido o markup completo e entregue.
  const anonReport = await fetch(`${baseUrl}/report.php`, { redirect: 'manual' });
  assert.equal(anonReport.status, 302);
  assert.equal(anonReport.headers.get('location'), '/admin-arena.php');
  const reportPage = await fetch(`${baseUrl}/report.php`, { headers: { cookie: `arena_admin=${token}` } });
  assert.equal(reportPage.status, 200);
  assert.match(await reportPage.text(), /data-export-report/);

  // Logout limpa o cookie.
  const out = await post('admin_logout', {}, { cookie: `arena_admin=${token}` });
  assert.equal(out.response.status, 200);
  const cleared = out.response.headers.getSetCookie?.()[0] || out.response.headers.get('set-cookie') || '';
  assert.match(cleared, /arena_admin=;/);
  assert.match(cleared, /Max-Age=0/);
});

test('projection TV session travels in an HttpOnly cookie, not in the URL', async () => {
  const logged = await post('admin_login', { password: 'senha-admin' });
  const adminToken = cookieToken(logged.response);
  const adminCookie = `arena_admin=${adminToken}`;

  const created = await post('arena_create_room', { title: 'Turma TV Cookie', preset: 'classic', expected_players: 3 }, { cookie: adminCookie });
  const room = created.body.room;
  assert.ok(room && room.pin, 'sala classica criada com PIN para a projecao');

  // O cockpit pede a sessao: resposta devolve URL com PIN apenas, e o token
  // da projecao vai no Set-Cookie (HttpOnly, nunca no corpo).
  const issued = await post('arena_tv_token', { room_id: room.id }, { cookie: adminCookie });
  assert.equal(issued.body.ok, true);
  assert.equal(issued.body.tv_token, undefined, 'token da TV nao vaza no corpo');
  assert.ok(issued.body.url.includes('pin='));
  assert.ok(!issued.body.url.includes('tk='), 'URL de projecao sem token');
  const tvCookieHeader = issued.response.headers.getSetCookie?.()[0] || issued.response.headers.get('set-cookie') || '';
  assert.match(tvCookieHeader, /arena_tv_session=[^;]+/);
  assert.match(tvCookieHeader, /HttpOnly/);
  assert.match(tvCookieHeader, /SameSite=Lax/);
  const tvToken = /arena_tv_session=([^;]+)/.exec(tvCookieHeader)?.[1];
  assert.ok(tvToken);

  // Sem a sessao (sem cookie), a projecao e bloqueada mesmo com o PIN.
  const bare = await post('arena_tv', { pin: room.pin });
  assert.equal(bare.response.status, 403);

  // Com o cookie da TV, o servidor injeta tv_token sozinho — corpo vazio.
  const projected = await post('arena_tv', { pin: room.pin }, { cookie: `arena_tv_session=${tvToken}` });
  assert.equal(projected.response.status, 200);
  assert.ok(projected.body.tv && projected.body.tv.room);
  assert.equal(String(projected.body.tv.room.pin || projected.body.tv.room.code), String(room.pin));

  // A sessao de uma sala nao projeta outra.
  const other = await post('arena_create_room', { title: 'Turma TV Cookie 2', preset: 'classic', expected_players: 3 }, { cookie: adminCookie });
  const otherPin = other.body.room.pin;
  const blocked = await post('arena_tv', { pin: otherPin }, { cookie: `arena_tv_session=${tvToken}` });
  assert.equal(blocked.response.status, 403);
});

test('short projection code unlocks the TV on another device via HttpOnly cookie', async () => {
  const logged = await post('admin_login', { password: 'senha-admin' });
  const adminCookie = `arena_admin=${cookieToken(logged.response)}`;
  const created = await post('arena_create_room', { title: 'Turma TV Codigo', preset: 'classic', expected_players: 3 }, { cookie: adminCookie });
  const room = created.body.room;
  assert.ok(room && room.pin, 'sala classica criada');

  // O cockpit recebe o codigo curto (exibido para o professor).
  const issued = await post('arena_tv_token', { room_id: room.id }, { cookie: adminCookie });
  assert.equal(issued.response.status, 200);
  const code = issued.body.tv_code;
  assert.match(code, /^\d{6}$/);

  // Codigo errado na tela da TV: bloqueado.
  const wrong = await post('arena_tv_code', { code: '999999' });
  assert.equal(wrong.response.status, 403);

  // Codigo certo: trocado por sessao de projecao no cookie (nada no corpo/URL).
  const unlocked = await post('arena_tv_code', { code });
  assert.equal(unlocked.response.status, 200);
  assert.equal(unlocked.body.tv_token, undefined, 'token nao vaza no corpo');
  assert.equal(unlocked.body.tv_code, undefined);
  assert.ok(unlocked.body.pin && unlocked.body.tv && unlocked.body.tv.room);
  const tvCookie = /arena_tv_session=([^;]+)/.exec(unlocked.response.headers.getSetCookie?.()[0] || '')?.[1];
  assert.ok(tvCookie, 'Set-Cookie da sessao de projecao');

  // A TV projeta com o cookie recebido, sem passar token no corpo.
  const projected = await post('arena_tv', { pin: unlocked.body.pin }, { cookie: `arena_tv_session=${tvCookie}` });
  assert.equal(projected.response.status, 200);
  assert.equal(String(projected.body.tv.room.pin || projected.body.tv.room.code), String(room.pin));
});
