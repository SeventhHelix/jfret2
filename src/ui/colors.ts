// One colour per neck position, shared by the fretboard and the timeline so a block and its dot match at a glance.
// The gradient runs cyan → blue → violet → pink over frets 0-14 (where most riffs live) and holds past that.
// Amber (playing) and green (cursor) stay reserved.
export function fretHue(fret: number): number {
  return 185 + (Math.min(fret, 14) / 14) * 170;
}

// Faint per-interval hues for the scale guide (index = semitones above the root). The major-scale "pillars"
// (3, 4, 5, 7) run a green → blue gradient; the rest sit in reds and purples. The root is drawn cream separately.
//                    R   b2   2    b3   3    4    b5  5    b6   6    b7   7
const INTERVAL_HUES = [0, 355, 335, 315, 150, 170, 0, 195, 345, 295, 278, 220];
export function intervalHue(semitonesAboveRoot: number): number {
  return INTERVAL_HUES[((semitonesAboveRoot % 12) + 12) % 12];
}
