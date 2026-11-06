// All sounds are synthesized in the browser (no samples to download).
// Guitar: Karplus-Strong plucks with per-instrument tone; Overdrive goes through a shared drive chain.
// Metronome: a few short percussive sounds. Guitar and metronome have their own volume.

export type InstrumentId = 'clean' | 'acoustic' | 'nylon' | 'overdrive' | 'synth';
export type ClickSoundId = 'beep' | 'woodblock' | 'cowbell' | 'hihat';

export const INSTRUMENTS: { id: InstrumentId; name: string }[] = [
  { id: 'clean', name: 'Clean electric' },
  { id: 'acoustic', name: 'Steel acoustic' },
  { id: 'nylon', name: 'Nylon' },
  { id: 'overdrive', name: 'Overdrive' },
  { id: 'synth', name: 'Synth lead' },
];
export const CLICK_SOUNDS: { id: ClickSoundId; name: string }[] = [
  { id: 'beep', name: 'Beep' },
  { id: 'woodblock', name: 'Woodblock' },
  { id: 'cowbell', name: 'Cowbell' },
  { id: 'hihat', name: 'Hi-hat' },
];

export type SoundSettings = { instrument: InstrumentId; volume: number; click: ClickSoundId; clickVolume: number }; // volumes 0..1
export const DEFAULT_SOUND: SoundSettings = { instrument: 'clean', volume: 0.8, click: 'beep', clickVolume: 0.7 };

let ctx: AudioContext | null = null;
let guitarBus: GainNode | null = null;
let clickBus: GainNode | null = null;
let driveIn: GainNode | null = null;
let sound: SoundSettings = DEFAULT_SOUND;
const cache = new Map<string, AudioBuffer>();
let noise: AudioBuffer | null = null;

/** Perceptual volume: the slider position squared. */
const gainOf = (v: number) => Math.max(0, Math.min(1, v)) ** 2;

export function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor(); // keeps chords/overlaps from clipping
    comp.connect(ctx.destination);
    guitarBus = ctx.createGain();
    guitarBus.connect(comp);
    clickBus = ctx.createGain();
    clickBus.connect(comp);
    // Overdrive: boost -> soft clip -> cabinet-ish low-pass -> guitar bus.
    driveIn = ctx.createGain();
    driveIn.gain.value = 6;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(2.5 * x) / Math.tanh(2.5); }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const cab = ctx.createBiquadFilter();
    cab.type = 'lowpass';
    cab.frequency.value = 3200;
    cab.Q.value = 0.8;
    const trim = ctx.createGain();
    trim.gain.value = 0.35;
    driveIn.connect(shaper).connect(cab).connect(trim).connect(guitarBus);
    applyVolumes();
  }
  return ctx;
}

function applyVolumes() {
  if (!ctx || !guitarBus || !clickBus) return;
  guitarBus.gain.setTargetAtTime(gainOf(sound.volume), ctx.currentTime, 0.01);
  clickBus.gain.setTargetAtTime(gainOf(sound.clickVolume), ctx.currentTime, 0.01);
}

