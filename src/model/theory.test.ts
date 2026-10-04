import { describe, it, expect } from 'vitest';
import { SCALES, intervalName, scalePitchClasses, songPitchClasses, guessRoot } from './theory';
import { Note, emptySong } from './song';

const n = (id: number, string: number, fret: number): Note => ({ id, start: id * 12, dur: 12, string, fret });

describe('theory', () => {
  it('names intervals from the root', () => {
    expect(intervalName(9, 9)).toBe('R');      // A over A
    expect(intervalName(0, 9)).toBe('b3');     // C over A
    expect(intervalName(4, 9)).toBe('5');      // E over A
    expect(intervalName(8, 9)).toBe('7');      // G# over A
    expect(intervalName(3, 9)).toBe('b5');     // D# over A
  });

  it('builds scale pitch classes from a root', () => {
    expect([...scalePitchClasses(9, SCALES.major)].sort((a, b) => a - b)).toEqual([1, 2, 4, 6, 8, 9, 11]); // A major
    expect([...scalePitchClasses(9, SCALES.minorPent)].sort((a, b) => a - b)).toEqual([0, 2, 4, 7, 9]);   // A minor pent
  });

  it('collects the pitch classes used in a song', () => {
    const s = { ...emptySong(), notes: [n(1, 5, 5), n(2, 4, 7), n(3, 0, 5)] }; // A, E, A
    expect([...songPitchClasses(s)].sort((a, b) => a - b)).toEqual([4, 9]);
  });

  it('guesses the root as the lowest note, defaulting to E', () => {
    expect(guessRoot(emptySong())).toBe(4);
    expect(guessRoot({ ...emptySong(), notes: [n(1, 0, 5), n(2, 5, 5)] })).toBe(9); // low A
  });
});
