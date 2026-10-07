// Flow path grouping: which links of the flow line join two "chunks" of a phrase (drawn dotted).
// Each mode is one simple rule; they're Display options to try by feel.

export type FlowGrouping = 'none' | 'beat' | 'strings' | 'contour' | 'arc';

/** One point of the flow line: a note, or a chord represented by its top note. */
export type FlowPt = { start: number; string: number; pitch: number };

// Notes per group by note value (ticks between onsets): quarter 2, 8th 4, 8th triplet 3, 16th 6, 16th triplet 6, 32nd 8.
const PER_GROUP: [number, number][] = [[24, 2], [12, 4], [8, 3], [6, 6], [4, 6], [3, 8]];

/** Ticks one beat-mode group spans for a note whose next onset is `ioi` ticks later. */
export function groupTicks(ioi: number): number {
  if (ioi >= 24) return 2 * ioi;
  let best = PER_GROUP[0];
  for (const e of PER_GROUP) if (Math.abs(e[0] - ioi) < Math.abs(best[0] - ioi)) best = e;
  return best[0] * best[1];
}

/** links[i] is true when the line from pts[i] to pts[i+1] crosses into a new group. pts are in playing order. */
export function groupLinks(pts: FlowPt[], mode: FlowGrouping, bar: number): boolean[] {
  const links = new Array<boolean>(Math.max(0, pts.length - 1)).fill(false);
  if (mode === 'none' || pts.length < 2) return links;

  if (mode === 'beat') {
    // Groups are counted from the start of each bar, so they sit on the beat.
    const slot = (t: number, g: number) => `${Math.floor(t / bar)}:${Math.floor((t % bar) / g)}`;
    for (let i = 0; i < links.length; i++) {
      const g = groupTicks(pts[i + 1].start - pts[i].start);
      links[i] = slot(pts[i].start, g) !== slot(pts[i + 1].start, g);
    }
    return links;
  }

  if (mode === 'strings') {
    // Moving to a new string after 2+ notes on this one starts a group; single notes swept across strings don't.
    let run = 1;
    for (let i = 0; i < links.length; i++) {
      if (pts[i + 1].string === pts[i].string) { run++; continue; }
      links[i] = run >= 2;
      run = 1;
    }
    return links;
  }

  // contour / arc: break at turns in the pitch line that end a run of 3+ notes (repeated pitches don't turn).
  const dir: number[] = []; // direction leaving each point, carrying the last one across repeats
  let last = 0;
  for (let i = 0; i < links.length; i++) {
    const d = Math.sign(pts[i + 1].pitch - pts[i].pitch);
    if (d !== 0) last = d;
    dir.push(last);
  }
  let runStart = 0;
  for (let j = 1; j < links.length; j++) {
    const before = dir[j - 1], after = dir[j];
    if (before === 0 || after === 0 || before === after) continue;
    const valley = before < 0;
    if (j - runStart + 1 >= 3 && (mode === 'contour' || valley)) links[j] = true;
    runStart = j;
  }
  return links;
}
