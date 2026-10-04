# jFret — Design Spec

**Date:** 2026-10-03
**Status:** Draft for review
**Goal:** A browser-only app for guitarists to sketch ("noodle") riffs and short solos on a clickable fretboard, fix the rhythm afterwards in a tab-roll editor, play them back, and share them via a self-contained link. Optimized for fast iteration, not production polish.

## Constraints

- **100% client-side.** No server, no database, no accounts. Hosted as static files on **GitHub Pages**.
- Desktop-first (mouse + keyboard); touch targets large enough that a tablet works. No phone layout.
- Scope: riffs and short solos (~1–32 bars, ≤ ~300 notes), single guitar track, 6 strings.
- v1 notes are plain picked notes only (no bends/slides/hammer-ons).

## Stack

- **Vite + TypeScript + Preact.** Vite dev server for hot reload locally; `vite build` emits static files.
- `vite.config.ts` uses `base: './'` so the build works from any GitHub Pages subpath.
- **Deploy:** a GitHub Actions workflow builds on push to `main` and publishes `dist/` to GitHub Pages.
- **Tests:** Vitest for pure logic (codec, edit ops, quantize, feel, notation rhythm mapping). UI is verified manually in the browser.

## Data model

```ts
type Song = {
  v: 1;
  title: string;
  bpm: number;            // 30–300
  timeSig: [number, number]; // UI offers 4/4, 3/4, 6/8
  tuning: TuningId;       // 'std' | 'dropD' | 'halfDown' | 'dadgad' | 'openG'
  notes: Note[];          // kept sorted by (start, string)
};
type Note = {
  start: number;  // ticks, 24 per quarter note (PPQ = 24)
  dur: number;    // ticks, >= 1
  string: number; // 0 = high e … 5 = low E
  fret: number;   // 0–24
};
```

- PPQ 24 represents 32nds (3), 16th triplets (4), 16ths (6), 8th triplets (8), 8ths (12), etc., and is fine enough for un-quantized "feel" timing.
- Overlapping notes are allowed by the model (enables chords later); v1 has no dedicated chord-entry UI.
- Tunings are a fixed preset table of MIDI pitches per string.

## Share link / persistence

- **Codec (binary → base64url):**
  - Header: version byte, bpm (varint), timeSig (1 byte each), tuning id (1 byte), title (length-prefixed UTF-8, ≤ 60 bytes).
  - Notes, sorted: `varint(start − prevStart)`, `varint(dur)`, `byte(string << 5 | fret)` — ~3 bytes/note.
  - No compression in v1 (payloads are already ~1–1.5k chars); a future version byte can add it.
- Stored in the **URL fragment**: `https://<user>.github.io/jfret/#s=<payload>`. Fragments never hit a server.
- The URL is updated live (`history.replaceState`, debounced) so the address bar is always the current share link. "Copy link" button copies it.
- Last-edited song is also autosaved to `localStorage`; on load, a URL payload takes precedence over localStorage.
- Decode failure (corrupt/truncated link): show a small error banner and load an empty song; never crash.

## Audio

- **Voice:** Karplus-Strong plucked-string synthesis in WebAudio (generated per note into an `AudioBuffer`, cached by pitch). No samples/assets.
- **Scheduler:** lookahead scheduler (~25 ms timer, ~100 ms horizon) against `AudioContext.currentTime`.
- Transport supports: play/pause, seek, loop region (start/end ticks), **speed %** (25–150%, playback only — not saved in the song), metronome click toggle, optional 1-bar count-in.
- The scheduler emits playhead position (ticks) via `requestAnimationFrame` for UI highlighting.
- AudioContext is created/resumed on first user gesture.

## Screen layout

Single page, top to bottom:

