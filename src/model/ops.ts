import { MAX_FRET, MAX_TICKS, Note, STRINGS, Song, newId, normalizeNotes, openPitch, sortNotes } from './song';

export type NewNote = Omit<Note, 'id'>;

const clampNote = (n: Note): Note => {
  const start = Math.min(Math.max(0, n.start), MAX_TICKS - 1);
  const dur = Math.min(Math.max(1, n.dur), MAX_TICKS - start);
  return start === n.start && dur === n.dur ? n : { ...n, start, dur };
};

// Every op funnels through here, so the one-note-per-string rule always holds. `prefer`: the notes being operated on win ties.
const withNotes = (song: Song, notes: Note[], prefer?: Set<number>): Song =>
  ({ ...song, notes: normalizeNotes(notes.map(clampNote), prefer) });

const clampDur = (n: Note, dur: number) => Math.min(Math.max(1, Math.round(dur)), MAX_TICKS - n.start);

export function addNote(song: Song, n: NewNote): { song: Song; id: number } {
  const id = newId();
  return { song: withNotes(song, [...song.notes, { ...n, id }], new Set([id])), id };
}

export function deleteNotes(song: Song, ids: Set<number>): Song {
  return withNotes(song, song.notes.filter(n => !ids.has(n.id)));
}

export function moveNotes(song: Song, ids: Set<number>, dTicks: number, dString: number): Song {
  const sel = song.notes.filter(n => ids.has(n.id));
  if (!sel.length) return song;
  const minStart = Math.min(...sel.map(n => n.start));
  const maxEnd = Math.max(...sel.map(n => n.start + n.dur));
  const dt = Math.max(Math.min(dTicks, MAX_TICKS - maxEnd), -minStart);
  const ds = sel.every(n => n.string + dString >= 0 && n.string + dString < STRINGS) ? dString : 0;
  return withNotes(song, song.notes.map(n => {
    if (!ids.has(n.id)) return n;
    const string = n.string + ds;
    let fret = n.fret;
    if (ds) {
      const f = openPitch(song.tuning, n.string) + n.fret - openPitch(song.tuning, string);
      if (f >= 0 && f <= MAX_FRET) fret = f;
    }
    return { ...n, start: n.start + dt, string, fret };
  }), ids); // a moved note replaces whatever it lands on, on its string
}

export function resizeNotes(song: Song, ids: Set<number>, dTicks: number): Song {
  return withNotes(song, song.notes.map(n => (ids.has(n.id) ? { ...n, dur: clampDur(n, n.dur + dTicks) } : n)));
}

export function setDuration(song: Song, ids: Set<number>, dur: number): Song {
  return withNotes(song, song.notes.map(n => (ids.has(n.id) ? { ...n, dur: clampDur(n, dur) } : n)));
}

export function quantize(song: Song, ids: Set<number>, grid: number, strength: number, ends: boolean): Song {
  const snap = (t: number) => Math.round(t + (Math.round(t / grid) * grid - t) * strength);
  // Slots already used on each string. Two notes on one string that snap to the same slot would
  // stack (impossible on a guitar), so the later one steps forward to the next free grid slot.
  const taken = new Set(song.notes.filter(n => !ids.has(n.id)).map(n => `${n.string}:${n.start}`));
  const moved = new Map<number, Note>();
  for (const n of sortNotes(song.notes.filter(n => ids.has(n.id)))) {
    let start = snap(n.start);
    while (taken.has(`${n.string}:${start}`)) start += grid;
    taken.add(`${n.string}:${start}`);
    let dur = n.dur;
    if (ends) {
      let end = snap(n.start + n.dur);
      if (end <= start) end = start + grid;
      dur = end - start;
    }
    moved.set(n.id, { ...n, start, dur });
  }
  return withNotes(song, song.notes.map(n => moved.get(n.id) ?? n), ids);
}

