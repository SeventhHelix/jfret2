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
src/codec/codec.ts     Song <-> base64url binary payload (version byte, varints, string<<5|fret)
src/notation/rhythm.ts duration -> display value, per-bar layout, rests, beaming, triplets
src/audio/synth.ts     Karplus-Strong pluck (allpass-tuned) + metronome click
src/audio/player.ts    lookahead scheduler (25 ms timer, 120 ms horizon), loop, speed, count-in
src/state/store.ts     single signals store: song, selection, cursor, playhead, transport, view/guide
                       options, actions (insertNote, toggleLoop, paste...), persistence
src/ui/*.tsx           App, Transport (sticky header), TabView (SVG tab), Fretboard (neck + overlays),
                       TabRoll (timeline editor), Toolbar (note length + rhythm tools), keyboard.ts, colors.ts
```

UI components read signals and call store actions; they never mutate the song directly. Drags update `song.value` live from a snapshot and record one undo step with `commitFrom(orig)`.

## Invariants and gotchas

- **Time is ticks, PPQ = 24.** Quarter 24, 8th 12, 16th 6, 32nd 3, 8th triplet 8, 16th triplet 4. Dotted 32nd can't be represented.
- **One note per string at a time.** `normalizeNotes` drops same-string same-start duplicates (preferring the ids being operated on) and cuts a ringing note short when the next note on its string starts. Quantize steps around occupied slots instead of stacking.
- **Share link format is versioned** (`VERSION` in codec). Changing note fields needs a new version and backward-compatible decode. Decode validates everything and clamps to `MAX_TICKS`; corrupt links show an error banner, never crash.
- Per-viewer preferences (Display options, scale guide) live in localStorage, **not** in the share link. The last riff autosaves to localStorage; the URL updates via debounced `replaceState`.
- A link opens in Practice mode unless it equals your own last-saved riff.
- Insert cursor goes AT a clicked note; inserting there ripples later notes. Shift-click on the neck stacks a chord onto the previous insert.
- Keyboard shortcuts live in `ui/keyboard.ts` (Space, L, 1-6, ., T, Ctrl+Z/Y/C/X/V/D, Alt+arrows, Backspace). Keep the hint line in `App.tsx` in sync.

## Dev environment quirks

- Vite HMR can cache a half-written module when a file is edited in several quick steps (e.g. multiple `sed` passes). Symptoms: "does not provide an export named ..." in the console while `tsc` passes. Fix: restart the dev server (`preview_stop` / `preview_start`).
- The in-app browser pane often stops drawing when not visible: screenshots time out, `requestAnimationFrame` and smooth scrolling pause. Prefer `javascript_tool` checks. It also strips `#s=` fragments on navigation; load a riff with `location.hash = 's=...'` instead.
- Synthetic `PointerEvent`s work for fretboard clicks. Audio needs a real user gesture before the AudioContext runs.
