import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { openDatabase } from '../db/database.mjs';
import { createRepositories } from '../db/repositories/index.mjs';
import { createJudges, judgeEndpointWarning } from '../judge/configuration.mjs';
import { createEvaluationParking } from '../judge/parking.mjs';
import { createApi } from './api.mjs';
import { createArenaApi } from './arena-api.mjs';
import { createAdminAuth } from './admin-auth.mjs';
import { createRoomEventHub, roomIdFromOutcome } from './events.mjs';
import { createEventsScopeResolver } from './events-scope.mjs';
import { createApiHttpHandler } from './http.mjs';
import { createLog, createRequestId } from './log.mjs';
import { assertDeployable, clientAddress, deploymentProblems, isProduction, parseTrustedProxies } from './environment.mjs';
import { resolveHosting, hostingWarnings } from './hosting.mjs';
import { SHUTDOWN_TIMEOUT_MS, createDrainGate, shutdownGracefully } from './lifecycle.mjs';
import { readAdminToken } from './cookies.mjs';
import { ApiError } from './validation.mjs';
import { renderPage } from '../web/pages/index.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
try { process.loadEnvFile(join(root, '.env')); } catch {}
const publicRoot = join(root, 'public');
const types = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
// Fluxo classico legado: nenhuma pagina viva consome estas acoes pela rede
// (o produto usa a Arena). Elas ficam bloqueadas no HTTP de producao e so
// rodam em testes de regressao do motor classico via allowLegacyPublicApi.
const LEGACY_PUBLIC_ACTIONS = new Set([
  'register', 'heartbeat', 'room_status', 'start_match', 'match_status',
  'submit_prompt', 'retry_score', 'client_log', 'metrics',
]);
const ROOM_EVENT_ACTIONS = new Set(['register', 'start_match', 'submit_prompt', 'retry_score', 'admin_reset']);
const ARENA_EVENT_ACTIONS = new Set([
  'arena_join', 'arena_submit', 'arena_start_round', 'arena_pause_round',
  'arena_resume_round', 'arena_end_round', 'arena_close_round', 'arena_end_room',
  'arena_publish_room', 'arena_add_round', 'arena_add_lesson',
  'arena_remove_participant', 'arena_set_open',
  'arena_update_room', 'arena_delete_room', 'arena_archive_room',
  'arena_remove_round', 'arena_reorder_rounds', 'arena_rename_participant',
]);

import { DEFAULT_ROUNDS, isRepeatedLegacyChallengeSet } from '../domain/classic-rounds.mjs';
export { DEFAULT_ROUNDS, isRepeatedLegacyChallengeSet };

function sendStatic(request, response) {
  const path = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  const candidate = resolve(publicRoot, `.${path.slice('/public'.length)}`);
  if (!candidate.startsWith(publicRoot + sep) || !existsSync(candidate) || !statSync(candidate).isFile()) return false;
  response.writeHead(200, {
    'content-type': types[extname(candidate)] || 'application/octet-stream',
    'cache-control': 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'SAMEORIGIN',
    'referrer-policy': 'strict-origin-when-cross-origin',
  });
  createReadStream(candidate).on('error', () => response.destroy()).pipe(response);
  return true;
}

