import { batch, computed, effect, signal } from '@preact/signals';
import { Song, barTicks, emptySong, notesInRange, pitchOf, songEndTick, soundingAt } from '../model/song';
import { addNote, deleteNotes, shiftFrom } from '../model/ops';
import { History } from '../model/history';
import { decodeSong, encodeSong } from '../codec/codec';
import { Player } from '../audio/player';

export type Loop = { start: number; end: number };
export type FretMode = 'live' | 'bar';

export const DEFAULT_DUR = 12; // an 8th note

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

export function setLoopFromSelection() {
  const sel = song.value.notes.filter(n => selection.value.has(n.id));
  if (!sel.length) return;
  loop.value = { start: Math.min(...sel.map(n => n.start)), end: Math.max(...sel.map(n => n.start + n.dur)) };
  loopOn.value = true;
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
 * - Normal: insert an 8th at the cursor. If a note already starts within that 8th, ripple it
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
    const { song: next } = addNote(base, { start, dur: partner?.dur ?? DEFAULT_DUR, string, fret });
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
  const collides = s0.notes.some(n => n.start >= start && n.start < start + DEFAULT_DUR);
  const base = collides ? shiftFrom(s0, start, DEFAULT_DUR) : s0;
  const { song: next, id } = addNote(base, { start, dur: DEFAULT_DUR, string, fret });
  if (lastClick && now - lastClick < PHRASE_GAP_MS) feel.set(id, now - lastClick);
  lastClick = now;
  lastInsertStart = start;
  batch(() => {
    commit(next);
    cursor.value = start + DEFAULT_DUR;
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
