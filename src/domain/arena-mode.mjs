/**
 * ARENA — TURMA VS. JUIZ.
 *
 * Um modo de jogo coletivo que roda SOBRE o motor de salas que já existe
 * (missões, envios, juiz por critérios, placar). Ele não substitui nada do
 * Modo Clássico: é uma camada declarativa, ligada apenas em salas cujo preset
 * declara `gameMode: 'arena'`.
 *
 * O problema que o modo resolve: numa turma de 30, uma batalha de 3 pessoas
 * deixa 27 assistindo. Aqui todo mundo escreve, 3 vão à Arena, e a turma
 * inteira joga pequenos desafios que atacam um Boss comum — o Juiz IA.
 *
 * Duas competições ao mesmo tempo:
 *   individual -> os 3 competidores querem vencer a Arena;
 *   coletiva    -> a turma inteira quer derrubar o Juiz.
 *
 * COMO O DANO FUNCIONA (regra que precisa ficar clara):
 *   se pelo menos `damageThreshold` (padrão 60%) dos alunos que responderam
 *   acertarem o desafio coletivo, o Boss perde 1 coração. Menos que isso, o
 *   Boss resiste e nada muda.
 *
 * O módulo é puro: nenhuma função aqui grava, lê disco ou conhece HTTP. Toda a
 * decisão de regra mora neste arquivo — as telas apenas leem o resultado.
 */

export const ARENA_GAME_MODE = 'arena';

export const ARENA_STATE_VERSION = 1;

/** Fases de uma rodada, na ordem em que a turma as vê (progressive disclosure). */
export const ARENA_PHASES = Object.freeze([
  'mission',   // todos escrevem o prompt
  'select',    // sorteio dos 3 competidores (+ Wild Card, quando houver)
  'wildcard',  // a turma escolhe, entre 3 prompts anônimos, quem entra na Arena
  'arena',     // o Juiz avalia os 3 competidores
  'dynamic',   // a turma joga o desafio coletivo (até N ataques por rodada)
  'reveal',    // notas da Arena + resultado do ataque
  'finished',  // Boss derrotado ou rodadas esgotadas
]);

export const ARENA_PHASE_LABELS = Object.freeze({
  mission: 'Missão',
  select: 'Sorteio',
  wildcard: 'Wild Card',
  arena: 'Arena',
  dynamic: 'Desafio da turma',
  reveal: 'Resultado',
  finished: 'Fim da partida',
});

export const ARENA_DEFAULTS = Object.freeze({
  rounds: 3,
  bossMaxHealth: 5,
  damageThreshold: 0.6,
  attacksPerRound: 2,
  dynamicsMode: 'auto', // 'auto' | 'manual'
  teams: false,
  powers: true,
});

export const ARENA_DURATIONS = Object.freeze({
  rapida: { label: 'Rápida', rounds: 2 },
  padrao: { label: 'Padrão', rounds: 3 },
  estendida: { label: 'Estendida', rounds: 4 },
});

/** Nomes dos três times temporários. Configuráveis no futuro. */
export const ARENA_TEAMS = Object.freeze([
  { key: 'pixel', name: 'PIXEL', glyph: '🔵' },
  { key: 'neural', name: 'NEURAL', glyph: '🟣' },
  { key: 'byte', name: 'BYTE', glyph: '🟢' },
]);

/**
 * Biblioteca de dinâmicas. Cada uma declara apenas o que a tela precisa para
 * perguntar e o que o domínio precisa para corrigir. Nenhuma delas rouba
 * pontos, elimina alguém ou depende de sorte para decidir resultado.
 */
export const ARENA_DYNAMICS = Object.freeze({
  prever: {
    key: 'prever',
    label: 'Prever o vencedor',
    question: 'Qual prompt o Juiz vai colocar em primeiro?',
    kind: 'choice',
    source: 'competitors',
    attacks: true,
    teach: 'Antecipar o olhar do Juiz é o mesmo raciocínio de escrever para ele.',
  },
  cacada: {
    key: 'cacada',
    label: 'Caçada ao erro',
    question: 'Qual é a principal fraqueza deste prompt?',
    kind: 'choice',
    source: 'criteria',
    attacks: true,
    teach: 'Nomear a fraqueza é o primeiro passo para não repeti-la.',
  },
  comparacao: {
    key: 'comparacao',
    label: 'Comparação A × B',
    question: 'Qual prompt atende melhor ao objetivo?',
    kind: 'choice',
    source: 'pair',
    attacks: true,
    teach: 'Julgar comparando é mais confiável do que dar nota absoluta.',
  },
  juri: {
    key: 'juri',
    label: 'Júri especialista',
    question: 'Avalie o prompt apenas pelo seu critério.',
    kind: 'teams',
    source: 'criteria',
    attacks: true,
    teach: 'Cada critério é uma lente; a nota final é a soma das lentes.',
  },
  calibracao: {
    key: 'calibracao',
    label: 'Previsão + confiança',
    question: 'Quem o Juiz vai escolher? E com quanta certeza?',
    kind: 'confidence',
    source: 'competitors',
    attacks: false, // alimenta a métrica individual de Calibração
    teach: 'Saber o quanto você sabe vale tanto quanto acertar.',
  },
  mudanca: {
    key: 'mudanca',
    label: 'Vote → revele → vote',
    question: 'Você mantém sua decisão?',
    kind: 'revision',
    source: 'pair',
    attacks: true,
    teach: 'Mudar de ideia com evidência nova é evolução, não fraqueza.',
  },
  conselho: {
    key: 'conselho',
    label: 'Conselho da turma',
    question: 'Qual melhoria o competidor deveria fazer?',
    kind: 'advice',
    source: 'criteria',
    attacks: false,
    teach: 'Dar conselho exige entender o problema melhor que quem escreveu.',
  },
  v1v2: {
    key: 'v1v2',
    label: 'Revisão V1 → V2',
    question: 'Reescreva seu prompt usando o que aprendeu.',
    kind: 'revision',
    source: 'own',
    attacks: false,
    teach: 'A segunda versão é onde o aprendizado vira habilidade.',
  },
});

