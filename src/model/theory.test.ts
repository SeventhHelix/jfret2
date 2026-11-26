import { describe, it, expect } from 'vitest';
import { SCALES, detectKeys, romanOf, scaleChords, intervalName, scalePitchClasses, songPitchClasses, guessRoot } from './theory';
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

describe('key detection', () => {
  const run = (pcs: number[], base = 57, dur = 12) => pcs.map((p, i) => ({ pitch: base + p, start: i * dur, dur }));
  it('a natural minor run from A is A minor, not C major', () => {
    const k = detectKeys(run([0, 2, 3, 5, 7, 8, 10, 12, 10, 8, 7, 5, 3, 2, 0]));
    expect(k[0]).toMatchObject({ root: 9, scale: 'minor' });
  });
  it('a C major run is C major', () => {
    const k = detectKeys(run([0, 2, 4, 5, 7, 9, 11, 12, 7, 4, 0], 48));
    expect(k[0]).toMatchObject({ root: 0, scale: 'major' });
  });
  it('a pentatonic lick shows the pentatonic', () => {
    const k = detectKeys(run([0, 3, 5, 7, 10, 12, 10, 7, 5, 3, 0], 52)); // E minor pentatonic
    expect(k[0]).toMatchObject({ root: 4, scale: 'minorPent' });
  });
  it('a raised 6th in minor reads as Dorian', () => {
    const k = detectKeys(run([0, 2, 3, 5, 7, 9, 10, 12, 9, 7, 9, 10, 9, 7, 3, 0], 50)); // D Dorian, leaning on B
    expect(k[0]).toMatchObject({ root: 2, scale: 'dorian' });
  });
  it('a raised 7th in minor reads as harmonic minor', () => {
    const k = detectKeys(run([0, 2, 3, 5, 7, 8, 11, 12, 11, 8, 7, 11, 12, 7, 0], 52)); // E harmonic minor
    expect(k[0]).toMatchObject({ root: 4, scale: 'harmonicMinor' });
  });
  it('gives alternatives and nothing for no notes', () => {
    expect(detectKeys(run([0, 4, 7, 12], 48)).length).toBe(3);
    expect(detectKeys([])).toEqual([]);
  });
});

describe('chords in a scale', () => {
  it('harmonises the major scale', () => {
    const cs = scaleChords(SCALES.major, false);
    expect(cs.map(c => c.quality)).toEqual(['', 'm', 'm', '', '', 'm', 'dim']);
    expect(scaleChords(SCALES.major, true).map(c => c.quality)).toEqual(['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5']);
    expect(cs[4].offsets).toEqual([7, 11, 14]); // V = G B D in C
  });
  it('pentatonics just give the home chord', () => {
    expect(scaleChords(SCALES.minorPent, false)).toEqual([{ deg: 0, offsets: [0, 3, 7], quality: 'm' }]);
  });
  it('roman labels', () => {
    expect(romanOf(1, 'm7')).toBe('ii7');
    expect(romanOf(4, '7')).toBe('V7');
    expect(romanOf(6, 'm7b5')).toBe('viiø7');
    expect(romanOf(6, 'dim')).toBe('vii°');
  });
});
