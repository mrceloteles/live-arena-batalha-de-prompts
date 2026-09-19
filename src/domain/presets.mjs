/**
 * Preset catalog for the unified room engine.
 *
 * A preset is declarative configuration only: it produces the room's initial
 * `settings` and decides which content to seed. It never duplicates engine
 * code. The engine itself is the same for every preset; settings route
 * judging, scoring, ranking and pacing.
 *
 * Presets (extensible):
 *   classic       -> the original Batalha: 3 jogadores, 3 rounds de 60s,
 *                    juiz/pontuacao/ranking classicos (imagem -> prompt).
 *   turma         -> a mesma batalha classica em escala (ate 50), para a
 *                    turma inteira jogar ao mesmo tempo.
 *   personalizado -> sala de missoes da Arena (juiz por criterios), com tudo
 *                    configuravel e desafios escolhidos pelo professor.
 *
 * Locked settings cannot be overridden at creation time; they guarantee that a
 * preset keeps its identity (e.g. "classic" is always 3 players).
 */

export const PRESET_KEYS = Object.freeze(['classic', 'turma', 'personalizado', 'arena']);

export const CONTENT_SOURCES = Object.freeze(['classic-rounds', 'challenge-bank']);
export const JUDGE_KINDS = Object.freeze(['classic', 'criteria']);
export const SCORING_MODES = Object.freeze(['classic', 'arena']);
export const RANKING_MODES = Object.freeze(['classic', 'arena']);

/**
 * Modo de jogo. `classic` e tudo que ja existia (inclui `turma` e
 * `personalizado`); `arena` liga a camada Turma vs. Juiz. As regras do modo
 * Arena moram em src/domain/arena-mode.mjs e so entram em cena quando a sala
 * declara `gameMode: 'arena'` — nenhum preset antigo muda de comportamento.
 */
export const GAME_MODES = Object.freeze(['classic', 'arena']);

export const ROOM_LIMITS = Object.freeze({
  maxPlayers: { min: 1, max: 50 },
  rounds: { min: 0, max: 12 }, // 0 = indefinido (professor decide pelas missoes)
  roundDuration: { min: 10, max: 600 },
  resultsDuration: { min: 3, max: 120 },
  finalResultsDuration: { min: 10, max: 300 },
});

