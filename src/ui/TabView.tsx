import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { barTicks, beatTicks, songEndTick } from '../model/song';
import { DisplayEvent, RhythmValue, layoutBar } from '../notation/rhythm';
import { cursor, editMode, grid, hotIds, loop, loopOn, placeCursor, playhead, playing, seek, selection, song } from '../state/store';

const LEFT = 36;      // room for the "TAB" label
const PAD = 12;       // inner padding per bar
const GAP = 12;       // px between staff lines
const TOP = 22;       // staff top within a row
const STAFF_H = GAP * 5;
const STEM_Y = 8;     // stems start this far below the staff
const STEM_LEN = 24;
const ROW_H = TOP + STAFF_H + 58;
const MIN_BAR_W = 260;
const REST_GLYPH = ['\u{1D13D}', '\u{1D13E}', '\u{1D13F}', '\u{1D140}']; // quarter, 8th, 16th, 32nd

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
    const { events, rests } = layoutBar(s.notes, b * bar, bar, beat);
    const stemTop = y + STAFF_H + STEM_Y;
    const stemBottom = (v: RhythmValue) => stemTop + (v.stem === 'half' ? STEM_LEN / 2 : STEM_LEN);

    for (const ev of events) {
      const x = xIn(b, ev.start);
      for (const id of ev.noteIds) {
        const n = s.notes.find(nn => nn.id === id)!;
        const cls = `tv-fret${hot.has(id) ? ' hot' : ''}${sel.has(id) ? ' sel' : ''}`;
        els.push(<text key={`f${id}`} data-start={n.start} class={cls} x={x} y={y + n.string * GAP}>{n.fret}</text>);
      }
      if (ev.value.stem !== 'none') els.push(<line key={`st${b}-${ev.start}`} class="tv-stem" x1={x} x2={x} y1={stemTop} y2={stemBottom(ev.value)} />);
      if (ev.value.dotted) els.push(<circle key={`d${b}-${ev.start}`} class="tv-dot" cx={x + 5} cy={stemBottom(ev.value) - 3} r={1.6} />);
      if (ev.value.triplet && ev.beam === null) els.push(<text key={`tr${b}-${ev.start}`} class="tv-tuplet" x={x} y={stemBottom(ev.value) + 13}>3</text>);
      if (ev.beam === null) {
        for (let k = 0; k < ev.value.flags; k++) {
          const fy = stemBottom(ev.value) - k * 5;
          els.push(<line key={`fl${b}-${ev.start}-${k}`} class="tv-stem" x1={x} x2={x + 7} y1={fy} y2={fy - 6} />);
        }
      }
    }

    // Beams: level 1 spans the group; deeper levels join neighbours that share them, else a stub.
    const groups = new Map<number, DisplayEvent[]>();
    for (const ev of events) if (ev.beam !== null) groups.set(ev.beam, [...(groups.get(ev.beam) ?? []), ev]);
    for (const [gid, g] of groups) {
      const by = stemTop + STEM_LEN;
      els.push(<line key={`bm${b}-${gid}`} class="tv-beam" x1={xIn(b, g[0].start)} x2={xIn(b, g[g.length - 1].start)} y1={by} y2={by} />);
      if (g.every(ev => ev.value.triplet)) { // one "3" bracket per triplet group, like printed music
        const xa = xIn(b, g[0].start), xb = xIn(b, g[g.length - 1].start), xm = (xa + xb) / 2;
        els.push(<path key={`tb${b}-${gid}`} class="tv-bracket" d={`M${xa} ${by + 6} v4 H${xm - 6} M${xm + 6} ${by + 10} H${xb} v-4`} />);
        els.push(<text key={`tt${b}-${gid}`} class="tv-tuplet" x={xm} y={by + 14}>3</text>);
      }
      for (let level = 2; level <= 3; level++) {
        const ly = by - (level - 1) * 5;
        g.forEach((ev, i) => {
          if (ev.value.flags < level) return;
          const x = xIn(b, ev.start);
          const next = g[i + 1];
          const prev = g[i - 1];
          if (next && next.value.flags >= level) {
            els.push(<line key={`bl${b}-${ev.start}-${level}`} class="tv-beam" x1={x} x2={xIn(b, next.start)} y1={ly} y2={ly} />);
          } else if (!(prev && prev.value.flags >= level)) {
            const dir = next ? 1 : -1;
            els.push(<line key={`bs${b}-${ev.start}-${level}`} class="tv-beam" x1={x} x2={x + dir * 7} y1={ly} y2={ly} />);
          }
        });
      }
    }

    for (const r of rests) {
      const x = xIn(b, r.start) + 4;
      const ry = y + STAFF_H + 24;
      if (r.value.ticks >= 48) {
        els.push(<rect key={`r${b}-${r.start}`} class="tv-restbar" x={x - 5} y={ry - (r.value.ticks >= 96 ? 8 : 4)} width={10} height={4} />);
      } else {
        els.push(<text key={`r${b}-${r.start}`} class="tv-rest" x={x} y={ry}>{REST_GLYPH[Math.min(r.value.flags, 3)]}</text>);
      }
    }
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
