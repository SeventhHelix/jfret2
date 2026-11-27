// Chord progressions in Roman numerals (I IV V, ii7 V7 Imaj7, i bVI bVII, V7/ii...) or chord symbols (C E G,
// Cmaj7 A7 Dm7 G7), relative to a key. Plus what the theory says about moving between them. Pure.
import { pc } from './theory';
import { spell } from '../learn/fretmap';

export type Chord = {
  roman: string;    // as written, or its place in the key for a chord symbol ("III" for E in C)
  root: number;     // pitch class
  tones: number[];  // semitones above the root, e.g. [0, 4, 7, 10]; extensions above 12 (9 = 14)
  name: string;     // "Dm7", "G7", "Cmaj7"
};

// Quality suffix → semitones above the root.
const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10], 'ø': [0, 3, 6, 10], 'ø7': [0, 3, 6, 10], dim: [0, 3, 6], '°': [0, 3, 6], dim7: [0, 3, 6, 9], '°7': [0, 3, 6, 9],
  aug: [0, 4, 8], '+': [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7], sus: [0, 5, 7], '7sus4': [0, 5, 7, 10],
  '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '9': [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], add9: [0, 4, 7, 14],
  'm(maj7)': [0, 3, 7, 11], mM7: [0, 3, 7, 11],
};

