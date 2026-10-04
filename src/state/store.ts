import { batch, computed, effect, signal } from '@preact/signals';
import { Song, barTicks, beatTicks, emptySong, notesInRange, pitchOf, songEndTick, soundingAt } from '../model/song';
import { SCALES, ScaleId, guessRoot, scalePitchClasses, songPitchClasses } from '../model/theory';
import { addNote, copyNotes, deleteNotes, duplicateNotes, NewNote, pasteNotes, setDuration, shiftFrets, shiftFrom } from '../model/ops';
import { History } from '../model/history';
import { decodeSong, encodeSong } from '../codec/codec';
import { Player } from '../audio/player';

export type Loop = { start: number; end: number };
export type FretMode = 'live' | 'bar';

// Note length used for new fretboard entries (ticks; PPQ 24). Quarter by default.
export const NOTE_LENGTHS = [
  { ticks: 96, label: '1/1', name: 'Whole' },
  { ticks: 48, label: '1/2', name: 'Half' },
  { ticks: 24, label: '1/4', name: 'Quarter' },
  { ticks: 12, label: '1/8', name: 'Eighth' },
  { ticks: 6, label: '1/16', name: 'Sixteenth' },
  { ticks: 3, label: '1/32', name: 'Thirty-second' },
] as const;
export const baseLength = signal(24);
export const dotted = signal(false);
export const triplet = signal(false);
/** Dotted adds half the value (a dotted 32nd, 4.5 ticks, can't be represented, so it stays plain). Triplet is two thirds. */
export const entryDur = computed(() =>
  triplet.value ? (baseLength.value * 2) / 3 : dotted.value && baseLength.value >= 6 ? baseLength.value * 1.5 : baseLength.value);

// ---- state ----
export const song = signal<Song>(emptySong());
export const selection = signal<Set<number>>(new Set());
export const cursor = signal(0);   // insert position (ticks)
export const playhead = signal(0); // play/focus position (ticks)
export const playing = signal(false);
export const editMode = signal(true);
export const fretMode = signal<FretMode>('bar');
export const grid = signal(12);
export const loop = signal<Loop | null>(null);
export const loopOn = signal(false);
export const speed = signal(1);
export const metronome = signal(false);
export const countIn = signal(false);
export const errorMsg = signal<string | null>(null);

// Fretboard view options (a per-viewer preference, kept in localStorage, not in the share link).
export type ColourRange = 'riff' | 'bar' | 'neck';
export type ViewOpts = { lookAhead: boolean; motion: boolean; colour: boolean; colourRange: ColourRange };
const VIEW_KEY = 'jfret:view';
function loadView(): ViewOpts {
  const defaults: ViewOpts = { lookAhead: true, motion: true, colour: true, colourRange: 'riff' };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') }; } catch { return defaults; }
}
export const view = signal<ViewOpts>(loadView());
effect(() => { try { localStorage.setItem(VIEW_KEY, JSON.stringify(view.value)); } catch { /* ignore */ } });
export function setView(patch: Partial<ViewOpts>) {
  view.value = { ...view.value, ...patch };
}
export function toggleView(k: 'lookAhead' | 'motion' | 'colour') {
  view.value = { ...view.value, [k]: !view.value[k] };
}

// note id -> ms since previous fretboard click (session only, used by "Apply feel")
export const feel = new Map<number, number>();
let lastClick = 0;
const PHRASE_GAP_MS = 4000;

// ---- history ----
const history = new History<Song>();

export function commit(next: Song) {
  if (next === song.value) return;
  history.push(song.value);
  song.value = next;
}

/** For drags: song.value was updated live; record the pre-drag state once. */
export function commitFrom(prev: Song) {
  if (prev !== song.value) history.push(prev);
}

function pruneSelection() {
  const live = new Set(song.value.notes.map(n => n.id));
  selection.value = new Set([...selection.value].filter(id => live.has(id)));
}

export function undo() {
  const prev = history.undo(song.value);
  if (prev) { song.value = prev; pruneSelection(); cursor.value = Math.min(cursor.value, songEndTick(song.value)); }
}

export function redo() {
  const next = history.redo(song.value);
  if (next) { song.value = next; pruneSelection(); cursor.value = Math.min(cursor.value, songEndTick(song.value)); }
}

/** Selection, or every note when nothing is selected. */
export function targetIds(): Set<number> {
  return selection.value.size ? selection.value : new Set(song.value.notes.map(n => n.id));
}

export function selectAll() {
  selection.value = new Set(song.value.notes.map(n => n.id));
}

/**
 * Backspace with nothing selected: remove the note just before the insert cursor (normally the one
 * you just entered) and move the cursor back to where it was, like backspacing a typo.
 */
