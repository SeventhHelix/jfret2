import { Song, pitchOf } from './song';

// Semitone offsets from the root.
export const SCALES = {
  song: [] as number[], // placeholder: "notes in this riff" (computed per song)
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  majorPent: [0, 2, 4, 7, 9],
  minorPent: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};
export type ScaleId = keyof typeof SCALES;

export const SCALE_NAMES: Record<ScaleId, string> = {
  song: 'Notes in this riff',
  major: 'Major (Ionian)',
  minor: 'Natural minor (Aeolian)',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  locrian: 'Locrian',
  harmonicMinor: 'Harmonic minor',
  majorPent: 'Major pentatonic',
  minorPent: 'Minor pentatonic',
  blues: 'Blues',
};

export const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const INTERVALS = ['R', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

export const pc = (midi: number) => ((midi % 12) + 12) % 12;

export function intervalName(pitchClass: number, root: number): string {
  return INTERVALS[pc(pitchClass - root)];
}

export function scalePitchClasses(root: number, steps: number[]): Set<number> {
  return new Set(steps.map(s => pc(root + s)));
}

export function songPitchClasses(song: Song): Set<number> {
  return new Set(song.notes.map(n => pc(pitchOf(song, n))));
}

/** Lowest note in the riff is usually the tonal centre of a guitar riff; E (open low string) if empty. */
export function guessRoot(song: Song): number {
  if (!song.notes.length) return 4;
  return pc(Math.min(...song.notes.map(n => pitchOf(song, n))));
}

// ---- key detection ----
// Krumhansl-Kessler key profiles: how strongly each scale degree (from the tonic) belongs to a major / minor key.
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export type KeyGuess = {
  root: number;       // tonic pitch class
  scale: ScaleId;     // best-fitting scale on that tonic
  fit: number;        // share of the (weighted) notes inside that scale, 0..1
  confidence: number; // 0..1: how clearly this key beats the next one
};

type Weighted = { pitch: number; start: number; dur: number };

function correlate(a: number[], b: number[]): number {
  const ma = a.reduce((x, y) => x + y, 0) / 12, mb = b.reduce((x, y) => x + y, 0) / 12;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Share of the histogram's weight that falls inside a scale. */
function fitOf(hist: number[], root: number, steps: number[]): number {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return steps.reduce((a, s) => a + hist[pc(root + s)], 0) / total;
}

/**
 * The likely keys of some notes, best first. Notes count by length (capped, so one held note doesn't swamp a run),
 * a little extra on the beat; the lowest, first and last notes nudge which note is home, since riffs and solos
 * tend to start, end and sit on the tonic. Then the mode that fits the notes best (major/minor family, pentatonic
 * or blues when every note fits) is picked for each tonic.
 */
export function detectKeys(notes: Weighted[], beat = 24): KeyGuess[] {
  if (!notes.length) return [];
  const hist = new Array(12).fill(0);
  for (const n of notes) hist[pc(n.pitch)] += Math.min(n.dur, beat * 2) + (n.start % beat === 0 ? beat / 4 : 0);
  const total = hist.reduce((a, b) => a + b, 0);
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const home = new Array(12).fill(0);
  home[pc(Math.min(...notes.map(n => n.pitch)))] += 0.06;
  home[pc(sorted[0].pitch)] += 0.04;
  home[pc(sorted[sorted.length - 1].pitch)] += 0.05;

  const cands: { root: number; minor: boolean; score: number }[] = [];
  for (let r = 0; r < 12; r++) {
    const rot = hist.map((_, i) => hist[(i + r) % 12]);
    cands.push({ root: r, minor: false, score: correlate(rot, KK_MAJOR) + home[r] + 0.25 * hist[r] / total });
    cands.push({ root: r, minor: true, score: correlate(rot, KK_MINOR) + home[r] + 0.25 * hist[r] / total });
  }
  cands.sort((a, b) => b.score - a.score);

  const MAJOR_FAMILY: ScaleId[] = ['major', 'mixolydian', 'lydian'];
  const MINOR_FAMILY: ScaleId[] = ['minor', 'dorian', 'phrygian', 'harmonicMinor'];
  const out: KeyGuess[] = [];
  for (const c of cands) {
    if (out.some(k => k.root === c.root)) continue;
    // The first in each family wins ties: plain major/minor unless another mode clearly fits better.
    let best: { scale: ScaleId; fit: number } = { scale: c.minor ? 'minor' : 'major', fit: 0 };
    for (const s of c.minor ? MINOR_FAMILY : MAJOR_FAMILY) {
      const f = fitOf(hist, c.root, SCALES[s]);
      if (f > best.fit + 0.02) best = { scale: s, fit: f };
    }
    // Everything inside the pentatonic (or blues)? Show that: it's what the player is actually using.
    const pent: ScaleId = c.minor ? 'minorPent' : 'majorPent';
    if (fitOf(hist, c.root, SCALES[pent]) >= 0.995) best = { scale: pent, fit: 1 };
    else if (c.minor && fitOf(hist, c.root, SCALES.blues) >= 0.995) best = { scale: 'blues', fit: 1 };
    out.push({ root: c.root, scale: best.scale, fit: best.fit, confidence: 0 });
    if (out.length === 3) break;
  }
  const scoreOf = (k: KeyGuess) => cands.find(c => c.root === k.root)!.score;
  for (let i = 0; i < out.length; i++) {
    const gap = scoreOf(out[i]) - (out[i + 1] ? scoreOf(out[i + 1]) : scoreOf(out[i]) - 0.3);
    out[i].confidence = Math.max(0, Math.min(1, gap / 0.3));
  }
  return out;
}

/** With the tonic already chosen: the scale on it that fits these notes best (minor or major family by the 3rd). */
export function scaleForRoot(notes: Weighted[], root: number, beat = 24): ScaleId {
  const k = detectKeys(notes, beat);
  const hit = k.find(x => x.root === pc(root));
  if (hit) return hit.scale;
  const hist = new Array(12).fill(0);
  for (const n of notes) hist[pc(n.pitch)] += Math.min(n.dur, beat * 2);
  return hist[pc(root + 3)] > hist[pc(root + 4)] ? 'minor' : 'major';
}

/** Chords you can highlight inside a scale: for a 7-note scale each degree's triad (or 7th chord) built from the
 *  scale itself; for anything else just the home chord. Values are semitone offsets from the scale root. */
export function scaleChords(steps: number[], seventh: boolean): { deg: number; offsets: number[]; quality: string }[] {
  const qual = (o: number[]) => {
    const third = pc(o[1] - o[0]), fifth = pc(o[2] - o[0]), sev = o[3] === undefined ? null : pc(o[3] - o[0]);
    const base = third === 4 ? (fifth === 8 ? 'aug' : '') : fifth === 6 ? (sev === 10 ? 'm7b5' : 'dim') : 'm';
    if (sev === null || base === 'm7b5') return base;
    return base === '' ? (sev === 11 ? 'maj7' : '7') : base === 'm' ? (sev === 10 ? 'm7' : 'm(maj7)') : base + '7';
  };
  if (steps.length === 7) {
    return steps.map((_, d) => {
      const o = [0, 2, 4, ...(seventh ? [6] : [])].map(k => steps[(d + k) % 7] + (d + k >= 7 ? 12 : 0));
      return { deg: d, offsets: o, quality: qual(o) };
    });
  }
  const third = steps.includes(3) && !steps.includes(4) ? 3 : 4;
  const o = [0, third, 7, ...(seventh ? [steps.includes(10) ? 10 : 11] : [])];
  return [{ deg: 0, offsets: o, quality: qual(o) }];
}
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** "ii", "V7", "vii°"... for a highlighted chord. */
export function romanOf(deg: number, quality: string): string {
  const minorish = quality.startsWith('m') || quality.startsWith('dim');
  const r = minorish ? ROMAN[deg].toLowerCase() : ROMAN[deg];
  return r + (quality.startsWith('dim') ? '°' : quality === 'm7b5' ? 'ø7' : quality.replace(/^m(?!aj)/, ''));
}
