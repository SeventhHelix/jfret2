import { MAX_FRET, Note, STRINGS, Song, newId, openPitch, sortNotes } from './song';

export type NewNote = Omit<Note, 'id'>;

const withNotes = (song: Song, notes: Note[]): Song => ({ ...song, notes: sortNotes(notes) });

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
  const dt = Math.max(dTicks, -minStart);
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
  return withNotes(song, song.notes.map(n => (ids.has(n.id) ? { ...n, dur: Math.max(1, n.dur + dTicks) } : n)));
}

export function setDuration(song: Song, ids: Set<number>, dur: number): Song {
  return withNotes(song, song.notes.map(n => (ids.has(n.id) ? { ...n, dur } : n)));
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
export function applyFeel(song: Song, ids: Set<number>, gaps: Map<number, number>, grid: number): Song {
  const sel = sortNotes(song.notes.filter(n => ids.has(n.id)));
  if (sel.length < 2) return song;
  const known = sel.slice(1).map(n => gaps.get(n.id)).filter((g): g is number => g !== undefined && g > 0);
  if (!known.length) return song;
  const mean = known.reduce((a, b) => a + b, 0) / known.length;
  const scale = grid / mean;
  const newStart = new Map<number, number>();
  let t = sel[0].start;
  newStart.set(sel[0].id, t);
  for (let i = 1; i < sel.length; i++) {
    t += Math.max(1, Math.round((gaps.get(sel[i].id) ?? mean) * scale));
    newStart.set(sel[i].id, t);
  }
  const nextOf = new Map(sel.map((n, i) => [n.id, sel[i + 1]] as const));
  return withNotes(song, song.notes.map(n => {
    const start = newStart.get(n.id);
    if (start === undefined) return n;
    const next = nextOf.get(n.id);
    const dur = next ? Math.max(1, newStart.get(next.id)! - start) : n.dur;
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
