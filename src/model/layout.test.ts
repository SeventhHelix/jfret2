import { describe, expect, it } from 'vitest';
import { defaultLayout, fretWidth, movePanel, readLayout } from './layout';

describe('layout', () => {
  it('phones default to tab + fretboard following the bar; desktop shows everything', () => {
    expect(defaultLayout(true).panels.filter(p => p.on).map(p => p.id)).toEqual(['tab', 'fretboard']);
    expect(defaultLayout(true).fbNeck).toBe('bar');
    expect(defaultLayout(false).panels.every(p => p.on)).toBe(true);
  });

  it('reads saved settings, dropping junk and adding missing panels', () => {
    const l = readLayout({ panels: [{ id: 'fretboard', on: false }, { id: 'bogus' }, { id: 'fretboard' }], tabBars: 2, tabLines: 99, fbNeck: 'sideways' }, false);
    expect(l.panels).toEqual([{ id: 'fretboard', on: false }, { id: 'tab', on: true }, { id: 'editor', on: true }]);
    expect(l.tabBars).toBe(2);
    expect(l.tabLines).toBe(3);
    expect(l.fbNeck).toBe('scroll');
  });

  it('the old single Size carries over to both panels and full width', () => {
    const l = readLayout({ zoom: 1.75 }, false);
    expect([l.tabZoom, l.fbZoom, l.fullWidth]).toEqual([1.75, 1.75, true]);
    expect(readLayout({}, false).fullWidth).toBe(false);
  });

  it('phones on an older saved layout start over with the phone defaults; desktops keep theirs', () => {
    expect(readLayout({ tabZoom: 1.5, fbZoom: 1 }, true)).toEqual(defaultLayout(true));
    expect(readLayout({ v: 2, tabZoom: 1.5 }, true).tabZoom).toBe(1.5);
    expect(readLayout({ tabZoom: 1.5 }, false).tabZoom).toBe(1.5);
  });

  it('moves panels up and down, not past the ends', () => {
    const l = defaultLayout(false);
    expect(movePanel(l, 'editor', -1).panels.map(p => p.id)).toEqual(['tab', 'editor', 'fretboard']);
    expect(movePanel(l, 'tab', -1)).toBe(l);
  });

  it('fret width per neck mode', () => {
    expect(fretWidth('scroll', 1000, 5, 9, 52, 24)).toBe(64);
    expect(fretWidth('neck', 52 + 24 * 50, 5, 9, 52, 24)).toBe(50);
    expect(fretWidth('bar', 600, 12, 15, 52, 24)).toBe(100);   // frets 12-15 + a fret either side = 6 frets in 600px
    expect(fretWidth('bar', 700, 12, 12, 52, 24)).toBe(140);   // never fewer than 5 frets' worth
    expect(fretWidth('bar', 380, 0, 3, 52, 24)).toBe(65.6);    // open strings need the open column too
    expect(fretWidth('bar', 700, -1, -1, 52, 24)).toBe(64);    // nothing in focus
  });
});
