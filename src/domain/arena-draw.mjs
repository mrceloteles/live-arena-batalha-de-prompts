/**
 * Sorteio da vez: quem joga agora.
 *
 * Nasceu de uma aula com a turma inteira e uma batalha pequena (ex.: 30 alunos
 * em disputas de 3 em 3). O professor precisa de duas coisas que o painel nao
 * tinha: sortear gente de verdade e nao perder o fio da meada do que ja
 * aconteceu. Sao dois modelos, e a diferenca esta em QUEM continua no sorteio:
 *
 *   livre      -> toda a turma concorre sempre. Quem venceu continua no balaio
 *                 (e pode ser sorteado de novo); quem perdeu tambem. E o
 *                 sorteio puro, repetivel a aula inteira.
 *   mata-mata  -> como no futebol: quem vence fica no jogo e so volta a jogar
 *                 contra outros vencedores; quem perde sai. Cada rodada sorteia
 *                 grupos entre os vencedores da rodada anterior, ate sobrar um.
 *
 * O estado guarda apenas ids (nomes vem dos participantes da sala, sempre
 * atuais), o historico resolvido e o grupo da vez. Nada aqui decide nota ou
 * pontuacao: e sorteio, nao julgamento.
 *
 * Um detalhe de honestidade do mata-mata: quando sobram menos que o tamanho do
 * grupo, o sorteio reduz o grupo para nao deixar um sozinho sobrando sempre que
 * der; quando isso for impossivel (grupo de 2 numa rodada impar), o que sobra
 * passa direto, sem disputa — e o historico registra isso como "passou direto".
 */

export const DRAW_MODES = Object.freeze(['livre', 'mata-mata']);

export const DRAW_MODE_LABELS = Object.freeze({
  livre: 'Sorteio livre',
  'mata-mata': 'Mata-mata',
});

export const DRAW_MODE_HINTS = Object.freeze({
  livre: 'Todos concorrem em todas as rodadas.',
  'mata-mata': 'Só quem vence continua no sorteio.',
});

export const DRAW_GROUP_MIN = 2;
export const DRAW_GROUP_MAX = 10;
export const DRAW_GROUP_DEFAULT = 3;
export const DRAW_VERSION = 1;

/** Erro de regra do sorteio (o servidor traduz para 409 com esta mensagem). */
export class DrawError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DrawError';
  }
}

export function isDrawMode(value) {
  return DRAW_MODES.includes(String(value ?? '').toLowerCase());
}

export function clampDrawGroupSize(value, fallback = DRAW_GROUP_DEFAULT) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(DRAW_GROUP_MAX, Math.max(DRAW_GROUP_MIN, parsed));
}

const ids = (list) => [...new Set((list || []).map((id) => String(id)).filter(Boolean))];

/** Estado zerado: ninguem na disputa ainda (o pool e preenchido pelo startDraw). */
export function emptyDraw({ mode = 'livre', groupSize = DRAW_GROUP_DEFAULT } = {}) {
  return {
    version: DRAW_VERSION,
    mode: isDrawMode(mode) ? String(mode).toLowerCase() : 'livre',
    groupSize: clampDrawGroupSize(groupSize),
    round: 1,
    pool: [],
    next: [],
    current: null,
    results: [],
    eliminated: [],
    champion: null,
  };
}

/** Comeca um sorteio novo com todo mundo da sala no balaio. */
export function startDraw(activeIds, { mode = 'livre', groupSize = DRAW_GROUP_DEFAULT } = {}) {
  const draw = emptyDraw({ mode, groupSize });
  draw.pool = ids(activeIds);
  return draw;
}

function normalizeResult(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const resultIds = ids(entry.ids);
  if (!resultIds.length) return null;
  const winner = entry.winner_id ? String(entry.winner_id) : null;
  return {
    at: Number(entry.at) || 0,
    round: Math.max(1, Math.round(Number(entry.round)) || 1),
    ids: resultIds,
    winner_id: winner,
    bye: Boolean(entry.bye) || (resultIds.length === 1 && winner === resultIds[0]),
  };
}

