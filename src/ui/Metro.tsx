// Metronome: tempo with ±1 / ±5 buttons (and keys) to nudge while you play, tap tempo, beats per bar with
// per-beat accents, a subdivision, and separate volumes for accents, beats and subdivisions.
import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { SectionNav } from './SectionNav';
import { BeatKind, MetroSettings, Metronome, tapTempo } from '../audio/metronome';
import { CLICK_SOUNDS, ClickSoundId, previewClick } from '../audio/synth';
import { keepScreenOn } from '../audio/wakeLock';
import { setSoundOpts, sound } from '../state/store';

const KEY = 'jfret:metro';
const DEFAULT: MetroSettings = { bpm: 100, beats: ['accent', 'beat', 'beat', 'beat'], sub: 1, levels: { accent: 0.9, beat: 0.75, sub: 0.45 } };
function load(): MetroSettings {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!r) return DEFAULT;
    return { ...DEFAULT, ...r, levels: { ...DEFAULT.levels, ...r.levels }, beats: Array.isArray(r.beats) && r.beats.length ? r.beats : DEFAULT.beats };
  } catch { return DEFAULT; }
}
const cfg = signal<MetroSettings>(load());
const set = (p: Partial<MetroSettings>) => {
  cfg.value = { ...cfg.value, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(cfg.value)); } catch { /* ignore */ }
};
const setBpm = (v: number) => set({ bpm: Math.round(Math.min(300, Math.max(30, v))) });

const running = signal(false);
const lit = signal(-1);
const metro = new Metronome(() => cfg.value, b => { lit.value = b; });
function toggle() {
  if (metro.running) { metro.stop(); running.value = false; keepScreenOn(false); }
  else { metro.start(); running.value = true; keepScreenOn(true); }
}
let taps: number[] = [];
function tap() {
  const r = tapTempo(taps, performance.now());
  taps = r.taps;
  if (r.bpm) setBpm(r.bpm);
}

const SUBS: [number, string, string][] = [
  [1, '♩', 'Quarter notes'], [2, '♫', '8th notes'], [3, '3', 'Triplets'], [4, '16', '16th notes'], [6, '6', 'Sextuplets'],
];
const NEXT_KIND: Record<BeatKind, BeatKind> = { accent: 'beat', beat: 'off', off: 'accent' };

function Level({ label, value, onSet }: { label: string; value: number; onSet: (v: number) => void }) {
  return (
    <label class="mt-level">
      <span class="muted">{label}</span>
      <input type="range" min={0} max={100} value={Math.round(value * 100)} onInput={e => onSet(Number(e.currentTarget.value) / 100)} />
      <span class="snd-val">{Math.round(value * 100)}</span>
    </label>
  );
}

export function Metro() {
  useEffect(() => () => { metro.stop(); running.value = false; keepScreenOn(false); }, []); // leaving the section stops it
  useMetroKeys();
  const c = cfg.value;
  const sn = sound.value;
  const [bpmText, setBpmText] = useState(String(c.bpm));
  useEffect(() => setBpmText(String(c.bpm)), [c.bpm]);
  const setBeats = (n: number) => {
    const b = c.beats.slice(0, n);
    while (b.length < n) b.push('beat');
    set({ beats: b });
  };
  return (
    <div class="metro">
      <div class="panel header">
        <div class="row">
          <SectionNav />
          <button class="play" onClick={toggle} title="Start / stop (Space)">{running.value ? '■' : '▶'}<span class="lbl">{running.value ? ' Stop' : ' Start'}</span></button>
          <span class="spacer" />
        </div>
      </div>

      <div class="panel mt-main">
        <div class="mt-tempo">
          <button onClick={() => setBpm(cfg.value.bpm - 5)} title="−5 BPM (←)">−5</button>
          <button onClick={() => setBpm(cfg.value.bpm - 1)} title="−1 BPM (↓)">−1</button>
          <input class="mt-bpm" type="number" min={30} max={300} value={bpmText} aria-label="Tempo (BPM)"
            onInput={e => setBpmText(e.currentTarget.value)}
            onChange={e => { const v = Number(e.currentTarget.value); if (v >= 30 && v <= 300) setBpm(v); else setBpmText(String(c.bpm)); }} />
          <button onClick={() => setBpm(cfg.value.bpm + 1)} title="+1 BPM (↑)">+1</button>
          <button onClick={() => setBpm(cfg.value.bpm + 5)} title="+5 BPM (→)">+5</button>
        </div>
        <div class="mt-tempo-row">
          <span class="muted">BPM</span>
          <input type="range" min={30} max={300} value={c.bpm} onInput={e => setBpm(Number(e.currentTarget.value))} aria-label="Tempo" />
          <button onClick={tap} title="Tap along to set the tempo (T)">Tap</button>
        </div>

        <div class="mt-beats" role="group" aria-label="Beats: click one to change its accent">
          {c.beats.map((k, i) => (
            <button key={i} class={`mt-beat ${k}${lit.value === i ? ' lit' : ''}`} title="Click: accent → normal → silent"
              onClick={() => { const b = [...c.beats]; b[i] = NEXT_KIND[k]; set({ beats: b }); }}>{i + 1}</button>
          ))}
        </div>

        <div class="mt-opts">
          <div class="snd-row"><span class="muted">Beats per bar</span>
            <span class="mt-step">
              <button onClick={() => setBeats(Math.max(1, c.beats.length - 1))} aria-label="Fewer beats">−</button>
              <b>{c.beats.length}</b>
              <button onClick={() => setBeats(Math.min(12, c.beats.length + 1))} aria-label="More beats">+</button>
            </span>
          </div>
          <div class="snd-row"><span class="muted">Pattern</span>
            <span class="seg small" role="group" aria-label="Subdivision">
              {SUBS.map(([n, icon, name]) => <button key={n} class={c.sub === n ? 'on' : ''} title={name} onClick={() => set({ sub: n })}>{icon}</button>)}
            </span>
          </div>
          <Level label="Accent" value={c.levels.accent} onSet={v => set({ levels: { ...c.levels, accent: v } })} />
          <Level label="Beats" value={c.levels.beat} onSet={v => set({ levels: { ...c.levels, beat: v } })} />
          {c.sub > 1 && <Level label="In between" value={c.levels.sub} onSet={v => set({ levels: { ...c.levels, sub: v } })} />}
          <Level label="Overall" value={sn.clickVolume} onSet={v => setSoundOpts({ clickVolume: v })} />
          <div class="snd-row"><span class="muted">Sound</span>
            <select value={sn.click} onChange={e => { setSoundOpts({ click: e.currentTarget.value as ClickSoundId }); previewClick(); e.currentTarget.blur(); }}>
              {CLICK_SOUNDS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <p class="hints"><span><kbd>Space</kbd> start / stop</span><span><kbd>↑</kbd><kbd>↓</kbd> ±1</span><span><kbd>←</kbd><kbd>→</kbd> ±5</span><span><kbd>T</kbd> tap</span><span>Click a beat: accent → normal → silent</span></p>
      </div>
    </div>
  );
}

function useMetroKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : document.body;
      if (t.closest('textarea, select') || (t instanceof HTMLInputElement && !['button', 'checkbox'].includes(t.type)) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) toggle(); return; }
      if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); setBpm(cfg.value.bpm + (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 1)); return; }
      if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); setBpm(cfg.value.bpm + (k === 'ArrowRight' ? 5 : -5)); return; }
      if (k.toLowerCase() === 't') tap();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