const DEGREES: Record<string, number> = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };
const RE = /^([b#♭♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|ø|o|\+|dim|aug)?(maj7|M7|m7b5|7sus4|sus2|sus4|add9|maj9|7|9|6)?$/;

/** One Roman numeral → chord in a key. Uppercase = major, lowercase = minor, ° dim, ø half-dim, + aug; 7, maj7,
 *  sus2/sus4, 6, 9, add9; "V7/ii" = the V7 of ii's key. */
export function parseRoman(token: string, key: number): Chord | null {
  const tok = token.trim();
  const slash = tok.split('/');
  if (slash.length === 2 && slash[0] && slash[1]) {
    const target = parseRoman(slash[1], key);
    const c = target && parseRoman(slash[0], target.root);
    return c ? { ...c, roman: tok, name: spell(c.root, key) + c.name.replace(/^[A-G][#b]?/, '') } : null;
  }
  const m = tok.match(RE);
  if (!m) return null;
  const [, acc, numeral, mod = '', ext = ''] = m;
  const upper = numeral === numeral.toUpperCase();
  const root = pc(key + DEGREES[numeral.toLowerCase()] + (acc === 'b' || acc === '♭' ? -1 : acc === '#' || acc === '♯' ? 1 : 0));
  let suffix: string;
  const dim = mod === '°' || mod === 'o' || mod === 'dim', half = mod === 'ø' || ext === 'm7b5', aug = mod === '+' || mod === 'aug';
  if (half) suffix = 'm7b5';
  else if (dim) suffix = ext === '7' ? 'dim7' : 'dim';
  else if (aug) suffix = 'aug';
  else if (['7sus4', 'sus2', 'sus4', 'add9', 'maj9'].includes(ext)) suffix = ext;
  else if (ext === '6' || ext === '9') suffix = upper ? ext : `m${ext}`;
  else if (upper) suffix = ext === '7' ? '7' : ext === 'maj7' || ext === 'M7' ? 'maj7' : '';
  else suffix = ext === '7' ? 'm7' : ext === 'maj7' || ext === 'M7' ? 'm(maj7)' : 'm';
  return { roman: tok, root, tones: QUALITY[suffix], name: spell(root, key) + suffix };
}

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SYMBOL_RE = /^([A-G])([#b♯♭]?)([^/]*)(?:\/[A-G][#b]?)?$/;
const DEGREE_NAMES = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];

/** Where a chord sits in a key, as a Roman numeral: E in C = "III", Bb in C = "bVII", Dm7 = "ii7". */
export function analyze(root: number, tones: number[], key: number, suffix: string): string {
  const deg = DEGREE_NAMES[pc(root - key)];
  const minorish = tones.includes(3) && !tones.includes(4);
  return (minorish ? deg.replace(/[IV]+/, x => x.toLowerCase()) : deg) + suffix.replace(/^m(?!aj)/, '').replace(/^dim$/, '°');
}

/** A chord symbol (C, F#m7, Bbmaj7, Dm7b5, G7sus4, Cadd9...) in a key. A slash bass is accepted and ignored. */
export function parseSymbol(token: string, key: number): Chord | null {
  const m = token.trim().match(SYMBOL_RE);
  if (!m) return null;
  const [, letter, acc, q] = m;
  const tones = QUALITY[q];
  if (!tones) return null;
  const root = pc(LETTERS[letter] + (acc === '#' || acc === '♯' ? 1 : acc === 'b' || acc === '♭' ? -1 : 0));
  return { roman: analyze(root, tones, key, q), root, tones, name: token.trim() };
}

/** Numerals or symbols, separated by spaces, commas, bars or dashes; unreadable tokens are reported. */
export function parseProgression(text: string, key: number): { chords: Chord[]; bad: string[] } {
  const tokens = text.split(/[\s,|\-–]+/).filter(Boolean);
  const chords: Chord[] = [], bad: string[] = [];
  for (const t of tokens) {
    const c = parseRoman(t, key) ?? parseSymbol(t, key);
    if (c) chords.push(c); else bad.push(t);
  }
  return { chords, bad };
}

// Every preset is 4 chords long, so it loops evenly (4 bars, or 8 at 2 bars a chord).
export const PRESETS: [string, string][] = [
  ['I IV I V', '1-4-1-5'],
  ['ii7 V7 Imaj7 Imaj7', '2-5-1 (jazz)'],
  ['ii V I I', '2-5-1 (triads)'],
  ['I V vi IV', 'Pop (1-5-6-4)'],
  ['vi IV I V', '6-4-1-5'],
  ['I vi IV V', '50s (1-6-4-5)'],
  ['Imaj7 VI7 ii7 V7', 'Turnaround (1-6-2-5)'],
  ['i bVI bVII i', 'Minor rock (1-b6-b7-1)'],
  ['i iv i v', 'Minor 1-4-1-5'],
  ['i iv V7 i', 'Minor with V7'],
  ['iiø7 V7 i i', 'Minor 2-5-1'],
  ['I III IV iv', 'Major with borrowed iv'],
  ['I7 IV7 I7 V7', 'Blues changes'],
];
/** The old 3-chord presets, and their 4-chord versions (so a saved choice still shows as a preset). */
export const OLD_PRESETS: Record<string, string> = {
  'I IV V': 'I IV I V', 'ii7 V7 Imaj7': 'ii7 V7 Imaj7 Imaj7', 'ii V I': 'ii V I I', 'i bVI bVII': 'i bVI bVII i',
  'i iv v': 'i iv i v', 'i iv V7': 'i iv V7 i', 'iiø7 V7 i': 'iiø7 V7 i i',
};

/** The 3rd and 7th: the "guide tones" that decide what a chord sounds like. */
export function guideTones(c: Chord): number[] {
  return c.tones.filter(t => t === 3 || t === 4 || t === 10 || t === 11 || (t === 9 && c.tones.includes(6)));
}

const IV = ['R', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];
const ivl = (p: number, root: number) => IV[pc(p - root)];

/**
 * What each note of a chord does when the next one comes: stays (a common tone; its role changes, "5 → R") or moves
 * to the nearest note of the next chord (semis: signed, the shortest way). Kept notes first, then smallest moves.
 */
export type Move = { from: number; to: number; semis: number; fromLabel: string; toLabel: string };
export function changeMap(cur: Chord, next: Chord): Move[] {
  const nextPcs = [...new Set(next.tones.map(t => pc(next.root + t)))];
  const out: Move[] = [];
  for (const p of [...new Set(cur.tones.map(t => pc(cur.root + t)))]) {
    let best = { to: p, semis: 99 };
    for (const q of nextPcs) {
      const d = ((q - p + 18) % 12) - 6; // -6..5: shortest signed distance
      if (Math.abs(d) < Math.abs(best.semis)) best = { to: q, semis: d };
    }
    out.push({ from: p, to: best.to, semis: best.semis, fromLabel: ivl(p, cur.root), toLabel: ivl(best.to, next.root) });
  }
  return out.sort((a, b) => Math.abs(a.semis) - Math.abs(b.semis));
}

/** The next chord's notes that the current chord doesn't have: the new sound the change brings. */
export function newNotes(prev: Chord, ch: Chord): number[] {
  const had = new Set(prev.tones.map(t => pc(prev.root + t)));
  return [...new Set(ch.tones.map(t => pc(ch.root + t)))].filter(p => !had.has(p));
}

export type Tier = 'chord' | 'tension' | 'avoid';
/**
 * The sweet notes over a chord: its own tones, the tensions that sound good on it (9, 11, 13 as its scale allows)
 * and avoid notes (fine passing through, harsh held on a strong beat). The scale comes from the chord's quality and
 * its place in the key: IV gets the #11 (Lydian), iii Phrygian, vi Aeolian, other minors Dorian, and a dominant 7th
 * heading to a minor chord takes the b9 and b13.
 */
export function chordScale(ch: Chord, key: number, next?: Chord): { pc: number; label: string; tier: Tier }[] {
  const deg = pc(ch.root - key);
  const t = new Set(ch.tones.map(x => pc(x)));
  const has = (x: number) => t.has(x);
  const out = new Map<number, { label: string; tier: Tier }>();
  for (const x of t) out.set(pc(ch.root + x), { label: x === 2 ? '9' : IV[x], tier: 'chord' });
  const add = (semi: number, label: string, tier: Tier) => { if (!has(semi)) out.set(pc(ch.root + semi), { label, tier }); };
  const minor = has(3) && !has(4), dom = has(4) && has(10), maj = has(4) && !has(10);
  if (has(3) && has(6) && has(10)) { add(1, 'b9', 'avoid'); add(5, '11', 'tension'); add(8, 'b13', 'tension'); } // m7b5: Locrian
  else if (has(3) && has(6)) { /* diminished: no extra colour shown */ }
  else if (dom) {
    const toMinor = !!next && next.tones.includes(3) && !next.tones.includes(4) && pc(next.root - ch.root) === 5;
    if (toMinor) { add(1, 'b9', 'tension'); add(8, 'b13', 'tension'); }
    else { add(2, '9', 'tension'); add(9, '13', 'tension'); }
    add(5, '11', 'avoid');
  } else if (minor) {
    add(5, '11', 'tension');
    if (deg === 4) { add(1, 'b9', 'avoid'); add(8, 'b13', 'avoid'); }       // iii: Phrygian
    else if (deg === 9) { add(2, '9', 'tension'); add(8, 'b13', 'avoid'); } // vi: Aeolian
    else { add(2, '9', 'tension'); add(9, '13', 'tension'); }               // ii and others: Dorian
  } else if (maj) {
    add(2, '9', 'tension');
    add(9, '13', 'tension');
    if (deg === 5) add(6, '#11', 'tension'); else add(5, '11', 'avoid');    // IV: Lydian
  }
  return [...out].map(([p, v]) => ({ pc: p, ...v }));
}
