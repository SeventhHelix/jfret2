import { describe, it, expect } from 'vitest';
import { displayValue, layoutBar } from './rhythm';
import { Note } from '../model/song';

const n = (id: number, start: number, dur: number, string = 0): Note => ({ id, start, dur, string, fret: 0 });

describe('displayValue', () => {
  it('maps to the nearest standard value', () => {
    expect(displayValue(12)).toMatchObject({ ticks: 12, flags: 1 });
    expect(displayValue(13).ticks).toBe(12);
    expect(displayValue(8)).toMatchObject({ ticks: 8, triplet: true });
    expect(displayValue(96).stem).toBe('none');
    expect(displayValue(200).ticks).toBe(96);
  });
});

describe('layoutBar', () => {
  it('beams eighths within a beat', () => {
    const { events } = layoutBar([n(1, 0, 12), n(2, 12, 12), n(3, 24, 12), n(4, 36, 12)], 0, 96, 24);
    expect(events).toHaveLength(4);
    expect(events[0].beam).not.toBeNull();
    expect(events[0].beam).toBe(events[1].beam);
    expect(events[2].beam).toBe(events[3].beam);
    expect(events[1].beam).not.toBe(events[2].beam);
  });

  it('groups simultaneous notes into one event', () => {
    const { events } = layoutBar([n(1, 0, 24, 0), n(2, 0, 24, 1)], 0, 96, 24);
    expect(events).toHaveLength(1);
    expect(events[0].noteIds).toEqual([1, 2]);
  });

  it('adds rests for gaps and the end of the bar', () => {
    const { rests } = layoutBar([n(1, 0, 24), n(2, 48, 24)], 0, 96, 24);
    expect(rests.map(r => [r.start, r.value.ticks])).toEqual([[24, 24], [72, 24]]);
  });

  it('shows an empty bar as a whole rest', () => {
    const { events, rests } = layoutBar([], 96, 96, 24);
    expect(events).toHaveLength(0);
    expect(rests).toEqual([{ start: 96, value: displayValue(96) }]);
  });

  it('clips an event to the next onset', () => {
    const { events } = layoutBar([n(1, 0, 48), n(2, 12, 12)], 0, 96, 24);
    expect(events[0].value.ticks).toBe(12);
  });

  it('only includes notes starting in the bar', () => {
    const { events } = layoutBar([n(1, 0, 12), n(2, 96, 12)], 96, 96, 24);
    expect(events.map(e => e.start)).toEqual([96]);
  });
});

describe('layoutBar rests', () => {
  it('does not add a phantom rest after a note whose length is not a standard value', () => {
    const { rests } = layoutBar([n(1, 0, 30), n(2, 30, 66)], 0, 96, 24);
    expect(rests).toEqual([]);
  });

  it('splits a trailing gap into aligned plain rests', () => {
    const { rests } = layoutBar([n(1, 0, 12)], 0, 96, 24);
    expect(rests.map(r => [r.start, r.value.ticks])).toEqual([[12, 12], [24, 24], [48, 48]]);
  });

  it('shows an empty 3/4 bar as one whole rest', () => {
    const { rests } = layoutBar([], 0, 72, 24);
    expect(rests).toHaveLength(1);
    expect(rests[0].start).toBe(0);
    expect(rests[0].value.ticks).toBe(96);
  });
});
