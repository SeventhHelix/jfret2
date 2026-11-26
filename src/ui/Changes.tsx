// Changes: play over a chord progression (I-IV-V, ii-V-I, C E G...) inside one box of the neck. Shows the current
// chord (arpeggio, triads, guide tones, its sweet notes, or the key's scale) with the next chord's notes ringed and
// arrows for where each note goes on the change, plus a one-line readout of the change. The backing strums each chord
// from inside the box, each voice moving to the nearest note of the next chord.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Neck, NeckMark } from './Neck';
import { SectionNav } from './SectionNav';
import { Chord, PRESETS, changeMap, chordScale, guideTones, newNotes, parseProgression } from '../model/chords';
import { ALL_STRINGS, Pos, Region, STD, intervalLabel, keyName, pcAt, pitchAt, posKey, positionsOf, spell, triadShapes } from '../learn/fretmap';
import { SCALES, pc } from '../model/theory';
import { Player } from '../audio/player';
import { keepScreenOn } from '../audio/wakeLock';
import { Song, emptySong } from '../model/song';
import { intervalHue } from './colors';
import { isPhone } from '../state/store';

type Show = 'arp' | 'triads' | 'guide' | 'colour' | 'scale';
type Cfg = {
  key: number; prog: string; bars: number; bpm: number; show: Show; lo: number; width: number;
  next: boolean; arrows: boolean; readout: boolean; backing: boolean; click: boolean;
};
const DEFAULT: Cfg = {
  key: 0, prog: 'ii7 V7 Imaj7', bars: 1, bpm: 80, show: 'arp', lo: 5, width: 5,
  next: true, arrows: true, readout: true, backing: true, click: true,
};
const KEY = 'jfret:changes';
const load = (): Cfg => { try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULT; } };
const cfg = signal<Cfg>(load());
const set = (p: Partial<Cfg>) => { cfg.value = { ...cfg.value, ...p }; try { localStorage.setItem(KEY, JSON.stringify(cfg.value)); } catch { /* ignore */ } };

const SHOWS: [Show, string, string][] = [
  ['arp', 'Arpeggio', 'Every chord tone in the box'],
  ['triads', 'Triads', 'Close triad shapes on each set of three strings, inside the box'],
  ['guide', 'Guide tones', 'Only the 3rd and 7th: the notes that make each chord what it is'],
  ['colour', 'Sweet notes', 'Chord tones, the tensions that sound good on this chord (9, 11, 13), and the notes to avoid holding'],
  ['scale', 'Scale', "The key's scale, with the current chord's tones bright"],
];
const HOW: Record<Show, string> = {
  arp: "Play each chord's arpeggio up and back inside the box, switching right on the change. Start the next chord on whichever of its notes is nearest to where you are (follow the arrows), not on its root.",
  triads: "Play the triad on one set of three strings, then find the next chord's triad on the same strings with the least movement. Then do the same on the next string set.",
  guide: 'Play only 3rds and 7ths, one note per beat. You will hear the chords move even with no root under them: the amber arrows are the half-step pulls from one chord into the next, the sound of the progression.',
  colour: "Land on a bright chord tone on beat 1, then lean on a tension (9, 11, 13) for colour. The starred notes are what's new in this chord: hit one on the change and the change jumps out. Pass through × notes, don't hold them.",
  scale: "Play the scale continuously in 8th notes, but land on a bright chord tone on beat 1 of every chord. That's the difference between running a scale and playing the changes.",
};
const PRINCIPLES: [string, string][] = [
  ['Aim for the 3rd on the change', 'The 3rd (and the 7th) decide what a chord sounds like. Landing on one right as the chord changes makes the change audible in your line, and in a ii-V-I the 7th of each chord falls a half step into the 3rd of the next.'],
  ['Nearest note wins', 'When the chord changes, go to the closest note of the new chord: the arrows show it, amber for a half step. Notes both chords share (double rings) can simply stay and change their role, like D going from root of Dm7 to 5th of G7.'],
  ['One box, then move the box', 'Playing every chord inside the same 4-5 frets forces you to find each one where your hand already is, the way you actually play. Once it flows, slide the box up and do it again; click a fret number to move it.'],
];

/** One chord tone per string inside the box, low strings first: what the backing strums. With the previous voicing,
 *  each string moves to the nearest tone (so you hear the voice leading); otherwise the tones nearest the box middle. */
