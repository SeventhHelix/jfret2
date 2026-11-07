// Layout settings from the View menu: which panels show and in what order, page width, and per-panel sizing.
// Per viewer (localStorage). Phones get their own defaults.

export type PanelId = 'tab' | 'fretboard' | 'editor';
export type FretNeck = 'scroll' | 'neck' | 'bar'; // fixed frets that scroll / whole neck fits / this bar's frets fit

export type Layout = {
  v: number;          // LAYOUT_V when saved
  panels: { id: PanelId; on: boolean }[]; // in display order
  fullWidth: boolean; // use the whole screen instead of 1400px
  tabZoom: number;
  tabBars: number;    // bars per line, 0 = as many as fit
  tabLines: number;   // lines of tab in view before it scrolls, 0 = all
  fbZoom: number;
  fbNeck: FretNeck;
};

/** Bumped when phone defaults change enough that phones on an older saved layout should start over. */
export const LAYOUT_V = 2;

export const SIZES = [0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
export const TAB_BARS = [0, 1, 2, 3, 4, 6, 8];
export const TAB_LINES = [1, 2, 3, 4, 0];
export const PANEL_NAMES: Record<PanelId, string> = { tab: 'Tab', fretboard: 'Fretboard', editor: 'Editor (tempo, tools, timeline)' };
const PANEL_IDS: PanelId[] = ['tab', 'fretboard', 'editor'];

export function defaultLayout(phone: boolean): Layout {
  return phone
    ? { v: LAYOUT_V, panels: [{ id: 'tab', on: true }, { id: 'fretboard', on: true }, { id: 'editor', on: false }],
        fullWidth: false, tabZoom: 0.9, tabBars: 0, tabLines: 2, fbZoom: 0.75, fbNeck: 'bar' }
    : { v: LAYOUT_V, panels: PANEL_IDS.map(id => ({ id, on: true })), fullWidth: false, tabZoom: 1, tabBars: 0, tabLines: 3, fbZoom: 1, fbNeck: 'scroll' };
}

/** Saved settings -> valid Layout: unknown values fall back to the defaults; the old single Size carries over. */
export function readLayout(raw: Record<string, unknown>, phone: boolean): Layout {
  const d = defaultLayout(phone);
  if (phone && raw.v !== LAYOUT_V) return d; // phones on an older saved layout get the current phone defaults
  const pick = <T>(v: unknown, ok: readonly T[], dflt: T): T => (ok.includes(v as T) ? (v as T) : dflt);
  const oldZoom = pick(raw.zoom, SIZES, 0); // before panels had their own sizes, one Size scaled everything
  const panels: Layout['panels'] = [];
  if (Array.isArray(raw.panels)) {
    for (const p of raw.panels) {
      const id = (p as { id?: unknown })?.id;
      if (PANEL_IDS.includes(id as PanelId) && !panels.some(q => q.id === id)) panels.push({ id: id as PanelId, on: (p as { on?: unknown }).on !== false });
    }
  }
  for (const p of d.panels) if (!panels.some(q => q.id === p.id)) panels.push({ ...p });
  return {
    v: LAYOUT_V,
    panels,
    fullWidth: typeof raw.fullWidth === 'boolean' ? raw.fullWidth : oldZoom > 1,
    tabZoom: pick(raw.tabZoom, SIZES, oldZoom || d.tabZoom),
    tabBars: pick(raw.tabBars, TAB_BARS, d.tabBars),
    tabLines: pick(raw.tabLines, TAB_LINES, d.tabLines),
    fbZoom: pick(raw.fbZoom, SIZES, oldZoom || d.fbZoom),
    fbNeck: pick(raw.fbNeck, ['scroll', 'neck', 'bar'] as const, d.fbNeck),
  };
}

/** Move a panel up (-1) or down (+1) in the order. */
export function movePanel(l: Layout, id: PanelId, d: -1 | 1): Layout {
  const i = l.panels.findIndex(p => p.id === id), j = i + d;
  if (i < 0 || j < 0 || j >= l.panels.length) return l;
  const panels = [...l.panels];
  [panels[i], panels[j]] = [panels[j], panels[i]];
  return { ...l, panels };
}

/** Fret width for the neck mode. avail = the fretboard's visible width; lo/hi = the frets in focus (-1 if none). */
export function fretWidth(mode: FretNeck, avail: number, lo: number, hi: number, openW: number, frets: number): number {
  const FIXED = 64;
  if (avail <= 0 || mode === 'scroll') return FIXED;
  if (mode === 'neck') return Math.max(30, (avail - openW) / frets);
  if (lo < 0) return FIXED;
  // This bar's frets plus a fret of margin each side, at least 5 frets' worth, so a single note doesn't fill the screen.
  const from = Math.max(1, lo), shown = Math.max(5, hi - from + 3);
  return Math.min(150, Math.max(40, (avail - (lo === 0 ? openW : 0)) / shown));
}

/** The frets the fretboard should focus on (zoom, scroll, hand box) for these notes, or null if none are fretted.
 *  Open strings and dead notes don't count. A couple of stray notes far from where the hand mostly is (a tapped note
 *  up high, a slide from far away) don't drag the focus either; a real position shift (lots of notes outside) does. */
export function focusRange(notes: { fret: number; tech?: { dead?: boolean } }[]): { lo: number; hi: number } | null {
  const f = notes.filter(n => n.fret > 0 && !n.tech?.dead).map(n => n.fret).sort((a, b) => a - b);
  if (!f.length) return null;
  const all = { lo: f[0], hi: f[f.length - 1] };
  if (all.hi - all.lo <= 7) return all;
  // The 6-fret window (one hand position plus a stretch) holding the most notes.
  let best = { i: 0, j: 1 };
  for (let i = 0, j = 0; i < f.length; i++) {
    while (j < f.length && f[j] - f[i] <= 6) j++;
    if (j - i > best.j - best.i) best = { i, j };
  }
  const outside = f.length - (best.j - best.i);
  return outside <= Math.max(2, Math.floor(f.length * 0.2)) ? { lo: f[best.i], hi: f[best.j - 1] } : all;
}