// Prioridade de injecao dos juizes, explicita para nao haver duas fontes de
// verdade (era aqui que a Arena criava o proprio juiz lendo `process.env`):
//   1. juiz injetado da superficie (`judge`, `classicJudge`, `criteriaJudge`
//      ou o nome antigo `arenaJudge`) — usado pelos testes;
//   2. conjunto injetado (`judges`, vindo do bootstrap);
//   3. politica de modo (`judgeConfiguration`) — padrao local, sem rede.
// `criteriaJudge` e o nome canonico; `arenaJudge` segue aceito como alias.
export function createApplication({
  repositories, judge, now, id, adminPassword, adminSecret, adminAuth: sharedAdminAuth,
  judges, judgeConfiguration, arenaJudge, criteriaJudge, classicJudge, eventHub, eventRevalidateMs, allowLegacyPublicApi = false,
  drainGate, deployment, log, submitWaitMs, parking,
  // O VIGIA da fila de avaliacoes: de quanto em quanto tempo olhar o banco atras
  // de submissao sem nota, quanto esperar antes de rearmar uma avaliacao que ja
  // esgotou o surto, e quantas vezes rearmar. Zero (ou ausente) desliga o vigia —
  // o boot ainda retoma, que e o comportamento antigo.
  parkSweepMs = 0, parkRearmMs = 10 * 60 * 1000, parkRearms = 6,
} = {}) {
  // Sem escritor por padrao: quem sobe a instancia liga o log de producao
  // (`bootstrap`). Assim um teste que falha nao vira ruido no console, e a
  // linha de falha em producao nunca deixa de existir por esquecimento.
  const registro = log || createLog({ write: () => {} });
  const roomEvents = eventHub || createRoomEventHub({ revalidateMs: eventRevalidateMs });
  // A sala que mudou de estado avisa as telas dela — por evento (aluno que
  // acabou de receber nota) e por reprocessamento do patio (nota que chegou
  // sozinha, ou tentativa que falhou de novo).
  const avisarSala = (roomId) => {
    if (!roomId) return;
    roomEvents.broadcast('arena_score_ready', {
      serverNow: Number(now?.() ?? Date.now() / 1000),
      roomId,
    });
  };
  // O patio das avaliacoes que o provedor nao entregou. Nasce aqui (e nao dentro
  // da Arena) porque a PRONTIDAO precisa mostrar quantas esperam e quantas
  // desistiram, e o ENCERRAMENTO precisa parar as esperas.
  const parkingLot = parking || createEvaluationParking({
    log: (evento, dados) => registro.warn(evento, dados),
    onSettled: (entrada) => avisarSala(entrada?.roomId),
  });
  // De onde vem o visitante e em que ambiente estamos: os dois entram por
  // opcao para que o teste possa fingir producao e lista de proxies sem mexer
  // no `process.env` do proprio runner.
  const ambiente = {
    production: isProduction(process.env),
    trustedProxies: parseTrustedProxies(process.env.TRUSTED_PROXIES || '127.0.0.1,::1'),
    env: process.env,
    ...deployment,
  };
  // Qual implantacao esta no ar, para a prontidao poder dizer de fora: um
  // processo com volume persistente e SQLite local, ou um banco gerenciado
  // (que so entra depois de validado no banco do operador).
  const remoteDatabase = Boolean(String(ambiente.env.TURSO_URL || '').trim());
  const profile = resolveHosting(ambiente.env, { remote: remoteDatabase });
  const effectivePassword = adminPassword ?? process.env.ADMIN_PASSWORD;
  const effectiveSecret = adminSecret ?? process.env.ADMIN_SECRET;
  const auth = sharedAdminAuth || createAdminAuth({
    password: effectivePassword,
    secret: effectiveSecret,
    now,
  });
  // Quem entra no stream, e de que sala: cookie do painel, cookie da projecao
  // ou a sessao do aluno. Sem prova, a conexao fica no escopo global.
  const resolveEventsScope = createEventsScopeResolver({ repositories, adminAuth: auth, now });
  const policy = judges || createJudges(judgeConfiguration);
  const coreJudge = judge || policy.classicJudge;
  const arenaClassicJudge = classicJudge || judge || policy.classicJudge;
  const arenaCriteriaJudge = criteriaJudge ?? arenaJudge ?? policy.criteriaJudge;
  const coreDispatch = createApi({ repositories, judge: coreJudge, now, id, adminPassword: effectivePassword, adminSecret: effectiveSecret, adminAuth: auth });
  const arenaDispatch = createArenaApi({
    repositories,
    judge: arenaCriteriaJudge,
    classicJudge: arenaClassicJudge,
    now,
    id,
    adminAuth: auth,
    log: registro,
    ...(Number.isFinite(submitWaitMs) ? { submitWaitMs } : {}),
    parking: parkingLot,
    // Nota que fica pronta depois da resposta pendente: o aviso de tempo real
    // sai daqui, com a sala RESOLVIDA pelo servidor (o hub so entrega para quem
    // provou seguir aquela sala).
    onRoomChanged: avisarSala,
  });
  const dispatch = async (action, payload, meta) => {
    // O evento leva a sala de origem (resolvida do resultado validado, nunca de
    // campo do cliente) porque e por ela que o hub decide quem recebe: a
    // conexao so e alcancada se provou seguir essa sala.
    if (typeof action === 'string' && action.startsWith('arena_')) {
      const result = await arenaDispatch(action, payload, meta);
      if (ARENA_EVENT_ACTIONS.has(action)) {
        const serverNow = Number(result?.server_now);
        roomEvents.broadcast(action, {
          serverNow: Number.isFinite(serverNow) ? serverNow : Date.now() / 1000,
          roomId: roomIdFromOutcome(payload, result),
        });
      }
      return result;
    }
    const result = await coreDispatch(action, payload, meta);
    if (ROOM_EVENT_ACTIONS.has(action)) {
      const serverNow = Number(result?.server_now);
      roomEvents.broadcast(action, {
        serverNow: Number.isFinite(serverNow) ? serverNow : Date.now() / 1000,
        roomId: roomIdFromOutcome(payload, result),
      });
    }
    return result;
  };
  const api = createApiHttpHandler(async (action, payload, meta) => {
    if (!allowLegacyPublicApi && LEGACY_PUBLIC_ACTIONS.has(action)) {
      throw new ApiError(403, 'Fluxo legado desativado. Entre em uma sala pela Arena (codigo + nome) ou use o Painel da Arena.');
    }
    return dispatch(action, payload, meta);
  }, {
    clientAddress: (request) => clientAddress(request, ambiente.trustedProxies),
    log: registro,
  });
  /**
   * Prontidao: o host so deve mandar trafego para uma instancia que consiga
   * atender. Sao quatro perguntas diferentes e cada uma ja falhou uma vez:
   *
   *   - `database`: o banco responde (uma leitura de verdade, nao um cache);
   *   - `config`: a implantacao tem como funcionar — em producao, painel sem
   *     senha/segredo nao e "modo degradado", e instalacao quebrada (antes o
   *     `/healthz` respondia 200 e o host marcava como pronta uma instancia em
   *     que o professor nao conseguia entrar);
   *   - `judge`: o modo em uso, para a operacao ver de fora com qual provedor a
   *     turma esta sendo avaliada;
   *   - `draining`: o encerramento ja comecou, entao esta instancia sai do
   *     rodizio mesmo estando de pe.
   *
   * A resposta nao carrega senha, chave nem token — so estado.
   */
  async function getReadiness() {
    let database = 'ready';
    try {
      await repositories.rooms.list();
    } catch {
      database = 'down';
    }
    // `production` vem do MESMO lugar que decidiu o ambiente da aplicacao: se
    // cada um lesse o `NODE_ENV` por conta propria, a prontidao e o boot
    // poderiam discordar sobre o que e producao.
    const problems = deploymentProblems({
      env: ambiente.env,
      adminConfigured: Boolean(auth.configured),
      production: ambiente.production,
      hosting: { remote: remoteDatabase },
    });
    // Aviso nao e impedimento: a instancia segue pronta e o operador ve o que
    // precisa olhar (banco dentro do diretorio da aplicacao, por exemplo).
    const warnings = hostingWarnings({
      env: ambiente.env,
      remote: remoteDatabase,
      databasePath: ambiente.databasePath,
      appRoot: ambiente.appRoot,
    });
    // Endpoint do juiz fora do oficial: aviso, nao impedimento (o override e o
    // que torna possivel a medicao de carga sem cota).
    const avisoDeEndpoint = judgeEndpointWarning(policy.baseUrl);
    if (avisoDeEndpoint) warnings.push(avisoDeEndpoint);
    // Avaliacoes que passaram do teto de reprocessamentos ficaram SEM nota. Nao
    // bloqueia (a instancia continua atendendo o resto) e nao passa em silencio:
    // e a diferenca entre "o provedor piscou e voltou" e "a turma nao tem nota".
    const patio = parkingLot.state();
    const avisoDoPatio = patio.exhausted > 0
      ? `${patio.exhausted} avaliacao(oes) ficaram sem nota depois das tentativas automaticas: `
        + 'verifique o provedor (JUDGE_MODE/GEMINI_API_KEY/projeto) e o log; o aluno pode reenviar a mesma tentativa.'
      : null;
    if (avisoDoPatio) warnings.push(avisoDoPatio);
    const draining = Boolean(drainGate?.draining);
    return {
      ok: database === 'ready' && problems.length === 0 && !draining,
      service: 'up',
      database,
      config: problems.length ? 'invalid' : 'valid',
      hosting: profile,
      judge: policy.mode,
      // Teto de avaliacoes externas desta instancia: quantas estao em voo,
      // quantas esperam e quanto da cota da hora ja foi usado. Sem isto, a
      // unica forma de saber que a turma esta na fila seria adivinhar.
      judge_budget: policy.budget ? policy.budget.state() : null,
      // Avaliacoes esperando o provedor voltar, entregues e desistidas. Sem esta
      // linha, "a nota nao chegou" nao tem de onde ser visto de fora.
      judge_parking: patio,
      // O que a ULTIMA varredura encontrou: avaliacoes sem nota que voltaram
      // para a fila, as que ainda esperam o resfriamento e as que gastaram tudo.
      // Sem isto, um reinicio que deixou submissao para tras seria invisivel — e
      // "o aluno reenvia" voltaria a ser a unica saida.
      ...(ultimaRetomada ? { judge_parking_resume: ultimaRetomada } : {}),
      // E o vigia, para o operador saber que a rede de seguranca esta de pe e o
      // que ela ja recuperou desde a subida.
      ...(vigiaTimer !== null
        ? { judge_parking_watch: { running: true, interval_ms: parkSweepMs, ...totaisDaFila } }
        : {}),
      draining,
      ...(problems.length ? { problems } : {}),
      ...(warnings.length ? { warnings } : {}),
    };
  }

  /**
   * Retoma as avaliacoes sem nota — o que a fila do banco guardou de um processo
   * que morreu (ou do que nunca chegou a ser avaliado). O boot chama uma vez e o
   * VIGIA a repete de tempos em tempos: e isso que faz a recuperacao nao depender
   * de reinicio. Fica na funcao devolvida porque o teste precisa exercitar
   * exatamente o mesmo caminho.
   */
  let ultimaRetomada = null;
  // O acumulado da rede de seguranca desde a subida. O resumo da ultima
  // varredura diz o que ela VIU (e uma submissao ja na fila aparece como
  // `running`, nao como `resumed`); estes numeros dizem o que a fila JA
  // recuperou — sem eles, um caso recuperado some do /readyz na varredura
  // seguinte e o operador nao tem como saber que a rede funcionou.
  const totaisDaFila = { sweeps: 0, recovered: 0, rearmed: 0 };
  const retomarEstacionadas = async (opcoes = {}) => {
    const resumo = await arenaDispatch.retomarEstacionadas?.({ rearmMs: parkRearmMs, rearrms: parkRearms, ...opcoes });
    if (!resumo) return resumo;
    ultimaRetomada = resumo;
    totaisDaFila.sweeps += 1;
    totaisDaFila.recovered += Number(resumo.resumed || 0) + Number(resumo.rearms || 0);
    totaisDaFila.rearmed += Number(resumo.rearms || 0);
    return resumo;
  };

  /**
   * O VIGIA da fila: de tempos em tempos, olha o banco atras de submissao sem
   * nota e a devolve para o patio. Ele existe porque a fila pode perder o relogio
   * SEM o processo morrer — e porque uma avaliacao que esgotou o surto de
   * tentativas ainda pode ser salva quando o provedor volta. Hoje, sem ele, os
   * dois casos so tinham dois desfechos: reiniciar, ou o aluno reenviar.
   *
   * Uma varredura por vez (o intervalo nao pode empilhar consultas), nada de
   * trabalho novo durante a drenagem, e o temporizador nao segura o processo
   * (`unref`): o vigia e o ultimo a importar, nunca o motivo de o processo ficar
   * de pe.
   */
  let vigiaTimer = null;
  let varrendo = false;
  const pararVigia = () => {
    if (vigiaTimer === null) return;
    clearInterval(vigiaTimer);
    vigiaTimer = null;
  };
  const varrerFila = async () => {
    if (varrendo || drainGate?.draining) return;
    varrendo = true;
    try {
      await retomarEstacionadas({ source: 'vigia' });
    } catch (error) {
      // Uma varredura que falha nao pode derrubar nada: a proxima tenta de novo.
      registro.warn('judge_park_sweep_failed', { error: String(error?.message || error).slice(0, 200) });
    } finally {
      varrendo = false;
    }
  };
  const iniciarVigiaDaFila = ({ intervalMs = parkSweepMs } = {}) => {
    const intervalo = Number(intervalMs);
    if (!Number.isFinite(intervalo) || intervalo <= 0) return { rodando: false, parar: pararVigia };
    if (vigiaTimer !== null) return { rodando: true, parar: pararVigia };
    vigiaTimer = setInterval(() => { void varrerFila(); }, intervalo);
    vigiaTimer.unref?.();
    return { rodando: true, parar: pararVigia };
  };

  const handler = async (request, response) => {
    try {
    const url = new URL(request.url, 'http://local');
    if (url.pathname === '/healthz' || url.pathname === '/readyz') {
      if (request.method !== 'GET') return response.writeHead(405).end('Method not allowed');
      // Duas perguntas, dois caminhos: `/healthz` e "o processo esta vivo?" e
      // nao toca no banco (prontidao negativa nao pode virar reinicio em laco
      // por um banco que piscou); `/readyz` e "posso receber trafego?" e olha
      // banco, configuracao, modo do juiz e drenagem.
      const sadio = url.pathname === '/healthz';
      const readiness = sadio ? { ok: true, service: 'up' } : await getReadiness();
      response.writeHead(readiness.ok ? 200 : 503, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'referrer-policy': 'strict-origin-when-cross-origin',
      }).end(JSON.stringify(readiness));
      return;
    }
    // Encerrando, esta instancia nao aceita operacao nova nem stream novo: 503
    // com `Connection: close` faz o proxy tirar da rotacao e a superficie
    // reconectar em outro lugar, em vez de meio-a-meio num processo que vai sair.
    if ((url.pathname === '/api.php' || url.pathname === '/events') && drainGate?.draining) {
      response.writeHead(503, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'close',
        'retry-after': '1',
      }).end('Servidor reiniciando.');
      return;
    }
    if (url.pathname === '/events') {
      if (request.method !== 'GET') return response.writeHead(405).end('Method not allowed');
      // O escopo e decidido aqui, pela credencial que a conexao trouxe: a
      // conexao de sala recebe o evento da propria sala mais o global; a que
      // nao provou nada recebe so o global.
      const scope = await resolveEventsScope(request, url);
      roomEvents.subscribe(request, response, {
        scope,
        // Reverificacao periodica: a MESMA pergunta, feita de novo com a mesma
        // credencial. Quando ela deixa de render a sala (aluno removido, token
        // da projecao vencido, cookie do painel expirado), o escopo novo nao
        // bate com o registrado e o hub fecha a conexao. Uma unica fonte da
        // regra: quem sabe responder e este resolver, nao uma copia no hub.
        revalidate: () => resolveEventsScope(request, url),
      });
      return;
    }
    if (url.pathname === '/api.php') {
      // Operacao em voo conta para a drenagem: o encerramento espera ela acabar
      // (ate o prazo) antes de fechar o banco.
      drainGate?.begin();
      try {
        return await api(request, response);
      } finally {
        drainGate?.end();
      }
    }
    if (url.pathname === '/favicon.ico') {
      if (request.method !== 'GET') return response.writeHead(405).end('Method not allowed');
      const favicon = resolve(publicRoot, './assets/figma/live-arena-logo.svg');
      if (!existsSync(favicon)) return response.writeHead(404).end('Not found');
      response.writeHead(200, {
        'content-type': 'image/svg+xml',
        'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'referrer-policy': 'strict-origin-when-cross-origin',
      });
      createReadStream(favicon).pipe(response);
      return;
    }
    if (url.pathname.startsWith('/public/')) {
      if (request.method !== 'GET' || !sendStatic(request, response)) {
        response.writeHead(404).end('Not found');
      }
      return;
    }
    if (request.method !== 'GET') return response.writeHead(405).end('Method not allowed');
    // Gate do Painel da Arena e do Relatorio no servidor: anonimos recebem so
    // o card de login (ou redirecionamento), e o markup completo (criar sala,
    // desafios, missoes, reset) so e renderizado com o cookie HttpOnly valido.
    const cookieToken = readAdminToken(request);
    const authenticated = Boolean(cookieToken) && auth.verify(cookieToken);
    const page = renderPage(request.url, { authenticated });
    response.writeHead(page.status, page.headers).end(page.body);
    } catch (error) {
      if (response.headersSent) return response.destroy();
      const status = error instanceof URIError ? 400 : 500;
      const requestId = createRequestId();
      // Falha ao renderizar pagina tambem entra no log correlacionavel: sem
      // isto, um 500 na tela do aluno nao deixava rastro nenhum no servidor.
      if (status === 500) {
        registro.registrar({
          level: 'error',
          event: 'page_failure',
          request_id: requestId,
          path: (() => { try { return new URL(request.url, 'http://local').pathname; } catch { return ''; } })(),
          error: { name: error?.name || 'Error', message: error?.message || error },
        });
      }
      response.writeHead(status, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-request-id': requestId,
      }).end(status === 400 ? 'Caminho inválido.' : 'Erro interno.');
    }
  };
  handler.retomarEstacionadas = retomarEstacionadas;
  handler.iniciarVigiaDaFila = iniciarVigiaDaFila;
  handler.pararVigiaDaFila = pararVigia;
  return handler;
}