// gaps: note id -> ms since the previous fretboard click (recorded at entry time).
// Assumes notes were entered in time order, so each onset group's gap is that of its lowest-id note.
export function applyFeel(song: Song, ids: Set<number>, gaps: Map<number, number>, grid: number): Song {
  const sel = song.notes.filter(n => ids.has(n.id));
  const onsets = [...new Set(sel.map(n => n.start))].sort((a, b) => a - b);
  if (onsets.length < 2) return song;
  const groupGap = (start: number) => {
    const first = sel.filter(n => n.start === start).sort((a, b) => a.id - b.id)[0];
    return gaps.get(first.id);
  };
  const known = onsets.slice(1).map(groupGap).filter((g): g is number => g !== undefined && g > 0);
  if (!known.length) return song;
  const mean = known.reduce((a, b) => a + b, 0) / known.length;
  const scale = grid / mean;
  const newStart = new Map<number, number>(); // old onset -> new onset
  let t = onsets[0];
  newStart.set(onsets[0], t);
  for (let i = 1; i < onsets.length; i++) {
    const g = groupGap(onsets[i]);
    t += Math.max(1, Math.round((g !== undefined && g > 0 ? g : mean) * scale));
    newStart.set(onsets[i], t);
  }
  const nextOnset = new Map(onsets.map((s, i) => [s, onsets[i + 1]] as const));
  return withNotes(song, song.notes.map(n => {
    const start = newStart.get(n.start);
    if (start === undefined || !ids.has(n.id)) return n;
    const next = nextOnset.get(n.start);
    const dur = next !== undefined ? Math.max(1, newStart.get(next)! - start) : n.dur;
    return { ...n, start, dur };
  }), ids);
}

export function evenOut(song: Song, ids: Set<number>, grid: number): Song {
  const sel = song.notes.filter(n => ids.has(n.id));
  if (!sel.length) return song;
  const uniq = [...new Set(sel.map(n => n.start))].sort((a, b) => a - b);
  const index = new Map(uniq.map((s, i) => [s, i] as const));
  const base = uniq[0];
  return withNotes(song, song.notes.map(n =>
    ids.has(n.id) ? { ...n, start: base + index.get(n.start)! * grid, dur: grid } : n), ids);
}

export function legato(song: Song, ids: Set<number>): Song {
  const onsets = [...new Set(song.notes.map(n => n.start))].sort((a, b) => a - b);
  return withNotes(song, song.notes.map(n => {
    if (!ids.has(n.id)) return n;
    const next = onsets.find(s => s > n.start);
    return next === undefined ? n : { ...n, dur: next - n.start };
  }));
}

/** Ripple: push every note starting at or after `from` later by `dTicks` (used for inserting before a note). */
export function shiftFrom(song: Song, from: number, dTicks: number): Song {
  if (!song.notes.some(n => n.start >= from)) return song;
  return withNotes(song, song.notes.map(n => (n.start >= from ? { ...n, start: n.start + dTicks } : n)));
}

// ---- clipboard / sequencer helpers ----

/** Notes as a clip: timing relative to the earliest selected note, ready to paste anywhere. */
export function copyNotes(song: Song, ids: Set<number>): NewNote[] {
  const sel = song.notes.filter(n => ids.has(n.id));
  if (!sel.length) return [];
  const t0 = Math.min(...sel.map(n => n.start));
  return sel.map(({ id: _id, ...n }) => ({ ...n, start: n.start - t0 }));
}

/** Paste a clip with its first note at `at`. Pasted notes replace anything on their string at the same time. */
export function pasteNotes(song: Song, clip: NewNote[], at: number): { song: Song; ids: Set<number> } {
  const added = clip.map(c => ({ ...c, start: c.start + at, id: newId() }));
  const ids = new Set(added.map(n => n.id));
  return { song: withNotes(song, [...song.notes, ...added], ids), ids };
}

/**
 * Copy the selection right after itself. A selection that starts on a bar line and fills most of a bar
 * jumps a whole number of bars (so a looped bar duplicates into the next bar); shorter phrases follow
 * on at the next beat.
 */
export function duplicateNotes(song: Song, ids: Set<number>, barLen: number, beatLen: number): { song: Song; ids: Set<number> } {
  const sel = song.notes.filter(n => ids.has(n.id));
  if (!sel.length) return { song, ids: new Set() };
  const start = Math.min(...sel.map(n => n.start));
  const span = Math.max(...sel.map(n => n.start + n.dur)) - start;
  const barish = start % barLen === 0 && span > barLen / 2;
  const unit = barish ? barLen : beatLen;
  const offset = Math.max(unit, Math.ceil(span / unit) * unit);
  return pasteNotes(song, copyNotes(song, ids), start + offset);
}

/** Nudge pitch by semitones on the same string (fine-tuning a phrase while it loops). */
export function shiftFrets(song: Song, ids: Set<number>, d: number): Song {
  return withNotes(song, song.notes.map(n =>
    ids.has(n.id) ? { ...n, fret: Math.min(MAX_FRET, Math.max(0, n.fret + d)) } : n), ids);
}
