import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateArenaPoints, speedFactor, weightedPercent } from '../../src/domain/arena-scoring.mjs';

test('quality always dominates speed across every weight setting', () => {
  const duration = 120;
  const scenarios = ['none', 'low', 'medium', 'high'];
  for (const weight of scenarios) {
    // Bom prompt enviado no fim vence prompt ruim enviado no inicio.
    const goodLate = calculateArenaPoints(85, duration - 1, duration, weight);
    const badEarly = calculateArenaPoints(40, 1, duration, weight);
    assert.ok(goodLate > badEarly, `${weight}: goodLate=${goodLate} badEarly=${badEarly}`);
  }
});

test('speed factor is bounded and monotonic with remaining time', () => {
  assert.equal(speedFactor('none', 0.5), 1);
  assert.ok(speedFactor('high', 1) > speedFactor('high', 0));
  assert.ok(speedFactor('medium', 0.9) >= 0.9 && speedFactor('medium', 0.9) <= 1.1);
  assert.ok(speedFactor('low', 1) > speedFactor('low', 0));
  assert.ok(speedFactor('high', 0) >= 0.8 && speedFactor('high', 0) <= 1.2);
});

test('weighted percent combines criterion points by weight', () => {
  const weights = { objetivo: 30, contexto: 25, formato: 20, restricoes: 15, criatividade: 10 };
  const perfect = weightedPercent({ objetivo: 20, contexto: 20, formato: 20, restricoes: 20, criatividade: 20 }, weights);
  assert.equal(perfect, 100);
  const half = weightedPercent({ objetivo: 10, contexto: 10, formato: 10, restricoes: 10, criatividade: 10 }, weights);
  assert.equal(half, 50);
  // (20*30 + 10*25 + 10*20 + 10*15 + 0*10) / (100*20) = 60%
  const mixed = weightedPercent({ objetivo: 20, contexto: 10, formato: 10, restricoes: 10, criatividade: 0 }, weights);
  assert.equal(mixed, 60);
});

test('weighted percent validates ranges', () => {
  assert.throws(() => weightedPercent({ objetivo: 25 }, { objetivo: 1 }), /between 0 and 20/);
  assert.throws(() => weightedPercent({ objetivo: 10 }, {}), /positive weight/);
  assert.throws(() => weightedPercent({ objetivo: 10 }, { objetivo: 0 }), /positive weight/);
});

test('calculateArenaPoints validates inputs', () => {
  assert.throws(() => calculateArenaPoints(101, 10, 60), /between 0 and 100/);
  assert.throws(() => calculateArenaPoints(50, 61, 60), /within duration/);
  assert.throws(() => calculateArenaPoints(50, -1, 60), /within duration/);
});