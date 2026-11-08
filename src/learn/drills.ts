// Learn section: every drill is the same kind of question: "here's part of the neck (and maybe a given note or
// shape); find these spots". The UI only knows Question; drills differ in what they ask.
import { PITCH_NAMES, SCALES, ScaleId, pc } from '../model/theory';
import {
  ALL_STRINGS, DIM_TRIAD, INTERVAL_FULL, INVERSION_NAMES, MAJOR_TRIAD, MINOR_TRIAD, Pos, Region, STRING_NAMES,
  diatonicTriads, fretFor, keyName, spell, intervalLabel, pcAt, pitchAt, positionsOf, posKey, setName, triadShapes,
} from './fretmap';

export type Mark = { pos: Pos; label: string; root?: boolean };
export type Question = {
  drill: DrillId;
  level: number;
  prompt: string;
  sub: string;          // where to look
  region: Region;       // the part of the neck in play (outside is dimmed)
  view: { lo: number; hi: number }; // frets drawn
  given: Mark[];        // shown from the start
  targets: Mark[];      // the answer
  shapes?: Pos[][];     // outlined on reveal (triad shapes)
  choices?: string[];   // "name it" questions: pick one
  answer?: string;
  item: string;         // what's being tested, for spacing weak items
  sound: 'arp' | 'interval' | 'none';
};

export type Rng = () => number;
/** How much an item should come up (1 = normal; weak or unseen items more). */
export type Weigh = (drill: DrillId, item: string) => number;
type Ctx = { rng: Rng; weigh: Weigh };

export type Category = 'notes' | 'intervals' | 'chords' | 'scales';
export const CATEGORIES: [Category, string][] = [['notes', 'Notes'], ['intervals', 'Intervals'], ['chords', 'Chords'], ['scales', 'Scales']];

export type Drill = {
  id: DrillId;
  cat: Category;
  name: string;
  levels: string[];      // short description of each level
  how: string;           // the specific way to practise it (shown with the question)
  gen: (level: number, ctx: Ctx) => Question;
};

export type DrillId = 'n-box' | 'n-string' | 'n-name' | 'n-oct' | 'i-find' | 'i-name' | 'c-triad' | 'c-inv' | 'c-key' | 'c-arp' | 's-box' | 's-degree';

// ---------- helpers ----------
const NATURALS = [0, 2, 4, 5, 7, 9, 11];
const ALL_PCS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const choose = <T,>(rng: Rng, xs: T[]): T => xs[Math.floor(rng() * xs.length)];

/** Weighted random pick: weak/unseen items (by the stats) come up more often. */
export function wpick<T>(ctx: Ctx, drill: DrillId, xs: T[], key: (x: T) => string): T {
  const ws = xs.map(x => Math.max(0.05, ctx.weigh(drill, key(x))));
  let r = ctx.rng() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < xs.length; i++) if ((r -= ws[i]) < 0) return xs[i];
  return xs[xs.length - 1];
}

const box = (rng: Rng, width: number, maxHi: number, strings = ALL_STRINGS, minLo = 0): Region => {
  const lo = int(rng, minLo, maxHi - width + 1);
  return { lo, hi: lo + width - 1, strings };
};
const viewFor = (r: Region, extra: Pos[] = []) => ({ lo: 0, hi: Math.min(24, Math.max(15, r.hi + 1, ...extra.map(p => p.fret + 1))) });
const frets = (r: Region) => (r.lo === r.hi ? `fret ${r.lo}` : `frets ${r.lo}–${r.hi}`);
const where = (r: Region) => `${frets(r)}${r.strings.length === 6 ? ', all strings' : `, ${r.strings.map(s => STRING_NAMES[s]).join(' ')} string${r.strings.length > 1 ? 's' : ''}`}`;
const noteMarks = (ps: Pos[]) => ps.map(p => ({ pos: p, label: PITCH_NAMES[pcAt(p)] }));
const intMarks = (ps: Pos[], root: number) => ps.map(p => ({ pos: p, label: intervalLabel(pcAt(p), root), root: pcAt(p) === pc(root) }));
/** Interval name for 1..12 semitones (12 = octave). */
export const intervalFull = (i: number) => (i === 12 ? 'Octave' : INTERVAL_FULL[i % 12]);
const ordinal = (n: number) => ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th'][n];

