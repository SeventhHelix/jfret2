// Guitar Pro import, the alphaTab half: read a .gp/.gpx/.gp3-5 file into the plain GpScore types.
// alphaTab is big (~1 MB), so it's only loaded when a file is opened.
import type { Fx, GpBar, GpNote, GpScore, GpTrack } from './gpScore';

const AT_PER_TICK = 960 / 24; // alphaTab ticks per jFret tick

export async function readScoreFile(bytes: Uint8Array): Promise<GpScore> {
  const at = await import('@coderline/alphatab');
  const score = at.importer.ScoreLoader.loadScoreFromBytes(bytes);

  let tempo = score.tempo;
  const bars: GpBar[] = score.masterBars.map(mb => {
    const autos = [...mb.tempoAutomations].sort((a, b) => a.ratioPosition - b.ratioPosition);
    const atStart = autos.find(a => a.ratioPosition === 0);
    const barTempo = atStart ? atStart.value : tempo;
    if (autos.length) tempo = autos[autos.length - 1].value; // a mid-bar change applies from the next bar on
    const sec = mb.section;
    return {
      start: mb.start / AT_PER_TICK,
      num: mb.timeSignatureNumerator,
      den: mb.timeSignatureDenominator,
      tempo: barTempo,
      section: sec ? (sec.text || sec.marker || '') : undefined,
      repeat: mb.isRepeatStart || mb.repeatCount > 0,
    };
  });

  const tracks: GpTrack[] = [];
  for (const tr of score.tracks) {
    const staff = tr.staves[0];
    if (!staff || staff.isPercussion || staff.tuning.length === 0) continue; // drums, piano, vocals...
    const tuning = staff.tuning;
    const notes: GpNote[] = [];
    for (const b of staff.bars) {
      const mb = score.masterBars[b.index];
      if (!mb) continue;
      for (const v of b.voices) for (const beat of v.beats) {
        if (beat.isRest) continue;
        for (const n of beat.notes) {
          if (n.string < 1 || n.string > tuning.length || n.fret < 0) continue;
          const fx: Fx[] = [];
          if (n.isDead) fx.push('dead');
          if (beat.graceType !== 0) fx.push('grace');
          if (n.hasBend) fx.push('bend');
          if (n.slideInType !== 0 || n.slideOutType !== 0) fx.push('slide');
          if (n.isHammerPullOrigin || n.isHammerPullDestination || n.isLeftHandTapped) fx.push('legato');
          if (n.vibrato !== 0 || beat.vibrato !== 0) fx.push('vibrato');
          if (n.harmonicType !== 0) fx.push('harmonic');
          if (n.isPalmMute) fx.push('mute');
          notes.push({
            bar: b.index,
            start: (mb.start + beat.playbackStart) / AT_PER_TICK,
            dur: beat.playbackDuration / AT_PER_TICK,
            string: tuning.length - n.string, // alphaTab counts from the lowest string
            fret: n.fret,
            tie: n.isTieDestination,
            fx,
          });
        }
      }
    }
    tracks.push({ name: tr.name.trim() || `Track ${tracks.length + 1}`, tuning: [...tuning], capo: staff.capo, notes });
  }
  return { title: score.title, artist: score.artist, bars, tracks };
}
