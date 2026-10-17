import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { barTicks, beatTicks, songEndTick } from '../model/song';
import { GAP, PAD, STAFF_H, drawBar } from './tabDraw';
import { cursor, editMode, grid, hotIds, loop, loopOn, placeCursor, playhead, playing, seek, selection, song } from '../state/store';

const LEFT = 36;      // room for the "TAB" label
const TOP = 22;       // staff top within a row
const ROW_H = TOP + STAFF_H + 58;
const MIN_BAR_W = 260;

export function TabView() {
  const s = song.value;
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const [dragLoop, setDragLoop] = useState<{ a: number; b: number } | null>(null);
  const down = useRef<{ x: number; y: number; tick: number; noteStart: number | null } | null>(null);

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([entry]) => setW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bar = barTicks(s.timeSig);
  const beat = beatTicks(s.timeSig);
  // In edit mode, leave room for the insert cursor so it can sit at the start of a fresh bar.
  const nBars = Math.max(1, Math.ceil(songEndTick(s) / bar), editMode.value ? Math.floor(cursor.value / bar) + 1 : 0);
  const perLine = Math.max(1, Math.floor((w - LEFT) / MIN_BAR_W));
  const barW = (w - LEFT) / perLine;
  const lines = Math.ceil(nBars / perLine);
  const height = lines * ROW_H + 8;

  const barLeft = (b: number) => LEFT + (b % perLine) * barW;
  const rowTop = (b: number) => Math.floor(b / perLine) * ROW_H + TOP;
  const xIn = (b: number, tick: number) => barLeft(b) + PAD + ((tick - b * bar) / bar) * (barW - 2 * PAD);
  const barOf = (tick: number) => Math.min(Math.max(0, Math.floor(tick / bar)), nBars - 1);
  const xAt = (tick: number) => xIn(barOf(tick), Math.min(tick, nBars * bar));

  const tickAt = (x: number, y: number) => {
    const line = Math.min(Math.max(0, Math.floor(y / ROW_H)), lines - 1);
    const col = Math.min(Math.max(0, Math.floor((x - LEFT) / barW)), perLine - 1);
    const b = Math.min(line * perLine + col, nBars - 1);
    const frac = Math.min(Math.max(0, (x - barLeft(b) - PAD) / (barW - 2 * PAD)), 1);
    return b * bar + frac * bar;
  };
  const snap = (t: number) => Math.round(t / grid.value) * grid.value;
  const local = (e: PointerEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    const p = local(e);
    const fret = (e.target as Element).closest('[data-start]');
    down.current = { ...p, tick: tickAt(p.x, p.y), noteStart: fret ? Number(fret.getAttribute('data-start')) : null };
  };
  const onMove = (e: PointerEvent) => {
    const d = down.current;
    if (!d) return;
    const p = local(e);
    if (Math.abs(p.x - d.x) + Math.abs(p.y - d.y) > 6) setDragLoop({ a: d.tick, b: tickAt(p.x, p.y) });
  };
  const onUp = () => {
    const d = down.current;
    down.current = null;
    if (!d) return;
    if (dragLoop) {
      const start = snap(Math.min(dragLoop.a, dragLoop.b));
      const end = snap(Math.max(dragLoop.a, dragLoop.b));
      setDragLoop(null);
      if (end > start) { loop.value = { start, end }; loopOn.value = true; }
      return;
    }
    const t = d.noteStart ?? snap(d.tick);
    if (editMode.value) placeCursor(t); // cursor goes AT the clicked note, so the next fret click lands in front of it
    seek(t);
  };

  // Shade a tick range, split across bars/lines.
  const shade = (start: number, end: number, cls: string) => {
    const out: JSX.Element[] = [];
    for (let b = Math.floor(start / bar); b * bar < end && b < nBars; b++) {
      const x0 = xIn(b, Math.max(start, b * bar));
      const x1 = xIn(b, Math.min(end, (b + 1) * bar));
      out.push(<rect key={`${cls}${b}`} class={cls} x={x0} y={rowTop(b) - 6} width={Math.max(0, x1 - x0)} height={STAFF_H + 12} />);
    }
    return out;
  };

  const els: JSX.Element[] = [];
  const hot = hotIds.value;
  const sel = selection.value;

  for (let line = 0; line < lines; line++) {
    const y = line * ROW_H + TOP;
    const barsHere = Math.min(perLine, nBars - line * perLine);
    const x1 = LEFT + barsHere * barW;
    for (let i = 0; i < 6; i++) els.push(<line key={`s${line}-${i}`} class="tv-staff" x1={8} x2={x1} y1={y + i * GAP} y2={y + i * GAP} />);
    ['T', 'A', 'B'].forEach((ch, i) => els.push(<text key={`t${line}${ch}`} class="tv-tab" x={20} y={y + 16 + i * 16}>{ch}</text>));
    for (let c = 0; c <= barsHere; c++) {
      const bx = LEFT + c * barW;
      els.push(<line key={`b${line}-${c}`} class="tv-bar" x1={bx} x2={bx} y1={y} y2={y + STAFF_H} />);
    }
  }

  for (let b = 0; b < nBars; b++) {
    const y = rowTop(b);
    els.push(<text key={`n${b}`} class="tv-label" x={barLeft(b) + 3} y={y - 8}>{b === 0 ? `${s.timeSig.join('/')}  1` : b + 1}</text>);
    els.push(...drawBar({
      notes: s.notes, start: b * bar, len: bar, beat, x0: barLeft(b), w: barW, y, key: String(b),
      fretClass: n => `${hot.has(n.id) ? ' hot' : ''}${sel.has(n.id) ? ' sel' : ''}`,
    }));
  }

  const lp = loopOn.value ? loop.value : null;
  const showHead = playing.value || playhead.value > 0;
  const hb = barOf(playhead.value);

  return (
    <div class="panel tv" ref={ref}>
      {!s.notes.length ? (
        <div class="tv-empty">
          {editMode.value
            ? 'Click any fret on the neck below to start sketching. Pick the note length under the neck (quarter by default); fix the rhythm afterwards.'
            : 'This riff is empty. Switch to Edit to start one.'}
        </div>
      ) : (
      <svg width={w} height={height} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {lp && shade(lp.start, lp.end, 'tv-loop')}
        {dragLoop && shade(Math.min(dragLoop.a, dragLoop.b), Math.max(dragLoop.a, dragLoop.b), 'tv-loop preview')}
        {els}
        {editMode.value && (() => {
          const cb = barOf(cursor.value);
          return <line class="tv-cursor" x1={xAt(cursor.value) - 7} x2={xAt(cursor.value) - 7} y1={rowTop(cb) - 10} y2={rowTop(cb) + STAFF_H + 10} />;
        })()}
        {showHead && (
          <line class="tv-playhead" x1={xAt(playhead.value)} x2={xAt(playhead.value)} y1={rowTop(hb) - 8} y2={rowTop(hb) + STAFF_H + 8} />
        )}
      </svg>
      )}
    </div>
  );
}