// ---------- notes ----------
const nBox: Drill = {
  id: 'n-box', cat: 'notes', name: 'Notes in a box',
  levels: ['Natural notes, 4-fret box, frets 0–12', 'All 12 notes, 5-fret box, frets 0–12', 'All 12 notes, anywhere up to fret 17'],
  how: "Don't scan fret by fret. Get one from a landmark you know cold (open string, 5th, 7th, 12th fret), then jump to the rest with octave shapes: two strings up and two frets over (three once you cross onto the B string). Say the name out loud each time you touch one.",
  gen(level, ctx) {
    const pcs = level === 1 ? NATURALS : ALL_PCS;
    const p = wpick(ctx, 'n-box', pcs, x => String(x));
    const r = level === 1 ? box(ctx.rng, 4, 12) : level === 2 ? box(ctx.rng, 5, 12) : box(ctx.rng, 5, 17);
    return {
      drill: 'n-box', level, prompt: `Find every ${PITCH_NAMES[p]}`, sub: where(r), region: r, view: viewFor(r),
      given: [], targets: noteMarks(positionsOf([p], r)), item: String(p), sound: 'arp',
    };
  },
};

const nString: Drill = {
  id: 'n-string', cat: 'notes', name: 'Notes on a string',
  levels: ['Natural notes, low E and A strings', 'Natural notes, any string', 'All 12 notes, any string'],
  how: 'Play it, then say the name. Then find the same note on the string below and above (an octave shape away). One string at a time is the foundation; the octave jump is what links strings together.',
  gen(level, ctx) {
    const strings = level === 1 ? [5, 4] : ALL_STRINGS;
    const pcs = level === 3 ? ALL_PCS : NATURALS;
    const items = strings.flatMap(s => pcs.map(p => ({ s, p })));
    const { s, p } = wpick(ctx, 'n-string', items, x => `${x.p}@${x.s}`);
    const r: Region = { lo: 0, hi: 12, strings: [s] };
    return {
      drill: 'n-string', level, prompt: `Find ${PITCH_NAMES[p]} on the ${STRING_NAMES[s]} string`, sub: 'frets 0–12', region: r, view: viewFor(r),
      given: [], targets: noteMarks(positionsOf([p], r)), item: `${p}@${s}`, sound: 'arp',
    };
  },
};

const nName: Drill = {
  id: 'n-name', cat: 'notes', name: 'Name the note',
  levels: ['Natural notes, low E and A strings', 'Natural notes, any string, frets 0–12', 'Any note, frets 0–15'],
  how: 'Answer before you think: the goal is instant recall. If it takes more than 2 seconds, count it as a miss in your head; the app will bring it back sooner.',
  gen(level, ctx) {
    const strings = level === 1 ? [5, 4] : ALL_STRINGS;
    const maxF = level === 3 ? 15 : 12;
    const spots: Pos[] = [];
    for (const s of strings) for (let f = level === 1 ? 0 : 1; f <= maxF; f++) if (level === 3 || NATURALS.includes(pc(pitchAt({ string: s, fret: f })))) spots.push({ string: s, fret: f });
    const pos = wpick(ctx, 'n-name', spots, x => `${pcAt(x)}@${x.string}`);
    const r: Region = { lo: 0, hi: maxF, strings };
    const answer = PITCH_NAMES[pcAt(pos)];
    return {
      drill: 'n-name', level, prompt: 'What note is this?', sub: `${STRING_NAMES[pos.string]} string, fret ${pos.fret}`, region: r, view: viewFor(r),
      given: [{ pos, label: '?' }], targets: [{ pos, label: answer }],
      choices: level === 3 ? PITCH_NAMES : NATURALS.map(x => PITCH_NAMES[x]), answer, item: `${pcAt(pos)}@${pos.string}`, sound: 'arp',
    };
  },
};