1. **Header / transport:** title, play/pause, loop toggle, speed slider, metronome, BPM, time sig, tuning, Copy link, **Edit** toggle, undo/redo.
2. **Tab view (notation):** SVG tab staff with rhythm stems/beams, wrapped by bar. Playhead line. Click a note/bar to seek; drag across to set the loop region.
3. **Fretboard:** frets 0–15 (scrolls/expands to 24), high e on top (player's-eye view, not mirrored). Big hit targets (~56 px per string row, wide fret cells), fret markers at 3/5/7/9/12/15.
4. **Tab-roll + selection toolbar** — only visible in Edit mode.

Shared links open with Edit off (a clean player view) and an "Edit / remix" button. A fresh visit with no payload opens in Edit mode.

## Fretboard display modes

A small segmented control on the fretboard: **Live | Bar/selection**. In Bar/selection mode the soft set is chosen automatically: selection (if any) > loop region (if on) > current bar. A label shows which one is active.

- **Live:** only the currently sounding note(s) are highlighted.
- **Bar:** every note in the bar containing the playhead is shown as a *soft* highlight (fret number visible); the currently sounding note is *strongly* highlighted (filled, bigger, slight pulse). As the playhead crosses a bar line, the soft set swaps to the next bar. This mimics watching another player's fretting hand to learn the shape.
- **Selection:** when notes are selected in the tab-roll (or a loop region is on), the soft set is exactly those notes instead of the current bar; the playing note is still double-highlighted. Clearing the selection returns to the bar view.
- Default mode is **Bar/selection**. When stopped, the "hot" notes are the ones starting exactly at the playhead (entering a note or clicking one moves the playhead there), so you see the note you just placed plus the rest of its bar.
- Same visual language in edit and play views. Positions with multiple soft notes at the same fret just show one marker.

## Editing ("noodling") flow

**Entering notes (fretboard):**
- Clicking a fret cell plays the note immediately and inserts a note at the **insert cursor** with a default length of an 8th (12 ticks); the cursor advances by that length.
- Each insert also records the wall-clock gap since the previous click into a per-note "feel" buffer (not persisted in the link; session-only).
- Clicking empty space in the tab-roll moves the insert cursor there (snapped to grid).

**Editing (tab-roll):**
- Rows = strings (high e on top), x = time, bar/beat grid lines. Notes are blocks labeled with their fret number.
- Click to select, Shift/Ctrl-click to add, drag a box on empty space to marquee-select.
- Drag a block to move it in time (snaps to the current grid) and vertically to another string (fret recalculated to keep the same pitch if possible; otherwise keep fret).
- Drag the right edge to resize. Alt held = no snapping.
- Keyboard: Delete/Backspace remove, ←/→ nudge by grid, ↑/↓ move string (same pitch), keys 1–6 set duration of selection (1=whole … 5=16th, 6=32nd), Ctrl+Z / Ctrl+Shift+Z undo/redo, Space play/pause, Ctrl+A select all.
- Grid selector: 1/4, 1/8, 1/16, 1/8 triplet, 1/16 triplet.

**Selection toolbar operations** (apply to selection, or all notes if none selected — except Delete, which requires a selection):
- **Quantize:** snap starts (and optionally ends) to grid, with a strength slider (0–100%).
- **Apply feel:** re-time notes using the recorded click gaps, scaled so the average gap equals the current grid value. Follow with Quantize to clean up.
- **Even out:** place the selected notes one grid step apart, starting at the first selected note (notes sharing a start stay together); each gets a duration of one grid step.
- **Legato:** extend each note to the start of the next note.
- **Delete.**

**Undo/redo:** snapshot-based history (songs are tiny), capped at ~200 steps.

## Notation rendering (tab view)

- Tab staff with six lines, fret numbers at note positions, bar lines, time signature at start.
- Rhythm: each note's duration is mapped to the nearest standard value (whole … 32nd, dotted, triplet) for **display only**; stems drawn below the staff, 8ths/16ths beamed within a beat. Rests shown for gaps ≥ a 16th. Not engraving-grade; readable is the bar.
- Lines wrap at a fixed number of bars based on container width.
- Highlights: currently playing notes colored; selected notes tinted; loop region shaded.

## Module layout

```
src/
  model/      song.ts (types, tunings, pitch helpers), ops.ts (add/move/resize/delete,
              quantize, applyFeel, evenOut, legato), history.ts (undo/redo)
  codec/      codec.ts (encode/decode, varint, base64url)
  audio/      synth.ts (Karplus-Strong), player.ts (scheduler, transport, loop, metronome)
  notation/   rhythm.ts (duration → display value, beaming groups)
  ui/         App.tsx, Transport.tsx, TabView.tsx, Fretboard.tsx, TabRoll.tsx, Toolbar.tsx
  state/      store.ts (single store: song, selection, cursor, playhead, mode, edit flag)
```

- `model/`, `codec/`, `notation/` are pure and unit-tested.
- UI components read from the store and dispatch ops; they never mutate the song directly.

## Testing

- Vitest: codec round-trip (including empty song, max frets, long gaps, unicode title, corrupt input → error), quantize at each grid/strength, applyFeel scaling, evenOut, legato, string-move pitch preservation, rhythm display mapping.
- Manual browser checks for interaction feel and audio.

## Out of scope (v1)

Bends, slides, hammer-ons/pull-offs, vibrato; chord-entry UI; multiple tracks; MIDI import/export; standard-notation staff; phone layout; accounts or any server storage.
