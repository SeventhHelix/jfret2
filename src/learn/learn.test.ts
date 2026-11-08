import { describe, expect, it } from 'vitest';
import { diatonicTriads, landmarkHint, nameAt, pitchAt, positionsOf, triadShapes, MINOR_TRIAD, MAJOR_TRIAD } from './fretmap';
import { DRILLS, Question } from './drills';
import { emptyStats, readyToLevelUp, record, streakDays, weight } from './stats';
import { pc } from '../model/theory';

const seeded = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

describe('fretmap', () => {
  it('finds every E in frets 0-12', () => {
    const ps = positionsOf([4], { lo: 0, hi: 12, strings: [0, 1, 2, 3, 4, 5] });
    expect(ps.map(nameAt).every(n => n === 'E')).toBe(true);
    expect(ps).toContainEqual({ string: 5, fret: 0 });
    expect(ps).toContainEqual({ string: 3, fret: 2 });
    expect(ps).toContainEqual({ string: 1, fret: 5 });
    expect(ps).toHaveLength(2 + 1 + 1 + 1 + 1 + 2); // E: 0,12 · A: 7 · D: 2 · G: 9 · B: 5 · e: 0,12
  });

  it('hints from the nearest landmark', () => {
    expect(landmarkHint({ string: 4, fret: 7 })).toBe('A string fret 7 = E');
    expect(landmarkHint({ string: 4, fret: 3 })).toBe('A string fret 5 = D, down 2 → C');
    expect(landmarkHint({ string: 5, fret: 1 })).toBe('E string open = E, up 1 → F');
  });

  it('builds the three triad inversions on G-B-e', () => {
    const shapes = triadShapes(9, MINOR_TRIAD, 2, 15); // A minor
    for (const sh of shapes) {
      expect(new Set(sh.notes.map(n => pc(pitchAt(n))))).toEqual(new Set([9, 0, 4]));
      const ps = sh.notes.map(pitchAt);
      expect(ps[0] < ps[1] && ps[1] < ps[2]).toBe(true);
    }
    expect(new Set(shapes.map(s => s.inversion))).toEqual(new Set([0, 1, 2]));
    // Root position Am on G-B-e: G 2 (A), B 1 (C), e 0 (E)
    expect(shapes.find(s => s.notes[0].fret === 2)).toEqual({ inversion: 0, notes: [{ string: 2, fret: 2 }, { string: 1, fret: 1 }, { string: 0, fret: 0 }] });
  });

  it('names the chords of a major key', () => {
    expect(diatonicTriads(7).map(c => c.name)).toEqual(['G', 'Am', 'Bm', 'C', 'D', 'Em', 'F#dim']);
    expect(diatonicTriads(0)[0].quality).toEqual(MAJOR_TRIAD);
  });
});

describe('drills', () => {
  const ctx = { rng: seeded(7), weigh: () => 1 };
  it('every drill and level makes a sensible question', () => {
    for (const d of DRILLS) {
      for (let level = 1; level <= d.levels.length; level++) {
        for (let k = 0; k < 30; k++) {
          const q: Question = d.gen(level, ctx);
          expect(q.prompt.length).toBeGreaterThan(3);
          expect(q.targets.length).toBeGreaterThan(0);
          for (const m of [...q.targets, ...q.given]) {
            expect(m.pos.fret).toBeGreaterThanOrEqual(0);
            expect(m.pos.fret).toBeLessThanOrEqual(24);
            expect(m.pos.fret).toBeLessThanOrEqual(q.view.hi);
          }
          if (q.choices) expect(q.choices).toContain(q.answer);
        }
      }
    }
  });

  it('weights steer which item comes up', () => {
    const d = DRILLS.find(x => x.id === 'n-box')!;
    const weigh = (_: string, item: string) => (item === '4' ? 1000 : 0.001);
    const qs = Array.from({ length: 20 }, () => d.gen(1, { rng: seeded(3), weigh }));
    expect(qs.every(q => q.prompt === 'Find every E')).toBe(true);
  });
});

describe('stats', () => {
  it('missed items come back more than solid ones', () => {
    let s = emptyStats();
    const now = Date.now();
    s = record(s, 'n-box', 1, 'a', false, 3000, now);
    for (let i = 0; i < 4; i++) s = record(s, 'n-box', 1, 'b', true, 1500, now);
    expect(weight(s, 'n-box', 'a', now)).toBeGreaterThan(weight(s, 'n-box', 'b', now));
    expect(weight(s, 'n-box', 'never', now)).toBeGreaterThan(weight(s, 'n-box', 'b', now));
  });

  it('suggests levelling up after 8 of the last 10', () => {
    let s = emptyStats();
    for (let i = 0; i < 10; i++) s = record(s, 'n-box', 1, 'x', i >= 2, 1000, 0);
    expect(readyToLevelUp(s, 'n-box', 1)).toBe(true);
    s = record(s, 'n-box', 1, 'x', false, 1000, 0); // the two old misses slide out of the window,
    s = record(s, 'n-box', 1, 'x', false, 1000, 0); // so it takes three new ones to drop below 8 of 10
    s = record(s, 'n-box', 1, 'x', false, 1000, 0);
    expect(readyToLevelUp(s, 'n-box', 1)).toBe(false);
  });

  it('counts the daily streak', () => {
    const day = 864e5, now = new Date(2026, 10, 7, 12).getTime();
    let s = emptyStats();
    s = record(s, 'n-box', 1, 'x', true, 1, now - 2 * day);
    s = record(s, 'n-box', 1, 'x', true, 1, now - day);
    expect(streakDays(s.days, now)).toBe(2); // not yet today: yesterday's streak still counts
    s = record(s, 'n-box', 1, 'x', true, 1, now);
    expect(streakDays(s.days, now)).toBe(3);
  });
});