const nOct: Drill = {
  id: 'n-oct', cat: 'notes', name: 'Octave shapes',
  levels: ['From the low E and A strings', 'From any string', 'From any string, up to fret 17'],
  how: 'There are only a few shapes: 2 strings up + 2 frets (3 when you land on or cross the B string), 3 strings up + 3 frets back, and the same string + 12. Find them by shape, then say the note name for each. This is what turns 72 separate facts into one map.',
  gen(level, ctx) {
    const strings = level === 1 ? [5, 4] : ALL_STRINGS;
    const s = wpick(ctx, 'n-oct', strings, x => String(x));
    const f = int(ctx.rng, 1, level === 3 ? 15 : 10);
    const pos = { string: s, fret: f };
    const r: Region = { lo: Math.max(0, f - 5), hi: Math.min(level === 3 ? 20 : 15, f + 5), strings: ALL_STRINGS };
    const name = PITCH_NAMES[pcAt(pos)];
    const targets = positionsOf([pcAt(pos)], r).filter(p => posKey(p) !== posKey(pos));
    return {
      drill: 'n-oct', level, prompt: `Find this ${name} in every other place`, sub: frets(r), region: r, view: viewFor(r),
      given: [{ pos, label: name, root: true }], targets: noteMarks(targets), item: String(s), sound: 'arp',
    };
  },
};

// ---------- intervals ----------
const INTERVAL_LEVELS = [[7, 12], [3, 4, 7, 12], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]];

const iFind: Drill = {
  id: 'i-find', cat: 'intervals', name: 'Find the interval',
  levels: ['5ths and octaves', '+ major and minor 3rds', 'All intervals'],
  how: 'Sing it before you find it: hum the root, then the interval, then put your finger where you heard it. Interval shapes are the same on every string pair except across the B string (one fret further).',
  gen(level, ctx) {
    const set = INTERVAL_LEVELS[level - 1];
    const i = wpick(ctx, 'i-find', set, x => String(x));
    const s = choose(ctx.rng, [5, 4, 3, 2]);
    const f = int(ctx.rng, 2, 10);
    const root = { string: s, fret: f };
    const r: Region = { lo: Math.max(0, f - 3), hi: f + 4, strings: ALL_STRINGS };
    const rootPitch = pitchAt(root);
    const targets = positionsOf([pc(rootPitch + i)], r).filter(p => posKey(p) !== posKey(root));
    return {
      drill: 'i-find', level, prompt: `Find every ${intervalFull(i).toLowerCase()} of ${keyName(pc(rootPitch))}`,
      sub: `${frets(r)} (${spell(rootPitch + i, pc(rootPitch))})`, region: r, view: viewFor(r),
      given: [{ pos: root, label: 'R', root: true }], targets: intMarks(targets, rootPitch), item: String(i), sound: 'interval',
    };
  },
};

const iName: Drill = {
  id: 'i-name', cat: 'intervals', name: 'Name the interval',
  levels: ['5ths and octaves', '+ major and minor 3rds', 'All intervals'],
  how: 'Name the shape, then listen to the reveal and name it by ear too. Linking the shape to the sound is the point: soon you will hear an interval and your hand will already know the shape.',
  gen(level, ctx) {
    const set = INTERVAL_LEVELS[level - 1];
    const i = wpick(ctx, 'i-name', set, x => String(x));
    const s = choose(ctx.rng, [5, 4, 3, 2]);
    const f = int(ctx.rng, 1, 10);
    const root = { string: s, fret: f };
    const rootPitch = pitchAt(root);
    // The other note: on a higher string within reach (or the same string).
    const opts = positionsOf([pc(rootPitch + i)], { lo: Math.max(0, f - 3), hi: f + 4, strings: ALL_STRINGS })
      .filter(p => pitchAt(p) - rootPitch === i);
    const other = opts.length ? choose(ctx.rng, opts) : { string: s, fret: f + i };
    const names = set.map(intervalFull);
    const r: Region = { lo: Math.max(0, f - 3), hi: f + 4, strings: ALL_STRINGS };
    return {
      drill: 'i-name', level, prompt: 'What interval is this?', sub: 'from R up to ?', region: r, view: viewFor(r, [other]),
      given: [{ pos: root, label: 'R', root: true }, { pos: other, label: '?' }],
      targets: [{ pos: other, label: intervalLabel(pitchAt(other), rootPitch) }],
      choices: [...new Set(names)], answer: intervalFull(i), item: String(i), sound: 'interval',
    };
  },
};

