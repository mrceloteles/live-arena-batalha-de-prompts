import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { openDatabase } from '../../src/db/database.mjs';
import { createJudgeBudget } from '../../src/judge/budget.mjs';
import { createRepositories } from '../../src/db/repositories/index.mjs';
import { createFakeJudge } from '../../src/judge/fake-judge.mjs';
import { createJudges } from '../../src/judge/configuration.mjs';
import { bootstrap, createApplication } from '../../src/server/start.mjs';
import { createDrainGate, shutdownGracefully } from '../../src/server/lifecycle.mjs';
import { assertDeployable, clientAddress, deploymentProblems, parseTrustedProxies } from '../../src/server/environment.mjs';
import { INTEGRITY_TOOL, INTEGRITY_VERIFIED_FLAG, MANAGED_DATABASE, PERSISTENT_VOLUME } from '../../src/server/hosting.mjs';

// Liveness e prontidao sao perguntas diferentes:
//   - `/healthz` = "o processo esta vivo?" (nao toca no banco: banco que pisca
//     nao pode virar reinicio em laco);
//   - `/readyz`  = "posso receber trafego?" (banco, configuracao da implantacao,
//     modo do juiz e drenagem).
// Antes havia so a primeira pergunta, e ela respondia 200 com o painel
// administrativo desabilitado — o host marcava como pronta uma instalacao em que
// o professor nao conseguia entrar.

const abertos = [];
after(() => {
  for (const { server, opened } of abertos) {
    try { server.close(); opened.close(); } catch {}
  }
});

async function subirApp({ deployment, drainGate, criteriaJudge, judges, parking, adminPassword = 'senha-forte-do-painel', adminSecret = 'segredo-forte-do-painel-com-32-caracteres' } = {}) {
  const opened = openDatabase(':memory:');
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const handler = createApplication({
    repositories,
    judge: createFakeJudge(),
    criteriaJudge,
    judges,
    parking,
    drainGate,
    deployment,
    adminPassword,
    adminSecret,
  });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const registro = { opened, repositories, server, baseUrl: `http://127.0.0.1:${server.address().port}` };
  abertos.push(registro);
  return registro;
}

const pronto = async (baseUrl) => {
  const response = await fetch(`${baseUrl}/readyz`);
  return { status: response.status, body: await response.json() };
};

test('em produção, painel sem senha/segredo não fica pronto — e a justificativa não vaza valor', async () => {
  // `''` de proposito: e o que o ambiente tem quando a variavel nao foi setada.
  const app = await subirApp({ deployment: { production: true }, adminPassword: '', adminSecret: '' });

  const sadio = await fetch(`${app.baseUrl}/healthz`);
  assert.equal(sadio.status, 200, 'o processo esta de pe: liveness nao depende do painel');

  const { status, body } = await pronto(app.baseUrl);
  assert.equal(status, 503, 'prontidao negativa quando o painel nao pode funcionar');
  assert.equal(body.ok, false);
  assert.equal(body.config, 'invalid');
  assert.equal(body.database, 'ready');
  assert.match(body.problems.join(' '), /ADMIN_PASSWORD/);
  assert.match(body.problems.join(' '), /ADMIN_SECRET/);
  assert.equal(JSON.stringify(body).includes('segredo-forte'), false, 'nenhum valor secreto na resposta');
});

test('a prontidão avisa quando o banco está fora do ar, e o liveness continua de pé', async () => {
  const app = await subirApp();
  assert.equal((await pronto(app.baseUrl)).status, 200);

  app.opened.close();
  abertos.splice(abertos.indexOf(app), 1); // fechado aqui de proposito

  const { status, body } = await pronto(app.baseUrl);
  assert.equal(status, 503);
  assert.equal(body.database, 'down');
  assert.equal(body.ok, false);

  const sadio = await fetch(`${app.baseUrl}/healthz`);
  assert.equal(sadio.status, 200, 'processo vivo com banco fora: nao e hora de reiniciar, e de tirar do rodizio');

  await new Promise((resolve) => app.server.close(resolve));
});

