/**
 * Arena scoring: quality (percent) always dominates; speed is a configurable
 * multiplicative factor per challenge (speed_weight). With 'none' (the default
 * for most modes) time has no influence at all.
 *
 * Factors:
 *   none   1.00              (velocidade desconsiderada)
 *   low    0.95 + 0.10 * r   (até +10% para quem envia cedo)
 *   medium 0.90 + 0.20 * r
 *   high   0.80 + 0.40 * r
 * where r = remaining fraction of the round duration. A great prompt late
 * still beats a mediocre prompt early because the factor range is small.
 */

export const ARENA_SCORING_VERSION = 'arena-v1-quality-first';

const SPEED_FACTOR = Object.freeze({
  none: [1, 0],
  low: [0.95, 0.1],
  medium: [0.9, 0.2],
  high: [0.8, 0.4],
});

function finite(value, field) {
  if (!Number.isFinite(value)) throw new RangeError(`${field} must be finite`);
}

export function speedFactor(speedWeight, remainingRatio) {
  const config = SPEED_FACTOR[speedWeight] || SPEED_FACTOR.none;
  if (!Number.isFinite(remainingRatio)) return config[0];
  return config[0] + config[1] * Math.min(Math.max(remainingRatio, 0), 1);
}

export function calculateArenaPoints(percent, elapsed, duration, speedWeight = 'none') {
  finite(percent, 'percent');
  finite(elapsed, 'elapsed');
  finite(duration, 'duration');
  if (percent < 0 || percent > 100) throw new RangeError('percent must be between 0 and 100');
  if (duration <= 0) throw new RangeError('duration must be greater than zero');
  if (elapsed < 0 || elapsed > duration) throw new RangeError('elapsed must be within duration');

  const remaining = duration > 0 ? (duration - elapsed) / duration : 0;
  const factor = speedFactor(speedWeight, remaining);
  return Math.round(percent * factor * 100) / 100;
}

/** Weighted percent from per-criterion scores (each 0..20). */
export function weightedPercent(scores, weights) {
  if (!scores || typeof scores !== 'object') throw new TypeError('scores must be an object');
  if (!weights || typeof weights !== 'object') throw new TypeError('weights must be an object');
  let weighted = 0;
  let totalWeight = 0;
  for (const [criterion, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;
    const points = Number(scores[criterion]);
    if (!Number.isFinite(points) || points < 0 || points > 20) {
      throw new RangeError(`criterion ${criterion} score must be between 0 and 20`);
    }
    weighted += points * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) throw new RangeError('at least one criterion must have positive weight');
  return Math.round((weighted / (totalWeight * 20)) * 100 * 100) / 100;
}