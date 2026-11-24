import { describe, expect, it } from 'vitest';
import { deleteStep, insertStep, newRiff, readRiffs, riffPhrase, setDur, setFret, setStepNotes, usedSteps } from './custom';

describe('custom riffs', () => {
  it('typing frets builds steps and a phrase', () => {
    let r = newRiff('a', 'Test', 12, 0);
    r = setFret(r, 0, 5, 5, 12);
    r = setFret(r, 1, 5, 7, 12);   // past the end: a new step
    r = setFret(r, 2, 4, 5, 6);
    r = setFret(r, 3, 0, null, 12); // an empty trailing step isn't part of the riff
    expect(r.steps).toHaveLength(4);
    expect(usedSteps(r)).toHaveLength(3);
    const ph = riffPhrase(r);
    expect(ph.notes.map(n => [n.start, n.dur, n.string, n.fret])).toEqual([[0, 12, 5, 5], [12, 12, 5, 7], [24, 6, 4, 5]]);
    expect(ph.len).toBe(48);
  });
  it('chords, durations, insert and delete', () => {
    let r = newRiff('a', 'Test', 12, 0);
    r = setStepNotes(r, 0, [{ string: 5, fret: 0 }, { string: 4, fret: 2 }], 12);
    r = setStepNotes(r, 0, [{ string: 3, fret: 2 }], 12, true);
    expect(r.steps[0].frets).toEqual([null, null, null, 2, 2, 0]);
    r = setStepNotes(r, 0, [{ string: 5, fret: 3 }], 12);
    expect(r.steps[0].frets).toEqual([null, null, null, null, null, 3]);
    r = setDur(r, 0, 8);
    r = insertStep(r, 0, 24);
    expect(r.steps.map(s => s.dur)).toEqual([24, 8]);
    r = deleteStep(r, 0);
    expect(r.steps.map(s => s.dur)).toEqual([8]);
    expect(deleteStep(r, 0).steps).toHaveLength(1); // never empty: there's always a step to type into
  });
  it('reads storage defensively', () => {
    expect(readRiffs(null)).toEqual([]);
    expect(readRiffs([{ id: 'x', steps: [{ dur: 0, frets: [] }] }])).toEqual([]);
    expect(readRiffs([{ id: 'x', name: 'A', steps: [{ dur: 12, frets: [null, null, null, null, null, 3] }] }])[0].scale).toBe('minor');
  });
});
