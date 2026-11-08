// A plain fretboard for the Learn and Speed sections: draws whatever marks it's given, dims everything outside a
// region, outlines shapes, and reports taps. (The Play fretboard is tied to the riff; this one isn't.)
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Pos, Region, STRING_NAMES, posKey } from '../learn/fretmap';

export type NeckMark = { label: string; cls: string; style?: JSX.CSSProperties };

const ROW_H = 44;
const OPEN_W = 44;
const MIN_FRET_W = 40;
const SINGLE_DOTS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_DOTS = [12, 24];

export function Neck({ marks, region, view, onTap, shapes, focus, glide }: {
  marks: Map<string, NeckMark>;
  region?: Region | null;
  view: { lo: number; hi: number };
  onTap?: (p: Pos) => void;
  shapes?: Pos[][];
  focus?: { lo: number; hi: number } | null; // frets to keep in view (default: the region)
  glide?: boolean;                           // scroll smoothly (following playback)
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setAvail(el.clientWidth);
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = view.hi; // frets drawn: 0 (open) .. view.hi
  const fw = Math.max(MIN_FRET_W, avail ? (avail - OPEN_W - 2) / n : 56);
  const cellX = (f: number) => (f === 0 ? 0 : OPEN_W + (f - 1) * fw);
  const cellW = (f: number) => (f === 0 ? OPEN_W : fw);
  const midX = (f: number) => (f === 0 ? OPEN_W / 2 : OPEN_W + (f - 0.5) * fw);
  const width = OPEN_W + n * fw;
  const height = ROW_H * 6;

  // Narrow screens: the neck scrolls; keep the region (or the playing note) in view.
  const focusLo = focus?.lo ?? region?.lo ?? 0, focusHi = focus?.hi ?? region?.hi ?? 0;
  useEffect(() => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const left = cellX(focusLo) - 10, right = cellX(focusHi) + cellW(focusHi) + 10;
    if (left >= el.scrollLeft && right <= el.scrollLeft + el.clientWidth) return;
    const target = right - left > el.clientWidth ? left : (left + right) / 2 - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: glide ? 'smooth' : 'auto' });
  }, [focusLo, focusHi, fw]);

  // Shade what's outside the region so the eye goes to the part that matters.
  const shades: JSX.Element[] = [];
  if (region) {
    const x0 = cellX(region.lo), x1 = cellX(region.hi) + cellW(region.hi);
    if (x0 > 0) shades.push(<div key="l" class="nk-shade" style={{ left: 0, top: 0, width: x0, height }} />);
    if (x1 < width) shades.push(<div key="r" class="nk-shade" style={{ left: x1, top: 0, width: width - x1, height }} />);
    for (let s = 0; s < 6; s++) {
      if (!region.strings.includes(s)) shades.push(<div key={`s${s}`} class="nk-shade" style={{ left: x0, top: s * ROW_H, width: x1 - x0, height: ROW_H }} />);
    }
    const sLo = Math.min(...region.strings), sHi = Math.max(...region.strings);
    shades.push(<div key="box" class="nk-region" style={{ left: x0, top: sLo * ROW_H, width: x1 - x0, height: (sHi - sLo + 1) * ROW_H }} />);
  }

  return (
    <div class="nk-wrap">
      <div class="fb-names">
        {STRING_NAMES.map((nm, i) => <div key={i} style={{ height: ROW_H }}>{nm}</div>)}
      </div>
      <div class="fb-scroll" ref={ref}>
        <div class="fb nk" style={{ width, height }}>
          <div class="fb-nut" style={{ left: OPEN_W - 6 }} />
          {Array.from({ length: n }, (_, i) => <div key={i} class="fb-wire" style={{ left: OPEN_W + (i + 1) * fw - 1 }} />)}
          {SINGLE_DOTS.filter(f => f <= n).map(f => <div key={f} class="fb-marker" style={{ left: midX(f), top: ROW_H * 3 }} />)}
          {DOUBLE_DOTS.filter(f => f <= n).flatMap(f => [
            <div key={`${f}a`} class="fb-marker" style={{ left: midX(f), top: ROW_H * 2 }} />,
            <div key={`${f}b`} class="fb-marker" style={{ left: midX(f), top: ROW_H * 4 }} />,
          ])}
          {Array.from({ length: 6 }, (_, i) => <div key={i} class="fb-string" style={{ top: i * ROW_H + ROW_H / 2, height: 1 + i * 0.5 }} />)}
          {shades}
          {shapes && shapes.length > 0 && (
            <svg class="nk-shapes" width={width} height={height} aria-hidden="true">
              {shapes.map((sh, i) => (
                <polyline key={i} points={sh.map(p => `${midX(p.fret)},${p.string * ROW_H + ROW_H / 2}`).join(' ')} />
              ))}
            </svg>
          )}
          {Array.from({ length: 6 }, (_, s) =>
            Array.from({ length: n + 1 }, (_, f) => {
              const m = marks.get(posKey({ string: s, fret: f }));
              return (
                <div key={`${s}:${f}`} class={`fb-cell${m ? ` ${m.cls}` : ''}${onTap ? '' : ' still'}`}
                  style={{ left: cellX(f), top: s * ROW_H, width: cellW(f), height: ROW_H }}
                  onPointerDown={onTap ? e => { if (e.button === 0) { e.preventDefault(); onTap({ string: s, fret: f }); } } : undefined}>
                  <span class="fb-dot" style={m?.style}>{m?.label ?? ''}</span>
                </div>
              );
            }),
          )}
        </div>
        <div class="fb-nums" style={{ width }}>
          {Array.from({ length: n + 1 }, (_, f) => (
            <span key={f} class={SINGLE_DOTS.includes(f) || DOUBLE_DOTS.includes(f) ? 'mk' : ''} style={{ left: midX(f) }}>{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
