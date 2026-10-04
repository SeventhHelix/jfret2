import { Note, PPQ, Song, barTicks, beatTicks, emptySong, pitchOf, songEndTick } from '../model/song';
import { getCtx, playClick, playPluck } from './synth';

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
    if (this.timer !== undefined) clearInterval(this.timer);
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    this.timer = undefined;
    this.raf = undefined;
    for (const s of this.sources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.sources = [];
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
        this.track(playPluck(ctx, pitchOf(this.song, n), this.time, n.dur * spt));
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
      this.pause();
      this.onTick(Math.max(0, songEndTick(this.song) - 1));
      this.onEnd();
    }
  }

  private track(src: AudioScheduledSourceNode) {
    this.sources.push(src);
    if (this.sources.length > 512) this.sources.splice(0, 256);
  }
}
