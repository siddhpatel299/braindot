/**
 * How recently a note was touched.
 *
 * What is left of a larger module. It used to carry a whole colour ramp —
 * HEAT_STYLES — in literal hex, which meant every node on the graph ignored
 * the light theme, plus per-heat node radii and edge styles that competed with
 * link count for the same visual channel. The map now says one thing with
 * colour and size (how connected a note is) and keeps recency as a thin amber
 * ring, which is the only thing this is still asked for.
 *
 * Label colours are --t2 or lighter; the old #444450 failed contrast at 1.97:1.
 */

export type HeatLevel = 'hot' | 'warm' | 'month' | 'cold';

export function getHeat(lastEditedAt: string | Date): HeatLevel {
  const then = typeof lastEditedAt === 'string' ? new Date(lastEditedAt) : lastEditedAt;
  const days = (Date.now() - then.getTime()) / 86400000;
  if (!Number.isFinite(days)) return 'cold';
  if (days <= 7) return 'hot';
  if (days <= 14) return 'warm';
  if (days <= 30) return 'month';
  return 'cold';
}
