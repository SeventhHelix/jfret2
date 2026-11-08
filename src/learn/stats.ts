// Learn progress, kept in this browser: per-item results (so weak items come back sooner), the level per drill,
// a rolling window per drill+level (to suggest levelling up), and questions per day (for the streak).
import type { DrillId } from './drills';

export type ItemStat = { n: number; miss: number; streak: number; last: number; ms: number }; // ms = average answer time
export type LearnStats = {
  items: Record<string, ItemStat>;            // key: `${drill}|${item}`
  levels: Partial<Record<DrillId, number>>;
  recent: Record<string, number[]>;           // key: `${drill}:${level}` → last results, 1 = right
  days: Record<string, number>;               // 'YYYY-MM-DD' → questions answered
};

export const emptyStats = (): LearnStats => ({ items: {}, levels: {}, recent: {}, days: {} });
const RECENT = 10;

export const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function record(s: LearnStats, drill: DrillId, level: number, item: string, ok: boolean, ms: number, now: number): LearnStats {
  const k = `${drill}|${item}`;
  const prev = s.items[k] ?? { n: 0, miss: 0, streak: 0, last: 0, ms: 0 };
  const cur: ItemStat = {
    n: prev.n + 1,
    miss: prev.miss + (ok ? 0 : 1),
    streak: ok ? prev.streak + 1 : 0,
    last: now,
    ms: prev.n ? Math.round(prev.ms * 0.7 + ms * 0.3) : Math.round(ms),
  };
  const rk = `${drill}:${level}`;
  const recent = [...(s.recent[rk] ?? []), ok ? 1 : 0].slice(-RECENT);
  const day = dayKey(now);
  return {
    ...s,
    items: { ...s.items, [k]: cur },
    recent: { ...s.recent, [rk]: recent },
    days: { ...s.days, [day]: (s.days[day] ?? 0) + 1 },
  };
}

/**
 * How often an item should come up. Unseen items and recent misses come up most; items you keep getting right
 * fade back (but never vanish: a little spacing keeps them from going stale).
 */
export function weight(s: LearnStats, drill: DrillId, item: string, now: number): number {
  const st = s.items[`${drill}|${item}`];
  if (!st) return 2;
  const missRate = st.miss / st.n;
  let w = 1 + 3 * missRate;
  if (st.streak === 0) w += 2;            // missed last time: bring it back soon
  else if (st.streak >= 3) w *= 0.45;     // solid: space it out
  if (st.ms > 6000) w += 0.6;             // slow = not automatic yet
  const hours = (now - st.last) / 3.6e6;
  if (hours > 24) w += Math.min(1.5, hours / 48); // not seen for a while: due again
  return w;
}

/** 8 of the last 10 right at this level: time to move up. */
export function readyToLevelUp(s: LearnStats, drill: DrillId, level: number): boolean {
  const r = s.recent[`${drill}:${level}`] ?? [];
  return r.length >= RECENT && r.reduce((a, b) => a + b, 0) >= 8;
}

export function accuracy(s: LearnStats, drill: DrillId, level: number): { right: number; of: number } {
  const r = s.recent[`${drill}:${level}`] ?? [];
  return { right: r.reduce((a, b) => a + b, 0), of: r.length };
}

/** Days in a row with practice, ending today (or yesterday, so the streak survives until you practise today). */
export function streakDays(days: Record<string, number>, now: number): number {
  let t = now;
  if (!days[dayKey(t)]) t -= 864e5;
  let n = 0;
  while (days[dayKey(t)]) { n++; t -= 864e5; }
  return n;
}

export function readStats(raw: unknown): LearnStats {
  const e = emptyStats();
  if (!raw || typeof raw !== 'object') return e;
  const r = raw as Partial<LearnStats>;
  const obj = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  return { items: obj(r.items) as LearnStats['items'], levels: obj(r.levels) as LearnStats['levels'], recent: obj(r.recent) as LearnStats['recent'], days: obj(r.days) as LearnStats['days'] };
}
