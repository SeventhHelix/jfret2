// One colour per neck position, shared by the fretboard and the timeline so a block and its dot match at a glance.
// The gradient runs cyan → blue → violet → pink over frets 0-14 (where most riffs live) and holds past that.
// Amber (playing) and green (cursor) stay reserved.
export function fretHue(fret: number): number {
  return 185 + (Math.min(fret, 14) / 14) * 170;
}

// Faint per-interval hues for the scale guide (index = semitones above the root). Related intervals share a family:
// 2nds teal, 3rds blue, 4th green, b5 red, 5th violet, 6ths orange, 7ths pink. The root is drawn cream separately.
const INTERVAL_HUES = [0, 175, 175, 215, 215, 130, 0, 270, 30, 30, 320, 320];
export function intervalHue(semitonesAboveRoot: number): number {
  return INTERVAL_HUES[((semitonesAboveRoot % 12) + 12) % 12];
}
