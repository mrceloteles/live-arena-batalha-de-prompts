import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createRepositories } from '../../src/db/repositories/index.mjs';
import { openDatabase } from '../../src/db/database.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createLog } from '../../src/server/log.mjs';
import { bootstrap, createApplication } from '../../src/server/start.mjs';

// O defeito registrado na auditoria: erro interno virava 500 genérico SEM
// nenhuma linha de log que alguém pudesse ligar ao relato de um aluno.
//
// O que estes casos prendem:
//   - toda falha da API sai em uma linha JSON com o MESMO id do cabeçalho
//     `x-request-id` (é o que o aluno vê e o que a operação procura);
//   - a linha diz ação, status, duração e classe da falha;
//   - o payload NÃO entra: nem nome, nem e-mail, nem prompt, nem PIN, nem token;
//   - um segredo que apareça dentro de uma mensagem de erro sai redigido;
//   - um `action` com quebra de linha não inventa uma segunda linha no log.
const SENHA_DO_PAINEL = 'senha-forte-do-painel';
const SEGREDO_DO_PAINEL = 'segredo-de-producao-com-32-caracteres';

function capturar() {
  const linhas = [];
  return { linhas, escrever: (linha) => linhas.push(linha) };
}

async function subirComRepositorios({ criterios, log, allowLegacyPublicApi } = {}) {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const handler = createApplication({
    repositories,
    judge: createFakeJudge(),
    criteriaJudge: criterios,
    log,
    adminPassword: SENHA_DO_PAINEL,
    adminSecret: SEGREDO_DO_PAINEL,
    allowLegacyPublicApi,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { opened, server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test('uma falha interna sai no log com o mesmo id que volta no cabeçalho — e sem o payload dentro', async () => {
  const { linhas, escrever } = capturar();
  const log = createLog({ write: escrever, secrets: [SENHA_DO_PAINEL, SEGREDO_DO_PAINEL] });
  const marcas = {
    nome: 'Marcelo-Pessoa-Real',
    email: 'aluno@exemplo.com',
    prompt: 'PROMPT-SECRETO-DO-ALUNO',
    pin: 'PIN-DA-SALA-999',
  };
  // O juiz falha de proposito: e o caminho que vira 500 no aluno.
  const { opened, server, baseUrl } = await subirComRepositorios({
    criterios: async () => { throw new Error('falha simulada do provedor'); },
    log,
  });
  try {
    const post = async (action, payload = {}, cookie) => {
      const response = await fetch(`${baseUrl}/api.php?action=${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.json(), requestId: response.headers.get('x-request-id') };
    };
    const login = await fetch(`${baseUrl}/api.php?action=admin_login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: SENHA_DO_PAINEL }),
    });
    const sessao = /arena_admin=([^;]+)/.exec(login.headers.getSetCookie?.()[0] || '')[1];
    assert.ok(sessao, 'o login devolve a sessao no cookie');

    const admin = (action, payload = {}) => post(action, payload, `arena_admin=${sessao}`);
    await admin('arena_set_open', { open: true });
    const criada = await admin('arena_create_room', { title: 'Turma do log', expected_players: 10 });
    const room = criada.body.room;
    const desafio = await admin('arena_save_challenge', {
      title: 'Cartaz', modality: 'precisao', mission: 'Escreva o prompt do cartaz.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
      duration_seconds: 600, speed_weight: 'none', reference_text: 'Cartaz A3 com data, local e contato.',
    });
    await admin('arena_add_round', { room_id: room.id, challenge_id: desafio.body.challenge.id });
    await admin('arena_publish_room', { room_id: room.id });
    await admin('arena_start_round', { room_id: room.id });

    const aluno = await post('arena_join', { code: room.pin || room.code, name: marcas.nome, email: marcas.email });
    assert.equal(aluno.body.ok, true);
    const detalhe = await admin('arena_room_detail', { room_id: room.id });
    const roundId = detalhe.body.detail.rounds.find((round) => round.status === 'open').id;

    const emVoo = await post('arena_submit', {
      participant_id: aluno.body.participant.id, token: aluno.body.token,
      round_id: roundId, prompt: marcas.prompt,
    });
    // 502: a falha foi do provedor (o juiz que estourou), e nao um erro de
    // contrato. Continua sendo uma falha que precisa de rastro.
    assert.equal(emVoo.status, 502, 'o envio falhou de verdade: e essa falha que tem de deixar rastro');
    assert.ok(emVoo.requestId, 'a resposta traz o id da requisicao');

    // Nenhuma operacao bem-sucedida sujou o log.
    const linhasDeFalha = linhas.filter((linha) => JSON.parse(linha).event === 'api_failure');
    assert.equal(linhasDeFalha.length, 1, `uma linha por falha (veio: ${linhas.join(' | ')})`);
    const registro = JSON.parse(linhasDeFalha[0]);
    assert.equal(registro.level, 'error');
    assert.equal(registro.request_id, emVoo.requestId, 'o id do log e o id que voltou no cabecalho');
    assert.equal(registro.action, 'arena_submit');
    assert.equal(registro.status, 502);
    assert.equal(Number.isFinite(registro.duration_ms), true, 'a duracao e medida');
    // `ApiError` nao troca o `name` (segue 'Error'), e a classe aparece pelo
    // status: o que importa aqui e a CAUSA, que so existe porque o erro do
    // provedor foi anexado em vez de descartado.
    assert.equal(registro.error.name, 'Error');
    // A mensagem publica e a causa real: a linha serve para investigar, e a
    // frase do aluno nao investiga nada sozinha.
    assert.match(registro.error.message, /avaliar o prompt agora/);
    assert.equal(registro.error.cause.name, 'Error');
    assert.match(registro.error.cause.message, /falha simulada do provedor/);
    assert.equal(registro.room_id, room.id, 'a sala resolvida pelo servidor entra no log');
    assert.equal(JSON.stringify(emVoo.body).includes('falha simulada'), false, 'a causa NAO vai para o cliente');

    const texto = linhasDeFalha[0];
    for (const [campo, valor] of Object.entries(marcas)) {
      assert.equal(texto.includes(valor), false, `o log nao pode carregar ${campo}`);
    }
    assert.equal(texto.includes(SENHA_DO_PAINEL), false);
    assert.equal(texto.includes(SEGREDO_DO_PAINEL), false);
    assert.equal(texto.includes(aluno.body.token), false, 'o token do aluno nunca entra no log');
  } finally {
    server.close();
    opened.close();
  }
});

test('recusa de validação também entra no log, com o motivo', async () => {
  const { linhas, escrever } = capturar();
  const log = createLog({ write: escrever, secrets: [] });
  const { opened, server, baseUrl } = await subirComRepositorios({ log });
  try {
    const resposta = await fetch(`${baseUrl}/api.php?action=arena_join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{isto não é json',
    });
    assert.equal(resposta.status, 400);
    const registro = JSON.parse(linhas[0]);
    assert.equal(registro.status, 400);
    assert.equal(registro.action, 'arena_join');
    assert.equal(registro.request_id, resposta.headers.get('x-request-id'));
    assert.match(registro.error.message, /JSON invalido/);
  } finally {
    server.close();
    opened.close();
  }
});

test('um segredo dentro da mensagem de erro sai redigido', () => {
  const { linhas, escrever } = capturar();
  const log = createLog({ write: escrever, secrets: ['chave-do-gemini-123456', 'segredo-de-sessao-abcdef'] });
  log.failure({
    requestId: 'req-1',
    action: 'arena_submit',
    status: 502,
    durationMs: 12,
    error: {
      name: 'JudgeResponseError',
      // O caso desconfortavel: o provedor devolveu a chave dentro do texto.
      message: 'request failed: key=chave-do-gemini-123456 (segredo-de-sessao-abcdef)',
    },
  });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].includes('chave-do-gemini-123456'), false);
  assert.equal(linhas[0].includes('segredo-de-sessao-abcdef'), false);
  assert.match(linhas[0], /redigido/);
  assert.equal(JSON.parse(linhas[0]).error.name, 'JudgeResponseError', 'o nome da classe do erro sobrevive');
});

test('um campo forjado não inventa linha nova, nem vira texto livre no log', () => {
  const { linhas, escrever } = capturar();
  const log = createLog({ write: escrever, secrets: [] });
  log.failure({
    requestId: 'req-2',
    action: 'arena_join\n{"level":"info","event":"tudo_em_ordem"}',
    status: 400,
    durationMs: 1,
    error: { name: 'ApiError', message: 'Payload invalido.\nsegunda linha forjada' },
    roomId: 'sala\n{"level":"info"}',
  });
  assert.equal(linhas.length, 1, 'uma chamada, uma linha');
  const registro = JSON.parse(linhas[0]);
  assert.equal(registro.action.includes('\n'), false, 'a acao nao carrega quebra de linha');
  assert.equal(registro.error.message.includes('\n'), false);
  assert.equal(registro.room_id, undefined, 'id de sala fora do formato de identificador e descartado');
  assert.equal(linhas[0].split('\n').length, 1, 'a linha e uma so');
});

test('o bootstrap liga ao log os segredos vivos do ambiente', async () => {
  const diretorio = mkdtempSync(join(tmpdir(), 'log-bootstrap-'));
  const databasePath = join(diretorio, 'arena.sqlite');
  const { linhas, escrever } = capturar();
  const env = {
    NODE_ENV: 'development',
    JUDGE_MODE: 'fallback',
    ADMIN_PASSWORD: SENHA_DO_PAINEL,
    ADMIN_SECRET: SEGREDO_DO_PAINEL,
    GEMINI_API_KEY: 'chave-viva-do-ambiente-987654',
  };
  const app = await bootstrap({ databasePath, env, logWriter: escrever });
  try {
    // A lista de limpeza e a do ambiente desta instalacao — nao uma lista fixa.
    for (const segredo of [SENHA_DO_PAINEL, SEGREDO_DO_PAINEL, env.GEMINI_API_KEY]) {
      assert.equal(app.log.segredos.includes(segredo), true, `o segredo do ambiente entrou na limpeza`);
    }
    app.log.failure({ requestId: 'req-3', action: 'admin_login', status: 500, durationMs: 3, error: new Error(`vazou ${env.GEMINI_API_KEY}`) });
    assert.equal(linhas.at(-1).includes(env.GEMINI_API_KEY), false, 'a linha nao carrega a chave viva');
    assert.match(linhas.at(-1), /redigido/);
  } finally {
    app.opened.close();
    rmSync(diretorio, { recursive: true, force: true });
  }
});
