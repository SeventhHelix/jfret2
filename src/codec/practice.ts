// Practice and sound settings carried in the link next to the riff (#s=<riff>&sp=75&lp=96-192...).
// Readable keys, and only values that differ from the defaults, so plain links stay as they were.
import { CLICK_SOUNDS, ClickSoundId, DEFAULT_SOUND, INSTRUMENTS, InstrumentId } from '../audio/synth';
import { MAX_TICKS } from '../model/song';

export type Practice = {
  speed: number;                               // playback speed, 0.25..1.5
  loop: { start: number; end: number } | null; // loop range in ticks (only when looping is on)
  metronome: boolean;
  countIn: boolean;
  volume: number;                              // guitar volume 0..1
  clickVolume: number;                         // metronome volume 0..1
  instrument: InstrumentId;
  click: ClickSoundId;
};

export const DEFAULT_PRACTICE: Practice = {
  speed: 1, loop: null, metronome: false, countIn: false,
  volume: DEFAULT_SOUND.volume, clickVolume: DEFAULT_SOUND.clickVolume, instrument: DEFAULT_SOUND.instrument, click: DEFAULT_SOUND.click,
};

const pct = (v: number) => Math.round(v * 100);

/** "&sp=75&lp=96-192&m=1..." for the non-default values ('' when everything is default). */
export function formatPractice(p: Practice): string {
  const d = DEFAULT_PRACTICE;
  const out: string[] = [];
  if (pct(p.speed) !== pct(d.speed)) out.push(`sp=${pct(p.speed)}`);
  if (p.loop && p.loop.end > p.loop.start) out.push(`lp=${p.loop.start}-${p.loop.end}`);
  if (p.metronome) out.push('m=1');
  if (p.countIn) out.push('ci=1');
  if (pct(p.volume) !== pct(d.volume) || pct(p.clickVolume) !== pct(d.clickVolume)) out.push(`v=${pct(p.volume)},${pct(p.clickVolume)}`);
  if (p.instrument !== d.instrument) out.push(`i=${p.instrument}`);
  if (p.click !== d.click) out.push(`c=${p.click}`);
  return out.map(x => `&${x}`).join('');
}

/** The settings a link sets, or null when it sets none (then the viewer's own sound settings apply).
 *  Anything malformed is ignored rather than failing the link. */
export function parsePractice(hash: string): Practice | null {
  const params = new Map<string, string>();
  for (const part of hash.replace(/^#/, '').split('&')) {
    const i = part.indexOf('=');
    if (i > 0) params.set(part.slice(0, i), decodeURIComponent(part.slice(i + 1)));
  }
  const keys = ['sp', 'lp', 'm', 'ci', 'v', 'i', 'c'];
  if (!keys.some(k => params.has(k))) return null;
  const p: Practice = { ...DEFAULT_PRACTICE };
  const num = (s: string | undefined) => (s !== undefined && /^\d+$/.test(s) ? Number(s) : null);
  const sp = num(params.get('sp'));
  if (sp !== null && sp >= 25 && sp <= 150) p.speed = sp / 100;
  const lp = params.get('lp')?.match(/^(\d+)-(\d+)$/);
  if (lp) {
    const start = Number(lp[1]), end = Number(lp[2]);
    if (end > start && end <= MAX_TICKS) p.loop = { start, end };
  }
  p.metronome = params.get('m') === '1';
  p.countIn = params.get('ci') === '1';
  const v = params.get('v')?.match(/^(\d+),(\d+)$/);
  if (v) {
    const a = Number(v[1]), b = Number(v[2]);
    if (a <= 100 && b <= 100) { p.volume = a / 100; p.clickVolume = b / 100; }
  }
  const inst = params.get('i');
  if (INSTRUMENTS.some(x => x.id === inst)) p.instrument = inst as InstrumentId;
  const click = params.get('c');
  if (CLICK_SOUNDS.some(x => x.id === click)) p.click = click as ClickSoundId;
  return p;
}

/** Browser tab title: "jFret - <name>", or just "jFret" for an unnamed riff. */
export function pageTitle(name: string): string {
  const t = name.trim();
  return t && t !== 'Untitled riff' ? `jFret - ${t}` : 'jFret';
}
