let ctx: AudioContext | null = null;
let master: AudioNode | null = null;
const cache = new Map<number, AudioBuffer>();

export function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor(); // keeps chords/overlaps from clipping
    comp.connect(ctx.destination);
    master = comp;
  }
  return ctx;
}

function out(): AudioNode {
  getCtx();
  return master!;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Karplus-Strong: a noise burst circulating through an averaging delay line.
function pluckBuffer(c: BaseAudioContext, midi: number): AudioBuffer {
  const sr = c.sampleRate;
  const freq = midiToFreq(midi);
  const period = Math.max(2, Math.round(sr / freq));
  const len = Math.floor(sr * 3);
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  const ring = new Float32Array(period);
  let lp = 0;
  for (let i = 0; i < period; i++) {
    lp += 0.6 * (Math.random() * 2 - 1 - lp); // softened pick attack
    ring[i] = lp;
  }
  const decay = Math.pow(0.5, 1 / (freq * 1.2)); // ~1.2 s half-life, independent of pitch
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const next = idx + 1 === period ? 0 : idx + 1;
    const v = ring[idx];
    data[i] = v;
    ring[idx] = decay * 0.5 * (v + ring[next]);
    idx = next;
  }
  return buf;
}

export function playPluck(c: AudioContext, midi: number, when: number, dur: number): AudioScheduledSourceNode {
  let buf = cache.get(midi);
  if (!buf) {
    buf = pluckBuffer(c, midi);
    cache.set(midi, buf);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  const ring = Math.min(Math.max(dur, 0.05), buf.duration - 0.1);
  g.gain.setValueAtTime(0.5, when);
  g.gain.setValueAtTime(0.5, when + ring);
  g.gain.linearRampToValueAtTime(0, when + ring + 0.06); // string mute
  src.connect(g).connect(out());
  src.start(when);
  src.stop(when + ring + 0.08);
  return src;
}

export function playClick(c: AudioContext, when: number, accent: boolean): AudioScheduledSourceNode {
  const osc = c.createOscillator();
  osc.frequency.value = accent ? 1600 : 1000;
  const g = c.createGain();
  g.gain.setValueAtTime(0.3, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  osc.connect(g).connect(out());
  osc.start(when);
  osc.stop(when + 0.06);
  return osc;
}
