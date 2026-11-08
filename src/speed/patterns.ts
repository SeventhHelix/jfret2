// Speed trainer: technique patterns as a sequence of fretboard spots (standard tuning). Pure.
import { SCALES, ScaleId, pc } from '../model/theory';
import { Pos, STD, fretFor } from '../learn/fretmap';

export type PatternId = 'scale' | 'oneString' | 'pedal' | 'skipArp' | 'sweep3' | 'sweep5' | 'spider';
export type SeqId = 'straight' | '3s' | '4s' | '6s';
export type DirId = 'up' | 'down' | 'updown';
export type Quality = 'min' | 'maj';

export type PatternCfg = {
  id: PatternId;
  key: number;       // root pitch class
  scale: ScaleId;    // for scale-based patterns
  quality: Quality;  // for arpeggios
  seq: SeqId;
  dir: DirId;
  pos: number;       // roughly where on the neck (fret)
};

export const PATTERNS: { id: PatternId; name: string; desc: string; uses: ('scale' | 'quality' | 'seq' | 'dir')[] }[] = [
  { id: 'scale', name: 'Scale run (3 per string)', desc: '3 notes per string (2 for pentatonics) across all six strings: the core alternate-picking workout.', uses: ['scale', 'seq', 'dir'] },
  { id: 'oneString', name: 'One-string run', desc: 'The scale along a single string: shifting, and picking without string changes.', uses: ['scale', 'seq', 'dir'] },
  { id: 'pedal', name: 'Pedal point', desc: 'Alternate a fixed note with a climbing scale on the B string (Bach and Yngwie territory).', uses: ['scale', 'dir'] },
  { id: 'skipArp', name: 'String-skipping arpeggio', desc: 'Triad arpeggio on the A, G and e strings, two notes each: clean string skips.', uses: ['quality', 'dir'] },
  { id: 'sweep3', name: 'Sweep: 3-string triad', desc: 'The small G-B-e sweep shape, up and back.', uses: ['quality'] },
  { id: 'sweep5', name: 'Sweep: 5-string triad', desc: 'The A-string root sweep across five strings.', uses: ['quality'] },
  { id: 'spider', name: 'Chromatic 1-2-3-4', desc: 'One finger per fret across all strings, shifting up a fret on the way back: synchronisation warm-up.', uses: [] },
];

export const SEQ_NAMES: Record<SeqId, string> = { straight: 'Straight', '3s': 'Groups of 3', '4s': 'Groups of 4', '6s': 'Groups of 6' };
export const DIR_NAMES: Record<DirId, string> = { up: 'Up', down: 'Down', updown: 'Up & down' };

const TRIADS: Record<Quality, number[]> = { min: [0, 3, 7], maj: [0, 4, 7] };

/** The fret of a pitch class on a string, closest to `near` (at least 1 when possible, so shapes don't lean on open strings). */
function nearFret(pitchClass: number, string: number, near: number, min = 0): number {
  const f = fretFor(pitchClass, string, Math.max(min, near - 6));
  return f + 12 <= 20 && Math.abs(f + 12 - near) < Math.abs(f - near) ? f + 12 : f;
}

/** Scale tones from a root pitch upwards, `n` of them. */
function scaleFrom(rootPitch: number, steps: number[], n: number): number[] {
  const out: number[] = [];
  const set = new Set(steps.map(s => pc(rootPitch + s)));
  for (let p = rootPitch; out.length < n; p++) if (set.has(pc(p))) out.push(p);
  return out;
}

/** Group a run: 3s = 1-2-3, 2-3-4, 3-4-5... (each group one step on from the last). */
export function sequence<T>(run: T[], seq: SeqId): T[] {
  const g = seq === 'straight' ? 0 : Number(seq[0]);
  if (!g || run.length < g) return run;
  const out: T[] = [];
  for (let i = 0; i + g <= run.length; i++) out.push(...run.slice(i, i + g));
  return out;
}

