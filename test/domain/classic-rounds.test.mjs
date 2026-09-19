import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_ROUNDS, DEFAULT_RUBRIC, LEGACY_IMAGE_PATH, LEGACY_REFERENCE_PROMPT,
  classicRoundToChallenge, classicRoundsToChallenges, isRepeatedLegacyChallengeSet,
} from '../../src/domain/classic-rounds.mjs';

test('the preserved classic deck has 3 distinct official rounds', () => {
  assert.equal(DEFAULT_ROUNDS.length, 3);
  assert.equal(new Set(DEFAULT_ROUNDS.map((round) => round.referencePrompt)).size, 3);
  assert.equal(new Set(DEFAULT_ROUNDS.map((round) => round.imagePath)).size, 3);
  assert.equal(DEFAULT_ROUNDS[0].rubric, DEFAULT_RUBRIC);
  for (const round of DEFAULT_ROUNDS) {
    assert.ok(round.referencePrompt.length > 60);
    assert.ok(round.imagePath.startsWith('/public/'));
    assert.equal(round.number >= 1 && round.number <= 3, true);
  }
});

test('isRepeatedLegacyChallengeSet detects a repeated placeholder deck', () => {
  const repeated = DEFAULT_ROUNDS.map(() => ({
    imagePath: LEGACY_IMAGE_PATH,
    referencePrompt: LEGACY_REFERENCE_PROMPT,
  }));
  assert.equal(isRepeatedLegacyChallengeSet(repeated), true);
  assert.equal(isRepeatedLegacyChallengeSet(DEFAULT_ROUNDS), false);
  assert.equal(isRepeatedLegacyChallengeSet([]), false);
});

test('classicRoundToChallenge seeds a classic-judged challenge preserving rubric and prompt', () => {
  const seed = classicRoundToChallenge(DEFAULT_ROUNDS[0]);
  assert.equal(seed.judgeKind, 'classic');
  assert.equal(seed.modality, 'precisao');
  assert.equal(seed.referencePrompt, DEFAULT_ROUNDS[0].referencePrompt);
  assert.equal(seed.rubric, DEFAULT_ROUNDS[0].rubric);
  assert.equal(seed.referenceImage, DEFAULT_ROUNDS[0].imagePath);
  assert.equal(seed.attempts, 1);
  assert.equal(seed.title.includes('Desafio 1'), true);
});

test('classicRoundsToChallenges keeps the official round order', () => {
  const seeds = classicRoundsToChallenges([...DEFAULT_ROUNDS].reverse());
  assert.deepEqual(
    seeds.map((seed) => seed.referencePrompt),
    DEFAULT_ROUNDS.map((round) => round.referencePrompt),
  );
});
