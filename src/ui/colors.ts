import { computed } from '@preact/signals';
import { Note, barTicks } from '../model/song';
import { song, view } from '../state/store';

// Position colours run cyan → blue → violet → pink from the low end of a range of frets to the high end.
// Amber (playing) and green (cursor) stay reserved.
const HUE_LOW = 185;
const HUE_SPAN = 170;

/** Whole-neck colour: the gradient spans frets 0-14 (where most riffs live) and holds past that. */
export function fretHue(fret: number): number {
  return HUE_LOW + (Math.min(fret, 14) / 14) * HUE_SPAN;
}

/** Colour within a lo..hi fret range. A span under 3 frets is stretched so neighbouring frets don't jump colour. */
function rangeHue(fret: number, lo: number, hi: number): number {
  if (hi === lo) return HUE_LOW + HUE_SPAN / 2;
  return HUE_LOW + ((fret - lo) / Math.max(hi - lo, 3)) * HUE_SPAN;
}

/**
 * The note → hue function for the current song and Display setting, shared by the neck and the timeline:
 * 'riff' = relative to the riff's lowest..highest fret, 'bar' = each bar's own range, 'neck' = whole neck.
 */
export const noteHue = computed<(n: Note) => number>(() => {
  const s = song.value;
  const mode = view.value.colourRange;
  if (mode === 'neck') return n => fretHue(n.fret);
  const bar = barTicks(s.timeSig);
  const keyOf = (n: Note) => (mode === 'bar' ? Math.floor(n.start / bar) : 0);
  const ranges = new Map<number, { lo: number; hi: number }>();
  for (const n of s.notes) {
    const r = ranges.get(keyOf(n));
    ranges.set(keyOf(n), r ? { lo: Math.min(r.lo, n.fret), hi: Math.max(r.hi, n.fret) } : { lo: n.fret, hi: n.fret });
  }
  return n => {
    const r = ranges.get(keyOf(n));
    return r ? rangeHue(n.fret, r.lo, r.hi) : fretHue(n.fret);
  };
});

// Faint per-interval hues for the scale guide (index = semitones above the root). The major-scale "pillars"
// (3, 4, 5, 7) run a green → blue gradient; the rest sit in reds and purples. The root is drawn cream separately.
//                    R   b2   2    b3   3    4    b5  5    b6   6    b7   7
const INTERVAL_HUES = [0, 355, 335, 315, 150, 170, 0, 195, 345, 295, 278, 220];
export function intervalHue(semitonesAboveRoot: number): number {
  return INTERVAL_HUES[((semitonesAboveRoot % 12) + 12) % 12];
}
