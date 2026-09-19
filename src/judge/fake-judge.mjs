import { createJudge } from './judge.mjs';
import { isUnreadableText, UNREADABLE_FEEDBACK } from './criteria-judge.mjs';

function phpSimilarTextPercent(first, second) {
  const a = Buffer.from(first, 'utf8');
  const b = Buffer.from(second, 'utf8');

  function similar(left, right) {
    let pos1 = 0;
    let pos2 = 0;
    let max = 0;

    for (let p = 0; p < left.length; p += 1) {
      for (let q = 0; q < right.length; q += 1) {
        let length = 0;
        while (
          p + length < left.length
          && q + length < right.length
          && left[p + length] === right[q + length]
        ) {
          length += 1;
        }
        if (length > max) {
          max = length;
          pos1 = p;
          pos2 = q;
        }
      }
    }

    let total = max;
    if (max > 0) {
      if (pos1 > 0 && pos2 > 0) {
        total += similar(left.subarray(0, pos1), right.subarray(0, pos2));
      }
      if (pos1 + max < left.length && pos2 + max < right.length) {
        total += similar(left.subarray(pos1 + max), right.subarray(pos2 + max));
      }
    }
    return total;
  }

  if (a.length + b.length === 0) return 0;
  return (similar(a, b) * 200) / (a.length + b.length);
}

function uniqueDescriptiveWords(value) {
  const words = value
    .split(/[\s,.\-]+/u)
    .filter((word) => Array.from(word).length > 2);
  return [...new Set(words)];
}

function roundFour(value) {
  return Math.round(value * 10_000) / 10_000;
}

export function sourceFallbackPercent(referencePrompt, candidatePrompt) {
  const base = referencePrompt.trim().toLowerCase();
  const user = candidatePrompt.trim().toLowerCase();
  if (!user) return 0;

  const percentText = phpSimilarTextPercent(base, user);
  const baseWords = uniqueDescriptiveWords(base);
  const userWords = uniqueDescriptiveWords(user);

  let matchedWords = 0;
  for (const userWord of userWords) {
    for (const baseWord of baseWords) {
      if (
        userWord === baseWord
        || baseWord.includes(userWord)
        || userWord.includes(baseWord)
      ) {
        matchedWords += 1;
        break;
      }
    }
  }

  const keywordRatio = baseWords.length > 0
    ? (matchedWords / baseWords.length) * 100
    : 0;
  const finalScore = (percentText * 0.4) + (keywordRatio * 0.6);
  return roundFour(Math.min(Math.max(finalScore, 5), 98.5));
}

export function createFakeJudge() {
  return createJudge(async ({ referencePrompt, candidatePrompt }) => {
    // Texto ilegivel (teclado socado, numeros soltos, simbolos) nao compra o
    // piso de 5% do fallback: sem palavras nao ha o que comparar. O gate fica
    // aqui, no juiz, e nao em sourceFallbackPercent, que reproduz o pacote-base.
    const unreadable = isUnreadableText(candidatePrompt);
    return {
      percent: unreadable ? 0 : sourceFallbackPercent(referencePrompt, candidatePrompt),
      explanation: unreadable
        ? UNREADABLE_FEEDBACK
        : 'Fallback local do pacote-base: 40% similaridade textual + 60% cobertura de palavras.',
      metadata: {
        provider: 'fallback',
        model: 'source-fallback-v1',
        ...(unreadable ? { unreadable_text: true } : {}),
      },
    };
  });
}
