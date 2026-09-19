import assert from 'node:assert/strict';
import test from 'node:test';

import { createFakeJudge } from '../../src/judge/fake-judge.mjs';

const referencePrompt = 'Um astronauta flutuando no espaço sideral com a Terra refletida no capacete, iluminação dramática de cinema, estilo fotorrealista 8k, lentes anamórficas e cores neon sutis.';
const rubric = 'Compare assunto, personagens, objetos, ambiente, composição, iluminação, cores, estilo e detalhes visuais.';

const sourceFixtures = [
  ['Astronauta no espaco com capacete refletivo e luz neon dramatica 8k', 29.071],
  ['Pessoa com roupa espacial na orbita da terra com estrelas', 18.6325],
  ['Um homem flutuando no espaco', 12.6992],
];

test('offline judge reproduces the source package fallback fixtures', async () => {
  const judge = createFakeJudge();

  for (const [candidatePrompt, expected] of sourceFixtures) {
    const result = await judge({ referencePrompt, rubric, candidatePrompt, image: '/challenge.png' });
    assert.equal(result.percent, expected);
    assert.equal(result.metadata.provider, 'fallback');
    assert.equal(result.metadata.model, 'source-fallback-v1');
  }
});

test('offline judge gives zero to unreadable answers instead of the 5% floor', async () => {
  const judge = createFakeJudge();
  const unreadable = ['123456', '1234567890 1234567890', 'asdasdasd asdasd kkk', '!!! ??? ###', '😀😀😀', 'x', '8k'];

  for (const candidatePrompt of unreadable) {
    const result = await judge({ referencePrompt, rubric, candidatePrompt, image: '/challenge.png' });
    assert.equal(result.percent, 0, candidatePrompt);
    assert.equal(result.metadata.unreadable_text, true, candidatePrompt);
  }

  const readable = await judge({ referencePrompt, rubric, candidatePrompt: 'astronauta Terra capacete', image: '/challenge.png' });
  assert.ok(readable.percent > 0);
  assert.equal(readable.metadata.unreadable_text, undefined);
});

test('offline judge follows the source fallback clamp and remains deterministic', async () => {
  const judge = createFakeJudge();
  const input = { referencePrompt, rubric, candidatePrompt: referencePrompt, image: '/challenge.png' };
  const first = await judge(input);
  const second = await judge(input);

  assert.deepEqual(first, second);
  assert.equal(first.percent, 98.5);
  assert.equal(typeof first.explanation, 'string');
});
