import { randomUUID } from 'node:crypto';
import { createSocket } from 'node:dgram';
import QRCode from 'qrcode';
import { calculateArenaPoints, ARENA_SCORING_VERSION } from '../domain/arena-scoring.mjs';
import { bestRoundScores, scorePoints } from '../domain/arena-ranking.mjs';

import { budgetRejection } from '../judge/budget.mjs';
import { judgeUnavailable } from '../judge/failure.mjs';
import { createEvaluationParking, waitBeforeReprocess } from '../judge/parking.mjs';
import { ApiError, comCausa, integer, object, text } from './validation.mjs';
import {
  CRITERIA, MODALITIES, SPEED_WEIGHTS,
  nextRoomStatus, nextRoundStatus, roundAcceptsSubmissions,
} from '../domain/arena-state.mjs';
import { LESSONS, getLesson } from '../domain/arena-lessons.mjs';
import { PRESETS, roomSettingsFor as presetRoomSettings, requirePreset } from '../domain/presets.mjs';
import { formatPin, normalizePin, randomPin } from '../domain/pin.mjs';
import { canJoinRoom, roomPhase } from '../domain/room-phases.mjs';
import { DEFAULT_ROUNDS, DEFAULT_RUBRIC, classicRoundsToChallenges } from '../domain/classic-rounds.mjs';
import { calculatePoints, SCORING_VERSION } from '../domain/scoring.mjs';
import { rankFinal, rankRound } from '../domain/ranking.mjs';
import { blockersMessage, missionIssues, roomBlockers } from '../domain/room-readiness.mjs';
import { suggestTiming } from '../domain/mission-timing.mjs';
import {
  DRAW_GROUP_DEFAULT, DRAW_GROUP_MAX, DRAW_GROUP_MIN,
  DrawError,
  drawNext, drawView,
  effectiveDraw, isDrawMode, settleDraw, startDraw,
} from '../domain/arena-draw.mjs';
import {
  ARENA_CONFIDENCE, ARENA_DYNAMICS, ARENA_POWERS, ARENA_TEAM_NAMES, ARENA_TEAMS,
  ArenaError,
  arenaAwards, arenaConfig, arenaView, assignTeams, audienceCalibration,
  buildWildcard, closeRound, competitorPlan, emptyArenaState, hintDynamic,
  isArenaRoom, normalizeArenaState, openDynamic, pickCompetitors,
  rememberCompetitors, setCompetitors, settleDynamic, settleWildcard,
  usePower, voteConfidence, voteDynamic, voteWildcard,
} from '../domain/arena-mode.mjs';
import { createFakeJudge } from '../judge/fake-judge.mjs';
// A lista de salas em que uma submissão sem nota ainda é TRABALHO. Ela vem do
// repositório de propósito: é a MESMA que a retomada do pátio usa
// (`submissions.listAwaitingScore`), e duas listas divergentes fariam o painel
// prometer uma retomada que o vigia não faria.
import { AWAITING_ROOM_STATUSES } from '../db/repositories/arena.mjs';
import { createLoginLimiter } from './rate-limit.mjs';

const ARENA_OPEN_KEY = 'arena.global_open';
// Projecao (tv.php): o link gerado no cockpit vale 8h e e exigido junto com o
// PIN — sem o token, um aluno nao consegue ler a tela de projecao de outra turma.
const TV_TOKEN_TTL_SECONDS = 28_800;
// Exportado para os testes do portao do SSE montarem o mesmo endereco de
// armazenamento sem repetir o formato aqui e la.
export const tvTokenKey = (roomId) => `arena.tv.${roomId}`;
// Codigo curto de projecao (mesmo TTL de 8h): exibido no cockpit e digitado na
// tela da TV em outro aparelho. So concede a projecao da sala (nao e admin),
// por isso e protegido por trava de tentativas por IP, como o login.
const TV_CODE_TTL_SECONDS = 28_800;
const tvCodeIndexKey = 'arena.tv.codes'; // code -> { roomId, expiresAt }
// Sorteio da vez: guardado por sala (nao no navegador) para o professor poder
// recarregar a pagina no meio da aula sem perder o fiapo do mata-mata.
const drawKey = (roomId) => `arena.draw.${roomId}`;
// Modo Arena (Turma vs. Juiz): o estado da partida coletiva mora por sala, como
// o sorteio — recarregar o painel no meio da aula nao perde a vida do Boss, a
// energia da turma nem quem ja competiu.
const arenaModeKey = (roomId) => `arena.mode.${roomId}`;
const ROUND_CLOSE_GRACE_SECONDS = 5;
const CONNECTED_WINDOW_SECONDS = 12;
const MAX_REFERENCE_IMAGE_CHARS = 2_100_000; // ~1.5 MB base64
// Lote da tela unica das pendencias: uma sala de aula inteira cabe, sem abrir
// a porta para um payload arbitrario.
const MAX_BATCH_CHALLENGES = 60;
const LOOPBACK_HOST = /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|\[::1\]|::1)$/i;

// IP local da maquina na rede (roteamento padrao), para montar a URL dos QR
// codes mesmo quando o professor abriu o painel via localhost. O socket UDP
// nao envia pacote nenhum: so pergunta qual interface sairia para a internet.
let cachedLanIp = null;
function detectLanIp() {
  return new Promise((resolve) => {
    if (cachedLanIp) return resolve(cachedLanIp);
    try {
      const socket = createSocket('udp4');
      socket.unref();
      const done = (ip) => {
        clearTimeout(timer);
        try { socket.close(); } catch { /* ja fechado */ }
        if (ip) cachedLanIp = ip;
        resolve(ip || null);
      };
      const timer = setTimeout(() => done(null), 400);
      socket.once('error', () => done(null));
      socket.connect(53, '8.8.8.8', () => {
        try { done(socket.address().address); } catch { done(null); }
      });
    } catch {
      resolve(null);
    }
  });
}

/** URL absoluta que os QR codes devem carregar (o aparelho que escaneia). */
async function qrAbsoluteUrl(origin, path) {
  let base = String(origin || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) base = '';
  if (base) {
    try {
      const parsed = new URL(base);
      if (LOOPBACK_HOST.test(parsed.hostname)) {
        const lanIp = await detectLanIp();
        if (lanIp) {
          const port = parsed.port ? `:${parsed.port}` : '';
          base = `${parsed.protocol}//${lanIp}${port}`;
        }
      }
    } catch { /* origin invalido: cai para o default */ }
  }
  if (!base) base = `http://${process.env.HOST || 'localhost'}`;
  return base + path;
}

// QR de entrada dos alunos na tela da TV (lobby): gerado no servidor (a TV nao
// tem sessao admin) e cacheado por sala+URL — o poll de 2,5s nao regera PNG.
const entryQrCache = new Map();
async function entryQrForRoom(roomId, host, pin, protocol = 'http') {
  const origin = host ? `${protocol === 'https' ? 'https' : 'http'}://${host}` : '';
  const pinQuery = pin ? `?pin=${encodeURIComponent(pin)}` : '';
  const url = await qrAbsoluteUrl(origin, `/play${pinQuery}`);
  const key = `${roomId}|${url}`;
  const cached = entryQrCache.get(key);
  if (cached) return cached;
  const value = {
    url,
    data_url: await QRCode.toDataURL(url, {
      width: 360,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#141833', light: '#ffffff' },
    }),
  };
  entryQrCache.set(key, value);
  if (entryQrCache.size > 120) {
    const oldest = entryQrCache.keys().next().value;
    entryQrCache.delete(oldest);
  }
  return value;
}
const DEFAULT_CRITERIA = [
  { criterion: 'objetivo', weight: 20 },
  { criterion: 'contexto', weight: 20 },
  { criterion: 'publico', weight: 20 },
  { criterion: 'formato', weight: 20 },
  { criterion: 'restricoes', weight: 20 },
];

function firstName(value) {
  return String(value || '').trim().split(/\s+/)[0] || '';
}

// ---------------------------------------------------------------------------
// Amostra das telas de fim, para a previa de uma sala que ainda nao jogou.
// Os numeros e nomes aqui sao INVENTADOS de proposito: sem eles nao haveria o
// que mostrar antes da turma responder. O painel marca a previa com um selo e
// troca tudo por dado real assim que a sala tiver qualquer resposta.
// ---------------------------------------------------------------------------
const PREVIEW_SAMPLE_NAMES = ['Ana', 'Bia', 'Caio', 'Duda'];

/**
 * Tempo da sala: soma do cronometro das missoes que tem um, e quantas nao tem.
 * O professor monta a aula com isso em maos — uma sala de 19 missoes pode dar
 * 40 minutos ou passar de uma hora, e isso nao estava visivel em lugar nenhum.
 */
function roomTiming(items) {
  const timed = (items || []).filter((entry) => Number(entry?.duration_seconds) > 0);
  const total = timed.reduce((sum, entry) => sum + Number(entry.duration_seconds), 0);
  return {
    missions: (items || []).length,
    timed: timed.length,
    untimed: (items || []).length - timed.length,
    total_seconds: total,
  };
}

/** Uma tentativa avaliada no formato exato que o juiz devolve. */
function previewSampleScores(challenge) {
  const criteria = (challenge?.criteria || []).map((entry) => entry?.criterion).filter(Boolean);
  const keys = criteria.length ? criteria : DEFAULT_CRITERIA.map((entry) => entry.criterion);
  const breakdown = {};
  keys.forEach((key, index) => { breakdown[key] = Math.max(6, 18 - index * 2); });
  return [{
    attempt: 1,
    percent: 78,
    points: 320,
    breakdown,
    feedback: 'Exemplo de retorno do juiz: bom domínio do contexto; faltou definir o formato de saída.',
  }];
}

/** Resultado por missao, classificacao e destaques — tudo de exemplo. */
function previewSampleEnd(missions) {
  const results = missions.map((mission, index) => ({
    id: `preview-${mission.id}`,
    position: mission.position,
    modality: mission.modality,
    title: mission.title,
    judge_kind: mission.judge_kind,
    // A TV escolhe o que projetar pela rodada com status 'results'.
    status: 'results',
    feedback: 'Exemplo de retorno do juiz.',
    my_best_percent: 74 + index * 2,
    my_best_points: 300 + index * 10,
    my_position: 2,
    ranking: PREVIEW_SAMPLE_NAMES.map((name, place) => ({
      position: place + 1,
      name,
      is_me: place === 1,
      percent: 88 - place * 6,
      points: 360 - place * 45,
    })),
  }));
  const ranking = PREVIEW_SAMPLE_NAMES.map((name, place) => ({
    participant_id: `preview-${place}`,
    name,
    first_name: name,
    position: place + 1,
    rounds_completed: missions.length,
    points_sum: 1240 - place * 180,
    avg_percent: 86 - place * 5,
  }));
  const highlights = {
    best_score: { name: PREVIEW_SAMPLE_NAMES[0], percent: 92 },
    most_precise: { name: PREVIEW_SAMPLE_NAMES[1], percent: 90 },
    best_context: { name: PREVIEW_SAMPLE_NAMES[2], percent: 86 },
    biggest_evolution: { name: PREVIEW_SAMPLE_NAMES[3], delta: 24 },
  };
  return { results, ranking, highlights };
}

function isBase64Image(value) {
  return /^data:image\/[a-z+]+;base64,[a-z0-9+/=\s]+$/i.test(value);
}

