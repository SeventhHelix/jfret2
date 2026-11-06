import { describe, expect, it } from 'vitest';
import * as at from '@coderline/alphatab';
import { readScoreFile } from './gpRead';
import { extractSection, sections } from './gpScore';

// Build a real .gp (GP7) file with alphaTab itself, then read it back the way the app does.
const TEX = String.raw`\title "Test Song" \artist "Band" \tempo 120
\track "Lead"
\section "Intro" 0.6.4 3.6.4 5.5.4 5.5{b (0 4)}.4 |
\section "Solo" 12.1.8 15.1{h}.8 17.1.8 15.2.8 :16 12.2 14.3 12.3 14.3 r.4 |
\tempo 140 7.3.4 -.3.4 3.3.8 {tu 3} 3.3.8 {tu 3} 3.3.8 {tu 3} 9.2.4 |
\track "Bass" \tuning G2 D2 A1 E1
0.4.1 | 3.4.1 | 5.3.1 |`;

function gpBytes(): Uint8Array {
  const imp = new at.importer.AlphaTexImporter();
  imp.initFromString(TEX, new at.Settings());
  return new at.exporter.Gp7Exporter().export(imp.readScore(), new at.Settings());
}

describe('readScoreFile (GP7 round trip)', async () => {
  const score = await readScoreFile(gpBytes());

  it('reads title, tracks and tunings', () => {
    expect(score.title).toBe('Test Song');
    expect(score.artist).toBe('Band');
    expect(score.tracks.map(t => t.name)).toEqual(['Lead', 'Bass']);
    expect(score.tracks[0].tuning).toEqual([64, 59, 55, 50, 45, 40]);
    expect(score.tracks[1].tuning).toEqual([43, 38, 33, 28]);
  });

  it('reads bars, sections and tempo changes', () => {
    expect(score.bars.map(b => b.start)).toEqual([0, 96, 192]);
    expect(sections(score)).toEqual([{ name: 'Intro', first: 0, last: 0 }, { name: 'Solo', first: 1, last: 2 }]);
    expect(score.bars.map(b => b.tempo)).toEqual([120, 120, 140]);
  });

  it('maps strings top-down and keeps 8ths, 16ths and triplets', () => {
    const solo = extractSection(score, 0, 1, 2);
    const notes = solo.song.notes.map(n => [n.start, n.dur, n.string, n.fret]);
    expect(notes.slice(0, 4)).toEqual([[0, 12, 0, 12], [12, 12, 0, 15], [24, 12, 0, 17], [36, 12, 1, 15]]);
    expect(notes.slice(4, 8).map(n => n[0])).toEqual([48, 54, 60, 66]);
    // bar 3: tied quarter -> one half note, then 3 triplet 8ths, then a quarter
    expect(notes.slice(8)).toEqual([[96, 48, 2, 7], [144, 8, 2, 3], [152, 8, 2, 3], [160, 8, 2, 3], [168, 24, 1, 9]]);
    expect(solo.song.title).toBe('Test Song · Solo');
    expect(solo.warnings.some(w => w.includes('120 → 140'))).toBe(true);
  });

  it('reads techniques: bend amount, hammer-on destination', () => {
    const lead = score.tracks[0].notes;
    expect(lead.filter(n => n.tech?.bend).map(n => n.tech)).toEqual([{ bend: 2 }]); // intro 5.5 full bend
    expect(lead.find(n => n.bar === 1 && n.fret === 17)?.tech).toEqual({ legato: true }); // 15h17
  });

  it('puts the bass on the low 4 strings', () => {
    const r = extractSection(score, 1, 0, 2);
    expect(r.song.tuning).toBe('std');
    expect(r.song.notes.map(n => [n.string, n.fret])).toEqual([[5, 0], [5, 3], [4, 5]]);
  });
});

// Every technique, in alphaTex: bend+release, vibrato, slide, hammer-on, palm mute, natural harmonic, dead note.
const TECH_TEX = String.raw`\title "Tech" \tempo 100
\track "Lead"
7.3{b (0 4 0)}.4 7.3{v}.4 5.2{sl}.8 7.2.8 5.1{h}.8 7.1.8 |
0.6{pm}.8 0.6{pm}.8 12.3{nh}.4 x.4.4 3.4.4 |`;

describe('readScoreFile: techniques', async () => {
  const imp = new at.importer.AlphaTexImporter();
  imp.initFromString(TECH_TEX, new at.Settings());
  const score = await readScoreFile(new at.exporter.Gp7Exporter().export(imp.readScore(), new at.Settings()));

  it('maps every technique', () => {
    const r = extractSection(score, 0, 0, 1);
    expect(r.song.notes.map(n => [n.fret, n.tech])).toEqual([
      [7, { bend: 2, release: true }], [7, { vibrato: true }], [5, { slide: true }], [7, undefined], [5, undefined], [7, { legato: true }],
      [0, { mute: true }], [0, { mute: true }], [12, { harmonic: true }], [0, { dead: true }], [3, undefined],
    ]);
    expect(r.warnings).toEqual([]);
  });
});

describe('readScoreFile: harmonics', async () => {
  // Natural at fret 12; artificial +24 at fret 7; pinch with no value (an octave); semi at fret 6.
  const imp = new at.importer.AlphaTexImporter();
  imp.initFromString(String.raw`\track "L"
12.3{nh}.4 7.3{ah 24}.4 5.2{ph}.4 6.1{sh 12}.4 |`, new at.Settings());
  const score = await readScoreFile(new at.exporter.Gp7Exporter().export(imp.readScore(), new at.Settings()));

  it('natural harmonics stay natural; pinch/artificial ones keep how far above the fret they sound', () => {
    expect(score.tracks[0].notes.map(n => [n.fret, n.tech])).toEqual([
      [12, { harmonic: true }], [7, { pinch: 24 }], [5, { pinch: 12 }], [6, { pinch: 12 }],
    ]);
  });
});
