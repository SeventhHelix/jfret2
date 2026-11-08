// Speed trainer drills: turn a phrase (a pattern or part of a riff) into one practice cycle, as a Song the
// normal player can play. Pure.
import { Note, PPQ, Song, emptySong } from '../model/song';
import type { Pos } from '../learn/fretmap';

/** One note of a phrase, timed in ticks from the phrase start. */
export type PNote = Omit<Note, 'id'>;
export type Phrase = { notes: PNote[]; len: number };

export type DrillId = 'steady' | 'burst' | 'chunks' | 'rhythms';
export const DRILL_INFO: { id: DrillId; name: string; short: string; why: string }[] = [
  {
    id: 'steady', name: 'Steady', short: 'The pattern, repeated',
    why: 'Plain repetition at a tempo you can play cleanly. Use it to find your clean tempo, then switch to a drill that pushes past it.',
  },
  {
    id: 'burst', name: 'Speed bursts', short: 'Slow reps, then the same notes twice as fast',
    why: "The slow reps set up the motion; the fast reps (double time, same tempo) make your hands play faster than they can sustain yet. Short bursts above your limit are how the limit moves. Stay relaxed in the fast part: if it tenses up, lower the tempo, don't push through.",
  },
  {
    id: 'chunks', name: 'Chunks + rests', short: 'A few notes at full speed, then a rest',
    why: 'Play each small group as one quick gesture, then reset during the rest. Each chunk ends on the first note of the next, so the joins get practised too. The rest is where you check you are loose: speed comes from relaxed, small motions.',
  },
  {
    id: 'rhythms', name: 'Rhythm variations', short: 'Long-short, short-long, then straight',
    why: 'Dotted rhythms make every second note fast, so each pair of notes gets practised at a higher speed; the mirror version covers the other pairs. Straight reps after them usually feel easier and more even.',
  },
];

export type DrillCfg = { id: DrillId; reps: number; slow: number; fast: number; chunk: number };
export const DEFAULT_DRILL: DrillCfg = { id: 'burst', reps: 2, slow: 2, fast: 2, chunk: 4 };

/** Note value per pattern note, in ticks. */
export const SUBDIVISIONS: { ticks: number; name: string; short: string }[] = [
  { ticks: 12, name: '8th notes', short: '8ths' },
  { ticks: 8, name: '8th-note triplets', short: 'triplets' },
  { ticks: 6, name: '16th notes', short: '16ths' },
  { ticks: 4, name: '16th-note sextuplets', short: 'sextuplets' },
];

const ceilTo = (t: number, q: number) => Math.ceil(t / q) * q;

/** A pattern (one spot per note) as a phrase, `sub` ticks per note, padded to a whole beat. */
export function phraseOf(spots: Pos[], sub: number): Phrase {
  const notes = spots.map((p, i) => ({ start: i * sub, dur: sub, string: p.string, fret: p.fret }));
  return { notes, len: ceilTo(spots.length * sub, PPQ) };
}

/** Same notes, all timings × factor (0.5 = double time). Ticks that don't halve evenly round down. */
export function scaleTime(ph: Phrase, factor: number): Phrase {
  return {
    notes: ph.notes.map(n => ({ ...n, start: Math.floor(n.start * factor), dur: Math.max(1, Math.floor(n.dur * factor)) })),
    len: Math.max(1, Math.floor(ph.len * factor)),
  };
}

function concat(parts: Phrase[]): Phrase {
  const notes: PNote[] = [];
  let t = 0;
  for (const p of parts) {
    for (const n of p.notes) notes.push({ ...n, start: n.start + t });
    t += p.len;
  }
  return { notes, len: t };
}

/** Event start times (a chord is one event). */
const starts = (ph: Phrase) => [...new Set(ph.notes.map(n => n.start))].sort((a, b) => a - b);

