import { MAX_FRET, MAX_TICKS, Note, STRINGS, Song, newId, openPitch, sortNotes } from './song';

export type NewNote = Omit<Note, 'id'>;

const withNotes = (song: Song, notes: Note[]): Song => ({ ...song, notes: sortNotes(notes) });

const clampDur = (n: Note, dur: number) => Math.min(Math.max(1, Math.round(dur)), MAX_TICKS - n.start);

export function addNote(song: Song, n: NewNote): { song: Song; id: number } {
  const id = newId();
  return { song: withNotes(song, [...song.notes, { ...n, id }]), id };
}

export function deleteNotes(song: Song, ids: Set<number>): Song {
  return withNotes(song, song.notes.filter(n => !ids.has(n.id)));
}

export function moveNotes(song: Song, ids: Set<number>, dTicks: number, dString: number): Song {
  const sel = song.notes.filter(n => ids.has(n.id));
  if (!sel.length) return song;
  const minStart = Math.min(...sel.map(n => n.start));
  const maxEnd = Math.max(...sel.map(n => n.start + n.dur));
  const dt = Math.min(Math.max(dTicks, -minStart), MAX_TICKS - maxEnd);
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
  }));
}

export function resizeNotes(song: Song, ids: Set<number>, dTicks: number): Song {
  return withNotes(song, song.notes.map(n => (ids.has(n.id) ? { ...n, dur: clampDur(n, n.dur + dTicks) } : n)));
}

export function setDuration(song: Song, ids: Set<number>, dur: number): Song {
  return withNotes(song, song.notes.map(n => (ids.has(n.id) ? { ...n, dur: clampDur(n, dur) } : n)));
}

export function quantize(song: Song, ids: Set<number>, grid: number, strength: number, ends: boolean): Song {
  const snap = (t: number) => Math.round(t + (Math.round(t / grid) * grid - t) * strength);
  return withNotes(song, song.notes.map(n => {
    if (!ids.has(n.id)) return n;
    const start = snap(n.start);
    let dur = n.dur;
    if (ends) {
      let end = snap(n.start + n.dur);
      if (end <= start) end = start + grid;
      dur = end - start;
    }
    return { ...n, start, dur };
  }));
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
  }));
}

export function evenOut(song: Song, ids: Set<number>, grid: number): Song {
  const sel = song.notes.filter(n => ids.has(n.id));
  if (!sel.length) return song;
  const uniq = [...new Set(sel.map(n => n.start))].sort((a, b) => a - b);
  const index = new Map(uniq.map((s, i) => [s, i] as const));
  const base = uniq[0];
  return withNotes(song, song.notes.map(n =>
    ids.has(n.id) ? { ...n, start: base + index.get(n.start)! * grid, dur: grid } : n));
}

export function legato(song: Song, ids: Set<number>): Song {
  const onsets = [...new Set(song.notes.map(n => n.start))].sort((a, b) => a - b);
  return withNotes(song, song.notes.map(n => {
    if (!ids.has(n.id)) return n;
    const next = onsets.find(s => s > n.start);
    return next === undefined ? n : { ...n, dur: next - n.start };
  }));
}
