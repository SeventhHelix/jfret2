// Speed: your own riffs, written in the Speed section. A riff is a row of steps (one note value each, like a beat
// in Guitar Pro), each holding at most one fret per string; a step with no notes is a rest. Pure.
import { PPQ } from '../model/song';
import { MAX_FRET } from '../model/song';
import type { ScaleId } from '../model/theory';
import type { Phrase, PNote } from './drill';

export type Step = { dur: number; frets: (number | null)[] }; // frets[string] (0 = high e), null = nothing
export type GuideScale = ScaleId | 'custom';
export type CustomRiff = {
  id: string;
  name: string;
  key: number;           // guide root pitch class
  scale: GuideScale;     // guide scale, or 'custom' = exactly the notes in `custom`
  custom: number[];      // pitch classes for the custom guide
  chord?: { deg: number; seventh: boolean } | null; // a chord of the scale to light up (its tones bright, the rest faint)
  steps: Step[];
  updated: number;
};

export const emptyStep = (dur: number): Step => ({ dur, frets: [null, null, null, null, null, null] });

export function newRiff(id: string, name: string, dur: number, now: number): CustomRiff {
  return { id, name, key: 9, scale: 'minor', custom: [], steps: [emptyStep(dur)], updated: now };
}

const touch = (r: CustomRiff, steps: Step[]): CustomRiff => ({ ...r, steps, updated: Date.now() });
const clampFret = (f: number) => Math.max(0, Math.min(MAX_FRET, Math.round(f)));

/** Put a fret on a string in a step (null clears it). Steps past the end are created with `dur`. */
export function setFret(r: CustomRiff, col: number, string: number, fret: number | null, dur: number): CustomRiff {
  const steps = r.steps.map(s => ({ ...s, frets: [...s.frets] }));
  while (steps.length <= col) steps.push(emptyStep(dur));
  steps[col].frets[string] = fret === null ? null : clampFret(fret);
  return touch(r, steps);
}

/** A whole chord/note in a step: these frets replace what's there (Shift-click on the neck adds instead). */
export function setStepNotes(r: CustomRiff, col: number, notes: { string: number; fret: number }[], dur: number, add = false): CustomRiff {
  const steps = r.steps.map(s => ({ ...s, frets: [...s.frets] }));
  while (steps.length <= col) steps.push(emptyStep(dur));
  if (!add) steps[col] = { ...steps[col], frets: [null, null, null, null, null, null] };
  for (const n of notes) steps[col].frets[n.string] = clampFret(n.fret);
  return touch(r, steps);
}

export function setDur(r: CustomRiff, col: number, dur: number): CustomRiff {
  if (col >= r.steps.length) return r;
  return touch(r, r.steps.map((s, i) => (i === col ? { ...s, dur } : s)));
}

export function insertStep(r: CustomRiff, col: number, dur: number): CustomRiff {
  const steps = [...r.steps];
  steps.splice(Math.min(col, steps.length), 0, emptyStep(dur));
  return touch(r, steps);
}

export function deleteStep(r: CustomRiff, col: number): CustomRiff {
  if (r.steps.length <= 1) return touch(r, [emptyStep(r.steps[0]?.dur ?? 12)]);
  return touch(r, r.steps.filter((_, i) => i !== col));
}

/** Trailing empty steps aren't part of the riff (the editor keeps one open at the end to type into). */
export function usedSteps(r: CustomRiff): Step[] {
  let n = r.steps.length;
  while (n > 0 && r.steps[n - 1].frets.every(f => f === null)) n--;
  return r.steps.slice(0, n);
}

export const stepStart = (r: CustomRiff, col: number) => r.steps.slice(0, col).reduce((a, s) => a + s.dur, 0);

/** The riff as a phrase for the drills, padded to a whole beat. */
export function riffPhrase(r: CustomRiff): Phrase {
  const notes: PNote[] = [];
  let t = 0;
  for (const s of usedSteps(r)) {
    s.frets.forEach((f, string) => { if (f !== null) notes.push({ start: t, dur: s.dur, string, fret: f }); });
    t += s.dur;
  }
  return { notes, len: Math.ceil(t / PPQ) * PPQ };
}

/** Saved riffs from storage, dropping anything malformed. */
export function readRiffs(raw: unknown): CustomRiff[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is CustomRiff =>
    !!r && typeof r === 'object' && typeof r.id === 'string' && Array.isArray(r.steps) &&
    r.steps.every((s: Step) => s && typeof s.dur === 'number' && s.dur > 0 && Array.isArray(s.frets) && s.frets.length === 6))
    .map(r => ({ ...r, name: String(r.name ?? 'Riff'), key: Number(r.key) || 0, scale: r.scale ?? 'minor', custom: Array.isArray(r.custom) ? r.custom : [] }));
}
