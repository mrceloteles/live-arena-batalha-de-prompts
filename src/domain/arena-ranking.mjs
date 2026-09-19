export const scorePoints = (score) => Number(score.points ?? score.percent ?? 0);

export function bestRoundScores(scores) {
  const ordered = [...scores].sort((a, b) => scorePoints(b) - scorePoints(a)
    || Number(b.percent) - Number(a.percent)
    || Number(a.attempt ?? 1) - Number(b.attempt ?? 1));
  const seen = new Set();
  return ordered.filter((score) => {
    const key = String(score.participantId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