export const CRITERION_OPTIONS = Object.freeze([
  'objetivo', 'contexto', 'restricoes', 'clareza', 'formato', 'ambiguidade',
]);

/** Marcos de energia: ao alcançar cada um, um poder é desbloqueado. */
export const ARENA_ENERGY_MAX = 40;
export const ARENA_POWERS = Object.freeze({
  pista: { key: 'pista', label: 'Revelar pista', glyph: '🔍', at: 10, hint: 'Uma pista curta sobre um critério importante do Juiz.' },
  conselho: { key: 'conselho', label: 'Conselho da turma', glyph: '📣', at: 20, hint: 'A turma ajuda um competidor antes da decisão final.' },
  revisao: { key: 'revisao', label: 'Revisão', glyph: '🛡️', at: 30, hint: 'Uma revisão pequena do prompt antes da decisão final.' },
  regra: { key: 'regra', label: 'Regra especial', glyph: '🎲', at: 40, hint: 'A turma escolhe entre duas condições para o próximo desafio.' },
});

export const ARENA_TEAM_NAMES = Object.freeze(['A', 'B', 'C']);

/** Níveis de confiança da dinâmica de calibração (Previsão + Confiança). */
export const ARENA_CONFIDENCE = Object.freeze([
  { key: 'baixa', label: 'Baixa' },
  { key: 'media', label: 'Média' },
  { key: 'alta', label: 'Alta' },
]);

export class ArenaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArenaError';
  }
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

function clampInt(value, min, max, fallback) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clampThreshold(value, fallback = ARENA_DEFAULTS.damageThreshold) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  // Aceita tanto 0.6 quanto 60 (o painel pode mandar percentual).
  const ratio = parsed > 1 ? parsed / 100 : parsed;
  return Math.min(1, Math.max(0.05, ratio));
}

/** Configuração normalizada do modo, a partir das settings da sala. */
export function arenaConfig(raw = {}) {
  const dynamicsMode = String(raw.dynamicsMode ?? ARENA_DEFAULTS.dynamicsMode).toLowerCase() === 'manual'
    ? 'manual' : 'auto';
  return {
    rounds: clampInt(raw.rounds, 1, 6, ARENA_DEFAULTS.rounds),
    bossMaxHealth: clampInt(raw.bossMaxHealth, 1, 10, ARENA_DEFAULTS.bossMaxHealth),
    damageThreshold: clampThreshold(raw.damageThreshold),
    attacksPerRound: clampInt(raw.attacksPerRound, 1, 3, ARENA_DEFAULTS.attacksPerRound),
    dynamicsMode,
    teams: Boolean(raw.teams ?? ARENA_DEFAULTS.teams),
    powers: Boolean(raw.powers ?? ARENA_DEFAULTS.powers),
    dynamics: Array.isArray(raw.dynamics)
      ? raw.dynamics.map((key) => String(key)).filter((key) => Boolean(ARENA_DYNAMICS[key]))
      : [],
  };
}

