import { describe, expect, it } from 'vitest';
import { addTab, byRecent, findTab, readLibrary, removeTab, timeAgo, updateTab } from './library';

describe('My tabs library', () => {
  const base = () => {
    let { lib } = addTab([], { title: 'Song A', payload: 'AAA', practice: '' }, 1000, 'a');
    ({ lib } = addTab(lib, { title: 'Song B', payload: 'BBB', practice: '&sp=75' }, 2000, 'b'));
    return lib;
  };

  it('adds newest first and finds an entry by its riff', () => {
    const lib = base();
    expect(lib.map(e => e.id)).toEqual(['b', 'a']);
    expect(findTab(lib, 'AAA')?.id).toBe('a');
    expect(findTab(lib, 'ZZZ')).toBeUndefined();
  });

  it('prefers the open entry when two hold the same riff', () => {
    const { lib } = addTab(base(), { title: 'Copy of A', payload: 'AAA', practice: '' }, 3000, 'c');
    expect(findTab(lib, 'AAA', 'a')?.id).toBe('a');
    expect(findTab(lib, 'AAA', 'c')?.id).toBe('c');
  });

  it('edits save into the same entry; unchanged saves leave the time alone', () => {
    let lib = updateTab(base(), 'a', { title: 'Song A', payload: 'AAA2', practice: '&sp=60' }, 5000);
    expect(lib.find(e => e.id === 'a')).toMatchObject({ payload: 'AAA2', practice: '&sp=60', updated: 5000, created: 1000 });
    lib = updateTab(lib, 'a', { title: 'Song A', payload: 'AAA2', practice: '&sp=60' }, 9000);
    expect(lib.find(e => e.id === 'a')?.updated).toBe(5000);
    expect(byRecent(lib).map(e => e.id)).toEqual(['a', 'b']);
  });

  it('removes entries and reads saved data defensively', () => {
    expect(removeTab(base(), 'a').map(e => e.id)).toEqual(['b']);
    expect(readLibrary('nope')).toEqual([]);
    expect(readLibrary([{ id: 'x', payload: 'P' }, { id: 1 }, { payload: '' }, null])).toEqual([
      { id: 'x', title: '', payload: 'P', practice: '', created: 0, updated: 0 },
    ]);
  });

  it('says when an entry was last touched', () => {
    expect(timeAgo(0, 30_000)).toBe('just now');
    expect(timeAgo(0, 5 * 60_000)).toBe('5 min ago');
    expect(timeAgo(0, 3 * 3_600_000)).toBe('3 h ago');
    expect(timeAgo(0, 86_400_000)).toBe('yesterday');
  });
});
