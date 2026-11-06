import { describe, expect, it } from 'vitest';
import { emptySong, Note, Song } from './song';
import { allHave, cleanTech, cycleBend, harmonicShift, nextOnString, prevOnString, setBend, toggleTech } from './tech';

const song = (notes: Omit<Note, 'id'>[]): Song => ({ ...emptySong(), notes: notes.map((n, i) => ({ ...n, id: i + 1 })) });
const techs = (s: Song) => s.notes.map(n => n.tech);

describe('tech', () => {
  it('cleanTech drops empty fields and empty techniques', () => {
    expect(cleanTech({ vibrato: false, bend: 0, release: true })).toBeUndefined();
    expect(cleanTech({ bend: 2, release: true, mute: true })).toEqual({ bend: 2, release: true, mute: true });
  });

  it('toggleTech turns a flag on for all, or off when all have it', () => {
    let s = song([{ start: 0, dur: 12, string: 0, fret: 5, tech: { vibrato: true } }, { start: 12, dur: 12, string: 0, fret: 7 }]);
    s = toggleTech(s, new Set([1, 2]), 'vibrato');
    expect(techs(s)).toEqual([{ vibrato: true }, { vibrato: true }]);
    expect(allHave(s.notes, 'vibrato')).toBe(true);
    s = toggleTech(s, new Set([1, 2]), 'vibrato');
    expect(techs(s)).toEqual([undefined, undefined]);
    expect('tech' in s.notes[0]).toBe(false);
  });

  it('a release brings a full bend with it', () => {
    expect(techs(toggleTech(song([{ start: 0, dur: 12, string: 0, fret: 5 }]), new Set([1]), 'release'))).toEqual([{ bend: 2, release: true }]);
  });

  it('cycleBend goes off -> ½ -> full -> 1½ -> 2 -> off; removing a bend removes its release', () => {
    let s = song([{ start: 0, dur: 12, string: 0, fret: 5 }]);
    const seen: (number | undefined)[] = [];
    for (let i = 0; i < 5; i++) { s = cycleBend(s, new Set([1])); seen.push(s.notes[0].tech?.bend); }
    expect(seen).toEqual([1, 2, 3, 4, undefined]);
    s = setBend(toggleTech(s, new Set([1]), 'release'), new Set([1]), 0);
    expect(s.notes[0].tech).toBeUndefined();
  });

  it('finds neighbours on the same string', () => {
    const s = song([{ start: 0, dur: 12, string: 1, fret: 5 }, { start: 12, dur: 12, string: 0, fret: 7 }, { start: 24, dur: 12, string: 1, fret: 7 }]);
    expect(nextOnString(s.notes, s.notes[0])?.fret).toBe(7);
    expect(prevOnString(s.notes, s.notes[2])?.fret).toBe(5);
    expect(nextOnString(s.notes, s.notes[1])).toBeUndefined();
  });

  it('pinch harmonics: added by hand at +19, one kind of harmonic at a time', () => {
    let s = song([{ start: 0, dur: 12, string: 0, fret: 5, tech: { harmonic: true } }]);
    s = toggleTech(s, new Set([1]), 'pinch');
    expect(s.notes[0].tech).toEqual({ pinch: 19 });
    s = toggleTech(s, new Set([1]), 'harmonic');
    expect(s.notes[0].tech).toEqual({ harmonic: true });
  });

  it('natural harmonics sound at the right interval', () => {
    expect([12, 7, 5, 4, 2].map(harmonicShift)).toEqual([12, 19, 24, 28, 2]);
  });
});
