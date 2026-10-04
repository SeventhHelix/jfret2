import { describe, it, expect } from 'vitest';
import { Note, Song, emptySong } from './song';
import {
  addNote, deleteNotes, moveNotes, resizeNotes, setDuration, quantize, applyFeel, evenOut, legato, shiftFrom,
} from './ops';

const mk = (notes: Omit<Note, 'id'>[]): Song => ({ ...emptySong(), notes: notes.map((x, i) => ({ ...x, id: i + 1 })) });
const ids = (...xs: number[]) => new Set(xs);
const starts = (s: Song) => s.notes.map(n => n.start);
const durs = (s: Song) => s.notes.map(n => n.dur);
const note = (start: number, dur = 12, string = 0, fret = 5) => ({ start, dur, string, fret });

describe('ops', () => {
  it('addNote returns a new id and keeps notes sorted', () => {
    const { song, id } = addNote(mk([note(24)]), note(0));
    expect(starts(song)).toEqual([0, 24]);
    expect(song.notes[0].id).toBe(id);
  });

  it('deleteNotes removes by id', () => {
    expect(starts(deleteNotes(mk([note(0), note(12)]), ids(1)))).toEqual([12]);
  });

  it('moveNotes shifts time and clamps at zero', () => {
    expect(starts(moveNotes(mk([note(12), note(24)]), ids(1, 2), -24, 0))).toEqual([0, 12]);
  });

  it('moveNotes changes string keeping pitch', () => {
    const m = moveNotes(mk([note(0, 12, 0, 5)]), ids(1), 0, 1);
    expect(m.notes[0]).toMatchObject({ string: 1, fret: 10 });
  });

  it('moveNotes refuses to move strings off the neck', () => {
    expect(moveNotes(mk([note(0, 12, 0, 5)]), ids(1), 0, -1).notes[0].string).toBe(0);
  });

  it('moveNotes keeps the fret when the pitch is unreachable', () => {
    const m = moveNotes(mk([note(0, 12, 1, 24)]), ids(1), 0, 1);
    expect(m.notes[0]).toMatchObject({ string: 2, fret: 24 });
  });

  it('resizeNotes never goes below 1 tick', () => {
    expect(durs(resizeNotes(mk([note(0, 12)]), ids(1), -50))).toEqual([1]);
    expect(durs(resizeNotes(mk([note(0, 12)]), ids(1), 6))).toEqual([18]);
  });

  it('setDuration sets selected durations', () => {
    expect(durs(setDuration(mk([note(0), note(12)]), ids(2), 24))).toEqual([12, 24]);
  });

  it('quantize snaps starts at full strength', () => {
    expect(starts(quantize(mk([note(13, 10), note(25, 10)]), ids(1, 2), 12, 1, false))).toEqual([12, 24]);
  });

  it('quantize moves partway at half strength', () => {
    expect(starts(quantize(mk([note(18)]), ids(1), 12, 0.5, false))).toEqual([21]);
  });

  it('quantize can snap ends too', () => {
    const q = quantize(mk([note(13, 10)]), ids(1), 12, 1, true);
    expect(q.notes[0]).toMatchObject({ start: 12, dur: 12 });
  });

  it('applyFeel re-times notes from click gaps scaled to the grid', () => {
    const s = mk([note(0), note(12), note(24), note(36)]);
    const gaps = new Map([[2, 500], [3, 250], [4, 250]]);
    const f = applyFeel(s, ids(1, 2, 3, 4), gaps, 12);
    expect(starts(f)).toEqual([0, 18, 27, 36]);
    expect(durs(f)).toEqual([18, 9, 9, 12]);
  });

  it('applyFeel does nothing without recorded gaps', () => {
    const s = mk([note(0), note(12)]);
    expect(applyFeel(s, ids(1, 2), new Map(), 12)).toBe(s);
  });

  it('evenOut spaces notes one grid step apart keeping chords together', () => {
    const s = mk([note(0), note(5, 12, 0), note(5, 12, 1), note(30)]);
    const e = evenOut(s, ids(1, 2, 3, 4), 12);
    expect(starts(e)).toEqual([0, 12, 12, 24]);
    expect(durs(e)).toEqual([12, 12, 12, 12]);
  });

  it('legato extends notes to the next onset', () => {
    const l = legato(mk([note(0, 3), note(12, 3), note(30, 3)]), ids(1, 2, 3));
    expect(durs(l)).toEqual([12, 18, 3]);
  });
});

import { MAX_TICKS } from './song';

describe('ops hardening', () => {
  it('setDuration clamps to at least 1 tick, rounds, and respects MAX_TICKS', () => {
    expect(durs(setDuration(mk([note(0)]), ids(1), 0))).toEqual([1]);
    expect(durs(setDuration(mk([note(0)]), ids(1), 2.6))).toEqual([3]);
    expect(durs(setDuration(mk([note(100)]), ids(1), 1e9))).toEqual([MAX_TICKS - 100]);
  });

  it('resizeNotes respects MAX_TICKS', () => {
    expect(durs(resizeNotes(mk([note(100, 12)]), ids(1), 1e9))).toEqual([MAX_TICKS - 100]);
  });

  it('moveNotes does not push a note end past MAX_TICKS', () => {
    const m = moveNotes(mk([note(0, 12)]), ids(1), 1e9, 0);
    expect(m.notes[0].start + m.notes[0].dur).toBe(MAX_TICKS);
  });

  it('applyFeel keeps chords together using the lowest-id gap', () => {
    const s = mk([note(0, 12, 0), note(12, 12, 0), note(12, 12, 1), note(24, 12, 0)]);
    const gaps = new Map([[2, 500], [3, 999], [4, 250]]);
    const f = applyFeel(s, ids(1, 2, 3, 4), gaps, 12);
    expect(starts(f)).toEqual([0, 16, 16, 24]);
    expect(durs(f)).toEqual([16, 8, 8, 12]);
  });
});

describe('central clamp', () => {
  it('applyFeel with a huge gap keeps every note end within MAX_TICKS', () => {
    const s = mk([note(0), note(12), note(24), note(36)]);
    const gaps = new Map([[2, 1e9], [3, 1], [4, 1]]);
    const f = applyFeel(s, ids(1, 2, 3, 4), gaps, 12);
    for (const x of f.notes) expect(x.start + x.dur).toBeLessThanOrEqual(MAX_TICKS);
  });

  it('withNotes clamps out-of-range notes from any op', () => {
    const { song } = addNote(mk([]), { start: MAX_TICKS + 500, dur: 1e9, string: 0, fret: 0 });
    expect(song.notes[0].start).toBe(MAX_TICKS - 1);
    expect(song.notes[0].start + song.notes[0].dur).toBeLessThanOrEqual(MAX_TICKS);
  });

  it('moveNotes with dTicks = 0 leaves starts unchanged', () => {
    expect(starts(moveNotes(mk([note(5), note(30)]), ids(1, 2), 0, 0))).toEqual([5, 30]);
  });
});

describe('shiftFrom', () => {
  it('shifts notes starting at or after a tick, leaving earlier ones', () => {
    const s = mk([note(0), note(12), note(24)]);
    expect(starts(shiftFrom(s, 12, 12))).toEqual([0, 24, 36]);
  });

  it('returns the same song when nothing is at or after the tick', () => {
    const s = mk([note(0)]);
    expect(shiftFrom(s, 12, 12)).toBe(s);
  });
});
