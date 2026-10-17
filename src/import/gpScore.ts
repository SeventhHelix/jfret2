// Guitar Pro import, the pure half: plain score types (filled in by gpRead.ts) and every decision about
// how a section of one track becomes a jFret riff. No alphaTab in here, so it's all unit-testable.
import { MAX_FRET, MAX_TICKS, Note, STRINGS, Song, TUNINGS, TUNING_IDS, TuningId, newId, normalizeNotes } from '../model/song';

/** Playing techniques jFret can't show. dead and grace notes are dropped; the rest import as plain notes. */
export type Fx = 'dead' | 'grace' | 'bend' | 'slide' | 'legato' | 'vibrato' | 'harmonic' | 'mute';

/** Times are jFret ticks (24 per quarter), not rounded yet. */
export type GpBar = { start: number; num: number; den: number; tempo: number; section?: string; repeat: boolean };
/** string 0 = the track's highest string; fret as written (relative to the capo). */
export type GpNote = { bar: number; start: number; dur: number; string: number; fret: number; tie: boolean; fx: Fx[] };
/** tuning: open-string MIDI pitches, high to low. */
export type GpTrack = { name: string; tuning: number[]; capo: number; notes: GpNote[] };
export type GpScore = { title: string; artist: string; bars: GpBar[]; tracks: GpTrack[] };

export type Section = { name: string; first: number; last: number };

/** Named sections from the file's markers; each runs up to the next marker. */
export function sections(score: GpScore): Section[] {
  const out: Section[] = [];
  score.bars.forEach((b, i) => {
    if (b.section === undefined) return;
    if (out.length) out[out.length - 1].last = i - 1;
    out.push({ name: b.section.trim() || `Section ${out.length + 1}`, first: i, last: score.bars.length - 1 });
  });
  return out;
}

/** Notes per bar for one track (grace notes don't count). */
export function barCounts(track: GpTrack, barCount: number): number[] {
  const counts = new Array<number>(barCount).fill(0);
  for (const n of track.notes) if (!n.fx.includes('grace') && n.bar < barCount) counts[n.bar]++;
  return counts;
}

export type TuningFit = {
  tuning: TuningId;
  offset: number;  // track string i sits on jFret string i + offset
  shift: number;   // semitones the track sounds above jFret's tuning (frets kept, so shapes stay right)
  refret: boolean; // no tuning fits the shapes: every note is placed by pitch instead
};

/** Prefer shifts of whole octaves (a bass is a guitar an octave down), then the smallest shift. */
const rank = (k: number) => Math.min(((k % 12) + 12) % 12, 12 - (((k % 12) + 12) % 12)) * 100 + Math.abs(k);

/** Pick the jFret tuning that keeps the track's fingering shapes. Capo is handled by the caller (added to frets). */
export function fitTuning(tuning: number[]): TuningFit {
  const n = tuning.length;
  let best: TuningFit | null = null;
  const offsets = n >= STRINGS ? [0] : Array.from({ length: STRINGS - n + 1 }, (_, o) => STRINGS - n - o); // bottom-aligned first
  for (const id of TUNING_IDS) {
    const open = TUNINGS[id].pitches;
    for (const o of offsets) {
      const ks: number[] = [];
      for (let i = 0; i < n && i + o < STRINGS; i++) ks.push(tuning[i] - open[i + o]);
      if (ks.length < 2 || ks.some(k => k !== ks[0])) continue;
      if (!best || rank(ks[0]) < rank(best.shift)) best = { tuning: id, offset: o, shift: ks[0], refret: false };
    }
  }
  return best ?? { tuning: 'std', offset: n >= STRINGS ? 0 : STRINGS - n, shift: 0, refret: true };
}

function semis(k: number): string {
  const a = Math.abs(k);
  return a === 12 ? 'an octave' : a === 24 ? 'two octaves' : `${a} semitone${a === 1 ? '' : 's'}`;
}

export function describeFit(track: GpTrack, fit: TuningFit): string {
  const name = TUNINGS[fit.tuning].name;
  if (fit.refret) return `${track.tuning.length}-string tuning jFret doesn't have: notes placed by pitch on ${name}`;
  if (fit.shift === 0) return name;
  return `${name} shapes, ${semis(fit.shift)} ${fit.shift < 0 ? 'lower' : 'higher'} in the file`;
}

export type Extracted = { song: Song; warnings: string[]; noteCount: number };

const FX_LABEL: Partial<Record<Fx, [string, string]>> = { // singular, plural
  bend: ['bend', 'bends'], slide: ['slide', 'slides'], legato: ['hammer-on/pull-off', 'hammer-ons/pull-offs'],
  vibrato: ['vibrato', 'vibrato'], harmonic: ['harmonic', 'harmonics'], mute: ['palm mute', 'palm mutes'],
};

