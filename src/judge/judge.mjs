const REQUIRED_INPUT_FIELDS = ['referencePrompt', 'rubric', 'candidatePrompt'];

export function validateJudgeInput(input) {
  if (!input || typeof input !== 'object') throw new TypeError('judge input must be an object');
  for (const field of REQUIRED_INPUT_FIELDS) {
    if (typeof input[field] !== 'string' || input[field].trim() === '') {
      throw new TypeError(`${field} must be a non-empty string`);
    }
  }
  return input;
}

export function validateJudgeResult(result) {
  if (!result || typeof result !== 'object') throw new TypeError('judge result must be an object');
  if (!Number.isFinite(result.percent) || result.percent < 0 || result.percent > 100) {
    throw new TypeError('percent must be a number between 0 and 100');
  }
  if (typeof result.explanation !== 'string' || result.explanation.trim() === '') {
    throw new TypeError('explanation must be a non-empty string');
  }
  if (!result.metadata || typeof result.metadata !== 'object' || Array.isArray(result.metadata)) {
    throw new TypeError('metadata must be an object');
  }
  return {
    percent: Math.round(result.percent * 10_000) / 10_000,
    explanation: result.explanation.trim(),
    metadata: result.metadata,
  };
}

export function createJudge(implementation) {
  if (typeof implementation !== 'function') throw new TypeError('judge implementation must be a function');
  return async function judge(input) {
    validateJudgeInput(input);
    return validateJudgeResult(await implementation(input));
  };
}