/** Swing pairs of notes: 'ls' = long-short (dotted), 'sl' = short-long. Only pairs with an even, equal spacing change. */
export function dotted(ph: Phrase, kind: 'ls' | 'sl'): Phrase {
  const st = starts(ph);
  const moved = new Map<number, number>();
  for (let i = 0; i + 1 < st.length; i += 2) {
    const g = st[i + 1] - st[i];
    const after = (st[i + 2] ?? ph.len) - st[i + 1];
    if (g !== after || g % 2) continue;
    moved.set(st[i + 1], st[i + 1] + (kind === 'ls' ? g / 2 : -g / 2));
  }
  return {
    len: ph.len,
    notes: ph.notes.map(n => {
      const ns = moved.get(n.start);
      if (ns !== undefined) return { ...n, start: ns, dur: kind === 'ls' ? n.dur / 2 : n.dur * 1.5 };
      if (moved.has(n.start + n.dur)) return { ...n, dur: kind === 'ls' ? n.dur * 1.5 : n.dur / 2 }; // the pair's first note
      return n;
    }),
  };
}

/** Chunks of `size` notes that overlap by one (each ends on the next one's first note), each followed by a rest as long as itself. */
export function chunked(ph: Phrase, size: number): Phrase {
  const st = starts(ph);
  if (st.length <= size) return concat([ph, { notes: [], len: ph.len }]);
  const parts: Phrase[] = [];
  for (let i = 0; i < st.length - 1; i += size - 1) {
    const a = st[i];
    const lastIdx = Math.min(i + size - 1, st.length - 1);
    const b = st[lastIdx];
    const notes = ph.notes.filter(n => n.start >= a && n.start <= b).map(n => ({ ...n, start: n.start - a }));
    const lastDur = Math.max(...notes.filter(n => n.start === b - a).map(n => n.dur));
    const len = ceilTo(b - a + lastDur, PPQ / 2);
    parts.push({ notes, len }, { notes: [], len: ceilTo(len, PPQ) });
    if (lastIdx === st.length - 1) break;
  }
  return concat(parts);
}

/** One full cycle of the drill. */
export function buildCycle(ph: Phrase, d: DrillCfg): Phrase {
  if (!ph.notes.length) return ph;
  switch (d.id) {
    case 'steady': return concat(Array(Math.max(1, d.reps)).fill(ph));
    case 'burst': {
      const fast = scaleTime(ph, 0.5);
      return concat([...Array(Math.max(1, d.slow)).fill(ph), ...Array(Math.max(1, d.fast)).fill(fast)]);
    }
    case 'chunks': return chunked(ph, Math.max(2, d.chunk));
    case 'rhythms': return concat([dotted(ph, 'ls'), dotted(ph, 'sl'), ph, ph]);
  }
}

/** A phrase as a playable song (standard tuning, 4/4), padded to a whole beat. */
export function toSong(ph: Phrase, bpm: number, title: string): Song {
  let id = 1;
  return {
    ...emptySong(), title, bpm: Math.round(Math.min(300, Math.max(20, bpm))),
    notes: ph.notes.map(n => ({ ...n, id: id++ })).sort((a, b) => a.start - b.start || a.string - b.string),
  };
}
export const cycleTicks = (ph: Phrase) => ceilTo(ph.len, PPQ);

// ---- tempo ladder ----
export type Ladder = { on: boolean; step: number; every: number; target: number };
export const DEFAULT_LADDER: Ladder = { on: false, step: 4, every: 2, target: 140 };

/** The tempo after a cycle: up by `step` every `every` cycles until the target, then it holds. */
export function ladderNext(l: Ladder, bpm: number, cyclesDone: number): number {
  if (!l.on || bpm >= l.target || cyclesDone % Math.max(1, l.every) !== 0) return bpm;
  return Math.min(l.target, bpm + l.step);
}

/** Notes per second at a tempo and note value: the number that means the same thing across subdivisions. */
export const notesPerSec = (bpm: number, sub: number) => (bpm / 60) * (PPQ / sub);
