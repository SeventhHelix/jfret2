// Speed: technique patterns (or part of your riff) wrapped in a speed drill (bursts, chunks, rhythm variations),
// with an optional tempo ladder and a log of your clean tempos. Its own player, so Play's riff is untouched.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Neck, NeckMark } from './Neck';
import { SectionNav } from './SectionNav';
import { GAP, HEAD, PAD, STAFF_H, drawBar } from './tabDraw';
import { Player } from '../audio/player';
import { keepScreenOn } from '../audio/wakeLock';
import { PITCH_NAMES, SCALE_NAMES, ScaleId } from '../model/theory';
import { PPQ, Song, TUNINGS } from '../model/song';
import { posKey } from '../learn/fretmap';
import { DIR_NAMES, PATTERNS, PatternCfg, SEQ_NAMES, generate } from '../speed/patterns';
import {
  DEFAULT_DRILL, DEFAULT_LADDER, DRILL_INFO, DrillCfg, Ladder, Phrase, SUBDIVISIONS, buildCycle, cycleTicks, ladderNext, notesPerSec,
  phraseOf, toSong,
} from '../speed/drill';
import { fretHue } from './colors';
import { isPhone, loop, loopOn, openInPlay, selection, song } from '../state/store';

// ---- settings (saved in this browser) ----
type Cfg = {
  source: 'pattern' | 'riff';
  pattern: PatternCfg;
  sub: number;
  drill: DrillCfg;
  bpm: number;
  ladder: Ladder;
  click: boolean;
};
const DEFAULT_CFG: Cfg = {
  source: 'pattern',
  pattern: { id: 'scale', key: 9, scale: 'minor', quality: 'min', seq: 'straight', dir: 'updown', pos: 5 },
  sub: 12, drill: DEFAULT_DRILL, bpm: 90, ladder: DEFAULT_LADDER, click: true,
};
const CFG_KEY = 'jfret:speed';
const LOG_KEY = 'jfret:speed-log';
const read = (k: string) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
function loadCfg(): Cfg {
  const r = read(CFG_KEY) ?? {};
  return { ...DEFAULT_CFG, ...r, pattern: { ...DEFAULT_CFG.pattern, ...r.pattern }, drill: { ...DEFAULT_DRILL, ...r.drill }, ladder: { ...DEFAULT_LADDER, ...r.ladder } };
}
const cfg = signal<Cfg>(loadCfg());
const setCfg = (p: Partial<Cfg>) => { cfg.value = { ...cfg.value, ...p }; write(CFG_KEY, cfg.value); };
const setPattern = (p: Partial<PatternCfg>) => setCfg({ pattern: { ...cfg.value.pattern, ...p } });
const setDrill = (p: Partial<DrillCfg>) => setCfg({ drill: { ...cfg.value.drill, ...p } });
const setLadder = (p: Partial<Ladder>) => setCfg({ ladder: { ...cfg.value.ladder, ...p } });

type LogEntry = { best: number; last: number; at: number };
const log = signal<Record<string, LogEntry>>(read(LOG_KEY) ?? {});

// ---- playback ----
const playing = signal(false);
const tick = signal(0);
const liveBpm = signal(cfg.value.bpm); // the ladder changes this while playing
const cycles = signal(0);
let lastTick = 0;
let cycleRef: { ph: Phrase; title: string; tuning: Song['tuning'] } | null = null;

const player = new Player(t => {
  if (t < lastTick && playing.value) onCycle(); // the loop wrapped: one cycle done
  lastTick = t;
  tick.value = t;
}, () => { playing.value = false; });

function onCycle() {
  cycles.value++;
  const next = ladderNext(cfg.value.ladder, liveBpm.value, cycles.value);
  if (next !== liveBpm.value && cycleRef) {
    liveBpm.value = next;
    player.setSong({ ...toSong(cycleRef.ph, next, cycleRef.title), tuning: cycleRef.tuning }); // tempo changes on the fly
  }
}