function isReferenceUrl(value) {
  return /^https?:\/\/[^\s]+$/i.test(value)
    || /^\/public\/assets\/(?!.*(?:\.\.|[\\?#]))[^\s]+$/i.test(value);
}

/**
 * Sessao do aluno (id + token) ou `null`. Fonte unica desta checagem: a propria
 * API usa para `arena_lobby`, `arena_submit` e votacao, e o portao do SSE
 * (`events-scope.mjs`) usa para decidir de que sala e a conexao. Duplicar a
 * regra aqui e la seria o caminho para as duas versoes divergirem.
 */
export async function participantForSession(repositories, participantId, token) {
  const participant = await repositories.arena.participants.getById(String(participantId));
  if (!participant || !participant.active) return null;
  if (participant.token !== String(token)) return null;
  return participant;
}

/**
 * Tokens de projecao vivos da sala (mapa; aceita o formato antigo de 1 token).
 * Mesma fonte unica da sessao do aluno: a TV entra no SSE com este token, que
 * ja viaja no cookie HttpOnly da projecao.
 */
export async function liveTvTokens(repositories, roomId, timestamp) {
  const stored = await repositories.settings.get(tvTokenKey(roomId));
  const tokens = stored?.tokens || (stored?.token ? { [stored.token]: stored.expires_at } : {});
  for (const [token, expiresAt] of Object.entries(tokens)) {
    if (Number(expiresAt) < timestamp) delete tokens[token];
  }
  return tokens;
}

export function createArenaApi({
  repositories,
  judge,
  classicJudge,
  now = () => Date.now() / 1000,
  id = randomUUID,
  adminAuth,
  // Quanto o ENVIO espera a avaliacao antes de responder "pendente". O cliente
  // desiste em 15 s; a avaliacao externa tem 12 s de timeout e uma repeticao,
  // entao sem este prazo o aluno veria falha de rede enquanto o servidor
  // continuava avaliando (o defeito medido na auditoria).
  submitWaitMs = Number(process.env.SUBMIT_WAIT_MS || 8000),
  log = { warn: () => {} },
  // Avisa que o estado da SALA mudou fora do ciclo de uma requisicao. É o que a
  // resposta pendente precisa: a nota fica pronta depois que o envio respondeu,
  // e sem este aviso a tela do aluno so veria a nota na proxima consulta
  // periodica (ate 8 s, porque com SSE recente o poll e aliviado de proposito).
  onRoomChanged = () => {},
  // O patio das avaliacoes que o provedor nao entregou. Quem sobe a instancia
  // cria um (para a prontidao mostrar o estado e o encerramento parar as
  // esperas); sem ele, um patio proprio e criado aqui — e o caso dos testes.
  parking,
} = {}) {
  if (!repositories) throw new TypeError('repositories are required');
  if (typeof judge !== 'function') throw new TypeError('judge is required');
  const classicJudger = classicJudge || createFakeJudge();
  /**
   * A credencial do painel, com a CAUSA da recusa.
   *
   * O status nao muda (401 nos tres casos — o comportamento do servidor e o
   * mesmo), mas o corpo passa a dizer QUAL foi: sessao ausente, vencida ou
   * invalida. Antes, as tres saiam como a mesma frase, e a tela do professor
   * nao tinha como distinguir "o cookie venceu no meio da aula" (entre de novo)
   * de "esta aba nunca teve sessao" (faca login) — as duas terminavam no mesmo
   * poll silencioso de 401.
   */
  const requireAdmin = (token) => {
    const veredito = adminAuth?.check
      ? adminAuth.check(token)
      : { ok: Boolean(adminAuth?.verify(token)), reason: 'session_invalid' };
    if (veredito.ok) return;
    const motivos = {
      not_configured: 'Acesso administrativo ainda nao configurado.',
      session_missing: 'Sessao administrativa ausente. Entre no painel.',
      session_expired: 'Sessao administrativa expirada. Entre novamente.',
      session_invalid: 'Credencial administrativa invalida.',
    };
    throw new ApiError(401, motivos[veredito.reason] || motivos.session_invalid, { reason: veredito.reason });
  };

  const arenaOpen = async () => Boolean(await repositories.settings.get(ARENA_OPEN_KEY));

  // Trava por IP para a troca de codigo curto -> sessao de projecao.
  const tvCodeLimiter = createLoginLimiter({ maxFailures: 8, lockoutSeconds: 300, now });

  // Trava por IP para tentativas de entrada na sala (mitiga forca bruta de PIN e join floods).
  const joinLimiter = createLoginLimiter({ maxFailures: 12, windowSeconds: 60, lockoutSeconds: 60, now });

  /** Codigo curto da sala (get-or-create): reutiliza o vivo, senao gera um unico. */
  async function tvCodeForRoom(roomId, timestamp) {
    const index = (await repositories.settings.get(tvCodeIndexKey)) || {};
    const fresh = {};
    let existing;
    for (const [code, entry] of Object.entries(index)) {
      if (Number(entry?.expiresAt) < timestamp) continue; // expirado: descarta
      if (entry?.roomId === roomId && !existing) {
        existing = { code, roomId, expiresAt: Number(entry.expiresAt) };
      } else {
        fresh[code] = entry; // mantem os vivos de outras salas
      }
    }
    if (existing) {
      // Mantem o codigo vivo no indice com o MESMO formato (roomId+expiresAt):
      // o get-or-create nao pode apagar nem corromper a entrada que reutiliza.
      fresh[existing.code] = { roomId, expiresAt: existing.expiresAt };
      await repositories.settings.set(tvCodeIndexKey, fresh, timestamp);
      return existing;
    }
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = randomPin();
      if (fresh[candidate]) continue;
      const expiresAt = timestamp + TV_CODE_TTL_SECONDS;
      fresh[candidate] = { roomId, expiresAt };
      await repositories.settings.set(tvCodeIndexKey, fresh, timestamp);
      return { code: candidate, expiresAt };
    }
    throw new ApiError(500, 'Não foi possível gerar um código de projeção único.');
  }

  /** Tokens de projecao vivos da sala — a mesma leitura que o portao do SSE faz. */
  const tvTokensForRoom = (roomId, timestamp) => liveTvTokens(repositories, roomId, timestamp);

  const generateRoomCode = async () => {
    const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    const digits = '23456789';
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = '';
      for (let i = 0; i < 4; i += 1) code += letters[Math.floor(Math.random() * letters.length)];
      for (let i = 0; i < 2; i += 1) code += digits[Math.floor(Math.random() * digits.length)];
      if (!(await repositories.arena.rooms.getByCode(code))) return code;
    }
    throw new ApiError(500, 'Não foi possível gerar um código de sala.');
  };

  const participantSession = async (participantId, token) => {
    const participant = await participantForSession(repositories, participantId, token);
    if (participant) return participant;
    // A causa, para a tela saber o que dizer: sem id/token a sessao nunca
    // existiu nesta aba; com os dois e sem linha no banco, ela perdeu a
    // validade (o professor removeu o participante, ou a sala foi limpa).
    const missing = participantId === undefined || participantId === null || String(participantId).length === 0
      || typeof token !== 'string' || token.length === 0;
    throw new ApiError(401, missing ? 'Sessao ausente. Entre na sala de novo.' : 'Sessao expirada. Entre na sala de novo.', {
      reason: missing ? 'session_missing' : 'session_expired',
    });
  };

  const roomById = async (roomId) => {
    const room = await repositories.arena.rooms.getById(String(roomId));
    if (!room) throw new ApiError(404, 'Sala não encontrada.');
    return room;
  };

  /**
   * A revisao da sala como toda tela a le (ver `revision` no schema).
   *
   * Vai em TODA leitura de estado — a do aluno, a do painel e a da TV —, e e a
   * mesma para as tres na mesma sala: o que separa as telas e o recorte (o
   * ranking geral, o detalhe do professor, o placar), nao a versao. Quem ja
   * pintou a revisao 7 recusa a 6, e a corrida entre uma resposta de acao
   * atrasada e um evento de tempo real deixa de ter vencedor pelo relogio.
   */
  const roomRevision = (room) => Number(room?.revision ?? 0);

  /** Ids dos participantes ativos, na ordem em que entraram: o balaio do sorteio. */
  async function drawRoster(roomId) {
    const entries = await repositories.arena.participants.listByRoom(roomId);
    return entries.filter((entry) => entry.active).map((entry) => String(entry.id));
  }

  /**
   * Estado do sorteio ja reconciliado com a sala de agora (leitura, nao grava).
   * O compare-and-swap usa a MESMA reconciliacao: quem rele depois de perder a
   * corrida transforma em cima do estado reconciliado, e nao do cru.
   */
  const normalizarSorteio = (activeIds, timestamp) => (guardado) => effectiveDraw(guardado, activeIds, timestamp);

  async function readDraw(roomId, activeIds, timestamp) {
    return normalizarSorteio(activeIds, timestamp)(await repositories.settings.get(drawKey(roomId)));
  }

  /** O mesmo compare-and-swap, para o estado do sorteio da sala. */
  const trocarSorteio = (roomId, activeIds, transform, timestamp) => trocarEstado(drawKey(roomId), transform, {
    normalizar: normalizarSorteio(activeIds, timestamp),
    timestamp,
  });

  /**
   * Esquece o que era so desta sala (sorteio e tokens de projecao). Excluir a
   * sala e o fim dela: sem isso o `settings` guarda estado de uma sala que nao
   * existe mais, e o codigo curto de projecao continuaria resolvendo para o
   * vazio.
   */
  async function forgetRoomSettings(roomId, timestamp) {
    await repositories.settings.delete(drawKey(roomId));
    await repositories.settings.delete(arenaModeKey(roomId));
    await repositories.settings.delete(tvTokenKey(roomId));
    const index = (await repositories.settings.get(tvCodeIndexKey)) || {};
    const fresh = Object.fromEntries(Object.entries(index).filter(([, entry]) => entry?.roomId !== roomId));
    if (Object.keys(fresh).length !== Object.keys(index).length) {
      await repositories.settings.set(tvCodeIndexKey, fresh, timestamp);
    }
  }

  /** Regra do sorteio quebrada (sem grupo, vencedor de fora) -> 409 com o motivo. */
  const runDraw = (fn) => {
    try {
      return fn();
    } catch (error) {
      if (error instanceof DrawError) throw new ApiError(409, error.message);
      throw error;
    }
  };

  /** Mesma traducao para as regras do modo Arena. */
  const runArena = (fn) => {
    try {
      return fn();
    } catch (error) {
      if (error instanceof ArenaError) throw new ApiError(409, error.message);
      throw error;
    }
  };

  // -------------------------------------------------------------------------
  // ARENA — Turma vs. Juiz
  //
  // A camada coletiva NAO substitui o motor: ela le o que a sala ja tem
  // (missoes, envios e notas do juiz por criterios) e guarda apenas o que e
  // proprio do modo (Boss, energia, competidores, dinamicas). Nenhuma sala do
  // Modo Classico entra aqui — a porta e `settings.gameMode === 'arena'`.
  // -------------------------------------------------------------------------

  /** Configuracao inicial do modo, lida das settings da sala. */
  const arenaConfigOf = (room) => arenaConfig({
    rounds: room?.settings?.arenaRounds,
    bossMaxHealth: room?.settings?.arenaBossHealth,
    damageThreshold: room?.settings?.arenaDamageThreshold,
    attacksPerRound: room?.settings?.arenaAttacksPerRound,
    dynamicsMode: room?.settings?.arenaDynamicsMode,
    teams: room?.settings?.arenaTeams,
    powers: room?.settings?.arenaPowers,
  });

  /**
   * O que o estado coletivo de uma sala É: o guardado, ou um zerado com a
   * configuracao dela. Uma definicao so — a leitura e a releitura do
   * compare-and-swap passam pela mesma funcao, porque se elas divergissem a
   * transformacao seria reaplicada em cima de outro estado.
   *
   * A configuracao da sala manda: mudar os corações no painel vale para a
   * proxima partida, e o estado guardado nunca sobrepoe o que o professor
   * acabou de escolher sem recomecar.
   */
  const normalizarModoArena = (room) => (guardado) => (
    guardado ? normalizeArenaState(guardado) : emptyArenaState(arenaConfigOf(room))
  );

  /** Estado do modo: o guardado, ou um zerado com a configuracao da sala. */
  async function readArenaMode(room) {
    if (!isArenaRoom(room)) return null;
    return normalizarModoArena(room)(await repositories.settings.get(arenaModeKey(room.id)));
  }

  /** Quantas vezes uma escrita concorrente e absorvida antes de desistir. */
  const TENTATIVAS_CAS = 8;

  /**
   * Le-modifica-grava um estado guardado em `settings` com COMPARE-AND-SWAP.
   *
   * A fila em memoria (`pending`) serializa as escritas de UMA instalação. Duas
   * instâncias — dois processos, ou duas copias do app contra o mesmo banco —
   * nao compartilham essa fila: as duas liam o mesmo JSON, cada uma mudava o que
   * queria e a ultima gravava por cima da outra. O voto de um aluno ficava de
   * fora do resultado, e nada avisava ninguem.
   *
   * Aqui a gravacao e CONDICIONAL ao texto que foi lido (`setSeIntacto`): se
   * alguem gravou no meio, o estado e relido e a transformacao é REAPLICADA
   * sobre o que existe agora — a decisao (o voto, o fechamento, o sorteio) nao
   * se perde, ela e recalculada. O que nao pode acontecer é gravar em cima de
   * uma leitura que ja nao vale mais.
   *
   * `transform(estado)` devolve `{ estado: proximo, ...extras }`, e pode ser
   * chamada mais de uma vez: por isso ela LE e CALCULA, sem efeito que importe
   * se repetir. `estado: null` quer dizer "nao ha o que gravar" — o caminho
   * idempotente (o desafio que ja estava fechado, por exemplo).
   */
  async function trocarEstado(chave, transform, { normalizar = (guardado) => guardado, timestamp } = {}) {
    for (let tentativa = 1; ; tentativa += 1) {
      const lido = await repositories.settings.getComBruto(chave);
      const resultado = await transform(normalizar(lido.value));
      if (!resultado || !('estado' in resultado)) {
        throw new TypeError('trocarEstado precisa de { estado } vindo da transformacao');
      }
      if (resultado.estado === null) return resultado;
      if (await repositories.settings.setSeIntacto(chave, resultado.estado, lido.raw, timestamp)) return resultado;
      if (tentativa >= TENTATIVAS_CAS) {
        throw new ApiError(409, 'A sala está sendo alterada por outra pessoa agora. Repita a ação.');
      }
    }
  }

  /** O mesmo compare-and-swap para o estado coletivo da sala (Boss, energia, votos). */
  const trocarModoArena = (room, transform, timestamp) => trocarEstado(arenaModeKey(room.id), transform, {
    normalizar: normalizarModoArena(room),
    timestamp,
  });

  /**
   * Melhor envio de cada aluno na rodada, com a nota do juiz. E a materia-prima
   * de tudo no modo: quem pode competir, quem entra no Wild Card e qual e a
   * resposta certa de cada dinamica.
   */
  async function roundPrompts(round) {
    const submissions = await repositories.arena.submissions.listByRound(round.id);
    const best = new Map();
    for (const submission of submissions) {
      const score = await repositories.arena.scores.getBySubmission(submission.id);
      const key = String(submission.participantId);
      const percent = Number(score?.percent ?? -1);
      const entry = {
        participant_id: key,
        prompt: String(submission.prompt || ''),
        percent: Number.isFinite(percent) ? percent : 0,
        breakdown: score?.breakdown || {},
        scored: Boolean(score),
      };
      const previous = best.get(key);
      if (!previous || entry.percent > previous.percent) best.set(key, entry);
    }
    return [...best.values()];
  }

  /** Nomes atuais da sala, por id — a tela nunca mostra id. */
  async function arenaNames(roomId) {
    const participants = await repositories.arena.participants.listByRoom(roomId);
    return Object.fromEntries(participants.map((entry) => [String(entry.id), entry.name]));
  }

  /**
   * Monta as opcoes e a resposta correta da dinamica a partir do que o juiz ja
   * avaliou. Nenhuma chamada nova de IA: o modo reinterpreta notas existentes.
   *
   * Devolve `null` quando falta materia-prima (ex.: ninguem enviou), e o
   * servidor responde 409 explicando o porque em vez de abrir uma votacao vazia.
   */
  async function buildDynamicPayload(room, state, key, round) {
    const prompts = await roundPrompts(round);
    const byId = new Map(prompts.map((entry) => [entry.participant_id, entry]));
    const names = await arenaNames(room.id);
    const label = (id, index) => names[id] || ARENA_TEAM_NAMES[index] || id;

    if (key === 'prever' || key === 'comparacao' || key === 'juri' || key === 'calibracao') {
      let picked = state.competitors.ids.filter((id) => byId.has(id));
      if (!picked.length) throw new ArenaError('A rodada ainda nao tem prompts avaliados para esta dinamica.');
      if (key === 'comparacao') picked = picked.slice(0, 2);
      if (key === 'comparacao' && picked.length < 2) {
        throw new ArenaError('A comparacao precisa de dois prompts avaliados.');
      }
      const options = picked.map((id, index) => ({
        key: id,
        // A letra A/B/C e o que a turma le na tela: a chave do voto continua
        // sendo o id do competidor, e o id nunca aparece para o aluno.
        slot: ARENA_TEAM_NAMES[index] || String(index + 1),
        // Comparacao e anonima de proposito: quem escreveu nao pode pesar no voto.
        // O proprio A/B e a identidade daquela opcao, nao um nome a repetir.
        label: key === 'comparacao' ? '' : label(id, index),
      }));
      const ranked = [...picked].sort((left, right) => byId.get(right).percent - byId.get(left).percent);
      const correct = ranked[0];

      if (key === 'calibracao') {
        return {
          options,
          correct,
          prompt: '',
          intro: 'Sem mostrar as notas, diga quem o Juiz vai colocar em primeiro. Depois diga quanta certeza você tem.',
        };
      }

      if (key === 'comparacao') {
        const [left, right] = picked;
        return {
          options,
          correct,
          prompt: `${byId.get(left).prompt}\n\n---\n\n${byId.get(right).prompt}`,
          intro: 'Leia os dois prompts (sem saber de quem são) e escolha o que atende melhor ao objetivo da missão.',
        };
      }

      if (key === 'juri') {
        // Juri especialista: cada time avalia por um criterio diferente. Sem
        // times, o criterio e distribuido pelo time do aluno na hora do voto.
        const teams = state.teams && Object.keys(state.teams).length
          ? state.teams
          : assignTeams((await drawRoster(room.id)));
        const criteria = Object.keys(byId.get(picked[0])?.breakdown || {});
        if (!criteria.length) throw new ArenaError('As notas desta rodada ainda nao tem criterios para dividir entre os times.');
        const correctBy = {};
        const teamCriteria = {};
        ARENA_TEAMS.forEach((team, index) => {
          const criterion = criteria[index % criteria.length];
          teamCriteria[team.key] = criterion;
          const best = [...picked].sort((left, right) => Number(byId.get(right).breakdown?.[criterion] || 0) - Number(byId.get(left).breakdown?.[criterion] || 0))[0];
          for (const member of teams[team.key] || []) correctBy[String(member)] = best;
        });
        return {
          options,
          correct: null,
          correctBy,
          prompt: '',
          intro: `Cada time julga por um critério: ${ARENA_TEAMS.map((team) => `${team.glyph} ${teamCriteria[team.key]}`).join(' · ')}. Escolha o prompt que melhor atende ao critério do SEU time.`,
        };
      }

      return {
        options,
        correct,
        prompt: '',
        intro: key === 'prever' ? 'A nota do Juiz continua escondida. Escolha quem você acha que vai vencer a Arena.' : '',
      };
    }

    if (key === 'cacada') {
      // O prompt mostrado e o do competidor mais fraco: e onde a fraqueza e
      // mais visivel e a licao, mais util.
      const ranked = [...prompts].sort((left, right) => left.percent - right.percent);
      const target = ranked[0];
      if (!target) throw new ArenaError('A rodada ainda nao tem prompts avaliados para esta dinamica.');
      const weakest = Object.entries(target.breakdown || {})
        .sort((left, right) => Number(left[1]) - Number(right[1]))[0]?.[0];
      if (!weakest) throw new ArenaError('A nota deste prompt nao tem criterios para investigar.');
      return {
        options: Object.keys(target.breakdown || {}).map((criterion) => ({ key: criterion, label: criterion })),
        correct: weakest,
        prompt: target.prompt,
        intro: 'Leia o prompt da Arena e aponte a principal fraqueza dele.',
      };
    }

    if (key === 'conselho') {
      const target = state.competitors.ids.find((id) => byId.has(id));
      if (!target) throw new ArenaError('Nenhum prompt da Arena para aconselhar.');
      const criteria = Object.keys(byId.get(target)?.breakdown || {});
      if (!criteria.length) throw new ArenaError('As notas desta rodada ainda nao tem criterios.');
      const weakest = criteria.sort((left, right) => Number(byId.get(target).breakdown[left]) - Number(byId.get(target).breakdown[right]))[0];
      return {
        options: criteria.map((criterion) => ({ key: criterion, label: criterion })),
        correct: weakest,
        prompt: byId.get(target).prompt,
        intro: 'Que melhoria a turma recomenda para este competidor?',
      };
    }

    // v1v2 e mudanca nao dependem do Juiz: a votacao e a propria resposta.
    return { options: [], correct: null, prompt: '', intro: '' };
  }

  /**
   * Visao do modo para uma tela. E o unico lugar que monta o objeto — aluno,
   * TV e painel leem o mesmo, entao os tres nunca divergem.
   */
  async function arenaViewFor(room, state, { participant = null, promptById = new Map() } = {}) {
    if (!state) return { enabled: false };
    const names = await arenaNames(room.id);
    const view = arenaView(state, { names });
    view.config = { ...state.config };
    view.prompt_of = {};
    for (const competitor of view.competitors) {
      view.prompt_of[competitor.id] = promptById.get(competitor.id) || '';
    }
    if (participant && view.dynamic && !view.dynamic.revealed) {
      const mine = state.dynamic.responses[String(participant.id)] ?? null;
      view.dynamic.my_vote = mine === null ? null : String(mine);
      view.dynamic.my_confidence = state.dynamic.confidence?.[String(participant.id)] ?? null;
      view.dynamic.confidence_options = ARENA_CONFIDENCE.map((entry) => ({ ...entry }));
    }
    if (participant && view.wildcard && !view.wildcard.revealed) {
      const mine = state.competitors.wildcard.votes[String(participant.id)] ?? null;
      view.wildcard.my_vote = mine === null ? null : String(mine);
      view.wildcard.can_vote = !state.competitors.wildcard.options.some((option) => option.participant_id === String(participant.id));
    }
    return view;
  }

  /** A rodada da sala que corresponde à rodada N da Arena (uma missão por rodada). */
  async function arenaRoundFor(room, position) {
    const rounds = await repositories.arena.rounds.listByRoom(room.id);
    return rounds.find((entry) => Number(entry.position) === Number(position)) || null;
  }

  /** Traduz erro de regra de uma operação async em 409 com o motivo. */
  async function runArenaAsync(fn) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ArenaError) throw new ApiError(409, error.message);
      throw error;
    }
  }

  /**
   * Prêmios da partida. Lê o que o motor JÁ calculou — percentual do Juiz,
   * acertos de plateia, calibração e evolução — e reconhece competências
   * diferentes em vez de um ranking único. Sem dado real, não há prêmio.
   */
  async function arenaAwardsFor(room, state) {
    const participants = (await repositories.arena.participants.listByRoom(room.id)).filter((entry) => entry.active);
    const byId = new Map(participants.map((entry) => [String(entry.id), entry]));
    const rows = [];
    const rowOf = (participantId) => {
      const key = String(participantId);
      let row = rows.find((candidate) => candidate.id === key);
      if (!row) {
        const participant = byId.get(key);
        if (!participant) return null;
        row = {
          id: key, name: participant.name, percent: null, evolution: null,
          analyst_hits: 0, calibration: null,
        };
        rows.push(row);
      }
      return row;
    };
    for (const [participantId, entry] of Object.entries(state.audience || {})) {
      const row = rowOf(participantId);
      if (!row) continue;
      row.analyst_hits = Number(entry?.hits || 0);
      row.calibration = audienceCalibration(entry);
    }
    // Percentual do Juiz (melhor tentativa de cada rodada) e evolução V1 -> V2.
    // A leitura passa por TODAS as rodadas: os prêmios são da partida, não da
    // rodada da vez — e os competidores de uma rodada já foram devolvidos ao
    // balaio quando a partida termina.
    const rounds = await repositories.arena.rounds.listByRoom(room.id);
    for (const round of rounds) {
      const submissions = await repositories.arena.submissions.listByRound(round.id);
      const byParticipant = new Map();
      for (const submission of submissions) {
        const score = await repositories.arena.scores.getBySubmission(submission.id);
        if (!score) continue;
        const key = String(submission.participantId);
        const list = byParticipant.get(key) || [];
        list.push({ attempt: Number(submission.attempt || 1), percent: Number(score.percent || 0) });
        byParticipant.set(key, list);
      }
      for (const [key, list] of byParticipant) {
        const row = rowOf(key);
        if (!row) continue;
        const best = list.reduce((top, entry) => (entry.percent > top.percent ? entry : top));
        row.percent = Math.max(Number(row.percent ?? 0), best.percent);
        const first = list.find((entry) => entry.attempt === 1);
        if (first && list.length > 1) {
          row.evolution = Number(row.evolution || 0) + (best.percent - first.percent);
        }
      }
    }
    // Só entra no pódio quem de fato foi à Arena (competiu) ou participou das
    // dinâmicas: ninguém ganha prêmio por estar na sala.
    const eligible = new Set([...state.competed, ...Object.keys(state.audience || {})]);
    const ranked = rows.filter((row) => eligible.has(row.id));
    ranked.sort((left, right) => right.analyst_hits - left.analyst_hits);
    const awards = arenaAwards(ranked);
    return {
      ...awards,
      audience: ranked.slice(0, 8),
      boss: { health: state.boss.health, max_health: state.boss.maxHealth, defeated: state.boss.health <= 0 },
      collective: state.boss.health <= 0 ? 'A turma derrotou o Juiz' : 'O Juiz sobreviveu',
    };
  }

  /**
   * Texto curto de cada poder, sempre ligado ao conteúdo da rodada atual.
   * Nenhum poder revela gabarito, rouba ponto ou expõe aluno.
   */
  async function powerNoteFor(room, state, key) {
    const round = await arenaRoundFor(room, state.round);
    const challenge = round ? await repositories.arena.challenges.getById(round.challengeId) : null;
    const criteria = (challenge?.criteria?.length ? challenge.criteria : DEFAULT_CRITERIA)
      .map((entry) => ({ criterion: entry.criterion, weight: Number(entry.weight || 0) }))
      .sort((left, right) => right.weight - left.weight);
    const strongest = criteria[0]?.criterion || 'objetivo';
    const weightiest = criteria.slice(0, 2).map((entry) => entry.criterion).join(' e ');
    if (key === 'pista') {
      return `O Juiz desta missão pesa mais ${weightiest}. Quem escreveu pensando nisso sai na frente.`;
    }
    if (key === 'conselho') {
      return 'A turma pode recomendar uma melhoria a um competidor antes da decisão final — a palavra final continua sendo dele.';
    }
    if (key === 'revisao') {
      return 'Confira clareza, contexto e restrições antes do envio. Nesta missão, a resposta é única.';
    }
    if (key === 'regra') {
      return 'A turma escolhe entre duas condições para o próximo desafio. A decisão é estratégica: ninguém ganha nem perde ponto por ela.';
    }
    return String(strongest);
  }

  /** Visão do modo para o aluno (voto, Wild Card, energia, time). */
  async function studentArenaView(room, participant) {
    if (!isArenaRoom(room)) return { enabled: false };
    const state = await readArenaMode(room);
    const round = await arenaRoundFor(room, state.round);
    const prompts = round ? await roundPrompts(round) : [];
    const view = await arenaViewFor(room, state, {
      participant,
      promptById: new Map(prompts.map((entry) => [entry.participant_id, entry.prompt])),
    });
    const roster = (await repositories.arena.participants.listByRoom(room.id)).filter((entry) => entry.active);
    const teams = state.teams || {};
    view.my_team = ARENA_TEAMS.find((team) => (teams[team.key] || []).includes(String(participant.id))) || null;
    view.competed = state.competed.includes(String(participant.id));
    view.i_am_competitor = state.competitors.ids.includes(String(participant.id));
    view.submitted = prompts.some((entry) => entry.participant_id === String(participant.id));
    view.roster_size = roster.length;
    return view;
  }

  /** Visão completa do modo para o painel do professor e a TV. */
  async function adminArenaView(room) {
    if (!isArenaRoom(room)) return { enabled: false };
    const state = await readArenaMode(room);
    const round = await arenaRoundFor(room, state.round);
    const prompts = round ? await roundPrompts(round) : [];
    const byId = new Map(prompts.map((entry) => [entry.participant_id, entry]));
    const view = await arenaViewFor(room, state, {
      promptById: new Map(prompts.map((entry) => [entry.participant_id, entry.prompt])),
    });
    const roster = (await repositories.arena.participants.listByRoom(room.id)).filter((entry) => entry.active);
    const teams = state.teams || {};
    view.round_id = round?.id ?? null;
    view.round_status = round?.status ?? null;
    view.submitted = prompts.length;
    view.roster_size = roster.length;
    // Quem já passou pela Arena na partida — a base da rotação que o professor
    // acompanha para garantir que a vez de todos chega.
    view.competed = [...state.competed];
    view.competed_count = state.competed.length;
    view.can_draw = prompts.length >= 3 && state.phase !== 'wildcard' && !state.dynamic && !state.competitors.ids.length;
    view.attacks_summary = attackSummary(state);
    view.dynamic_catalog = Object.values(ARENA_DYNAMICS).map((entry) => ({
      key: entry.key, label: entry.label, question: entry.question,
      attacks: entry.attacks, kind: entry.kind, teach: entry.teach,
    }));
    view.participants = roster.map((entry) => ({
      id: String(entry.id),
      name: entry.name,
      competed: state.competed.includes(String(entry.id)),
      submitted: byId.has(String(entry.id)),
      percent: byId.get(String(entry.id))?.percent ?? null,
      is_competitor: state.competitors.ids.includes(String(entry.id)),
      team: Object.entries(teams).find(([, members]) => (members || []).includes(String(entry.id)))?.[0] ?? null,
    }));
    view.team_rosters = ARENA_TEAMS.map((team) => ({
      ...team,
      members: (teams[team.key] || []).map((memberId) => ({
        id: String(memberId),
        name: roster.find((entry) => String(entry.id) === String(memberId))?.name || 'Participante',
      })),
    }));
    return view;
  }

  /**
   * A corrida de uma rodada no modo Arena, resumida para os paineis: quanto a
   * turma acertou em cada ataque e quanto o Boss ja perdeu. E leitura pura.
   */
  function attackSummary(state) {
    return state.attacks.map((attack) => ({
      round: attack.round,
      dynamic: attack.dynamic,
      dynamic_label: ARENA_DYNAMICS[attack.dynamic]?.label || attack.dynamic,
      accuracy: attack.accuracy,
      correct: attack.correct,
      total: attack.total,
      damaged: attack.damaged,
    }));
  }

  // -------------------------------------------------------------------------
  // Sala unificada: regras derivadas do preset (settings) da sala
  // -------------------------------------------------------------------------

  const isClassicRules = (room) => room?.settings?.judgeKind === 'classic';
  const isClassicPreset = (room) => room?.preset === 'classic' || room?.preset === 'turma';

  /** Capacidade de participantes usada pelo gate de entrada e pelo station. */
  const roomCapacity = (room) => {
    if (!room) return 0;
    if (room.expectedPlayers > 0) return room.expectedPlayers;
    return isClassicRules(room) ? Number(room.settings?.maxPlayers || 3) : 0;
  };

  /**
   * A batalha viva da sala. Toda leitura de jogo (`rounds.listByRoom`) ja vem
   * recortada nela; isto existe para quem ESCREVE uma rodada nova, que precisa
   * dizer a qual batalha ela pertence.
   */
  const roomCycle = (room) => Number(room?.currentCycle ?? 1);

  /** Duracao efetiva de uma rodada: do desafio, ou do preset quando classico. */
  const roundDurationSeconds = (room, challenge) => {
    if (challenge?.durationSeconds) return Number(challenge.durationSeconds);
    if (isClassicRules(room)) return Number(room.settings?.roundDuration || 0);
    return 0;
  };

  /** Rodadas configuradas nao podem mudar depois que a sala classica abre. */
  const canEditRounds = (room) => room && !isClassicRules(room);

  /**
   * Preparo do conteudo da sala: quais missoes ainda nao podem ser mostradas
   * (sem gabarito, ou visuais sem imagem) e o que falta em cada uma. E a mesma
   * regra usada para impedir abrir a sala e para marcar os cards no painel.
   */
  async function roomReadiness(room, preloadedRounds) {
    const roomRounds = preloadedRounds || await repositories.arena.rounds.listByRoom(room.id);
    const entries = [];
    for (const round of roomRounds) {
      const challenge = await repositories.arena.challenges.getById(round.challengeId);
      entries.push({ id: round.id, position: round.position, title: challenge?.title ?? 'Missao', challenge });
    }
    // Cada pendencia carrega o id do desafio: o painel usa isso para abrir o
    // desafio em edicao, direto no campo que falta, a partir do card da missao.
    const blockers = roomBlockers(entries).map((entry) => {
      const source = entries.find((candidate) => Number(candidate.position) === entry.position);
      return { ...entry, challenge_id: source?.challenge?.id ?? '' };
    });
    return {
      blockers,
      missingByRound: new Map(entries.map((entry) => [entry.id, missionIssues(entry.challenge)])),
      message: blockersMessage(blockers),
    };
  }

  async function pinForNewRoom() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = randomPin();
      const clash = await repositories.arena.rooms.findByPinOrCode(candidate);
      if (!clash) return candidate;
    }
    throw new ApiError(500, 'Não foi possível gerar um PIN único de sala.');
  }

  async function seedClassicRounds(room, challengeSeeds, timestamp) {
    const existing = await repositories.arena.rounds.listByRoom(room.id);
    // Reusa o desafio classico canonico ja existente no banco (por titulo), em
    // vez de duplicar "Batalha Clássica — Desafio N" a cada sala criada.
    const bank = await repositories.arena.challenges.list();
    const canonicalByTitle = new Map(bank.map((challenge) => [challenge.title, challenge]));
    for (let index = 0; index < challengeSeeds.length; index += 1) {
      const spec = challengeSeeds[index];
      const canonical = canonicalByTitle.get(spec.title);
      const challenge = canonical || await repositories.arena.challenges.save({
        id: id(), now: timestamp, ...spec,
        durationSeconds: spec.durationSeconds ?? room.settings?.roundDuration ?? null,
      });
      await repositories.arena.rounds.add({
        id: id(), roomId: room.id, cycle: roomCycle(room), position: existing.length + index + 1,
        challengeId: challenge.id, modality: challenge.modality, now: timestamp,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Pontuacao classica sobre as tabelas de sala (mesmas formulas do motor clasico)
  // -------------------------------------------------------------------------

  async function recomputeClassicRound(room, round, timestamp) {
    if (!isClassicRules(room)) return;
    const challenge = await repositories.arena.challenges.getById(round.challengeId);
    const duration = roundDurationSeconds(room, challenge);
    if (duration <= 0) return;
    const participants = (await repositories.arena.participants.listByRoom(room.id)).filter((entry) => entry.active);
    const byId = new Map(participants.map((entry) => [String(entry.id), entry]));
    const submissions = await repositories.arena.submissions.listByRound(round.id);
    const submissionBy = new Map(submissions.map((entry) => [String(entry.participantId), entry]));
    const scores = await repositories.arena.scores.listByRound(round.id);
    if (scores.length === 0) return;

    const startedAt = Number(round.startedAt || timestamp);
    const rows = scores.map((score) => {
      const participant = byId.get(String(score.participantId));
      const submission = submissionBy.get(String(score.participantId));
      const elapsed = Math.max(0, Math.min(duration, Number(submission?.submittedAt ?? startedAt) - startedAt));
      return {
        submission_id: score.submissionId,
        session_id: participant?.id ?? score.participantId,
        station_id: participant?.stationNumber ?? Number(participant?.id ? String(participant.id).replace(/\D/g, '') || 1 : 1),
        percent: Number(score.percent || 0),
        points: calculatePoints(Number(score.percent || 0), elapsed, duration),
        elapsed_seconds: elapsed,
        scoring_version: SCORING_VERSION,
        explanation: score.feedback || 'Pontuação clássica',
      };
    });
    const ranked = rankRound(rows);
    for (const row of ranked) {
      await repositories.arena.scores.updateClassicMetrics({
        submissionId: row.submission_id,
        points: row.points,
        position: row.position,
        scoringVersion: row.scoring_version,
        now: timestamp,
      });
    }
  }

  /** Ranking geral classico (acumula pontos; desempate por pontos, acerto, tempo). */
  async function classicOverallRanking(room) {
    const rounds = await repositories.arena.rounds.listByRoom(room.id);
    const participants = (await repositories.arena.participants.listByRoom(room.id)).filter((entry) => entry.active);
    const rows = participants.map((participant) => ({
      participant_id: participant.id,
      name: participant.name,
      first_name: firstName(participant.name),
      station_id: participant.stationNumber ?? Number(String(participant.id).replace(/\D/g, '') || 1),
      rounds_completed: 0,
      percent_sum: 0,
      points_sum: 0,
      elapsed_sum: 0,
      total_points: 0,
      total_time: 0,
      avg_percent: 0,
      evolution: [],
    }));
    const byId = new Map(rows.map((row) => [String(row.participant_id), row]));
    for (const round of rounds) {
      const scores = await repositories.arena.scores.listByRound(round.id);
      const submissions = await repositories.arena.submissions.listByRound(round.id);
      const submissionBy = new Map(submissions.map((entry) => [String(entry.participantId), entry]));
      for (const score of scores) {
        const row = byId.get(String(score.participantId));
        if (!row) continue;
        row.rounds_completed += 1;
        row.percent_sum += Number(score.percent || 0);
        row.points_sum += Number(score.points || 0);
        const submission = submissionBy.get(String(score.participantId));
        if (submission && Number.isFinite(round.startedAt)) {
          const elapsed = Math.max(0, Number(submission.submittedAt) - Number(round.startedAt));
          row.elapsed_sum += elapsed;
        }
        row.evolution.push({ position: Number(round.position), percent: Number(score.percent || 0) });
      }
    }
    for (const row of rows) {
      row.total_points = row.points_sum;
      row.total_time = row.elapsed_sum;
      row.avg_percent = row.rounds_completed ? row.percent_sum / row.rounds_completed : 0;
      row.evolution.sort((a, b) => a.position - b.position);
    }
    const ranked = rankFinal(rows.filter((row) => row.rounds_completed > 0))
      .map(({ position, ...row }) => ({ ...row, position, avg_percent: Math.round(row.avg_percent * 100) / 100 }));
    return ranked;
  }

  // -------------------------------------------------------------------------
  // Avanco do jogo (fim automatico de rodada aberta apos o prazo + tolerancia)
  // -------------------------------------------------------------------------

  async function scoreMissingAtClose(round, room, timestamp) {
    const challenge = await repositories.arena.challenges.getById(round.challengeId);
    const criteria = challenge?.criteria?.length ? challenge.criteria : DEFAULT_CRITERIA;
    const participants = (await repositories.arena.participants.listByRoom(room.id)).filter((entry) => entry.active);
    const submissions = await repositories.arena.submissions.listByRound(round.id);
    const byParticipant = new Map(submissions.map((entry) => [String(entry.participantId), entry]));
    const scored = new Set((await repositories.arena.scores.listByRound(round.id)).map((entry) => String(entry.participantId)));
    for (const participant of participants) {
      if (scored.has(String(participant.id))) continue;
      let submission = byParticipant.get(String(participant.id));
      // Received prompts keep their evaluation even if the round ends meanwhile.
      if (submission?.prompt) continue;
      if (!submission) {
        submission = await repositories.arena.submissions.create({
          id: id(), roomId: room.id, participantId: participant.id, roundId: round.id,
          attempt: 1, prompt: '', submittedAt: Number(round.deadlineAt ?? timestamp),
        });
      }
      const emptyBreakdown = Object.fromEntries(criteria.map((entry) => [entry.criterion, 0]));
      await repositories.arena.scores.record({
        id: id(), submissionId: submission.id, percent: 0, breakdown: emptyBreakdown,
        feedback: isClassicRules(room)
          ? 'Tempo encerrado sem prompt enviado. Pontuação zerada nesta rodada.'
          : 'Tempo encerrado sem envio. Pontuação zerada nesta missão.',
        judgeStatus: 'timeout', model: null, now: timestamp,
      });
    }
    if (isClassicRules(room)) await recomputeClassicRound(room, round, timestamp);
  }

  const closingRooms = new Map();
  async function closeOpenRound(room, timestamp) {
    if (closingRooms.has(room.id)) return closingRooms.get(room.id);
    const work = performCloseOpenRound(room, timestamp);
    closingRooms.set(room.id, work);
    try { return await work; }
    finally { if (closingRooms.get(room.id) === work) closingRooms.delete(room.id); }
  }

  async function performCloseOpenRound(room, timestamp) {
    const rounds = await repositories.arena.rounds.listByRoom(room.id);
    const open = rounds.find((entry) => entry.status === 'open');
    if (!open) return false;
    await scoreMissingAtClose(open, room, timestamp);
    await repositories.arena.rounds.updateStatus({ id: open.id, status: 'results', now: timestamp });
    return true;
  }

  async function openRound(room, round, challenge, timestamp) {
    const duration = roundDurationSeconds(room, challenge);
    await repositories.arena.rounds.updateStatus({
      id: round.id, status: 'open', now: timestamp,
      startedAt: timestamp,
      deadlineAt: duration > 0 ? timestamp + duration : null,
    });
    if (room.status !== 'playing') {
      await repositories.arena.rooms.updateStatus({ id: room.id, status: 'playing', now: timestamp, startedAt: timestamp });
    }
  }

  /** Participantes que a rodada espera: os ativos presentes quando ela abriu. */
  async function expectedRoster(room, round) {
    const startedAt = Number(round.startedAt ?? 0);
    const participants = (await repositories.arena.participants.listByRoom(room.id)).filter((entry) => entry.active);
    return startedAt > 0
      ? participants.filter((entry) => Number(entry.joinedAt) <= startedAt + 1)
      : participants;
  }

  /** Rodada classica completa quando todos do roster ja tem nota. */
  async function classicRoundComplete(room, round) {
    if (!isClassicRules(room) || round.status !== 'open') return false;
    if (Number.isFinite(round.pausedAt)) return false;
    const roster = await expectedRoster(room, round);
    if (roster.length === 0) return false;
    const scored = new Set((await repositories.arena.scores.listByRound(round.id)).map((entry) => String(entry.participantId)));
    return roster.every((entry) => scored.has(String(entry.id)));
  }

  /** Avanca janelas de resultados das salas classicas (10s entre rounds, 30s final). */
  async function advanceClassicWindows(room, timestamp) {
    if (room.status !== 'playing' || !isClassicRules(room)) return;
    const rounds = await repositories.arena.rounds.listByRoom(room.id);
    const results = rounds.filter((entry) => entry.status === 'results').sort((a, b) => a.position - b.position);
    if (results.length === 0) return;
    const shown = results.at(-1);
    const lastConfigured = rounds.at(-1);
    const isFinalBoard = !lastConfigured || Number(shown.position) >= Number(lastConfigured.position);
    const windowSeconds = isFinalBoard
      ? Number(room.settings?.finalResultsDuration || 30)
      : Number(room.settings?.resultsDuration || 10);
    // A janela comeca quando os resultados apareceram: momento da ultima nota
    // registrada (fechamento por todos enviarem) ou o prazo, se fechou no tempo.
    const scoreRows = await repositories.arena.scores.listByRound(shown.id);
    const resultsStart = scoreRows.length
      ? Math.max(...scoreRows.map((score) => Number(score.createdAt)))
      : Number(shown.deadlineAt ?? shown.startedAt ?? 0);
    if (windowSeconds <= 0 || timestamp <= resultsStart + windowSeconds) return;
    await repositories.arena.rounds.updateStatus({ id: shown.id, status: 'closed', now: timestamp, endedAt: timestamp });
    if (isFinalBoard) {
      await repositories.arena.rooms.updateStatus({ id: room.id, status: 'ended', now: timestamp, endedAt: timestamp });
      return;
    }
    const next = (await repositories.arena.rounds.listByRoom(room.id))
      .find((entry) => entry.status === 'pending');
    if (next) {
      const challenge = await repositories.arena.challenges.getById(next.challengeId);
      await openRound(room, next, challenge, timestamp);
    }
  }

  const advancingRooms = new Map();
  async function advanceArena(room, timestamp) {
    if (!room) return room;
    if (advancingRooms.has(room.id)) return advancingRooms.get(room.id);
    const work = performAdvanceArena(room, timestamp);
    advancingRooms.set(room.id, work);
    try { return await work; }
    finally { if (advancingRooms.get(room.id) === work) advancingRooms.delete(room.id); }
  }

  async function performAdvanceArena(room, timestamp) {
    if (!room) return room;
    const rounds = await repositories.arena.rounds.listByRoom(room.id);
    const open = rounds.find((entry) => entry.status === 'open');
    // Rodada pausada nao fecha sozinha.
    if (open && !Number.isFinite(open.pausedAt) && Number.isFinite(open.deadlineAt)
      && timestamp > Number(open.deadlineAt) + ROUND_CLOSE_GRACE_SECONDS) {
      await closeOpenRound(room, timestamp);
      await advanceClassicWindows(room, timestamp);
      return repositories.arena.rooms.getById(room.id);
    }
    await advanceClassicWindows(room, timestamp);
    return repositories.arena.rooms.getById(room.id);
  }

  // -------------------------------------------------------------------------
  // Juiz (submissao -> nota por criterios)
  // -------------------------------------------------------------------------

  async function judgeSubmission({ round, room, challenge, participant, submission, timestamp }) {
    const criteria = challenge.criteria?.length ? challenge.criteria : DEFAULT_CRITERIA;
    const attemptNumber = (await repositories.arena.judgeAttempts.listBySubmission(submission.id)).length + 1;
    const isClassic = challenge.judgeKind === 'classic' || isClassicRules(room);
    let result;
    try {
      if (isClassic) {
        // Juiz classico preservado: compara o prompt do jogador com o prompt de
        // referencia (rubrica + imagem) — mesmas entradas do motor classico.
        result = await classicJudger({
          referencePrompt: challenge.referencePrompt || challenge.referenceText,
          rubric: challenge.rubric || DEFAULT_RUBRIC,
          candidatePrompt: submission.prompt,
          image: challenge.referenceImage || undefined,
        });
        result = {
          percent: result.percent,
          feedback: result.explanation || result.feedback || '',
          breakdown: result.breakdown || {},
          metadata: result.metadata,
        };
      } else {
        // A imagem de referencia NAO entra no juiz: ela existe para o aluno ver
        // (missionView) e o custo de reenvia-la a cada submissao nao se paga.
        result = await judge({
          mission: challenge.mission,
          context: challenge.context,
          referenceText: challenge.referenceText,
          expectedResult: challenge.expectedResult,
          criteria,
          candidatePrompt: submission.prompt,
        });
      }
      await repositories.arena.judgeAttempts.record({
        id: id(), submissionId: submission.id, attempt: attemptNumber, status: 'succeeded',
        model: result.metadata?.model, responseJson: JSON.stringify(result), now: timestamp,
      });
    } catch (error) {
      await repositories.arena.judgeAttempts.record({
        id: id(), submissionId: submission.id, attempt: attemptNumber, status: 'failed',
        error: String(error?.message || error), now: timestamp,
      });
      // Teto da instalacao (fila/cota) NAO e falha do provedor: a resposta tem
      // de ser recuperavel, dizendo que a tentativa segue preservada. Sem isto,
      // um pico de fila virava "nao foi possivel avaliar" — o mesmo aviso de um
      // provedor quebrado — e o aluno nao sabia que podia simplesmente repetir.
      const recusa = budgetRejection(error);
      if (recusa) {
        // A tentativa ja existe e o teto e passageiro: a avaliacao entra no
        // patio ALEM de a recusa ser recuperavel. Sem isto, um pico de fila
        // deixava a submissao sem nota dependendo do aluno lembrar de repetir.
        estacionar({ submission, roomId: room?.id, reason: 'orcamento', retryAfterMs: recusa.retryAfter * 1000 });
        const fila = comCausa(new ApiError(recusa.status, recusa.message), error);
        fila.details = { retry_after: recusa.retryAfter };
        fila.retryAfter = recusa.retryAfter;
        fila.roomId = room?.id;
        throw fila;
      }
      // Falha do PROVEDOR: nao vira nota local nem nota inventada. A avaliacao
      // fica estacionada e volta sozinha; a resposta diz que ela continua. Era
      // aqui que o modo `gemini` gravava heuristica — e uma turma inteira recebia
      // nota que ninguem avaliou sem ter como perceber.
      const indisponivel = judgeUnavailable(error);
      if (indisponivel?.parkable) {
        estacionar({
          submission, roomId: room?.id, reason: indisponivel.reason, retryAfterMs: indisponivel.retryAfterMs,
        });
        const parada = comCausa(new ApiError(503, 'Sua resposta foi recebida: a avaliacao continua e a nota aparece assim que o provedor responder.'), error);
        parada.code = 'judge_parked';
        parada.parked = true;
        parada.roomId = room?.id;
        parada.reason = indisponivel.reason;
        parada.details = { parked: true, reason: indisponivel.reason };
        throw parada;
      }
      // A causa fica anexada para a linha de log (o corpo da resposta continua
      // sendo exatamente esta frase: nada de erro interno vazando para o aluno).
      const falha = comCausa(new ApiError(502, 'Não foi possível avaliar o prompt agora.'), error);
      // A sala vem da SESSAO, nao do payload: e ela que entra na linha de log,
      // porque e ela que diz onde procurar. O payload do aluno nao carrega
      // `room_id` — e nao e ele quem decide de que sala se trata.
      falha.roomId = room?.id;
      throw falha;
    }
    const startedAt = Number(round.startedAt || timestamp);
    const duration = roundDurationSeconds(room, challenge);
    const pausedSeconds = duration > 0 && Number.isFinite(round.deadlineAt)
      ? Math.max(0, round.deadlineAt - startedAt - duration) : 0;
    const elapsed = Math.max(0, Number(submission.submittedAt) - startedAt - pausedSeconds);
    const points = isClassicRules(room) ? null : duration > 0
      ? calculateArenaPoints(result.percent, Math.min(elapsed, duration), duration, challenge.speedWeight)
      : result.percent;
    await repositories.arena.scores.record({
      id: id(), submissionId: submission.id, percent: result.percent,
      breakdown: result.breakdown || {}, feedback: result.feedback || '',
      judgeStatus: 'scored', model: result.metadata?.model, now: timestamp,
      points, scoringVersion: isClassicRules(room) ? null : ARENA_SCORING_VERSION,
    });
    if (isClassicRules(room)) await recomputeClassicRound(room, round, timestamp);
    return { result, elapsed };
  }

  /**
   * Avaliacoes EM VOO por submissao.
   *
   * Por que existe: com a resposta pendente, o envio do aluno deixa de segurar
   * a requisicao — a avaliacao continua em segundo plano. Sem esta trava, o
   * aluno que repetisse o mesmo envio ("tente de novo", clique duplo, retry do
   * navegador) dispararia uma SEGUNDA avaliacao externa para a mesma submissao e
   * duas gravacoes de nota para a mesma linha. O banco recusaria a segunda (a
   * nota e unica por submissao), mas o custo da chamada ja teria sido pago e o
   * aluno veria erro em vez de nota.
   *
   * Repetir a solicitacao passa a ser o que o desenho promete: consultar /
   * concluir a MESMA avaliacao.
   */
  const avaliacoesEmVoo = new Map();
  function avaliarSubmission(args) {
    const { submission } = args;
    const emVoo = avaliacoesEmVoo.get(submission.id);
    if (emVoo) return emVoo;
    let promessa;
    promessa = judgeSubmission(args).finally(() => {
      // Só limpa se ainda for esta: uma avaliacao nova (apos falha) nao pode ser
      // removida pelo encerramento da anterior.
      if (avaliacoesEmVoo.get(submission.id) === promessa) avaliacoesEmVoo.delete(submission.id);
    });
    avaliacoesEmVoo.set(submission.id, promessa);
    return promessa;
  }

  /**
   * O patio: avaliacoes que o provedor nao entregou ficam aqui para voltar
   * sozinhas. Ele e da INSTANCIA (nasce no bootstrap) para a prontidao mostrar
   * quantas estao esperando e o encerramento parar as esperas.
   */
  const patio = parking || createEvaluationParking({
    log: (evento, dados) => log?.warn?.(evento, dados),
  });

  /**
   * Estaciona a avaliacao de uma submissao para reprocessar depois.
   *
   * Por que existe (medido em 17/09/2026): quando o provedor falhava depois das
   * repeticoes, o modo `gemini` gravava a nota HEURISTICA local — com um projeto
   * bloqueado (403), isso deu 6 de 6 notas locais com cara de avaliadas, sem o
   * aluno ver diferenca. A heuristica deixou de ser premio de consolacao por
   * falha do provedor: ou a nota vem do provedor, ou nao existe ainda — e "ainda"
   * e o que este patio sustenta.
   *
   * A tarefa NAO reavalia uma submissao que ja tem nota: o aluno pode repetir o
   * envio enquanto ela espera (`avaliacoesEmVoo` serializa as duas), e a nota e
   * unica por submissao no banco.
   */
  function estacionar({
    submission, roomId = null, reason = null, retryAfterMs = 0,
    attemptsSoFar = 0, waitMs = null, attemptsAllowed = null,
  }) {
    return patio.park({
      key: String(submission.id),
      roomId,
      reason,
      retryAfterMs,
      attemptsSoFar,
      waitMs,
      attemptsAllowed,
      // Cada tentativa mudou o estado da sala: a nota chegou, ou continua sem
      // chegar. As telas devem refletir isso agora, nao no proximo poll.
      onSettled: () => { if (roomId) onRoomChanged(roomId); },
      task: async () => {
        // Primeira pergunta: ja esta avaliada? (o aluno repetiu o envio, ou a
        // tentativa anterior chegou a terminar).
        const existente = await repositories.arena.scores.getBySubmission(submission.id);
        if (existente) return existente;
        const atual = await repositories.arena.submissions.getById(submission.id);
        // Submissao apagada (reset da sala): nao ha o que reprocessar.
        if (!atual) return null;
        const rodada = await repositories.arena.rounds.getById(atual.roundId);
        if (!rodada) return null;
        // Sala, desafio e participante sao lidos DE NOVO: a rodada pode ter
        // pausado, o desafio sido editado e o participante removido enquanto a
        // avaliacao esperava — reprocessar em cima de estado velho daria nota
        // errada, e nao nota nenhuma.
        const [sala, desafio, participante] = await Promise.all([
          repositories.arena.rooms.getById(rodada.roomId),
          repositories.arena.challenges.getById(rodada.challengeId),
          repositories.arena.participants.getById(atual.participantId),
        ]);
        if (!sala || !desafio || !participante) return null;
        await avaliarSubmission({
          round: rodada, room: sala, challenge: desafio, participant: participante,
          submission: atual, timestamp: now(),
        });
        return repositories.arena.scores.getBySubmission(submission.id);
      },
    });
  }

  // -------------------------------------------------------------------------
  // Retomada: a fila que sobreviveu ao reinicio
  // -------------------------------------------------------------------------

  /**
   * Janela da retomada. Uma submissão mais velha que isto não entra na fila do
   * boot: a aula já passou, e chamar o provedor por causa dela seria custo e
   * surpresa numa instalação que acabou de subir.
   */
  const PARKING_RESUME_WINDOW_SECONDS = 24 * 60 * 60;
  /**
   * Piso da espera da retomada. Sem ele, uma submissão cuja última tentativa foi
   * há mais que a espera exponencial voltaria a ser tentada no mesmo milissegundo
   * em que o processo sobe — e uma turma inteira retomada de uma vez viraria uma
   * rajada contra o provedor justamente no boot.
   */
  const PARKING_RESUME_MIN_WAIT_MS = 1_000;
  /**
   * Resfriamento de uma avaliação que já esgotou o surto de tentativas. Não é o
   * mesmo que desistir: o provedor que volta depois de uma queda é aproveitado,
   * mas por tentativas espaçadas — e não por um surto novo a cada varredura.
   */
  const PARKING_REARM_MS = 10 * 60 * 1000;
  /**
   * Quantas vezes a fila rearma uma mesma submissão. Com o surto (4) e a
   * tentativa do envio, o teto da história é 1 + 4 + 6 tentativas por submissão —
   * um número finito, escrito, e não "enquanto o servidor estiver de pé".
   */
  const PARKING_REARMS = 6;

  /**
   * Retoma as avaliações que ficaram SEM nota.
   *
   * O defeito que isto corrige: o pátio vive na memória do processo, então um
   * redeploy (ou um reinício) descartava as esperas — e a submissão que estava
   * esperando nota ficava sem nota ATÉ o aluno reenviar. A fila, porém, nunca
   * esteve na memória: submissão sem linha em `arena_scores` é exatamente "ainda
   * esperando nota", e `arena_judge_attempts` guarda quantas tentativas já foram
   * gastas. A memória só guardava o relógio.
   *
   * Por isso a retomada é uma LEITURA do banco, e não um estado gravado à parte:
   * nada precisa ser persistido no instante da falha (nem no encerramento, nem no
   * meio de uma avaliação) para que o próximo processo saiba o que fazer.
   *
   * Ela é a MESMA operação do VIGIA (`iniciarVigiaDaFila` em `start.mjs`): o boot
   * a chama uma vez, e o vigia a repete de tempos em tempos enquanto o servidor
   * está de pé. É por isso que a recuperação não depende de reinício.
   *
   * O que ela respeita:
   *   - o TETO de tentativas conta através dos reinícios — sem isso, reiniciar
   *     daria ao provedor um punhado novo de tentativas a cada subida;
   *   - uma avaliação que já esgotou o surto só volta depois do RESFRIAMENTO, e
   *     com UMA tentativa (`attemptsAllowed`), até o teto de rearmes — o provedor
   *     que volta é aproveitado, mas o pátio não volta a martelar;
   *   - o que já está na fila DESTE processo não é reestacionado (o pátio tem
   *     dedupe por chave; a varredura apenas não bate na porta de novo);
   *   - a sala precisa estar viva (`draft`/`waiting`/`open`/`playing`): aula
   *     encerrada não dispara avaliação;
   *   - a espera desconta o tempo que já passou desde a última tentativa, com
   *     piso de 1 s, e as retomadas de uma varredura são escalonadas — uma turma
   *     inteira voltando de uma vez não vira rajada no mesmo milissegundo.
   */
  async function retomarEstacionadas({
    windowSeconds = PARKING_RESUME_WINDOW_SECONDS, limit = 500, timestamp = now(),
    rearmMs = PARKING_REARM_MS, rearrms = PARKING_REARMS, source = 'boot',
  } = {}) {
    const pendentes = await repositories.arena.submissions.listAwaitingScore({
      since: timestamp - windowSeconds, limit,
    });
    const teto = patio.limits?.maxAttempts ?? Infinity;
    const resumo = {
      at: timestamp, source, found: pendentes.length,
      resumed: 0, rearms: 0, cooling: 0, running: 0, exhausted: 0,
    };
    let escalonamento = 0;
    for (const submissao of pendentes) {
      // Já está na fila deste processo: nada a fazer (e a nota ainda vem por ela).
      if (patio.has(String(submissao.id))) { resumo.running += 1; continue; }
      // `arena_judge_attempts` conta o envio e cada reprocessamento; o pátio
      // conta só os REPROCESSAMENTOS (a tentativa do envio aconteceu na
      // requisição do aluno). Daí o `- 1`.
      const tentativasGastas = Math.max(0, Number(submissao.attempts || 0) - 1);
      const decorridoMs = Number.isFinite(submissao.lastAttemptAt)
        ? Math.max(0, (timestamp - submissao.lastAttemptAt) * 1000) : 0;
      // 1) Ainda há surto por gastar: a avaliação perdeu o relógio (reinício,
      //    requisição que morreu entre gravar a submissão e julgar) e volta com
      //    as tentativas que restam.
      if (tentativasGastas < teto) {
        const esperaDoProximo = waitBeforeReprocess({
          attempt: tentativasGastas + 1,
          baseDelayMs: patio.limits?.baseDelayMs,
          maxDelayMs: patio.limits?.maxDelayMs,
        });
        estacionar({
          submission: submissao,
          roomId: submissao.roomId,
          reason: source === 'vigia' ? 'vigia' : 'retomada',
          attemptsSoFar: tentativasGastas,
          waitMs: Math.max(
            PARKING_RESUME_MIN_WAIT_MS + escalonamento * 150,
            esperaDoProximo - decorridoMs,
          ),
        });
        escalonamento += 1;
        resumo.resumed += 1;
        continue;
      }
      // 2) Surto esgotado: o vigia rearma UMA tentativa por vez, depois do
      //    resfriamento, até o teto de rearmes.
      if (tentativasGastas >= teto + rearrms) {
        resumo.exhausted += 1;
        log.warn('judge_park_resume_exhausted', {
          submission_id: submissao.id, room_id: submissao.roomId, attempts: submissao.attempts,
        });
        continue;
      }
      if (decorridoMs < rearmMs) {
        resumo.cooling += 1;
        continue;
      }
      estacionar({
        submission: submissao,
        roomId: submissao.roomId,
        reason: 'vigia_rearme',
        attemptsSoFar: tentativasGastas,
        attemptsAllowed: tentativasGastas + 1,
        waitMs: PARKING_RESUME_MIN_WAIT_MS + escalonamento * 150,
      });
      escalonamento += 1;
      resumo.rearms += 1;
    }
    if (resumo.found > 0) log.warn('judge_park_resume', resumo);
    return resumo;
  }

  // -------------------------------------------------------------------------
  // Visoes
  // -------------------------------------------------------------------------

  async function computeHighlights(room, timestamp) {
    const rounds = await repositories.arena.rounds.listByRoom(room.id);
    const participants = (await repositories.arena.participants.listByRoom(room.id)).filter((entry) => entry.active);
    const byId = new Map(participants.map((entry) => [String(entry.id), entry]));
    const averages = new Map();
    const totals = new Map();
    const sprintBest = [];
    const reversaBest = [];
    const refinamentoBest = [];
    const evolutions = [];

    for (const round of rounds) {
      const scores = await repositories.arena.scores.listByRound(round.id);
      const submissions = await repositories.arena.submissions.listByRound(round.id);
      const byParticipant = new Map(submissions.map((entry) => [String(entry.id), entry]));
      const challenge = await repositories.arena.challenges.getById(round.challengeId);
      for (const score of bestRoundScores(scores)) {
        const participant = byId.get(String(score.participantId));
        if (!participant) continue;
        const key = String(participant.id);
        const bucket = averages.get(key) || { name: participant.name, first: participant.name, sum: 0, count: 0, criteria: {}, elapsed: 0 };
        bucket.sum += Number(score.percent || 0);
        bucket.count += 1;
        for (const [criterion, points] of Object.entries(score.breakdown || {})) {
          bucket.criteria[criterion] = (bucket.criteria[criterion] || 0) + Number(points);
        }
        const submission = byParticipant.get(String(score.submissionId));
        if (submission && Number.isFinite(round.startedAt)) {
          bucket.elapsed += Math.max(0, Number(submission.submittedAt) - Number(round.startedAt));
        }
        averages.set(key, bucket);
        const total = totals.get(key) || { name: participant.name, points: 0 };
        total.points += scorePoints(score);
        totals.set(key, total);
      }
      if (challenge?.modality === 'sprint') {
        for (const score of scores) {
          const participant = byId.get(String(score.participantId));
          if (participant) sprintBest.push({ name: participant.name, percent: Number(score.percent || 0) });
        }
      }
      if (challenge?.modality === 'reversa') {
        for (const score of scores) {
          const participant = byId.get(String(score.participantId));
          if (participant) reversaBest.push({ name: participant.name, percent: Number(score.percent || 0) });
        }
      }
      if (challenge?.modality === 'refinamento') {
        const finalByParticipant = new Map();
        for (const score of scores) {
          const previous = finalByParticipant.get(String(score.participantId));
          if (!previous || score.attempt > previous.attempt) finalByParticipant.set(String(score.participantId), score);
        }
        const sorted = [...scores].sort((a, b) => a.attempt - b.attempt);
        for (const score of sorted) {
          const participant = byId.get(String(score.participantId));
          if (!participant) continue;
          const first = sorted.find((entry) => String(entry.participantId) === String(score.participantId) && entry.attempt === 1);
          if (first && score.attempt > first.attempt) {
            evolutions.push({
              name: participant.name,
              delta: Number(score.percent) - Number(first.percent),
              final: Number(score.percent),
            });
          }
        }
        for (const [, score] of finalByParticipant) {
          const participant = byId.get(String(score.participantId));
          if (participant) refinamentoBest.push({ name: participant.name, percent: Number(score.percent || 0) });
        }
      }
    }

    // So premia quem tem pontuacao real: seleciona apenas entradas com valor > 0
    const bestPositive = (list, select) => {
      const positive = list.filter((entry) => select(entry) > 0);
      return positive.length ? positive.reduce((top, entry) => (select(entry) > select(top) ? entry : top)) : null;
    };

    const rows = [...averages.entries()].map(([key, bucket]) => ({
      key,
      name: bucket.name,
      avg: bucket.count ? bucket.sum / bucket.count : 0,
      criterionAvg: (criterion) => bucket.count ? (bucket.criteria[criterion] || 0) / bucket.count : 0,
      avgElapsed: bucket.count ? bucket.elapsed / bucket.count : Infinity,
    }));

    let mostEfficient = null;
    for (const row of rows) {
      if (row.avg <= 0 || !row.avgElapsed || !Number.isFinite(row.avgElapsed)) continue;
      if (!mostEfficient || row.avgElapsed < mostEfficient.avgElapsed) mostEfficient = { name: row.name, avgElapsed: row.avgElapsed };
    }

    return {
      best_score: bestPositive([...totals.values()], (row) => row.points),
      most_precise: rows.length ? bestPositive(rows, (row) => row.criterionAvg('objetivo')) : null,
      best_context: rows.length ? bestPositive(rows, (row) => row.criterionAvg('contexto')) : null,
      most_efficient: mostEfficient,
      biggest_evolution: evolutions.length ? bestPositive(evolutions, (entry) => entry.delta) : null,
      best_sprint: sprintBest.length ? bestPositive(sprintBest, (entry) => entry.percent) : null,
      best_refinement: refinamentoBest.length ? bestPositive(refinamentoBest, (entry) => entry.percent) : null,
      best_visual: reversaBest.length ? bestPositive(reversaBest, (entry) => entry.percent) : null,
    };
  }

  async function overallRanking(room) {
    if (isClassicRules(room)) return classicOverallRanking(room);
    const rounds = await repositories.arena.rounds.listByRoom(room.id);
    const participants = (await repositories.arena.participants.listByRoom(room.id)).filter((entry) => entry.active);
    const rows = participants.map((participant) => ({
      participant_id: participant.id,
      name: participant.name,
      first_name: firstName(participant.name),
      rounds_completed: 0,
      percent_sum: 0,
      points_sum: 0,
      elapsed_sum: 0,
      avg_percent: 0,
      evolution: [], // {position, percent} por missao, para o cockpit
    }));
    const byId = new Map(rows.map((row) => [String(row.participant_id), row]));
    for (const round of rounds) {
      const scores = await repositories.arena.scores.listByRound(round.id);
      const submissions = await repositories.arena.submissions.listByRound(round.id);
      const submissionBy = new Map(submissions.map((entry) => [String(entry.id), entry]));
      for (const score of bestRoundScores(scores)) {
        const row = byId.get(String(score.participantId));
        if (!row) continue;
        row.rounds_completed += 1;
        row.percent_sum += Number(score.percent || 0);
        row.points_sum += scorePoints(score);
        row.evolution.push({ position: Number(round.position), percent: Number(score.percent || 0) });
        const submission = submissionBy.get(String(score.submissionId));
        if (submission && Number.isFinite(round.startedAt)) {
          row.elapsed_sum += Math.max(0, Number(submission.submittedAt) - Number(round.startedAt));
        }
      }
    }
    for (const row of rows) {
      row.evolution.sort((a, b) => a.position - b.position);
    }
    const ranked = rows
      .filter((row) => row.rounds_completed > 0)
      .map((row) => ({ ...row, avg_percent: row.percent_sum / row.rounds_completed }))
      .sort((a, b) => b.points_sum - a.points_sum || b.avg_percent - a.avg_percent || a.elapsed_sum - b.elapsed_sum || String(a.name).localeCompare(String(b.name)))
      .map((row, index) => ({ ...row, position: index + 1 }));
    return ranked;
  }

  /** Visao da rodada para a tela do aluno (mission aberta ou janela de resultados). */
  function missionView({ round, challenge, judgeKind, myScores, mySubmissions = [], timestamp, roundOver = false }) {
    const view = {
      id: round.id,
      position: round.position,
      modality: round.modality,
      title: challenge?.title ?? 'Missao',
      mission: challenge?.mission ?? '',
      context: challenge?.context ?? '',
      // O gabarito NAO entra na visao do aluno: e a regua do juiz. Mandar este
      // campo para a tela entregava a resposta (o aluno lia o texto com que o
      // juiz compara). O professor audita o gabarito no detalhe da sala e na
      // previa (missionView + judge_reference, so para admin).
      reference_image: challenge?.referenceImage ?? '',
      expected_result: challenge?.expectedResult ?? '',
      duration_seconds: challenge?.durationSeconds ?? null,
      speed_weight: challenge?.speedWeight ?? 'none',
      judge_kind: judgeKind,
      // A batalha concede um único envio por missão, inclusive quando um
      // desafio antigo do banco ainda registra mais tentativas.
      attempts: 1,
      started_at: round.startedAt,
      deadline_at: round.deadlineAt,
      paused_at: round.pausedAt ?? null,
      server_now: timestamp,
      my_scores: myScores,
      my_submissions: mySubmissions.map((submission) => ({
        id: submission.id, attempt: submission.attempt, prompt: submission.prompt,
        status: myScores.some((score) => score.submissionId === submission.id) ? 'scored' : 'received',
      })),
    };
    if (roundOver) {
      // Janela de resultados: a rodada acabou — sem deadline ativo no timer.
      view.round_over = true;
      view.deadline_at = null;
      view.paused_at = null;
    }
    return view;
  }

  async function studentLobby(room, participant, timestamp) {
    const rounds = await repositories.arena.rounds.listByRoom(room.id);
    const participants = (await repositories.arena.participants.listByRoom(room.id)).filter((entry) => entry.active);
    const connected = participants.filter((entry) => timestamp - Number(entry.lastSeenAt) <= CONNECTED_WINDOW_SECONDS).length;

    const roundSummaries = [];
    let currentRound = null;
    const resultsRounds = [];
    let pendingResults = 0;
    for (const round of rounds) {
      const challenge = await repositories.arena.challenges.getById(round.challengeId);
      const submissions = await repositories.arena.submissions.listByRound(round.id);
      const scored = new Set((await repositories.arena.scores.listByRound(round.id))
        .map((entry) => String(entry.submissionId)));
      pendingResults += submissions.filter((entry) => !scored.has(String(entry.id))).length;
      const mySubmissions = submissions
        .filter((entry) => String(entry.participantId) === String(participant.id));
      const myScores = [];
      for (const submission of mySubmissions) {
        const score = await repositories.arena.scores.getBySubmission(submission.id);
        if (score) myScores.push({ ...score, attempt: submission.attempt, prompt: submission.prompt, submittedAt: submission.submittedAt });
      }
      const best = myScores.length ? Math.max(...myScores.map((entry) => Number(entry.percent))) : null;
      const bestPoints = myScores.length
        ? Math.max(...myScores.map((entry) => Number(entry.points ?? entry.percent ?? 0)))
        : null;
      const judgeKind = challenge?.judgeKind ?? 'criteria';
      roundSummaries.push({
        id: round.id,
        position: round.position,
        modality: round.modality,
        title: challenge?.title ?? 'Missao',
        status: round.status,
        judge_kind: judgeKind,
        started_at: round.startedAt,
        deadline_at: round.deadlineAt,
        attempts_used: mySubmissions.length,
        attempts_allowed: 1,
        best_percent: best,
        best_points: bestPoints,
        my_scores: myScores,
      });
      if (round.status === 'open') {
        currentRound = missionView({ round, challenge, judgeKind, myScores, mySubmissions, timestamp });
      } else if (isClassicRules(room) && room.status === 'playing' && round.status === 'results' && !currentRound) {
        // Janela de resultados classica: a rodada em exibicao permanece como
        // "rodada atual" com a nota do jogador — inclusive para quem fechou a
        // rodada com o proprio envio (sem isso, esse jogador nunca via o
        // resultado na tela, porque a rodada ja tinha saido de 'open').
        // So vale enquanto a sala esta em jogo: ao encerrar, o aluno volta ao
        // estado vazio ("Batalha encerrada!").
        currentRound = missionView({ round, challenge, judgeKind, myScores, mySubmissions, timestamp, roundOver: true });
      }
      if (round.status === 'results' || round.status === 'closed') {
        const scores = await repositories.arena.scores.listByRound(round.id);
        const rankedScores = isClassicRules(room)
          ? [...scores].sort((left, right) => (left.position ?? 99) - (right.position ?? 99))
          : bestRoundScores(scores);
        const ranking = [];
        for (const score of rankedScores) {
          const entry = participants.find((item) => String(item.id) === String(score.participantId));
          ranking.push({
            position: ranking.length + 1,
            name: entry?.name ?? 'Participante',
            percent: Number(score.percent || 0),
            points: scorePoints(score),
            is_me: String(score.participantId) === String(participant.id),
          });
        }
        const myBest = myScores.length ? Math.max(...myScores.map((entry) => Number(entry.percent))) : 0;
        const myBestPoints = myScores.length
          ? Math.max(...myScores.map((entry) => Number(entry.points ?? 0)))
          : null;
        resultsRounds.push({
          id: round.id,
          position: round.position,
          modality: round.modality,
          title: challenge?.title ?? 'Missao',
          judge_kind: challenge?.judgeKind ?? 'criteria',
          ranking,
          my_best_percent: myBest,
          my_best_points: myBestPoints,
          my_position: ranking.findIndex((entry) => entry.is_me) + 1 || null,
          feedback: myScores.length ? myScores[myScores.length - 1].feedback : null,
        });
      }
    }

    return {
      room: {
        id: room.id,
        code: room.code,
        pin: room.pin ?? room.code,
        title: room.title,
        status: room.status,
        preset: room.preset,
        phase: roomPhase(room, rounds),
        expected_players: room.expectedPlayers,
        settings: { ...(room.settings || {}) },
        participants: participants.length,
        connected,
        entry_blocked: room.entryBlocked,
        revision: roomRevision(room),
      },
      me: { id: participant.id, name: participant.name },
      roster: participants.map((entry) => ({
        id: entry.id,
        name: entry.name,
        connected: entry.active && timestamp - Number(entry.lastSeenAt) <= CONNECTED_WINDOW_SECONDS,
        is_me: String(entry.id) === String(participant.id),
      })),
      server_now: timestamp,
      rounds: roundSummaries,
      current_round: currentRound,
      results: resultsRounds,
      ranking: (await overallRanking(room)),
      results_pending: pendingResults,
      highlights: (await computeHighlights(room, timestamp)),
      // Modo Arena: a camada coletiva vai inteira para o aluno (corações do
      // Boss, desafio da vez, Wild Card, time). Em sala fora do modo, vem
      // `{ enabled: false }` e nenhuma tela do Clássico muda.
      arena: await studentArenaView(room, participant),
    };
  }

  /**
   * Projecao (tela da TV): a mesma leitura de sala que o aluno recebe, sem
   * identidade nem dados privados por participante (notas, feedback, tentativas).
   * Quem conhece o PIN/codigo pode projetar — o conteudo e o mesmo que a turma
   * ja ve na parede/salas dos alunos.
   */
  async function tvLobby(room, timestamp) {
    const rounds = await repositories.arena.rounds.listByRoom(room.id);
    const participants = (await repositories.arena.participants.listByRoom(room.id)).filter((entry) => entry.active);
    const connected = participants.filter((entry) => timestamp - Number(entry.lastSeenAt) <= CONNECTED_WINDOW_SECONDS).length;

    const roundCards = [];
    let currentRound = null;
    const resultsRounds = [];
    let pendingResults = 0;
    for (const round of rounds) {
      const challenge = await repositories.arena.challenges.getById(round.challengeId);
      const judgeKind = challenge?.judgeKind ?? 'criteria';
      const submissions = await repositories.arena.submissions.listByRound(round.id);
      const scores = await repositories.arena.scores.listByRound(round.id);
      const scored = new Set(scores.map((entry) => String(entry.submissionId)));
      // A sala pode encerrar antes de o juiz terminar. A TV aguarda as mesmas
      // notas que o aluno, em vez de celebrar o líder de um placar incompleto.
      pendingResults += submissions.filter((entry) => !scored.has(String(entry.id))).length;
      roundCards.push({
        id: round.id,
        position: round.position,
        modality: round.modality,
        title: challenge?.title ?? 'Missao',
        status: round.status,
        judge_kind: judgeKind,
        started_at: round.startedAt,
        deadline_at: round.deadlineAt,
        paused_at: round.pausedAt ?? null,
      });
      if (round.status === 'open') {
        const submitted = new Set(submissions.map((entry) => String(entry.participantId))).size;
        currentRound = {
          id: round.id,
          position: round.position,
          modality: round.modality,
          title: challenge?.title ?? 'Missao',
          mission: challenge?.mission ?? '',
          judge_kind: judgeKind,
          started_at: round.startedAt,
          deadline_at: round.deadlineAt,
          paused_at: round.pausedAt ?? null,
          server_now: timestamp,
          reference_image: challenge?.referenceImage ?? '',
          submissions: submitted,
        };
      }
      if (round.status === 'results' || round.status === 'closed') {
        const rankedScores = isClassicRules(room)
          ? [...scores].sort((left, right) => (left.position ?? 99) - (right.position ?? 99))
          : bestRoundScores(scores);
        const ranking = [];
        for (const score of rankedScores) {
          const entry = participants.find((item) => String(item.id) === String(score.participantId));
          if (!entry) continue;
          ranking.push({
            position: ranking.length + 1,
            name: entry?.name ?? 'Participante',
            percent: Number(score.percent || 0),
            points: scorePoints(score),
          });
        }
        resultsRounds.push({
          id: round.id,
          position: round.position,
          modality: round.modality,
          title: challenge?.title ?? 'Missao',
          judge_kind: judgeKind,
          status: round.status,
          ranking,
        });
      }
    }

    return {
      room: {
        id: room.id,
        code: room.code,
        pin: room.pin ?? room.code,
        title: room.title,
        status: room.status,
        preset: room.preset,
        phase: roomPhase(room, rounds),
        expected_players: room.expectedPlayers,
        settings: { ...(room.settings || {}) },
        participants: participants.length,
        connected,
        entry_blocked: room.entryBlocked,
        revision: roomRevision(room),
      },
      server_now: timestamp,
      roster: participants.map((entry) => ({
        id: entry.id,
        name: entry.name,
        connected: entry.active && timestamp - Number(entry.lastSeenAt) <= CONNECTED_WINDOW_SECONDS,
      })),
      rounds: roundCards,
      current_round: currentRound,
      results: resultsRounds,
      ranking: (await overallRanking(room)),
      results_pending: pendingResults,
      total_rounds: rounds.length,
      // Sorteio da vez na parede: quem a turma espera ver em campo, o ultimo
      // resultado e, no mata-mata, quem continua no jogo. Sao os mesmos nomes
      // que a lista de participantes ja mostra — nada privado entra aqui.
      draw: drawView(await repositories.settings.get(drawKey(room.id)), participants),
      // Modo Arena na parede: corações do Juiz, desafio da vez e quem está em
      // campo. A TV só LÊ — quem faz o jogo andar é o painel.
      arena: await adminArenaView(room),
    };
  }

  // -------------------------------------------------------------------------
  // Quem ainda espera nota — a fila na TELA, não só na prontidão
  // -------------------------------------------------------------------------

  /**
   * Motivos que explicam a RETOMADA, não a espera.
   *
   * `vigia`, `vigia_rearme` e `retomada` dizem COMO a avaliação voltou para a
   * fila; o professor precisa do POR QUE ela saiu da nota. "vigia_rearme" na
   * tela não responde a pergunta de quem está dando aula ("por que a Ana não tem
   * nota?"), então quando o motivo da entrada é um destes o motivo mostrado sai
   * da última tentativa gravada no banco.
   */
  const MOTIVOS_DE_RETOMADA = new Set(['vigia', 'vigia_rearme', 'retomada']);

  /**
   * O motivo que SOBREVIVEU ao processo.
   *
   * A entrada do pátio morre com o processo; a tentativa de avaliação é gravada
   * e fica. O único campo dela que carrega o motivo é o texto do erro, e os dois
   * formatos que interessam são: a falha do provedor, que `failure.mjs` escreve
   * entre parênteses (`O provedor nao entregou a avaliacao (gemini_http_429)`), e
   * o teto da instalação, que `budget.mjs` nomeia em `orcamento_esgotado` /
   * `fila_cheia`. Não reconhecer nada é um resultado aceitável — a tela diz
   * "motivo não registrado" em vez de inventar uma causa.
   */
  const MOTIVOS_GRAVADOS = [
    /\(([a-z][a-z0-9_]{2,40})\)/,
    /\b(orcamento_esgotado|fila_cheia)\b/,
  ];
  function motivoGravado(texto) {
    for (const padrao of MOTIVOS_GRAVADOS) {
      const achado = padrao.exec(String(texto || ''));
      if (achado) return achado[1];
    }
    return null;
  }

  async function adminRoomDetail(inputRoom, timestamp) {
    // O painel e quem faz o jogo avancar quando ninguem esta consultando como aluno.
    let room = await advanceArena(inputRoom, timestamp);
    const roomRounds = await repositories.arena.rounds.listByRoom(room.id);
    const isClassic = isClassicRules(room);
    const participants = (await repositories.arena.participants.listByRoom(room.id)).map((entry) => ({
      id: entry.id,
      name: entry.name,
      station_number: entry.stationNumber ?? null,
      email: entry.email ?? '',
      role: entry.role ?? '',
      company: entry.company ?? '',
      consent: entry.consent ?? false,
      active: entry.active,
      joined_at: entry.joinedAt,
      last_seen_at: entry.lastSeenAt,
      connected: entry.active && timestamp - Number(entry.lastSeenAt) <= CONNECTED_WINDOW_SECONDS,
    }));
    const rounds = [];
    const readiness = await roomReadiness(room, roomRounds);
    const blockers = readiness.blockers;
    // A FILA é o banco (submissão sem linha em `arena_scores`), e o pátio diz
    // apenas se o relógio da reprocessagem está de pé NESTE processo. As duas
    // coisas juntas é que respondem o que o professor pergunta: "a nota dela vem
    // sozinha, ou depende de alguém?".
    const filaDoProcesso = new Map(
      (typeof patio.pending === 'function' ? patio.pending() : [])
        .map((entrada) => [String(entrada.key), entrada]),
    );
    const nomeDoParticipante = new Map(participants.map((entry) => [String(entry.id), entry.name]));
    const tetoDoSurto = Number.isInteger(patio.limits?.maxAttempts) ? patio.limits.maxAttempts : PARKING_REARMS;
    // O mesmo recorte do VIGIA: uma aula encerrada não dispara avaliação. Pelo
    // status da SALA, e não pela fase canônica: `roomPhase` responde `playing`
    // para uma sala encerrada que ainda tem rodada aberta (ele olha a rodada
    // primeiro), e aqui isso diria ao professor que a nota volta sozinha quando
    // ninguém mais vai buscá-la.
    const salaViva = AWAITING_ROOM_STATUSES.includes(room.status);
    const waiting = [];
    // O que a BATALHA VIVA tem, para o diálogo de "nova batalha" poder dizer o
    // que está sendo fechado (quantas missões já correram, quantos envios). Sai
    // de graça: as mesmas leituras abaixo já contam envios e status por rodada.
    const battle = {
      cycle: roomCycle(room),
      rounds_played: 0,
      submissions: 0,
      started_at: roomRounds.find((entry) => Number.isFinite(entry.startedAt))?.startedAt ?? null,
    };
    for (const round of roomRounds) {
      const challenge = await repositories.arena.challenges.getById(round.challengeId);
      const missing = readiness.missingByRound.get(round.id) || [];
      const submissions = await repositories.arena.submissions.listByRound(round.id);
      if (round.status !== 'pending') battle.rounds_played += 1;
      battle.submissions += submissions.length;
      const scores = await repositories.arena.scores.listByRound(round.id);
      const ordered = isClassic
        ? [...scores].sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
        : bestRoundScores(scores);
      // Procedencia das notas: o professor precisa saber quando a nota veio do
      // juiz local (sem chave, cota, tempo esgotado) em vez do provedor — uma
      // nota heuristica e uma nota de modelo nao valem o mesmo no relatorio. A
      // fonte e o METADADO gravado na tentativa; uma consulta por rodada.
      const tentativas = await repositories.arena.judgeAttempts.listByRound(round.id);
      const procedencia = new Map();
      for (const tentativa of tentativas) {
        if (tentativa.status !== 'succeeded' || !tentativa.responseJson) continue;
        try {
          const meta = JSON.parse(tentativa.responseJson)?.metadata || {};
          procedencia.set(tentativa.submissionId, {
            provider: meta.provider ?? (tentativa.model ? 'gemini' : 'local'),
            model: meta.model ?? tentativa.model ?? null,
            fallback_used: Boolean(meta.fallback_used),
            reason: meta.fallback_reason ?? null,
            judge_mode: meta.judge_mode ?? null,
          });
        } catch { /* resposta antiga sem JSON: sem procedencia, e nao um erro */ }
      }
      const ranked = ordered.map((score) => ({
        position: 0,
        participant_id: score.participantId,
        percent: Number(score.percent || 0),
        points: scorePoints(score),
        breakdown: score.breakdown,
        attempt: score.attempt,
        judge: procedencia.get(score.submissionId) ?? null,
      })).map((entry, index) => ({ ...entry, position: index + 1 }));
      const locais = ranked.filter((entry) => entry.judge?.fallback_used);
      const motivos = {};
      for (const entry of locais) {
        const motivo = entry.judge?.reason || 'sem_motivo';
        motivos[motivo] = (motivos[motivo] || 0) + 1;
      }
      const judgeSummary = {
        total: ranked.length,
        local: locais.length,
        provider: ranked.find((entry) => entry.judge && !entry.judge.fallback_used)?.judge?.provider
          ?? locais[0]?.judge?.provider ?? null,
        model: ranked.find((entry) => entry.judge && !entry.judge.fallback_used)?.judge?.model
          ?? locais[0]?.judge?.model ?? null,
        reasons: motivos,
      };
      // ---- quem enviou nesta missão e ainda não tem nota
      // Os dados já foram lidos para o ranking e para a procedência: o que falta
      // é cruzar "sem linha em arena_scores" com o relógio do pátio e com o
      // rastro gravado. Nenhuma consulta a mais.
      const tentativasPorSubmissao = new Map();
      for (const tentativa of tentativas) {
        const chave = String(tentativa.submissionId);
        const registro = tentativasPorSubmissao.get(chave) || { total: 0, falha: null };
        registro.total += 1;
        if (tentativa.status === 'failed') registro.falha = tentativa;
        tentativasPorSubmissao.set(chave, registro);
      }
      const comNota = new Set(scores.map((score) => String(score.submissionId)));
      for (const submissao of submissions) {
        const chave = String(submissao.id);
        if (comNota.has(chave)) continue;
        const registro = tentativasPorSubmissao.get(chave) || { total: 0, falha: null };
        const naFila = filaDoProcesso.get(chave) || null;
        // `arena_judge_attempts` conta o envio e cada reprocessamento; o pátio
        // conta só os reprocessamentos (o envio aconteceu na requisição do
        // aluno). Daí o `- 1`, igual à retomada.
        const gastas = Math.max(0, registro.total - 1);
        // O estado diz se a nota VOLTA SOZINHA — que é a decisão que o professor
        // toma agora (esperar, pedir novo envio, ou chamar quem opera).
        let estado;
        if (avaliacoesEmVoo.has(chave)) estado = 'avaliando';
        else if (naFila) estado = 'na_fila';
        else if (!salaViva) estado = 'encerrada';
        else if (Number(submissao.submittedAt) < timestamp - PARKING_RESUME_WINDOW_SECONDS) estado = 'fora_da_janela';
        else if (gastas >= tetoDoSurto + PARKING_REARMS) estado = 'esgotada';
        else estado = 'vai_retomar';
        const motivoCausal = naFila && !MOTIVOS_DE_RETOMADA.has(String(naFila.reason)) ? naFila.reason : null;
        waiting.push({
          submission_id: submissao.id,
          participant_id: submissao.participantId,
          participant_name: nomeDoParticipante.get(String(submissao.participantId)) ?? null,
          round_id: round.id,
          round_position: round.position,
          round_title: challenge?.title ?? `Missão ${round.position}`,
          submitted_at: submissao.submittedAt,
          waiting_seconds: Math.max(0, timestamp - Number(submissao.submittedAt)),
          attempts: registro.total,
          state: estado,
          // O motivo é o do provedor quando ele está fresco na fila; o gravado
          // quando a avaliação perdeu o relógio; e `null` quando não há nada
          // registrado — que a tela mostra como ausência, não como causa.
          reason: motivoCausal || motivoGravado(registro.falha?.error) || null,
          next_retry_seconds: naFila && Number.isFinite(naFila.nextRetryInMs)
            ? Math.round(naFila.nextRetryInMs / 1000) : null,
        });
      }

      const submitters = [...new Set(submissions.map((entry) => String(entry.participantId)))];
      const suggestion = suggestTiming({
        modality: round.modality || challenge?.modality,
        mission: challenge?.mission ?? '',
        context: challenge?.context ?? '',
      });
      rounds.push({
        id: round.id,
        position: round.position,
        modality: round.modality,
        title: challenge?.title ?? 'Missao',
        // Conteudo do desafio: o professor precisa ver na sala exatamente o que
        // o aluno vai receber (imagem + missao + gabarito), nao so o titulo.
        challenge_id: round.challengeId,
        mission: challenge?.mission ?? '',
        context: challenge?.context ?? '',
        reference_text: challenge?.referenceText ?? '',
        reference_image: challenge?.referenceImage ?? '',
        expected_result: challenge?.expectedResult ?? '',
        // Gabarito resolvido para exibição: no juiz clássico o texto de
        // referência é o prompt preservado do pacote-base.
        gabarito_text: challenge?.referenceText || challenge?.expectedResult || challenge?.referencePrompt || '',
        // OS CRITÉRIOS DA RÉGUA, na ordem em que o juiz os pesa. Eles já eram
        // lidos para o ranking (`breakdown` de cada nota) e não subiam para o
        // detalhe da sala: o professor via a nota sem ver com que o juiz a
        // compôs. É o mesmo dado do banco, uma leitura só.
        criteria: (challenge?.criteria ?? []).map((entry) => ({ criterion: entry.criterion, weight: Number(entry.weight) })),
        attempts: 1,
        duration_seconds: challenge?.durationSeconds ?? null,
        // Sugestao de tempo (modalidade + tamanho da missao) e quantas outras
        // salas usam este desafio: aceitar a sugestao muda o tempo la tambem.
        suggested_seconds: suggestion.seconds,
        suggested_reason: suggestion.reason,
        other_rooms: await repositories.arena.rounds.countOtherRoomsByChallenge(round.challengeId, room.id),
        // O que falta nesta missao para ela poder ser mostrada aos alunos.
        missing,
        status: round.status,
        started_at: round.startedAt,
        deadline_at: round.deadlineAt,
        paused_at: round.pausedAt ?? null,
        ended_at: round.endedAt,
        submitted: submissions.length,
        scored: scores.length,
        submitters,
        ranking: ranked,
        judge: judgeSummary,
      });
    }
    return {
      room: {
        id: room.id, code: room.code, pin: room.pin ?? room.code, title: room.title,
        status: room.status, preset: room.preset, phase: roomPhase(room, roomRounds),
        expected_players: room.expectedPlayers, entry_blocked: room.entryBlocked,
        settings: { ...(room.settings || {}) },
        created_at: room.createdAt, started_at: room.startedAt, ended_at: room.endedAt,
        current_cycle: roomCycle(room),
        revision: roomRevision(room),
      },
      // A batalha viva: é ela que o professor repete em "Nova batalha nesta
      // sala". `rounds_played` e `submissions` dizem se há o que fechar.
      battle,
      participants,
      blockers,
      ready: blockers.length === 0,
      rounds,
      // Quem enviou e ainda não tem nota. Vem da mais antiga para a mais nova: a
      // que espera há mais tempo é a que dói, e é por ela que o professor começa.
      waiting: {
        total: waiting.length,
        items: waiting.sort((a, b) => a.submitted_at - b.submitted_at),
      },
      timing: roomTiming(rounds),
      // Sorteio da vez: quem entra em campo agora. Vem pronto para a tela (com
      // o motivo de nao dar para sortear, quando for o caso) e nao interfere em
      // missao, nota ou andamento da sala.
      draw: drawView(await repositories.settings.get(drawKey(room.id)), participants),
      // Modo Arena: o professor precisa ver a partida coletiva inteira (Boss,
      // energia, poderes, competidores, desafio da vez e prêmios).
      arena: await adminArenaView(room),
      highlights: (await computeHighlights(room, timestamp)),
      ranking: (await overallRanking(room)),
      server_now: timestamp,
    };
  }

  function validateChallengePayload(payload) {
    const title = text(payload.title, 'title', { min: 2, max: 120 });
    const modality = text(payload.modality, 'modality', { min: 2, max: 30 });
    if (!MODALITIES[modality])      throw new ApiError(422, 'Revise os campos enviados.', { modality: 'Modalidade inválida.' });
    const mission = text(payload.mission, 'mission', { min: 2, max: 4000 });
    const context = text(payload.context ?? '', 'context', { min: 0, max: 4000 });
    const referenceText = text(payload.reference_text ?? '', 'reference_text', { min: 0, max: 8000 });
    let referenceImage = String(payload.reference_image ?? '').trim();
    if (referenceImage && !isBase64Image(referenceImage) && !isReferenceUrl(referenceImage)) {
      throw new ApiError(422, 'Revise os campos enviados.', { reference_image: 'Imagem de referência inválida (envie um arquivo ou uma URL).' });
    }
    if (Array.from(referenceImage).length > MAX_REFERENCE_IMAGE_CHARS) {
      throw new ApiError(422, 'Revise os campos enviados.', { reference_image: 'Imagem muito grande (máximo ~1,5 MB).' });
    }
    const expectedResult = text(payload.expected_result ?? '', 'expected_result', { min: 0, max: 4000 });
    // Desafios novos não podem reintroduzir uma segunda resposta na batalha.
    const attempts = 1;
    let durationSeconds = null;
    if (payload.duration_seconds !== undefined && payload.duration_seconds !== null && payload.duration_seconds !== '') {
      durationSeconds = integer(payload.duration_seconds, 'duration_seconds', { min: 15, max: 3600 });
    }
    const speedWeight = text(payload.speed_weight ?? 'none', 'speed_weight', { min: 1, max: 12 });
    if (!SPEED_WEIGHTS.includes(speedWeight)) throw new ApiError(422, 'Revise os campos enviados.', { speed_weight: 'Peso de velocidade inválido.' });
    const category = text(payload.category ?? 'Fundamentos', 'category', { min: 1, max: 60 });
    const criteria = Array.isArray(payload.criteria) && payload.criteria.length
      ? payload.criteria.map((entry, index) => ({
          criterion: text(entry?.criterion ?? '', `criteria.${index}.criterion`, { min: 2, max: 30 }),
          weight: integer(entry?.weight, `criteria.${index}.weight`, { min: 1, max: 100 }),
        }))
      : DEFAULT_CRITERIA;
    for (const entry of criteria) {
      if (!CRITERIA.includes(entry.criterion)) {
        throw new ApiError(422, 'Revise os campos enviados.', { [entry.criterion]: 'Critério inválido.' });
      }
    }
    return { title, modality, mission, context, referenceText, referenceImage, expectedResult, attempts, durationSeconds, speedWeight, category, criteria };
  }

  // -------------------------------------------------------------------------
  // Dispatch
  // -------------------------------------------------------------------------

  /** Payload da TV: lobby/rodada/resultados + QR de entrada dos alunos. */
  async function buildTvView(room, timestamp, meta) {
    const tv = await tvLobby(room, timestamp);
    try {
      tv.entry_qr = await entryQrForRoom(room.id, String(meta?.host || '').trim(), room.pin || room.code, meta?.protocol);
    } catch {
      // QR e decorativo: sem ele a projecao continua normal.
    }
    return tv;
  }

  /**
   * Ponto de vista das telas de fim (previa da sala e da TV): o participante
   * ativo que mais respondeu. Sem resposta nenhuma nao ha ponto de vista, e a
   * previa vai de amostra marcada. Leitura pura — nao cria nem altera nada.
   */
  async function previewStudent(participants, rounds) {
    const byRound = new Map();
    for (const round of rounds) {
      byRound.set(round.id, await repositories.arena.submissions.listByRound(round.id));
    }
    let student = null;
    let best = 0;
    for (const participant of participants) {
      const count = rounds.reduce((total, round) => total
        + (byRound.get(round.id) || [])
          .filter((entry) => String(entry.participantId) === String(participant.id)).length, 0);
      if (count > best) {
        student = participant;
        best = count;
      }
    }
    return student;
  }

  async function arenaDispatch(action, payload = {}, meta = {}) {
    object(payload);
    const timestamp = now();
    if (!Number.isFinite(timestamp)) throw new TypeError('now must be finite');

    switch (action) {
      case 'arena_status': {
        return { ok: true, open: (await arenaOpen()), server_now: timestamp };
      }

      case 'arena_tv': {
        if (typeof payload.pin !== 'string' || payload.pin.trim().length === 0) throw new ApiError(422, 'Informe o código da sala para projetar.');
        // A sessao de projecao (8h) viaja no cookie HttpOnly arena_tv_session;
        // o payload recebe tv_token injetado pela camada HTTP. Nada na URL.
        if (typeof payload.tv_token !== 'string' || payload.tv_token.trim().length === 0) {
          throw new ApiError(403, 'Sessão de projeção ausente. Abra a tela pelo Painel do professor.');
        }
        const rawCode = payload.pin.trim().toUpperCase();
        const digits = normalizePin(rawCode);
        const code = digits.length === 6 ? digits : rawCode;
        const room = await repositories.arena.rooms.findByPinOrCode(code);
        if (!room) throw new ApiError(404, 'Sala não encontrada para projeção.');
        const tokens = await tvTokensForRoom(room.id, timestamp);
        const tvToken = payload.tv_token.trim();
        const valid = Number(tokens[tvToken] || 0) >= timestamp;
        if (!valid) throw new ApiError(403, 'Sessão de projeção expirada ou inválida. Abra novamente pelo Painel do professor ou digite o código na tela da TV.');
        const advanced = await advanceArena(room, timestamp);
        return { ok: true, tv: (await buildTvView(advanced, timestamp, meta)), server_now: timestamp };
      }

      /**
       * Previa da PROJECAO (TV) para o professor: os mesmos estados que
       * renderTV() sabe desenhar — espera, rodada, resultado e fim com o painel
       * de campeao — montados a partir da sala real, sem sessao de projecao e
       * sem escrever nada (nao avanca a sala, ao contrario de arena_tv).
       *
       * Estado sem dado real vai de amostra, com o motivo: uma sala em rascunho
       * nao tem quem projetar, entao o professor escolhe o estado que quer
       * conferir e o painel avisa o que ali e exemplo.
       */
      case 'arena_tv_preview': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        const rounds = await repositories.arena.rounds.listByRoom(room.id);
        const participants = (await repositories.arena.participants.listByRoom(room.id)).filter((entry) => entry.active);
        const student = await previewStudent(participants, rounds);
        const real = Boolean(student);
        const tv = await buildTvView(room, timestamp, meta);

        // Cartao de cada missao: a amostra da rodada e do fim precisa do titulo,
        // da missao e da imagem — as mesmas que a TV mostra.
        const cards = [];
        for (const round of rounds) {
          const challenge = await repositories.arena.challenges.getById(round.challengeId);
          cards.push({
            id: round.id, position: round.position, modality: round.modality,
            title: challenge?.title ?? 'Missao', mission: challenge?.mission ?? '',
            reference_image: challenge?.referenceImage ?? '',
            judge_kind: challenge?.judgeKind ?? 'criteria',
          });
        }
        const sample = previewSampleEnd(cards);
        const sampleRoster = PREVIEW_SAMPLE_NAMES.map((name, index) => ({
          id: `preview-${index}`, name, connected: index < PREVIEW_SAMPLE_NAMES.length - 1,
        }));
        const hasRoster = Boolean(tv.roster?.length);
        const openRound = tv.current_round;
        // A ultima rodada que ja mostrou resultado ('results' na janela, 'closed'
        // depois de encerrada) — e ela que a TV projeta.
        const liveResult = [...(tv.results || [])].reverse()
          .find((entry) => entry.status === 'results' || entry.status === 'closed');
        const first = cards[0];

        // Espera: PIN, QR de entrada e quem ja entrou. O QR e o PIN sao reais
        // mesmo numa sala vazia (o daqui e o QR que a turma vai escanear).
        const lobby = {
          sample: !hasRoster || !real,
          sample_reason: !hasRoster ? 'ninguém entrou na sala ainda' : (!real ? 'a sala ainda não tem respostas' : ''),
          tv: {
            ...tv,
            room: { ...tv.room, status: 'waiting', phase: 'lobby' },
            current_round: null,
            roster: hasRoster ? tv.roster : sampleRoster,
            participants: hasRoster ? tv.room.participants : sampleRoster.length,
            ranking: real ? tv.ranking : sample.ranking,
          },
        };

        // Rodada na tela grande: imagem, titulo, tempo e quantos ja enviaram.
        const roundState = openRound
          ? { sample: false, sample_reason: '', tv: { ...tv, current_round: openRound } }
          : {
            sample: true,
            sample_reason: 'nenhuma missão está aberta',
            tv: {
              ...tv,
              room: { ...tv.room, status: 'playing', phase: 'round', participants: sampleRoster.length },
              roster: sampleRoster,
              current_round: {
                id: 'preview-round',
                position: first?.position ?? 1,
                modality: first?.modality ?? 'precisao',
                title: first?.title ?? 'Missão',
                mission: first?.mission ?? '',
                judge_kind: first?.judge_kind ?? 'criteria',
                started_at: timestamp,
                deadline_at: timestamp + 90,
                paused_at: null,
                server_now: timestamp,
                reference_image: first?.reference_image ?? '',
                submissions: 3,
              },
            },
          };

        // Resultado da rodada (sem campeao) — a TV troca a lista de resultados.
        const resultsState = liveResult
          ? {
            sample: false,
            sample_reason: '',
            tv: {
              ...tv,
              current_round: null,
              // renderTV procura a rodada com status 'results': uma rodada ja
              // encerrada projetou esse mesmo resultado naquele momento.
              results: (tv.results || []).map((entry) => (String(entry.id) === String(liveResult.id) ? { ...entry, status: 'results' } : entry)),
              room: { ...tv.room, phase: 'round_results' },
            },
          }
          : {
            sample: true,
            sample_reason: 'nenhuma rodada terminou ainda',
            tv: {
              ...tv,
              current_round: null,
              roster: sampleRoster,
              participants: sampleRoster.length,
              results: sample.results,
              ranking: sample.ranking,
              room: { ...tv.room, status: 'playing', phase: 'round_results' },
            },
          };

        // Fim: classificacao final com o painel de campeao.
        const finalState = real
          ? {
            sample: false,
            sample_reason: '',
            tv: { ...tv, current_round: null, room: { ...tv.room, status: 'ended', phase: 'final_results' } },
          }
          : {
            sample: true,
            sample_reason: 'a sala ainda não tem respostas',
            tv: {
              ...tv,
              current_round: null,
              roster: sampleRoster,
              participants: sampleRoster.length,
              results: sample.results,
              ranking: sample.ranking,
              room: { ...tv.room, status: 'ended', phase: 'final_results' },
            },
          };

        return {
          ok: true,
          room: tv.room,
          player: real ? student.name : '',
          states: { lobby, round: roundState, results: resultsState, final: finalState },
          server_now: timestamp,
        };
      }

      case 'arena_tv_code': {
        // Codigo curto digitado na tela da TV (outro aparelho): trocado por uma
        // sessao de projecao valida no cookie. Nada de token em URL.
        const digits = normalizePin(String(payload.code ?? ''));
        if (digits.length !== 6) throw new ApiError(422, 'Digite o código de projeção de 6 dígitos.');
        const ipKey = String(meta.ip || 'unknown');
        const limit = tvCodeLimiter.check(ipKey);
        if (!limit.allowed) {
          throw new ApiError(429, `Muitas tentativas de projeção. Aguarde ${limit.retryAfter}s e tente novamente.`);
        }
        const index = (await repositories.settings.get(tvCodeIndexKey)) || {};
        const entry = index[digits];
        if (!entry || Number(entry.expiresAt) < timestamp) {
          tvCodeLimiter.registerFailure(ipKey);
          throw new ApiError(403, 'Código de projeção inválido ou expirado. Confira com o professor.');
        }
        // roomById lanca 404; aqui usamos o repositorio direto para que um
        // codigo de sala apagada caia na mesma resposta amigavel + trava por IP.
        const room = await repositories.arena.rooms.getById(String(entry.roomId));
        if (!room) {
          tvCodeLimiter.registerFailure(ipKey);
          throw new ApiError(403, 'Código de projeção inválido ou expirado. Confira com o professor.');
        }
        tvCodeLimiter.reset(ipKey);
        // Sessao adicional para esta TV: nao invalida o popup do cockpit.
        const token = id();
        const expiresAt = timestamp + TV_TOKEN_TTL_SECONDS;
        const tokens = await tvTokensForRoom(room.id, timestamp);
        tokens[token] = expiresAt;
        await repositories.settings.set(tvTokenKey(room.id), { tokens }, timestamp);
        const advanced = await advanceArena(room, timestamp);
        return {
          ok: true,
          pin: room.pin || room.code,
          tv: (await buildTvView(advanced, timestamp, meta)),
          tv_token: token,
          expires_at: expiresAt,
          max_age: Math.max(1, Math.floor(expiresAt - timestamp)),
          server_now: timestamp,
        };
      }

      case 'arena_qr': {
        // QR codes do cockpit: entrada dos alunos (/play) e projecao (/tv.php).
        // So o admin gera; o caminho vem do cliente e o servidor monta a URL
        // absoluta (trocando localhost pelo IP da maquina na rede, se preciso).
        requireAdmin(payload.admin_token);
        const qrPath = String(payload.path || '').trim();
        if (!qrPath.startsWith('/') || /[\r\n]/.test(qrPath)) {
          throw new ApiError(422, 'Caminho inválido para o QR code.');
        }
        if (qrPath.length > 512) throw new ApiError(422, 'Caminho longo demais para o QR code.');
        const url = await qrAbsoluteUrl(String(payload.origin || ''), qrPath);
        const dataUrl = await QRCode.toDataURL(url, {
          width: 480,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#141833', light: '#ffffff' },
        });
        return { ok: true, url, data_url: dataUrl };
      }

      case 'arena_tv_token': {
        requireAdmin(payload.admin_token);
        if (!payload.room_id) throw new ApiError(422, 'Informe a sala para gerar o link de projeção.');
        const room = await roomById(String(payload.room_id));
        if (!room) throw new ApiError(404, 'Sala não encontrada para projeção.');
        // Sessao de 8h: reutiliza a token viva (botao idempotente) ou cria nova.
        const tokens = await tvTokensForRoom(room.id, timestamp);
        let token = Object.keys(tokens)[0];
        if (!token) {
          token = id();
          tokens[token] = timestamp + TV_TOKEN_TTL_SECONDS;
          await repositories.settings.set(tvTokenKey(room.id), { tokens }, timestamp);
        }
        const expiresAt = Math.max(...Object.values(tokens));
        // Codigo curto para a TV em outro aparelho (get-or-create, 8h).
        const tvCode = await tvCodeForRoom(room.id, timestamp);
        // URL limpa: so o PIN. O token vai no cookie Set-Cookie (camada HTTP).
        const url = `/tv.php?pin=${encodeURIComponent(room.pin || room.code)}`;
        return {
          ok: true,
          url,
          tv_token: token,
          tv_code: tvCode.code,
          tv_code_expires_at: tvCode.expiresAt,
          expires_at: expiresAt,
          max_age: Math.max(1, Math.floor(expiresAt - timestamp)),
          server_now: timestamp,
        };
      }

      case 'arena_join': {
        const ipKey = String(meta?.ip || 'unknown');
        const joinCheck = joinLimiter.check(ipKey);
        if (!joinCheck.allowed) {
          throw new ApiError(429, `Muitas tentativas com PIN incorreto. Aguarde ${joinCheck.retryAfter}s e tente novamente.`);
        }
        if (!(await arenaOpen())) throw new ApiError(409, 'A Arena está fechada no momento.');
        // Mensagens amigaveis para o aluno, em vez do generico "Revise os campos".
        if (typeof payload.code !== 'string' || payload.code.trim().length === 0) throw new ApiError(422, 'Digite o PIN da sala.');
        if (payload.code.trim().length < 4) throw new ApiError(422, 'PIN incompleto. Digite os 6 números da sala.');
        const rawCode = payload.code.trim().toUpperCase();
        const digits = normalizePin(rawCode);
        const code = digits.length === 6 ? digits : rawCode;
        if (typeof payload.name !== 'string' || payload.name.trim().length < 2) throw new ApiError(422, 'Digite seu nome (mínimo 2 letras).');
        if (payload.name.trim().length > 60) throw new ApiError(422, 'Seu nome pode ter no máximo 60 caracteres.');
        const name = payload.name.trim();
        const room = await repositories.arena.rooms.findByPinOrCode(code);
        if (!room) {
          joinLimiter.registerFailure(ipKey);
          // "com o professor" saiu: o kicker da mesma tela já diz que o código
          // vem dele, e a frase inteira cabia em duas linhas — o erro de duas
          // linhas obrigava a reservar 42px para a mensagem não empurrar o
          // formulário. Uma linha reserva 21px e o deslocamento zera.
          throw new ApiError(404, 'Sala não encontrada. Confira o PIN.');
        }
        joinLimiter.reset(ipKey);
        if (room.entryBlocked) throw new ApiError(409, 'Esta sala não está aceitando participantes no momento.');
        const roomRounds = await repositories.arena.rounds.listByRoom(room.id);
        if (!canJoinRoom(room, roomRounds, { rosterLocksAtStart: Boolean(room.settings?.rosterLocksAtStart) })) {
          throw new ApiError(409, 'Esta sala não está aceitando participantes no momento.');
        }
        const existing = await repositories.arena.participants.getByName(room.id, name);
        if (existing?.active) throw new ApiError(409, 'Nome já em uso nesta sala. Se for você, peça ao professor.');
        const capacity = roomCapacity(room);
        const active = await repositories.arena.participants.countActive(room.id);
        if (capacity > 0 && active >= capacity) {
          throw new ApiError(409, 'A sala atingiu o limite de participantes.');
        }
        const participantId = id();
        const token = id();
        // Alocacao atomica da estacao (transacao): 50 alunos chegando juntos
        // nao colidem mais na mesma estacao livre.
        const stationLimit = roomCapacity(room) > 0 ? Math.min(roomCapacity(room), 50) : 50;
        // Nome que sobra de um aluno JA removido (nao ha poda automatica: so o
        // professor remove): ele entra como participante NOVO e o registro
        // antigo e arquivado na MESMA transacao. Antes, nome+PIN devolvia o
        // registro antigo com token novo — quem digitasse o nome recebia o
        // e-mail, a empresa, o consentimento e os pontos de outro aluno.
        const allocation = existing
          ? await repositories.arena.participants.rejoin({
            id: participantId, retiredId: existing.id, roomId: room.id, name, token, limit: stationLimit, now: timestamp,
          })
          : await repositories.arena.participants.joinWithNextStation({
            id: participantId, roomId: room.id, name, token, limit: stationLimit, now: timestamp,
          });
        if (allocation.taken) throw new ApiError(409, 'Nome já em uso nesta sala. Se for você, peça ao professor.');
        if (allocation.full) throw new ApiError(409, 'A sala atingiu o limite de participantes.');
        return {
          ok: true,
          participant: { id: participantId, name, room: { id: room.id, code: room.code, pin: room.pin ?? room.code, title: room.title, preset: room.preset } },
          token,
          server_now: timestamp,
        };
      }

      case 'arena_lobby': {
        const participant = await participantSession(payload.participant_id, payload.token);
        await repositories.arena.participants.heartbeat({ id: participant.id, now: timestamp });
        let room = await roomById(participant.roomId);
        room = await advanceArena(room, timestamp);
        const lobby = await studentLobby(room, participant, timestamp);
        // A ESPERA é a única tela do aluno que oferece o caminho de entrada para
        // quem ainda não entrou (referência LA-02B: o código é a peça central,
        // com o QR ao lado).
        //
        // O QR é o MESMO da projeção — `entryQrForRoom`, já cacheado por
        // sala+URL, então o batimento de 2,5 s não regera PNG. Não é um segundo
        // gerador: o `arena_qr` do cliente não serve ao aluno porque exige
        // sessão de professor (`requireAdmin`), e o aluno não tem uma.
        //
        // Só na espera: com missão no ar o aluno não precisa do caminho de
        // entrada, e a resposta do batimento não carrega dado que ela não usa.
        //
        // ESTE CAMPO É O LADO SERVIDOR DA JORNADA DO ALUNO, cujo desenho e cujas
        // telas moram em `public/assets/css/aluno.css` (dona da espera com o
        // caminho de entrada e da leitura "Como funciona"). Se um dia entrar
        // mais dado privado de tela do aluno no `lobby`, ele entra aqui — e a
        // folha que pinta é aquela.
        if (!lobby.current_round && lobby.room.phase !== 'finished'
          && lobby.room.status !== 'ended' && lobby.room.status !== 'archived') {
          try {
            lobby.entry_qr = await entryQrForRoom(
              room.id, String(meta?.host || '').trim(), room.pin || room.code, meta?.protocol,
            );
          } catch {
            // QR é decorativo: sem ele a espera continua com o código, que é o
            // que o aluno realmente lê.
          }
        }
        return { ok: true, lobby, server_now: timestamp };
      }

      case 'arena_submit': {
        const participant = await participantSession(payload.participant_id, payload.token);
        await repositories.arena.participants.heartbeat({ id: participant.id, now: timestamp });
        const round = await repositories.arena.rounds.getById(String(payload.round_id));
        if (!round || round.roomId !== participant.roomId) throw new ApiError(404, 'Missão não encontrada.');
        const room = await roomById(round.roomId);
        const challenge = await repositories.arena.challenges.getById(round.challengeId);
        if (!challenge) throw new ApiError(503, 'Missao sem configuracao de avaliacao.');

        const existingAttempts = (await repositories.arena.submissions.listByRound(round.id))
          .filter((entry) => String(entry.participantId) === String(participant.id));
        const nextAttempt = existingAttempts.length + 1;
        const attempt = payload.attempt === undefined || payload.attempt === null || payload.attempt === ''
          ? nextAttempt
          : integer(payload.attempt, 'attempt', { min: 1, max: 3 });
        if (attempt !== 1) throw new ApiError(409, 'Esta missão aceita uma única resposta.');

        const promptMax = challenge.modality === 'essencial' ? 250 : 4000;
        const candidatePrompt = text(payload.prompt, 'prompt', { min: 3, max: promptMax });

        let submission = existingAttempts.find((entry) => entry.attempt === attempt);
        const existingScore = submission ? await repositories.arena.scores.getBySubmission(submission.id) : undefined;
        if (submission && submission.prompt !== candidatePrompt) {
          throw new ApiError(409, 'Uma resposta diferente ja foi enviada nesta tentativa.');
        }
        if (!submission) {
          if (!roundAcceptsSubmissions(round, timestamp)) throw new ApiError(409, 'O prazo desta missao terminou.');
          submission = await repositories.arena.submissions.create({
            id: id(), roomId: participant.roomId, participantId: participant.id,
            roundId: round.id, attempt, prompt: candidatePrompt, submittedAt: timestamp,
          });
        }

        // Avaliacao em voo, com prazo: quem responder primeiro decide o formato
        // da resposta. Nao existe caminho em que a nota se perca — o que muda e
        // se o aluno recebe a nota agora ou a confirmacao de que ela vem.
        const avaliacao = existingScore
          ? Promise.resolve({ result: existingScore })
          : avaliarSubmission({ round, room, challenge, participant, submission, timestamp });
        let vencedor;
        try {
          vencedor = await Promise.race([
            avaliacao.then((valor) => ({ concluida: true, valor })),
            new Promise((resolve) => {
              const timer = setTimeout(() => resolve({ concluida: false }), Math.max(0, submitWaitMs));
              timer.unref?.();
            }),
          ]);
        } catch (error) {
          // ESTACIONADA: o provedor nao entregou a nota agora, e a submissao
          // ficou no patio esperando o reprocessamento. A tela do aluno nao
          // recebe falha — nao houve falha dele, e a nota existe como promessa
          // cumprida ("aparece assim que responder"). Nenhuma nota heuristica
          // foi gravada, e a tentativa dele segue sem ser reaberta.
          if (error?.code !== 'judge_parked') throw error;
          onRoomChanged(participant.roomId);
          return {
            ok: true,
            pending: true,
            parked: true,
            reason: error.reason,
            submission_id: submission.id,
            attempt,
            room_id: participant.roomId,
            poll_after_ms: 2500,
            server_now: timestamp,
          };
        }

        if (!vencedor.concluida) {
          // Resposta PENDENTE: o envio foi aceito (a submissao ja existe, com id
          // e tentativa proprios) e a avaliacao continua em segundo plano — o
          // lugar na fila do provedor continua sendo esse. A tela do aluno ve a
          // nota pela consulta de estado (o lobby que ela ja faz a cada 2,5 s).
          avaliacao
            .then(async () => {
              const agora = now();
              if (await classicRoundComplete(room, round)) await closeOpenRound(room, agora);
              onRoomChanged(room.id);
            })
            .catch((error) => {
              // Falha de terceiro ja ficou registrada em arena_judge_attempts e
              // a nota continua ausente: a tela do aluno mostra "conferindo o
              // envio" e o mesmo envio pode ser repetido. O que nao pode e uma
              // promessa rejeitada solta derrubar o processo.
              log.warn('avaliacao_pendente_falhou', {
                submission_id: submission.id,
                error: { name: error?.name || 'Error', message: error?.message || String(error) },
              });
              // Mesmo falhando, o estado da sala mudou (ficou uma tentativa sem
              // nota): as telas devem refletir isso agora, nao no proximo poll.
              onRoomChanged(room.id);
            });
          return {
            ok: true,
            pending: true,
            submission_id: submission.id,
            attempt,
            room_id: participant.roomId,
            // Quanto a tela deve esperar antes de consultar de novo.
            poll_after_ms: 2500,
            server_now: timestamp,
          };
        }

        const { result } = vencedor.valor;

        // Regra classica: quando todo o roster ja enviou, a rodada fecha na hora
        // (nao espera o cronometro) e o placar abre para a turma.
        if (await classicRoundComplete(room, round)) {
          await closeOpenRound(room, timestamp);
        }

        const previous = attempt > 1
          ? await (async () => {
              const prior = existingAttempts.find((entry) => entry.attempt === attempt - 1);
              return prior ? repositories.arena.scores.getBySubmission(prior.id) : undefined;
            })()
          : undefined;

        // Salas classicas exibem pontos e posicao (metricas calculadas na sala).
        const classicScore = await repositories.arena.scores.getBySubmission(submission.id);

        return {
          ok: true,
          // Sala de origem do evento de tempo real: sem ela, todo envio da
          // turma acordaria a consulta de todas as salas.
          room_id: participant.roomId,
          submission: {
            id: submission.id,
            attempt,
            prompt: candidatePrompt,
            percent: result.percent,
            breakdown: result.breakdown,
            feedback: result.feedback,
            evolution: previous ? Math.round((result.percent - Number(previous.percent)) * 100) / 100 : null,
            points: classicScore?.points ?? null,
            position: classicScore?.position ?? null,
            model: result.metadata?.model,
          },
          server_now: timestamp,
        };
      }

      // ------------------------- admin -------------------------

      case 'arena_admin_status': {
        requireAdmin(payload.admin_token);
        const rooms = [];
        for (const room of (await repositories.arena.rooms.list())) {
          const participants = await repositories.arena.participants.listByRoom(room.id);
          const rounds = await repositories.arena.rounds.listByRoom(room.id);
          rooms.push({
            id: room.id, code: room.code, pin: room.pin ?? room.code, title: room.title,
            status: room.status, preset: room.preset,
            expected_players: room.expectedPlayers, entry_blocked: room.entryBlocked,
            settings: { ...(room.settings || {}) },
            // Contagem de missoes: a lista de salas precisa dizer o que a sala
            // ja tem configurado, antes de o professor abrir o detalhe.
            rounds_count: rounds.length,
            // Somente sala editavel pode ser aberta: so ela precisa do check.
            blockers: ['draft', 'waiting'].includes(room.status)
              ? (await roomReadiness(room, rounds)).blockers
              : [],
            participants: participants.filter((entry) => entry.active).length,
            connected: participants.filter((entry) => entry.active && timestamp - Number(entry.lastSeenAt) <= CONNECTED_WINDOW_SECONDS).length,
            created_at: room.createdAt,
            can_start: ['waiting', 'open', 'playing'].includes(room.status)
              && rounds.some((round) => round.status === 'pending')
              && !rounds.some((round) => ['open', 'submitting', 'judging', 'results'].includes(round.status))
              // Quem exige a sala cheia para comecar e `rosterLocksAtStart` (o
              // preset Classico, de 3 lugares fixos), NAO a familia do juiz. A
              // lista estava mais exigente que a acao: `arena_start_round`
              // sempre olhou esta bandeira, e aqui ela era ignorada -- numa sala
              // do preset Turma (judgeKind classico, cadastro livre) o botao de
              // iniciar desaparecia com 3 alunos de 35, e nada dizia por que.
              && (!isClassicRules(room) || !room.settings?.rosterLocksAtStart
                || participants.filter((person) => person.active).length === roomCapacity(room)),
          });
        }
        return {
          ok: true,
          open: (await arenaOpen()),
          rooms,
          challenges: (await repositories.arena.challenges.list()).length,
          server_now: timestamp,
        };
      }

      case 'arena_set_open': {
        requireAdmin(payload.admin_token);
        const open = Boolean(payload.open);
        await repositories.settings.set(ARENA_OPEN_KEY, open, timestamp);
        return { ok: true, open, server_now: timestamp };
      }

      case 'arena_create_room': {
        requireAdmin(payload.admin_token);
        const title = text(payload.title, 'title', { min: 2, max: 120 });
        const requestedPreset = String(payload.preset ?? 'personalizado').toLowerCase();
        if (!PRESETS[requestedPreset]) {
          throw new ApiError(422, 'Revise os campos enviados.', { preset: 'Preset inválido (classic, turma ou personalizado).' });
        }
        const presetKey = requestedPreset;
        // Regras classicas (classic/turma): o campo Participantes do form
        // (expected_players) define a capacidade. O classic trava em 3 pelo
        // preset; o turma respeita o valor enviado (antes era ignorado e a
        // sala nascia sempre com 35).
        const presetRules = PRESETS[presetKey].rules;
        const classicRules = presetRules.judgeKind === 'classic';
        const maxPlayersOverride = payload.max_players
          ?? (classicRules && payload.expected_players > 0 ? payload.expected_players : undefined);
        const settings = presetRoomSettings(presetKey, {
          maxPlayers: maxPlayersOverride,
          rounds: payload.rounds,
          roundDuration: payload.round_duration,
          resultsDuration: payload.results_duration,
          finalResultsDuration: payload.final_results_duration,
          // Configuracao inicial do modo Arena (so o preset arena a consome).
          arenaRounds: payload.arena_rounds,
          arenaBossHealth: payload.arena_boss_health,
          arenaDamageThreshold: payload.arena_damage_threshold,
          arenaAttacksPerRound: payload.arena_attacks_per_round,
          arenaTeams: payload.arena_teams,
          arenaPowers: payload.arena_powers,
          arenaDynamicsMode: payload.arena_dynamics_mode,
        });
        const expectedPlayers = classicRules
          ? settings.maxPlayers
          : integer(payload.expected_players ?? 0, 'expected_players', { min: 0, max: 50 });
        const pin = classicRules ? (await pinForNewRoom()) : null;
        const room = await repositories.arena.rooms.create({
          id: id(),
          code: pin || (await generateRoomCode()),
          pin,
          title,
          status: classicRules ? 'waiting' : 'draft',
          expectedPlayers,
          preset: presetKey,
          settings,
          now: timestamp,
        });
        if (classicRules) {
          // Preset classico: semeia as 3 rodadas oficiais e abre a sala (lobby).
          const roomRow = await repositories.arena.rooms.getById(room.id);
          const seeds = classicRoundsToChallenges(DEFAULT_ROUNDS, { modality: 'precisao' }).map((seed) => ({
            ...seed,
            durationSeconds: settings.roundDuration || null,
          }));
          await seedClassicRounds(roomRow, seeds, timestamp);
        }
        // A resposta devolve a LINHA da sala, e nao a vista: `pin: null` aqui e
        // o contrato (preset fora do classico nao tem PIN numerico — o codigo
        // alfabetico faz esse papel), e quem le escolhe `pin || code`.
        return { ok: true, room: (await repositories.arena.rooms.getById(room.id)), server_now: timestamp };
      }

      case 'arena_update_room': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        const updated = await repositories.arena.rooms.update({
          id: room.id,
          title: payload.title !== undefined ? text(payload.title, 'title', { min: 2, max: 120 }) : undefined,
          expectedPlayers: payload.expected_players !== undefined ? integer(payload.expected_players, 'expected_players', { min: 0, max: 50 }) : undefined,
          entryBlocked: payload.entry_blocked !== undefined ? Boolean(payload.entry_blocked) : undefined,
          now: timestamp,
        });
        return { ok: true, room: updated, server_now: timestamp };
      }

      case 'arena_delete_room': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (room.status !== 'draft' && room.status !== 'waiting' && room.status !== 'archived') {
          throw new ApiError(409, 'Encerre e arquive a sala antes de excluir.');
        }
        await repositories.arena.rooms.delete(room.id);
        await forgetRoomSettings(room.id, timestamp);
        return { ok: true, server_now: timestamp };
      }

      case 'arena_publish_room': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        const rounds = await repositories.arena.rounds.listByRoom(room.id);
        if (rounds.length === 0) throw new ApiError(409, 'Adicione ao menos uma missao antes de abrir a sala.');
        // Missao sem gabarito pontua no vazio e missao visual sem imagem deixa o
        // aluno sem referencia: a sala so abre depois de corrigir o que falta.
        const readiness = await roomReadiness(room, rounds);
        if (readiness.blockers.length) {
          throw new ApiError(409, readiness.message, { blockers: readiness.blockers });
        }
        const target = nextRoomStatus(room.status, 'waiting');
        const updated = await repositories.arena.rooms.updateStatus({ id: room.id, status: target, now: timestamp });
        return { ok: true, room: (await adminRoomDetail(updated, timestamp)), server_now: timestamp };
      }

      case 'arena_room_detail': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        return { ok: true, detail: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      /**
       * Previa da sala para o professor: cada missao montada exatamente como o
       * aluno a recebe (missionView), mais o que ele ve DEPOIS de responder
       * (nota/feedback) e no fim da sala (resultado por missao, classificacao e
       * destaques). Nada aqui altera a sala — e so a leitura do que vai ser
       * projetado; nenhuma submissao, nota ou participante e criado.
       *
       * Telas de fim dependem de pontuacao que uma sala em rascunho nao tem:
       * quando a turma ainda nao respondeu, ela vai de amostra (inventada) e o
       * painel avisa. Com qualquer resposta real, tudo passa a vir dela.
       */
      case 'arena_room_preview': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        const rounds = await repositories.arena.rounds.listByRoom(room.id);
        const judgeKind = isClassicRules(room) ? 'classic' : 'criteria';
        const participants = (await repositories.arena.participants.listByRoom(room.id)).filter((entry) => entry.active);

        // Ponto de vista das telas de fim: quem mais respondeu (e o que mais tem
        // o que mostrar). Sem resposta nenhuma, nao ha ponto de vista.
        const student = await previewStudent(participants, rounds);
        const real = Boolean(student);
        const studentView = real ? await studentLobby(room, student, timestamp) : null;

        const missions = [];
        for (const round of rounds) {
          const challenge = await repositories.arena.challenges.getById(round.challengeId);
          const realScores = real
            ? (studentView.rounds.find((entry) => String(entry.id) === String(round.id))?.my_scores || [])
            : [];
          missions.push({
            ...missionView({ round, challenge, judgeKind, myScores: [], mySubmissions: [], timestamp }),
            // O professor precisa ver também o que ainda trava a sala.
            missing: missionIssues(challenge),
            // E qual texto o juiz vai usar como régua — nunca vai para a tela
            // do aluno, só existe aqui, no payload administrativo.
            judge_reference: judgeKind === 'classic'
              ? (challenge?.referencePrompt ?? '')
              : (challenge?.referenceText?.trim() || challenge?.expectedResult || ''),
            // O que a tela de resultado mostraria logo apos o envio. Fica fora
            // de my_scores de proposito: o passo "Missao" continua limpo, sem
            // nota que ninguem tirou.
            preview_scores: realScores.length ? realScores : previewSampleScores(challenge),
            result_sample: !realScores.length,
          });
        }
        const sample = previewSampleEnd(missions);
        const end = real
          ? {
            sample: false,
            player: student.name,
            results: studentView.results,
            ranking: studentView.ranking,
            highlights: studentView.highlights,
          }
          : { sample: true, player: '', ...sample };

        return {
          ok: true,
          room: {
            id: room.id,
            title: room.title,
            pin: room.pin ?? room.code,
            preset: room.preset,
            status: room.status,
            judge_kind: judgeKind,
            total_rounds: rounds.length,
            revision: roomRevision(room),
          },
          missions,
          end,
          // Quanto tempo de aula as missoes somam (e quantas nao tem cronometro).
          timing: roomTiming(missions),
          server_now: timestamp,
        };
      }

      case 'arena_start_round': {
        requireAdmin(payload.admin_token);
        let room = await roomById(payload.room_id);
        if (room.status !== 'waiting' && room.status !== 'open' && room.status !== 'playing') {
          throw new ApiError(409, 'Sala nao esta pronta para iniciar missao.');
        }
        const rounds = await repositories.arena.rounds.listByRoom(room.id);
        const pending = rounds.find((entry) => entry.status === 'pending');
        if (rounds.some((entry) => ['open', 'submitting', 'judging', 'results'].includes(entry.status))) {
          throw new ApiError(409, 'Conclua a rodada atual e seus resultados antes de iniciar outra missão.');
        }
        if (!pending) throw new ApiError(409, 'Nenhuma missao pendente.');
        const readiness = await roomReadiness(room, rounds);
        if (readiness.blockers.length) {
          throw new ApiError(409, readiness.message, { blockers: readiness.blockers });
        }
        // Regra classica preservada: a partida so comeca com a sala completa e
        // quem inicia e sempre o professor — nunca automaticamente.
        if (isClassicRules(room) && room.settings?.rosterLocksAtStart) {
          const active = await repositories.arena.participants.countActive(room.id);
          const required = roomCapacity(room);
          if (active < required) {
            throw new ApiError(409, `Aguardando o cadastro dos ${required} jogadores.`);
          }
          if (active > required) {
            throw new ApiError(409, 'A sala atingiu o limite de participantes.');
          }
        }
        const challenge = await repositories.arena.challenges.getById(pending.challengeId);
        await openRound(room, pending, challenge, timestamp);
        room = await repositories.arena.rooms.getById(room.id);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      case 'arena_end_round': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        await closeOpenRound(room, timestamp);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      case 'arena_pause_round': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        const rounds = await repositories.arena.rounds.listByRoom(room.id);
        const open = rounds.find((entry) => entry.status === 'open');
        if (!open) throw new ApiError(409, 'Nenhuma missao aberta para pausar.');
        if (Number.isFinite(open.pausedAt)) throw new ApiError(409, 'A missao ja esta pausada.');
        await repositories.arena.rounds.setPaused({ id: open.id, pausedAt: timestamp, now: timestamp });
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      case 'arena_resume_round': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        const rounds = await repositories.arena.rounds.listByRoom(room.id);
        const open = rounds.find((entry) => entry.status === 'open');
        if (!open) throw new ApiError(409, 'Nenhuma missao pausada para retomar.');
        if (!Number.isFinite(open.pausedAt)) throw new ApiError(409, 'A missao nao esta pausada.');
        await repositories.arena.rounds.resume({ id: open.id, pausedAt: Number(open.pausedAt), now: timestamp });
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      case 'arena_close_round': {
        requireAdmin(payload.admin_token);
        let room = await roomById(payload.room_id);
        const rounds = await repositories.arena.rounds.listByRoom(room.id);
        const resultsRounds = rounds.filter((entry) => entry.status === 'results');
        if (!resultsRounds.length) throw new ApiError(409, 'Nenhuma rodada em exibicao de resultados.');
        for (const entry of resultsRounds) {
          await repositories.arena.rounds.updateStatus({ id: entry.id, status: 'closed', now: timestamp, endedAt: timestamp });
        }
        const allClosed = (await repositories.arena.rounds.listByRoom(room.id)).every((entry) => entry.status === 'closed');
        if (allClosed && room.status !== 'ended') {
          room = await repositories.arena.rooms.updateStatus({ id: room.id, status: 'ended', now: timestamp, endedAt: timestamp });
        }
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      case 'arena_end_room': {
        requireAdmin(payload.admin_token);
        let room = await roomById(payload.room_id);
        await closeOpenRound(room, timestamp);
        room = await repositories.arena.rooms.updateStatus({ id: room.id, status: 'ended', now: timestamp, endedAt: timestamp });
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      case 'arena_archive_room': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        const target = nextRoomStatus(room.status, 'archived');
        const updated = await repositories.arena.rooms.updateStatus({ id: room.id, status: target, now: timestamp });
        return { ok: true, room: updated, server_now: timestamp };
      }

      /**
       * NOVA BATALHA NESTA SALA.
       *
       * O professor repete a aula na MESMA sala: mesmo codigo/PIN, mesmo preset,
       * mesma configuracao e as mesmas missoes, na mesma ordem. O que zera e o
       * JOGO — tentativas e pontuacao —, e o que fica e o HISTORICO: o ciclo
       * anterior continua no banco com os envios, as notas e as tentativas de
       * juiz presos as rodadas dele (que viraram `closed`), e o relatorio o le
       * como uma batalha a parte.
       *
       * Como nasce o ciclo novo: as rodadas do ciclo corrente sao CLONADAS como
       * `pending` (ids novos — e por isso nenhuma nota antiga pode ser confundida
       * com uma nota desta batalha) e a sala volta a `open`, que e o estado de
       * espera do professor. Nada e apagado em nenhum caminho.
       *
       * `cycle` no payload e o que o painel viu: um segundo clique (ou um painel
       * desatualizado) nao cria um terceiro ciclo — ele recebe `already`.
       */
      case 'arena_new_battle': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (room.status === 'draft') throw new ApiError(409, 'Esta sala ainda está em rascunho: publique e jogue a primeira batalha antes de repeti-la.');
        if (room.status === 'archived') throw new ApiError(409, 'Esta sala está arquivada. Desarquivar não é possível: crie uma sala nova com as mesmas missões.');
        // A maquina de estados e quem diz o alvo; aqui so confirmamos que ele e
        // `open` (a volta da batalha, declarada em arena-state.mjs).
        nextRoomStatus(room.status, 'open');
        const rounds = await repositories.arena.rounds.listByRoom(room.id);
        if (rounds.length === 0) throw new ApiError(409, 'Esta sala ainda não tem missões para jogar.');
        const current = roomCycle(room);
        if (payload.cycle !== undefined && payload.cycle !== null && payload.cycle !== '') {
          const visto = integer(payload.cycle, 'cycle', { min: 1, max: 9999 });
          if (visto !== current) {
            return { ok: true, already: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
          }
        }
        if (!rounds.some((entry) => entry.status !== 'pending')) {
          throw new ApiError(409, 'Esta sala ainda não tem uma batalha para repetir.');
        }
        // Fecha a batalha que estiver no ar pela MESMA porta do professor
        // (`arena_close_round`): quem nao enviou recebe o zero do tempo esgotado
        // e o classico recalcula pontos e posicao. Repetir a batalha nao pode
        // deixar a antiga pela metade.
        await closeOpenRound(room, timestamp);
        for (const entry of await repositories.arena.rounds.listByRoom(room.id)) {
          if (entry.status === 'pending' || entry.status === 'closed') continue;
          await repositories.arena.rounds.updateStatus({ id: entry.id, status: 'closed', now: timestamp, endedAt: timestamp });
        }
        // Os alunos: manter a turma (padrao) ou liberar a sala para a proxima.
        const keepParticipants = payload.keep_participants === undefined
          ? true : Boolean(payload.keep_participants);
        if (!keepParticipants) {
          await repositories.arena.participants.deactivateAll({ roomId: room.id, now: timestamp });
        }
        // Sorteio da vez e estado coletivo do Modo Arena (Boss, energia, votos,
        // dinamicas) sao DA BATALHA, nao da sala. Os tokens da TV ficam: a
        // projecao e a mesma sala, e o telao nao deve pedir codigo de novo no
        // meio da aula.
        await repositories.settings.delete(drawKey(room.id));
        await repositories.settings.delete(arenaModeKey(room.id));
        const clone = await repositories.arena.rounds.cloneForNewCycle({ roomId: room.id, now: timestamp });
        onRoomChanged(room.id);
        return {
          ok: true,
          already: false,
          battle: { cycle: clone.cycle, rounds: clone.rounds.length },
          room: (await adminRoomDetail(clone.room ?? room, timestamp)),
          server_now: timestamp,
        };
      }

      case 'arena_add_round': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!canEditRounds(room)) {
          throw new ApiError(409, 'A sala classica tem as 3 rodadas oficiais fixas; use o preset Personalizado para escolher missoes.');
        }
        if (room.status !== 'draft' && room.status !== 'waiting') {
          throw new ApiError(409, 'A sala ja esta em jogo; nao e possivel adicionar missao.');
        }
        const challenge = await repositories.arena.challenges.getById(String(payload.challenge_id));
        if (!challenge) throw new ApiError(404, 'Desafio nao encontrado.');
        const rounds = await repositories.arena.rounds.listByRoom(room.id);
        const round = await repositories.arena.rounds.add({
          id: id(), roomId: room.id, cycle: roomCycle(room), position: rounds.length + 1,
          challengeId: challenge.id, modality: challenge.modality, now: timestamp,
        });
        return { ok: true, round, server_now: timestamp };
      }

      case 'arena_remove_round': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!canEditRounds(room)) {
          throw new ApiError(409, 'A sala classica tem as 3 rodadas oficiais fixas; use o preset Personalizado para escolher missoes.');
        }
        if (room.status !== 'draft' && room.status !== 'waiting') {
          throw new ApiError(409, 'A sala ja esta em jogo; nao e possivel remover missao.');
        }
        const round = await repositories.arena.rounds.getById(String(payload.round_id));
        if (!round || round.roomId !== room.id) throw new ApiError(404, 'Missão não encontrada nesta sala.');
        await repositories.arena.rounds.remove(round.id);
        return { ok: true, server_now: timestamp };
      }

      case 'arena_reorder_rounds': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!canEditRounds(room)) {
          throw new ApiError(409, 'A sala classica tem as 3 rodadas oficiais fixas; use o preset Personalizado para escolher missoes.');
        }
        if (room.status !== 'draft' && room.status !== 'waiting') {
          throw new ApiError(409, 'A sala ja esta em jogo; nao e possivel reordenar missoes.');
        }
        const positions = Array.isArray(payload.positions)
          ? payload.positions.map((entry) => String(entry))
          : [];
        if (!positions.length) throw new ApiError(422, 'Revise os campos enviados.', { positions: 'Lista de missoes invalida.' });
        const rounds = await repositories.arena.rounds.listByRoom(room.id);
        if (positions.length !== rounds.length || new Set(positions).size !== rounds.length
          || rounds.some((round) => !positions.includes(round.id))) {
          throw new ApiError(422, 'Informe todas as missões da sala, sem repetições.');
        }
        await repositories.arena.rounds.reorder({ roomId: room.id, positions });
        return { ok: true, server_now: timestamp };
      }

      case 'arena_save_challenge': {
        requireAdmin(payload.admin_token);
        const data = validateChallengePayload(payload);
        const challengeId = payload.challenge_id ? String(payload.challenge_id) : id();
        const existing = payload.challenge_id ? await repositories.arena.challenges.getById(challengeId) : undefined;
        const saved = await repositories.arena.challenges.save({
          id: challengeId, now: timestamp, ...data,
          judgeKind: existing?.judgeKind || 'criteria',
          referencePrompt: existing?.referencePrompt || '',
          rubric: existing?.rubric || '',
        });
        return { ok: true, challenge: saved, server_now: timestamp };
      }

      /**
       * Tempo das missoes da sala: aceita (ou ajusta) as sugestoes de duracao de
       * uma vez. O tempo pertence ao DESAFIO, entao aqui so a duracao muda — texto,
       * imagem e criterios ficam intactos, e o desafio que outra sala tambem usa
       * passa a ter o novo tempo la (o painel avisa antes).
       *
       * Como o lote das pendencias, valida tudo antes de gravar e escreve numa
       * transacao: ou entram todos os tempos, ou nenhum.
       */
      case 'arena_set_round_times': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!canEditRounds(room)) {
          throw new ApiError(409, 'A sala classica tem as 3 rodadas oficiais com tempo fixo; use o preset Personalizado para ajustar tempos.');
        }
        if (room.status !== 'draft' && room.status !== 'waiting') {
          throw new ApiError(409, 'A sala ja esta em jogo; ajuste de tempo so antes de abrir.');
        }
        const list = Array.isArray(payload.times) ? payload.times : [];
        if (!list.length) throw new ApiError(422, 'Nenhum tempo para salvar.', { times: 'Envie ao menos uma missao.' });
        if (list.length > MAX_BATCH_CHALLENGES) {
          throw new ApiError(422, `Salve no maximo ${MAX_BATCH_CHALLENGES} tempos de uma vez.`, { times: 'Lote grande demais.' });
        }
        const roomRounds = await repositories.arena.rounds.listByRoom(room.id);
        const inRoom = new Set(roomRounds.map((round) => String(round.challengeId)));
        const problems = {};
        const prepared = [];
        list.forEach((entry, index) => {
          try {
            const challengeId = text(entry?.challenge_id ?? '', `times.${index}.challenge_id`, { min: 1, max: 80 });
            if (!inRoom.has(challengeId)) {
              throw new ApiError(422, 'Revise os campos enviados.', { challenge_id: 'Esta missao nao pertence a sala.' });
            }
            let durationSeconds = null;
            if (entry?.duration_seconds !== undefined && entry?.duration_seconds !== null && entry?.duration_seconds !== '') {
              durationSeconds = integer(entry.duration_seconds, `times.${index}.duration_seconds`, { min: 15, max: 3600 });
            }
            prepared.push({ id: challengeId, durationSeconds });
          } catch (error) {
            const details = error?.details && Object.keys(error.details).length ? error.details : { duration_seconds: 'Revise o tempo.' };
            for (const [field, message] of Object.entries(details)) {
              problems[`times.${index}.${field}`] = message;
            }
          }
        });
        if (Object.keys(problems).length) {
          throw new ApiError(422, 'Revise os tempos enviados — nada foi salvo.', problems);
        }
        await repositories.arena.challenges.setDurations({ entries: prepared, now: timestamp });
        // O total da sala e lido do banco depois da gravacao (nao do que foi
        // enviado): se algo nao entrou, o numero na tela diz a verdade.
        const after = [];
        for (const round of await repositories.arena.rounds.listByRoom(room.id)) {
          const challenge = await repositories.arena.challenges.getById(round.challengeId);
          after.push({ duration_seconds: challenge?.durationSeconds ?? null });
        }
        return {
          ok: true,
          count: prepared.length,
          applied: prepared.map((entry) => ({ challenge_id: entry.id, duration_seconds: entry.durationSeconds })),
          timing: roomTiming(after),
          detail: await adminRoomDetail(room, timestamp),
          server_now: timestamp,
        };
      }

      /**
       * Lote da tela unica das pendencias da sala: todos os desafios numa
       * transacao so. Valida tudo antes de gravar, entao ou entra o lote
       * inteiro ou nada muda — queda de rede no meio nao deixa a sala
       * meio corrigida.
       */
      case 'arena_save_challenges': {
        requireAdmin(payload.admin_token);
        const list = Array.isArray(payload.challenges) ? payload.challenges : [];
        if (!list.length) throw new ApiError(422, 'Nenhuma missão para salvar.', { challenges: 'Envie ao menos uma missão.' });
        if (list.length > MAX_BATCH_CHALLENGES) {
          throw new ApiError(422, `Salve no máximo ${MAX_BATCH_CHALLENGES} missões de uma vez.`, { challenges: 'Lote grande demais.' });
        }
        const problems = {};
        const prepared = [];
        list.forEach((entry, index) => {
          const challengeId = entry?.challenge_id ? String(entry.challenge_id) : id();
          try {
            const data = validateChallengePayload(entry || {});
            prepared.push({ challengeId, data });
          } catch (error) {
            const details = error?.details && Object.keys(error.details).length ? error.details : { fields: 'Revise os campos.' };
            for (const [field, message] of Object.entries(details)) {
              problems[`challenges.${index}.${field}`] = message;
            }
          }
        });
        if (Object.keys(problems).length) {
          throw new ApiError(422, 'Revise os campos enviados — nada foi salvo.', problems);
        }
        const existing = [];
        for (const item of prepared) {
          existing.push(await repositories.arena.challenges.getById(item.challengeId));
        }
        const saved = await repositories.arena.challenges.saveMany(prepared.map((item, index) => ({
          id: item.challengeId, now: timestamp, ...item.data,
          judgeKind: existing[index]?.judgeKind || 'criteria',
          referencePrompt: existing[index]?.referencePrompt || '',
          rubric: existing[index]?.rubric || '',
        })));
        return { ok: true, challenges: saved, count: saved.length, server_now: timestamp };
      }

      case 'arena_duplicate_challenge': {
        requireAdmin(payload.admin_token);
        const source = await repositories.arena.challenges.getById(String(payload.challenge_id));
        if (!source) throw new ApiError(404, 'Desafio nao encontrado.');
        const saved = await repositories.arena.challenges.save({
          id: id(), now: timestamp,
          title: `${source.title} (copia)`,
          modality: source.modality,
          mission: source.mission,
          context: source.context,
          referenceText: source.referenceText,
          referenceImage: source.referenceImage,
          expectedResult: source.expectedResult,
          attempts: source.attempts,
          durationSeconds: source.durationSeconds,
          speedWeight: source.speedWeight,
          category: source.category,
          judgeKind: source.judgeKind || 'criteria',
          referencePrompt: source.referencePrompt || '',
          rubric: source.rubric || '',
          criteria: source.criteria,
        });
        return { ok: true, challenge: saved, server_now: timestamp };
      }

      case 'arena_delete_challenge': {
        requireAdmin(payload.admin_token);
        const challengeId = String(payload.challenge_id);
        const challenge = await repositories.arena.challenges.getById(challengeId);
        if (!challenge) throw new ApiError(404, 'Desafio nao encontrado.');
        const rooms = await repositories.arena.rooms.list();
        for (const room of rooms) {
          const rounds = await repositories.arena.rounds.listByRoom(room.id);
          if (rounds.some((entry) => entry.challengeId === challengeId)) {
            throw new ApiError(409, 'Desafio em uso por uma sala. Remova-o das salas antes de excluir.');
          }
        }
        await repositories.arena.challenges.delete(challengeId);
        return { ok: true, server_now: timestamp };
      }

      case 'arena_list_challenges': {
        requireAdmin(payload.admin_token);
        const challenges = await repositories.arena.challenges.list();
        return { ok: true, challenges, server_now: timestamp };
      }

      case 'arena_list_lessons': {
        requireAdmin(payload.admin_token);
        return {
          ok: true,
          lessons: LESSONS.map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            focus: lesson.focus,
            icon: lesson.icon,
            challenges: lesson.challenges.map((challenge) => ({
              title: challenge.title,
              modality: challenge.modality,
            })),
          })),
          server_now: timestamp,
        };
      }

      case 'arena_add_lesson': {
        requireAdmin(payload.admin_token);
        const lesson = getLesson(String(payload.lesson_id || ''));
        if (!lesson) throw new ApiError(404, 'Aula não encontrada no catálogo.');
        let room = undefined;
        if (payload.room_id) {
          room = await roomById(payload.room_id);
          if (!canEditRounds(room)) {
            throw new ApiError(409, 'A sala classica tem as 3 rodadas oficiais fixas; use o preset Personalizado para escolher missoes.');
          }
          if (room.status !== 'draft' && room.status !== 'waiting') {
            throw new ApiError(409, 'Adicione as missoes da aula antes de iniciar a sala.');
          }
        }
        const created = [];
        const addedRounds = [];
        // Reusa o desafio canonico ja existente no banco (por titulo), em vez
        // de duplicar o mesmo desafio a cada vez que a aula e adicionada.
        const bank = await repositories.arena.challenges.list();
        const canonicalByTitle = new Map(bank.map((challenge) => [challenge.title, challenge]));
        for (const spec of lesson.challenges) {
          const data = validateChallengePayload(spec);
          const canonical = canonicalByTitle.get(data.title);
          const challenge = canonical || await repositories.arena.challenges.save({
            id: id(), now: timestamp, ...data,
          });
          created.push(challenge);
          if (room) {
            const rounds = await repositories.arena.rounds.listByRoom(room.id);
            const round = await repositories.arena.rounds.add({
              id: id(), roomId: room.id, cycle: roomCycle(room), position: rounds.length + 1,
              challengeId: challenge.id, modality: challenge.modality, now: timestamp,
            });
            addedRounds.push(round);
          }
        }
        return {
          ok: true,
          lesson: { id: lesson.id, title: lesson.title, count: lesson.challenges.length },
          created,
          rounds: room ? addedRounds : null,
          server_now: timestamp,
        };
      }

      case 'arena_set_profile': {
        // Perfil opcional pos-entrada (e-mail, cargo, empresa, LGPD) para salas
        // cujos relatorios usam esses campos — nunca bloqueia o jogo.
        const participant = await participantSession(payload.participant_id, payload.token);
        const provided = ['email', 'role', 'company', 'consent'].some((key) => payload[key] !== undefined);
        if (!provided) throw new ApiError(422, 'Envie ao menos um campo de perfil.');
        const email = payload.email === undefined ? participant.email : text(String(payload.email), 'email', { max: 254 });
        const role = payload.role === undefined ? participant.role : text(String(payload.role), 'role', { max: 120 });
        const company = payload.company === undefined ? participant.company : text(String(payload.company), 'company', { max: 160 });
        const consent = payload.consent === undefined ? Boolean(participant.consent) : Boolean(payload.consent);
        const updated = await repositories.arena.participants.setProfile({
          id: participant.id, email, role, company, consent, now: timestamp,
        });
        return {
          ok: true,
          profile: {
            email: updated.email, role: updated.role, company: updated.company, consent: updated.consent,
          },
          server_now: timestamp,
        };
      }

      case 'arena_remove_participant': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        const participant = await repositories.arena.participants.getById(String(payload.participant_id));
        if (!participant || participant.roomId !== room.id) throw new ApiError(404, 'Participante nao encontrado.');
        await repositories.arena.participants.remove({ id: participant.id, now: timestamp });
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      case 'arena_rename_participant': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        const name = text(payload.name, 'name', { min: 2, max: 60 });
        const participant = await repositories.arena.participants.getById(String(payload.participant_id));
        if (!participant || participant.roomId !== room.id) throw new ApiError(404, 'Participante nao encontrado.');
        try {
          await repositories.arena.participants.rename({ id: participant.id, name, now: timestamp });
        } catch (error) {
          if (/UNIQUE/i.test(String(error?.message))) {
            throw new ApiError(409, 'Ja existe um participante com este nome.');
          }
          throw error;
        }
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      /**
       * Sorteio da vez — quem joga agora. Servidor guarda o estado por sala para
       * o professor recarregar a pagina (ou abrir em outro aparelho) sem perder
       * o sorteio. Trocar de modelo com sorteio em andamento recomeca: um modelo
       * nao vira o outro, e isso e avisado na tela antes de trocar.
       */
      case 'arena_draw_setup': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        const activeIds = await drawRoster(room.id);
        const mode = String(payload.mode ?? '').toLowerCase();
        if (!isDrawMode(mode)) throw new ApiError(422, 'Escolha o sorteio livre ou o mata-mata.', { mode: 'Modo de sorteio invalido.' });
        const groupSize = integer(payload.group_size ?? DRAW_GROUP_DEFAULT, 'group_size', { min: DRAW_GROUP_MIN, max: DRAW_GROUP_MAX });
        await trocarSorteio(room.id, activeIds, (stored) => ({
          estado: (Boolean(payload.reset) || stored.mode !== mode)
            ? startDraw(activeIds, { mode, groupSize })
            : { ...stored, groupSize },
        }), timestamp);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      case 'arena_draw_next': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        const activeIds = await drawRoster(room.id);
        await trocarSorteio(room.id, activeIds, (stored) => ({
          estado: runDraw(() => drawNext(stored, activeIds, { at: timestamp })),
        }), timestamp);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      case 'arena_draw_settle': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        const activeIds = await drawRoster(room.id);
        const vencedor = String(payload.winner_id ?? '');
        await trocarSorteio(room.id, activeIds, (stored) => ({
          estado: runDraw(() => settleDraw(stored, vencedor, { at: timestamp })),
        }), timestamp);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      case 'arena_draw_reset': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        const activeIds = await drawRoster(room.id);
        await trocarSorteio(room.id, activeIds, (stored) => ({
          estado: startDraw(activeIds, { mode: stored.mode, groupSize: stored.groupSize }),
        }), timestamp);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      // ---------------------------------------------------------------------
      // ARENA — Turma vs. Juiz
      //
      // A sala so entra aqui quando o preset declara `gameMode: 'arena'`.
      // Nenhuma destas acoes existe no Modo Classico, e nenhuma delas altera o
      // motor: elas leem envios e notas que o motor ja produziu e guardam o
      // que e proprio do modo (Boss, energia, competidores, dinamicas).
      // ---------------------------------------------------------------------

      /** Configuracao do modo (rodadas, corações, corte de dano, times, poderes). */
      case 'arena_mode_configure': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!isArenaRoom(room)) throw new ApiError(409, 'Esta sala nao esta no modo Arena.');
        await trocarModoArena(room, (stored) => {
          const config = arenaConfig({
            rounds: payload.rounds ?? stored.config.rounds,
            bossMaxHealth: payload.boss_max_health ?? stored.config.bossMaxHealth,
            damageThreshold: payload.damage_threshold ?? stored.config.damageThreshold,
            attacksPerRound: payload.attacks_per_round ?? stored.config.attacksPerRound,
            dynamicsMode: payload.dynamics_mode ?? stored.config.dynamicsMode,
            teams: payload.teams ?? stored.config.teams,
            powers: payload.powers ?? stored.config.powers,
          });
          // Mudar o tamanho da partida com jogo em andamento so vale numa partida
          // nova: reescrever a vida do Boss no meio da aula apagaria o que a
          // turma ja conquistou.
          const running = stored.rounds.length > 0 || stored.attacks.length > 0;
          return {
            estado: running
              ? { ...stored, config: { ...stored.config, damageThreshold: config.damageThreshold, dynamicsMode: config.dynamicsMode, teams: config.teams, powers: config.powers } }
              : { ...stored, config },
          };
        }, timestamp);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      /** Zera a partida (Boss cheio, energia zero, ninguem competiu). */
      case 'arena_mode_reset': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!isArenaRoom(room)) throw new ApiError(409, 'Esta sala nao esta no modo Arena.');
        // Zera de proposito: a transformacao ignora o estado lido, mas ainda
        // passa pelo compare-and-swap para nao gravar em cima de quem acabou de
        // mudar a sala (a releitura so refaz a conta).
        await trocarModoArena(room, (stored) => ({
          estado: emptyArenaState(stored?.config || arenaConfigOf(room)),
        }), timestamp);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      /**
       * Sorteia os competidores da rodada (rotacao: quem ainda nao competiu tem
       * prioridade) e, quando o plano pede, monta o Wild Card. E aqui que a
       * fase sai de 'mission' para 'wildcard' ou 'arena'.
       */
      case 'arena_mode_draw': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!isArenaRoom(room)) throw new ApiError(409, 'Esta sala nao esta no modo Arena.');
        await trocarModoArena(room, async (state) => {
          const round = await arenaRoundFor(room, state.round);
          if (!round) throw new ApiError(409, 'Esta rodada da Arena nao existe mais na sala.');
          const prompts = await roundPrompts(round);
          const eligible = prompts.map((entry) => entry.participant_id);
          const plan = competitorPlan(state.round, state.config,
            payload.wildcard === undefined ? undefined : Boolean(payload.wildcard));
          if (eligible.length < 3) {
            throw new ApiError(409, 'A Arena precisa de pelo menos 3 prompts enviados nesta rodada.', { eligible: eligible.length });
          }
          const drawn = pickCompetitors(state, eligible, { count: plan.drawn });
          let next = {
            ...state,
            competitors: { ...state.competitors, ids: drawn, sources: drawn.map(() => 'draw'), wildcard: null },
          };
          // A rotação vale também para o Wild Card: quem ainda não competiu entra
          // na frente. Só quando não há gente nova suficiente o balaio abre para
          // quem já jogou — assim a vez de todos chega dentro das 3 rodadas.
          const fresh = prompts.filter((entry) => !state.competed.includes(entry.participant_id));
          const candidatos = fresh.length >= 3 ? fresh : [...fresh, ...prompts.filter((entry) => !fresh.includes(entry))];
          if (plan.wildcard) {
            next = { ...next, phase: 'wildcard', competitors: { ...next.competitors, wildcard: buildWildcard(next, candidatos, { at: timestamp }) } };
          } else {
            next = runArena(() => setCompetitors(next, drawn, { at: timestamp }));
          }
          return { estado: next };
        }, timestamp);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      /** Fecha o Wild Card: o prompt mais votado ocupa a terceira vaga. */
      case 'arena_mode_wildcard_close': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!isArenaRoom(room)) throw new ApiError(409, 'Esta sala nao esta no modo Arena.');
        await trocarModoArena(room, (state) => {
          if (!state.competitors.wildcard) throw new ApiError(409, 'Nao ha Wild Card aberto nesta rodada.');
          // O Wild Card escolheu quem entra em campo: a rodada vira Arena.
          return { estado: runArena(() => ({ ...settleWildcard(state, { at: timestamp }), phase: 'arena' })) };
        }, timestamp);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      /**
       * Voto do aluno: Wild Card (quem entra na Arena) ou desafio coletivo.
       * A fase decide qual dos dois — o aluno nunca precisa saber disso.
       */
      case 'arena_mode_vote': {
        const participant = await participantSession(payload.participant_id, payload.token);
        await repositories.arena.participants.heartbeat({ id: participant.id, now: timestamp });
        const room = await roomById(participant.roomId);
        if (!isArenaRoom(room)) throw new ApiError(409, 'Esta sala nao esta no modo Arena.');
        const choice = text(payload.choice, 'choice', { min: 1, max: 60 });
        // Duas escritas (voto e confianca) viraram uma: o estado gravado e o
        // resultado das duas transformacoes aplicadas na mesma leitura.
        const resultado = await trocarModoArena(room, (state) => {
          if (state.competitors.wildcard && !state.competitors.wildcard.revealed && state.phase === 'wildcard') {
            return { estado: runArena(() => voteWildcard(state, participant.id, choice)), voto: 'wildcard' };
          }
          if (state.dynamic && !state.dynamic.revealed_at) {
            const next = runArena(() => voteDynamic(state, participant.id, choice, { at: timestamp }));
            if (payload.confidence === undefined) return { estado: next, voto: 'dynamic' };
            return {
              estado: runArena(() => voteConfidence(next, participant.id, String(payload.confidence), { at: timestamp })),
              voto: 'dynamic',
            };
          }
          throw new ApiError(409, 'Nada para votar agora.');
        }, timestamp);
        if (resultado.voto === 'wildcard') return { ok: true, voted: 'wildcard', choice, server_now: timestamp };
        if (payload.confidence !== undefined) {
          return { ok: true, voted: 'dynamic', choice, confidence: String(payload.confidence), server_now: timestamp };
        }
        return { ok: true, voted: 'dynamic', choice, server_now: timestamp };
      }

      /**
       * Abre o desafio coletivo da rodada. As opcoes e a resposta certa saem do
       * que o Juiz JA avaliou — nenhuma chamada nova de IA.
       */
      case 'arena_mode_dynamic_open': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!isArenaRoom(room)) throw new ApiError(409, 'Esta sala nao esta no modo Arena.');
        const key = String(payload.dynamic ?? payload.key ?? '');
        if (!ARENA_DYNAMICS[key]) throw new ApiError(422, 'Escolha um desafio coletivo válido.');
        const durationSeconds = integer(payload.duration_seconds ?? 45, 'duration_seconds', { min: 10, max: 300 });
        await trocarModoArena(room, async (state) => {
          const round = await arenaRoundFor(room, state.round);
          if (!round) throw new ApiError(409, 'Esta rodada da Arena nao existe mais na sala.');
          if (!state.competitors.ids.length) throw new ApiError(409, 'Sorteie os competidores antes do desafio da turma.');
          const built = await runArenaAsync(() => buildDynamicPayload(room, state, key, round));
          const next = runArena(() => openDynamic(state, {
            key,
            options: built.options,
            correct: built.correct ?? null,
            correctBy: built.correctBy ?? null,
            durationSeconds,
            at: timestamp,
          }));
          next.dynamic.intro = built.intro;
          next.dynamic.prompt = built.prompt;
          return { estado: next };
        }, timestamp);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      /**
       * Vote -> revele -> vote novamente: guarda a primeira escolha da turma,
       * mostra uma informacao relevante e reabre a votacao.
       */
      case 'arena_mode_dynamic_hint': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!isArenaRoom(room)) throw new ApiError(409, 'Esta sala nao esta no modo Arena.');
        const hint = text(payload.hint, 'hint', { min: 2, max: 400 });
        await trocarModoArena(room, (state) => ({
          estado: runArena(() => hintDynamic(state, { hint, at: timestamp })),
        }), timestamp);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      /**
       * Fecha o desafio: conta os votos, aplica (ou nega) o dano e alimenta a
       * energia da turma. E o momento em que a TV anuncia o resultado.
       */
      case 'arena_mode_dynamic_close': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!isArenaRoom(room)) throw new ApiError(409, 'Esta sala nao esta no modo Arena.');
        const resultado = await trocarModoArena(room, async (state) => {
          if (!state.dynamic) throw new ApiError(409, 'Nenhum desafio coletivo aberto.');
          // Ja fechado: nao ha o que gravar. E o caminho de dois cliques do
          // professor, de duas abas ou de DUAS INSTÂNCIAS — o estado coletivo
          // nao pode ser alterado duas vezes pela mesma decisao. No retry, quem
          // ja encontra `revealed_at` cai aqui e devolve o resultado gravado.
          if (state.dynamic.revealed_at) return { estado: null, jaFechado: true };
          const settled = runArena(() => settleDynamic(state, { at: timestamp }));
          let next = settled.phase === 'finished' ? settled : { ...settled, phase: 'reveal' };
          // O ultimo ataque pode derrubar o Juiz: a partida termina AQUI, e os
          // premios precisam sair junto — senao a TV anuncia o veredito sem
          // reconhecer ninguem (e o professor nao tem mais o que clicar).
          if (next.phase === 'finished' && !next.awards) {
            next = { ...next, awards: await arenaAwardsFor(room, next) };
          }
          return { estado: next };
        }, timestamp);
        if (resultado.jaFechado) {
          return { ok: true, already_closed: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
        }
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      /** Avanca a rodada: guarda o resumo e volta a turma ao balaio do sorteio. */
      case 'arena_mode_next': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!isArenaRoom(room)) throw new ApiError(409, 'Esta sala nao esta no modo Arena.');
        await trocarModoArena(room, async (state) => {
          // A revelação da rodada E o resultado dela: a missão desta rodada fica
          // arquivada aqui, senão a próxima não pode nem começar.
          const roomRounds = await repositories.arena.rounds.listByRoom(room.id);
          const current = roomRounds.find((entry) => Number(entry.position) === Number(state.round));
          if (current && current.status === 'results') {
            await repositories.arena.rounds.updateStatus({ id: current.id, status: 'closed', now: timestamp, endedAt: timestamp });
          }
          const remembered = rememberCompetitors(state, state.competitors.ids);
          let next = runArena(() => closeRound(remembered, { at: timestamp }));
          // Se a sala nao tem mais rodada configurada, a partida termina aqui — a
          // Arena nunca fica girando numa rodada que nao existe.
          if (next.phase === 'mission') {
            const following = await arenaRoundFor(room, next.round);
            if (!following) next = { ...next, phase: 'finished' };
          }
          if (next.phase === 'finished') next = { ...next, awards: await arenaAwardsFor(room, next) };
          return { estado: next };
        }, timestamp);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      /** Usa um poder desbloqueado. Nenhum deles tira ponto ou prejudica aluno. */
      case 'arena_mode_power': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!isArenaRoom(room)) throw new ApiError(409, 'Esta sala nao esta no modo Arena.');
        const key = String(payload.power ?? '');
        if (!ARENA_POWERS[key]) throw new ApiError(422, 'Poder desconhecido.');
        const resultado = await trocarModoArena(room, async (state) => {
          const nota = await powerNoteFor(room, state, key);
          let next = runArena(() => usePower(state, key, { at: timestamp, text: nota }));
          // A pista existe para a TURMA ver: sem empurra-la para o desafio aberto,
          // o poder so escrevia uma nota no painel do professor e a promessa
          // ("revela uma pista") morria ali. Com o desafio aberto, a pista entra
          // no cartao do aluno e a turma vota de novo sabendo mais.
          if (key === 'pista' && state.dynamic && !state.dynamic.revealed_at) {
            next = runArena(() => hintDynamic(next, { hint: nota, at: timestamp }));
          }
          return { estado: next, note: nota };
        }, timestamp);
        return { ok: true, note: resultado.note, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      /** Reorganiza os times temporarios (evita panelinha fixa). */
      case 'arena_mode_teams': {
        requireAdmin(payload.admin_token);
        const room = await roomById(payload.room_id);
        if (!isArenaRoom(room)) throw new ApiError(409, 'Esta sala nao esta no modo Arena.');
        await trocarModoArena(room, async (state) => {
          const roster = await drawRoster(room.id);
          const teams = assignTeams(roster);
          return { estado: { ...state, teams, config: { ...state.config, teams: true } } };
        }, timestamp);
        return { ok: true, room: (await adminRoomDetail(room, timestamp)), server_now: timestamp };
      }

      default:
        throw new ApiError(404, 'Acao de Arena desconhecida.');
    }
  }

  // Serialize only competing submissions from the same participant; evaluations
  // from different students continue concurrently.
  const pending = new Map();
  const roomControls = new Set([
    'arena_start_round', 'arena_pause_round', 'arena_resume_round', 'arena_end_round', 'arena_close_round', 'arena_end_room',
    // A batalha nova fecha rodada, zera estado e clona missoes: e a maior
    // leitura-modificacao-escrita da sala e entra na mesma fila dela.
    'arena_new_battle',
    // O sorteio e ler-mexer-gravar o mesmo estado: serializado por sala, dois
    // cliques rapidos no sorteio nao se atropelam.
    'arena_draw_setup', 'arena_draw_next', 'arena_draw_settle', 'arena_draw_reset',
    // O modo Arena e o mesmo padrao ler-mexer-gravar: votar, sortear e fechar
    // um desafio nunca podem se cruzar (a janela de votacao fica curta).
    'arena_mode_vote', 'arena_mode_draw', 'arena_mode_wildcard_close',
    'arena_mode_dynamic_open', 'arena_mode_dynamic_close', 'arena_mode_dynamic_hint',
    'arena_mode_next', 'arena_mode_power', 'arena_mode_teams',
    'arena_mode_configure', 'arena_mode_reset',
  ]);
  /**
   * Chave da fila de uma escrita.
   *
   * A regra e: TUDO que le-modifica-grava o estado coletivo de uma sala entra
   * na MESMA fila daquela sala. Antes o voto tinha fila propria
   * (`vote:<o que o payload dissesse>`), entao dois alunos votando juntos nao se
   * serializavam um com o outro nem com o professor fechando o desafio logo
   * depois — cada um lia o mesmo JSON e o ultimo a gravar apagava os votos do
   * outro. Voto e sorteio nao sao "duas coisas": sao a mesma sala.
   *
   * A sala do voto vem da SESSAO AUTENTICADA, nunca do payload: um aluno que
   * mandasse `room_id` de outra sala so conseguiria escolher a propria fila, nao
   * a sala que ele escreve (a acao ignora esse campo de proposito). O custo e
   * uma leitura da sessao antes do despacho — a mesma que a acao faria adiante.
   */
  const lockKeyFor = async (action, payload) => {
    if (action === 'arena_submit') return `submission:${payload.round_id}:${payload.participant_id}`;
    if (action === 'arena_mode_vote') {
      // Sessao invalida estoura aqui com o mesmo 401 que a votacao daria.
      const participant = await participantSession(payload.participant_id, payload.token);
      return `room:${participant.roomId}`;
    }
    return `room:${payload.room_id}`;
  };

  const dispatch = async (action, payload = {}, meta = {}) => {
    if (action !== 'arena_submit' && !roomControls.has(action)) return arenaDispatch(action, payload, meta);
    object(payload);
    const key = await lockKeyFor(action, payload);
    const previous = pending.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(() => arenaDispatch(action, payload, meta));
    pending.set(key, current);
    try { return await current; }
    finally { if (pending.get(key) === current) pending.delete(key); }
  };
  // Alça da retomada: quem sobe a instância (e o teste) chama isto depois de o
  // banco estar aberto. Vai como propriedade da função devolvida porque é ela
  // que todo chamador já segura — um segundo valor de retorno obrigaria cada um
  // a mudar de forma por causa de uma operação de boot.
  dispatch.retomarEstacionadas = retomarEstacionadas;
  return dispatch;
}