function voicing(ch: Chord, r: Region, prev?: Pos[]): Pos[] {
  const want = new Set(ch.tones.map(t => pc(ch.root + t)));
  const mid = (r.lo + r.hi) / 2;
  const out: Pos[] = [];
  for (const s of [4, 3, 2, 1]) {
    const aim = prev?.find(p => p.string === s)?.fret ?? mid;
    let best: Pos | null = null;
    for (let f = r.lo; f <= r.hi; f++) if (want.has(pc(STD[s] + f)) && (!best || Math.abs(f - aim) < Math.abs(best.fret - aim))) best = { string: s, fret: f };
    if (best) out.push(best);
  }
  // Root in the bass when the box has it on the low strings.
  const bass = positionsOf([ch.root], { ...r, strings: [5, 4] })[0];
  if (bass && !out.some(p => p.string === bass.string)) out.unshift(bass);
  else if (bass) out.splice(out.findIndex(p => p.string === bass.string), 1, bass);
  return out;
}

function backingSong(chords: Chord[], c: Cfg, r: Region): Song {
  const len = c.bars * 96;
  let id = 1, prev: Pos[] | undefined;
  const notes = chords.flatMap((ch, i) => {
    if (!c.backing) return [];
    const v = voicing(ch, r, prev);
    prev = v;
    return v.map(p => ({ id: id++, start: i * len, dur: len, string: p.string, fret: p.fret }));
  });
  return { ...emptySong(), title: 'Changes', bpm: c.bpm, notes }; // the player's loop sets the length, notes or not
}

/** Which notes of a chord to show in the box. */
function tonesToShow(ch: Chord, show: Show, r: Region): { pos: Pos[]; shapes: Pos[][] } {
  if (show === 'triads') {
    const triad = ch.tones.slice(0, 3);
    const shapes = [2, 3, 4, 5].flatMap(set => triadShapes(ch.root, triad, set, 22))
      .filter(sh => sh.notes.every(n => n.fret >= r.lo && n.fret <= r.hi)).map(sh => sh.notes);
    const seen = new Set<string>();
    return { pos: shapes.flat().filter(p => !seen.has(posKey(p)) && seen.add(posKey(p))), shapes };
  }
  const tones = show === 'guide' ? guideTones(ch) : ch.tones;
  return { pos: positionsOf(tones.map(t => pc(ch.root + t)), r), shapes: [] };
}

/** Arrows from each shown note to the nearest note of the next chord (a step or less away; kept notes get none). */
function handoffs(from: Pos[], to: Pos[]): { from: Pos; to: Pos; cls: string }[] {
  const out: { from: Pos; to: Pos; cls: string }[] = [];
  for (const a of from) {
    let best: { p: Pos; d: number; dist: number } | null = null;
    for (const b of to) {
      const d = Math.abs(pitchAt(b) - pitchAt(a));
      if (d === 0 || d > 2) continue;
      const dist = Math.abs(b.fret - a.fret) + 2 * Math.abs(b.string - a.string);
      if (!best || d < best.d || (d === best.d && dist < best.dist)) best = { p: b, d, dist };
    }
    if (best && !from.some(x => posKey(x) === posKey(best!.p))) out.push({ from: a, to: best.p, cls: best.d === 1 ? 'half' : 'step' });
  }
  return out;
}

// ---- playback ----
const playing = signal(false);
const tick = signal(0);
const picked = signal(0); // chord shown while stopped
const player = new Player(t => { tick.value = t; }, () => { playing.value = false; });
function stop() { player.pause(); playing.value = false; keepScreenOn(false); }
function start(chords: Chord[], c: Cfg, r: Region) {
  if (!chords.length) return;
  player.setSong(backingSong(chords, c, r));
  player.loop = { start: 0, end: chords.length * c.bars * 96 };
  player.tempo = [];
  player.metronome = c.click;
  player.speed = 1;
  player.play(picked.value * c.bars * 96, true);
  playing.value = true;
  keepScreenOn(true);
}

