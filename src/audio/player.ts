import { Note, PPQ, Song, barTicks, beatTicks, emptySong, pitchOf, songEndTick } from '../model/song';
import { PlayFx, getCtx, playClick, playPluck } from './synth';
import { harmonicShift } from '../model/tech';

export type LoopRange = { start: number; end: number } | null;

const LOOKAHEAD_SEC = 0.12;
const TIMER_MS = 25;

export class Player {
  speed = 1;
  loop: LoopRange = null;
  metronome = false;
  countIn = false;

  private song: Song = emptySong();
  private byStart = new Map<number, Note[]>();
  private how = new Map<number, { midi: number; fx: PlayFx }>(); // per note id: pitch and techniques
  private timer: number | undefined;
  private raf: number | undefined;
  private tick = 0;
  private time = 0;
  private endAt: number | null = null;
  private timeline: { time: number; tick: number }[] = [];
  private sources: AudioScheduledSourceNode[] = [];

  constructor(private onTick: (tick: number) => void, private onEnd: () => void) {}

  setSong(song: Song) {
    this.song = song;
    this.byStart = new Map();
    for (const n of song.notes) {
      const list = this.byStart.get(n.start);
      if (list) list.push(n);
      else this.byStart.set(n.start, [n]);
    }
    // Work out each note's pitch and techniques once: slides glide to the next note on the string, which then
    // isn't picked again; harmonics sound at their natural interval; a slide with nowhere to go falls off.
    this.how = new Map();
    const strings = new Map<number, Note[]>();
    for (const n of song.notes) strings.set(n.string, [...(strings.get(n.string) ?? []), n]);
    for (const list of strings.values()) {
      list.sort((a, b) => a.start - b.start);
      list.forEach((n, i) => {
        const t = n.tech ?? {};
        // Natural harmonics sound at the node's interval above the open string; pinch harmonics a set interval above the fret.
        const pitch = (m: Note) => pitchOf(song, m) + (m.tech?.harmonic ? harmonicShift(m.fret) - m.fret : m.tech?.pinch ?? 0);
        const next = list[i + 1], prev = list[i - 1];
        this.how.set(n.id, {
          midi: pitch(n),
          fx: {
            bend: t.bend, release: t.release, vibrato: t.vibrato, mute: t.mute, harmonic: t.harmonic || !!t.pinch, dead: t.dead,
            legato: t.legato || !!prev?.tech?.slide,
            slideTo: t.slide ? (next ? pitch(next) - pitch(n) : -5) : undefined,
          },
        });
      });
    }
  }

  preview(midi: number) {
    const ctx = getCtx();
    void ctx.resume();
    playPluck(ctx, midi, ctx.currentTime, 0.9);
  }

  play(fromTick: number, countIn = this.countIn) {
    this.pause();
    const ctx = getCtx();
    void ctx.resume();
    this.tick = fromTick;
    this.time = ctx.currentTime + 0.06;
    this.endAt = null;
    this.timeline = [];
    if (countIn) {
      const beat = beatTicks(this.song.timeSig);
      const beats = barTicks(this.song.timeSig) / beat;
      const beatSec = beat * this.secPerTick();
      for (let i = 0; i < beats; i++) this.track(playClick(ctx, this.time + i * beatSec, i === 0));
      this.time += beats * beatSec;
    }
    this.schedule();
    // report() also runs here so end-of-song and the playhead still update when rAF is paused (background tab).
    this.timer = window.setInterval(() => { this.schedule(); this.report(); }, TIMER_MS);
    const frame = () => {
      this.report();
      if (this.timer !== undefined) this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  pause() {
    this.stopTimers();
    for (const s of this.sources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.sources = [];
  }

  private stopTimers() {
    if (this.timer !== undefined) clearInterval(this.timer);
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    this.timer = undefined;
    this.raf = undefined;
  }

  private secPerTick(): number {
    return 60 / (this.song.bpm * this.speed) / PPQ;
  }

  private schedule() {
    const ctx = getCtx();
    if (this.time < ctx.currentTime) this.time = ctx.currentTime + 0.01; // drop late notes instead of bursting them
    const horizon = ctx.currentTime + LOOKAHEAD_SEC;
    const end = songEndTick(this.song);
    const bar = barTicks(this.song.timeSig);
    const beat = beatTicks(this.song.timeSig);
    while (this.endAt === null && this.time < horizon) {
      const loop = this.loop && this.loop.end > this.loop.start ? this.loop : null;
      if (loop && this.tick >= loop.end) this.tick = loop.start;
      if (!loop && this.tick >= end) {
        this.endAt = this.time;
        break;
      }
      const spt = this.secPerTick();
      this.timeline.push({ time: this.time, tick: this.tick });
      for (const n of this.byStart.get(this.tick) ?? []) {
        const h = this.how.get(n.id);
        this.track(playPluck(ctx, h ? h.midi : pitchOf(this.song, n), this.time, n.dur * spt, h?.fx));
      }
      if (this.metronome && this.tick % beat === 0) this.track(playClick(ctx, this.time, this.tick % bar === 0));
      this.tick++;
      this.time += spt;
    }
  }

  private report() {
    const now = getCtx().currentTime;
    let latest: number | null = null;
    while (this.timeline.length && this.timeline[0].time <= now) latest = this.timeline.shift()!.tick;
    if (latest !== null) this.onTick(latest);
    if (this.endAt !== null && now >= this.endAt) {
      this.stopTimers(); // let the last notes ring out through their scheduled fades
      this.sources = [];
      this.onTick(Math.max(0, songEndTick(this.song) - 1));
      this.onEnd();
    }
  }

  private track(src: AudioScheduledSourceNode) {
    this.sources.push(src);
    if (this.sources.length > 512) this.sources.splice(0, 256);
  }
}
