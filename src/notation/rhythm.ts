import { Note } from '../model/song';

export type RhythmValue = { ticks: number; flags: number; dotted: boolean; triplet: boolean; stem: 'none' | 'half' | 'full' };

const V = (ticks: number, flags: number, dotted = false, triplet = false, stem: RhythmValue['stem'] = 'full'): RhythmValue =>
  ({ ticks, flags, dotted, triplet, stem });

// Descending; PPQ = 24.
export const VALUES: RhythmValue[] = [
  V(96, 0, false, false, 'none'), // whole
  V(72, 0, true, false, 'half'),  // dotted half
  V(48, 0, false, false, 'half'), // half
  V(36, 0, true),                 // dotted quarter
  V(24, 0),                       // quarter
  V(18, 1, true),                 // dotted 8th
  V(16, 0, false, true),          // quarter triplet
  V(12, 1),                       // 8th
  V(9, 2, true),                  // dotted 16th
  V(8, 1, false, true),           // 8th triplet
  V(6, 2),                        // 16th
  V(4, 2, false, true),           // 16th triplet
  V(3, 3),                        // 32nd
];

export function displayValue(ticks: number): RhythmValue {
  let best = VALUES[0];
  for (const v of VALUES) if (Math.abs(v.ticks - ticks) < Math.abs(best.ticks - ticks)) best = v;
  return best;
}

export type DisplayEvent = { start: number; noteIds: number[]; value: RhythmValue; beam: number | null };
export type Rest = { start: number; value: RhythmValue };

const MIN_REST = 6; // only show rests of a 16th or longer

const REST_SIZES = [96, 48, 24, 12, 6, 3];

// Split a gap into plain (undotted, non-triplet) rests, each aligned to its own length within the bar.
function restsFor(start: number, len: number, barStart: number, _beatLen: number): Rest[] {
  const out: Rest[] = [];
  let t = start;
  let left = len;
  while (left >= MIN_REST) {
    const v = REST_SIZES.find(s => s <= left && (t - barStart) % s === 0);
    if (v === undefined || v < MIN_REST) break;
    out.push({ start: t, value: displayValue(v) });
    t += v;
    left -= v;
  }
  return out;
}

export function layoutBar(notes: Note[], barStart: number, barLen: number, beatLen: number): { events: DisplayEvent[]; rests: Rest[] } {
  const barEnd = barStart + barLen;
  const inBar = notes.filter(n => n.start >= barStart && n.start < barEnd);
  const starts = [...new Set(inBar.map(n => n.start))].sort((a, b) => a - b);
  const events: DisplayEvent[] = [];
  const rests: Rest[] = [];
  let cursor = barStart;
  starts.forEach((s, i) => {
    rests.push(...restsFor(cursor, s - cursor, barStart, beatLen));
    const group = inBar.filter(n => n.start === s);
    const next = starts[i + 1] ?? barEnd;
    const len = Math.min(Math.max(...group.map(n => n.dur)), next - s);
    const value = displayValue(len);
    events.push({ start: s, noteIds: group.map(n => n.id), value, beam: null });
    cursor = s + len;
  });
  if (!events.length) rests.push({ start: barStart, value: displayValue(96) });
  else rests.push(...restsFor(cursor, barEnd - cursor, barStart, beatLen));

  let beamId = 0;
  const beatOf = (t: number) => Math.floor((t - barStart) / beatLen);
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const e = events[i];
    if (!prev.value.flags || !e.value.flags || beatOf(prev.start) !== beatOf(e.start)) continue;
    if (rests.some(r => r.start > prev.start && r.start < e.start)) continue;
    if (prev.beam === null) prev.beam = ++beamId;
    e.beam = prev.beam;
  }
  return { events, rests };
}
