// Speed: write your own riff. Two ways into the same riff: a tab grid you type frets into (like Guitar Pro), or the
// neck: pick a note length, click frets, each click fills the current step and moves on (Shift adds to it: a chord).
import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import type { NeckMark } from './Neck';
import { CustomRiff, GuideScale, deleteStep, emptyStep, insertStep, newRiff, readRiffs, setDur, setFret, setStepNotes, stepStart } from '../speed/custom';
import { PITCH_NAMES, SCALES, SCALE_NAMES, ScaleId, intervalName, pc, romanOf, scaleChords } from '../model/theory';
import { MAX_FRET } from '../model/song';
import { Pos, STD, keyName } from '../learn/fretmap';
import { getCtx, playPluck } from '../audio/synth';
import { fretHue, intervalHue } from './colors';

const KEY = 'jfret:speed-riffs';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } };
export const riffs = signal<CustomRiff[]>(readRiffs(read()));
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(riffs.value)); } catch { /* ignore */ } };

export function saveRiff(r: CustomRiff) {
  riffs.value = riffs.value.some(x => x.id === r.id) ? riffs.value.map(x => (x.id === r.id ? r : x)) : [...riffs.value, r];
  persist();
}
export function createRiff(): CustomRiff {
  const r = newRiff(`r${Date.now().toString(36)}`, `Riff ${riffs.value.length + 1}`, entryDur.value, Date.now());
  saveRiff(r);
  cursor.value = { col: 0, string: 5 };
  return r;
}
export function removeRiff(id: string) {
  riffs.value = riffs.value.filter(r => r.id !== id);
  persist();
}

/** Where typing goes: a step (column) and a string. */
export const cursor = signal({ col: 0, string: 5 });
/** Note length for new steps (and the selected one when you pick a length). */
export const entryDur = signal(12);

export const LENGTHS: [number, string, string][] = [
  [24, '♩', 'Quarter'], [12, '♪', '8th'], [8, '♪³', '8th triplet'], [6, '16', '16th'], [4, '16³', '16th triplet (sextuplet)'], [3, '32', '32nd'],
];
const lenLabel = (d: number) => LENGTHS.find(l => l[0] === d)?.[1] ?? String(d);

function pluck(p: Pos) {
  const c = getCtx();
  void c.resume();
  playPluck(c, STD[p.string] + p.fret, c.currentTime + 0.01, 0.6);
}

/** Pitch classes the guide shows. */
export function guidePcs(r: CustomRiff): Set<number> {
  return r.scale === 'custom' ? new Set(r.custom) : new Set(SCALES[r.scale].map(s => pc(r.key + s)));
}

/** The highlighted chord's pitch classes and its root, if one is picked. */
export function guideChord(r: CustomRiff): { pcs: Set<number>; root: number } | null {
  if (!r.chord || r.scale === 'custom') return null;
  const ch = scaleChords(SCALES[r.scale], r.chord.seventh)[r.chord.deg] ?? scaleChords(SCALES[r.scale], r.chord.seventh)[0];
  return { pcs: new Set(ch.offsets.map(o => pc(r.key + o))), root: pc(r.key + ch.offsets[0]) };
}

/** The neck while editing: the guide scale faintly, the riff's spots, the current step bright. */
export function editorMarks(r: CustomRiff, viewHi: number): Map<string, NeckMark> {
  const m = new Map<string, NeckMark>();
  const pcs = guidePcs(r);
  const chord = guideChord(r);
  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= viewHi; f++) {
      const p = pc(STD[s] + f);
      if (!pcs.has(p)) continue;
      const inChord = !!chord?.pcs.has(p);
      const ref = chord ? chord.root : r.key; // with a chord lit, label everything from the chord's root
      m.set(`${s}:${f}`, {
        label: r.scale === 'custom' ? PITCH_NAMES[p] : intervalName(p, ref),
        cls: `scale${p === ref && r.scale !== 'custom' ? ' root' : ''}${chord ? (inChord ? ' chordtone' : ' faint') : ''}`,
        style: { '--ic': intervalHue(p - ref) } as JSX.CSSProperties,
      });
    }
  }
  r.steps.forEach(st => st.frets.forEach((f, s) => {
    if (f !== null) m.set(`${s}:${f}`, { label: String(f), cls: 'soft tint', style: { '--h': fretHue(f) } as JSX.CSSProperties });
  }));
  const cur = r.steps[cursor.value.col];
  cur?.frets.forEach((f, s) => { if (f !== null) m.set(`${s}:${f}`, { label: String(f), cls: 'hot' }); });
  return m;
}

