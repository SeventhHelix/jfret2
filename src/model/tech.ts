// Playing techniques (bends, vibrato, slides, hammer-ons/pull-offs, palm mute, harmonics, dead notes): pure helpers.
import { Note, Song, Tech, normalizeNotes } from './song';

export type TechFlag = 'vibrato' | 'slide' | 'legato' | 'mute' | 'harmonic' | 'dead' | 'release';

export const BEND_LABEL: Record<number, string> = { 1: '½', 2: 'full', 3: '1½', 4: '2' };

/** Drop empty fields; no techniques at all -> undefined (keeps notes and share links small). */
export function cleanTech(t: Tech | undefined): Tech | undefined {
  if (!t) return undefined;
  const out: Tech = {};
  if (t.bend && t.bend > 0) { out.bend = Math.min(4, Math.round(t.bend)); if (t.release) out.release = true; }
  for (const k of ['vibrato', 'slide', 'legato', 'mute', 'harmonic', 'dead'] as const) if (t[k]) out[k] = true;
  return Object.keys(out).length ? out : undefined;
}

function withTech(song: Song, ids: Set<number>, f: (t: Tech) => Tech): Song {
  const notes = song.notes.map(n => {
    if (!ids.has(n.id)) return n;
    const tech = cleanTech(f({ ...n.tech }));
    const { tech: _old, ...rest } = n;
    return tech ? { ...rest, tech } : rest;
  });
  return { ...song, notes: normalizeNotes(notes) };
}

/** True when every one of the notes has the flag (a release only counts on a bent note). */
export function allHave(notes: Note[], flag: TechFlag): boolean {
  return notes.length > 0 && notes.every(n => !!n.tech?.[flag]);
}

/** Turn a flag on for all the notes, or off if they all have it already. */
export function toggleTech(song: Song, ids: Set<number>, flag: TechFlag): Song {
  const on = !allHave(song.notes.filter(n => ids.has(n.id)), flag);
  return withTech(song, ids, t => {
    const next = { ...t, [flag]: on };
    if (flag === 'release' && on && !next.bend) next.bend = 2; // a release needs a bend; default to a full bend
    return next;
  });
}

/** Set the bend amount in semitones (0 removes the bend and its release). */
export function setBend(song: Song, ids: Set<number>, semis: number): Song {
  return withTech(song, ids, t => (semis > 0 ? { ...t, bend: semis } : { ...t, bend: undefined, release: undefined }));
}

/** Bend button / key: off -> ½ -> full -> 1½ -> 2 -> off, following the first note. */
export function cycleBend(song: Song, ids: Set<number>): Song {
  const first = song.notes.find(n => ids.has(n.id));
  const cur = first?.tech?.bend ?? 0;
  return setBend(song, ids, cur >= 4 ? 0 : cur + 1);
}

/** Next / previous note on the same string (for slides and hammer-ons/pull-offs). */
export function nextOnString(notes: Note[], n: Note): Note | undefined {
  let best: Note | undefined;
  for (const m of notes) if (m.string === n.string && m.start > n.start && (!best || m.start < best.start)) best = m;
  return best;
}
export function prevOnString(notes: Note[], n: Note): Note | undefined {
  let best: Note | undefined;
  for (const m of notes) if (m.string === n.string && m.start < n.start && (!best || m.start > best.start)) best = m;
  return best;
}

/** Natural harmonic: semitones above the open string for a harmonic touched at this fret. */
export function harmonicShift(fret: number): number {
  const at: Record<number, number> = { 12: 12, 7: 19, 19: 19, 5: 24, 24: 24, 4: 28, 9: 28, 16: 28, 3: 31 };
  return at[fret] ?? fret; // off the natural nodes it just sounds the fretted note
}

/** Short marks for small spaces (timeline blocks): b½ / bfull~ etc. */
export function techMarks(t: Tech | undefined): string {
  if (!t) return '';
  return [
    t.bend ? `b${BEND_LABEL[t.bend] ?? t.bend}${t.release ? 'r' : ''}` : '',
    t.vibrato ? '~' : '', t.slide ? '/' : '', t.legato ? 'h' : '', t.mute ? 'PM' : '', t.harmonic ? '◇' : '',
  ].filter(Boolean).join(' ');
}