function directed(asc: Pos[], cfg: PatternCfg): Pos[] {
  const up = sequence(asc, cfg.seq);
  const down = sequence([...asc].reverse(), cfg.seq);
  if (cfg.dir === 'up') return up;
  if (cfg.dir === 'down') return down;
  // Up and back: don't play the top group twice in a row when it's a plain run.
  return cfg.seq === 'straight' ? [...up, ...down.slice(1, -1)] : [...up, ...down];
}

/** Walk chord tones up across strings, each string taking the lowest tones above the last, inside a fret window. */
function positionArp(rootPitch: number, tones: number[], strings: number[], perString: number[], lo: number, hi: number, topExtra = 0): Pos[] {
  const want = new Set(tones.map(t => pc(rootPitch + t)));
  const out: Pos[] = [];
  let last = rootPitch - 1;
  strings.forEach((s, i) => {
    const top = i === strings.length - 1 ? hi + topExtra : hi;
    let taken = 0;
    for (let f = Math.max(0, lo); f <= top && taken < perString[i]; f++) {
      const p = STD[s] + f;
      if (p > last && want.has(pc(p))) { out.push({ string: s, fret: f }); last = p; taken++; }
    }
  });
  return out;
}

const upAndBack = (asc: Pos[]) => [...asc, ...[...asc].reverse().slice(1, -1)];

export function generate(cfg: PatternCfg): Pos[] {
  const steps = SCALES[cfg.scale].length ? SCALES[cfg.scale] : SCALES.minor;
  switch (cfg.id) {
    case 'scale': {
      const rf = nearFret(cfg.key, 5, cfg.pos);
      const per = steps.length >= 7 ? 3 : 2;
      const pitches = scaleFrom(STD[5] + rf, steps, per * 6);
      const asc = pitches.map((p, i) => { const s = 5 - Math.floor(i / per); return { string: s, fret: p - STD[s] }; });
      return directed(asc, cfg);
    }
    case 'oneString': {
      const s = 0;
      const rf = fretFor(cfg.key, s, Math.max(0, cfg.pos - 6));
      const pitches = scaleFrom(STD[s] + rf, steps, steps.length + 1).filter(p => p - STD[s] <= 24);
      return directed(pitches.map(p => ({ string: s, fret: p - STD[s] })), cfg);
    }
    case 'pedal': {
      const s = 1;
      const rf = nearFret(cfg.key, s, cfg.pos, 1);
      const pitches = scaleFrom(STD[s] + rf, steps, steps.length + 1).filter(p => p - STD[s] <= 24).slice(1);
      const pedal = { string: s, fret: rf };
      const climb = pitches.map(p => ({ string: s, fret: p - STD[s] }));
      const line = cfg.dir === 'down' ? [...climb].reverse() : cfg.dir === 'up' ? climb : [...climb, ...[...climb].reverse().slice(1, -1)];
      return line.flatMap(p => [pedal, p]);
    }
    case 'skipArp': {
      const rf = nearFret(cfg.key, 4, cfg.pos, 1);
      const asc = positionArp(STD[4] + rf, TRIADS[cfg.quality], [4, 2, 0], [2, 2, 2], rf - 1, rf + 5);
      return cfg.dir === 'up' ? asc : cfg.dir === 'down' ? [...asc].reverse() : upAndBack(asc);
    }
    case 'sweep3': {
      const rf = nearFret(cfg.key, 2, cfg.pos, 3);
      return upAndBack(positionArp(STD[2] + rf, TRIADS[cfg.quality], [2, 1, 0], [1, 1, 2], rf - 3, rf + 3, 2));
    }
    case 'sweep5': {
      const rf = nearFret(cfg.key, 4, cfg.pos, 3);
      return upAndBack(positionArp(STD[4] + rf, TRIADS[cfg.quality], [4, 3, 2, 1, 0], [2, 2, 1, 1, 2], rf - 3, rf + 3, 2));
    }
    case 'spider': {
      const f = Math.max(1, Math.min(18, cfg.pos));
      const up = [5, 4, 3, 2, 1, 0].flatMap(s => [0, 1, 2, 3].map(k => ({ string: s, fret: f + k })));
      const down = [0, 1, 2, 3, 4, 5].flatMap(s => [4, 3, 2, 1].map(k => ({ string: s, fret: f + k })));
      return [...up, ...down];
    }
  }
}