/** Coage um blob guardado (ou lixo) num estado valido — nunca confia no disco. */
export function normalizeDraw(raw) {
  const draw = emptyDraw({ mode: raw?.mode, groupSize: raw?.groupSize });
  draw.round = Math.max(1, Math.round(Number(raw?.round)) || 1);
  draw.pool = ids(raw?.pool);
  draw.next = ids(raw?.next);
  draw.eliminated = ids(raw?.eliminated);
  draw.champion = raw?.champion ? String(raw.champion) : null;
  draw.results = Array.isArray(raw?.results)
    ? raw.results.map(normalizeResult).filter(Boolean)
    : [];
  const current = raw?.current;
  draw.current = current && Array.isArray(current.ids) && ids(current.ids).length
    ? { ids: ids(current.ids), at: Number(current.at) || 0 }
    : null;
  return draw;
}

/** Tira do estado quem saiu da sala (removido/inativo) — a sala manda. */
export function syncDraw(state, activeIds) {
  const live = new Set(ids(activeIds));
  const keep = (list) => ids(list).filter((id) => live.has(id));
  const draw = { ...state };
  draw.pool = keep(state.pool);
  draw.next = keep(state.next);
  draw.eliminated = keep(state.eliminated);
  if (draw.champion && !live.has(draw.champion)) draw.champion = null;
  if (draw.current) {
    const currentIds = keep(draw.current.ids);
    draw.current = currentIds.length ? { ...draw.current, ids: currentIds } : null;
  }
  return draw;
}

/** Fecha a rodada quando o pool acabou: os vencedores formam a proxima. */
function advanceRound(state) {
  const draw = state;
  if (draw.mode !== 'mata-mata') return draw;
  if (draw.pool.length || draw.current) return draw;
  const winners = ids(draw.next);
  if (!winners.length) return draw;
  if (winners.length === 1) {
    draw.champion = winners[0];
    draw.next = winners;
    return draw;
  }
  draw.round += 1;
  draw.pool = winners;
  draw.next = [];
  return draw;
}

/** Se algum grupo ja foi decidido — so entao faz sentido falar de rodada. */
const drawStarted = (draw) => draw.results.some((result) => !result.bye);

/**
 * No mata-mata, sobrar sozinho na rodada e passar direto (sem disputa).
 *
 * Nunca com um grupo aberto: enquanto alguem esta jogando, quem sobrou no pool
 * ainda NAO jogou — marcar passe direto ali daria a vitoria a quem nem entrou
 * em campo e adiantaria a rodada (foi o que a sondagem pegou: 3 vencedores em
 * grupos de 2, com o terceiro marcado como vencedor antes de a disputa acabar).
 */
function resolveByes(state, at) {
  let draw = state;
  if (draw.mode !== 'mata-mata' || draw.current || !drawStarted(draw)) return draw;
  let guard = 0;
  while (draw.pool.length === 1 && guard < 100) {
    guard += 1;
    const [id] = draw.pool;
    draw = {
      ...draw,
      pool: [],
      next: ids([...draw.next, id]),
      results: [...draw.results, { at, round: draw.round, ids: [id], winner_id: id, bye: true }],
    };
    draw = advanceRound(draw);
  }
  return draw;
}

/**
 * Estado efetivo: o guardado, ja reconciliado com a sala de agora. Leitura pura
 * (nao persiste) — a proxima acao e quem grava.
 */
export function effectiveDraw(raw, activeIds, at = 0) {
  if (!raw) return startDraw(activeIds);
  let draw = syncDraw(normalizeDraw(raw), activeIds);
  if (draw.mode === 'mata-mata' && !draw.current) draw = resolveByes(advanceRound(draw), at);
  return draw;
}

/** Quem pode ser sorteado agora, na ordem em que os alunos entraram. */
export function drawEligible(state, activeIds) {
  const live = ids(activeIds);
  if (state.mode !== 'mata-mata') return live;
  const pool = new Set(state.pool);
  return live.filter((id) => pool.has(id));
}

