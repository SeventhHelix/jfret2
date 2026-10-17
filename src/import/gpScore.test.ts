import { describe, expect, it } from 'vitest';
import { GpBar, GpNote, GpScore, GpTrack, barCounts, extractSection, fitTuning, sections } from './gpScore';

const STD = [64, 59, 55, 50, 45, 40];
const bar = (i: number, extra: Partial<GpBar> = {}): GpBar => ({ start: i * 96, num: 4, den: 4, tempo: 120, repeat: false, ...extra });
const note = (bar: number, at: number, string: number, fret: number, extra: Partial<GpNote> = {}): GpNote =>
  ({ bar, start: bar * 96 + at, dur: 12, string, fret, tie: false, fx: [], ...extra });
const track = (notes: GpNote[], extra: Partial<GpTrack> = {}): GpTrack => ({ name: 'Lead', tuning: STD, capo: 0, notes, ...extra });
const score = (tracks: GpTrack[], bars = [bar(0), bar(1), bar(2), bar(3)]): GpScore => ({ title: 'Song', artist: 'Band', bars, tracks });
const strip = (s: { start: number; dur: number; string: number; fret: number }[]) => s.map(({ start, dur, string, fret }) => ({ start, dur, string, fret }));

describe('sections / barCounts', () => {
  it('each marker runs to the next one', () => {
    const sc = score([track([])], [bar(0, { section: 'Intro' }), bar(1), bar(2, { section: 'Solo' }), bar(3)]);
    expect(sections(sc)).toEqual([{ name: 'Intro', first: 0, last: 1 }, { name: 'Solo', first: 2, last: 3 }]);
  });

  it('counts notes per bar, not grace notes', () => {
    const t = track([note(0, 0, 0, 5), note(0, 12, 0, 7), note(2, 0, 1, 5), note(2, 6, 1, 4, { fx: ['grace'] })]);
    expect(barCounts(t, 4)).toEqual([2, 0, 1, 0]);
  });
});

describe('fitTuning', () => {
  it('matches jFret tunings exactly', () => {
    expect(fitTuning(STD)).toEqual({ tuning: 'std', offset: 0, shift: 0, refret: false });
    expect(fitTuning([63, 58, 54, 49, 44, 39]).tuning).toBe('halfDown');
  });

  it('keeps shapes for a lower tuning with the same intervals (Drop C -> Drop D)', () => {
    expect(fitTuning([62, 57, 53, 48, 43, 36])).toEqual({ tuning: 'dropD', offset: 0, shift: -2, refret: false });
  });

  it('puts a 4-string bass on the low 4 strings, an octave down', () => {
    expect(fitTuning([43, 38, 33, 28])).toEqual({ tuning: 'std', offset: 2, shift: -12, refret: false });
  });

  it('uses the top 6 strings of a 7-string', () => {
    expect(fitTuning([64, 59, 55, 50, 45, 40, 35])).toEqual({ tuning: 'std', offset: 0, shift: 0, refret: false });
  });

  it('falls back to placing by pitch for odd tunings', () => {
    expect(fitTuning([64, 60, 55, 50, 45, 40]).refret).toBe(true);
  });
});

