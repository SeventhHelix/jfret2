export const PPQ = 24; // ticks per quarter note
export const MAX_FRET = 24;
export const STRINGS = 6;
export const MAX_TICKS = 999 * 96 * 4;

export type TuningId = 'std' | 'dropD' | 'halfDown' | 'dadgad' | 'openG';

// MIDI pitches per string, index 0 = high e ... 5 = low E
export const TUNINGS: Record<TuningId, { name: string; pitches: number[] }> = {
  std: { name: 'Standard (EADGBE)', pitches: [64, 59, 55, 50, 45, 40] },
  dropD: { name: 'Drop D', pitches: [64, 59, 55, 50, 45, 38] },
  halfDown: { name: 'Half step down', pitches: [63, 58, 54, 49, 44, 39] },
  dadgad: { name: 'DADGAD', pitches: [62, 57, 55, 50, 45, 38] },
  openG: { name: 'Open G (DGDGBD)', pitches: [62, 59, 55, 50, 43, 38] },
};
export const TUNING_IDS = Object.keys(TUNINGS) as TuningId[];

export type Note = { id: number; start: number; dur: number; string: number; fret: number };

export type Song = {
  v: 1;
  title: string;
  bpm: number;
  timeSig: [number, number];
  tuning: TuningId;
  notes: Note[];
};

let nextId = 1;
export function newId(): number {
  return nextId++;
}

export function emptySong(): Song {
  return { v: 1, title: 'Untitled riff', bpm: 100, timeSig: [4, 4], tuning: 'std', notes: [] };
}

export function openPitch(tuning: TuningId, string: number): number {
  return TUNINGS[tuning].pitches[string];
}

export function pitchOf(song: Song, n: Pick<Note, 'string' | 'fret'>): number {
  return openPitch(song.tuning, n.string) + n.fret;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function noteName(midi: number): string {
  return NAMES[midi % 12];
}

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => a.start - b.start || a.string - b.string);
}

export function barTicks(ts: [number, number]): number {
  return (ts[0] * PPQ * 4) / ts[1];
}

// Compound meters (6/8, 9/8, 12/8) count in dotted quarters.
export function beatTicks(ts: [number, number]): number {
  return ts[1] === 8 && ts[0] % 3 === 0 ? (PPQ * 3) / 2 : (PPQ * 4) / ts[1];
}

export function songEndTick(song: Song): number {
  return song.notes.reduce((m, n) => Math.max(m, n.start + n.dur), 0);
}

export function soundingAt(notes: Note[], tick: number): Note[] {
  return notes.filter(n => n.start <= tick && tick < n.start + n.dur);
}

export function notesInRange(notes: Note[], start: number, end: number): Note[] {
  return notes.filter(n => n.start >= start && n.start < end);
}