/**
 * Quantos entram no proximo grupo. No mata-mata o pool e consumido, entao o
 * grupo encolhe para nao deixar um sozinho sobrando (4 pessoas com grupos de 3
 * viram 2 + 2, e nao 3 + 1); no sorteio livre ninguem sai do balaio e nao ha o
 * que encolher. E o mesmo numero que o botao "Sortear N" anuncia.
 */
export function nextGroupSize(state, eligibleCount) {
  const available = Math.max(0, Math.round(Number(eligibleCount) || 0));
  let size = Math.min(clampDrawGroupSize(state?.groupSize), available);
  if (state?.mode === 'mata-mata' && available - size === 1 && size > DRAW_GROUP_MIN) size -= 1;
  return Math.max(0, size);
}

/**
 * Sorteia o proximo grupo. Chamar de novo com um grupo aberto o substitui
 * (o grupo anterior volta ao balaio, no mata-mata) — e o "sortear de novo".
 */
export function drawNext(state, activeIds, { rng = Math.random, at = 0 } = {}) {
  let draw = effectiveDraw(state, activeIds, at);
  if (draw.champion) throw new DrawError('O mata-mata já terminou — recomece o sorteio para jogar outra vez.');
  if (draw.current) {
    if (draw.mode === 'mata-mata') draw = { ...draw, pool: ids([...draw.pool, ...draw.current.ids]) };
    draw = { ...draw, current: null };
  }
  // Um sobrevivente sozinho no fim da rodada nao disputa: passa direto.
  if (draw.mode === 'mata-mata') draw = resolveByes(advanceRound(draw), at);
  if (draw.champion) return draw;

  const eligible = drawEligible(draw, activeIds);
  if (eligible.length < 2) {
    // O motivo e da sala, nao do modo: uma sala de 1 pessoa nao tem sorteio em
    // nenhum dos dois modelos.
    throw new DrawError(ids(activeIds).length < 2
      ? 'A sala precisa de pelo menos 2 participantes para sortear.'
      : 'Só resta 1 na disputa — sem adversário não há sorteio.');
  }
  const size = nextGroupSize(draw, eligible.length);
  const chosen = sample(eligible, size, rng);
  const picked = new Set(chosen);
  return {
    ...draw,
    pool: draw.mode === 'mata-mata' ? draw.pool.filter((id) => !picked.has(id)) : draw.pool,
    current: { ids: chosen, at },
  };
}

/**
 * Fecha o grupo da vez com o vencedor escolhido pelo professor. Recebe um
 * estado ja reconciliado (effectiveDraw) — nao re-filtra contra a sala, senao
 * um sorteio com participantes removidos seria reescrito por engano.
 */
export function settleDraw(state, winnerId, { at = 0 } = {}) {
  const draw = {
    ...state,
    results: [...state.results],
    pool: [...state.pool],
    next: [...state.next],
    eliminated: [...state.eliminated],
  };
  if (!draw.current) throw new DrawError('Nenhum grupo sorteado para escolher o vencedor.');
  const winner = String(winnerId ?? '');
  if (!draw.current.ids.includes(winner)) throw new DrawError('O vencedor precisa ser um dos sorteados.');
  const resolved = {
    ...draw,
    results: [...draw.results, { at, round: draw.round, ids: [...draw.current.ids], winner_id: winner, bye: false }],
    current: null,
  };
  if (draw.mode === 'mata-mata') {
    const losers = draw.current.ids.filter((id) => id !== winner);
    resolved.eliminated = ids([...draw.eliminated, ...losers]);
    resolved.next = ids([...draw.next, winner]);
  }
  return advanceRound(resolved);
}

