// The Metronome section's click engine: beats with per-beat accents, an optional subdivision, separate levels.
// Same lookahead scheduling as the Player (25 ms timer, 120 ms horizon), so tempo changes land on the next click.
import { getCtx, playClick } from './synth';

export type BeatKind = 'accent' | 'beat' | 'off';
export type MetroSettings = {
  bpm: number;
  beats: BeatKind[];   // one per beat in the bar
  sub: number;         // clicks per beat: 1 quarters, 2 8ths, 3 triplets, 4 16ths, 6 sextuplets
  levels: { accent: number; beat: number; sub: number }; // 0..1
};

const LOOKAHEAD = 0.12;

export class Metronome {
  private timer: number | undefined;
  private next = 0;   // audio time of the next step
  private step = 0;   // step within the bar (beats × sub)
  private queue: { time: number; beat: number }[] = [];

  constructor(private get: () => MetroSettings, private onBeat: (beat: number) => void) {}

  get running() { return this.timer !== undefined; }

  start() {
    const c = getCtx();
    void c.resume();
    this.stop();
    this.next = c.currentTime + 0.08;
    this.step = 0;
    this.timer = window.setInterval(() => this.tick(), 25);
    this.tick();
  }

  stop() {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.queue = [];
    this.onBeat(-1);
  }

  private tick() {
    const c = getCtx();
    const s = this.get();
    const sub = Math.max(1, s.sub);
    if (this.next < c.currentTime) this.next = c.currentTime + 0.01; // fell behind (background tab): don't burst
    while (this.next < c.currentTime + LOOKAHEAD) {
      const steps = s.beats.length * sub;
      this.step %= steps;
      const beat = Math.floor(this.step / sub), onBeat = this.step % sub === 0;
      const kind = s.beats[beat];
      if (onBeat) {
        if (kind !== 'off') playClick(c, this.next, kind === 'accent', kind === 'accent' ? s.levels.accent : s.levels.beat);
        this.queue.push({ time: this.next, beat });
      } else if (s.levels.sub > 0) {
        playClick(c, this.next, false, s.levels.sub);
      }
      this.next += 60 / s.bpm / sub;
      this.step++;
    }
    // Light the beat when it actually sounds.
    while (this.queue.length && this.queue[0].time <= c.currentTime) this.onBeat(this.queue.shift()!.beat);
  }
}

/** Tap tempo: the average gap of the last few taps (a pause of 2 s starts over). */
export function tapTempo(taps: number[], now: number): { taps: number[]; bpm: number | null } {
  const recent = [...taps.filter(t => now - t < 2000 * (taps.length + 1)), now].slice(-6);
  const kept: number[] = [];
  for (const t of recent) if (!kept.length || t - kept[kept.length - 1] < 2000) kept.push(t); else kept.splice(0, kept.length, t);
  if (kept.length < 2) return { taps: kept, bpm: null };
  const gap = (kept[kept.length - 1] - kept[0]) / (kept.length - 1);
  return { taps: kept, bpm: Math.round(Math.min(300, Math.max(30, 60000 / gap))) };
}
