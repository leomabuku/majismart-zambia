// On worsening, transition immediately. On recovery, each boundary must be
// exceeded by the configured hysteresis margin. Percentages are volume based.
export function classifyCondition(percent, previous, { critical, low, warning, hysteresis }) {
  if (![percent, critical, low, warning, hysteresis].every(Number.isFinite) || percent < 0 || percent > 100 || critical < 0 || critical >= low || low >= warning || warning > 100 || hysteresis < 0 || warning + hysteresis > 100) throw new Error('Invalid thresholds');
  const ranks = ['NORMAL', 'WARNING', 'LOW', 'CRITICAL'];
  const candidate = percent <= critical ? 'CRITICAL' : percent <= low ? 'LOW' : percent <= warning ? 'WARNING' : 'NORMAL';
  const prevRank = ranks.indexOf(previous);
  const targetRank = ranks.indexOf(candidate);
  if (prevRank < 0 || targetRank >= prevRank) return candidate;
  let rank = prevRank;
  const boundary = { CRITICAL: critical, LOW: low, WARNING: warning };
  while (rank > targetRank && percent > boundary[ranks[rank]] + hysteresis) rank--;
  return ranks[rank];
}
