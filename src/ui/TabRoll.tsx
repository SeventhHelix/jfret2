import { useEffect, useRef, useState } from 'preact/hooks';
import { STRINGS, Song, TUNINGS, barTicks, beatTicks, noteName, songEndTick } from '../model/song';
import { moveNotes, resizeNotes } from '../model/ops';
import { commitFrom, cursor, grid, hotIds, loop, loopOn, placeCursor, playhead, playing, selection, song } from '../state/store';

const PX = 4;    // pixels per tick (quarter note = 96 px)
const LANE = 30; // px per string lane

type Drag =
  | { kind: 'move' | 'resize'; x0: number; y0: number; orig: Song; ids: Set<number>; noteStart: number }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; additive: boolean };

type Rect = { x0: number; y0: number; x1: number; y1: number };

export function TabRoll() {
  const s = song.value;
  const sel = selection.value;
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);

  const bar = barTicks(s.timeSig);
  const beat = beatTicks(s.timeSig);
  const bars = Math.max(8, Math.ceil(songEndTick(s) / bar) + 4);
  const width = bars * bar * PX;

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing.value) return;
    const x = playhead.value * PX;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - 40;
  }, [playhead.value]);

  const local = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = local(e);
    const blk = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
    if (!blk) {
      drag.current = { kind: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive: e.shiftKey || e.ctrlKey || e.metaKey };
      return;
    }
    const id = Number(blk.dataset.id);
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id); else next.add(id);
      selection.value = next;
      drag.current = null;
      return;
    }
    let ids = sel;
    if (!sel.has(id)) {
      ids = new Set([id]);
      selection.value = ids;
    }
    const resize = (() => { const r = blk.getBoundingClientRect(); return e.clientX > r.right - Math.min(8, r.width / 3); })();
    const noteStart = song.value.notes.find(n => n.id === id)?.start ?? 0;
    drag.current = { kind: resize ? 'resize' : 'move', x0: p.x, y0: p.y, orig: song.value, ids, noteStart };
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = local(e);
    if (d.kind === 'marquee') {
      d.x1 = p.x;
      d.y1 = p.y;
      setMarquee({ x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1 });
      return;
    }
    const raw = (p.x - d.x0) / PX;
    const dt = e.altKey ? Math.round(raw) : Math.round(raw / grid.value) * grid.value;
    const ds = d.kind === 'move' ? Math.round((p.y - d.y0) / LANE) : 0;
    if (dt === 0 && ds === 0) { song.value = d.orig; return; }
    if (d.kind === 'move') song.value = moveNotes(d.orig, d.ids, dt, ds);
    else song.value = resizeNotes(d.orig, d.ids, dt);
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind !== 'marquee') {
      if (song.value === d.orig) placeCursor(d.noteStart); // plain click on a note: insert in front of it next
      else commitFrom(d.orig);
      return;
    }
    setMarquee(null);
    if (Math.abs(d.x1 - d.x0) + Math.abs(d.y1 - d.y0) <= 4) {
      const t = Math.max(0, Math.round(d.x0 / PX / grid.value) * grid.value);
      placeCursor(t);
      if (!d.additive) selection.value = new Set();
      return;
    }
    const xa = Math.min(d.x0, d.x1) / PX, xb = Math.max(d.x0, d.x1) / PX;
    const ya = Math.min(d.y0, d.y1), yb = Math.max(d.y0, d.y1);
    const hit = song.value.notes
      .filter(n => n.start < xb && n.start + n.dur > xa && (n.string + 1) * LANE > ya && n.string * LANE < yb)
      .map(n => n.id);
    selection.value = new Set([...(d.additive ? selection.value : []), ...hit]);
  };

  const gridBg = [
    `repeating-linear-gradient(90deg, var(--line-strong) 0 1px, transparent 1px ${bar * PX}px)`,
    `repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px ${beat * PX}px)`,
    `repeating-linear-gradient(90deg, #ffffff0d 0 1px, transparent 1px ${grid.value * PX}px)`,
  ].join(', ');
  const lp = loopOn.value ? loop.value : null;
  const hot = hotIds.value;

  return (
    <div class="panel">
      <div class="roll-wrap">
        <div class="roll-names">
          {TUNINGS[s.tuning].pitches.map((p, i) => <div key={i} style={{ height: LANE }}>{noteName(p)}</div>)}
        </div>
        <div class="roll-scroll" ref={scrollRef}>
          <div class="roll" style={{ width, height: LANE * STRINGS, backgroundImage: gridBg }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            {Array.from({ length: STRINGS }, (_, i) => <div key={i} class="roll-lane" style={{ top: i * LANE + LANE / 2 }} />)}
            {lp && <div class="roll-loop" style={{ left: lp.start * PX, width: (lp.end - lp.start) * PX }} />}
            {s.notes.map(n => (
              <div key={n.id} data-id={n.id}
                class={`roll-note${sel.has(n.id) ? ' sel' : ''}${playing.value && hot.has(n.id) ? ' hot' : ''}`}
                style={{ left: n.start * PX, top: n.string * LANE + 3, width: Math.max(6, n.dur * PX - 1), height: LANE - 6 }}>
                {n.fret}
              </div>
            ))}
            <div class="roll-cursor" style={{ left: cursor.value * PX }} />
            <div class="roll-playhead" style={{ left: playhead.value * PX }} />
            {marquee && (
              <div class="roll-marquee" style={{
                left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0),
              }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