// ---------- chords ----------
const QUALITIES: Record<string, { tones: number[]; suffix: string; name: string }> = {
  maj: { tones: MAJOR_TRIAD, suffix: '', name: 'major' },
  min: { tones: MINOR_TRIAD, suffix: 'm', name: 'minor' },
  dim: { tones: DIM_TRIAD, suffix: 'dim', name: 'diminished' },
};
const SETS_EASY = [2, 3];          // G-B-e, D-G-B
const SETS_ALL = [2, 3, 4, 5];

const cTriad: Drill = {
  id: 'c-triad', cat: 'chords', name: 'Triad shapes',
  levels: ['Major and minor, top two string sets', 'Major and minor, all string sets', '+ diminished'],
  how: "Find one shape, then get the next one by moving its lowest note up to the next chord tone (it becomes the top note). Each inversion is the last one transformed, so you learn one move instead of three pictures. Play them in order up the neck and back, saying R, 3, 5 for the top note.",
  gen(level, ctx) {
    const sets = level === 1 ? SETS_EASY : SETS_ALL;
    const quals = level === 3 ? ['maj', 'min', 'dim'] : ['maj', 'min'];
    const items = sets.flatMap(set => quals.map(q => ({ set, q })));
    const { set, q } = wpick(ctx, 'c-triad', items, x => `${x.q}@${x.set}`);
    const root = int(ctx.rng, 0, 11);
    const Q = QUALITIES[q];
    const shapes = triadShapes(root, Q.tones, set, 15).filter(sh => sh.notes.every(n => n.fret <= 15));
    const r: Region = { lo: 0, hi: 15, strings: [set, set - 1, set - 2] };
    const pts = positionsOf(Q.tones.map(t => pc(root + t)), r); // every chord tone on the set belongs to some shape
    return {
      drill: 'c-triad', level, prompt: `${keyName(root, q === 'min')} ${Q.name}: find all three shapes`, sub: `${setName(set)} strings, frets 0–15`,
      region: r, view: viewFor(r), given: [], targets: intMarks(pts, root), shapes: shapes.map(s => s.notes), item: `${q}@${set}`, sound: 'arp',
    };
  },
};

const cInv: Drill = {
  id: 'c-inv', cat: 'chords', name: 'Next inversion',
  levels: ['Next shape up, same strings', 'Same chord, next string set (nearest shape)', 'Either, up or down'],
  how: 'Keep the notes that can stay, move the others the shortest distance. That is voice leading, and it is how real players connect chords: the hand never jumps, it slides into the next shape.',
  gen(level, ctx) {
    const mode = level === 1 ? 'up' : level === 2 ? 'set' : choose(ctx.rng, ['up', 'down', 'set', 'setDown']);
    const q = choose(ctx.rng, ['maj', 'min']);
    const Q = QUALITIES[q];
    for (let tries = 0; tries < 40; tries++) {
      const root = int(ctx.rng, 0, 11);
      const set = mode === 'set' ? choose(ctx.rng, [3, 4, 5]) : mode === 'setDown' ? choose(ctx.rng, [2, 3, 4]) : choose(ctx.rng, SETS_ALL);
      const shapes = triadShapes(root, Q.tones, set, 14);
      if (shapes.length < 2) continue;
      const i = int(ctx.rng, 0, shapes.length - 1);
      const from = shapes[i];
      let to: typeof from | undefined;
      let what: string;
      if (mode === 'up' || mode === 'down') {
        to = shapes[mode === 'up' ? i + 1 : i - 1];
        what = mode === 'up' ? 'the next shape up, same strings' : 'the next shape down, same strings';
      } else {
        const ns = mode === 'set' ? set - 1 : set + 1;
        const avg = (ps: Pos[]) => ps.reduce((a, p) => a + p.fret, 0) / ps.length;
        const cands = triadShapes(root, Q.tones, ns, 15);
        to = cands.sort((a, b) => Math.abs(avg(a.notes) - avg(from.notes)) - Math.abs(avg(b.notes) - avg(from.notes)))[0];
        what = `the nearest shape on ${setName(ns)}`;
      }
      if (!to) continue;
      const all = [...from.notes, ...to.notes];
      const r: Region = { lo: Math.max(0, Math.min(...all.map(p => p.fret)) - 2), hi: Math.max(...all.map(p => p.fret)) + 2, strings: [...new Set(all.map(p => p.string))] };
      return {
        drill: 'c-inv', level, prompt: `${keyName(root, q === 'min')} ${Q.name} (${INVERSION_NAMES[from.inversion]}): find ${what}`, sub: frets(r),
        region: r, view: viewFor(r), given: intMarks(from.notes, root).map(m => ({ ...m, root: false })), targets: intMarks(to.notes, root),
        shapes: [to.notes], item: mode, sound: 'arp',
      };
    }
    return nBox.gen(1, ctx); // unreachable in practice
  },
};