function clamp(value, { min, max }, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

const CLASSIC_RULES = Object.freeze({
  scoringMode: 'classic',
  rankingMode: 'classic',
  judgeKind: 'classic',
  contentSource: 'classic-rounds',
  rosterLocksAtStart: true,
  gameMode: 'classic',
});

export const PRESETS = Object.freeze({
  classic: Object.freeze({
    key: 'classic',
    label: 'Clássico',
    shortLabel: 'CLÁSSICO',
    description: '3 jogadores, 3 rounds de 60s com o juiz original preservado.',
    defaults: Object.freeze({
      maxPlayers: 3,
      rounds: 3,
      roundDuration: 60,
      resultsDuration: 10,
      finalResultsDuration: 30,
    }),
    rules: CLASSIC_RULES,
    lockSettings: Object.freeze([
      'maxPlayers', 'rounds', 'roundDuration', 'resultsDuration', 'finalResultsDuration',
    ]),
  }),
  turma: Object.freeze({
    key: 'turma',
    label: 'Turma',
    shortLabel: 'TURMA',
    description: 'A batalha clássica para a turma inteira (até 50 jogadores).',
    defaults: Object.freeze({
      maxPlayers: 35,
      rounds: 3,
      roundDuration: 60,
      resultsDuration: 10,
      finalResultsDuration: 30,
    }),
    rules: Object.freeze({ ...CLASSIC_RULES, rosterLocksAtStart: false }),
    lockSettings: Object.freeze([
      'rounds', 'roundDuration', 'resultsDuration', 'finalResultsDuration',
      'scoringMode', 'rankingMode', 'judgeKind', 'contentSource',
    ]),
  }),
  personalizado: Object.freeze({
    key: 'personalizado',
    label: 'Personalizado',
    shortLabel: 'PERSONALIZADO',
    description: 'Sala de missões de Engenharia de Prompt, totalmente configurável.',
    defaults: Object.freeze({
      maxPlayers: 35,
      rounds: 0, // indefinido: o professor adiciona as missões que quiser
      roundDuration: 0, // por desafio: cada missão define seu tempo
      resultsDuration: 0, // manual: o professor avança os resultados
      finalResultsDuration: 0,
    }),
    rules: Object.freeze({
      scoringMode: 'arena',
      rankingMode: 'arena',
      judgeKind: 'criteria',
      contentSource: 'challenge-bank',
      rosterLocksAtStart: false,
      gameMode: 'classic',
    }),
    lockSettings: Object.freeze(['scoringMode', 'rankingMode', 'judgeKind', 'contentSource']),
  }),
  /**
   * ARENA — Turma vs. Juiz.
   *
   * Mesmo motor (missões do banco, juiz por critérios), mais a camada coletiva:
   * todos escrevem, 3 vão à Arena e a turma ataca o Juiz IA com desafios
   * coletivos. O `gameMode` é a chave que isola o modo — nenhum outro preset o
   * declara, então nada do Clássico muda.
   */
  arena: Object.freeze({
    key: 'arena',
    label: 'Arena — Turma vs. Juiz',
    shortLabel: 'ARENA',
    description: 'Todos escrevem, 3 vão à Arena e a turma derruba o Juiz IA em desafios coletivos.',
    defaults: Object.freeze({
      maxPlayers: 35,
      rounds: 3,
      roundDuration: 0, // por missão: cada desafio define seu tempo
      resultsDuration: 0,
      finalResultsDuration: 0,
      arenaRounds: 3,
      arenaBossHealth: 5,
      arenaDamageThreshold: 60,
      arenaAttacksPerRound: 2,
    }),
    rules: Object.freeze({
      scoringMode: 'arena',
      rankingMode: 'arena',
      judgeKind: 'criteria',
      contentSource: 'challenge-bank',
      rosterLocksAtStart: false,
      gameMode: 'arena',
    }),
    lockSettings: Object.freeze(['scoringMode', 'rankingMode', 'judgeKind', 'contentSource', 'gameMode']),
  }),
});

export function requirePreset(key) {
  const preset = PRESETS[String(key ?? '').toLowerCase()];
  if (!preset) throw new RangeError(`preset desconhecido: ${key}`);
  return preset;
}

export function isPresetKey(value) {
  return Object.prototype.hasOwnProperty.call(PRESETS, String(value ?? '').toLowerCase());
}

function clampSetting(name, value, fallback, locked) {
  if (locked) return fallback;
  const limits = ROOM_LIMITS[name];
  return limits ? clamp(value, limits, fallback) : value;
}

/**
 * Builds the normalized settings object for a room created from `presetKey`,
 * honoring the preset's locked settings and clamping the rest.
 * `overrides` mirrors the API payload (may use loose values or undefined).
 */
export function roomSettingsFor(presetKey, overrides = {}) {
  const preset = requirePreset(presetKey);
  const defaults = preset.defaults;
  const rules = preset.rules;
  const locked = new Set(preset.lockSettings || []);

  const numeric = (name, fallback) => clampSetting(name, overrides[name], fallback, locked.has(name));

  const settings = {
    preset: preset.key,
    maxPlayers: numeric('maxPlayers', defaults.maxPlayers),
    rounds: numeric('rounds', defaults.rounds),
    roundDuration: numeric('roundDuration', defaults.roundDuration),
    resultsDuration: numeric('resultsDuration', defaults.resultsDuration),
    finalResultsDuration: numeric('finalResultsDuration', defaults.finalResultsDuration),
    scoringMode: rules.scoringMode,
    rankingMode: rules.rankingMode,
    judgeKind: rules.judgeKind,
    contentSource: rules.contentSource,
    rosterLocksAtStart: rules.rosterLocksAtStart,
    gameMode: rules.gameMode || 'classic',
  };
  // A configuração do modo Arena só existe em salas do modo Arena: presets
  // antigos continuam com exatamente as mesmas settings de antes.
  if (settings.gameMode === 'arena') {
    settings.arenaRounds = clampInt(overrides.arenaRounds, 1, 6, defaults.arenaRounds ?? 3);
    settings.arenaBossHealth = clampInt(overrides.arenaBossHealth, 1, 10, defaults.arenaBossHealth ?? 5);
    settings.arenaDamageThreshold = clampInt(overrides.arenaDamageThreshold, 5, 100, defaults.arenaDamageThreshold ?? 60);
    settings.arenaAttacksPerRound = clampInt(overrides.arenaAttacksPerRound, 1, 3, defaults.arenaAttacksPerRound ?? 2);
    settings.arenaTeams = Boolean(overrides.arenaTeams ?? false);
    settings.arenaPowers = overrides.arenaPowers === undefined ? true : Boolean(overrides.arenaPowers);
    settings.arenaDynamicsMode = String(overrides.arenaDynamicsMode ?? 'auto').toLowerCase() === 'manual' ? 'manual' : 'auto';
  }
  return settings;
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Human summary used by the host cockpit, e.g. "3 jogadores · 3 rounds · 60s". */
export function describeSettings(settings) {
  const players = `${settings.maxPlayers} jogadores`;
  const rounds = settings.rounds > 0 ? `${settings.rounds} rounds` : 'missões livres';
  const duration = settings.roundDuration > 0
    ? `${settings.roundDuration}s por round`
    : 'tempo por missão';
  const judge = settings.judgeKind === 'classic' ? 'juiz clássico' : 'juiz por critérios';
  if (settings.gameMode === 'arena') {
    return `${players} · turma vs. juiz · ${settings.arenaRounds ?? 3} rodadas · boss ${settings.arenaBossHealth ?? 5} ❤️`;
  }
  return `${players} · ${rounds} · ${duration} · ${judge}`;
}
