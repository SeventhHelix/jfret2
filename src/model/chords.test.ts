import { describe, expect, it } from 'vitest';
import { guideTones, parseProgression, parseRoman } from './chords';

describe('roman numerals', () => {
  it('2-5-1 in C with sevenths', () => {
    const { chords, bad } = parseProgression('ii7 V7 Imaj7', 0);
    expect(bad).toEqual([]);
    expect(chords.map(c => c.name)).toEqual(['Dm7', 'G7', 'Cmaj7']);
    expect(chords[1].tones).toEqual([0, 4, 7, 10]);
  });
  it('triads, separators, borrowed chords', () => {
    expect(parseProgression('I-IV-V', 7).chords.map(c => c.name)).toEqual(['G', 'C', 'D']);
    expect(parseProgression('i, bVI, bVII', 9).chords.map(c => c.name)).toEqual(['Am', 'F', 'G']);
    expect(parseProgression('iiø7 V7 i', 0).chords.map(c => c.name)).toEqual(['Dm7b5', 'G7', 'Cm']);
    expect(parseRoman('vii°', 0)!.name).toBe('Bdim');
  });
  it('spells flats in flat keys', () => {
    expect(parseProgression('I IV V', 10).chords.map(c => c.name)).toEqual(['Bb', 'Eb', 'F']);
  });
  it('reports what it cannot read', () => {
    expect(parseProgression('I IV X', 0).bad).toEqual(['X']);
  });
  it('guide tones are the 3rd and 7th', () => {
    expect(guideTones(parseRoman('V7', 0)!)).toEqual([4, 10]);
    expect(guideTones(parseRoman('ii', 0)!)).toEqual([3]);
  });
});