export async function bootstrap({
  databasePath = process.env.DATABASE_PATH || './var/descubra-o-prompt.sqlite',
  eventRevalidateMs,
  env = process.env,
  // Ponto de injecao dos juizes, como `judge`/`criteriaJudge` em
  // `createApplication`: o teste de fio troca a fabrica para observar que o
  // sinal de encerramento e o que chega nela — sem isso, provar o fio exigiria
  // falar com o Gemini de verdade.
  createJudgeSet = createJudges,
  // Para onde vai a linha de falha. É um ESCRITOR e não um logger pronto de
  // propósito: assim a lista de segredos a limpar é sempre a do ambiente desta
  // instalação, inclusive nos testes, que passam a capturar as linhas.
  logWriter,
} = {}) {
  const remoteDatabase = Boolean(String(env.TURSO_URL || '').trim());
  const caminhoDoBanco = resolve(databasePath);
  // Um sinal so para o encerramento. Ele chega aos juizes: quando o processo
  // esta saindo, uma chamada externa em voo nao pode segurar a drenagem ate o
  // host matar a instancia — e sem isto o `fetch` do Gemini ficava ate 12-15 s
  // depois do prazo combinado.
  const encerramento = new AbortController();
  // Um unico ponto le a politica do ambiente e deriva os DOIS juizes. Modo
  // desconhecido falha aqui — antes de abrir banco e antes de o servidor
  // aceitar qualquer requisicao, sem deixar conexao aberta para tras.
  // Numeros do ambiente com validacao: um `JUDGE_CONCURRENCY=abc` nao pode virar
  // teto NaN (que recusaria tudo) nem 0 (que travaria a fila para sempre).
  const inteiroDoAmbiente = (chave) => {
    const valor = Number(env[chave]);
    return Number.isInteger(valor) && valor > 0 ? valor : undefined;
  };
  const judges = createJudgeSet({
    mode: env.JUDGE_MODE,
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
    // Endpoint do provedor. Em producao e o de fabrica; fora dele (homologacao,
    // medicao com stub controlado) ele e validado e DENUNCIADO na prontidao —
    // uma instancia nao pode redirecionar avaliacao de aluno em silencio.
    baseUrl: env.GEMINI_BASE_URL,
    signal: encerramento.signal,
    budgetLimits: {
      ...(inteiroDoAmbiente('JUDGE_CONCURRENCY') ? { maxConcurrent: inteiroDoAmbiente('JUDGE_CONCURRENCY') } : {}),
      ...(inteiroDoAmbiente('JUDGE_CALLS_PER_HOUR') ? { perHour: inteiroDoAmbiente('JUDGE_CALLS_PER_HOUR') } : {}),
      ...(Number.isInteger(Number(env.JUDGE_QUEUE_MAX)) && Number(env.JUDGE_QUEUE_MAX) >= 0
        ? { maxQueued: Number(env.JUDGE_QUEUE_MAX) } : {}),
    },
  });
  const submitWaitMs = inteiroDoAmbiente('SUBMIT_WAIT_MS') ?? 8000;
  // Configuracao do VIGIA da fila de avaliacoes. Um inteiro >= 0: zero desliga.
  // Junk cai no padrao — um `JUDGE_PARK_SWEEP_MS=abc` nao pode virar vigia
  // desligado em silencio nem intervalo NaN.
  const inteiroNaoNegativo = (chave, padrao) => {
    const valor = Number(env[chave]);
    return Number.isInteger(valor) && valor >= 0 ? valor : padrao;
  };
  const parkSweepMs = inteiroNaoNegativo('JUDGE_PARK_SWEEP_MS', 60_000);
  const parkRearmMs = inteiroNaoNegativo('JUDGE_PARK_REARM_MS', 600_000);
  const parkRearms = inteiroNaoNegativo('JUDGE_PARK_REARMS', 6);
  // Producao invalida nao abre o servidor: subir com o painel desabilitado era a
  // forma de o host marcar como pronta uma instalacao que o professor nao
  // conseguia usar. A mensagem diz o que falta e nunca imprime valor secreto.
  const auth = createAdminAuth({ password: env.ADMIN_PASSWORD, secret: env.ADMIN_SECRET });
  // Os segredos VIVOS entram no log como lista de limpeza: qualquer mensagem de
  // erro que os contenha sai com `[redigido]` no lugar, mesmo em campo que
  // ninguem previu. Eles nao sao impressos em nenhum caminho.
  const registro = createLog({
    write: logWriter || ((linha) => console.error(linha)),
    secrets: [env.ADMIN_PASSWORD, env.ADMIN_SECRET, env.GEMINI_API_KEY, env.TURSO_AUTH_TOKEN],
  });
  // A mesma pergunta cobre a hospedagem: um banco gerenciado sem prova de
  // integridade referencial no banco do operador e implantacao invalida, nao um
  // detalhe a descobrir no meio da aula (a trava vive em `hosting.mjs`).
  assertDeployable({ env, adminConfigured: auth.configured, hosting: { remote: remoteDatabase } });
  mkdirSync(dirname(caminhoDoBanco), { recursive: true });
  const opened = openDatabase(databasePath);
  await opened.migrate();
  const repositories = createRepositories(opened.database);
  const timestamp = Date.now() / 1000;
  let game = await repositories.rooms.getActive();
  if (!game) game = await repositories.rooms.createCycle({ id: randomUUID(), now: timestamp });
  const configuredRounds = (await repositories.rooms.getState(game.id)).rounds;
  if (configuredRounds.length === 0 || isRepeatedLegacyChallengeSet(configuredRounds)) {
    await repositories.rooms.putRounds(game.id, DEFAULT_ROUNDS, timestamp);
  }

  // Hub e portao nascem aqui (e nao dentro do handler) porque o encerramento
  // precisa deles: e o hub que fecha os streams e o portao que diz quando a
  // ultima operacao em voo terminou.
  const eventHub = createRoomEventHub({ revalidateMs: eventRevalidateMs });
  const drainGate = createDrainGate();
  // O patio das avaliacoes que o provedor nao entregou nasce aqui, e nao dentro da
  // criacao da aplicacao, porque ele e da INSTANCIA: a prontidao mostra o estado
  // dele, o log registra cada tentativa e o encerramento para as esperas.
  const parking = createEvaluationParking({
    log: (evento, dados) => registro.warn(evento, dados),
  });
  const handler = createApplication({
    repositories,
    judge: judges.classicJudge,
    judges,
    eventHub,
    drainGate,
    adminAuth: auth,
    log: registro,
    submitWaitMs,
    parking,
    parkSweepMs,
    parkRearmMs,
    parkRearms,
    deployment: {
      env,
      production: isProduction(env),
      trustedProxies: parseTrustedProxies(env.TRUSTED_PROXIES || '127.0.0.1,::1'),
      databasePath: caminhoDoBanco,
      appRoot: root,
    },
  });

  // Depois de um reinicio (ou de um redeploy), as submissoes que ficaram SEM nota
  // voltam para a fila: elas sempre estiveram no banco — o que morria com o
  // processo era so a espera. Isto e aguardado porque e uma leitura; as
  // avaliacoes retomadas agendam sozinhas e nao seguram a subida do servidor.
  await handler.retomarEstacionadas().catch((error) => {
    registro.warn('judge_park_resume_failed', { error: String(error?.message || error).slice(0, 200) });
  });
  // E o VIGIA continua olhando a fila enquanto a instancia estiver de pe: sem
  // ele, a avaliacao que perdeu o relogio so voltava por reinicio ou por reenvio
  // do aluno. `JUDGE_PARK_SWEEP_MS=0` desliga (e o boot segue retomando).
  const vigia = handler.iniciarVigiaDaFila();
  if (vigia.rodando) {
    registro.warn('judge_park_watch_started', {
      interval_ms: parkSweepMs, rearm_ms: parkRearmMs, rearrms: parkRearms,
    });
  }

  return {
    opened,
    repositories,
    judgeMode: judges.mode,
    handler,
    eventHub,
    drainGate,
    parking,
    pararVigia: handler.pararVigiaDaFila,
    log: registro,
    cancelarPendencias: () => encerramento.abort(),
  };
}

