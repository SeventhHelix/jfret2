# jFret

Browser-only guitar riff sketcher. Click frets to enter notes, fix rhythm in a tab-roll timeline, play back with a synth, share via a link that holds the whole riff in the URL fragment (`#s=<payload>`). No server, no database.

- Live: https://seventhhelix.github.io/jfret2/
- Repo: https://github.com/SeventhHelix/jfret2 (remote `origin`, HTTPS; SSH host key isn't trusted on this machine)
- Design spec and original plan: `docs/superpowers/specs/2026-10-03-jfret-design.md`, `docs/superpowers/plans/2026-10-03-jfret-v1.md`. The app has grown well past the plan; the code is the source of truth.

## Workflow

- Priority is fast iteration, not production polish. No lint, no E2E. Unit-test pure logic; check UI in the browser.
- Work on `feat/v1`. When a change passes typecheck + tests + build, fast-forward `main` and push both **without asking** (the user asked for this). Pushing `main` deploys via `.github/workflows/deploy.yml` to GitHub Pages.
  ```bash
  git checkout main && git merge --ff-only feat/v1 && git push origin main feat/v1 && git checkout feat/v1
  ```
- End commit messages with the `Co-Authored-By` trailer.

## Commands

Node lives in `C:\Program Files\nodejs` and may not be on PATH in the Bash tool. Prefix with `export PATH="/c/Program Files/nodejs:$PATH";`.

```bash
npm run dev        # Vite dev server
npm test           # Vitest (pure modules only)
npm run typecheck  # tsc --noEmit
npm run build      # static site in dist/ (base: './')
```

The in-app browser preview is configured in `G:\code\.claude\launch.json` (name `jfret-dev`, port 5173).

## Stack

Vite 8, TypeScript 7, **Preact 10** (pinned on purpose: Preact 11 dropped automatic `px` on numeric style values and collapses the layout), `@preact/signals`, Vitest 5.

## Architecture

```
src/model/song.ts      types, tunings, PPQ=24, pitch/bar helpers, normalizeNotes (one note per string)
src/model/ops.ts       pure edit ops: add/move/resize/quantize/applyFeel/evenOut/legato/shiftFrom,
                       copy/paste/duplicate/shiftFrets. All go through withNotes() -> normalizeNotes
src/model/history.ts   undo/redo snapshots
src/model/theory.ts    scales/modes, intervals, root guess
src/model/flow.ts      flow path grouping modes (beat/strings/contour/arc) -> which links are dotted
src/model/layout.ts    layout settings (Settings menu): panels/order, sizes, bars per line, neck mode; defaults (phone vs desktop), fretWidth()
src/model/tech.ts      playing techniques (Note.tech: bend/release/vibrato/slide/legato/mute/harmonic/pinch/dead): toggles,
                       neighbours on a string, harmonic pitch, short marks
src/import/gpScore.ts  Guitar Pro import, pure: plain score types, sections, tuning fit, extractSection -> Song + warnings
src/import/gpRead.ts   Guitar Pro import, alphaTab: file bytes -> GpScore (alphaTab is lazy-loaded, ~1.2 MB chunk)
src/codec/practice.ts  practice/sound params in the link, page title
src/codec/codec.ts     Song <-> base64url binary payload (version byte, varints, string<<5|fret). v2: dur*2+hasTech,
                       then a technique flags byte (+ bend byte, + pinch byte) only for notes that have one; v1 still decodes
src/notation/rhythm.ts duration -> display value, per-bar layout, rests, beaming, triplets
src/audio/synth.ts     instruments (Karplus-Strong plucks with per-instrument tone, overdrive chain, saw synth),
                       metronome sounds, separate guitar/metronome volume buses (settings: store `sound`)
src/audio/player.ts    lookahead scheduler (25 ms timer, 120 ms horizon), loop, speed, count-in
src/audio/wakeLock.ts  Screen Wake Lock while playing (store effect on `playing`); re-taken when the page is shown again
src/state/store.ts     single signals store: song, selection, cursor, playhead, transport, view/guide
                       options, actions (insertNote, toggleLoop, paste...), persistence
src/ui/*.tsx           App, Transport (sticky header), TabView (SVG tab), Fretboard (neck + overlays),
                       TabRoll (timeline editor), Toolbar (note length + rhythm tools), Settings (the ⚙ menu), NoteEditor (fix a note), ImportDialog (GP track +
                       section picker) + GpTabPreview (whole track as tab, click/drag bars), tabDraw (one bar of
                       tab as SVG, shared by TabView and GpTabPreview), keyboard.ts, colors.ts
```

UI components read signals and call store actions; they never mutate the song directly. Drags update `song.value` live from a snapshot and record one undo step with `commitFrom(orig)`.

## Invariants and gotchas