/** "Dm7 → G7 · keep D (R→5) · C→B ½↓ (b7→3) · new B": what each note does on this change. */
function Readout({ cur, nxt, keyRoot }: { cur: Chord; nxt: Chord; keyRoot: number }) {
  const moves = changeMap(cur, nxt);
  const nm = (p: number) => spell(p, keyRoot);
  const kept = moves.filter(m => m.semis === 0), moved = moves.filter(m => m.semis !== 0);
  const fresh = newNotes(cur, nxt).filter(p => !moves.some(m => m.to === p && Math.abs(m.semis) <= 2));
  const step = (s: number) => `${Math.abs(s) === 1 ? '½' : Math.abs(s) === 2 ? '1' : Math.abs(s)}${s > 0 ? '↑' : '↓'}`;
  return (
    <p class="ch-read">
      <b>{cur.name} → {nxt.name}</b>
      {kept.length > 0 && <span> · keep {kept.map((m, i) => <span key={i} class="ch-keep">{nm(m.from)}<i class="role"> ({m.fromLabel}→{m.toLabel})</i>{i < kept.length - 1 ? ' ' : ''}</span>)}</span>}
      {moved.map((m, i) => (
        <span key={i} class={Math.abs(m.semis) === 1 ? 'ch-half' : ''}> · {nm(m.from)}→{nm(m.to)} {step(m.semis)}<i class="role"> ({m.fromLabel}→{m.toLabel})</i></span>
      ))}
      {fresh.length > 0 && <span> · new {fresh.map(nm).join(' ')}</span>}
    </p>
  );
}

function OptionsMenu({ c }: { c: Cfg }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => { const el = ref.current; if (el?.open && !el.contains(e.target as Node)) el.open = false; };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return (
    <details class="opts settings ch-menu" ref={ref}>
      <summary title="Options">⚙</summary>
      <div class="opts-pop">
        <label><input type="checkbox" checked={c.next} onChange={() => set({ next: !c.next })} /> <span><b>Next chord</b> ring its notes (double ring = in both)</span></label>
        <label><input type="checkbox" checked={c.arrows} onChange={() => set({ arrows: !c.arrows })} /> <span><b>Arrows</b> where each note goes on the change</span></label>
        <label><input type="checkbox" checked={c.readout} onChange={() => set({ readout: !c.readout })} /> <span><b>Change readout</b> the line under the chords</span></label>
        <label><input type="checkbox" checked={c.backing} onChange={() => set({ backing: !c.backing })} /> <span><b>Backing</b> strum each chord from inside the box</span></label>
        <label><input type="checkbox" checked={c.click} onChange={() => set({ click: !c.click })} /> <span><b>Click</b></span></label>
        <div class="snd-row"><span class="muted">Bars per chord</span>
          <select value={String(c.bars)} onChange={e => { set({ bars: Number(e.currentTarget.value) }); e.currentTarget.blur(); }}>
            {[1, 2, 4].map(b => <option key={b} value={String(b)}>{b}</option>)}
          </select></div>
        <div class="snd-row"><span class="muted">Box width</span>
          <select value={String(c.width)} onChange={e => { set({ width: Number(e.currentTarget.value) }); e.currentTarget.blur(); }}>
            {[4, 5, 6, 7, 13].map(w => <option key={w} value={String(w)}>{w === 13 ? 'Wide (13)' : `${w} frets`}</option>)}
          </select></div>
      </div>
    </details>
  );
}