/** Tempo ±: also live while playing (the ladder carries on from the new tempo). */
function bumpBpm(d: number) {
  const base = playing.value ? liveBpm.value : cfg.value.bpm;
  const v = Math.min(300, Math.max(30, base + d));
  setCfg({ bpm: v });
  if (playing.value && cycleRef) {
    liveBpm.value = v;
    player.setSong({ ...toSong(cycleRef.ph, v, cycleRef.title), tuning: cycleRef.tuning });
  }
}

function stop() {
  player.pause();
  playing.value = false;
  keepScreenOn(false);
}

/** The phrase to practise: a generated pattern, or the looped / selected / first bars of the Play riff. */
function currentPhrase(c: Cfg): { ph: Phrase; title: string; tuning: Song['tuning'] } {
  if (c.source === 'riff') {
    const s = song.value;
    const sel = s.notes.filter(n => selection.value.has(n.id));
    const lp = loopOn.value ? loop.value : null;
    let a: number, b: number;
    if (lp) { a = lp.start; b = lp.end; }
    else if (sel.length) { a = Math.min(...sel.map(n => n.start)); b = Math.max(...sel.map(n => n.start + n.dur)); }
    else { a = 0; b = Math.min(4 * 96, s.notes.reduce((m, n) => Math.max(m, n.start + n.dur), 0)); }
    const notes = s.notes.filter(n => n.start >= a && n.start < b).map(n => ({ string: n.string, fret: n.fret, tech: n.tech, start: n.start - a, dur: Math.min(n.dur, b - n.start) }));
    return { ph: { notes, len: Math.ceil((b - a) / PPQ) * PPQ }, title: s.title, tuning: s.tuning };
  }
  const p = c.pattern;
  const info = PATTERNS.find(x => x.id === p.id)!;
  return { ph: phraseOf(generate(p), c.sub), title: `${PITCH_NAMES[p.key]} ${info.name}`, tuning: 'std' };
}

function start() {
  const c = cfg.value;
  const cur = currentPhrase(c);
  const cyc = buildCycle(cur.ph, c.drill);
  if (!cyc.notes.length) return;
  cycleRef = { ...cur, ph: cyc };
  cycles.value = 0;
  lastTick = 0;
  liveBpm.value = c.bpm;
  player.setSong({ ...toSong(cyc, c.bpm, cur.title), tuning: cur.tuning });
  player.loop = { start: 0, end: cycleTicks(cyc) };
  player.metronome = c.click;
  player.speed = 1;
  player.play(0, true);
  playing.value = true;
  keepScreenOn(true);
}

/** A tempo you can play cleanly, per exercise (pattern + note value + drill doesn't matter: the notes do). */
const logKey = (c: Cfg) => c.source === 'riff'
  ? `riff:${song.value.title}`
  : `${c.pattern.id}|${c.pattern.key}|${c.pattern.scale}|${c.pattern.quality}|${c.pattern.seq}|${c.pattern.dir}|${c.sub}`;

function markClean() {
  const c = cfg.value, k = logKey(c), bpm = playing.value ? liveBpm.value : c.bpm;
  const prev = log.value[k];
  log.value = { ...log.value, [k]: { best: Math.max(prev?.best ?? 0, bpm), last: bpm, at: Date.now() } };
  write(LOG_KEY, log.value);
}

// ---- view ----
const PRINCIPLES: [string, string][] = [
  ['Short bursts past your limit',
    "Slow practice alone trains a slow motion, and fast playing isn't the same motion sped up. Bursts and chunks let you play at or past your target speed for a few notes at a time, where you can still stay loose, so your hands find the motion that actually works fast."],
  ['Vary the rhythm and the tempo',
    'Rhythm variations and small tempo steps keep each rep slightly different, which stops you grooving one stiff habit and shows where the weak note pairs are. Overshoot your target in short bursts, then come back: the target feels easier.'],
  ['Track clean, stop at tension',
    "Only count a tempo when it's clean and relaxed: mark it, and that's your number for next time. If your hand, shoulder or jaw tightens, drop the tempo. Speed gained with tension doesn't last; a few minutes a day does."],
];

function Num({ value, min, max, step = 1, onSet, title, w = 52 }: { value: number; min: number; max: number; step?: number; onSet: (v: number) => void; title?: string; w?: number }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <input type="number" min={min} max={max} step={step} value={v} title={title} style={{ width: w }}
      onInput={e => setV(e.currentTarget.value)}
      onChange={e => { const n = Number(e.currentTarget.value); if (n >= min && n <= max) onSet(n); else setV(String(value)); }} />
  );
}

