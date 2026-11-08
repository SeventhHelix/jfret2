import { describe, expect, it } from 'vitest';
import { PATTERNS, PatternCfg, generate, sequence } from './patterns';
import { DrillCfg, buildCycle, chunked, dotted, ladderNext, phraseOf, scaleTime, toSong } from './drill';
import { pitchAt } from '../learn/fretmap';
import { pc } from '../model/theory';
import { normalizeNotes } from '../model/song';

const base: PatternCfg = { id: 'scale', key: 9, scale: 'minor', quality: 'min', seq: 'straight', dir: 'up', pos: 5 };

describe('patterns', () => {
  it('3-per-string A minor from the 5th fret', () => {
    const run = generate(base);
    expect(run).toHaveLength(18);
    expect(run[0]).toEqual({ string: 5, fret: 5 });
    expect(run.slice(0, 3).map(p => p.string)).toEqual([5, 5, 5]);
    const minor = new Set([9, 11, 0, 2, 4, 5, 7]);
    expect(run.every(p => minor.has(pc(pitchAt(p))))).toBe(true);
    for (let i = 1; i < run.length; i++) expect(pitchAt(run[i])).toBeGreaterThan(pitchAt(run[i - 1]));
  });

  it('sequences in groups', () => {
    expect(sequence([1, 2, 3, 4, 5], '3s')).toEqual([1, 2, 3, 2, 3, 4, 3, 4, 5]);
    expect(sequence([1, 2, 3], 'straight')).toEqual([1, 2, 3]);
  });

  it('up & down doesn\'t repeat the top or the bottom note', () => {
    const run = generate({ ...base, dir: 'updown' });
    expect(run).toHaveLength(18 + 16);
  });

  it('arpeggios only use chord tones and every pattern is playable', () => {
    for (const p of PATTERNS) {
      for (const key of [0, 4, 7, 9, 11]) {
        for (const quality of ['min', 'maj'] as const) {
          const run = generate({ ...base, id: p.id, key, quality, pos: 7 });
          expect(run.length, `${p.id} ${key} ${quality} ${JSON.stringify(run)}`).toBeGreaterThanOrEqual(5);
          expect(run.every(r => r.fret >= 0 && r.fret <= 24)).toBe(true);
          if (['skipArp', 'sweep3', 'sweep5'].includes(p.id)) {
            const tones = new Set((quality === 'min' ? [0, 3, 7] : [0, 4, 7]).map(t => pc(key + t)));
            expect(run.every(r => tones.has(pc(pitchAt(r))))).toBe(true);
          }
        }
      }
    }
  });

  it('the 5-string A minor sweep is the textbook shape', () => {
    const run = generate({ ...base, id: 'sweep5', key: 9, quality: 'min', pos: 12 });
    expect(run.slice(0, 7)).toEqual([
      { string: 4, fret: 12 }, { string: 4, fret: 15 }, { string: 3, fret: 14 }, { string: 2, fret: 14 },
      { string: 1, fret: 13 }, { string: 0, fret: 12 }, { string: 0, fret: 17 },
    ]);
  });
});

describe('drills', () => {
  const ph = phraseOf(generate(base).slice(0, 8), 12); // 8 eighth notes = 1 bar
  it('bursts: slow reps then double-time reps', () => {
    const d: DrillCfg = { id: 'burst', reps: 2, slow: 2, fast: 2, chunk: 4 };
    const c = buildCycle(ph, d);
    expect(c.len).toBe(96 * 2 + 48 * 2);
    expect(c.notes).toHaveLength(32);
    const fast = c.notes.filter(n => n.start >= 192);
    expect(fast.every(n => n.dur === 6)).toBe(true);
  });

  it('halving time', () => {
    expect(scaleTime(ph, 0.5).notes[1]).toMatchObject({ start: 6, dur: 6 });
  });

  it('dotted pairs keep the total length', () => {
    const ls = dotted(ph, 'ls');
    expect(ls.notes.slice(0, 2).map(n => [n.start, n.dur])).toEqual([[0, 18], [18, 6]]);
    const sl = dotted(ph, 'sl');
    expect(sl.notes.slice(0, 2).map(n => [n.start, n.dur])).toEqual([[0, 6], [6, 18]]);
  });

  it('chunks overlap by one note and rest after each', () => {
    const c = chunked(ph, 4); // notes 0-3, 3-6, 6-7
    const firstChunk = c.notes.filter(n => n.start < 48);
    expect(firstChunk).toHaveLength(4);
    expect(c.notes.filter(n => n.fret === ph.notes[3].fret && n.string === ph.notes[3].string).length).toBeGreaterThanOrEqual(2);
  });

  it('cycles become valid songs', () => {
    for (const id of ['steady', 'burst', 'chunks', 'rhythms'] as const) {
      const s = toSong(buildCycle(ph, { id, reps: 2, slow: 2, fast: 2, chunk: 5 }), 100, 'x');
      expect(normalizeNotes(s.notes)).toHaveLength(s.notes.length); // one note per string at a time, nothing dropped
      expect(s.notes.every(n => Number.isInteger(n.start) && Number.isInteger(n.dur) && n.dur > 0)).toBe(true);
    }
  });

  it('tempo ladder', () => {
    const l = { on: true, step: 5, every: 2, target: 110 };
    expect(ladderNext(l, 100, 1)).toBe(100);
    expect(ladderNext(l, 100, 2)).toBe(105);
    expect(ladderNext(l, 108, 4)).toBe(110);
    expect(ladderNext(l, 110, 6)).toBe(110);
    expect(ladderNext({ ...l, on: false }, 100, 2)).toBe(100);
  });
});