/** O preset `arena` declara `gameMode: 'arena'`; todo o resto continua clássico. */
export function isArenaRoom(room) {
  return String(room?.settings?.gameMode ?? '').toLowerCase() === ARENA_GAME_MODE;
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

export function emptyArenaState(config = {}) {
  const resolved = arenaConfig(config);
  return {
    version: ARENA_STATE_VERSION,
    mode: ARENA_GAME_MODE,
    config: resolved,
    phase: 'mission',
    round: 1,
    boss: {
      health: resolved.bossMaxHealth,
      maxHealth: resolved.bossMaxHealth,
      lastAccuracy: null,
      lastDamage: 0,
      defeatedAt: null,
    },
    energy: { value: 0, max: ARENA_ENERGY_MAX, unlocked: [], used: [] },
    // Competidores da rodada: 3 nomes, sendo até 1 vindo do Wild Card.
    competitors: { ids: [], names: [], sources: [], wildcard: null },
    competed: [],
    dynamic: null,
    attacks: [],
    awards: null,
    rounds: [],
    // O que cada poder revelou (a TV precisa continuar mostrando depois de
    // recarregar). Nada aqui decide nota nem tira ponto de ninguém.
    power_notes: [],
    teams: {},
    // Placar individual de plateia: quem mais acerta o olhar do Juiz e quem
    // melhor sabe o quanto sabe. Alimenta os prêmios (Melhor Analista, Mestre
    // da Calibração) sem nunca entrar no pódio da Arena — campeão é quem
    // escreveu melhor, não quem adivinhou.
    audience: {},
    updatedAt: 0,
  };
}

const uniqueStrings = (list) => [...new Set((list || []).map((value) => String(value)).filter(Boolean))];

function normalizeAttack(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const total = Math.max(0, Math.round(Number(entry.total) || 0));
  return {
    round: Math.max(1, Math.round(Number(entry.round) || 1)),
    dynamic: String(entry.dynamic || ''),
    // Um blob corrompido no disco nao pode dizer que acertaram 9 de 4.
    correct: Math.min(total, Math.max(0, Math.round(Number(entry.correct) || 0))),
    total,
    accuracy: total > 0 ? Math.max(0, Math.round(Number(entry.accuracy) || 0)) : 0,
    damaged: Boolean(entry.damaged),
    at: Number(entry.at) || 0,
  };
}

/** Coage um blob guardado (ou lixo) num estado válido — nunca confia no disco. */
export function normalizeArenaState(raw) {
  const config = arenaConfig(raw?.config);
  const base = emptyArenaState(config);
  if (!raw || typeof raw !== 'object') return base;
  const phase = ARENA_PHASES.includes(raw.phase) ? raw.phase : 'mission';
  const health = clampInt(raw?.boss?.health, 0, config.bossMaxHealth, config.bossMaxHealth);
  const unlocked = uniqueStrings(raw?.energy?.unlocked).filter((key) => Boolean(ARENA_POWERS[key]));
  const state = {
    version: ARENA_STATE_VERSION,
    mode: ARENA_GAME_MODE,
    config,
    phase,
    round: clampInt(raw.round, 1, config.rounds, 1),
    boss: {
      health,
      maxHealth: config.bossMaxHealth,
      lastAccuracy: Number.isFinite(Number(raw?.boss?.lastAccuracy)) ? Number(raw.boss.lastAccuracy) : null,
      lastDamage: Math.max(0, Math.round(Number(raw?.boss?.lastDamage) || 0)),
      defeatedAt: raw?.boss?.defeatedAt ? Number(raw.boss.defeatedAt) : null,
    },
    energy: {
      value: clampInt(raw?.energy?.value, 0, ARENA_ENERGY_MAX, 0),
      max: ARENA_ENERGY_MAX,
      unlocked,
      used: uniqueStrings(raw?.energy?.used).filter((key) => Boolean(ARENA_POWERS[key])),
    },
    competitors: {
      ids: uniqueStrings(raw?.competitors?.ids).slice(0, 3),
      names: [],
      sources: (raw?.competitors?.sources || []).slice(0, 3).map((value) => String(value)),
      wildcard: raw?.competitors?.wildcard && typeof raw.competitors.wildcard === 'object'
        ? {
            options: (raw.competitors.wildcard.options || []).slice(0, 3).map((option, index) => ({
              key: ARENA_TEAM_NAMES[index] || String(index),
              participant_id: String(option?.participant_id ?? ''),
              prompt: String(option?.prompt ?? ''),
            })).filter((option) => option.participant_id),
            votes: { ...(raw.competitors.wildcard.votes || {}) },
            winner_key: raw.competitors.wildcard.winner_key
              ? String(raw.competitors.wildcard.winner_key) : null,
            opened_at: Number(raw.competitors.wildcard.opened_at) || 0,
            revealed: Boolean(raw.competitors.wildcard.revealed),
          }
        : null,
    },
    competed: uniqueStrings(raw.competed),
    dynamic: raw?.dynamic && typeof raw.dynamic === 'object' && ARENA_DYNAMICS[raw.dynamic.key]
      ? {
          key: String(raw.dynamic.key),
          round: clampInt(raw.dynamic.round, 1, config.rounds, 1),
          question: String(raw.dynamic.question || ''),
          options: (raw.dynamic.options || []).map((option) => ({
            key: String(option?.key ?? ''),
            // A letra que a turma le na tela (A/B/C). O `key` e o id do voto e
            // nunca pode ser exibido — sem o slot, a tela cai em mostrar o id.
            slot: option?.slot ? String(option.slot) : undefined,
            label: String(option?.label ?? ''),
          })).filter((option) => option.key),
          correct: raw.dynamic.correct ? String(raw.dynamic.correct) : null,
          // Correção por aluno (o Júri especialista dá um critério a cada time,
          // então "a resposta certa" depende de quem votou).
          correct_by: raw.dynamic.correct_by && typeof raw.dynamic.correct_by === 'object'
            ? { ...raw.dynamic.correct_by } : null,
          confidence: raw.dynamic.confidence && typeof raw.dynamic.confidence === 'object'
            ? { ...raw.dynamic.confidence } : {},
          hint: raw.dynamic.hint ? String(raw.dynamic.hint) : '',
          first_responses: raw.dynamic.first_responses && typeof raw.dynamic.first_responses === 'object'
            ? { ...raw.dynamic.first_responses } : null,
          opened_at: Number(raw.dynamic.opened_at) || 0,
          closes_at: Number(raw.dynamic.closes_at) || 0,
          revealed_at: Number(raw.dynamic.revealed_at) || 0,
          responses: { ...(raw.dynamic.responses || {}) },
          result: raw.dynamic.result && typeof raw.dynamic.result === 'object'
            ? { ...raw.dynamic.result } : null,
        }
      : null,
    attacks: Array.isArray(raw.attacks) ? raw.attacks.map(normalizeAttack).filter(Boolean) : [],
    awards: raw.awards && typeof raw.awards === 'object' ? { ...raw.awards } : null,
    rounds: Array.isArray(raw.rounds) ? raw.rounds.map((entry) => ({ ...entry })) : [],
    power_notes: Array.isArray(raw.power_notes)
      ? raw.power_notes.map((note) => ({
          power: String(note?.power || ''),
          text: String(note?.text || ''),
          at: Number(note?.at) || 0,
        })).filter((note) => note.power)
      : [],
    teams: raw.teams && typeof raw.teams === 'object' ? { ...raw.teams } : {},
    audience: raw.audience && typeof raw.audience === 'object' ? { ...raw.audience } : {},
    updatedAt: Number(raw.updatedAt) || 0,
  };
  state.competitors.names = Array.isArray(raw?.competitors?.names)
    ? raw.competitors.names.slice(0, 3).map((value) => String(value)) : [];
  return state;
}

// ---------------------------------------------------------------------------
// Ataque ao Boss — a regra mais importante do modo
// ---------------------------------------------------------------------------

/**
 * Resolve um ataque coletivo. Recebe quantos acertaram e quantos responderam e
 * devolve se o Boss perdeu um coração. 17 de 27 = 62,96% -> dano; 16 de 27 =
 * 59,26% -> o Boss resiste.
 */
export function resolveAttack({ correct = 0, total = 0, threshold = ARENA_DEFAULTS.damageThreshold } = {}) {
  const answered = Math.max(0, Math.round(Number(total) || 0));
  const hits = Math.max(0, Math.min(answered, Math.round(Number(correct) || 0)));
  if (answered === 0) {
    return { correct: 0, total: 0, accuracy: 0, threshold: clampThreshold(threshold), needed: 0, damaged: false, empty: true };
  }
  const ratio = hits / answered;
  const limit = clampThreshold(threshold);
  // O corte é inclusivo: exatamente 60% já derruba o coração.
  const damaged = ratio >= limit;
  return {
    correct: hits,
    total: answered,
    accuracy: Math.round(ratio * 100),
    threshold: limit,
    needed: Math.ceil(answered * limit),
    damaged,
    empty: false,
  };
}

/** Conta os votos de uma dinâmica contra a resposta correta (ou a mais votada). */
export function tallyResponses(dynamic) {
  const responses = dynamic?.responses || {};
  const votes = new Map();
  for (const choice of Object.values(responses)) {
    const key = String(choice);
    votes.set(key, (votes.get(key) || 0) + 1);
  }
  const total = Object.keys(responses).length;
  // Correção por aluno tem precedência: no Júri especialista cada time recebe
  // um critério diferente, então não existe uma única resposta certa da turma.
  const correctBy = dynamic?.correct_by;
  const correct = correctBy && typeof correctBy === 'object'
    ? Object.entries(responses)
        .filter(([voter, choice]) => correctBy[voter] && String(correctBy[voter]) === String(choice))
        .length
    : dynamic?.correct ? (votes.get(String(dynamic.correct)) || 0) : 0;
  const ranked = [...votes.entries()]
    .map(([key, count]) => ({
      key,
      count,
      percent: total ? Math.round((count / total) * 100) : 0,
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  return { votes: ranked, total, correct, majority: ranked[0]?.key ?? null };
}

// ---------------------------------------------------------------------------
// Energia e poderes
// ---------------------------------------------------------------------------

/**
 * Energia sobe com participação real (quem respondeu), não com o tempo que
 * passou. O ataque bem-sucedido vale um empurrão extra — é o momento em que a
 * turma toda percebe que acertou junto.
 */
export function energyForAttack({ total = 0, damaged = false } = {}) {
  const answered = Math.max(0, Math.round(Number(total) || 0));
  // Metade da turma respondendo ja enche a barra de participacao: o que move a
  // energia e a turma INTEIRA jogar, nao o tamanho dela. O ataque bem-sucedido
  // vale um empurrao extra — e o momento em que todo mundo percebe que acertou.
  const participation = Math.min(8, Math.ceil(answered / 2));
  return participation + (damaged ? 3 : 0);
}

export function unlockedPowersFor(energy) {
  const value = Math.max(0, Math.round(Number(energy) || 0));
  return Object.values(ARENA_POWERS).filter((power) => value >= power.at).map((power) => power.key);
}

/** Aplica ganho de energia e revela poderes recém-desbloqueados. */
export function gainEnergy(state, amount) {
  const before = state.energy.unlocked;
  const value = Math.min(ARENA_ENERGY_MAX, state.energy.value + Math.max(0, Math.round(Number(amount) || 0)));
  const unlocked = state.config.powers ? unlockedPowersFor(value) : [];
  return {
    state: { ...state, energy: { ...state.energy, value, unlocked } },
    gained: value - state.energy.value,
    unlocked: unlocked.filter((key) => !before.includes(key)),
  };
}

// ---------------------------------------------------------------------------
// Competidores, rotação e Wild Card
// ---------------------------------------------------------------------------

/**
 * Plano de competidores da rodada. O Wild Card entra nas rodadas 1 e na última
 * (quando há 3+ rodadas) para dar a mais gente a chance de entrar em campo por
 * mérito: os três prompts são da turma e quem decide é a turma.
 */
export function competitorPlan(round, config = ARENA_DEFAULTS, wildcardOverride = undefined) {
  const resolved = arenaConfig(config);
  const enabled = wildcardOverride === undefined ? true : Boolean(wildcardOverride);
  const useWildcard = enabled && resolved.rounds >= 3 && (round === 1 || round === resolved.rounds);
  return {
    total: 3,
    fromWildCard: useWildcard ? 1 : 0,
    drawn: useWildcard ? 2 : 3,
    wildcard: useWildcard,
  };
}

/**
 * Sorteia os competidores priorizando quem AINDA NÃO competiu — a rotação é o
 * que mantém a turma inteira sentindo que a vez dela pode chegar. Quem já
 * competiu só volta se não houver gente nova suficiente.
 */
export function pickCompetitors(state, eligible, { count = 3, rng = Math.random } = {}) {
  const roster = uniqueStrings(eligible);
  const competed = new Set(state.competed);
  const fresh = roster.filter((id) => !competed.has(id));
  const rest = roster.filter((id) => competed.has(id));
  const chosen = [
    ...sample(fresh, Math.min(count, fresh.length), rng),
    ...sample(rest, Math.max(0, count - Math.min(count, fresh.length)), rng),
  ];
  return chosen;
}

/** Fisher-Yates sobre uma cópia — sorteio sem repetição e sem viés de posição. */
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
 * Monta o Wild Card: 3 prompts elegíveis de quem não foi sorteado, sempre
 * anônimos (A/B/C). Quem escreveu não aparece aqui — isso é o que impede o
 * voto de virar popularidade.
 */
export function buildWildcard(state, candidates, { rng = Math.random, at = 0 } = {}) {
  const drawn = new Set(state.competitors.ids);
  const pool = (candidates || [])
    .filter((entry) => entry && entry.participant_id && !drawn.has(String(entry.participant_id)))
    .filter((entry) => String(entry.prompt || '').trim().length > 0)
    .filter((entry) => !state.competitors.ids.includes(String(entry.participant_id)));
  const picked = sample(pool, 3, rng);
  if (picked.length < 2) throw new ArenaError('Ainda não há prompts suficientes para o Wild Card.');
  const options = picked.map((entry, index) => ({
    key: ARENA_TEAM_NAMES[index] || String(index),
    participant_id: String(entry.participant_id),
    prompt: String(entry.prompt),
  }));
  return { options, votes: {}, winner_key: null, opened_at: at, revealed: false };
}

/** Registra o voto de um aluno no Wild Card (um voto por pessoa, trocável). */
export function voteWildcard(state, participantId, optionKey) {
  const wildcard = state.competitors.wildcard;
  if (!wildcard) throw new ArenaError('O Wild Card desta rodada não está aberto.');
  if (wildcard.revealed) throw new ArenaError('O Wild Card já foi revelado.');
  const key = String(optionKey || '').toUpperCase();
  if (!wildcard.options.some((option) => option.key === key)) {
    throw new ArenaError('Escolha uma das opções do Wild Card.');
  }
  const voter = String(participantId);
  if (wildcard.options.some((option) => option.participant_id === voter)) {
    throw new ArenaError('Quem está no Wild Card não vota.');
  }
  return {
    ...state,
    competitors: {
      ...state.competitors,
      wildcard: { ...wildcard, votes: { ...wildcard.votes, [voter]: key } },
    },
  };
}

/**
 * Fecha o Wild Card: o mais votado ocupa a terceira vaga. Empate é resolvido
 * pela ordem em que os prompts foram sorteados (A, B, C) — sem sorte nova, para
 * a decisão ser sempre rastreável.
 */
export function settleWildcard(state, { at = 0 } = {}) {
  const wildcard = state.competitors.wildcard;
  if (!wildcard) throw new ArenaError('O Wild Card desta rodada não está aberto.');
  const tally = new Map(wildcard.options.map((option) => [option.key, 0]));
  for (const key of Object.values(wildcard.votes)) {
    if (tally.has(String(key))) tally.set(String(key), tally.get(String(key)) + 1);
  }
  const ranked = wildcard.options
    .map((option) => ({ ...option, votes: tally.get(option.key) || 0 }))
    .sort((left, right) => right.votes - left.votes || left.key.localeCompare(right.key));
  const winner = ranked[0] || null;
  const ids = winner ? uniqueStrings([...state.competitors.ids, winner.participant_id]).slice(0, 3) : state.competitors.ids;
  return {
    ...state,
    competitors: {
      ...state.competitors,
      ids,
      sources: [...state.competitors.sources, winner ? 'wildcard' : 'draw'].slice(0, 3),
      wildcard: { ...wildcard, revealed: true, winner_key: winner?.key ?? null },
    },
    updatedAt: at,
  };
}

/** Fecha a seleção: registra os competidores e avança para a Arena. */
export function setCompetitors(state, ids, { at = 0 } = {}) {
  const chosen = uniqueStrings(ids).slice(0, 3);
  if (chosen.length !== 3) throw new ArenaError('A Arena precisa de exatamente 3 competidores.');
  return {
    ...state,
    phase: 'arena',
    competitors: { ...state.competitors, ids: chosen, sources: state.competitors.sources.slice(0, chosen.length) },
    updatedAt: at,
  };
}

/** Marca quem já competiu — a base da rotação da próxima rodada. */
export function rememberCompetitors(state, ids) {
  return { ...state, competed: uniqueStrings([...state.competed, ...ids]) };
}

// ---------------------------------------------------------------------------
// Dinâmicas
// ---------------------------------------------------------------------------

/**
 * Abre o desafio coletivo da rodada. As opções são montadas pela camada de
 * servidor (que conhece os prompts e as notas) e chegam aqui já resolvidas —
 * o domínio só cuida de janela, voto e correção.
 */
export function openDynamic(state, { key, options, correct = null, correctBy = null, durationSeconds = 45, at = 0 } = {}) {
  const definition = ARENA_DYNAMICS[key];
  if (!definition) throw new ArenaError('Dinâmica desconhecida.');
  if (state.attacks.filter((attack) => attack.round === state.round).length >= state.config.attacksPerRound
      && definition.attacks) {
    throw new ArenaError('Esta rodada já usou todos os ataques.');
  }
  return {
    ...state,
    phase: 'dynamic',
    dynamic: {
      key,
      round: state.round,
      question: String(definition.question),
      options: (options || []).map((option) => ({
        key: String(option.key),
        slot: option.slot ? String(option.slot) : undefined,
        label: String(option.label ?? option.key),
      })),
      correct: correct ? String(correct) : null,
      correct_by: correctBy && typeof correctBy === 'object' ? { ...correctBy } : null,
      hint: '',
      first_responses: null,
      opened_at: at,
      closes_at: at > 0 ? at + Math.max(5, Math.round(Number(durationSeconds) || 45)) : 0,
      revealed_at: 0,
      responses: {},
      confidence: {},
      result: null,
    },
    updatedAt: at,
  };
}

/**
 * Vote -> revele -> vote novamente.
 *
 * Guarda a primeira escolha da turma (nunca a sobrescreve), revela uma
 * informação relevante e reabre a votação. É o único jeito honesto de medir
 * mudança de entendimento: sem a primeira resposta guardada, a segunda não
 * prova nada.
 */
export function hintDynamic(state, { hint = '', at = 0 } = {}) {
  const dynamic = state.dynamic;
  if (!dynamic) throw new ArenaError('Nenhum desafio coletivo aberto.');
  if (dynamic.revealed_at) throw new ArenaError('Este desafio já foi revelado.');
  return {
    ...state,
    dynamic: {
      ...dynamic,
      hint: String(hint),
      first_responses: { ...(dynamic.first_responses || dynamic.responses) },
      responses: {},
      closes_at: at > 0 ? at + 45 : dynamic.closes_at,
    },
    updatedAt: at,
  };
}

/** Quantos mudaram de ideia depois da pista (métrica da dinâmica de mudança). */
export function revisionStats(dynamic) {
  const first = dynamic?.first_responses || {};
  const second = dynamic?.responses || {};
  let changed = 0;
  let kept = 0;
  for (const [voter, choice] of Object.entries(second)) {
    if (!(voter in first)) continue;
    if (String(first[voter]) === String(choice)) kept += 1;
    else changed += 1;
  }
  return { changed, kept, total: changed + kept };
}

/** Registra (ou troca) o voto de um aluno. Cada aluno conta uma vez. */
export function voteDynamic(state, participantId, choice, { at = 0 } = {}) {
  const dynamic = state.dynamic;
  if (!dynamic) throw new ArenaError('Nenhum desafio coletivo aberto.');
  if (dynamic.revealed_at) throw new ArenaError('Este desafio já foi revelado.');
  if (dynamic.closes_at && at > dynamic.closes_at) throw new ArenaError('O tempo deste desafio terminou.');
  const key = String(choice || '');
  if (dynamic.options.length && !dynamic.options.some((option) => option.key === key)) {
    throw new ArenaError('Escolha uma das opções do desafio.');
  }
  const voter = String(participantId || '');
  if (!voter) throw new ArenaError('Voto sem participante.');
  return {
    ...state,
    dynamic: { ...dynamic, responses: { ...dynamic.responses, [voter]: key } },
    updatedAt: at,
  };
}

/**
 * Confiança declarada na previsão (dinâmica de calibração).
 *
 * Guardar a confiança junto da previsão é o que permite medir calibração de
 * verdade: acertar com confiança alta é diferente de acertar no chute, e errar
 * com confiança alta é exatamente o que precisa aparecer para o aluno aprender.
 */
export function voteConfidence(state, participantId, level, { at = 0 } = {}) {
  const dynamic = state.dynamic;
  if (!dynamic) throw new ArenaError('Nenhum desafio coletivo aberto.');
  if (dynamic.revealed_at) throw new ArenaError('Este desafio já foi revelado.');
  const key = String(level || '').toLowerCase();
  if (!ARENA_CONFIDENCE.some((entry) => entry.key === key)) {
    throw new ArenaError('Escolha baixa, média ou alta confiança.');
  }
  const voter = String(participantId || '');
  if (!voter) throw new ArenaError('Confiança sem participante.');
  return {
    ...state,
    dynamic: { ...dynamic, confidence: { ...(dynamic.confidence || {}), [voter]: key } },
    updatedAt: at,
  };
}

/**
 * Calibração média da turma: 1 quando quem se diz confiante acerta, 0 quando a
 * confiança alta acompanha o erro. Sem previsão e confiança pareadas, não há
 * número — melhor não ter métrica do que ter métrica inventada.
 */
export function calibrationScore(dynamic) {
  const responses = dynamic?.responses || {};
  const confidence = dynamic?.confidence || {};
  const correctBy = dynamic?.correct_by;
  const isCorrect = (voter, choice) => (correctBy && typeof correctBy === 'object'
    ? String(correctBy[voter]) === String(choice)
    : String(dynamic?.correct) === String(choice));
  const weight = { baixa: 0.5, media: 0.75, alta: 1 };
  let sum = 0;
  let voters = 0;
  for (const [voter, choice] of Object.entries(responses)) {
    const level = confidence[voter];
    if (!level || !weight[level]) continue;
    voters += 1;
    sum += isCorrect(voter, choice) ? weight[level] : (1 - weight[level]);
  }
  return voters ? Math.round((sum / voters) * 100) / 100 : null;
}

/**
 * Acumula o placar de plateia de um desafio: quem acertou o olhar do Juiz e
 * quem declarou confiança alta. Nao decide nada sozinho — alimenta os premios.
 */
function accumulateAudience(state, dynamic) {
  const responses = dynamic.responses || {};
  const correctBy = dynamic.correct_by;
  const confidence = dynamic.confidence || {};
  const audience = { ...state.audience };
  // Só a dinâmica que ataca pontua como "olho clínico": são elas que pedem para
  // prever/identificar o que o Juiz vai fazer.
  const counts = Boolean(ARENA_DYNAMICS[dynamic.key]?.attacks);
  for (const [voter, choice] of Object.entries(responses)) {
    const bucket = { ...(audience[voter] || { hits: 0, answered: 0, calibration_sum: 0, calibration_n: 0 }) };
    bucket.answered += 1;
    if (correctBy && typeof correctBy === 'object' && correctBy[voter]) {
      if (String(correctBy[voter]) === String(choice)) bucket.hits += 1;
    } else if (counts && dynamic.correct && String(dynamic.correct) === String(choice)) {
      bucket.hits += 1;
    }
    const level = confidence[voter];
    if (level && { baixa: 1, media: 1, alta: 1 }[level]) {
      const isRight = correctBy && typeof correctBy === 'object' && correctBy[voter]
        ? String(correctBy[voter]) === String(choice)
        : Boolean(dynamic.correct) && String(dynamic.correct) === String(choice);
      const weight = { baixa: 0.5, media: 0.75, alta: 1 }[level];
      bucket.calibration_sum += isRight ? weight : (1 - weight);
      bucket.calibration_n += 1;
    }
    audience[voter] = bucket;
  }
  return audience;
}

/** Calibração média de cada aluno na plateia (0..1) ou null sem dado. */
export function audienceCalibration(entry) {
  if (!entry || !entry.calibration_n) return null;
  return Math.round((entry.calibration_sum / entry.calibration_n) * 100) / 100;
}

/**
 * Fecha o desafio: conta os votos, aplica o dano no Boss e alimenta a energia.
 * Quando a dinâmica não ataca (calibração, conselho, V1→V2), o resultado é
 * registrado mas nenhum coração sai — são dinâmicas de mérito individual.
 */
export function settleDynamic(state, { at = 0, correct = undefined, correctBy = undefined } = {}) {
  const dynamic = state.dynamic;
  if (!dynamic) throw new ArenaError('Nenhum desafio coletivo aberto.');
  // Fechar duas vezes NAO e fechar de novo: sem esta trava, o segundo pedido
  // (clique repetido, duas abas do professor, retentativa de rede) somava outro
  // ataque no historico, outro tanto de energia e outro coracao do Boss. O
  // resultado ja esta em `dynamic.result`; quem quer exibi-lo le de la.
  if (dynamic.revealed_at) throw new ArenaError('Este desafio coletivo ja foi fechado.');
  const definition = ARENA_DYNAMICS[dynamic.key];
  const resolvedCorrect = correct !== undefined ? correct : dynamic.correct;
  const resolvedBy = correctBy !== undefined ? correctBy : dynamic.correct_by;
  const tally = tallyResponses({ ...dynamic, correct: resolvedCorrect, correct_by: resolvedBy });
  const attack = definition?.attacks
    ? resolveAttack({ correct: tally.correct, total: tally.total, threshold: state.config.damageThreshold })
    : { correct: tally.correct, total: tally.total, accuracy: tally.total ? Math.round((tally.correct / tally.total) * 100) : 0, threshold: state.config.damageThreshold, needed: 0, damaged: false, empty: tally.total === 0 };

  let boss = state.boss;
  let next = { ...state, dynamic: { ...dynamic, revealed_at: at || dynamic.opened_at + 1, correct: resolvedCorrect ? String(resolvedCorrect) : null, result: { ...attack, votes: tally.votes, revision: revisionStats(dynamic) } } };

  if (attack.damaged) {
    const health = Math.max(0, boss.health - 1);
    boss = { ...boss, health, lastDamage: 1, defeatedAt: health === 0 ? at : null };
    next = { ...next, boss };
  } else if (!attack.empty) {
    boss = { ...boss, lastDamage: 0 };
    next = { ...next, boss };
  }
  if (!attack.empty) boss = { ...boss, lastAccuracy: attack.accuracy };

  const record = {
    round: dynamic.round,
    dynamic: dynamic.key,
    correct: attack.correct,
    total: attack.total,
    accuracy: attack.accuracy,
    damaged: attack.damaged,
    at,
  };
  next = { ...next, boss, attacks: [...state.attacks, record] };

  const boost = definition?.attacks ? energyForAttack(attack) : Math.min(3, Math.ceil(attack.total / 8));
  const { state: withEnergy, gained, unlocked } = gainEnergy(next, boost);
  withEnergy.audience = accumulateAudience(state, { ...dynamic, correct: resolvedCorrect, correct_by: resolvedBy });
  next = { ...withEnergy, updatedAt: at };
  next.dynamic = {
    ...next.dynamic,
    result: { ...next.dynamic.result, energy_gained: gained, powers_unlocked: unlocked },
  };
  if (next.boss.health === 0) next.phase = 'finished';
  return next;
}

/**
 * Fecha a rodada: guarda o resumo e decide se a partida continua (Boss de pé e
 * ainda há rodada) ou termina. É o único ponto que avança `round`.
 */
export function closeRound(state, { at = 0 } = {}) {
  const summary = {
    round: state.round,
    accuracy: state.boss.lastAccuracy,
    healthAfter: state.boss.health,
    attacks: state.attacks.filter((attack) => attack.round === state.round),
  };
  const next = { ...state, rounds: [...state.rounds, summary] };
  next.competitors = { ids: [], names: [], sources: [], wildcard: null };
  next.dynamic = null;
  next.updatedAt = at;
  if (next.boss.health <= 0) return { ...next, phase: 'finished' };
  if (next.round >= next.config.rounds) return { ...next, phase: 'finished' };
  return { ...next, round: next.round + 1, phase: 'mission' };
}

/** Usa um poder desbloqueado. Nenhum poder rouba ponto ou prejudica aluno. */
export function usePower(state, key, { at = 0, text = '' } = {}) {
  const power = ARENA_POWERS[key];
  if (!power) throw new ArenaError('Poder desconhecido.');
  if (!state.config.powers) throw new ArenaError('Os poderes estão desligados nesta partida.');
  if (!state.energy.unlocked.includes(key)) throw new ArenaError('Este poder ainda não foi desbloqueado.');
  if (state.energy.used.includes(key)) throw new ArenaError('Este poder já foi usado nesta partida.');
  return {
    ...state,
    energy: { ...state.energy, used: [...state.energy.used, key] },
    power_notes: [...state.power_notes, { power: key, text: String(text), at }],
    updatedAt: at,
  };
}

/** Times temporários: distribui a turma em PIXEL/NEURAL/BYTE, sempre renovável. */
export function assignTeams(participantIds, { rng = Math.random, previous = {} } = {}) {
  const roster = uniqueStrings(participantIds);
  const shuffled = sample(roster, roster.length, rng);
  const size = Math.ceil(shuffled.length / ARENA_TEAMS.length) || 1;
  const teams = {};
  ARENA_TEAMS.forEach((team, index) => {
    teams[team.key] = shuffled.slice(index * size, (index + 1) * size);
  });
  // Evita a mesma panela fixa: quem já esteve junto tende a trocar de time.
  if (Object.keys(previous).length) return { ...teams };
  return teams;
}

export function teamOf(teams, participantId) {
  const id = String(participantId);
  for (const team of ARENA_TEAMS) {
    if ((teams?.[team.key] || []).includes(id)) return team;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

/**
 * Reconhece competências diferentes em vez de um ranking único. A entrada é a
 * lista de competidores da partida com os dados que o motor já calculou:
 * percentual do Juiz, acertos nas dinâmicas coletivas e a evolução V1 -> V2.
 *
 * A competência decide os prêmios; a sorte nunca decide nada aqui.
 */
export function arenaAwards(entries = []) {
  const rows = (entries || []).filter((entry) => entry && entry.id);
  const best = (select, { min = 0 } = {}) => {
    const candidates = rows.filter((row) => Number(select(row) ?? 0) > min);
    if (!candidates.length) return null;
    return candidates.reduce((top, row) => (Number(select(row)) > Number(select(top)) ? row : top));
  };
  const champion = best((row) => row.percent);
  const analyst = best((row) => row.analyst_hits);
  const calibration = best((row) => row.calibration);
  const evolution = best((row) => row.evolution);
  const pick = (row, key) => (row ? { id: row.id, name: row.name, value: Number(row[key === 'percent' ? 'percent' : key] ?? 0) } : null);
  return {
    champion: pick(champion, 'percent'),
    analyst: pick(analyst, 'analyst_hits'),
    calibration: pick(calibration, 'calibration'),
    evolution: pick(evolution, 'evolution'),
  };
}

/**
 * O que cada tela precisa ler. A UI nunca recalcula regra: ela exibe isto.
 */
export function arenaView(state, { names = {}, participants = [] } = {}) {
  const nameOf = (id) => names[String(id)]
    || participants.find((entry) => String(entry.id) === String(id))?.name
    || 'Participante';
  const round = state.round;
  const roundAttacks = state.attacks.filter((attack) => attack.round === round);
  const attacksLeft = Math.max(0, state.config.attacksPerRound - roundAttacks.length);
  const wildcard = state.competitors.wildcard;
  const tally = state.dynamic?.revealed_at ? state.dynamic.result : null;
  return {
    mode: ARENA_GAME_MODE,
    enabled: true,
    phase: state.phase,
    phase_label: ARENA_PHASE_LABELS[state.phase] || state.phase,
    round,
    rounds: state.config.rounds,
    boss: {
      health: state.boss.health,
      max_health: state.boss.maxHealth,
      hearts: Array.from({ length: state.boss.maxHealth }, (_, index) => index < state.boss.health),
      last_accuracy: state.boss.lastAccuracy,
      last_damage: state.boss.lastDamage,
      defeated: state.boss.health <= 0,
    },
    energy: {
      value: state.energy.value,
      max: state.energy.max,
      percent: state.energy.max ? Math.round((state.energy.value / state.energy.max) * 100) : 0,
      unlocked: state.energy.unlocked,
      used: state.energy.used,
      powers: Object.values(ARENA_POWERS).map((power) => ({
        ...power,
        unlocked: state.energy.unlocked.includes(power.key),
        used: state.energy.used.includes(power.key),
      })),
    },
    competitors: state.competitors.ids.map((id, index) => ({
      id,
      name: nameOf(id),
      slot: ARENA_TEAM_NAMES[index] || String(index),
      source: state.competitors.sources[index] || 'draw',
    })),
    wildcard: wildcard ? {
      options: wildcard.options.map((option) => ({
        key: option.key,
        prompt: option.prompt,
        participant_id: option.participant_id,
        votes: Object.values(wildcard.votes).filter((value) => String(value) === option.key).length,
      })),
      votes: Object.keys(wildcard.votes).length,
      revealed: wildcard.revealed,
      winner_key: wildcard.winner_key,
      winner: wildcard.revealed
        ? { key: wildcard.winner_key, name: nameOf(wildcard.options.find((option) => option.key === wildcard.winner_key)?.participant_id) }
        : null,
    } : null,
    dynamic: state.dynamic ? {
      key: state.dynamic.key,
      label: ARENA_DYNAMICS[state.dynamic.key]?.label || state.dynamic.key,
      question: state.dynamic.question,
      options: state.dynamic.options,
      hint: state.dynamic.hint || '',
      first_total: state.dynamic.first_responses ? Object.keys(state.dynamic.first_responses).length : 0,
      needs_confidence: state.dynamic.key === 'calibracao',
      my_confidence: null,
      opened_at: state.dynamic.opened_at,
      closes_at: state.dynamic.closes_at,
      revealed: Boolean(state.dynamic.revealed_at),
      result: tally ? {
        correct: tally.correct,
        total: tally.total,
        accuracy: tally.accuracy,
        needed: tally.needed,
        damaged: tally.damaged,
        empty: Boolean(tally.empty),
        votes: tally.votes,
        correct_key: state.dynamic.correct,
        revision: tally.revision || null,
      } : null,
    } : null,
    attacks: roundAttacks.map((attack) => ({ ...attack })),
    attacks_left: attacksLeft,
    // Só o suficiente para a tela contar a história: nunca a fórmula inteira.
    threshold: Math.round(state.config.damageThreshold * 100),
    teams: state.config.teams,
    powers_enabled: state.config.powers,
    dynamics_mode: state.config.dynamicsMode,
    power_notes: state.power_notes.map((note) => ({ ...note, label: ARENA_POWERS[note.power]?.label || note.power })),
    // Placar de plateia: quantos desafios cada aluno leu certo o Juiz.
    audience: Object.entries(state.audience).map(([participant_id, entry]) => ({
      participant_id,
      name: nameOf(participant_id),
      hits: Number(entry?.hits || 0),
      answered: Number(entry?.answered || 0),
      calibration: audienceCalibration(entry),
    })).sort((left, right) => right.hits - left.hits),
    awards: state.awards,
    history: state.rounds.map((entry) => ({ ...entry })),
    finished: state.phase === 'finished',
  };
}