/** A fret clicked on the neck: into the current step, then on to the next one (Shift: add to this step instead). */
export function neckEntry(r: CustomRiff, p: Pos, add: boolean) {
  const { col } = cursor.value;
  // Shift onto an empty step (you just moved past a note): stack onto that previous note, as in Play.
  const target = add && col > 0 && !r.steps[col]?.frets.some(f => f !== null) ? col - 1 : col;
  let next = setStepNotes(r, target, [p], entryDur.value, add);
  if (!add && col + 1 >= next.steps.length) next = { ...next, steps: [...next.steps, emptyStep(entryDur.value)] };
  saveRiff(next);
  cursor.value = { col: add ? col : col + 1, string: p.string };
  pluck(p);
}

let typed = { text: '', at: 0, cell: '' };

export function RiffEditor({ riff: r }: { riff: CustomRiff }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const cur = cursor.value;
  const col = Math.min(cur.col, r.steps.length);
  // Keep the cursor's column in view.
  useEffect(() => {
    const el = gridRef.current?.querySelector('.rf-col.cur') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [col, r.steps.length]);

  const move = (dc: number, ds = 0) => {
    let c = Math.max(0, cur.col + dc);
    let steps = r.steps;
    if (c >= steps.length) { // moving past the end opens a new step to type into
      if (steps[steps.length - 1].frets.some(f => f !== null)) { saveRiff({ ...r, steps: [...steps, emptyStep(entryDur.value)] }); }
      else c = steps.length - 1;
    }
    cursor.value = { col: c, string: Math.max(0, Math.min(5, cur.string + ds)) };
  };

  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    let handled = true;
    if (/^[0-9]$/.test(k) && !e.ctrlKey && !e.metaKey) {
      // Two digits within a second = a two-digit fret (1, 2 → 12), like Guitar Pro.
      const cell = `${cur.col}:${cur.string}`, now = Date.now();
      let text = typed.cell === cell && now - typed.at < 1000 && typed.text.length === 1 ? typed.text + k : k;
      if (Number(text) > MAX_FRET) text = k;
      typed = { text, at: now, cell };
      saveRiff(setFret(r, cur.col, cur.string, Number(text), entryDur.value));
      pluck({ string: cur.string, fret: Number(text) });
    } else if (k === 'Backspace' || k === 'Delete') {
      if (e.shiftKey || e.ctrlKey) { saveRiff(deleteStep(r, cur.col)); cursor.value = { ...cur, col: Math.max(0, Math.min(cur.col, r.steps.length - 2)) }; }
      else if (r.steps[cur.col]?.frets[cur.string] != null) saveRiff(setFret(r, cur.col, cur.string, null, entryDur.value));
      else if (k === 'Backspace') move(-1);
    } else if (k === 'ArrowLeft') move(-1);
    else if (k === 'ArrowRight') move(1);
    else if (k === 'ArrowUp') move(0, -1);
    else if (k === 'ArrowDown') move(0, 1);
    else if (k === 'Insert' || k.toLowerCase() === 'i') saveRiff(insertStep(r, cur.col, entryDur.value));
    else if (k === '+' || k === '=' || k === '-') {
      // Longer / shorter note for this step.
      const i = LENGTHS.findIndex(l => l[0] === (r.steps[cur.col]?.dur ?? entryDur.value));
      const ni = Math.max(0, Math.min(LENGTHS.length - 1, (i < 0 ? 1 : i) + (k === '-' ? 1 : -1)));
      entryDur.value = LENGTHS[ni][0];
      saveRiff(setDur(r, cur.col, LENGTHS[ni][0]));
    } else if (k === 'Escape') gridRef.current?.blur();
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); } // keep Speed's arrow keys (tempo) out of it
  };

  const pickLength = (d: number) => {
    entryDur.value = d;
    if (cur.col < r.steps.length) saveRiff(setDur(r, cur.col, d));
  };
  const pcs = guidePcs(r);
  const toggleNote = (p: number) => {
    const set = new Set(pcs);
    if (set.has(p)) set.delete(p); else set.add(p);
    saveRiff({ ...r, scale: 'custom', custom: [...set].sort((a, b) => a - b), updated: Date.now() });
  };

  return (
    <div class="rf-editor">
      <div class="row rf-tools">
        <span class="seg small" role="group" aria-label="Note length" title="Note length for new steps (and the selected step)">
          {LENGTHS.map(([d, icon, name]) => (
            <button key={d} class={entryDur.value === d ? 'on' : ''} title={name} onClick={() => pickLength(d)}>{icon}</button>
          ))}
        </span>
        <button class="mini" onClick={() => saveRiff(setStepNotes(r, cur.col, [], entryDur.value))} title="Make this step a rest">Rest</button>
        <button class="mini" onClick={() => saveRiff(insertStep(r, cur.col, entryDur.value))} title="Insert a step here (I)">＋ Step</button>
        <button class="mini" onClick={() => { saveRiff(deleteStep(r, cur.col)); cursor.value = { ...cur, col: Math.max(0, Math.min(cur.col, r.steps.length - 2)) }; }} title="Delete this step (Shift+Delete)">− Step</button>
        <span class="spacer" />
        <label class="muted">Guide{' '}
          <select value={String(r.key)} title="Key" onChange={e => { saveRiff({ ...r, key: Number(e.currentTarget.value), updated: Date.now() }); e.currentTarget.blur(); }}>
            {PITCH_NAMES.map((_, i) => <option key={i} value={String(i)}>{keyName(i)}</option>)}
          </select>
        </label>
        <select value={r.scale} title="Scale shown on the neck" onChange={e => { saveRiff({ ...r, scale: e.currentTarget.value as GuideScale, custom: r.scale === 'custom' ? r.custom : [...pcs], updated: Date.now() }); e.currentTarget.blur(); }}>
          {(Object.keys(SCALE_NAMES) as ScaleId[]).filter(s => s !== 'song').map(s => <option key={s} value={s}>{SCALE_NAMES[s]}</option>)}
          <option value="custom">My notes</option>
        </select>
        {r.scale !== 'custom' && (() => {
          const opts = scaleChords(SCALES[r.scale], !!r.chord?.seventh);
          return (<>
            <select value={r.chord ? String(r.chord.deg) : ''} title="Light up one chord's notes: its tones bright, the rest of the scale faint"
              onChange={e => { const v = e.currentTarget.value; saveRiff({ ...r, chord: v === '' ? null : { deg: Number(v), seventh: !!r.chord?.seventh }, updated: Date.now() }); e.currentTarget.blur(); }}>
              <option value="">Whole scale</option>
              {opts.map(o => <option key={o.deg} value={String(o.deg)}>{romanOf(o.deg, o.quality)} chord ({keyName(pc(r.key + o.offsets[0]))}{o.quality})</option>)}
            </select>
            {r.chord && <label class="muted"><input type="checkbox" checked={r.chord.seventh} onChange={() => saveRiff({ ...r, chord: { ...r.chord!, seventh: !r.chord!.seventh }, updated: Date.now() })} /> 7th</label>}
          </>);
        })()}
      </div>
      <div class="rf-notes" title="Click notes to choose your own set (switches the guide to My notes)">
        {PITCH_NAMES.map((n, p) => (
          <button key={p} class={`mini${pcs.has(p) ? ' on' : ''}${p === r.key && r.scale !== 'custom' ? ' root' : ''}`} onClick={() => toggleNote(p)}>{keyName(p) === n ? n : keyName(p)}</button>
        ))}
      </div>

      <div class="rf-grid" ref={gridRef} tabIndex={0} onKeyDown={onKey} aria-label="Riff tab: click a spot and type a fret">
        <div class="rf-strings">{['e', 'B', 'G', 'D', 'A', 'E'].map(s => <span key={s}>{s}</span>)}</div>
        {r.steps.map((st, i) => {
          const start = stepStart(r, i);
          const barLine = start > 0 && start % 96 === 0, beatLine = start > 0 && start % 24 === 0;
          return (
            <div key={i} class={`rf-col${i === col ? ' cur' : ''}${barLine ? ' bar' : beatLine ? ' beat' : ''}`}>
              <span class="rf-dur" title="Note length of this step">{lenLabel(st.dur)}</span>
              {st.frets.map((f, s) => (
                <span key={s} class={`rf-cell${i === col && s === cur.string ? ' cur' : ''}`}
                  onPointerDown={e => { e.preventDefault(); cursor.value = { col: i, string: s }; gridRef.current?.focus(); }}>
                  {f ?? ''}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <p class="hints rf-hints">
        <span>Click a spot, type the fret (<kbd>1</kbd> <kbd>2</kbd> = 12)</span>
        <span><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> move</span>
        <span><kbd>−</kbd>/<kbd>+</kbd> shorter / longer</span>
        <span><kbd>Del</kbd> clear · <kbd>Shift</kbd>+<kbd>Del</kbd> remove step · <kbd>I</kbd> insert</span>
        <span>Or click the neck: each fret fills a step and moves on; <kbd>Shift</kbd>+click adds to the step (chord)</span>
      </p>
    </div>
  );
}