test('a prontidão mostra que a instância está saindo do ar antes de ela sair', async () => {
  const drainGate = createDrainGate();
  const app = await subirApp({ drainGate });
  assert.equal((await pronto(app.baseUrl)).status, 200);

  drainGate.startDraining();
  const { status, body } = await pronto(app.baseUrl);
  assert.equal(status, 503);
  assert.equal(body.draining, true);
  assert.equal(body.database, 'ready', 'o que mudou foi a drenagem, nao o banco');
  assert.equal((await fetch(`${app.baseUrl}/healthz`)).status, 200);
});

test('drenando, a instância recusa operação nova e stream novo', async () => {
  const drainGate = createDrainGate();
  const app = await subirApp({ drainGate });
  drainGate.startDraining();

  const operacao = await fetch(`${app.baseUrl}/api.php?action=arena_set_open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ open: true }),
  });
  assert.equal(operacao.status, 503);
  assert.equal(operacao.headers.get('connection'), 'close');
  assert.equal(operacao.headers.get('retry-after'), '1');

  const stream = await fetch(`${app.baseUrl}/events`);
  assert.equal(stream.status, 503);
  await stream.text();
});

test('uma operação em voo termina antes de o banco fechar', async () => {
  const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let fechouBanco = false;
  let avaliando = 0;
  const drainGate = createDrainGate();
  const app = await subirApp({
    drainGate,
    criteriaJudge: async () => { avaliando += 1; await dormir(400); return { percent: 80, breakdown: {}, feedback: 'Avaliado' }; },
  });

  const post = async (action, payload = {}) => {
    const response = await fetch(`${app.baseUrl}/api.php?action=${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() };
  };

  const admin = await fetch(`${app.baseUrl}/api.php?action=admin_login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'senha-forte-do-painel' }),
  });
  const token = /arena_admin=([^;]+)/.exec(admin.headers.getSetCookie?.()[0] || '')?.[1];
  assert.ok(token, 'o login devolve a sessao no cookie');

  const comAdmin = async (action, payload = {}) => {
    const response = await fetch(`${app.baseUrl}/api.php?action=${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `arena_admin=${token}` },
      body: JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() };
  };

  await comAdmin('arena_set_open', { open: true });
  const criada = await comAdmin('arena_create_room', { title: 'Turma da drenagem', expected_players: 10 });
  const room = criada.body.room;
  const desafio = await comAdmin('arena_save_challenge', {
    title: 'Cartaz', modality: 'precisao', mission: 'Escreva o prompt do cartaz.',
    criteria: [{ criterion: 'objetivo', weight: 60 }, { criterion: 'contexto', weight: 40 }],
    duration_seconds: 600, speed_weight: 'none', reference_text: 'Cartaz A3 com data, local e contato.',
  });
  await comAdmin('arena_add_round', { room_id: room.id, challenge_id: desafio.body.challenge.id });
  await comAdmin('arena_publish_room', { room_id: room.id });
  await comAdmin('arena_start_round', { room_id: room.id });

  const aluno = await post('arena_join', { code: room.pin || room.code, name: 'Ana' });
  const detalhe = await comAdmin('arena_room_detail', { room_id: room.id });
  const roundId = detalhe.body.detail.rounds.find((round) => round.status === 'open').id;

  // A submissao comeca e fica em voo (o juiz demora 400ms): e ela que a drenagem
  // tem de esperar antes de fechar o banco.
  const emVoo = post('arena_submit', {
    participant_id: aluno.body.participant.id, token: aluno.body.token,
    round_id: roundId, prompt: 'Prompt do cartaz da feira de tecnologia.',
  });
  await dormir(80);
  assert.equal(avaliando, 1, 'a avaliacao esta em voo');

  const resultado = await shutdownGracefully({
    gate: drainGate,
    hub: undefined,
    server: app.server,
    opened: { close: async () => { fechouBanco = true; } },
    timeoutMs: 5000,
  });
  assert.equal(resultado.drenou, true, 'a drenagem esperou a operacao em voo');
  assert.equal(fechouBanco, true, 'o banco so fechou depois');

  const resposta = await emVoo;
  assert.equal(resposta.status, 200, 'a operacao em voo terminou de verdade');
  assert.equal(resposta.body.ok, true);

  abertos.splice(abertos.indexOf(app), 1);
  app.opened.close();
});

