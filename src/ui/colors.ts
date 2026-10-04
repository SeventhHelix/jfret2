// One colour per neck position, shared by the fretboard and the timeline so a block and its dot match at a glance.
// The gradient runs cyan → blue → violet → pink over frets 0-14 (where most riffs live) and holds past that.
// Amber (playing) and green (cursor) stay reserved.
export function fretHue(fret: number): number {
  return 185 + (Math.min(fret, 14) / 14) * 170;
}
