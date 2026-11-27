import { describe, expect, it } from 'vitest';
import { OLD_PRESETS, PRESETS, changeMap, chordScale, guideTones, newNotes, parseProgression, parseRoman, parseSymbol } from './chords';

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
  it('secondary dominants and extensions', () => {
    const c = parseRoman('V7/ii', 0)!; // A7 in C
    expect(c.root).toBe(9);
    expect(c.name).toBe('A7');
    expect(parseRoman('Isus4', 0)!.tones).toEqual([0, 5, 7]);
    expect(parseRoman('ii9', 0)!.tones).toEqual([0, 3, 7, 10, 14]);
  });
});

describe('chord symbols', () => {
  it('reads symbols and names their place in the key', () => {
    const { chords, bad } = parseProgression('C E G', 0);
    expect(bad).toEqual([]);
    expect(chords.map(c => c.roman)).toEqual(['I', 'III', 'V']);
    expect(parseProgression('Cmaj7 A7 Dm7 G7', 0).chords.map(c => c.roman)).toEqual(['Imaj7', 'VI7', 'ii7', 'V7']);
    expect(parseSymbol('Bbmaj7', 0)!.roman).toBe('bVIImaj7');
    expect(parseSymbol('Dm7b5', 0)!.tones).toEqual([0, 3, 6, 10]);
    expect(parseSymbol('Csus4', 0)!.tones).toEqual([0, 5, 7]);
    expect(parseSymbol('H7', 0)).toBe(null);
  });
});

describe('what each note does on the change', () => {
  it('Dm7 to G7: D and F stay, C falls a half step to B, A falls to G', () => {
    const [dm7, g7] = parseProgression('ii7 V7', 0).chords;
    const byFrom = Object.fromEntries(changeMap(dm7, g7).map(x => [x.from, x]));
    expect(byFrom[2]).toMatchObject({ to: 2, semis: 0, fromLabel: 'R', toLabel: '5' });
    expect(byFrom[5]).toMatchObject({ to: 5, semis: 0, fromLabel: 'b3', toLabel: 'b7' });
    expect(byFrom[0]).toMatchObject({ to: 11, semis: -1, fromLabel: 'b7', toLabel: '3' });
    expect(byFrom[9]).toMatchObject({ to: 7, semis: -2, fromLabel: '5', toLabel: 'R' });
  });
  it('C to E: G# is the new note', () => {
    const [c, e] = parseProgression('C E', 0).chords;
    expect(newNotes(c, e)).toEqual([8, 11]); // G# and B; E is shared
  });
});

describe('sweet notes per chord', () => {
  const at = (xs: { pc: number; tier: string; label: string }[], p: number) => xs.find(x => x.pc === p);
  it('IV gets the #11, I avoids the 11', () => {
    const [I, IV] = parseProgression('I IV', 0).chords;
    expect(at(chordScale(IV, 0), 11)).toMatchObject({ label: '#11', tier: 'tension' }); // B over F
    expect(at(chordScale(I, 0), 5)).toMatchObject({ tier: 'avoid' });                  // F over C
    expect(at(chordScale(I, 0), 2)).toMatchObject({ label: '9', tier: 'tension' });
  });
  it('a V7 going to minor takes the b9', () => {
    const [ii, V, i] = parseProgression('iiø7 V7 i', 0).chords;
    expect(at(chordScale(V, 0, i), 8)).toMatchObject({ label: 'b9', tier: 'tension' }); // Ab over G7
    expect(at(chordScale(ii, 0), 3)).toMatchObject({ label: 'b9', tier: 'avoid' });     // Eb over Dm7b5
  });
});

describe('presets', () => {
  it('are all 4 chords and all readable, in every key', () => {
    for (const [p] of PRESETS) for (let k = 0; k < 12; k++) {
      const { chords, bad } = parseProgression(p, k);
      expect(bad).toEqual([]);
      expect(chords).toHaveLength(4);
    }
    for (const v of Object.values(OLD_PRESETS)) expect(PRESETS.some(([p]) => p === v)).toBe(true);
  });
});
