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
    expect(solo.warnings.some(w => w.includes('hammer-ons'))).toBe(true);
  });

  it('flags bends', () => {
    expect(score.tracks[0].notes.filter(n => n.fx.includes('bend'))).toHaveLength(1);
  });

  it('puts the bass on the low 4 strings', () => {
    const r = extractSection(score, 1, 0, 2);
    expect(r.song.tuning).toBe('std');
    expect(r.song.notes.map(n => [n.string, n.fret])).toEqual([[5, 0], [5, 3], [4, 5]]);
  });
});
