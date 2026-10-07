import { describe, expect, it } from 'vitest';
import { FlowGrouping, FlowPt, groupLinks } from './flow';

const OPEN = [64, 59, 55]; // e B G
const S: Record<string, number> = { e: 0, B: 1, G: 2 };
/** "G9 B8 e7" at a fixed spacing -> points */
const pts = (tab: string, step: number, from = 0): FlowPt[] =>
  tab.split(' ').map((n, i) => {
    const string = S[n[0]], fret = Number(n.slice(1));
    return { start: from + i * step, string, pitch: OPEN[string] + fret };
  });
/** Render groups as "a b | c d" for readable assertions. */
const groups = (tab: string, step: number, mode: FlowGrouping) => {
  const names = tab.split(' ');
  const links = groupLinks(pts(tab, step), mode, 96);
  return names.map((n, i) => (i > 0 && links[i - 1] ? `| ${n}` : n)).join(' ');
};

// Bar 1 of the sweep solo, 8th-note triplets.
const BAR1 = 'G9 B8 e7 e12 e19 e12 e7 B8 B12 B10 B13 B10';

describe('groupLinks', () => {
  it('none: one unbroken line', () => {
    expect(groups(BAR1, 8, 'none')).toBe(BAR1);
  });

  it('beat: triplets in 3s on the beat', () => {
    expect(groups(BAR1, 8, 'beat')).toBe('G9 B8 e7 | e12 e19 e12 | e7 B8 B12 | B10 B13 B10');
  });

  it('beat: 8ths in 4s, quarters in 2s, 16ths in 6s from the bar start', () => {
    expect(groups('e1 e2 e3 e4 e5 e6 e7 e8', 12, 'beat')).toBe('e1 e2 e3 e4 | e5 e6 e7 e8');
    expect(groups('e1 e2 e3 e4', 24, 'beat')).toBe('e1 e2 | e3 e4');
    expect(groups('e1 e2 e3 e4 e5 e6 e7 e8 e9 e10 e11 e12 e13 e14 e15 e16', 6, 'beat'))
      .toBe('e1 e2 e3 e4 e5 e6 | e7 e8 e9 e10 e11 e12 | e13 e14 e15 e16');
  });

  it('beat: a new bar starts a new group', () => {
    const p = pts('e1 e2 e3', 12, 72); // 72, 84, 96
    expect(groupLinks(p, 'beat', 96)).toEqual([false, true]);
  });

  it('strings: a 3-notes-per-string run splits per string', () => {
    expect(groups('G10 G12 G14 B10 B12 B13 e10 e12 e14', 8, 'strings')).toBe('G10 G12 G14 | B10 B12 B13 | e10 e12 e14');
  });

  it('strings: a sweep stays together until it settles on a string and leaves it', () => {
    expect(groups(BAR1, 8, 'strings')).toBe('G9 B8 e7 e12 e19 e12 e7 | B8 B12 B10 B13 B10');
  });

  it('contour: breaks at the peak and the low point, not at short wiggles', () => {
    expect(groups(BAR1, 8, 'contour')).toBe('G9 B8 e7 e12 e19 | e12 e7 B8 | B12 B10 B13 B10');
  });

  it('arc: an up-and-back sweep is one group', () => {
    expect(groups(BAR1, 8, 'arc')).toBe('G9 B8 e7 e12 e19 e12 e7 B8 | B12 B10 B13 B10');
  });

  it('contour: repeated pitches do not count as a turn', () => {
    expect(groups('e1 e3 e5 e5 e7 e5 e3', 8, 'contour')).toBe('e1 e3 e5 e5 e7 | e5 e3');
  });
});