export function deleteBeforeCursor() {
  const before = song.value.notes.filter(n => n.start < cursor.value);
  if (!before.length) return;
  const at = Math.max(...before.map(n => n.start));
  const victim = before.filter(n => n.start === at).sort((a, b) => b.id - a.id)[0]; // newest note of a chord first
  commit(deleteNotes(song.value, new Set([victim.id])));
  if (!song.value.notes.some(n => n.start === at)) {
    cursor.value = at;
    lastInsertStart = null;
    if (!playing.value) playhead.value = at;
  }
}

export function deleteSelection() {
  if (!selection.value.size) return;
  commit(deleteNotes(song.value, selection.value));
  selection.value = new Set();
  cursor.value = Math.min(cursor.value, songEndTick(song.value));
}

// ---- player ----
export const player = new Player(t => { playhead.value = t; }, () => { playing.value = false; });
effect(() => player.setSong(song.value));
effect(() => { player.speed = speed.value; });
effect(() => { player.metronome = metronome.value; });
effect(() => { player.countIn = countIn.value; });
effect(() => { player.loop = loopOn.value ? loop.value : null; });

export function togglePlay() {
  if (playing.value) {
    player.pause();
    playing.value = false;
    return;
  }
  const lp = loopOn.value ? loop.value : null;
  let from = playhead.value;
  if (lp && (from < lp.start || from >= lp.end)) from = lp.start;
  else if (!lp && from >= songEndTick(song.value) - 1) from = 0;
  playhead.value = from;
  player.play(from);
  playing.value = true;
}

export function seek(tick: number) {
  const t = Math.max(0, Math.round(tick));
  playhead.value = t;
  if (playing.value) player.play(t, false);
}

export function rewind() {
  seek(loopOn.value && loop.value ? loop.value.start : 0);
}

function setLoop(start: number, end: number) {
  loop.value = { start, end };
  loopOn.value = true;
  if (playing.value && (playhead.value < start || playhead.value >= end)) seek(start); // jump into the new loop
}

export function setLoopFromSelection() {
  const sel = song.value.notes.filter(n => selection.value.has(n.id));
  if (!sel.length) return;
  setLoop(Math.min(...sel.map(n => n.start)), Math.max(...sel.map(n => n.start + n.dur)));
}

/**
 * The Loop button never does nothing:
 * - with notes selected → loop exactly those (pressing again on the same range turns it off);
 * - else with an existing loop → toggle it;
 * - else → loop the bar under the playhead.
 */
export function toggleLoop() {
  const sel = song.value.notes.filter(n => selection.value.has(n.id));
  if (sel.length) {
    const start = Math.min(...sel.map(n => n.start)), end = Math.max(...sel.map(n => n.start + n.dur));
    if (loopOn.value && loop.value?.start === start && loop.value.end === end) loopOn.value = false;
    else setLoop(start, end);
    return;
  }
  if (loop.value) {
    if (loopOn.value) loopOn.value = false;
    else setLoop(loop.value.start, loop.value.end);
    return;
  }
  const bar = barTicks(song.value.timeSig);
  const b = Math.floor(playhead.value / bar) * bar;
  setLoop(b, b + bar);
}

// ---- fretboard entry ----
export function previewNote(string: number, fret: number) {
  player.preview(pitchOf(song.value, { string, fret }));
}

// Start tick of the last fretboard insert, so Shift-click can stack a chord onto it.
let lastInsertStart: number | null = null;

/** Put the insert cursor AT a tick: the next fret click lands there, pushing any note already there later. */
export function placeCursor(tick: number) {
  cursor.value = Math.max(0, Math.round(tick));
  lastInsertStart = null;
  if (!playing.value) seek(cursor.value);
}

/**
 * Fretboard click in edit mode.
 * - Normal: insert a note of the chosen length at the cursor. If a note already starts within that span, ripple it
 *   (and everything after it) later, so the new note goes in front of it. Gaps are filled without shifting.
 * - stack (Shift-click): add the note at the same time as the previous insert (chord / double-stop).
 *   A note already on that string at that time is replaced, since one string can't sound two notes.
 */
export function insertNote(string: number, fret: number, stack = false) {
  const s0 = song.value;
  if (stack && lastInsertStart !== null) {
    const start = lastInsertStart;
    const partner = s0.notes.find(n => n.start === start);
    const clash = s0.notes.find(n => n.start === start && n.string === string);
    const base = clash ? deleteNotes(s0, new Set([clash.id])) : s0;
    const { song: next } = addNote(base, { start, dur: partner?.dur ?? entryDur.value, string, fret });
    batch(() => {
      commit(next);
      selection.value = new Set();
      if (!playing.value) playhead.value = start;
    });
    previewNote(string, fret);
    return;
  }
  const now = performance.now();
  const start = cursor.value;
  const dur = entryDur.value;
  const collides = s0.notes.some(n => n.start >= start && n.start < start + dur);
  const base = collides ? shiftFrom(s0, start, dur) : s0;
  const { song: next, id } = addNote(base, { start, dur, string, fret });
  if (lastClick && now - lastClick < PHRASE_GAP_MS) feel.set(id, now - lastClick);
  lastClick = now;
  lastInsertStart = start;
  batch(() => {
    commit(next);
    cursor.value = start + dur;
    selection.value = new Set();
    if (!playing.value) playhead.value = start;
  });
  previewNote(string, fret);
}