/** Sorteio aleatorio sem repeticao (Fisher-Yates sobre uma copia). */
export function sample(list, size, rng = Math.random) {
  const pool = [...list];
  const take = Math.max(0, Math.min(Math.round(size), pool.length));
  for (let i = 0; i < take; i += 1) {
    const random = Number(rng());
    const j = i + Math.floor((Number.isFinite(random) ? Math.min(Math.max(random, 0), 0.999999) : 0) * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}

/**
 * O que a tela precisa: quem esta na disputa, quem saiu, o grupo da vez, o
 * historico e se da para sortear agora (com o motivo quando nao da).
 */
export function drawView(state, participants = []) {
  const roster = (participants || [])
    .filter((entry) => entry && entry.active !== false)
    .map((entry) => ({ id: String(entry.id), name: entry.name ?? 'Participante' }));
  const draw = effectiveDraw(state, roster.map((entry) => entry.id));
  const byId = new Map(roster.map((entry) => [entry.id, entry]));
  const nameOf = (id) => byId.get(String(id))?.name || 'Participante removido';

  const plays = new Map();
  const wins = new Map();
  const eliminatedAt = new Map();
  for (const result of draw.results) {
    for (const id of result.ids) plays.set(id, (plays.get(id) || 0) + 1);
    if (result.winner_id) wins.set(result.winner_id, (wins.get(result.winner_id) || 0) + 1);
    if (!result.bye) {
      for (const id of result.ids) {
        if (id !== result.winner_id) eliminatedAt.set(id, result.round);
      }
    }
  }

  const eligibleIds = drawEligible(draw, roster.map((entry) => entry.id));
  const eligible = eligibleIds.map((id) => ({
    id, name: nameOf(id), plays: plays.get(id) || 0, wins: wins.get(id) || 0,
  }));
  const eliminated = draw.eliminated.map((id) => ({
    id, name: nameOf(id), round: eliminatedAt.get(id) || null,
  }));

  const current = draw.current
    ? { ids: draw.current.ids, names: draw.current.ids.map(nameOf), at: draw.current.at }
    : null;
  const championId = draw.champion && byId.has(draw.champion) ? draw.champion : null;
  // "Ainda no jogo" e diferente de "pode ser sorteado agora": quem esta jogando
  // o grupo da vez saiu do balaio, mas nao do torneio. E esse conjunto que a
  // parede precisa mostrar.
  const eliminatedSet = new Set(eliminated.map((entry) => entry.id));
  const inGame = draw.mode === 'mata-mata'
    ? roster.filter((entry) => !eliminatedSet.has(entry.id)).map((entry) => ({ id: entry.id, name: entry.name }))
    : [];

  const canDraw = !championId && !current
    && (draw.mode === 'mata-mata' ? eligible.length >= 2 : roster.length >= 2);
  const reason = canDraw ? ''
    : championId ? 'O mata-mata já tem campeão. Recomece para jogar outra vez.'
      : current ? 'Escolha o vencedor do grupo da vez ou sorteie de novo.'
        : (roster.length < 2
          ? 'A sala precisa de pelo menos 2 participantes para sortear.'
          : 'Só resta 1 na disputa — sem adversário não há sorteio.');

  return {
    version: draw.version,
    mode: draw.mode,
    mode_label: DRAW_MODE_LABELS[draw.mode] || draw.mode,
    mode_hint: DRAW_MODE_HINTS[draw.mode] || '',
    group_size: draw.groupSize,
    round: draw.round,
    current,
    champion: championId ? { id: championId, name: nameOf(championId) } : null,
    eligible,
    eliminated,
    in_game: inGame,
    history: draw.results.map((result) => ({
      round: result.round,
      ids: result.ids,
      names: result.ids.map(nameOf),
      winner_id: result.winner_id,
      winner_name: result.winner_id ? nameOf(result.winner_id) : '',
      bye: result.bye,
      at: result.at,
    })),
    counts: {
      total: roster.length,
      eligible: eligible.length,
      eliminated: eliminated.length,
      in_game: inGame.length,
      played: draw.results.filter((result) => !result.bye).length,
    },
    // Quantos entram no proximo grupo — o numero que o botao anuncia. Pode ser
    // menor que o escolhido no mata-mata (grupo que encolhe para nao sobrar 1).
    next_size: nextGroupSize(draw, eligible.length),
    can_draw: canDraw,
    cannot_reason: reason,
    started: draw.results.length > 0 || Boolean(current),
  };
}
