// "My tabs": songs saved in this browser (localStorage), each with its notes and its own practice settings.
// One entry is one logical song: edits keep saving into it even though the URL changes as you go.

/** A named part of a song you come back to (a sweep run, the alternate-picking bit): a tick range. */
export type Mark = { id: string; name: string; start: number; end: number };

export type TabEntry = {
  id: string;
  title: string;
  payload: string;  // the riff, as in the link's #s=
  practice: string; // its practice/sound params, as in the link ("&sp=75&lp=...")
  created: number;
  updated: number;
  marks?: Mark[];   // sections you marked (or the Guitar Pro file's own section names)
};

export function newTabId(): string {
  try { return crypto.randomUUID(); } catch { return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }
}

/** Saved JSON -> entries, dropping anything malformed. */
export function readLibrary(raw: unknown): TabEntry[] {
  if (!Array.isArray(raw)) return [];
  const ok = (e: Partial<TabEntry>) => typeof e?.id === 'string' && typeof e.payload === 'string' && e.payload.length > 0;
  return raw.filter(ok).map((e: TabEntry) => ({
    id: e.id, title: typeof e.title === 'string' ? e.title : '', payload: e.payload,
    practice: typeof e.practice === 'string' ? e.practice : '',
    created: Number(e.created) || 0, updated: Number(e.updated) || 0,
    ...(Array.isArray(e.marks) ? { marks: readMarks(e.marks) } : {}),
  }));
}

function readMarks(raw: unknown[]): Mark[] {
  return raw.filter((m): m is Mark => !!m && typeof m === 'object' && typeof (m as Mark).id === 'string'
    && Number.isFinite((m as Mark).start) && Number.isFinite((m as Mark).end) && (m as Mark).end > (m as Mark).start)
    .map(m => ({ id: m.id, name: String(m.name ?? ''), start: m.start, end: m.end }));
}

/** Replace an entry's sections (kept in song order). */
export function setMarks(lib: TabEntry[], id: string, marks: Mark[], now: number): TabEntry[] {
  return lib.map(x => (x.id === id ? { ...x, marks: [...marks].sort((a, b) => a.start - b.start || a.end - b.end), updated: now } : x));
}

export function addTab(lib: TabEntry[], e: Omit<TabEntry, 'id' | 'created' | 'updated'>, now: number, id = newTabId()): { lib: TabEntry[]; id: string } {
  return { lib: [{ ...e, id, created: now, updated: now }, ...lib], id };
}

/** Save the open song into its entry. Unchanged content leaves the entry (and its "updated" time) alone. */
export function updateTab(lib: TabEntry[], id: string, e: Pick<TabEntry, 'title' | 'payload' | 'practice'>, now: number): TabEntry[] {
  return lib.map(x => (x.id === id && (x.title !== e.title || x.payload !== e.payload || x.practice !== e.practice)
    ? { ...x, ...e, updated: now } : x));
}

export function removeTab(lib: TabEntry[], id: string): TabEntry[] {
  return lib.filter(x => x.id !== id);
}

/** The entry holding exactly this riff, preferring `prefer` when several do. */
export function findTab(lib: TabEntry[], payload: string, prefer?: string | null): TabEntry | undefined {
  return lib.find(x => x.id === prefer && x.payload === payload) ?? lib.find(x => x.payload === payload);
}

/** Most recently worked on first. */
export const byRecent = (lib: TabEntry[]) => [...lib].sort((a, b) => b.updated - a.updated);

export function timeAgo(t: number, now: number): string {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(t).toLocaleDateString();
}
