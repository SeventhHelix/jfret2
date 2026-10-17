// Drawing one bar of tab (frets, stems, beams, triplet brackets, rests) as SVG elements.
// Shared by the main TabView and the Guitar Pro import preview.
import type { JSX } from 'preact';
import { Note } from '../model/song';
import { DisplayEvent, RhythmValue, layoutBar } from '../notation/rhythm';

export const PAD = 12;       // inner padding per bar
export const GAP = 12;       // px between staff lines
export const STAFF_H = GAP * 5;
const STEM_Y = 8;            // stems start this far below the staff
const STEM_LEN = 24;
const REST_GLYPH = ['\u{1D13D}', '\u{1D13E}', '\u{1D13F}', '\u{1D140}']; // quarter, 8th, 16th, 32nd

export type BarDraw = {
  notes: Note[];   // the song's notes (only those inside the bar are drawn)
  start: number;   // bar start tick
  len: number;     // bar length in ticks
  beat: number;    // beat length in ticks
  x0: number;      // bar left edge
  w: number;       // bar width
  y: number;       // staff top (high e line)
  key: string;     // unique per bar
  fretClass?: (n: Note) => string;
};

/** x of a tick inside the bar. */
export const xInBar = (d: Pick<BarDraw, 'start' | 'len' | 'x0' | 'w'>, tick: number) => d.x0 + PAD + ((tick - d.start) / d.len) * (d.w - 2 * PAD);

export function drawBar(d: BarDraw): JSX.Element[] {
  const els: JSX.Element[] = [];
  const { y, key: b } = d;
  const xIn = (t: number) => xInBar(d, t);
  const { events, rests } = layoutBar(d.notes, d.start, d.len, d.beat);
  const byId = new Map(d.notes.map(n => [n.id, n]));
  const stemTop = y + STAFF_H + STEM_Y;
  const stemBottom = (v: RhythmValue) => stemTop + (v.stem === 'half' ? STEM_LEN / 2 : STEM_LEN);

  for (const ev of events) {
    const x = xIn(ev.start);
    for (const id of ev.noteIds) {
      const n = byId.get(id)!;
      els.push(<text key={`f${id}`} data-start={n.start} class={`tv-fret${d.fretClass ? d.fretClass(n) : ''}`} x={x} y={y + n.string * GAP}>{n.fret}</text>);
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
    els.push(<line key={`bm${b}-${gid}`} class="tv-beam" x1={xIn(g[0].start)} x2={xIn(g[g.length - 1].start)} y1={by} y2={by} />);
    if (g.every(ev => ev.value.triplet)) { // one "3" bracket per triplet group, like printed music
      const xa = xIn(g[0].start), xb = xIn(g[g.length - 1].start), xm = (xa + xb) / 2;
      els.push(<path key={`tb${b}-${gid}`} class="tv-bracket" d={`M${xa} ${by + 6} v4 H${xm - 6} M${xm + 6} ${by + 10} H${xb} v-4`} />);
      els.push(<text key={`tt${b}-${gid}`} class="tv-tuplet" x={xm} y={by + 14}>3</text>);
    }
    for (let level = 2; level <= 3; level++) {
      const ly = by - (level - 1) * 5;
      g.forEach((ev, i) => {
        if (ev.value.flags < level) return;
        const x = xIn(ev.start);
        const next = g[i + 1];
        const prev = g[i - 1];
        if (next && next.value.flags >= level) {
          els.push(<line key={`bl${b}-${ev.start}-${level}`} class="tv-beam" x1={x} x2={xIn(next.start)} y1={ly} y2={ly} />);
        } else if (!(prev && prev.value.flags >= level)) {
          const dir = next ? 1 : -1;
          els.push(<line key={`bs${b}-${ev.start}-${level}`} class="tv-beam" x1={x} x2={x + dir * 7} y1={ly} y2={ly} />);
        }
      });
    }
  }

  for (const r of rests) {
    const x = xIn(r.start) + 4;
    const ry = y + STAFF_H + 24;
    if (r.value.ticks >= 48) {
      els.push(<rect key={`r${b}-${r.start}`} class="tv-restbar" x={x - 5} y={ry - (r.value.ticks >= 96 ? 8 : 4)} width={10} height={4} />);
    } else {
      els.push(<text key={`r${b}-${r.start}`} class="tv-rest" x={x} y={ry}>{REST_GLYPH[Math.min(r.value.flags, 3)]}</text>);
    }
  }
  return els;
}