export function setSound(s: SoundSettings) {
  sound = s;
  applyVolumes();
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Tone per instrument: attack brightness (pick noise low-pass, 0..1) and ring half-life in seconds. */
const TONE: Record<Exclude<InstrumentId, 'synth'>, { bright: number; half: number }> = {
  clean: { bright: 0.6, half: 1.2 },
  acoustic: { bright: 0.9, half: 1.7 },
  nylon: { bright: 0.3, half: 0.9 },
  overdrive: { bright: 0.75, half: 2.6 },
};

// Karplus-Strong: a noise burst circulating through an averaging delay line.
function pluckBuffer(c: BaseAudioContext, midi: number, bright: number, half: number): AudioBuffer {
  const sr = c.sampleRate;
  const freq = midiToFreq(midi);
  // Delay line length is period + allpass fractional delay, so pitch stays in tune.
  const P = sr / freq - 0.5;
  const period = Math.max(2, Math.floor(P - 0.1)); // keep frac in [0.1, 1.1) so the allpass stays stable
  const frac = P - period;
  const C = (1 - frac) / (1 + frac);
  const len = Math.floor(sr * Math.min(4, half * 2.5));
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  const ring = new Float32Array(period);
  let lp = 0;
  for (let i = 0; i < period; i++) {
    lp += bright * (Math.random() * 2 - 1 - lp); // softened pick attack
    ring[i] = lp;
  }
  let mean = 0;
  for (let i = 0; i < period; i++) mean += ring[i];
  mean /= period;
  for (let i = 0; i < period; i++) ring[i] -= mean; // remove DC offset
  let peak = 0;
  for (let i = 0; i < period; i++) peak = Math.max(peak, Math.abs(ring[i]));
  const norm = peak > 0 ? 0.9 / peak : 1; // dull attacks are quieter; even them out
  let apPrevX = 0;
  let apPrevY = 0;
  const decay = Math.pow(0.5, 1 / (freq * half)); // half-life independent of pitch
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const next = idx + 1 === period ? 0 : idx + 1;
    const v = ring[idx];
    data[i] = v * norm;
    const avg = 0.5 * (v + ring[next]);
    const y = C * avg + apPrevX - C * apPrevY;
    apPrevX = avg;
    apPrevY = y;
    ring[idx] = decay * y;
    idx = next;
  }
  return buf;
}

/** How a note is played. slideTo = semitones to glide to by the end of the note (slide into the next note).
 *  harmonic: midi is already the harmonic's pitch; it's played on the same instrument, a little softer and ringing longer. */
export type PlayFx = {
  bend?: number; release?: boolean; vibrato?: boolean; slideTo?: number;
  legato?: boolean; mute?: boolean; harmonic?: boolean; dead?: boolean;
};

/** Pitch movement (bend, release, slide, vibrato) on a source's detune, in cents. Returns an LFO to stop, if any. */
function pitchMoves(c: AudioContext, detune: AudioParam, when: number, ring: number, fx: PlayFx): OscillatorNode | null {
  detune.setValueAtTime(0, when);
  if (fx.bend) {
    const up = Math.min(0.14, ring * 0.4);
    detune.linearRampToValueAtTime(fx.bend * 100, when + up);
    if (fx.release) {
      const back = Math.max(when + up, when + ring * 0.6);
      detune.setValueAtTime(fx.bend * 100, back);
      detune.linearRampToValueAtTime(0, Math.max(back + 0.02, when + ring * 0.92));
    }
  } else if (fx.slideTo) {
    detune.setValueAtTime(0, when + ring * 0.45);
    detune.linearRampToValueAtTime(fx.slideTo * 100, when + ring);
  }
  if (!fx.vibrato) return null;
  const lfo = c.createOscillator();
  lfo.frequency.value = 5.5;
  const depth = c.createGain();
  depth.gain.setValueAtTime(0, when);
  depth.gain.linearRampToValueAtTime(35, when + Math.min(0.15, ring * 0.5)); // eases in, like a real vibrato
  lfo.connect(depth).connect(detune);
  lfo.start(when);
  lfo.stop(when + ring + 0.1);
  return lfo;
}