const cKey: Drill = {
  id: 'c-key', cat: 'chords', name: 'Chords in a key',
  levels: ['Chord named, G-B-e and D-G-B', 'Only the degree (work out the chord)', 'Only the degree, any string set'],
  how: "Before you look for it, say the chord: in G, vi is E minor. Then find its shape near where your hand already is, not where you first learned it. Real songs stay in one area of the neck; that's the skill.",
  gen(level, ctx) {
    const keyRoot = int(ctx.rng, 0, 11);
    const chords = diatonicTriads(keyRoot);
    const c = wpick(ctx, 'c-key', chords.slice(0, 6), x => x.roman); // skip vii° (rare in rock)
    const set = choose(ctx.rng, level === 3 ? SETS_ALL : SETS_EASY);
    const shapes = triadShapes(c.root, c.quality, set, 15).filter(sh => sh.notes.every(n => n.fret >= 1));
    const sh = choose(ctx.rng, shapes.length ? shapes : triadShapes(c.root, c.quality, set, 15));
    const lo = Math.max(0, Math.min(...sh.notes.map(n => n.fret)) - int(ctx.rng, 0, 1));
    const r: Region = { lo, hi: lo + 4, strings: [set, set - 1, set - 2] };
    const inBox = triadShapes(c.root, c.quality, set, 20).filter(s => s.notes.every(n => n.fret >= r.lo && n.fret <= r.hi));
    const pts = inBox.flatMap(s => s.notes);
    return {
      drill: 'c-key', level, prompt: `Key of ${keyName(keyRoot)}: find the ${c.roman} chord${level === 1 ? ` (${c.name})` : ''}`,
      sub: `${setName(set)} strings, ${frets(r)}`, region: r, view: viewFor(r), given: [], targets: intMarks(pts, c.root),
      shapes: inBox.map(s => s.notes), item: c.roman, sound: 'arp',
    };
  },
};

const ARP_QUALITIES: Record<string, { tones: number[]; suffix: string }> = {
  maj: { tones: [0, 4, 7], suffix: '' }, min: { tones: [0, 3, 7], suffix: 'm' },
  maj7: { tones: [0, 4, 7, 11], suffix: 'maj7' }, m7: { tones: [0, 3, 7, 10], suffix: 'm7' }, dom7: { tones: [0, 4, 7, 10], suffix: '7' },
  m7b5: { tones: [0, 3, 6, 10], suffix: 'm7b5' },
};
const cArp: Drill = {
  id: 'c-arp', cat: 'chords', name: 'Arpeggio in position',
  levels: ['Major and minor triads', '7th chords (maj7, m7, 7)', '+ m7b5'],
  how: 'Find the roots first (they are your anchors), then the 3rds (they decide major or minor), then the 5ths. Play it low to high and back, then start from the highest note: changing where you start forces you to know the map, not the finger sequence.',
  gen(level, ctx) {
    const qs = level === 1 ? ['maj', 'min'] : level === 2 ? ['maj7', 'm7', 'dom7'] : ['maj7', 'm7', 'dom7', 'm7b5'];
    const q = wpick(ctx, 'c-arp', qs, x => x);
    const root = int(ctx.rng, 0, 11);
    const r = box(ctx.rng, 5, 15, ALL_STRINGS, 1);
    const pts = positionsOf(ARP_QUALITIES[q].tones.map(t => pc(root + t)), r);
    return {
      drill: 'c-arp', level, prompt: `Every note of ${keyName(root, ['min', 'm7', 'm7b5'].includes(q))}${ARP_QUALITIES[q].suffix}`, sub: where(r), region: r, view: viewFor(r),
      given: [], targets: intMarks(pts, root), item: q, sound: 'arp',
    };
  },
};

