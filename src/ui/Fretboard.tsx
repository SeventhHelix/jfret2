import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { MAX_FRET, Note, STRINGS, TUNINGS, barTicks, beatTicks, noteName, notesInRange, pitchOf } from '../model/song';
import {
  cursor, cursorIds, editMode, fretMode, guide, guideRoot, guideScale, hotIds, insertNote, nextIds, playhead, playing, previewNote,
  setGuide, softIds, softSource,
  layout, song, view,
} from '../state/store';
import { intervalHue, noteHue } from './colors';
import { focusRange, fretWidth } from '../model/layout';
import { FlowPt, groupLinks } from '../model/flow';
import { PITCH_NAMES, SCALE_NAMES, ScaleId, guessRoot, intervalName, pc } from '../model/theory';

const ROW_H = 52;
const OPEN_W = 52;
let FRET_W = 64; // set each render from the View menu's Neck mode (the helpers below read it)
const SINGLE_DOTS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_DOTS = [12, 24];

const cellX = (f: number) => (f === 0 ? 0 : OPEN_W + (f - 1) * FRET_W);
const cellW = (f: number) => (f === 0 ? OPEN_W : FRET_W);
const midX = (f: number) => OPEN_W + (f - 0.5) * FRET_W;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

type Cell = {
  hot: boolean; soft: boolean; next: boolean; atCursor: boolean;
  ghost: number;      // 0..1 look-ahead strength for a next-bar note (0 = not a ghost)
  approach: number;   // 1 = about to play / in view, lower = further away (motion)
  played: boolean;    // every soft note at this spot has already sounded (motion)
  hue: number | null; // position colour of the first note drawn here
  dead: boolean;      // every note here is a dead (muted) note: shown as x
};