/** Bars first..last (inclusive) of one track as a riff, plus what didn't survive the trip. */
export function extractSection(score: GpScore, trackIndex: number, first: number, last: number): Extracted {
  const track = score.tracks[trackIndex];
  const { bars } = score;
  const warnings: string[] = [];
  const b0 = bars[first], bN = bars[last];
  const secStart = b0.start;
  const secEnd = last + 1 < bars.length ? bars[last + 1].start : bN.start + (bN.num * 96) / bN.den;

  // Ties first, in the file's own strings, so a tie survives re-fretting.
  const src = track.notes.filter(n => n.bar >= first && n.bar <= last).sort((a, b) => a.start - b.start);
  const merged: GpNote[] = [];
  const lastOn = new Map<number, GpNote>();
  let dropped = 0;
  for (const n of src) {
    if (n.fx.includes('dead') || n.fx.includes('grace')) { dropped++; continue; }
    const prev = lastOn.get(n.string);
    if (n.tie && prev && prev.fret === n.fret && Math.abs(prev.start + prev.dur - n.start) < 0.5) {
      prev.dur = n.start + n.dur - prev.start;
      continue;
    }
    const copy = { ...n, fx: [...n.fx] };
    merged.push(copy);
    lastOn.set(n.string, copy);
  }

  const fit = fitTuning(track.tuning);
  const open = TUNINGS[fit.tuning].pitches;
  const desc = describeFit(track, fit);
  if (fit.refret || fit.shift !== 0) warnings.push(`Tuning: ${desc}.`);
  if (track.capo) warnings.push(`Capo ${track.capo}: frets moved up ${track.capo} (jFret has no capo).`);

  const notes: Note[] = [];
  let moved = 0, lost = 0, inexact = 0;
  const fxCount = new Map<Fx, number>();
  for (const n of merged) {
    const fret = n.fret + track.capo;
    let string = n.string + fit.offset;
    let f = fret;
    if (fit.refret || string >= STRINGS || f > MAX_FRET) {
      // Place by pitch on the string nearest to where it was, keeping the octave jFret's shapes imply.
      const target = track.tuning[n.string] + fret - fit.shift;
      const want = Math.min(STRINGS - 1, string);
      let pick: { s: number; f: number } | null = null;
      for (let s = 0; s < STRINGS; s++) {
        const cand = target - open[s];
        if (cand < 0 || cand > MAX_FRET) continue;
        if (!pick || Math.abs(s - want) < Math.abs(pick.s - want) || (Math.abs(s - want) === Math.abs(pick.s - want) && cand < pick.f)) pick = { s, f: cand };
      }
      if (!pick) { lost++; continue; }
      if (!fit.refret) moved++;
      string = pick.s; f = pick.f;
    }
    const startF = n.start - secStart, endF = Math.min(n.start + n.dur, secEnd) - secStart;
    const start = Math.round(startF);
    const end = Math.max(start + 1, Math.round(endF));
    if (Math.abs(startF - start) > 0.01 || Math.abs(endF - Math.round(endF)) > 0.01) inexact++;
    if (end > MAX_TICKS) { lost++; continue; }
    for (const fx of n.fx) fxCount.set(fx, (fxCount.get(fx) ?? 0) + 1);
    notes.push({ id: newId(), start, dur: end - start, string, fret: f });
  }
  if (moved) warnings.push(`${moved} note${moved === 1 ? '' : 's'} moved to another string (that string doesn't exist here).`);
  if (lost) warnings.push(`${lost} note${lost === 1 ? '' : 's'} couldn't be placed and ${lost === 1 ? 'was' : 'were'} left out.`);
  if (dropped) warnings.push(`${dropped} dead or grace note${dropped === 1 ? '' : 's'} left out.`);
  if (inexact) warnings.push(`${inexact} note${inexact === 1 ? '' : 's'} with rhythms jFret can't show exactly (e.g. 64ths, quintuplets) were rounded.`);

  const range = bars.slice(first, last + 1);
  const tempos = [...new Set(range.map(b => Math.round(b.tempo)))];
  const bpm = Math.min(300, Math.max(30, tempos[0]));
  if (tempos.length > 1) warnings.push(`Tempo changes inside the section (${tempos.join(' → ')} bpm); using ${bpm}.`);
  else if (bpm !== tempos[0]) warnings.push(`Tempo ${tempos[0]} bpm is outside 30-300; using ${bpm}.`);
  const okTs = b0.num >= 1 && b0.num <= 16 && [2, 4, 8, 16].includes(b0.den);
  const timeSig: [number, number] = okTs ? [b0.num, b0.den] : [4, 4];
  if (!okTs) warnings.push(`Time signature ${b0.num}/${b0.den} isn't supported; using 4/4.`);
  const sigs = [...new Set(range.map(b => `${b.num}/${b.den}`))];
  if (sigs.length > 1) warnings.push(`Time signature changes inside the section (${sigs.join(' → ')}): timing is kept, but later bar lines won't line up.`);
  if (range.some(b => b.repeat)) warnings.push('The section has repeat signs; bars are imported as written, not repeated.');
  const fxText = [...fxCount].filter(([fx]) => FX_LABEL[fx]).map(([fx, c]) => `${c} ${FX_LABEL[fx]![c === 1 ? 0 : 1]}`);
  if (fxText.length) warnings.push(`Played as plain notes (jFret doesn't show techniques yet): ${fxText.join(', ')}.`);

  const sec = sections(score).find(s => s.first === first && s.last === last);
  const title = `${score.title.trim() || 'Imported'} · ${sec ? sec.name : first === last ? `bar ${first + 1}` : `bars ${first + 1}-${last + 1}`}`;
  return { song: { v: 1, title, bpm, timeSig, tuning: fit.tuning, notes: normalizeNotes(notes) }, warnings, noteCount: notes.length };
}