/** One guitar note. Returns the node to stop if playback is interrupted. */
export function playPluck(c: AudioContext, midi: number, when: number, dur: number, fx: PlayFx = {}): AudioScheduledSourceNode {
  getCtx();
  const inst = sound.instrument;
  if (inst === 'synth') return playSynth(c, midi, when, dur, fx);
  const key = `${inst}:${midi}`;
  let buf = cache.get(key);
  if (!buf) {
    buf = pluckBuffer(c, midi, TONE[inst].bright, TONE[inst].half);
    cache.set(key, buf);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  let ring = Math.min(Math.max(dur, 0.05), buf.duration - 0.1);
  if (fx.dead) ring = 0.03;
  if (fx.harmonic) ring = Math.min(Math.max(ring, 0.8), buf.duration - 0.1);
  let level = { clean: 0.5, acoustic: 0.42, nylon: 0.5, overdrive: 0.35 }[inst]; // every pluck starts at the same peak; brighter tones sound louder
  if (fx.legato) level *= 0.65; // hammer-on / pull-off: no pick attack
  if (fx.harmonic) level *= 0.8;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(level, when + (fx.legato ? 0.008 : 0.002));
  if (fx.mute) g.gain.setTargetAtTime(level * 0.15, when + 0.01, 0.07); // palm mute dies fast
  g.gain.setValueAtTime(fx.mute ? level * 0.15 : level, when + ring);
  g.gain.linearRampToValueAtTime(0, when + ring + 0.06); // string mute
  const lfo = fx.dead ? null : pitchMoves(c, src.detune, when, ring, fx);
  let chain: AudioNode = src;
  if (fx.mute || fx.dead) { // dull the tone
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = fx.dead ? 1400 : 900;
    chain = chain.connect(lp);
  }
  chain.connect(g).connect(inst === 'overdrive' ? driveIn! : guitarBus!);
  src.start(when);
  src.stop(when + ring + 0.08);
  if (lfo) src.addEventListener('ended', () => { try { lfo.stop(); } catch { /* done */ } });
  return src;
}

function playSynth(c: AudioContext, midi: number, when: number, dur: number, fx: PlayFx): AudioScheduledSourceNode {
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = midiToFreq(midi);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 4;
  f.frequency.setValueAtTime(400, when);
  f.frequency.linearRampToValueAtTime(fx.mute || fx.dead ? 900 : 2600, when + 0.03);
  f.frequency.exponentialRampToValueAtTime(fx.mute || fx.dead ? 400 : 900, when + 0.4);
  const g = c.createGain();
  const len = fx.dead ? 0.04 : fx.mute ? Math.min(Math.max(dur, 0.06), 0.15) : Math.max(dur, 0.06);
  const peak = fx.legato ? 0.15 : 0.22;
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(peak, when + 0.01);
  g.gain.setTargetAtTime(0.15, when + 0.01, 0.15);
  g.gain.setValueAtTime(0.15, when + len);
  g.gain.linearRampToValueAtTime(0, when + len + 0.05);
  const lfo = fx.dead ? null : pitchMoves(c, osc.detune, when, len, fx);
  osc.connect(f).connect(g).connect(guitarBus!);
  osc.start(when);
  osc.stop(when + len + 0.07);
  if (lfo) osc.addEventListener('ended', () => { try { lfo.stop(); } catch { /* done */ } });
  return osc;
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noise) {
    noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.2), c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

/** One metronome click; accent = first beat of the bar. */
export function playClick(c: AudioContext, when: number, accent: boolean): AudioScheduledSourceNode {
  getCtx();
  const g = c.createGain();
  g.connect(clickBus!);
  switch (sound.click) {
    case 'woodblock': {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(accent ? 1250 : 880, when);
      osc.frequency.exponentialRampToValueAtTime(accent ? 1000 : 700, when + 0.04);
      g.gain.setValueAtTime(0.6, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.07);
      osc.connect(g);
      osc.start(when);
      osc.stop(when + 0.08);
      return osc;
    }
    case 'cowbell': {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = accent ? 900 : 700;
      bp.Q.value = 3;
      bp.connect(g);
      const a = c.createOscillator(), b = c.createOscillator();
      a.type = b.type = 'square';
      a.frequency.value = accent ? 680 : 540;
      b.frequency.value = accent ? 1010 : 800;
      a.connect(bp); b.connect(bp);
      g.gain.setValueAtTime(0.5, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.25);
      a.start(when); b.start(when);
      a.stop(when + 0.26); b.stop(when + 0.26);
      return a;
    }
    case 'hihat': {
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c);
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      src.connect(hp).connect(g);
      const len = accent ? 0.09 : 0.05;
      g.gain.setValueAtTime(accent ? 0.55 : 0.36, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + len);
      src.start(when);
      src.stop(when + len + 0.01);
      return src;
    }
    default: {
      const osc = c.createOscillator();
      osc.frequency.value = accent ? 1600 : 1000;
      g.gain.setValueAtTime(0.55, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
      osc.connect(g);
      osc.start(when);
      osc.stop(when + 0.06);
      return osc;
    }
  }
}

/** Hear the current metronome sound (from a settings change, so the context may need resuming). */
export function previewClick() {
  const c = getCtx();
  void c.resume();
  playClick(c, c.currentTime + 0.02, true);
}