/**
 * Sobe o servidor de verdade e liga o encerramento aos sinais.
 *
 * Está numa função exportada — e nao solta no bloco principal — porque o teste de
 * processo precisa do MESMO caminho de encerramento: o Windows nao entrega
 * `SIGTERM` a outro processo (a chamada vira termino imediato, sem handler),
 * entao o teste troca so o gatilho e mantem a fiação de producao.
 */
export async function startServer({ env = process.env, log = console.log, error = console.error } = {}) {
  const port = Number(env.PORT || 3000);
  const app = await bootstrap({ env });
  const server = createServer(app.handler);
  await new Promise((resolve) => server.listen(port, resolve));
  // O endereco REAL: com `PORT=0` (teste) o log anunciando `0` nao diria em que
  // porta a instancia subiu, e ninguem conseguiria falar com ela.
  log(`Descubra o Prompt: http://localhost:${server.address().port}`);

  let encerrando = false;
  const fechar = async (sinal) => {
    if (encerrando) {
      // Segundo sinal e ordem de impaciencia: nao ha mais o que esperar.
      error(`segundo ${sinal}: encerrando agora`);
      process.exit(1);
    }
    encerrando = true;
    // O vigia para ANTES da drenagem: o encerramento nao pode ganhar trabalho
    // novo no meio (as esperas ja agendadas seguem o caminho normal do patio).
    try { app.pararVigia?.(); } catch { /* o vigia e best-effort */ }
    const resultado = await shutdownGracefully({
      gate: app.drainGate,
      hub: app.eventHub,
      server,
      opened: app.opened,
      // Uma avaliacao em voo no Gemini nao pode segurar a saida: o sinal chega
      // aos adaptadores, que resolvem em fallback local (modo `gemini`) ou
      // propagam o cancelamento (modo `gemini-safe`) sem esperar o timeout.
      cancel: app.cancelarPendencias,
      // As esperas do patio saem da memoria com o processo — mas a FILA nao: a
      // submissao sem nota fica no banco e a proxima subida a retoma
      // (`retomarEstacionadas` no boot). E o que faz um redeploy deixar de
      // custar a nota de quem ja tinha enviado.
      parking: app.parking,
      timeoutMs: Number(env.SHUTDOWN_TIMEOUT_MS || SHUTDOWN_TIMEOUT_MS),
      log: (mensagem) => log(mensagem),
    });
    // O log diz os dois fatos porque é por ele que a operação confere, de
    // fora, que a rede externa foi cancelada — e não só que o processo saiu.
    log(`encerrado em ${Math.round(resultado.duracaoMs)}ms (drenou: ${resultado.drenou}, cancelou: ${resultado.cancelado})`);
    process.exit(0);
  };
  const desligar = (sinal) => { void fechar(sinal); };
  process.on('SIGINT', () => desligar('SIGINT'));
  process.on('SIGTERM', () => desligar('SIGTERM'));
  return { ...app, server, porta: server.address().port, desligar };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startServer();
}
