import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_DEFAULTS,
  ARENA_DYNAMICS,
  ARENA_POWERS,
  ArenaError,
  arenaAwards,
  arenaConfig,
  arenaView,
  buildWildcard,
  closeRound,
  competitorPlan,
  emptyArenaState,
  energyForAttack,
  gainEnergy,
  isArenaRoom,
  normalizeArenaState,
  openDynamic,
  pickCompetitors,
  resolveAttack,
  settleDynamic,
  settleWildcard,
  setCompetitors,
  usePower,
  voteDynamic,
  voteWildcard,
} from '../../src/domain/arena-mode.mjs';

const ids = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);

test('a regra dos 60% é inclusiva e usa quem respondeu, não a turma inteira', () => {
  // 17 de 27 = 62,96% -> dano
  assert.deepEqual(
    (({ damaged, accuracy, needed }) => ({ damaged, accuracy, needed }))(resolveAttack({ correct: 17, total: 27 })),
    { damaged: true, accuracy: 63, needed: 17 },
  );
  // 16 de 27 = 59,26% -> resiste
  assert.equal(resolveAttack({ correct: 16, total: 27 }).damaged, false);
  // exatamente 60% (3 de 5) derruba o coração
  assert.equal(resolveAttack({ correct: 3, total: 5 }).damaged, true);
  // ninguém respondeu: não há ataque, não há dano
  assert.equal(resolveAttack({ correct: 0, total: 0 }).damaged, false);
  assert.equal(resolveAttack({ correct: 0, total: 0 }).empty, true);
  // o professor pode configurar um corte mais duro
  assert.equal(resolveAttack({ correct: 8, total: 10, threshold: 0.9 }).damaged, false);
});

test('configuração normaliza e aceita percentual solto', () => {
  const config = arenaConfig({ rounds: 99, bossMaxHealth: 0, damageThreshold: 75, attacksPerRound: 9, teams: 1 });
  assert.equal(config.rounds, 6);
  assert.equal(config.bossMaxHealth, 1);
  assert.equal(config.damageThreshold, 0.75);
  assert.equal(config.attacksPerRound, 3);
  assert.equal(config.teams, true);
  assert.deepEqual(arenaConfig({}).rounds, ARENA_DEFAULTS.rounds);
});

test('só a sala que declara gameMode arena entra no modo', () => {
  assert.equal(isArenaRoom({ settings: { gameMode: 'arena' } }), true);
  assert.equal(isArenaRoom({ settings: {} }), false);
  assert.equal(isArenaRoom({ settings: { judgeKind: 'classic' } }), false);
  assert.equal(isArenaRoom(null), false);
});

test('estado corrompido no disco nunca derruba a partida', () => {
  const state = normalizeArenaState({
    phase: 'banana', round: -3, boss: { health: 99 }, energy: { value: -5, unlocked: ['hack'] },
    competitors: { ids: ['a', 'a', 'b', 'c', 'd'], names: ['A'] }, attacks: [{ round: 2, total: 4, correct: 9 }],
  });
  assert.equal(state.phase, 'mission');
  assert.equal(state.round, 1);
  assert.equal(state.boss.health, ARENA_DEFAULTS.bossMaxHealth);
  assert.equal(state.energy.value, 0);
  assert.deepEqual(state.energy.unlocked, []);
  assert.deepEqual(state.competitors.ids, ['a', 'b', 'c']);
  // correct nunca pode passar do total (lixo vira número coerente)
  assert.equal(state.attacks[0].correct, 4);
  assert.equal(normalizeArenaState(null).phase, 'mission');
});

test('o ataque respeita o teto de ataques por rodada', () => {
  let state = emptyArenaState({ attacksPerRound: 1 });
  state = openDynamic(state, { key: 'prever', options: [{ key: 'A', label: 'A' }, { key: 'B', label: 'B' }], correct: 'A', at: 10 });
  state = settleDynamic(state, { at: 20 });
  assert.equal(state.phase, 'dynamic');
  assert.throws(
    () => openDynamic(state, { key: 'cacada', options: [{ key: 'objetivo', label: 'Objetivo' }], at: 30 }),
    ArenaError,
  );
  // dinâmica que não ataca continua liberada
  const soft = openDynamic({ ...state, config: { ...state.config, attacksPerRound: 1 } }, { key: 'v1v2', options: [], at: 30 });
  assert.equal(soft.dynamic.key, 'v1v2');
});

test('dinâmica coletiva correta fere o Boss; errada ele resiste', () => {
  let state = emptyArenaState();
  state = openDynamic(state, {
    key: 'prever', correct: 'A', at: 100,
    options: [{ key: 'A', label: 'Ana' }, { key: 'B', label: 'Bia' }, { key: 'C', label: 'Caio' }],
  });
  for (let index = 0; index < 30; index += 1) {
    state = voteDynamic(state, `p${index}`, index < 18 ? 'A' : 'B', { at: 110 });
  }
  state = settleDynamic(state, { at: 120 });
  assert.equal(state.boss.health, 4);
  assert.equal(state.boss.lastAccuracy, 60);
  assert.equal(state.boss.lastDamage, 1);
  assert.equal(state.dynamic.result.damaged, true);
  assert.equal(state.dynamic.result.needed, 18);
});

