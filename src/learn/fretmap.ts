// Pure fretboard geometry for the Learn and Speed sections: where pitches live, triad shapes on string sets,
// and landmark-based hints. Standard tuning; string 0 = high e ... 5 = low E (same as the riff model).
import { TUNINGS } from '../model/song';
import { PITCH_NAMES, pc } from '../model/theory';

export type Pos = { string: number; fret: number };
export const STD = TUNINGS.std.pitches;
export const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'];
export const ALL_STRINGS = [0, 1, 2, 3, 4, 5];

export const pitchAt = (p: Pos) => STD[p.string] + p.fret;
export const pcAt = (p: Pos) => pc(pitchAt(p));
export const posKey = (p: Pos) => `${p.string}:${p.fret}`;
export const nameAt = (p: Pos) => PITCH_NAMES[pcAt(p)];

/** A part of the neck: frets lo..hi (inclusive) on some strings. */
export type Region = { lo: number; hi: number; strings: number[] };

export function inRegion(p: Pos, r: Region): boolean {
  return p.fret >= r.lo && p.fret <= r.hi && r.strings.includes(p.string);
}

/** Every spot in the region whose pitch class is in `pcs`. Sorted low string first, then by fret. */
export function positionsOf(pcs: number[] | Set<number>, r: Region): Pos[] {
  const want = new Set(pcs);
  const out: Pos[] = [];
  for (const s of [...r.strings].sort((a, b) => b - a)) {
    for (let f = r.lo; f <= r.hi; f++) if (want.has(pc(STD[s] + f))) out.push({ string: s, fret: f });
  }
  return out;
}

const INTERVAL_LABELS = ['R', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];
export const intervalLabel = (p: number, root: number) => INTERVAL_LABELS[pc(p - root)];

export const INTERVAL_FULL = [
  'Unison / octave', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th',
  'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th',
];

// Frets almost everyone knows cold: open strings, the 5th/7th/12th markers.
const LANDMARKS = [0, 5, 7, 12, 17, 19, 24];

/** "A string, 5th fret = D, up 2 → E": walk from the closest landmark on the same string. */
export function landmarkHint(p: Pos): string {
  const lm = LANDMARKS.reduce((a, b) => (Math.abs(b - p.fret) < Math.abs(a - p.fret) ? b : a));
  const from = PITCH_NAMES[pc(STD[p.string] + lm)];
  const d = p.fret - lm;
  const where = lm === 0 ? 'open' : `fret ${lm}`;
  const step = d === 0 ? '' : `, ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} → ${nameAt(p)}`;
  return `${STRING_NAMES[p.string]} string ${where} = ${from}${step}`;
}

/**
 * Close-position triads on three adjacent strings (`set` = the lowest string index, e.g. 2 = G-B-e):
 * one chord tone per string, each the next tone up. Every inversion whose frets fit in 0..maxFret.
 */
export type Shape = { inversion: 0 | 1 | 2; notes: Pos[] }; // notes low string → high string
export function triadShapes(root: number, quality: number[], set: number, maxFret = 15): Shape[] {
  const tones = quality.map(i => pc(root + i)); // e.g. [R, 3, 5]
  const strings = [set, set - 1, set - 2]; // low → high
  const out: Shape[] = [];
  for (let f = 0; f <= maxFret; f++) {
    const bottom = pc(STD[strings[0]] + f);
    const bi = tones.indexOf(bottom);
    if (bi < 0) continue;
    const notes: Pos[] = [{ string: strings[0], fret: f }];
    let pitch = STD[strings[0]] + f;
    let ok = true;
    for (let k = 1; k < 3; k++) {
      const want = tones[(bi + k) % 3];
      let p = pitch + 1;
      while (pc(p) !== want) p++;
      const fret = p - STD[strings[k]];
      if (fret < 0 || fret > maxFret + 2) { ok = false; break; }
      notes.push({ string: strings[k], fret });
      pitch = p;
    }
    if (!ok) continue;
    const frets = notes.map(n => n.fret);
    if (Math.max(...frets) - Math.min(...frets) > 4) continue; // not a hand shape
    out.push({ inversion: bi as 0 | 1 | 2, notes }); // the 3rd in the bass = 1st inversion, the 5th = 2nd
  }
  return out;
}

/** "G-B-e", "D-G-B"... for a set given by its lowest string. */
export const setName = (set: number) => [set, set - 1, set - 2].map(s => STRING_NAMES[s]).join('-');
export const INVERSION_NAMES = ['root position', '1st inversion', '2nd inversion'];

export const MAJOR_TRIAD = [0, 4, 7];
export const MINOR_TRIAD = [0, 3, 7];
export const DIM_TRIAD = [0, 3, 6];

/** Diatonic triads of a major key: [degree label, root pc, quality]. */
export function diatonicTriads(keyRoot: number): { roman: string; root: number; quality: number[]; name: string }[] {
  const steps = [0, 2, 4, 5, 7, 9, 11];
  const romans = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  return steps.map((s, i) => {
    const r = pc(keyRoot + s);
    const third = pc(keyRoot + steps[(i + 2) % 7] - r);
    const fifth = pc(keyRoot + steps[(i + 4) % 7] - r);
    const quality = [0, third, fifth];
    const suffix = third === 4 ? '' : fifth === 6 ? 'dim' : 'm';
    return { roman: romans[i], root: r, quality, name: spell(r, keyRoot) + suffix };
  });
}

/** The fret on a string where a pitch class first appears at or above `minFret`. */
export function fretFor(pitchClass: number, string: number, minFret = 0): number {
  let f = minFret;
  while (pc(STD[string] + f) !== pitchClass) f++;
  return f;
}

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_KEYS = new Set([1, 3, 5, 8, 10]); // Db Eb F Ab Bb major
/** A note spelled the way a key writes it: flats in flat keys (Bb, not A#), sharps otherwise. A minor key spells like its relative major. */
export function spell(pitchClass: number, key: number, minor = false): string {
  const major = minor ? pc(key + 3) : pc(key);
  return (FLAT_KEYS.has(major) ? FLATS : SHARPS)[pc(pitchClass)];
}
/** A key's own name (Bb, Eb, F#...). */
export const keyName = (key: number, minor = false) => spell(key, key, minor);