// ---------- scales ----------
const SCALE_LEVELS: ScaleId[][] = [['minorPent', 'majorPent'], ['minor', 'major'], ['dorian', 'phrygian', 'lydian', 'mixolydian', 'harmonicMinor']];
const SCALE_LABEL: Partial<Record<ScaleId, string>> = {
  minorPent: 'minor pentatonic', majorPent: 'major pentatonic', minor: 'natural minor', major: 'major', dorian: 'Dorian',
  phrygian: 'Phrygian', lydian: 'Lydian', mixolydian: 'Mixolydian', harmonicMinor: 'harmonic minor',
};

const sBox: Drill = {
  id: 's-box', cat: 'scales', name: 'Scale in a box',
  levels: ['Pentatonics', 'Major and natural minor', 'Modes and harmonic minor'],
  how: "Find the roots first, then build the scale around them by interval, not by memorised box. Then play it: up and down, then in 3rds (skip a note), then starting on the 3rd. If you only ever start on the root, you only know one path through it.",
  gen(level, ctx) {
    const sc = wpick(ctx, 's-box', SCALE_LEVELS[level - 1], x => x);
    const root = int(ctx.rng, 0, 11);
    const r = box(ctx.rng, level === 1 ? 4 : 5, 15, ALL_STRINGS, 1);
    const pts = positionsOf(SCALES[sc].map(t => pc(root + t)), r);
    return {
      drill: 's-box', level, prompt: `${keyName(root, ['minorPent', 'minor', 'dorian', 'phrygian', 'harmonicMinor'].includes(sc))} ${SCALE_LABEL[sc]}`, sub: where(r), region: r, view: viewFor(r),
      given: [], targets: intMarks(pts, root), item: sc, sound: 'arp',
    };
  },
};

const sDegree: Drill = {
  id: 's-degree', cat: 'scales', name: 'Scale degrees',
  levels: ['Major keys: 3, 5, 6', 'Major keys: any degree', 'Minor keys: any degree'],
  how: 'Work it out from the root you can see, not from note names: the 6th is a whole step above the 5th, which is a power-chord shape away from the root. Thinking in degrees is what lets you move a lick to any key.',
  gen(level, ctx) {
    const minor = level === 3;
    const steps = minor ? SCALES.minor : SCALES.major;
    const degs = level === 1 ? [3, 5, 6] : [2, 3, 4, 5, 6, 7];
    const d = wpick(ctx, 's-degree', degs, x => String(x));
    const key = int(ctx.rng, 0, 11);
    const r = box(ctx.rng, 5, 15, ALL_STRINGS, 1);
    const target = pc(key + steps[d - 1]);
    const roots = positionsOf([key], r);
    return {
      drill: 's-degree', level, prompt: `Key of ${keyName(key, minor)}${minor ? ' minor' : ''}: find every ${ordinal(d)}`, sub: where(r),
      region: r, view: viewFor(r), given: roots.map(p => ({ pos: p, label: 'R', root: true })),
      targets: intMarks(positionsOf([target], r), key), item: String(d), sound: 'arp',
    };
  },
};

export const DRILLS: Drill[] = [nBox, nString, nName, nOct, iFind, iName, cTriad, cInv, cKey, cArp, sBox, sDegree];
export const drillById = (id: DrillId) => DRILLS.find(d => d.id === id)!;