export function newSong() {
  if (song.value.notes.length && !confirm('Start a new riff? You can undo this.')) return;
  player.pause();
  playing.value = false;
  batch(() => {
    commit(emptySong());
    selection.value = new Set();
    cursor.value = 0;
    loop.value = null;
    loopOn.value = false;
    feel.clear();
    playhead.value = 0;
  });
}

// ---- derived view state for highlighting ----
const idSet = (notes: { id: number }[]) => new Set(notes.map(n => n.id));

/** Strong highlight: sounding notes while playing; notes starting at the playhead while stopped. */
export const hotIds = computed(() => {
  const notes = song.value.notes;
  const t = playhead.value;
  return idSet(playing.value ? soundingAt(notes, t) : notes.filter(n => n.start === t));
});

/** "Get ready" ring: the next onset after the playhead (wrapping inside an active loop). */
export const nextIds = computed(() => {
  const notes = song.value.notes;
  const t = playhead.value;
  const lp = loopOn.value ? loop.value : null;
  const inRange = (n: { start: number }) => !lp || (n.start >= lp.start && n.start < lp.end);
  let next = notes.find(n => n.start > t && inRange(n))?.start; // notes are sorted by start
  if (next === undefined && lp) next = notes.find(inRange)?.start;
  return next === undefined ? new Set<number>() : idSet(notes.filter(n => n.start === next));
});

/** Notes starting exactly at the insert cursor: the next fret click goes in front of these. */
export const cursorIds = computed(() => idSet(song.value.notes.filter(n => n.start === cursor.value)));

export const softSource = computed<'live' | 'selection' | 'loop' | 'bar'>(() => {
  if (fretMode.value === 'live') return 'live';
  if (selection.value.size) return 'selection';
  if (loopOn.value && loop.value) return 'loop';
  return 'bar';
});

/** Soft highlight: the notes you'd be "watching" on someone's neck. */
export const softIds = computed<Set<number>>(() => {
  const s = song.value;
  switch (softSource.value) {
    case 'live': return new Set();
    case 'selection': return selection.value;
    case 'loop': return idSet(notesInRange(s.notes, loop.value!.start, loop.value!.end));
    default: {
      const len = barTicks(s.timeSig);
      const b = Math.floor(playhead.value / len) * len;
      return idSet(notesInRange(s.notes, b, b + len));
    }
  }
});

// ---- persistence ----
const LS_KEY = 'jfret:last';

function payloadFromHash(): string | null {
  const m = location.hash.match(/[#&]s=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

export function shareUrl(): string {
  return `${location.origin}${location.pathname}#s=${encodeSong(song.value)}`;
}

export function loadInitial() {
  const p = payloadFromHash();
  if (p) {
    try {
      song.value = decodeSong(p);
      // Reloading your own last-saved riff stays in edit mode; someone else's link opens in the player view.
      let own: string | null = null;
      try { own = localStorage.getItem(LS_KEY); } catch { /* storage unavailable */ }
      if (p !== own && song.value.notes.length) editMode.value = false;
    } catch {
      errorMsg.value = "That link couldn't be read, so an empty riff was loaded.";
    }
  } else {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) song.value = decodeSong(saved);
    } catch { /* storage unavailable or corrupt: start empty */ }
  }
  cursor.value = songEndTick(song.value);
}

let saveTimer: number | undefined;
export function startAutosave() {
  let first = true;
  effect(() => {
    const payload = encodeSong(song.value);
    const isFirst = first;
    first = false;
    // Initial load: don't overwrite the saved riff, and keep a bad link visible.
    const skipUrl = isFirst && errorMsg.peek() !== null;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (!skipUrl) {
        try { window.history.replaceState(null, '', `#s=${payload}`); } catch { /* ignore */ }
      }
      if (!isFirst) {
        try { localStorage.setItem(LS_KEY, payload); } catch { /* ignore */ }
      }
    }, 300);
  });
  // A different link pasted into the same tab.
  window.addEventListener('hashchange', () => {
    const p = payloadFromHash();
    if (!p || p === encodeSong(song.value)) return;
    try {
      commit(decodeSong(p));
      selection.value = new Set();
      cursor.value = songEndTick(song.value);
    } catch {
      errorMsg.value = "That link couldn't be read.";
    }
  });
}

