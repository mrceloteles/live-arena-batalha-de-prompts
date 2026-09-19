import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  blockersMessage, hasGabarito, missionIssues, requiresImage, roomBlockers,
} from '../../src/domain/room-readiness.mjs';

const textMission = {
  title: 'Precisao: cartaz', modality: 'precisao', category: 'Fundamentos',
  referenceText: 'Cartaz A3 da feira, com data, local e contato.', referenceImage: '',
};
const visualMission = {
  title: 'Reversa: cartaz', modality: 'reversa', category: 'Imagem',
  referenceText: 'Cartaz vertical de festival, tipografia grande, paleta neon.', referenceImage: '',
};
const classicMission = {
  title: 'Batalha Classica — Desafio 1', modality: 'precisao', category: 'Classico', judgeKind: 'classic',
  referencePrompt: 'Uma mulher sorridente tira uma selfie numa trilha de montanha.',
  referenceImage: '/public/assets/figma/prompt-sample.png', referenceText: '',
};

test('missao de texto so exige gabarito; imagem nao e obrigatoria', () => {
  assert.equal(requiresImage(textMission), false);
  assert.deepEqual(missionIssues(textMission), []);
  assert.deepEqual(missionIssues({ ...textMission, referenceText: '' }), ['gabarito']);
});

test('missao visual exige imagem e gabarito, e aponta os dois', () => {
  assert.equal(requiresImage(visualMission), true);
  assert.deepEqual(missionIssues(visualMission), ['imagem']);
  assert.deepEqual(missionIssues({ ...visualMission, referenceText: '' }), ['imagem', 'gabarito']);
  assert.deepEqual(missionIssues({ ...visualMission, referenceImage: '/img/cartaz.png' }), []);
});

test('resultado esperado tambem conta como gabarito', () => {
  assert.equal(hasGabarito({ expectedResult: 'Prompt curto e completo.' }), true);
  assert.equal(hasGabarito({ referenceText: '   ' }), false);
  assert.deepEqual(missionIssues({ modality: 'essencial', expectedResult: 'Resumo em 3 frases.' }), []);
});

test('juiz classico exige imagem e usa o prompt de referencia como gabarito', () => {
  assert.equal(requiresImage(classicMission), true);
  assert.deepEqual(missionIssues(classicMission), []);
  assert.deepEqual(missionIssues({ ...classicMission, referenceImage: '' }), ['imagem']);
  assert.deepEqual(missionIssues({ ...classicMission, referencePrompt: '' }), ['gabarito']);
});

test('sala sem missoes prontas lista cada pendencia por posicao', () => {
  const blockers = roomBlockers([
    { position: 1, title: 'Sem gabarito', challenge: { modality: 'precisao' } },
    { position: 2, title: 'Reversa sem imagem', challenge: visualMission },
    { position: 3, title: 'Pronta', challenge: textMission },
  ]);
  assert.deepEqual(blockers, [
    { position: 1, title: 'Sem gabarito', missing: ['gabarito'] },
    { position: 2, title: 'Reversa sem imagem', missing: ['imagem'] },
  ]);
  assert.equal(roomBlockers([]).length, 0);
  assert.equal(blockersMessage([]), '');
  assert.match(blockersMessage(blockers), /Missão 1 — Sem gabarito: sem gabarito/);
  assert.match(blockersMessage(blockers), /Missão 2 — Reversa sem imagem: sem imagem/);
  assert.match(blockersMessage(blockers.slice(0, 1)), /Corrija esta missão/);
  assert.match(blockersMessage(blockers), /Corrija estas 2 missões/);
});