export function Changes() {
  const c = cfg.value;
  const [progText, setProgText] = useState(c.prog);
  useEffect(() => setProgText(c.prog), [c.prog]);
  const { chords, bad } = parseProgression(c.prog, c.key);
  const r: Region = { lo: c.lo, hi: Math.min(24, c.lo + c.width - 1), strings: ALL_STRINGS };
  const n = chords.length;
  const idx = n ? (playing.value ? Math.floor(tick.value / (c.bars * 96)) % n : Math.min(picked.value, n - 1)) : 0;
  const cur = chords[idx], nxt = chords[(idx + 1) % n], prv = chords[(idx + n - 1) % n];
  const restart = () => { if (playing.value) start(chords, c, r); };
  useEffect(() => () => stop(), []);
  useEffect(restart, [c.prog, c.key, c.bars, c.lo, c.width, c.backing, c.click]);
  useEffect(() => { player.metronome = c.click; }, [c.click]);
  useEffect(() => { if (playing.value) player.setSong(backingSong(chords, c, r)); }, [c.bpm]); // tempo: no restart
  useChangesKeys(chords, r);

  // The key's mode, for Scale: minor when the progression starts on a minor chord on the key's root.
  const minorKey = !!chords[0] && chords[0].tones.includes(3) && !chords[0].tones.includes(4) && chords[0].root === pc(c.key);
  const marks = new Map<string, NeckMark>();
  let shapes: Pos[][] = [];
  let links: { from: Pos; to: Pos; cls: string }[] = [];
  if (cur) {
    const lbl = (p: Pos, ch: Chord) => intervalLabel(pcAt(p), ch.root);
    const style = (p: Pos, ch: Chord) => ({ '--ic': intervalHue(pcAt(p) - ch.root) } as JSX.CSSProperties);
    const base: Show = c.show === 'scale' || c.show === 'colour' ? 'arp' : c.show;
    if (c.show === 'scale') {
      const steps = minorKey ? SCALES.minor : SCALES.major;
      for (const p of positionsOf(steps.map(s => pc(c.key + s)), r)) marks.set(posKey(p), { label: lbl(p, cur), cls: 'scale', style: style(p, cur) });
    }
    if (c.show === 'colour') {
      // Tensions and avoid notes first; chord tones are drawn over them below.
      const fresh = new Set(n > 1 ? newNotes(prv, cur) : []);
      for (const t of chordScale(cur, c.key, nxt)) {
        if (t.tier === 'chord') continue;
        for (const p of positionsOf([t.pc], r)) {
          marks.set(posKey(p), { label: t.tier === 'avoid' ? '×' : t.label, cls: t.tier === 'avoid' ? 'nk-avoid' : 'nk-tension', style: style(p, cur) });
        }
      }
      for (const p of positionsOf([...fresh], r)) marks.set(posKey(p), { label: lbl(p, cur), cls: 'lr-target nk-new', style: style(p, cur) });
    }
    const now = tonesToShow(cur, base, r);
    shapes = now.shapes;
    const nowKeys = new Set(now.pos.map(posKey));
    const next = c.next && nxt && n > 1 ? tonesToShow(nxt, base, r) : { pos: [], shapes: [] };
    const nextKeys = new Set(next.pos.map(posKey));
    const fresh = c.show === 'colour' && n > 1 ? new Set(newNotes(prv, cur)) : new Set<number>();
    const isGuide = (p: Pos) => { const iv = pc(pcAt(p) - cur.root); return iv === 3 || iv === 4 || iv === 10 || iv === 11; };
    for (const p of now.pos) {
      marks.set(posKey(p), {
        label: lbl(p, cur),
        cls: `lr-target${pcAt(p) === cur.root ? ' lr-root' : ''}${nextKeys.has(posKey(p)) ? ' nk-common' : ''}${fresh.has(pcAt(p)) ? ' nk-new' : ''}${c.show === 'colour' && isGuide(p) ? ' nk-guide' : ''}`,
        style: style(p, cur),
      });
    }
    for (const p of next.pos) if (!nowKeys.has(posKey(p))) marks.set(posKey(p), { label: lbl(p, nxt), cls: 'nk-next' });
    if (c.arrows && c.next && n > 1) links = handoffs(now.pos, next.pos);
  }

  return (
    <div class="changes">
      <div class="panel header">
        <div class="row">
          <SectionNav />
          <label class="muted">Key{' '}
            <select value={String(c.key)} onChange={e => { set({ key: Number(e.currentTarget.value) }); e.currentTarget.blur(); }}>
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i)}>{keyName(i)}</option>)}
            </select>
          </label>
          <select value={PRESETS.some(p => p[0] === c.prog) ? c.prog : ''} title="Common progressions" onChange={e => { if (e.currentTarget.value) { set({ prog: e.currentTarget.value }); picked.value = 0; } e.currentTarget.blur(); }}>
            {!PRESETS.some(p => p[0] === c.prog) && <option value="">Custom</option>}
            {PRESETS.map(([p, name]) => <option key={p} value={p}>{name}: {p}</option>)}
          </select>
          <input class="ch-prog" value={progText} aria-label="Progression"
            title="Roman numerals (I IV V, ii7 V7 Imaj7, i bVI bVII, V7/ii) or chord names (C E G, Cmaj7 A7 Dm7 G7)"
            onInput={e => setProgText(e.currentTarget.value)} onChange={e => { set({ prog: e.currentTarget.value.trim() || DEFAULT.prog }); picked.value = 0; }} />
          {bad.length > 0 && <span class="ch-bad">Can't read: {bad.join(' ')}</span>}
        </div>
      </div>

      <div class="panel ch-stage">
        <div class="row ch-bar">
          <button class={`mt-go small${playing.value ? ' on' : ''}`} onClick={() => (playing.value ? stop() : start(chords, c, r))} title="Start / stop (Space)">
            {playing.value ? '■ Stop' : '▶ Start'}
          </button>
          <span class="sp-bpm" title="Tempo">
            <button onClick={() => set({ bpm: Math.max(30, cfg.value.bpm - 5) })} aria-label="Slower">−</button>
            <b>{c.bpm}</b><small> BPM</small>
            <button onClick={() => set({ bpm: Math.min(240, cfg.value.bpm + 5) })} aria-label="Faster">+</button>
          </span>
          <div class="ch-chords" role="group" aria-label="Chords">
            {chords.map((ch, i) => (
              <button key={i} class={`ch-chord${i === idx ? ' cur' : ''}${n > 1 && i === (idx + 1) % n && c.next ? ' next' : ''}`}
                onClick={() => { picked.value = i; if (playing.value) start(chords, c, r); }}>
                <b>{ch.name}</b><small>{ch.roman}</small>
              </button>
            ))}
          </div>
          <span class="spacer" />
          <OptionsMenu c={c} />
        </div>
        <div class="row ch-opts">
          <span class="seg small" role="group" aria-label="Show">
            {SHOWS.map(([id, name, title]) => <button key={id} class={c.show === id ? 'on' : ''} title={title} onClick={() => set({ show: id })}>{name}</button>)}
          </span>
          <span class="muted ch-box">Box{' '}
            <button class="mini" onClick={() => set({ lo: Math.max(0, cfg.value.lo - 1) })} aria-label="Box down the neck">◀</button>
            {' '}frets {r.lo}–{r.hi}{' '}
            <button class="mini" onClick={() => set({ lo: Math.min(24 - cfg.value.width + 1, cfg.value.lo + 1) })} aria-label="Box up the neck">▶</button>
          </span>
        </div>
        {c.readout && cur && nxt && n > 1 && <Readout cur={cur} nxt={nxt} keyRoot={c.key} />}
        <Neck marks={marks} region={r} view={{ lo: 0, hi: Math.max(15, Math.min(24, r.hi + 1)) }} shapes={shapes} links={links}
          onTap={p => player.preview(pitchAt(p))}
          onFret={f => set({ lo: Math.max(0, Math.min(24 - c.width + 1, f - Math.floor(c.width / 2))) })} />
        <div class="muted ch-legend">
          <span><i class="lg now" /> {cur?.name ?? ''}</span>
          {c.next && n > 1 && <span><i class="lg next" /> {nxt?.name} next</span>}
          {c.next && n > 1 && <span><i class="lg both" /> in both</span>}
          {c.arrows && c.next && n > 1 && <span><i class="lg arrow" /> half step <i class="lg arrow step" /> whole step</span>}
          {c.show === 'colour' && <span><i class="lg tension" /> tension · <b>×</b> avoid · <i class="lg fresh" /> new in this chord</span>}
          <span>Click a fret number to move the box</span>
        </div>
      </div>

      <div class="panel lr-tips">
        <div class="lr-how"><b>How to practise this:</b> {HOW[c.show]}</div>
        <details class="sm-sec" open={!isPhone()}>
          <summary>Why it works</summary>
          <div class="lr-principles">{PRINCIPLES.map(([t, d], i) => <div key={i}><b>{i + 1}. {t}.</b> {d}</div>)}</div>
        </details>
        <p class="hints"><span><kbd>Space</kbd> start / stop</span><span><kbd>←</kbd><kbd>→</kbd> previous / next chord</span><span><kbd>[</kbd><kbd>]</kbd> move the box</span></p>
      </div>
    </div>
  );
}

function useChangesKeys(chords: Chord[], r: Region) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : document.body;
      if (t.closest('textarea, select') || (t instanceof HTMLInputElement && !['checkbox', 'button'].includes(t.type)) || e.ctrlKey || e.metaKey || e.altKey) return;
      const c = cfg.value, n = chords.length;
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { if (playing.value) stop(); else start(chords, c, r); } return; }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && n) {
        e.preventDefault();
        const cur = playing.value ? Math.floor(tick.value / (c.bars * 96)) % n : picked.value;
        picked.value = (cur + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
        if (playing.value) start(chords, c, r);
        return;
      }
      if (e.key === '[' || e.key === ']') set({ lo: Math.max(0, Math.min(24 - c.width + 1, c.lo + (e.key === ']' ? 1 : -1))) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chords.map(ch => ch.name).join(), r.lo, r.hi]);
}