test('produção sem painel não sobe: o boot falha antes de criar o banco', async () => {
  const diretorio = mkdtempSync(join(tmpdir(), 'deploy-boot-'));
  const databasePath = join(diretorio, 'nao-deve-existir.sqlite');
  const env = { NODE_ENV: 'production', JUDGE_MODE: 'fallback', DATABASE_PATH: databasePath };
  await assert.rejects(
    bootstrap({ databasePath, env }),
    (error) => /ADMIN_PASSWORD/.test(error.message) && /ADMIN_SECRET/.test(error.message),
  );
  assert.equal(existsSync(databasePath), false, 'implantacao invalida nao deixa banco pela metade');
  rmSync(diretorio, { recursive: true, force: true });

  // O mesmo ambiente, com painel configurado: sobe.
  const comPainel = await bootstrap({
    databasePath,
    env: { ...env, ADMIN_PASSWORD: 'senha-de-producao', ADMIN_SECRET: 'segredo-de-producao-com-32-caracteres' },
  });
  assert.equal(typeof comPainel.handler, 'function');
  assert.ok(comPainel.eventHub && comPainel.drainGate, 'o boot entrega hub e portao para o encerramento');
  comPainel.opened.close();
  rmSync(diretorio, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Perfil de hospedagem. A decisão ("um processo, um volume persistente, SQLite
// local") aparece na prontidao em vez de ficar implicita; e o caminho de banco
// gerenciado fica TRancado atras de uma prova que so quem hospeda pode dar.
test('a prontidão diz qual implantação está no ar, e a recomendada é a do volume persistente', async () => {
  const app = await subirApp({ deployment: { production: false } });
  const { status, body } = await pronto(app.baseUrl);
  assert.equal(status, 200);
  assert.equal(body.hosting, PERSISTENT_VOLUME);
});

test('a prontidão mostra o teto de avaliações externas: em voo, na fila e o resto da cota da hora', async () => {
  // O teto é do processo e invisível de fora sem isto: sem o número, saber que
  // a turma está na fila do provedor seria adivinhação.
  const budget = createJudgeBudget({ maxConcurrent: 3, perHour: 50, maxQueued: 10 });
  let liberar;
  const ocupando = budget.run(() => new Promise((resolve) => { liberar = resolve; }));
  const app = await subirApp({
    judges: {
      mode: 'gemini',
      budget,
      classicJudge: createFakeJudge(),
      criteriaJudge: async () => ({ percent: 70, breakdown: {}, feedback: 'nota' }),
    },
  });

  const { status, body } = await pronto(app.baseUrl);
  assert.equal(status, 200);
  assert.equal(body.judge, 'gemini');
  assert.deepEqual(body.judge_budget, {
    active: 1, queued: 0, concurrency: 3, per_hour: 50, spent_last_hour: 1, remaining_last_hour: 49,
  });
  liberar('fim');
  await ocupando;
});

test('sem teto (modo fallback) a prontidão diz isso em vez de fingir um teto', async () => {
  const app = await subirApp();
  const { body } = await pronto(app.baseUrl);
  assert.equal(body.judge, 'fallback');
  assert.equal(body.judge_budget, null, 'sem rede nao ha teto a mostrar');
});

// O pátio das avaliações que o provedor não entregou (17/09/2026): uma avaliação
// estacionada NÃO pode ficar invisível de fora. `exhausted` é a diferença entre
// "o provedor piscou e voltou" e "a turma ficou sem nota" — e essa diferença tem
// de aparecer sem bloquear tráfego (a instância continua atendendo as outras
// salas, e um 503 aqui faria o host reciclar à toa um processo saudável).
test('a prontidão mostra o pátio e avisa, sem bloquear, quando uma avaliação ficou sem nota', async () => {
  const estado = { parked: 1, attempts: 3, resolved: 4, exhausted: 2, cancelled: 0, next_retry_ms: 1200 };
  const app = await subirApp({
    parking: { state: () => estado, park: () => {}, stop: () => {}, idle: () => Promise.resolve() },
  });
  const { status, body } = await pronto(app.baseUrl);

  assert.equal(status, 200, 'aviso não é impedimento: a instância segue no ar');
  assert.deepEqual(body.judge_parking, estado, 'o estado do pátio é legível de fora');
  const aviso = (body.warnings || []).find((texto) => /ficaram sem nota/.test(texto));
  assert.ok(aviso, `o aviso sobre a nota que não chegou sai no /readyz (avisos: ${JSON.stringify(body.warnings)})`);
  assert.match(aviso, /2 avaliacao\(oes\)/);
  assert.match(aviso, /JUDGE_MODE/, 'e diz onde olhar');
});

test('banco gerenciado sem prova de integridade não fica pronto em produção', async () => {
  const contexto = {
    production: true,
    env: { NODE_ENV: 'production', TURSO_URL: 'libsql://exemplo.turso.io' },
  };
  const app = await subirApp({ deployment: contexto });
  const { status, body } = await pronto(app.baseUrl);
  assert.equal(status, 503, 'nao recebe trafego com integridade referencial nao comprovada');
  assert.equal(body.hosting, MANAGED_DATABASE);
  assert.equal(body.config, 'invalid');
  assert.equal(body.database, 'ready', 'o que falta e prova, nao conexao');
  assert.match(body.problems.join(' '), new RegExp(INTEGRITY_VERIFIED_FLAG));
  assert.match(body.problems.join(' '), /validar-integridade/);
});

test('com a prova registrada, o banco gerenciado fica pronto — e fora de produção a trava não se aplica', async () => {
  const comProva = await subirApp({
    deployment: {
      production: true,
      env: { NODE_ENV: 'production', TURSO_URL: 'libsql://exemplo.turso.io', [INTEGRITY_VERIFIED_FLAG]: '1' },
    },
  });
  const prontoComProva = await pronto(comProva.baseUrl);
  assert.equal(prontoComProva.status, 200);
  assert.equal(prontoComProva.body.hosting, MANAGED_DATABASE);

  const desenvolvimento = await subirApp({
    deployment: { production: false, env: { TURSO_URL: 'libsql://exemplo.turso.io' } },
  });
  assert.equal((await pronto(desenvolvimento.baseUrl)).status, 200, 'em desenvolvimento a trava e do operador, nao do boot');
});

test('o boot recusa o banco gerenciado não validado, com o comando que produz a prova', async () => {
  const diretorio = mkdtempSync(join(tmpdir(), 'deploy-turso-'));
  const databasePath = join(diretorio, 'nao-deve-existir.sqlite');
  const env = {
    NODE_ENV: 'production',
    JUDGE_MODE: 'fallback',
    DATABASE_PATH: databasePath,
    ADMIN_PASSWORD: 'senha-de-producao',
    ADMIN_SECRET: 'segredo-de-producao-com-32-caracteres',
    TURSO_URL: 'libsql://exemplo.turso.io',
  };
  await assert.rejects(
    bootstrap({ databasePath, env }),
    (error) => new RegExp(INTEGRITY_VERIFIED_FLAG).test(error.message)
      && error.message.includes(INTEGRITY_TOOL)
      && !error.message.includes(env.TURSO_URL),
  );
  rmSync(diretorio, { recursive: true, force: true });
});

// O aviso que NAO tira a instancia do ar: em producao, o banco dentro do
// diretorio da aplicacao morre no proximo redeploy (a imagem e substituida
// inteira). Nao da para saber daqui se ha um volume montado por cima, entao e
// aviso — com a condicao que o disparou escrita nele.
test('banco dentro do diretório da aplicação vira aviso visível, e não bloqueio', async () => {
  const dentro = await subirApp({
    deployment: { production: true, databasePath: '/app/var/banco.sqlite', appRoot: '/app' },
  });
  const resposta = await pronto(dentro.baseUrl);
  assert.equal(resposta.status, 200, 'aviso nao bloqueia a subida');
  assert.match(resposta.body.warnings.join(' '), /DATABASE_PATH/);
  assert.match(resposta.body.warnings.join(' '), /redeploy/);

  const fora = await subirApp({
    deployment: { production: true, databasePath: '/data/banco.sqlite', appRoot: '/app' },
  });
  const semAviso = await pronto(fora.baseUrl);
  assert.equal(semAviso.status, 200);
  assert.equal(semAviso.body.warnings, undefined, 'banco no volume nao gera aviso');
});

test('endpoint de juiz alternativo aparece na prontidão — e não derruba a instância', async () => {
  // O override é o que torna possível medir carga contra um provedor controlado.
  // Ele NÃO pode ser recusado (a medição existe justamente para acontecer), mas
  // também não pode ser invisível: uma instância redirecionando avaliação de
  // aluno tem de dizer isso na prontidão.
  const controlado = await subirApp({
    judges: createJudges({ mode: 'gemini', apiKey: 'chave-de-homologacao', baseUrl: 'http://127.0.0.1:9999/v1beta' }),
  });
  const resposta = await pronto(controlado.baseUrl);
  assert.equal(resposta.status, 200, 'aviso não bloqueia: a medição precisa subir');
  assert.equal(resposta.body.judge, 'gemini');
  assert.match(resposta.body.warnings.join(' '), /endpoint alternativo/);
  assert.match(resposta.body.warnings.join(' '), /127\.0\.0\.1:9999/);

  const oficial = await subirApp({ judges: createJudges({ mode: 'gemini', apiKey: 'chave-de-producao' }) });
  const semAviso = await pronto(oficial.baseUrl);
  assert.equal(semAviso.status, 200);
  assert.equal(semAviso.body.warnings, undefined, 'endpoint de fábrica não gera aviso');
});

test('configuração de produção inválida é recusada com o que falta, sem valores', async () => {
  const problemas = deploymentProblems({
    env: { NODE_ENV: 'production', ADMIN_PASSWORD: 'curta', ADMIN_SECRET: 'curto' },
    adminConfigured: false,
  });
  assert.equal(problemas.length, 1);
  assert.match(problemas[0], /ADMIN_PASSWORD/);
  assert.equal(problemas[0].includes('curta'), false);

  assert.throws(
    () => assertDeployable({ env: { NODE_ENV: 'production', JUDGE_MODE: 'gemini-safe' }, adminConfigured: true }),
    /GEMINI_API_KEY/,
  );
  assert.equal(deploymentProblems({ env: { NODE_ENV: 'development' }, adminConfigured: false }).length, 0, 'fora de producao o painel pode ficar desabilitado');
});

// ---------------------------------------------------------------------------
// O cancelamento de rede externa no encerramento. O fio tem tres elos e cada um
// tem a sua prova: o adaptador honra o sinal (test/judge/cancelamento.test.mjs);
// o encerramento CANCELA antes de esperar a drenagem (aqui, primeiro caso); e o
// `bootstrap` entrega ao juiz o sinal que o encerramento aciona (aqui, o
// segundo caso — a cadeia inteira, no HTTP, exatamente na ordem de producao).
test('o encerramento cancela a rede externa antes de esperar a drenagem', async () => {
  const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const servidorFalso = { close: (cb) => cb?.(), closeIdleConnections() {}, closeAllConnections() {} };

  const montar = () => {
    const gate = createDrainGate();
    const controller = new AbortController();
    let terminou = false;
    gate.begin();
    const operacao = (async () => {
      // Uma operacao que so termina quando alguem cancela — como o fetch de um
      // juiz externo.
      await new Promise((resolve) => {
        controller.signal.addEventListener('abort', resolve, { once: true });
        setTimeout(resolve, 5_000);
      });
      terminou = true;
      gate.end();
    })();
    return { gate, controller, operacao, terminou: () => terminou };
  };

  // Sem cancelamento: a drenagem estoura o prazo com a operacao em voo.
  const semCancelar = montar();
  const semCancelarResultado = await shutdownGracefully({
    gate: semCancelar.gate, server: servidorFalso, timeoutMs: 150,
  });
  assert.equal(semCancelarResultado.drenou, false, 'sem cancelar, a operacao em voo segura a saida');
  assert.equal(semCancelarResultado.cancelado, false);

  // Com cancelamento: a mesma operacao termina e a casa fica vazia.
  const comCancelar = montar();
  const resultado = await shutdownGracefully({
    gate: comCancelar.gate, server: servidorFalso,
    cancel: () => comCancelar.controller.abort(), timeoutMs: 300,
  });
  assert.equal(resultado.cancelado, true);
  await comCancelar.operacao;
  assert.equal(comCancelar.terminou(), true, 'cancelar e o que faz a operacao terminar');
  assert.equal(resultado.drenou, true, 'e a drenagem termina dentro do prazo');
  assert.equal(resultado.operacoesEmVoo, 0);
  await dormir(0);
});

test('o bootstrap entrega ao juiz o endpoint do ambiente', async () => {
  // A fiação `GEMINI_BASE_URL` → fabrica de juízes e o que permite medir carga
  // contra um provedor controlado sem gastar cota. Sem esta prova, o arnês
  // mediria a si mesmo: o endpoint continuaria o de fábrica e a nota viria do
  // provedor oficial (ou de uma queda silenciosa para o juiz local).
  const diretorio = mkdtempSync(join(tmpdir(), 'deploy-endpoint-'));
  const databasePath = join(diretorio, 'arena.sqlite');
  const base = {
    NODE_ENV: 'development',
    JUDGE_MODE: 'development-nao-importa',
    PORT: '0',
    ADMIN_PASSWORD: 'senha-forte-do-painel',
    ADMIN_SECRET: 'segredo-forte-do-painel-com-32-caracteres',
  };
  const visto = [];
  const createJudgeSet = (options) => {
    visto.push(options.baseUrl);
    return { mode: 'fallback', baseUrl: options.baseUrl, budget: null, classicJudge: createFakeJudge(), criteriaJudge: createFakeJudge() };
  };

  const controlado = await bootstrap({
    databasePath: join(diretorio, 'a.sqlite'),
    env: { ...base, JUDGE_MODE: 'gemini', GEMINI_BASE_URL: 'http://127.0.0.1:9999/v1beta' },
    createJudgeSet,
    logWriter: () => {},
  });
  assert.equal(visto[0], 'http://127.0.0.1:9999/v1beta');
  controlado.eventHub.closeAll();
  controlado.opened.close();

  const oficial = await bootstrap({
    databasePath: join(diretorio, 'b.sqlite'),
    env: { ...base, JUDGE_MODE: 'gemini', GEMINI_API_KEY: 'chave-de-producao' },
    createJudgeSet,
    logWriter: () => {},
  });
  assert.equal(visto[1], undefined, 'sem a variável, os adaptadores usam o endpoint de fábrica');
  oficial.eventHub.closeAll();
  oficial.opened.close();

  await assert.rejects(
    () => bootstrap({
      databasePath: join(diretorio, 'c.sqlite'),
      env: { ...base, JUDGE_MODE: 'gemini', GEMINI_BASE_URL: 'nao-e-url' },
      logWriter: () => {},
    }),
    /GEMINI_BASE_URL invalido/,
    'URL torta derruba o boot, antes de o servidor aceitar qualquer requisicao',
  );
});

test('o bootstrap entrega ao juiz o sinal que o encerramento aciona', async () => {
  const diretorio = mkdtempSync(join(tmpdir(), 'deploy-cancelamento-'));
  const databasePath = join(diretorio, 'arena.sqlite');
  const env = {
    NODE_ENV: 'development',
    JUDGE_MODE: 'gemini',
    GEMINI_API_KEY: 'chave-que-nunca-e-usada',
    PORT: '0',
    ADMIN_PASSWORD: 'senha-forte-do-painel',
    ADMIN_SECRET: 'segredo-forte-do-painel-com-32-caracteres',
  };
  const observado = { sinal: null, avaliacoes: 0 };
  // Fabrica no lugar de `createJudges`: os dois juizes ficam pendurados ate o
  // sinal abortar, e resolvem localmente marcados (a promessa do modo `gemini`).
  const createJudgeSet = (options) => {
    observado.sinal = options.signal;
    const pendurado = () => new Promise((resolve) => {
      observado.avaliacoes += 1;
      const concluir = () => resolve({
        percent: 0,
        breakdown: {},
        feedback: 'Avaliação interrompida pelo encerramento.',
        metadata: { provider: 'local', fallback_used: true, fallback_reason: 'gemini_cancelled', judge_mode: options.mode },
      });
      if (options.signal?.aborted) return concluir();
      options.signal?.addEventListener('abort', concluir, { once: true });
    });
    return { mode: options.mode, classicJudge: pendurado, criteriaJudge: pendurado };
  };

  const app = await bootstrap({ databasePath, env, createJudgeSet });
  assert.ok(observado.sinal, 'a fabrica recebeu o sinal');
  assert.equal(observado.sinal.aborted, false, 'nada cancelado enquanto a instancia atende');
  const server = createServer(app.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const post = async (action, payload = {}, cookie) => {
      const response = await fetch(`${baseUrl}/api.php?action=${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.json(), setCookie: response.headers.getSetCookie?.()[0] || '' };
    };
    const login = await post('admin_login', { password: 'senha-forte-do-painel' });
    const token = /arena_admin=([^;]+)/.exec(login.setCookie)?.[1];
    const admin = (action, payload = {}) => post(action, payload, `arena_admin=${token}`);

    await admin('arena_set_open', { open: true });
    const criada = await admin('arena_create_room', { title: 'Turma do encerramento', expected_players: 10 });
    const room = criada.body.room;
    const desafio = await admin('arena_save_challenge', {
      title: 'Cartaz', modality: 'precisao', mission: 'Escreva o prompt do cartaz.',
      criteria: [{ criterion: 'objetivo', weight: 100 }],
      duration_seconds: 600, speed_weight: 'none', reference_text: 'Cartaz A3 com data, local e contato.',
    });
    await admin('arena_add_round', { room_id: room.id, challenge_id: desafio.body.challenge.id });
    await admin('arena_publish_room', { room_id: room.id });
    await admin('arena_start_round', { room_id: room.id });

    const aluno = await post('arena_join', { code: room.pin || room.code, name: 'Ana' });
    const detalhe = await admin('arena_room_detail', { room_id: room.id });
    const roundId = detalhe.body.detail.rounds.find((round) => round.status === 'open').id;

    const emVoo = post('arena_submit', {
      participant_id: aluno.body.participant.id, token: aluno.body.token,
      round_id: roundId, prompt: 'Prompt do cartaz da feira de tecnologia.',
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(observado.avaliacoes, 1, 'a avaliacao esta em voo no provedor');

    let bancoFechado = false;
    const resultado = await shutdownGracefully({
      gate: app.drainGate, hub: app.eventHub, server,
      opened: { close: async () => { bancoFechado = true; } },
      cancel: app.cancelarPendencias,
      timeoutMs: 5_000,
    });
    assert.equal(observado.sinal.aborted, true, 'o encerramento abortou o MESMO sinal que o juiz recebeu');
    assert.equal(resultado.drenou, true, 'a avaliacao em voo terminou em vez de segurar a saida');

    const resposta = await emVoo;
    assert.equal(resposta.status, 200);
    assert.equal(resposta.body.ok, true, 'o envio do aluno nao fica sem nota por causa do encerramento');
    assert.equal(bancoFechado, true, 'o banco fechou depois de a avaliacao terminar');
  } finally {
    try { server.close(); } catch {}
    app.opened.close();
    rmSync(diretorio, { recursive: true, force: true });
  }
});

// Atras de um proxy, `remoteAddress` e o endereco DO PROXY: cinco PINs errados de
// um aluno travavam a turma inteira. Cabecalho de IP encaminhado so vale quando a
// conexao imediata e um proxy confiavel.
test('o endereço do visitante só vem do cabeçalho quando quem falou é um proxy confiável', () => {
  const pedido = (socket, forwarded) => ({ socket: { remoteAddress: socket }, headers: forwarded ? { 'x-forwarded-for': forwarded } : {} });

  // Sem proxy confiavel, o cabecalho nao vale nada (qualquer um pode escreve-lo).
  assert.equal(clientAddress(pedido('203.0.113.7', '1.2.3.4'), parseTrustedProxies('')), '203.0.113.7');

  // Com o proxy confiavel, vale a ULTIMA entrada que nao for proxy: o cliente.
  const confiavel = parseTrustedProxies('127.0.0.1,::1');
  assert.equal(clientAddress(pedido('127.0.0.1', '198.51.100.9'), confiavel), '198.51.100.9');
  assert.equal(clientAddress(pedido('::ffff:127.0.0.1', '198.51.100.9, 127.0.0.1'), confiavel), '198.51.100.9');
  // Cabecalho forjado pelo cliente fica a ESQUERDA do proxy: nao vale.
  assert.equal(clientAddress(pedido('127.0.0.1', '10.0.0.99, 198.51.100.9'), confiavel), '198.51.100.9');
  // Faixa IPv4 (proxy em outro conteiner).
  const faixa = parseTrustedProxies('172.17.0.0/16');
  assert.equal(clientAddress(pedido('172.17.0.4', '198.51.100.9'), faixa), '198.51.100.9');
  assert.equal(clientAddress(pedido('172.18.0.4', '198.51.100.9'), faixa), '172.18.0.4');
  assert.throws(() => parseTrustedProxies('proxy.interno'), /TRUSTED_PROXIES invalido/);
});
