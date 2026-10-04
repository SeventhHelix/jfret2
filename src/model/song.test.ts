import { describe, it, expect } from 'vitest';
import {
  Note, emptySong, pitchOf, barTicks, beatTicks, sortNotes, songEndTick, soundingAt, notesInRange, noteName, normalizeNotes,
} from './song';

const n = (id: number, start: number, dur: number, string: number, fret: number): Note => ({ id, start, dur, string, fret });

describe('song helpers', () => {
  it('computes pitch from tuning', () => {
    const s = emptySong();
    expect(pitchOf(s, { string: 5, fret: 0 })).toBe(40);
    expect(pitchOf(s, { string: 0, fret: 12 })).toBe(76);
    expect(pitchOf({ ...s, tuning: 'dropD' }, { string: 5, fret: 2 })).toBe(40);
  });

  it('computes bar and beat lengths in ticks', () => {
    expect(barTicks([4, 4])).toBe(96);
    expect(barTicks([3, 4])).toBe(72);
    expect(barTicks([6, 8])).toBe(72);
    expect(beatTicks([4, 4])).toBe(24);
    expect(beatTicks([6, 8])).toBe(36);
  });

  it('sorts by start then string', () => {
    const sorted = sortNotes([n(1, 12, 1, 0, 0), n(2, 0, 1, 3, 0), n(3, 0, 1, 1, 0)]);
    expect(sorted.map(x => x.id)).toEqual([3, 2, 1]);
  });

  it('finds song end, sounding notes and notes in range', () => {
    const notes = [n(1, 0, 12, 0, 5), n(2, 12, 24, 1, 3)];
    expect(songEndTick({ ...emptySong(), notes })).toBe(36);
    expect(soundingAt(notes, 11).map(x => x.id)).toEqual([1]);
    expect(soundingAt(notes, 12).map(x => x.id)).toEqual([2]);
    expect(notesInRange(notes, 0, 12).map(x => x.id)).toEqual([1]);
  });

  it('names notes', () => {
    expect(noteName(40)).toBe('E');
    expect(noteName(61)).toBe('C#');
  });
});

describe('normalizeNotes (one note per string at a time)', () => {
  it('keeps one note per string per start, preferring the given ids, else the newest', () => {
    expect(normalizeNotes([n(1, 0, 12, 0, 5), n(2, 0, 12, 0, 7)]).map(x => x.id)).toEqual([2]);
    expect(normalizeNotes([n(1, 0, 12, 0, 5), n(2, 0, 12, 0, 7)], new Set([1])).map(x => x.id)).toEqual([1]);
  });

  it('cuts a ringing note short when the next note on its string starts', () => {
    const out = normalizeNotes([n(1, 0, 48, 0, 5), n(2, 12, 12, 0, 7)]);
    expect(out.map(x => [x.id, x.start, x.dur])).toEqual([[1, 0, 12], [2, 12, 12]]);
  });

  it('leaves chords and overlaps on different strings alone', () => {
    const out = normalizeNotes([n(1, 0, 48, 0, 5), n(2, 0, 48, 1, 5), n(3, 12, 12, 2, 7)]);
    expect(out.map(x => [x.id, x.dur])).toEqual([[1, 48], [2, 48], [3, 12]]);
  });
});