- **Time is ticks, PPQ = 24.** Quarter 24, 8th 12, 16th 6, 32nd 3, 8th triplet 8, 16th triplet 4. Dotted 32nd can't be represented.
- **One note per string at a time.** `normalizeNotes` drops same-string same-start duplicates (preferring the ids being operated on) and cuts a ringing note short when the next note on its string starts. Quantize steps around occupied slots instead of stacking.
- **Share link format is versioned** (`VERSION` in codec). Changing note fields needs a new version and backward-compatible decode. Decode validates everything and clamps to `MAX_TICKS`; corrupt links show an error banner, never crash.
- The link is `#s=<riff>` plus optional readable practice params (`&sp=75&lp=96-192&m=1&ci=1&v=80,70&i=overdrive&c=cowbell`: speed, loop, metronome, count-in, volumes, instrument, click sound; `codec/practice.ts`, only non-default values written). A link with practice params applies them without overwriting the viewer's saved sound defaults. Display options and the scale guide stay per-viewer in localStorage. The last riff (and its practice params) autosave to localStorage; the URL updates via debounced `replaceState`. The tab title is `jFret - <name>` so bookmarks and history are searchable.
- A link opens in Practice mode unless it equals your own last-saved riff.
- One ⚙ Settings menu (`ui/Settings.tsx`, collapsible sections Playback / Layout / Fretboard) holds count-in, sounds, layout, fretboard mode/labels/scale guide/display options. The header is one row (riff name, transport, speed, Click, ⚙, Share, Edit toggle); on narrow screens button words hide (`.lbl`) and menus open as a sheet, same layout otherwise. The fretboard has no header, only an info line (next-note spot while editing, scale while the guide is on). Layout (`layout` signal, `model/layout.ts`, localStorage `jfret:layout`, versioned by `LAYOUT_V`: phones on an older saved layout reset to the phone defaults; phones <=700px get their own defaults): panel visibility/order (tab, fretboard, editor; the header's edit row goes with the editor), full width, tab bars per line / lines shown / size, fretboard neck mode / size. TabView lays out at width/tabZoom and draws scaled via the SVG viewBox (pointer math divides by zoom). The fretboard uses CSS `zoom` (`--fbz`) on `.fb-wrap` (clicks are per-cell, scroll math stays in its own coordinates) and a per-render fret width (`FRET_W` is module-level and set each render from `fretWidth()`: fixed 64 / whole neck fitted / the bar's frets fitted). The focus (zoom, follow-scroll, hand box) comes from `focusRange()`: open strings, dead notes and a couple of stray far-off notes are ignored; notes in focus that end up off-screen get an edge marker (`.fb-edge`) on their string. TabRoll is not scaled (its drag math is in raw px).
- Insert cursor goes AT a clicked note; inserting there ripples later notes. Shift-click on the neck stacks a chord onto the previous insert. Clicks on empty space in the tab/timeline snap to the nearest note start (`snapToNote`; while editing, also note ends so gaps can be filled). In Edit mode a fretboard tap inserts on pointer-up, so a long-press doesn't also insert.
- Note editor (`ui/NoteEditor.tsx`, store `noteEditor`): fret / string / delete for one or more notes. Opens from double-click, right-click or long-press (500 ms timer in TabView/TabRoll; `contextmenu` on lit fretboard cells) and Enter on a selection; works in Practice mode too.
- Keyboard shortcuts live in `ui/keyboard.ts` (Space, L, 1-6, ., T, B/R/V/S/H/M/N/P/X techniques, Ctrl+Z/Y/C/X/V/D, Alt+arrows, Backspace). Keep the hint line in `App.tsx` in sync.

## Dev environment quirks

- Vite HMR can cache a half-written module when a file is edited in several quick steps (e.g. multiple `sed` passes). Symptoms: "does not provide an export named ..." in the console while `tsc` passes. Fix: restart the dev server (`preview_stop` / `preview_start`).
- The in-app browser pane often stops drawing when not visible: screenshots time out, `requestAnimationFrame` and smooth scrolling pause. Prefer `javascript_tool` checks. It also strips `#s=` fragments on navigation; load a riff with `location.hash = 's=...'` instead.
- Synthetic `PointerEvent`s work for fretboard clicks. Audio needs a real user gesture before the AudioContext runs.
- Guitar Pro import goes through alphaTab's `ScoreLoader` only (no rendering). alphaTab: 960 ticks/quarter (÷40 for jFret), `note.string` 1 = lowest string, `staff.tuning` high to low. Tests build real .gp files with `AlphaTexImporter` + `Gp7Exporter`, so no binary fixtures are checked in.
- The jFret production build can be checked with the `jfret-prod` launch config (`vite preview`, port 4173) after `npm run build`.
