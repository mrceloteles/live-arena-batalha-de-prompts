/**
 * Current live scoring rule observed from the Red Door deployment.
 * Accuracy is worth up to 10,000 points and unused round time up to 1,000.
 */
export const SCORING_VERSION = 'v3-live-speed-bonus';

function finite(value, field) {
  if (!Number.isFinite(value)) throw new RangeError(`${field} must be finite`);
}

export function calculatePoints(percent, elapsed, duration) {
  finite(percent, 'percent');
  finite(elapsed, 'elapsed');
  finite(duration, 'duration');
  if (percent < 0 || percent > 100) throw new RangeError('percent must be between 0 and 100');
  if (duration <= 0) throw new RangeError('duration must be greater than zero');
  if (elapsed < 0 || elapsed > duration) throw new RangeError('elapsed must be within duration');

  const speedBonus = ((duration - elapsed) / duration) * 1_000;
  return Math.round((percent * 100) + speedBonus);
}
