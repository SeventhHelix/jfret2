import { describe, it, expect } from 'vitest';
import { encodeSong, decodeSong, toBase64Url, fromBase64Url } from './codec';
import { Note, Song, emptySong } from '../model/song';

const strip = (s: Song) => ({ ...s, notes: s.notes.map(({ id, ...rest }) => rest) });
const mk = (notes: Omit<Note, 'id'>[], over: Partial<Song> = {}): Song => ({
  ...emptySong(), ...over, notes: notes.map((x, i) => ({ ...x, id: i + 1 })),
});

describe('codec', () => {
  it('round-trips a riff with header fields', () => {
    const s = mk(
      [{ start: 0, dur: 12, string: 0, fret: 5 }, { start: 12, dur: 12, string: 0, fret: 7 }, { start: 24, dur: 24, string: 1, fret: 8 }],
      { title: 'Lick', bpm: 132, timeSig: [3, 4], tuning: 'dropD' },
    );
    expect(strip(decodeSong(encodeSong(s)))).toEqual(strip(s));
  });

  it('round-trips an empty song', () => {
    const s = emptySong();
    expect(strip(decodeSong(encodeSong(s)))).toEqual(strip(s));
  });

  it('handles max fret, low string and long gaps', () => {
    const s = mk([{ start: 0, dur: 1, string: 5, fret: 24 }, { start: 10000, dur: 500, string: 0, fret: 0 }]);
    expect(strip(decodeSong(encodeSong(s)))).toEqual(strip(s));
  });

  it('sorts notes on encode', () => {
    const s = mk([{ start: 24, dur: 12, string: 0, fret: 1 }, { start: 0, dur: 12, string: 2, fret: 3 }]);
    expect(decodeSong(encodeSong(s)).notes.map(n => n.start)).toEqual([0, 24]);
  });

  it('assigns fresh unique ids', () => {
    const s = mk([{ start: 0, dur: 12, string: 0, fret: 1 }, { start: 12, dur: 12, string: 0, fret: 2 }]);
    const d = decodeSong(encodeSong(s));
    expect(new Set(d.notes.map(n => n.id)).size).toBe(2);
  });

  it('truncates the title to 60 UTF-8 bytes without splitting characters', () => {
    const d = decodeSong(encodeSong(mk([], { title: '🎸'.repeat(30) })));
    expect(d.title).toBe('🎸'.repeat(15));
  });

  it('produces a compact URL-safe payload', () => {
    const notes = Array.from({ length: 300 }, (_, i) => ({ start: i * 12, dur: 12, string: i % 6, fret: i % 20 }));
    const p = encodeSong(mk(notes));
    expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(p.length).toBeLessThan(1500);
  });

  it('rejects garbage, empty and truncated payloads', () => {
    expect(() => decodeSong('!!!')).toThrow();
    expect(() => decodeSong('')).toThrow();
    const p = encodeSong(mk([{ start: 0, dur: 12, string: 0, fret: 5 }]));
    expect(() => decodeSong(p.slice(0, -2))).toThrow();
  });

  it('rejects unknown versions', () => {
    const b = fromBase64Url(encodeSong(emptySong()));
    b[0] = 9;
    expect(() => decodeSong(toBase64Url(b))).toThrow(/version/);
  });
});
