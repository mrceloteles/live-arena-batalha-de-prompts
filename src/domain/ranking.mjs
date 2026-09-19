function invalid(field) {
  throw new RangeError(`${field} must be a finite non-negative number`);
}

function numberAt(row, field, aliases = []) {
  const value = aliases.reduce((found, alias) => found ?? row[alias], row[field]);
  if (!Number.isFinite(value) || value < 0) invalid(field);
  return value;
}

function percentAt(row, field) {
  const value = numberAt(row, field);
  if (value > 100) invalid(field);
  return value;
}

function stationOrder(left, right) {
  const leftId = left.station_id ?? left.id;
  const rightId = right.station_id ?? right.id;
  if (leftId === rightId) return 0;
  return String(leftId).localeCompare(String(rightId), 'en', { numeric: true });
}

function ranked(rows, compare, isTie) {
  if (!Array.isArray(rows)) throw new TypeError('ranking rows must be an array');
  const sorted = rows.map((row) => ({ ...row })).sort(compare);
  let position = 0;
  return sorted.map((row, index) => {
    if (index === 0 || !isTie(row, sorted[index - 1])) position = index + 1;
    return { ...row, position };
  });
}

function roundValues(row) {
  return {
    points: numberAt(row, 'points'),
    percent: percentAt(row, 'percent'),
    elapsed: numberAt(row, 'elapsed_seconds', ['elapsed']),
  };
}

function finalValues(row) {
  return {
    points: numberAt(row, 'total_points'),
    percent: percentAt(row, 'avg_percent'),
    time: numberAt(row, 'total_time', ['total_elapsed', 'elapsed_seconds']),
  };
}

/** Sort one round by points, accuracy, then faster response time. */
export function rankRound(rows) {
  if (!Array.isArray(rows)) throw new TypeError('ranking rows must be an array');
  rows.forEach(roundValues);
  return ranked(
    rows,
    (left, right) => {
      const a = roundValues(left);
      const b = roundValues(right);
      return b.points - a.points || b.percent - a.percent || a.elapsed - b.elapsed || stationOrder(left, right);
    },
    (left, right) => {
      const a = roundValues(left);
      const b = roundValues(right);
      return a.points === b.points && a.percent === b.percent && a.elapsed === b.elapsed;
    },
  );
}

/** Sort the final board by the documented accumulated tie-break sequence. */
export function rankFinal(rows) {
  if (!Array.isArray(rows)) throw new TypeError('ranking rows must be an array');
  rows.forEach(finalValues);
  return ranked(
    rows,
    (left, right) => {
      const a = finalValues(left);
      const b = finalValues(right);
      return b.points - a.points || b.percent - a.percent || a.time - b.time || stationOrder(left, right);
    },
    (left, right) => {
      const a = finalValues(left);
      const b = finalValues(right);
      return a.points === b.points && a.percent === b.percent && a.time === b.time;
    },
  );
}
