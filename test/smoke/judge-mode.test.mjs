import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { bootstrap, createApplication } from '../../src/server/start.mjs';

// O defeito que estes testes trancam: `createApplication` montava o juiz por
// criterios da Arena lendo `process.env.GEMINI_API_KEY`, entao
// `JUDGE_MODE=fallback` continuava chamando Gemini quando havia chave. Aqui a
// prova e a ponta: uma submissao real nao pode disparar nenhuma requisicao de
// rede e o modo tem de ficar gravado no que e persistido.

const CRITERIA = [
  { criterion: 'objetivo', weight: 30 },
  { criterion: 'contexto', weight: 25 },
  { criterion: 'publico', weight: 20 },
  { criterion: 'formato', weight: 15 },
  { criterion: 'restricoes', weight: 10 },
];

let opened, repositories, server, baseUrl, clock, sequence, cookie;

beforeEach(async () => {
  opened = openDatabase(':memory:');
  await opened.migrate();
  repositories = createRepositories(opened.database);
  clock = 100_000;
  sequence = 0;
  cookie = '';
});

afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
  opened.close();
});

async function startApp(options) {
  const app = createApplication({
    repositories,
    judge: createFakeJudge(),
    now: () => clock,
    id: () => `judge-mode-id-${++sequence}`,
    adminPassword: 'senha-modo-juiz',
    adminSecret: 'segredo-modo-juiz-com-32-caracteres',
    ...options,
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function post(action, payload = {}) {
  const response = await fetch(`${baseUrl}/api.php?action=${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { response, body };
}

async function login() {
  const { response, body } = await post('admin_login', { password: 'senha-modo-juiz' });
  assert.equal(response.status, 200, JSON.stringify(body));
  const setCookie = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  cookie = `arena_admin=${/arena_admin=([^;]+)/.exec(setCookie)[1]}`;
}

/** Sala personalizada com uma missao por criterios, pronta para receber envio. */
async function arenaWithMission() {
  await post('arena_set_open', { open: true });
  const room = (await post('arena_create_room', { title: 'Modo do juiz', expected_players: 3 })).body.room;
  const challenge = (await post('arena_save_challenge', {
    title: 'Cartaz',
    modality: 'precisao',
    mission: 'Crie um cartaz para a feira de tecnologia.',
    context: 'Feira anual do ensino medio.',
    criteria: CRITERIA,
    duration_seconds: 300,
    speed_weight: 'none',
    reference_text: 'Cartaz A3 da feira de tecnologia, com data, local, lista de stands e contato.',
  })).body.challenge;
  await post('arena_add_round', { room_id: room.id, challenge_id: challenge.id });
  await post('arena_publish_room', { room_id: room.id });
  const ana = (await post('arena_join', { code: room.code, name: 'Ana' })).body;
  const roundId = (await post('arena_start_round', { room_id: room.id })).body.room.rounds[0].id;
  return { room, ana, roundId };
}

test('fallback com chave presente: submissao real nao faz nenhuma chamada externa e o modo fica gravado', async (t) => {
  // Canario duplo: a chave fica visivel no ambiente (era ela que o defeito
  // consumia) e `globalThis.fetch` registra qualquer destino que nao seja o
  // proprio servidor de teste, para nenhuma regressao escapar para a rede.
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'canario-no-ambiente-nao-pode-ser-usado';
  const realFetch = globalThis.fetch;
  const externalCalls = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith('http://127.0.0.1:')) return realFetch(url, init);
    externalCalls.push(target);
    throw new Error('chamada externa inesperada');
  };
  t.after(() => {
    globalThis.fetch = realFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  });

  const calls = [];
  await startApp({
    judgeConfiguration: {
      mode: 'fallback',
      apiKey: 'chave-que-nao-pode-ser-usada',
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        throw new Error('JUDGE_MODE=fallback nao pode acessar a rede');
      },
    },
  });
  await login();
  const { ana, roundId } = await arenaWithMission();

  const submitted = await post('arena_submit', {
    participant_id: ana.participant.id,
    token: ana.token,
    round_id: roundId,
    prompt: 'Crie um cartaz A3 para a feira de tecnologia, com data, local, lista de stands e contato.',
  });
  assert.equal(submitted.response.status, 200, JSON.stringify(submitted.body));
  assert.equal(calls.length, 0, `nenhuma requisicao externa: ${JSON.stringify(calls.map((entry) => entry.url))}`);
  assert.deepEqual(externalCalls, [], 'JUDGE_MODE=fallback nao pode sair do processo, nem para o Gemini');

  const attempts = await repositories.arena.judgeAttempts.listBySubmission(submitted.body.submission.id);
  assert.equal(attempts.length, 1);
  const metadata = JSON.parse(attempts[0].responseJson).metadata;
  assert.equal(metadata.judge_mode, 'fallback');
  assert.equal(metadata.provider, 'fallback');
  assert.equal(metadata.fallback_used, true);
  assert.equal(metadata.model, 'arena-fallback-v1');
  assert.doesNotMatch(String(attempts[0].responseJson), /chave-que-nao-pode-ser-usada|canario-no-ambiente/);
});

test('bootstrap deriva os dois juizes da mesma politica e recusa modo desconhecido antes de servir', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'judge-mode-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, 'game.sqlite');

  const original = { mode: process.env.JUDGE_MODE, key: process.env.GEMINI_API_KEY };
  t.after(() => {
    if (original.mode === undefined) delete process.env.JUDGE_MODE;
    else process.env.JUDGE_MODE = original.mode;
    if (original.key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = original.key;
  });

  process.env.JUDGE_MODE = 'typo';
  await assert.rejects(bootstrap({ databasePath }), (error) => {
    assert.match(error.message, /JUDGE_MODE invalido/);
    assert.match(error.message, /fallback, gemini, gemini-safe/);
    return true;
  });

  // Modo omitido cai em fallback mesmo com a chave preenchida no ambiente.
  delete process.env.JUDGE_MODE;
  process.env.GEMINI_API_KEY = 'chave-ambiental-que-nao-pode-ser-usada';
  const fallbackApp = await bootstrap({ databasePath });
  assert.equal(fallbackApp.judgeMode, 'fallback');
  fallbackApp.opened.close();

  process.env.JUDGE_MODE = 'gemini';
  const geminiApp = await bootstrap({ databasePath });
  assert.equal(geminiApp.judgeMode, 'gemini');
  geminiApp.opened.close();
});