export function Fretboard() {
  const scrollRef = useRef<HTMLDivElement>(null);
  // The neck's visible width (in its own, zoomed coordinates), for fitting frets to it.
  const [visW, setVisW] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setVisW(el.clientWidth);
    const ro = new ResizeObserver(() => setVisW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [scrollX, setScrollX] = useState(0);
  const lay = layout.value;
  const s = song.value;
  const edit = editMode.value;
  const opts = view.value;
  const hueOf = noteHue.value;
  const t = playhead.value;
  const bar = barTicks(s.timeSig);
  const beat = beatTicks(s.timeSig);
  const hot = hotIds.value;
  const soft = softIds.value;
  // While editing with playback stopped, the cursor ring is the useful cue; the "next" ring is for playing along.
  const next = opts.nextRing && (playing.value || !edit) ? nextIds.value : new Set<number>();
  const atCursor = edit && !playing.value ? cursorIds.value : new Set<number>();
  const src = softSource.value;
  const g = guide.value;
  const root = guideRoot.value;
  const scale = g.on ? guideScale.value : null;
  const strictScale = !!scale && g.scale !== 'song'; // only a chosen scale can make a riff note "wrong"

  const cells = new Map<string, Cell>();
  const cellAt = (n: Note) => {
    const k = `${n.string}:${n.fret}`;
    let c = cells.get(k);
    if (!c) {
      c = { hot: false, soft: false, next: false, atCursor: false, ghost: 0, approach: 0, played: true, hue: null, dead: true };
      cells.set(k, c);
    }
    c.dead &&= !!n.tech?.dead;
    return c;
  };

  const motionWindow = beat * 2; // notes grow in over the two beats before they sound

  for (const n of s.notes) {
    const isHot = hot.has(n.id), isSoft = soft.has(n.id), isNext = next.has(n.id), isCur = atCursor.has(n.id);
    if (!isHot && !isSoft && !isNext && !isCur) continue;
    const c = cellAt(n);
    c.hot ||= isHot;
    c.soft ||= isSoft;
    if (isSoft) c.hue ??= hueOf(n);
    c.next ||= isNext;
    c.atCursor ||= isCur;
    if (isSoft) {
      const done = n.start + n.dur <= t;
      c.played &&= done;
      const approach = n.start <= t ? 1 : clamp01(1 - (n.start - t) / motionWindow);
      c.approach = Math.max(c.approach, done ? 0 : approach);
    }
  }

  // Look-ahead: in bar view, the next bar's notes fade in as the current bar runs out.
  if (opts.lookAhead && fretMode.value === 'bar' && src === 'bar') {
    const barStart = Math.floor(t / bar) * bar;
    const progress = (t - barStart) / bar;
    const strength = progress * progress; // stays faint for most of the bar, then ramps up
    for (const n of notesInRange(s.notes, barStart + bar, barStart + 2 * bar)) {
      const c = cellAt(n);
      // A spot that already finished in this bar can re-light as a look-ahead (riffs often revisit the same frets).
      if (!c.hot && (!c.soft || c.played)) {
        c.ghost = Math.max(c.ghost, 0.08 + 0.92 * strength);
        c.hue ??= hueOf(n);
      }
    }
  }

  // ---- Flow path + hand position (Display options) ----
  // Source notes: whatever the neck is focused on (bar / selection / loop); in Live mode, the current bar.
  const barStartT = Math.floor(t / bar) * bar;
  const flowSrc = src === 'live' ? notesInRange(s.notes, barStartT, barStartT + bar) : s.notes.filter(n => soft.has(n.id));
  // Where the hand mostly is: open strings, dead notes and a couple of stray far-off notes don't move it.
  const focus = focusRange(flowSrc);
  const focusLo = focus ? focus.lo : -1, focusHi = focus ? focus.hi : -1;
  // Fret width: fixed and scrolling, the whole neck fitted, or the frets in focus fitted to the panel.
  FRET_W = fretWidth(lay.fbNeck, visW, focusLo, focusHi, OPEN_W, MAX_FRET);
  const cx = (f: number) => (f === 0 ? OPEN_W / 2 : midX(f));
  type Pt = FlowPt & { x: number; y: number; end: number; hue: number };
  const pts: Pt[] = [...new Set(flowSrc.map(n => n.start))].sort((a, b) => a - b).map(st => {
    const grp = flowSrc.filter(n => n.start === st); // a chord flows through its centre
    const top = grp.reduce((a, n) => (pitchOf(s, n) > pitchOf(s, a) ? n : a)); // grouping follows a chord's top note
    return {
      string: top.string,
      pitch: pitchOf(s, top),
      x: grp.reduce((a, n) => a + cx(n.fret), 0) / grp.length,
      y: grp.reduce((a, n) => a + n.string * ROW_H + ROW_H / 2, 0) / grp.length,
      start: st,
      end: Math.max(...grp.map(n => n.start + n.dur)),
      hue: hueOf(grp[0]),
    };
  });
  // Separate phrases: break the line at a rest of a beat or more.
  const phrases: Pt[][] = [];
  for (const p of pts) {
    const cur = phrases[phrases.length - 1];
    const prev = cur?.[cur.length - 1];
    if (!prev || p.start - prev.end >= beat) phrases.push([p]);
    else cur.push(p);
  }
  type Seg = { d: string; state: 'played' | 'current' | 'upcoming'; ahead: number; hue: number; link: boolean; ctrl: number[] };
  const segs: Seg[] = [];
  for (const ph of phrases) {
    const links = groupLinks(ph, opts.flowGrouping, bar); // dotted where the line moves on to the next chunk
    for (let i = 0; i + 1 < ph.length; i++) {
      const p0 = ph[i - 1] ?? ph[i], p1 = ph[i], p2 = ph[i + 1], p3 = ph[i + 2] ?? ph[i + 1];
      if (p1.x === p2.x && p1.y === p2.y) continue; // repeated note: nothing to draw
      // Catmull-Rom through the notes, as cubic Béziers: smooth, passes through every note.
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      const state = t >= p2.start ? 'played' : t >= p1.start ? 'current' : 'upcoming';
      segs.push({
        d: `M${p1.x} ${p1.y} C${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`,
        state, ahead: 0, hue: p1.hue, link: links[i],
        ctrl: [p1.x, p1.y, c1x, c1y, c2x, c2y, p2.x, p2.y, p1.start, p2.start],
      });
    }
  }
  let ahead = 0;
  for (const sg of segs) if (sg.state === 'upcoming') sg.ahead = ++ahead;
  // Comet: during playback, a dot rides the curve between the current note and the next.
  const curSeg = playing.value ? segs.find(sg => sg.state === 'current') : undefined;
  let comet: { x: number; y: number } | null = null;
  if (curSeg) {
    const [x0, y0, x1, y1, x2, y2, x3, y3, s0, s1] = curSeg.ctrl;
    const u = clamp01((t - s0) / (s1 - s0)), v = 1 - u;
    comet = {
      x: v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3,
      y: v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3,
    };
  }
  const segOpacity = (sg: Seg) =>
    sg.state === 'played' ? 0.18 : sg.state === 'current' ? 0.95 : opts.motion ? Math.max(0.22, 0.75 - 0.12 * (sg.ahead - 1)) : 0.6;
  // Hand position: the fretted notes in focus (not open strings, dead notes or strays), at least 4 frets wide.
  const fretted = focus ? flowSrc.filter(n => n.fret >= focus.lo && n.fret <= focus.hi && !n.tech?.dead) : [];
  const hand = fretted.length ? (() => {
    const lo = Math.min(...fretted.map(n => n.fret)), hi = Math.max(Math.max(...fretted.map(n => n.fret)), lo + 3);
    const sLo = Math.min(...fretted.map(n => n.string)), sHi = Math.max(...fretted.map(n => n.string));
    return { x: cellX(lo) + 3, y: sLo * ROW_H + 4, w: cellX(hi) + FRET_W - cellX(lo) - 6, h: (sHi - sLo + 1) * ROW_H - 8 };
  })() : null;

  // Follow the music: keep the focused notes' frets in view (the neck is wider than most screens).
  const fretW = FRET_W;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || focusLo < 0) return;
    const left = cellX(focusLo) - 8, right = cellX(focusHi) + cellW(focusHi) + 8;
    if (left >= el.scrollLeft && right <= el.scrollLeft + el.clientWidth) return; // already visible
    const target = right - left > el.clientWidth ? left : (left + right) / 2 - el.clientWidth / 2;
    // Zoom to bar resizes the frets in one step, so jump there too; scrolling a fixed neck glides.
    el.scrollTo({ left: Math.max(0, target), behavior: lay.fbNeck === 'bar' ? 'auto' : 'smooth' });
    if (lay.fbNeck === 'bar') setScrollX(el.scrollLeft); // a jump: the edge markers shouldn't wait a frame for the scroll event
  }, [focusLo, focusHi, fretW]);

  const barNo = Math.floor(t / bar) + 1;
  const cBar = Math.floor(cursor.value / bar) + 1;
  const cBeat = (cursor.value % bar) / beat + 1;
  const cBeatLabel = Number.isInteger(cBeat) ? `beat ${cBeat}` : `beat ${Math.floor(cBeat)}+`;
  const width = OPEN_W + MAX_FRET * FRET_W;
  // Riff dots follow the label mode; dead notes show x.
  const labelOf = (str: number, f: number, c: Cell) => {
    if (c.dead) return 'x';
    const p = pc(pitchOf(s, { string: str, fret: f }));
    return g.labels === 'note' ? PITCH_NAMES[p] : g.labels === 'interval' ? intervalName(p, root) : String(f);
  };
  // Notes in focus that are scrolled out of view (an open string while up the neck, a far tapped note) get a
  // marker at that edge of the neck, on their string, so they're never lost.
  const edges: { str: number; side: 'left' | 'right'; labels: string[]; hot: boolean }[] = [];
  if (visW > 0) {
    for (const [k, c] of cells) {
      if (!c.soft && !c.hot) continue;
      const [str, f] = k.split(':').map(Number);
      const side = cellX(f) + cellW(f) <= scrollX + 6 ? 'left' : cellX(f) >= scrollX + visW - 6 ? 'right' : null;
      if (!side) continue;
      let e = edges.find(x => x.str === str && x.side === side);
      if (!e) edges.push(e = { str, side, labels: [], hot: false });
      const lb = labelOf(str, f, c);
      if (!e.labels.includes(lb)) e.labels.push(lb);
      e.hot ||= c.hot;
    }
  }
  const onCell = (string: number, fret: number, shift: boolean) =>
    (edit ? insertNote(string, fret, shift) : previewNote(string, fret));

  const dotStyle = (c: Cell, fret: number): JSX.CSSProperties | undefined => {
    const st: Record<string, string | number> = {};
    if (opts.colour && (c.soft || c.ghost) && c.hue !== null) st['--h'] = c.hue;
    if (!c.hot && c.soft && opts.motion) {
      // Focus on what's coming: notes about to play ramp up to solid, far-off ones are barely there,
      // and notes already played fade out. (The playing note itself is drawn solid by the .hot style.)
      const a = c.approach * c.approach; // ease-in: stays faint until it's actually close
      let scale = c.played ? 0.72 : 0.72 + 0.28 * a;
      let opacity = c.played ? 0.18 : 0.15 + 0.85 * a;
      if (c.played && c.ghost) { // finished here, and coming back next bar: a faint look-ahead hint
        scale = Math.max(scale, 0.55 + 0.25 * c.ghost);
        opacity = Math.max(opacity, 0.1 + 0.35 * c.ghost);
      }
      st.transform = `scale(${scale.toFixed(3)})`;
      st.opacity = opacity.toFixed(3);
    } else if (!c.hot && !c.soft && c.ghost) {
      st.transform = `scale(${(0.5 + 0.4 * c.ghost).toFixed(3)})`;
      // With Motion on, keep next-bar hints below the notes that are about to play in this bar.
      st.opacity = (0.12 + (opts.motion ? 0.35 : 0.55) * c.ghost).toFixed(3);
    }
    return Object.keys(st).length ? (st as JSX.CSSProperties) : undefined;
  };

  return (
    <div class="panel" style={{ '--fbz': lay.fbZoom } as JSX.CSSProperties}>
      {/* Only what's useful right now: where the next note goes while editing, and the scale while the guide is on. */}
      {(edit || g.on) && (
        <div class="row fb-info">
          {edit && (
            <span class="cursor-badge" title="Where the next fret click goes. Click a note in the tab or roll to insert in front of it.">
              Next note → bar {cBar}, {cBeatLabel}
            </span>
          )}
          {g.on && (
            <>
              <label class="muted">
                Root{' '}
                <select value={g.root === null ? 'auto' : String(g.root)}
                  onChange={e => { const v = e.currentTarget.value; setGuide({ root: v === 'auto' ? null : Number(v) }); e.currentTarget.blur(); }}>
                  <option value="auto">Auto ({PITCH_NAMES[guessRoot(s)]})</option>
                  {PITCH_NAMES.map((nm, i) => <option key={nm} value={String(i)}>{nm}</option>)}
                </select>
              </label>
              <label class="muted">
                Scale{' '}
                <select value={g.scale} onChange={e => { setGuide({ scale: e.currentTarget.value as ScaleId }); e.currentTarget.blur(); }}>
                  {(Object.keys(SCALE_NAMES) as ScaleId[]).map(id => <option key={id} value={id}>{SCALE_NAMES[id]}</option>)}
                </select>
              </label>
              <span class="scale-notes">
                {[...scale!].sort((a, b) => pc(a - root) - pc(b - root)).map(p => (
                  <span key={p} class={p === root ? 'sn root' : 'sn'} style={{ '--ic': intervalHue(p - root) } as JSX.CSSProperties}>
                    {PITCH_NAMES[p]}<small>{intervalName(p, root)}</small>
                  </span>
                ))}
              </span>
              <button class="mini" onClick={() => setGuide({ on: false })} title="Hide the scale guide">✕</button>
            </>
          )}
        </div>
      )}
      <div class="fb-wrap">
        <div class="fb-names">
          {TUNINGS[s.tuning].pitches.map((p, i) => <div key={i} style={{ height: ROW_H }}>{noteName(p)}</div>)}
        </div>
        <div class="fb-view">
        <div class="fb-scroll" ref={scrollRef} onScroll={e => setScrollX(e.currentTarget.scrollLeft)}>
          <div class="fb" style={{ width, height: ROW_H * STRINGS }}>
            <div class="fb-nut" style={{ left: OPEN_W - 6 }} />
            {Array.from({ length: MAX_FRET }, (_, i) => (
              <div key={i} class="fb-wire" style={{ left: OPEN_W + (i + 1) * FRET_W - 1 }} />
            ))}
            {SINGLE_DOTS.map(f => <div key={f} class="fb-marker" style={{ left: midX(f), top: ROW_H * 3 }} />)}
            {DOUBLE_DOTS.flatMap(f => [
              <div key={`${f}a`} class="fb-marker" style={{ left: midX(f), top: ROW_H * 2 }} />,
              <div key={`${f}b`} class="fb-marker" style={{ left: midX(f), top: ROW_H * 4 }} />,
            ])}
            {Array.from({ length: STRINGS }, (_, i) => (
              <div key={i} class="fb-string" style={{ top: i * ROW_H + ROW_H / 2, height: 1 + i * 0.5 }} />
            ))}
            {(opts.flow || opts.hand) && (
              <svg class={`fb-flow${opts.flowGrouping !== 'none' ? ' grouped' : ''}`} width={width} height={ROW_H * STRINGS} aria-hidden="true">
                {opts.hand && hand && (
                  <g>
                    <rect class="hand-box" x={hand.x} y={hand.y} width={hand.w} height={hand.h} rx={12} />
                  </g>
                )}
                {opts.flow && segs.map((sg, i) => (
                  <path key={i} d={sg.d} class={`flow-seg ${sg.state}${sg.link ? ' link' : ''}`}
                    style={{ stroke: opts.colour ? `hsl(${sg.hue} 75% 70%)` : '#f1ece0', opacity: segOpacity(sg) }} />
                ))}
                {opts.flow && comet && <circle class="flow-comet" cx={comet.x} cy={comet.y} r={6} />}
              </svg>
            )}
            {Array.from({ length: STRINGS }, (_, str) =>
              Array.from({ length: MAX_FRET + 1 }, (_, f) => {
                const c = cells.get(`${str}:${f}`);
                const pcCell = pc(pitchOf(s, { string: str, fret: f }));
                const inScale = !!scale && scale.has(pcCell);
                const cls = (c
                  ? `${c.hot ? ' hot' : c.soft ? ' soft' : c.ghost ? ' ghost' : ''}${c.next && !c.hot ? ' next' : ''}` +
                    `${c.atCursor ? ' at-cursor' : ''}${opts.colour ? ' tint' : ''}${strictScale && !inScale ? ' out' : ''}`
                  : `${inScale ? ' scale' : ''}`) + `${scale && pcCell === root ? ' root' : ''}`;
                // Riff dots follow the label mode; empty scale tones show their interval (or note name).
                const riffLabel = c ? labelOf(str, f, c) : '';
                const emptyLabel = scale && g.labels !== 'note' ? intervalName(pcCell, root) : PITCH_NAMES[pcCell];
                return (
                  <div key={`${str}:${f}`} class={`fb-cell${cls}`}
                    style={{ left: cellX(f), top: str * ROW_H, width: cellW(f), height: ROW_H }}
                    title={edit ? 'Click to add · Shift-click to stack on the previous note (chord)' : undefined}
                    onPointerDown={e => { e.preventDefault(); onCell(str, f, e.shiftKey); }}>
                    <span class="fb-dot" style={c ? dotStyle(c, f) : inScale ? ({ '--ic': intervalHue(pcCell - root) } as JSX.CSSProperties) : undefined}>
                      {c ? riffLabel : emptyLabel}
                    </span>
                  </div>
                );
              }),
            )}
          </div>
          <div class="fb-nums" style={{ width }}>
            {Array.from({ length: MAX_FRET + 1 }, (_, f) => (
              <span key={f} class={SINGLE_DOTS.includes(f) || DOUBLE_DOTS.includes(f) ? 'mk' : ''}
                style={{ left: f === 0 ? OPEN_W / 2 : midX(f) }}>{f}</span>
            ))}
          </div>
        </div>
        {edges.map(e => (
          <div key={`${e.str}${e.side}`} class={`fb-edge ${e.side}${e.hot ? ' hot' : ''}`} style={{ top: e.str * ROW_H + ROW_H / 2 }}>
            {e.side === 'left' ? `← ${e.labels.join(' ')}` : `${e.labels.join(' ')} →`}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