export function Speed() {
  useEffect(() => () => stop(), []); // leaving the section stops it
  useSpeedKeys();
  const c = cfg.value;
  const p = c.pattern;
  const info = PATTERNS.find(x => x.id === p.id)!;
  const cur = currentPhrase(c);
  const cyc = buildCycle(cur.ph, c.drill);
  const ex = { ...toSong(cyc, c.bpm, cur.title), tuning: cur.tuning };
  const drillInfo = DRILL_INFO.find(d => d.id === c.drill.id)!;
  const bpm = playing.value ? liveBpm.value : c.bpm;
  const entry = log.value[logKey(c)];
  const restart = () => { if (playing.value) start(); };
  // Restart with the new exercise when a setting changes mid-play.
  const sig = JSON.stringify([c.source, c.pattern, c.sub, c.drill, c.click]);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } restart(); }, [sig]);
  const subName = SUBDIVISIONS.find(s => s.ticks === c.sub)?.short ?? '';

  // The neck: every spot in the exercise, the note playing now highlighted.
  const t = tick.value;
  const sounding = playing.value ? cyc.notes.filter(n => n.start <= t && t < n.start + n.dur) : [];
  const marks = new Map<string, NeckMark>();
  for (const n of cyc.notes) marks.set(posKey(n), { label: String(n.fret), cls: 'soft tint', style: { '--h': fretHue(n.fret) } as JSX.CSSProperties });
  for (const n of sounding) marks.set(posKey(n), { label: String(n.fret), cls: 'hot' });
  const frets = cyc.notes.map(n => n.fret);
  const viewHi = Math.min(24, Math.max(15, ...frets.map(f => f + 2)));

  return (
    <div class="speed-sec">
      <div class="panel header">
        <div class="row">
          <SectionNav />
          <button class="play" onClick={() => (playing.value ? stop() : start())} title="Start / stop (Space)">{playing.value ? '■' : '▶'}<span class="lbl">{playing.value ? ' Stop' : ' Start'}</span></button>
          <span class="sp-bpm" title="Tempo (beats per minute)">
            <button onClick={() => bumpBpm(-5)} aria-label="Slower">−</button>
            <b>{bpm}</b><small> BPM</small>
            <button onClick={() => bumpBpm(5)} aria-label="Faster">+</button>
          </span>
          <span class="muted sp-nps" title="Notes per second at this tempo and note value">{c.source === 'pattern' ? `${notesPerSec(bpm, c.sub).toFixed(1)} notes/s` : ''}</span>
          <button class={c.click ? 'on' : ''} onClick={() => setCfg({ click: !c.click })} title="Metronome click">Click</button>
          <span class="spacer" />
          {playing.value && <span class="muted">Cycle {cycles.value + 1}</span>}
          <button onClick={markClean} title="This tempo is clean and relaxed: log it">✓<span class="lbl"> Clean at {bpm}</span></button>
        </div>
      </div>

      <div class="panel sp-setup">
        <div class="row">
          <span class="seg small" role="group">
            <button class={c.source === 'pattern' ? 'on' : ''} onClick={() => setCfg({ source: 'pattern' })}>Pattern</button>
            <button class={c.source === 'riff' ? 'on' : ''} title="The looped bars, the selection, or the first 4 bars of the riff in Play"
              onClick={() => setCfg({ source: 'riff', bpm: c.source === 'riff' ? c.bpm : song.value.bpm })}>My riff</button>
          </span>
          {c.source === 'pattern' ? (
            <>
              <select value={p.id} onChange={e => { setPattern({ id: e.currentTarget.value as PatternCfg['id'] }); e.currentTarget.blur(); }}>
                {PATTERNS.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              {info.uses.length > 0 && (
                <select value={String(p.key)} title="Key" onChange={e => { setPattern({ key: Number(e.currentTarget.value) }); e.currentTarget.blur(); }}>
                  {PITCH_NAMES.map((n, i) => <option key={n} value={String(i)}>{n}</option>)}
                </select>
              )}
              {info.uses.includes('scale') && (
                <select value={p.scale} title="Scale" onChange={e => { setPattern({ scale: e.currentTarget.value as ScaleId }); e.currentTarget.blur(); }}>
                  {(Object.keys(SCALE_NAMES) as ScaleId[]).filter(s => s !== 'song').map(s => <option key={s} value={s}>{SCALE_NAMES[s]}</option>)}
                </select>
              )}
              {info.uses.includes('quality') && (
                <span class="seg small" role="group">
                  <button class={p.quality === 'min' ? 'on' : ''} onClick={() => setPattern({ quality: 'min' })}>Minor</button>
                  <button class={p.quality === 'maj' ? 'on' : ''} onClick={() => setPattern({ quality: 'maj' })}>Major</button>
                </span>
              )}
              {info.uses.includes('seq') && (
                <select value={p.seq} title="Sequence" onChange={e => { setPattern({ seq: e.currentTarget.value as PatternCfg['seq'] }); e.currentTarget.blur(); }}>
                  {Object.entries(SEQ_NAMES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                </select>
              )}
              {info.uses.includes('dir') && (
                <select value={p.dir} title="Direction" onChange={e => { setPattern({ dir: e.currentTarget.value as PatternCfg['dir'] }); e.currentTarget.blur(); }}>
                  {Object.entries(DIR_NAMES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                </select>
              )}
              <label class="muted" title="Roughly where on the neck">Fret <Num value={p.pos} min={1} max={17} onSet={v => setPattern({ pos: v })} w={50} /></label>
              <select value={String(c.sub)} title="Note value" onChange={e => { setCfg({ sub: Number(e.currentTarget.value) }); e.currentTarget.blur(); }}>
                {SUBDIVISIONS.map(s => <option key={s.ticks} value={String(s.ticks)}>{s.name}</option>)}
              </select>
            </>
          ) : (
            <span class="muted">{cur.ph.notes.length ? `${cur.title}: ${loopOn.value && loop.value ? 'the looped part' : selection.value.size ? 'the selected notes' : 'the first bars'} (set a loop in Play to choose)` : 'Your riff in Play is empty.'}</span>
          )}
        </div>
        {c.source === 'pattern' && <div class="muted sp-desc">{info.desc}</div>}

        <div class="row sp-drill">
          <span class="seg small" role="group" aria-label="Drill">
            {DRILL_INFO.map(d => <button key={d.id} class={c.drill.id === d.id ? 'on' : ''} onClick={() => setDrill({ id: d.id })} title={d.short}>{d.name}</button>)}
          </span>
          {c.drill.id === 'burst' && (
            <span class="muted">
              <Num value={c.drill.slow} min={1} max={8} onSet={v => setDrill({ slow: v })} w={46} /> slow, then{' '}
              <Num value={c.drill.fast} min={1} max={8} onSet={v => setDrill({ fast: v })} w={46} /> at double speed
            </span>
          )}
          {c.drill.id === 'chunks' && (
            <span class="muted"><Num value={c.drill.chunk} min={2} max={12} onSet={v => setDrill({ chunk: v })} w={46} /> notes per chunk</span>
          )}
          {c.drill.id === 'steady' && (
            <span class="muted"><Num value={c.drill.reps} min={1} max={16} onSet={v => setDrill({ reps: v })} w={46} /> reps per cycle</span>
          )}
        </div>
        <details class="muted sp-desc sp-why" open={!isPhone()}><summary><b>{drillInfo.short}.</b></summary> {drillInfo.why}</details>

        <div class="row sp-ladder">
          <label class="muted"><input type="checkbox" checked={c.ladder.on} onChange={e => setLadder({ on: e.currentTarget.checked })} /> Tempo ladder:</label>
          <span class={`muted${c.ladder.on ? '' : ' off'}`}>
            +<Num value={c.ladder.step} min={1} max={20} onSet={v => setLadder({ step: v })} w={46} /> BPM every{' '}
            <Num value={c.ladder.every} min={1} max={10} onSet={v => setLadder({ every: v })} w={46} /> cycles, up to{' '}
            <Num value={c.ladder.target} min={40} max={300} onSet={v => setLadder({ target: v })} w={58} />
          </span>
          <span class="spacer" />
          <span class="muted">{entry ? <>Best clean: <b class="sp-best">{entry.best}</b> · last {entry.last}</> : 'No clean tempo logged yet'}</span>
          <button class="mini" onClick={() => openInPlay({ ...ex, notes: ex.notes.map(n => ({ ...n })) })} title="Open this exercise in Play as a new riff to edit, slow down or share">Open in Play</button>
        </div>
      </div>

      <div class="panel">
        <Neck marks={marks} view={{ lo: 0, hi: viewHi }} glide={playing.value}
          focus={sounding.length ? { lo: sounding[0].fret, hi: sounding[0].fret } : frets.length ? { lo: Math.min(...frets), hi: Math.max(...frets) } : null} />
      </div>

      <ExerciseTab song={ex} tick={playing.value ? t : -1} />

      <div class="panel lr-tips">
        <div class="lr-principles">
          {PRINCIPLES.map(([h, d], i) => <div key={i}><b>{i + 1}. {h}.</b> {d}</div>)}
        </div>
        <p class="hints"><span><kbd>Space</kbd> start / stop</span><span><kbd>↑</kbd><kbd>↓</kbd> tempo ±5</span><span><kbd>C</kbd> log a clean tempo</span><span>{subName}</span></p>
      </div>
    </div>
  );
}

/** The exercise's cycle as tab, the playing note lit. */
function ExerciseTab({ song: s, tick: t }: { song: Song; tick: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const LEFT = 30, ROW = HEAD + STAFF_H + 50, bar = 96;
  const nBars = Math.max(1, Math.ceil(s.notes.reduce((m, n) => Math.max(m, n.start + n.dur), 0) / bar));
  const perLine = Math.max(1, Math.min(nBars, Math.floor((w - LEFT) / 300)));
  const barW = (w - LEFT) / perLine;
  const lines = Math.ceil(nBars / perLine);
  const hot = new Set(s.notes.filter(n => n.start <= t && t < n.start + n.dur).map(n => n.id));
  const els: JSX.Element[] = [];
  for (let line = 0; line < lines; line++) {
    const y = line * ROW + HEAD;
    const here = Math.min(perLine, nBars - line * perLine);
    for (let i = 0; i < 6; i++) els.push(<line key={`s${line}-${i}`} class="tv-staff" x1={6} x2={LEFT + here * barW} y1={y + i * GAP} y2={y + i * GAP} />);
    for (let k = 0; k <= here; k++) els.push(<line key={`b${line}-${k}`} class="tv-bar" x1={LEFT + k * barW} x2={LEFT + k * barW} y1={y} y2={y + STAFF_H} />);
  }
  for (let b = 0; b < nBars; b++) {
    const y = Math.floor(b / perLine) * ROW + HEAD;
    els.push(...drawBar({ notes: s.notes, start: b * bar, len: bar, beat: 24, x0: LEFT + (b % perLine) * barW, w: barW, y, key: String(b), fretClass: n => (hot.has(n.id) ? ' hot' : '') }));
  }
  const hb = Math.floor(t / bar);
  const headX = t >= 0 ? LEFT + (hb % perLine) * barW + PAD + ((t - hb * bar) / bar) * (barW - 2 * PAD) : 0;
  const headY = Math.floor(hb / perLine) * ROW + HEAD;
  return (
    <div class="panel tv" ref={ref} style={{ maxHeight: 'none' }}>
      <svg width={w} height={lines * ROW + 4}>
        {els}
        {t >= 0 && <line class="tv-playhead" x1={headX} x2={headX} y1={headY - 8} y2={headY + STAFF_H + 8} />}
      </svg>
      <div class="muted sp-tuning">{TUNINGS[s.tuning].name}</div>
    </div>
  );
}

function useSpeedKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : document.body;
      if (t.closest('textarea, select') || (t instanceof HTMLInputElement && !['checkbox', 'button'].includes(t.type)) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { if (playing.value) stop(); else start(); } return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); bumpBpm(e.key === 'ArrowUp' ? 5 : -5); return; }
      if (e.key.toLowerCase() === 'c') markClean();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
