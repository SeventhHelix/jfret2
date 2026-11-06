import { useState } from 'preact/hooks';
import { Song } from '../model/song';
import { applyFeel, evenOut, legato, quantize } from '../model/ops';
import { BEND_LABEL, TechFlag, allHave, cycleBend, toggleTech } from '../model/tech';
import {
  NOTE_LENGTHS, applyTech, baseLength, commit, deleteSelection, dotted, feel, grid, selection, setBaseLength, setLoopFromSelection, song,
  toggleTriplet, triplet,
  targetIds, techIds, toggleDotted,
} from '../state/store';

const GRIDS = [
  { label: '1/4', t: 24 },
  { label: '1/4 triplet', t: 16 },
  { label: '1/8', t: 12 },
  { label: '1/16', t: 6 },
  { label: '1/8 triplet', t: 8 },
  { label: '1/16 triplet', t: 4 },
];

export function Toolbar() {
  const [strength, setStrength] = useState(100);
  const [ends, setEnds] = useState(false);
  const count = selection.value.size;
  const apply = (f: (s: Song, ids: Set<number>) => Song) => commit(f(song.value, targetIds()));

  return (
    <div class="panel toolbar">
      <div class="row">
        <span class="muted" style={{ minWidth: 92 }}>Note length</span>
        <span class="seg lengths" role="group" aria-label="Note length">
          {NOTE_LENGTHS.map((l, i) => (
            <button key={l.ticks} class={baseLength.value === l.ticks ? "on" : ""} onClick={() => setBaseLength(l.ticks)}
              title={`${l.name} note (key ${i + 1})`}>{l.label}</button>
          ))}
        </span>
        <button class={`dot-btn${dotted.value ? " on" : ""}`} onClick={toggleDotted} disabled={baseLength.value < 6}
          title="Dotted: one and a half times as long (key .)">● Dotted</button>
        <button class={`dot-btn${triplet.value ? " on" : ""}`} onClick={toggleTriplet}
          title="Triplet: three notes in the time of two (key T). Also switches the grid to triplets.">³ Triplet</button>
        <span class="muted">{count ? `Applies to new notes and resets the ${count} selected` : "Used for new notes"}</span>
      </div>
      <TechRow />
      <div class="row">
      <span class={count ? 'sel-count' : 'muted'} style={{ minWidth: 170 }}>
        {count ? `${count} note${count === 1 ? '' : 's'} selected` : 'Nothing selected: tools affect all notes'}
      </span>
      <label class="muted">
        Grid{' '}
        <select value={grid.value} onChange={e => { grid.value = Number(e.currentTarget.value); e.currentTarget.blur(); }}>
          {GRIDS.map(g => <option key={g.t} value={g.t}>{g.label}</option>)}
        </select>
      </label>
      <button onClick={() => apply((s, ids) => quantize(s, ids, grid.value, strength / 100, ends))}>Quantize</button>
      <label class="muted" title="How far notes move toward the grid">
        Strength{' '}
        <input type="range" min={0} max={100} step={5} value={strength} onInput={e => setStrength(Number(e.currentTarget.value))} />{' '}
        {strength}%
      </label>
      <label class="muted"><input type="checkbox" checked={ends} onChange={e => setEnds(e.currentTarget.checked)} /> Ends</label>
      <button title="Re-time notes from how you clicked them" onClick={() => apply((s, ids) => applyFeel(s, ids, feel, grid.value))}>Apply feel</button>
      <button onClick={() => apply((s, ids) => evenOut(s, ids, grid.value))}>Even out</button>
      <button onClick={() => apply(legato)}>Legato</button>
      <button onClick={setLoopFromSelection}>Loop selection</button>
      <span class="spacer" />
      <button class="danger" onClick={deleteSelection} title="Delete selected notes (Del)">Delete</button>
      </div>
    </div>
  );
}

const TECH_BUTTONS: { flag: TechFlag; label: string; key: string; tip: string }[] = [
  { flag: 'release', label: 'Release', key: 'R', tip: 'Bend back down (adds a full bend if there is none)' },
  { flag: 'vibrato', label: '〜 Vibrato', key: 'V', tip: 'Vibrato' },
  { flag: 'slide', label: '⟋ Slide', key: 'S', tip: 'Slide into the next note on this string (or slide off if there is none)' },
  { flag: 'legato', label: 'h/p', key: 'H', tip: 'Hammer-on / pull-off from the previous note on this string' },
  { flag: 'mute', label: 'P.M.', key: 'M', tip: 'Palm mute' },
  { flag: 'harmonic', label: '<◇> Harmonic', key: 'N', tip: 'Natural harmonic (frets 12, 7, 5, 4...)' },
  { flag: 'pinch', label: 'P.H.', key: 'P', tip: 'Pinch harmonic: squeals an octave and a fifth above the fretted note' },
  { flag: 'dead', label: '✕ Dead', key: 'X', tip: 'Dead (muted) note' },
];

/** Bends, vibrato, slides... on the selection, else the note just entered / at the insert cursor. */
function TechRow() {
  const ids = techIds.value;
  const notes = song.value.notes.filter(n => ids.has(n.id));
  const bend = notes[0]?.tech?.bend ?? 0;
  const off = notes.length === 0;
  const what = selection.value.size ? `${notes.length} selected` : notes.length ? `the note${notes.length === 1 ? '' : 's'} at the cursor` : 'select notes or enter one';
  return (
    <div class="row tech-row">
      <span class="muted" style={{ minWidth: 92 }}>Techniques</span>
      <button class={bend ? 'on' : ''} disabled={off} onClick={() => applyTech(cycleBend)}
        title="Bend: click to cycle ½ → full → 1½ → 2 → off (key B)">⤴ Bend{bend ? ` ${BEND_LABEL[bend]}` : ''}</button>
      {TECH_BUTTONS.map(b => (
        <button key={b.flag} class={allHave(notes, b.flag) ? 'on' : ''} disabled={off}
          onClick={() => applyTech((s, i) => toggleTech(s, i, b.flag))} title={`${b.tip} (key ${b.key})`}>{b.label}</button>
      ))}
      <span class="muted tech-what">{what}</span>
    </div>
  );
}