test('a dinâmica de calibração não tira coração nenhum', () => {
  let state = emptyArenaState();
  state = openDynamic(state, { key: 'calibracao', correct: 'A', at: 0, options: [{ key: 'A', label: 'A' }, { key: 'B', label: 'B' }] });
  for (let index = 0; index < 10; index += 1) state = voteDynamic(state, `p${index}`, 'A', { at: 5 });
  state = settleDynamic(state, { at: 9 });
  assert.equal(state.boss.health, state.boss.maxHealth);
  assert.equal(state.dynamic.result.accuracy, 100);
  assert.equal(state.dynamic.result.damaged, false);
  assert.ok(state.energy.value > 0, 'participação ainda alimenta a energia');
});

test('voto é trocável, um por aluno, e fecha com o tempo', () => {
  let state = openDynamic(emptyArenaState(), {
    key: 'cacada', correct: 'clareza', durationSeconds: 30, at: 100,
    options: [{ key: 'clareza', label: 'Clareza' }, { key: 'objetivo', label: 'Objetivo' }],
  });
  state = voteDynamic(state, 'aluno', 'objetivo', { at: 110 });
  state = voteDynamic(state, 'aluno', 'clareza', { at: 115 });
  assert.deepEqual(state.dynamic.responses, { aluno: 'clareza' });
  assert.throws(() => voteDynamic(state, 'aluno', 'nao-existe', { at: 116 }), ArenaError);
  assert.throws(() => voteDynamic(state, 'outro', 'clareza', { at: 200 }), ArenaError);
  const revealed = settleDynamic(state, { at: 130 });
  assert.throws(() => voteDynamic(revealed, 'outro', 'clareza', { at: 131 }), ArenaError);
  // Fechar de novo nao e fechar de novo: o efeito (ataque, energia, coracao) ja
  // foi aplicado, e repetir somaria tudo outra vez.
  assert.throws(() => settleDynamic(revealed, { at: 140 }), ArenaError);
});

test('energia sobe com participação e desbloqueia poderes por marco', () => {
  assert.equal(energyForAttack({ total: 0, damaged: false }), 0);
  assert.equal(energyForAttack({ total: 20, damaged: true }), 11);
  // Metade da turma ja enche a barra de participacao (o teto e da barra, nao do tamanho da sala).
  assert.equal(energyForAttack({ total: 60, damaged: false }), 8);
  let state = emptyArenaState();
  let gained = null;
  for (let index = 0; index < 4; index += 1) {
    const step = gainEnergy(state, 10);
    state = step.state;
    gained = step;
  }
  assert.equal(state.energy.value, 40);
  assert.deepEqual(state.energy.unlocked, ['pista', 'conselho', 'revisao', 'regra']);
  assert.deepEqual(gained.unlocked, ['regra']);
  assert.equal(state.energy.max, 40);
});

test('poder exige desbloqueio e só funciona uma vez', () => {
  const locked = emptyArenaState();
  assert.throws(() => usePower(locked, 'pista'), ArenaError);
  const open = gainEnergy(emptyArenaState(), 10).state;
  const used = usePower(open, 'pista', { at: 5 });
  assert.deepEqual(used.energy.used, ['pista']);
  assert.throws(() => usePower(used, 'pista'), ArenaError);
  const off = gainEnergy(emptyArenaState({ powers: false }), 10).state;
  assert.throws(() => usePower(off, 'pista'), ArenaError);
  assert.deepEqual(unlockedOf(off), []);
});

function unlockedOf(state) {
  return state.energy.unlocked;
}

test('rotação prefere quem ainda não competiu', () => {
  let state = emptyArenaState();
  state = { ...state, competed: ['a', 'b', 'c'] };
  const picked = pickCompetitors(state, ['a', 'b', 'c', 'd', 'e', 'f'], { count: 3, rng: () => 0 });
  assert.deepEqual(picked.sort(), ['d', 'e', 'f']);
  // sem gente nova suficiente, quem já competiu completa a vaga
  const again = pickCompetitors(state, ['a', 'b', 'c', 'd'], { count: 3, rng: () => 0 });
  assert.equal(again.length, 3);
  assert.ok(again.includes('d'));
});

test('o plano de competidores usa Wild Card na primeira e na última rodada', () => {
  const config = arenaConfig({ rounds: 3 });
  assert.deepEqual(competitorPlan(1, config), { total: 3, fromWildCard: 1, drawn: 2, wildcard: true });
  assert.deepEqual(competitorPlan(2, config), { total: 3, fromWildCard: 0, drawn: 3, wildcard: false });
  assert.deepEqual(competitorPlan(3, config), { total: 3, fromWildCard: 1, drawn: 2, wildcard: true });
  assert.equal(competitorPlan(1, config, false).wildcard, false);
});

