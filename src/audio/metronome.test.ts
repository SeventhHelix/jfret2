import { describe, expect, it } from 'vitest';
import { tapTempo } from './metronome';

describe('tap tempo', () => {
  it('averages the gaps between taps', () => {
    let taps: number[] = [];
    let bpm: number | null = null;
    for (const t of [0, 500, 1000, 1500]) ({ taps, bpm } = tapTempo(taps, t));
    expect(bpm).toBe(120);
  });
  it('a long pause starts over', () => {
    let { taps } = tapTempo([], 0);
    ({ taps } = tapTempo(taps, 500));
    const r = tapTempo(taps, 9000);
    expect(r.bpm).toBe(null);
    expect(r.taps).toEqual([9000]);
  });
});
