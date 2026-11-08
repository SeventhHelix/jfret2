// Drawing one bar of tab (frets, stems, beams, triplet brackets, rests) as SVG elements.
// Shared by the main TabView and the Guitar Pro import preview.
import type { JSX } from 'preact';
import { Note } from '../model/song';
import { DisplayEvent, RhythmValue, layoutBar } from '../notation/rhythm';
import { BEND_LABEL, nextOnString, prevOnString } from '../model/tech';

export const PAD = 12;       // inner padding per bar
export const GAP = 12;       // px between staff lines
export const STAFF_H = GAP * 5;
// Above the staff, from the top down: bar labels, then P.M., then bend amounts, then vibrato just over the top line.
export const LABEL_Y = -30; // bar number / time signature baseline, relative to the staff top
export const HEAD = 40;     // room a row needs above its staff for all of that
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
      const label = n.tech?.dead ? 'x' : n.tech?.harmonic ? `<${n.fret}>` : String(n.fret);
      els.push(<text key={`f${id}`} data-start={n.start} data-id={n.id} class={`tv-fret${d.fretClass ? d.fretClass(n) : ''}`} x={x} y={y + n.string * GAP}>{label}</text>);
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

  els.push(...drawTech(d, events.flatMap(ev => ev.noteIds.map(id => byId.get(id)!))));

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

/** Technique marks for the notes drawn in a bar: bends, vibrato, slides, hammer-ons/pull-offs, palm mute. */
function drawTech(d: BarDraw, shown: Note[]): JSX.Element[] {
  const els: JSX.Element[] = [];
  const { y, key: b } = d;
  const end = d.start + d.len;
  const xIn = (t: number) => xInBar(d, t);
  const sy = (n: Note) => y + n.string * GAP;
  const inBar = (n: Note | undefined) => !!n && n.start >= d.start && n.start < end;
  const sorted = [...shown].sort((a, c) => a.start - c.start || a.string - c.string);
  for (const n of sorted) {
    const t = n.tech;
    if (!t) continue;
    const x = xIn(n.start), ny = sy(n);
    if (t.bend) {
      const px = x + 12, top = y - 5;
      els.push(<path key={`bd${n.id}`} class="tv-tech" d={`M${x + 6} ${ny} Q${px} ${ny} ${px} ${top}`} />);
      els.push(<path key={`bh${n.id}`} class="tv-tech-head" d={`M${px - 3} ${top + 4} L${px} ${top} L${px + 3} ${top + 4} Z`} />);
      els.push(<text key={`bl${n.id}`} class="tv-tech-txt" x={px} y={top - 3}>{BEND_LABEL[t.bend] ?? t.bend}</text>);
      if (t.release) {
        els.push(<path key={`br${n.id}`} class="tv-tech" d={`M${px} ${top} Q${px} ${ny} ${px + 9} ${ny - 2}`} />);
        els.push(<path key={`brh${n.id}`} class="tv-tech-head" d={`M${px + 5} ${ny - 5} L${px + 9} ${ny - 2} L${px + 5} ${ny + 1} Z`} />);
      }
    }
    if (t.pinch) els.push(<text key={`ph${n.id}`} class="tv-tech-txt" x={x} y={y - 19}>P.H.</text>);
    if (t.vibrato) {
      const x1 = Math.min(xIn(Math.min(end, n.start + n.dur)), d.x0 + d.w - 4);
      const len = Math.max(14, x1 - x - 2);
      let path = `M${x - 2} ${y - 4}`;
      for (let k = 0; k * 6 < len; k++) path += ` q1.5 -3 3 0 q1.5 3 3 0`;
      els.push(<path key={`vb${n.id}`} class="tv-tech" d={path} />);
    }
    if (t.slide) {
      const next = nextOnString(d.notes, n);
      if (next && inBar(next)) {
        const nx = xIn(next.start), up = next.fret > n.fret;
        els.push(<line key={`sl${n.id}`} class="tv-tech" x1={x + 7} y1={ny + (up ? 3 : -3)} x2={nx - 7} y2={sy(next) + (up ? -3 : 3)} />);
      } else {
        els.push(<line key={`sl${n.id}`} class="tv-tech" x1={x + 7} y1={ny - 3} x2={x + 17} y2={ny + 4} />); // slide off
      }
    }
    if (t.legato) {
      const prev = prevOnString(d.notes, n);
      const px = prev && inBar(prev) ? xIn(prev.start) : x - 18;
      const mx = (px + x) / 2;
      els.push(<path key={`lg${n.id}`} class="tv-tech" d={`M${px + 3} ${ny - 7} Q${mx} ${ny - 15} ${x - 3} ${ny - 7}`} />);
      els.push(<text key={`lt${n.id}`} class="tv-tech-txt" x={mx} y={ny - 13}>{prev && prev.fret > n.fret ? 'p' : 'h'}</text>);
    }
  }
  // Palm mute: "P.M." over each run of muted notes, with a dashed line to the last one.
  let run: Note[] = [];
  const flush = () => {
    if (!run.length) return;
    const x0 = xIn(run[0].start), x1 = xIn(run[run.length - 1].start);
    els.push(<text key={`pm${b}-${run[0].id}`} class="tv-tech-txt pm" x={x0 - 6} y={y - 19}>P.M.</text>);
    if (x1 > x0 + 14) els.push(<line key={`pml${b}-${run[0].id}`} class="tv-tech pm" x1={x0 + 14} x2={x1 + 4} y1={y - 22} y2={y - 22} />);
    run = [];
  };
  for (const n of sorted) {
    if (n.tech?.mute) { if (!run.length || run[run.length - 1].start !== n.start) run.push(n); }
    else flush();
  }
  flush();
  return els;
}