// ---- note length palette ----
function applyLengthToSelection() {
  if (selection.value.size) commit(setDuration(song.value, selection.value, entryDur.value));
}

/** Pick the length for new notes; with notes selected, also resets them to it. */
export function setBaseLength(ticks: number) {
  baseLength.value = ticks;
  if (triplet.value) setTripletGrid(true); // keep the grid on the matching triplet
  applyLengthToSelection();
}

export function toggleDotted() {
  batch(() => {
    dotted.value = !dotted.value;
    if (dotted.value && triplet.value) setTripletGrid(false);
  });
  applyLengthToSelection();
}

const TRIPLET_GRIDS = [16, 8, 4]; // quarter, 8th, 16th triplet grids offered in the toolbar
function setTripletGrid(on: boolean) {
  triplet.value = on;
  if (on) {
    // Snap edits to the matching triplet grid (finest offered if the note is shorter).
    grid.value = TRIPLET_GRIDS.find(g => g <= entryDur.value) ?? 4;
  } else if (grid.value % 3 !== 0) {
    grid.value = 12; // was on a triplet grid: back to straight 8ths
  }
}

/** Triplet toggle: notes become two thirds as long (three in the space of two). Excludes dotted. */
export function toggleTriplet() {
  batch(() => {
    if (!triplet.value) dotted.value = false;
    setTripletGrid(!triplet.value);
  });
  applyLengthToSelection();
}

// ---- sequencer-style editing: clipboard, duplicate, fine-tune ----
let clipboard: NewNote[] = [];

export function copySelection() {
  if (selection.value.size) clipboard = copyNotes(song.value, selection.value);
}

export function cutSelection() {
  if (!selection.value.size) return;
  copySelection();
  deleteSelection();
}

/** Paste at the insert cursor; the pasted notes come in selected so you can tweak them straight away. */
export function pasteAtCursor() {
  if (!clipboard.length) return;
  const at = cursor.value;
  const { song: next, ids } = pasteNotes(song.value, clipboard, at);
  const span = Math.max(...clipboard.map(c => c.start + c.dur));
  batch(() => {
    commit(next);
    selection.value = ids;
    cursor.value = at + span;
  });
}

export function duplicateSelection() {
  if (!selection.value.size) return;
  const s = song.value;
  const { song: next, ids } = duplicateNotes(s, selection.value, barTicks(s.timeSig), beatTicks(s.timeSig));
  batch(() => {
    commit(next);
    selection.value = ids;
  });
}

/** Alt+↑/↓ or mouse wheel: move the selected notes a semitone along their strings. Hear it when stopped. */
export function nudgeFrets(d: number, ids: Set<number> = selection.value) {
  if (!ids.size) return;
  commit(shiftFrets(song.value, ids, d));
  if (!playing.value) {
    const first = song.value.notes.find(n => ids.has(n.id));
    if (first) previewNote(first.string, first.fret);
  }
}

/** Click a bar label: select that bar's notes and put the cursor at its start. */
export function selectBar(b: number) {
  const bar = barTicks(song.value.timeSig);
  selection.value = new Set(notesInRange(song.value.notes, b * bar, (b + 1) * bar).map(n => n.id));
  cursor.value = b * bar;
  lastInsertStart = null;
  if (!playing.value) seek(b * bar);
}

// ---- scale guide (per-viewer, not part of the share link) ----
export type LabelMode = 'fret' | 'note' | 'interval';
export type Guide = { on: boolean; root: number | null; scale: ScaleId; labels: LabelMode };
const GUIDE_KEY = 'jfret:guide';
function loadGuide(): Guide {
  const d: Guide = { on: false, root: null, scale: 'song', labels: 'fret' };
  try { return { ...d, ...JSON.parse(localStorage.getItem(GUIDE_KEY) ?? '{}') }; } catch { return d; }
}
export const guide = signal<Guide>(loadGuide());
effect(() => { try { localStorage.setItem(GUIDE_KEY, JSON.stringify(guide.value)); } catch { /* ignore */ } });
export function setGuide(patch: Partial<Guide>) {
  guide.value = { ...guide.value, ...patch };
}
/** Root pitch class in use: the chosen one, or a guess from the riff (its lowest note). */
export const guideRoot = computed(() => guide.value.root ?? guessRoot(song.value));
/** Pitch classes of the guide scale. "Notes in this riff" uses exactly the riff's notes. */
export const guideScale = computed(() =>
  guide.value.scale === 'song' ? songPitchClasses(song.value) : scalePitchClasses(guideRoot.value, SCALES[guide.value.scale]));
