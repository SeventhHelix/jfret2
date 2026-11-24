// Chord progressions in Roman numerals (I IV V, ii7 V7 Imaj7, i bVI bVII...), relative to a key. Pure.
import { pc } from './theory';
import { spell } from '../learn/fretmap';

export type Chord = {
  roman: string;    // as written
  root: number;     // pitch class
  tones: number[];  // semitones above the root, e.g. [0, 4, 7, 10]
  name: string;     // "Dm7", "G7", "Cmaj7"
};

const DEGREES: Record<string, number> = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };
const RE = /^([b#♭♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|ø|o|\+|dim|aug)?(maj7|M7|m7b5|7)?$/;

/** One Roman numeral → chord in a key. Uppercase = major, lowercase = minor, ° dim, ø half-dim, + aug; 7 / maj7. */
export function parseRoman(token: string, key: number): Chord | null {
  const m = token.trim().match(RE);
  if (!m) return null;
  const [, acc, numeral, mod = '', ext = ''] = m;
  const upper = numeral === numeral.toUpperCase();
  const root = pc(key + DEGREES[numeral.toLowerCase()] + (acc === 'b' || acc === '♭' ? -1 : acc === '#' || acc === '♯' ? 1 : 0));
  let tones: number[];
  let suffix: string;
  const dim = mod === '°' || mod === 'o' || mod === 'dim', half = mod === 'ø' || ext === 'm7b5', aug = mod === '+' || mod === 'aug';
  if (half) { tones = [0, 3, 6, 10]; suffix = 'm7b5'; }
  else if (dim) { tones = ext === '7' ? [0, 3, 6, 9] : [0, 3, 6]; suffix = ext === '7' ? 'dim7' : 'dim'; }
  else if (aug) { tones = [0, 4, 8]; suffix = 'aug'; }
  else if (upper) {
    if (ext === '7') { tones = [0, 4, 7, 10]; suffix = '7'; }
    else if (ext === 'maj7' || ext === 'M7') { tones = [0, 4, 7, 11]; suffix = 'maj7'; }
    else { tones = [0, 4, 7]; suffix = ''; }
  } else {
    if (ext === '7') { tones = [0, 3, 7, 10]; suffix = 'm7'; }
    else if (ext === 'maj7' || ext === 'M7') { tones = [0, 3, 7, 11]; suffix = 'm(maj7)'; }
    else { tones = [0, 3, 7]; suffix = 'm'; }
  }
  return { roman: token.trim(), root, tones, name: spell(root, key) + suffix };
}

/** "ii7 V7 Imaj7" or "I-IV-V" or "i, bVI, bVII" → chords; unreadable tokens are reported, not dropped silently. */
export function parseProgression(text: string, key: number): { chords: Chord[]; bad: string[] } {
  const tokens = text.split(/[\s,|\-–]+/).filter(Boolean);
  const chords: Chord[] = [], bad: string[] = [];
  for (const t of tokens) {
    const c = parseRoman(t, key);
    if (c) chords.push(c); else bad.push(t);
  }
  return { chords, bad };
}

export const PRESETS: [string, string][] = [
  ['I IV V', '1-4-5'],
  ['ii7 V7 Imaj7', '2-5-1 (jazz)'],
  ['ii V I', '2-5-1 (triads)'],
  ['I V vi IV', 'Pop (1-5-6-4)'],
  ['vi IV I V', '6-4-1-5'],
  ['I vi IV V', '50s (1-6-4-5)'],
  ['i bVI bVII', 'Minor rock (1-b6-b7)'],
  ['i iv v', 'Minor 1-4-5'],
  ['i iv V7', 'Minor with V7'],
  ['iiø7 V7 i', 'Minor 2-5-1'],
  ['I7 IV7 I7 V7', 'Blues changes'],
];

/** Chord tones by interval label: the 3rd and 7th are the "guide tones" that define a chord. */
export function guideTones(c: Chord): number[] {
  return c.tones.filter(t => t === 3 || t === 4 || t === 10 || t === 11 || (t === 9 && c.tones.includes(6)));
}
