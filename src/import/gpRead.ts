// Guitar Pro import, the alphaTab half: read a .gp/.gpx/.gp3-5 file into the plain GpScore types.
// alphaTab is big (~1 MB), so it's only loaded when a file is opened.
import type { GpBar, GpNote, GpScore, GpTrack } from './gpScore';
import type { Tech } from '../model/song';

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
          const tech: Tech = {};
          if (n.hasBend && n.bendPoints?.length) {
            // Bend points are in quarter tones: 4 = a full bend (2 semitones).
            const vals = n.bendPoints.map(p => p.value);
            const peak = Math.max(...vals);
            if (peak > 0) {
              tech.bend = Math.min(4, Math.max(1, Math.round(peak / 2)));
              if (vals[vals.length - 1] < peak - 1) tech.release = true;
            }
          }
          if (n.vibrato !== 0 || beat.vibrato !== 0) tech.vibrato = true;
          if (n.slideOutType !== 0) tech.slide = true; // slide into the next note (or off, when there is none)
          if (n.isHammerPullDestination || n.isLeftHandTapped) tech.legato = true;
          if (n.isPalmMute) tech.mute = true;
          if (n.harmonicType === 1) tech.harmonic = true; // natural
          else if (n.harmonicType !== 0) { // pinch / artificial / tapped / semi: a set interval above the fretted note
            const shift = n.realValue - n.realValueWithoutHarmonic;
            tech.pinch = shift > 0 ? shift : 12;
          }
          if (n.isDead) tech.dead = true;
          notes.push({
            bar: b.index,
            start: (mb.start + beat.playbackStart) / AT_PER_TICK,
            dur: beat.playbackDuration / AT_PER_TICK,
            string: tuning.length - n.string, // alphaTab counts from the lowest string
            fret: n.fret,
            tie: n.isTieDestination,
            tech: Object.keys(tech).length ? tech : undefined,
            grace: beat.graceType !== 0 || undefined,
          });
        }
      }
    }
    tracks.push({ name: tr.name.trim() || `Track ${tracks.length + 1}`, tuning: [...tuning], capo: staff.capo, notes });
  }
  return { title: score.title, artist: score.artist, bars, tracks };
}
