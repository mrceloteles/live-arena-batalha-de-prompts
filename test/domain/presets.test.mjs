import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PRESETS, describeSettings, isPresetKey, requirePreset, roomSettingsFor,
} from '../../src/domain/presets.mjs';

test('catalog ships the official presets', () => {
  assert.deepEqual(Object.keys(PRESETS).sort(), ['arena', 'classic', 'personalizado', 'turma']);
  assert.equal(isPresetKey('classic'), true);
  assert.equal(isPresetKey('TURMA'), true);
  assert.equal(isPresetKey('ARENA'), true);
  assert.equal(isPresetKey('hackathon'), false);
  assert.throws(() => requirePreset('hackathon'), /preset desconhecido/);
});

test('arena preset is the only one that turns on the game mode', () => {
  const arena = roomSettingsFor('arena', { arenaRounds: 4, arenaBossHealth: 3, arenaDamageThreshold: 75 });
  assert.equal(arena.gameMode, 'arena');
  assert.equal(arena.judgeKind, 'criteria');
  assert.equal(arena.contentSource, 'challenge-bank');
  assert.equal(arena.arenaRounds, 4);
  assert.equal(arena.arenaBossHealth, 3);
  assert.equal(arena.arenaDamageThreshold, 75);
  assert.match(describeSettings(arena), /turma vs\. juiz/);
  // O Modo Clássico permanece exatamente como era.
  assert.equal(roomSettingsFor('classic', {}).gameMode, 'classic');
  assert.equal(roomSettingsFor('turma', {}).gameMode, 'classic');
  assert.equal(roomSettingsFor('personalizado', {}).gameMode, 'classic');
  // E nenhum preset antigo ganha configuração de Arena.
  assert.equal(roomSettingsFor('classic', {}).arenaBossHealth, undefined);
  assert.equal(roomSettingsFor('personalizado', {}).arenaBossHealth, undefined);
});

test('classic preset keeps the original battle rules locked', () => {
  const settings = roomSettingsFor('classic', {
    maxPlayers: 12, rounds: 9, roundDuration: 999, resultsDuration: 1,
  });
  assert.equal(settings.preset, 'classic');
  assert.equal(settings.maxPlayers, 3);
  assert.equal(settings.rounds, 3);
  assert.equal(settings.roundDuration, 60);
  assert.equal(settings.resultsDuration, 10);
  assert.equal(settings.finalResultsDuration, 30);
  assert.equal(settings.scoringMode, 'classic');
  assert.equal(settings.rankingMode, 'classic');
  assert.equal(settings.judgeKind, 'classic');
  assert.equal(settings.contentSource, 'classic-rounds');
  assert.equal(settings.rosterLocksAtStart, true);
  assert.equal(settings.gameMode, 'classic');
});

test('turma preset keeps classic rules but allows a configurable roster', () => {
  const settings = roomSettingsFor('turma', { maxPlayers: 42, roundDuration: 5 });
  assert.equal(settings.maxPlayers, 42);
  assert.equal(settings.rounds, 3);
  assert.equal(settings.roundDuration, 60); // locked
  assert.equal(settings.judgeKind, 'classic');
  assert.equal(settings.rosterLocksAtStart, false);
});

test('personalizado preset allows full numeric configuration', () => {
  const settings = roomSettingsFor('personalizado', {
    maxPlayers: 30, rounds: 5, roundDuration: 90, resultsDuration: 15, finalResultsDuration: 45,
  });
  assert.equal(settings.maxPlayers, 30);
  assert.equal(settings.rounds, 5);
  assert.equal(settings.roundDuration, 90);
  assert.equal(settings.resultsDuration, 15);
  assert.equal(settings.finalResultsDuration, 45);
  assert.equal(settings.judgeKind, 'criteria');
  assert.equal(settings.contentSource, 'challenge-bank');
});

test('overrides are clamped to the shared room limits', () => {
  const settings = roomSettingsFor('personalizado', {
    maxPlayers: 9000, rounds: 99, roundDuration: 1, resultsDuration: -4,
  });
  assert.equal(settings.maxPlayers, 50);
  assert.equal(settings.rounds, 12);
  assert.equal(settings.roundDuration, 10);
  assert.equal(settings.resultsDuration, 3);
});

test('default personalizado is manual-paced and challenge-driven', () => {
  const settings = roomSettingsFor('personalizado');
  assert.equal(settings.maxPlayers, 35);
  assert.equal(settings.rounds, 0);
  assert.equal(settings.roundDuration, 0);
  assert.equal(settings.resultsDuration, 0);
});

test('describeSettings renders a cockpit-friendly summary', () => {
  const classic = describeSettings(roomSettingsFor('classic'));
  assert.match(classic, /3 jogadores/);
  assert.match(classic, /3 rounds/);
  assert.match(classic, /60s por round/);
  assert.match(classic, /juiz clássico/);
  const custom = describeSettings(roomSettingsFor('personalizado'));
  assert.match(custom, /35 jogadores/);
  assert.match(custom, /missões livres/);
  assert.match(custom, /juiz por critérios/);
});
