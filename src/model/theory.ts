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