describe('extractSection', () => {
  it('shifts the section to start at 0 and takes tempo, time signature, title', () => {
    const sc = score([track([note(0, 0, 0, 1), note(2, 0, 0, 12), note(2, 12, 1, 13), note(3, 0, 0, 15)])],
      [bar(0), bar(1), bar(2, { section: 'Solo', tempo: 140 }), bar(3, { tempo: 140 })]);
    const r = extractSection(sc, 0, 2, 3);
    expect(strip(r.song.notes)).toEqual([
      { start: 0, dur: 12, string: 0, fret: 12 },
      { start: 12, dur: 12, string: 1, fret: 13 },
      { start: 96, dur: 12, string: 0, fret: 15 },
    ]);
    expect(r.song.bpm).toBe(140);
    expect(r.song.timeSig).toEqual([4, 4]);
    expect(r.song.title).toBe('Song · Solo');
    expect(r.warnings).toEqual([]);
  });

  it('names a plain bar range', () => {
    expect(extractSection(score([track([note(1, 0, 0, 1)])]), 0, 1, 2).song.title).toBe('Song · bars 2-3');
  });

  it('clips notes ringing past the section end', () => {
    const r = extractSection(score([track([note(0, 72, 0, 5, { dur: 48 })])]), 0, 0, 0);
    expect(r.song.notes[0].dur).toBe(24);
  });

  it('merges ties into one longer note', () => {
    const r = extractSection(score([track([note(0, 72, 2, 7, { dur: 24 }), note(1, 0, 2, 7, { dur: 24, tie: true })])]), 0, 0, 1);
    expect(strip(r.song.notes)).toEqual([{ start: 72, dur: 48, string: 2, fret: 7 }]);
  });

  it('a tie whose start is outside the section becomes a normal note', () => {
    const r = extractSection(score([track([note(0, 72, 2, 7, { dur: 24 }), note(1, 0, 2, 7, { dur: 24, tie: true })])]), 0, 1, 1);
    expect(strip(r.song.notes)).toEqual([{ start: 0, dur: 24, string: 2, fret: 7 }]);
  });

  it('drops dead and grace notes, counts techniques', () => {
    const t = track([note(0, 0, 0, 5, { fx: ['dead'] }), note(0, 6, 0, 4, { fx: ['grace'] }), note(0, 12, 0, 7, { fx: ['bend', 'vibrato'] }), note(0, 24, 0, 9, { fx: ['bend'] })]);
    const r = extractSection(score([t]), 0, 0, 0);
    expect(r.noteCount).toBe(2);
    expect(r.warnings).toContain('2 dead or grace notes left out.');
    expect(r.warnings).toContain("Played as plain notes (jFret doesn't show techniques yet): 2 bends, 1 vibrato.");
  });

  it('rounds rhythms jFret cannot show and says so', () => {
    const quint = 96 / 4 / 5; // 16th quintuplet = 4.8 ticks
    const t = track([0, 1, 2].map(i => note(0, i * quint, 0, 5 + i, { dur: quint })));
    const r = extractSection(score([t]), 0, 0, 0);
    expect(r.song.notes.map(n => n.start)).toEqual([0, 5, 10]);
    expect(r.warnings.some(w => w.includes('rounded'))).toBe(true);
  });

  it('warns about tempo and time signature changes and repeats', () => {
    const sc = score([track([note(0, 0, 0, 1)])], [bar(0), bar(1, { tempo: 150, num: 3, start: 96, repeat: true })]);
    const w = extractSection(sc, 0, 0, 1).warnings;
    expect(w).toContain('Tempo changes inside the section (120 → 150 bpm); using 120.');
    expect(w.some(x => x.startsWith('Time signature changes inside the section (4/4 → 3/4)'))).toBe(true);
    expect(w.some(x => x.includes('repeat signs'))).toBe(true);
  });

  it('adds the capo to the frets', () => {
    const r = extractSection(score([track([note(0, 0, 1, 3)], { capo: 2 })]), 0, 0, 0);
    expect(r.song.notes[0].fret).toBe(5);
    expect(r.warnings[0]).toMatch(/^Capo 2/);
  });

  it('keeps Drop C shapes on Drop D', () => {
    const r = extractSection(score([track([note(0, 0, 5, 0), note(0, 12, 5, 3)], { tuning: [62, 57, 53, 48, 43, 36] })]), 0, 0, 0);
    expect(r.song.tuning).toBe('dropD');
    expect(r.song.notes.map(n => [n.string, n.fret])).toEqual([[5, 0], [5, 3]]);
    expect(r.warnings[0]).toBe('Tuning: Drop D shapes, 2 semitones lower in the file.');
  });

  it('moves 7th-string notes onto the low E by pitch', () => {
    const r = extractSection(score([track([note(0, 0, 6, 7), note(0, 12, 6, 2)], { tuning: [64, 59, 55, 50, 45, 40, 35] })]), 0, 0, 0);
    expect(r.song.notes.map(n => [n.string, n.fret])).toEqual([[5, 2]]); // B+7 = E2 -> low E open... 35+7=42 -> E string fret 2
    expect(r.warnings).toContain('1 note moved to another string (that string doesn\'t exist here).');
    expect(r.warnings).toContain("1 note couldn't be placed and was left out.");
  });

  it('places notes by pitch for an odd tuning, keeping the sound', () => {
    const odd = [64, 60, 55, 50, 45, 40]; // B string up to C
    const r = extractSection(score([track([note(0, 0, 1, 1)], { tuning: odd })]), 0, 0, 0);
    expect(r.song.tuning).toBe('std');
    expect(r.song.notes.map(n => [n.string, n.fret])).toEqual([[1, 2]]); // C#4 = B string fret 2
  });

  it('one note per string still holds after import', () => {
    const t = track([note(0, 0, 0, 5, { dur: 48 }), note(0, 12, 0, 7)]);
    expect(strip(extractSection(score([t]), 0, 0, 0).song.notes)).toEqual([
      { start: 0, dur: 12, string: 0, fret: 5 },
      { start: 12, dur: 12, string: 0, fret: 7 },
    ]);
  });
});

describe('technique wording', () => {
  it('uses singular for one', () => {
    const r = extractSection(score([track([note(0, 0, 0, 5, { fx: ['bend', 'legato'] })])]), 0, 0, 0);
    expect(r.warnings).toContain("Played as plain notes (jFret doesn't show techniques yet): 1 bend, 1 hammer-on/pull-off.");
  });
});
