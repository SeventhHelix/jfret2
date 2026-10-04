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

const varint = (n: number): number[] => {
  const o: number[] = [];
  while (n >= 0x80) { o.push((n % 0x80) | 0x80); n = Math.floor(n / 0x80); }
  o.push(n);
  return o;
};
const header = (titleLen: number, count: number, extra: number[] = []) =>
  [1, 100, 4, 4, 0, ...varint(titleLen), ...extra, ...varint(count)];

describe('codec hardening', () => {
  it('rejects notes that end beyond MAX_TICKS', () => {
    const bytes = [...header(0, 1), 0, ...varint(10_000_000), 0];
    expect(() => decodeSong(toBase64Url(Uint8Array.from(bytes)))).toThrow(/bad note/);
  });

  it('rejects titles longer than 60 bytes', () => {
    const bytes = header(61, 0, new Array(61).fill(65));
    expect(() => decodeSong(toBase64Url(Uint8Array.from(bytes)))).toThrow();
  });

  it('returns notes sorted even if the payload has string order within an onset reversed', () => {
    // two notes at the same onset, string 3 then string 1
    const bytes = [...header(0, 2), 0, 12, 3 << 5, 0, 12, 1 << 5];
    const d = decodeSong(toBase64Url(Uint8Array.from(bytes)));
    expect(d.notes.map(n => n.string)).toEqual([1, 3]);
  });
});
