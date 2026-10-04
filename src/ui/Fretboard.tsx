import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { MAX_FRET, Note, STRINGS, TUNINGS, barTicks, beatTicks, noteName, notesInRange, pitchOf } from '../model/song';
import {
  cursor, cursorIds, editMode, fretMode, guide, guideRoot, guideScale, hotIds, insertNote, nextIds, playhead, playing, previewNote,
  setGuide, softIds, softSource,
  setView, song, toggleView, undo, view,
} from '../state/store';
import { intervalHue, noteHue } from './colors';
import { PITCH_NAMES, SCALE_NAMES, ScaleId, guessRoot, intervalName, pc } from '../model/theory';

const ROW_H = 52;
const OPEN_W = 52;
const FRET_W = 64;
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
};

export function Fretboard() {
  // Close the Display menu on any click outside it.
  const optsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      const el = optsRef.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
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
  const next = playing.value || !edit ? nextIds.value : new Set<number>();
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
      c = { hot: false, soft: false, next: false, atCursor: false, ghost: 0, approach: 0, played: true, hue: null };
      cells.set(k, c);
    }
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

  const barNo = Math.floor(t / bar) + 1;
  const label = { bar: `Bar ${barNo}`, selection: 'Selection', loop: 'Loop', live: 'Live' }[src];
  const cBar = Math.floor(cursor.value / bar) + 1;
  const cBeat = (cursor.value % bar) / beat + 1;
  const cBeatLabel = Number.isInteger(cBeat) ? `beat ${cBeat}` : `beat ${Math.floor(cBeat)}+`;
  const width = OPEN_W + MAX_FRET * FRET_W;
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
    <div class="panel">
      <div class="row" style={{ marginBottom: 8 }}>
        <strong>Fretboard</strong>
        <span class="muted">{label}</span>
        {edit && (
          <span class="cursor-badge" title="Where the next fret click goes. Click a note in the tab or roll to insert in front of it.">
            Next note → bar {cBar}, {cBeatLabel}
          </span>
        )}
        {edit && <button class="mini" onClick={undo} title="Undo (Ctrl+Z). Backspace removes the note you just entered.">↶ Undo</button>}
        <span class="spacer" />
        <span class="legend muted">
          <i class="lg hot" /> playing <i class="lg next" /> next
        </span>
        <details class="opts" ref={optsRef}>
          <summary title="Display options (saved in this browser)">⚙ Display</summary>
          <div class="opts-pop">
            <label><input type="checkbox" checked={opts.lookAhead} onChange={() => toggleView('lookAhead')} />
              <span><b>Look-ahead</b> fade in the next bar's notes as the bar runs out</span></label>
            <label><input type="checkbox" checked={opts.motion} onChange={() => toggleView('motion')} />
              <span><b>Motion</b> upcoming notes grow in, far-off and played notes fade</span></label>
            <label><input type="checkbox" checked={opts.colour} onChange={() => toggleView('colour')} />
              <span><b>Colour by position</b> same colours on the neck and the timeline</span></label>
            <div class={`opts-sub${opts.colour ? '' : ' off'}`}>
              <span class="muted">Colour range</span>
              <span class="seg small" role="group" aria-label="Colour range">
                {([['riff', 'Riff'], ['bar', 'Per bar'], ['neck', 'Whole neck']] as const).map(([k, label]) => (
                  <button key={k} class={opts.colourRange === k ? 'on' : ''} onClick={() => setView({ colourRange: k })}
                    title={k === 'riff' ? "Lowest to highest fret in the whole riff" : k === 'bar' ? "Each bar's own lowest to highest fret" : 'Frets 0-14 of the neck'}>
                    {label}
                  </button>
                ))}
              </span>
            </div>
          </div>
        </details>
        <span class="seg small" role="group" aria-label="Fretboard mode">
          <button class={fretMode.value === 'live' ? 'on' : ''} onClick={() => { fretMode.value = 'live'; }}>Live</button>
          <button class={fretMode.value === 'bar' ? 'on' : ''} onClick={() => { fretMode.value = 'bar'; }}>Bar / selection</button>
        </span>
      </div>
      <div class="row guide-row">
        <button class={`chip${g.on ? ' on' : ''}`} onClick={() => setGuide({ on: !g.on })}
          title="Show a scale on the neck with interval labels, and flag riff notes outside it">Scale guide</button>
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
          </>
        )}
        <span class="spacer" />
        <span class="muted">Labels</span>
        <span class="seg small" role="group" aria-label="Note labels">
          {(['fret', 'note', 'interval'] as const).map(m => (
            <button key={m} class={g.labels === m ? 'on' : ''} onClick={() => setGuide({ labels: m })}>
              {m === 'fret' ? 'Fret' : m === 'note' ? 'Note' : 'Interval'}
            </button>
          ))}
        </span>
      </div>
      <div class="fb-wrap">
        <div class="fb-names">
          {TUNINGS[s.tuning].pitches.map((p, i) => <div key={i} style={{ height: ROW_H }}>{noteName(p)}</div>)}
        </div>
        <div class="fb-scroll">
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
                const riffLabel = g.labels === 'note' ? PITCH_NAMES[pcCell] : g.labels === 'interval' ? intervalName(pcCell, root) : String(f);
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
      </div>
    </div>
  );
}