test('Wild Card é anônimo, quem está nele não vota e o mais votado entra', () => {
  let state = { ...emptyArenaState(), competitors: { ids: ['x', 'y'], names: [], sources: [], wildcard: null } };
  const wildcard = buildWildcard(state, [
    { participant_id: 'a', prompt: 'prompt a' },
    { participant_id: 'b', prompt: 'prompt b' },
    { participant_id: 'c', prompt: 'prompt c' },
    { participant_id: 'x', prompt: 'já está na arena' },
    { participant_id: 'z', prompt: '' },
  ], { rng: () => 0 });
  assert.equal(wildcard.options.length, 3);
  assert.deepEqual(wildcard.options.map((option) => option.key), ['A', 'B', 'C']);
  assert.ok(!wildcard.options.some((option) => option.participant_id === 'x'));
  state = { ...state, competitors: { ...state.competitors, wildcard } };
  assert.throws(() => voteWildcard(state, wildcard.options[0].participant_id, 'B'), ArenaError);
  state = voteWildcard(state, 'voter1', 'B');
  state = voteWildcard(state, 'voter2', 'b');
  state = voteWildcard(state, 'voter1', 'B');
  state = settleWildcard(state, { at: 50 });
  assert.equal(state.competitors.ids.length, 3);
  assert.equal(state.competitors.wildcard.winner_key, 'B');
  assert.equal(state.competitors.wildcard.revealed, true);
  assert.throws(() => voteWildcard(state, 'voter3', 'A'), ArenaError);
});

test('fechar a rodada devolve a turma ao balaio e avança só quando faz sentido', () => {
  let state = emptyArenaState({ rounds: 3 });
  state = setCompetitors(state, ['a', 'b', 'c'], { at: 1 });
  state = { ...state, competed: ['a', 'b', 'c'] };
  const next = closeRound(state, { at: 9 });
  assert.equal(next.round, 2);
  assert.equal(next.phase, 'mission');
  assert.deepEqual(next.competitors.ids, []);
  assert.equal(next.rounds.length, 1);
  // última rodada encerra a partida
  const last = closeRound({ ...next, round: 3, competitors: { ids: [], names: [], sources: [], wildcard: null } }, { at: 10 });
  assert.equal(last.phase, 'finished');
});

test('Boss zerado encerra a partida na hora', () => {
  let state = emptyArenaState({ bossMaxHealth: 1 });
  state = openDynamic(state, { key: 'prever', correct: 'A', at: 0, options: [{ key: 'A', label: 'A' }, { key: 'B', label: 'B' }] });
  for (let index = 0; index < 5; index += 1) state = voteDynamic(state, `p${index}`, 'A', { at: 1 });
  state = settleDynamic(state, { at: 2 });
  assert.equal(state.boss.health, 0);
  assert.equal(state.phase, 'finished');
  assert.equal(state.boss.defeatedAt, 2);
});

test('prêmios reconhecem competências diferentes, nunca sorte', () => {
  const awards = arenaAwards([
    { id: 'a', name: 'Ana', percent: 92, analyst_hits: 3, calibration: 0.4, evolution: 10 },
    { id: 'b', name: 'Bia', percent: 55, analyst_hits: 7, calibration: 0.9, evolution: 0 },
    { id: 'c', name: 'Caio', percent: 70, analyst_hits: 2, calibration: 0.6, evolution: 35 },
  ]);
  assert.equal(awards.champion.name, 'Ana');
  assert.equal(awards.analyst.name, 'Bia');
  assert.equal(awards.calibration.name, 'Bia');
  assert.equal(awards.evolution.name, 'Caio');
  // sem dado positivo não há prêmio inventado
  const empty = arenaAwards([{ id: 'a', name: 'Ana', percent: 0 }]);
  assert.equal(empty.champion, null);
  assert.equal(empty.evolution, null);
});

test('a visão é o que a tela lê: corações, competidores, energia e fase', () => {
  let state = emptyArenaState({ bossMaxHealth: 3 });
  state = setCompetitors(state, ['a', 'b', 'c'], { at: 1 });
  state = { ...state, competitors: { ...state.competitors, names: [] } };
  const view = arenaView(state, { names: { a: 'Ana', b: 'Bia', c: 'Caio' } });
  assert.equal(view.enabled, true);
  assert.equal(view.phase, 'arena');
  assert.equal(view.boss.health, 3);
  assert.deepEqual(view.boss.hearts, [true, true, true]);
  assert.deepEqual(view.competitors.map((entry) => entry.name), ['Ana', 'Bia', 'Caio']);
  assert.deepEqual(view.competitors.map((entry) => entry.slot), ['A', 'B', 'C']);
  assert.equal(view.threshold, 60);
  assert.equal(view.attacks_left, 2);
  assert.deepEqual(view.energy.powers.map((power) => power.unlocked), [false, false, false, false]);
  assert.equal(ARENA_DYNAMICS.prever.attacks, true);
  assert.equal(ARENA_POWERS.pista.at, 10);
});
