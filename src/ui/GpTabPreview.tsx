// The whole track of a Guitar Pro file drawn as tab, for picking the bars to import.
// Each bar is drawn exactly as it would import (fitted tuning, rounded rhythm, its own time signature).
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Song, barTicks, beatTicks } from '../model/song';
import { GpScore, extractSection, sections } from '../import/gpScore';
import { GAP, PAD, STAFF_H, drawBar } from './tabDraw';

const LEFT = 30;         // room for "TAB"
const TOP = 30;          // staff top within a row (labels sit above)
const ROW_H = TOP + STAFF_H + 56;
const MIN_W = 130;       // narrowest bar
const PER_EVENT = 22;    // extra width per note position, so busy bars get room

type Placed = { i: number; x0: number; w: number; y: number; song: Song };

export function GpTabPreview({ score, track, range, onPick }: {
  score: GpScore; track: number; range: { first: number; last: number };
  onPick: (bar: number, extend: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const dragging = useRef(false);

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    const up = () => { dragging.current = false; };
    window.addEventListener('pointerup', up);
    return () => { ro.disconnect(); window.removeEventListener('pointerup', up); };
  }, []);

  // Every bar as its own little riff.
  const bars = useMemo(() => score.bars.map((_, i) => extractSection(score, track, i, i).song), [score, track]);

  // Flow bars into lines like printed tab, then stretch each full line to the width.
  const placed = useMemo(() => {
    const avail = Math.max(MIN_W, w - LEFT - 4);
    const natural = bars.map(s => Math.min(avail, Math.max(MIN_W, 2 * PAD + PER_EVENT * new Set(s.notes.map(n => n.start)).size)));
    const out: Placed[] = [];
    let line: number[] = [];
    let used = 0;
    const flush = (last: boolean) => {
      const scale = last && used < avail * 0.75 ? 1 : avail / used;
      let x = LEFT;
      const y = (out.length ? out[out.length - 1].y - TOP + ROW_H : 0) + TOP;
      for (const i of line) { const bw = natural[i] * scale; out.push({ i, x0: x, w: bw, y, song: bars[i] }); x += bw; }
      line = []; used = 0;
    };
    natural.forEach((nw, i) => {
      if (line.length && used + nw > avail) flush(false);
      line.push(i); used += nw;
    });
    if (line.length) flush(true);
    return out;
  }, [bars, w]);

  const secAt = useMemo(() => new Map(sections(score).map(s => [s.first, s.name])), [score]);

  // Keep the start of the selection in view when it's changed from outside (section chips, bar inputs).
  useEffect(() => {
    const box = ref.current, el = box?.querySelector(`[data-bar="${range.first}"]`);
    if (!box || !el) return;
    const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.top < b.top || r.top > b.bottom - 60) box.scrollTop += r.top - b.top - 4; // off-screen: bring it to the top
  }, [range.first, track, placed]);

  const els: JSX.Element[] = [];
  const rows = new Map<number, Placed[]>();
  for (const p of placed) rows.set(p.y, [...(rows.get(p.y) ?? []), p]);
  for (const [y, row] of rows) {
    const x1 = row[row.length - 1].x0 + row[row.length - 1].w;
    for (let s = 0; s < 6; s++) els.push(<line key={`s${y}-${s}`} class="tv-staff" x1={6} x2={x1} y1={y + s * GAP} y2={y + s * GAP} />);
    ['T', 'A', 'B'].forEach((ch, k) => els.push(<text key={`t${y}${ch}`} class="tv-tab" x={16} y={y + 16 + k * 16}>{ch}</text>));
    els.push(<line key={`b${y}-0`} class="tv-bar" x1={row[0].x0} x2={row[0].x0} y1={y} y2={y + STAFF_H} />);
  }
  placed.forEach(p => {
    const { i, x0, w: bw, y, song: s } = p;
    const gb = score.bars[i], prev = score.bars[i - 1];
    const on = i >= range.first && i <= range.last;
    if (on) els.push(<rect key={`sel${i}`} class="gp-tab-sel" x={x0} y={y - 22} width={bw} height={STAFF_H + 70} />);
    els.push(<line key={`bl${i}`} class="tv-bar" x1={x0 + bw} x2={x0 + bw} y1={y} y2={y + STAFF_H} />);
    const tags = [
      String(i + 1),
      !prev || prev.num !== gb.num || prev.den !== gb.den ? `${gb.num}/${gb.den}` : '',
      !prev || Math.round(prev.tempo) !== Math.round(gb.tempo) ? `♩=${Math.round(gb.tempo)}` : '',
    ].filter(Boolean).join('  ');
    els.push(<text key={`n${i}`} class="tv-label" x={x0 + 3} y={y - 8}>{tags}</text>);
    if (secAt.has(i)) els.push(<text key={`sec${i}`} class="gp-tab-sec" x={x0 + 3} y={y - 20}>{secAt.get(i)}</text>);
    els.push(...drawBar({ notes: s.notes, start: 0, len: barTicks(s.timeSig), beat: beatTicks(s.timeSig), x0, w: bw, y, key: `g${i}` }));
    // Hit area for picking (drawn last so it's on top).
    els.push(<rect key={`hit${i}`} data-bar={i} class="gp-tab-hit" x={x0} y={y - 26} width={bw} height={ROW_H} />);
  });
  const height = placed.length ? placed[placed.length - 1].y - TOP + ROW_H : ROW_H;

  const barAt = (e: PointerEvent) => {
    // The target on a click; under the pointer while dragging (the target stays where the drag began).
    const el = (e.type === 'pointerdown' ? (e.target as Element) : document.elementFromPoint(e.clientX, e.clientY))?.closest('[data-bar]');
    return el ? Number(el.getAttribute('data-bar')) : null;
  };
  return (
    <div class="gp-tab" ref={ref}>
      <svg width={w} height={height}
        onPointerDown={e => { const i = barAt(e); if (i === null) return; e.preventDefault(); dragging.current = true; onPick(i, e.shiftKey); }}
        onPointerMove={e => { if (!dragging.current) return; const i = barAt(e); if (i !== null) onPick(i, true); }}>
        {els}
      </svg>
    </div>
  );
}
