import { sourceFallbackPercent } from '../../../src/judge/fake-judge.mjs';

export function evaluateGoldenCase(input) {
  return sourceFallbackPercent(input.reference_prompt, input.candidate_prompt);
}
