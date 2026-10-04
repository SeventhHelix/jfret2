import { useState } from 'preact/hooks';
import { Song } from '../model/song';
import { applyFeel, evenOut, legato, quantize } from '../model/ops';
import { commit, deleteSelection, feel, grid, selection, setLoopFromSelection, song, targetIds } from '../state/store';

const GRIDS = [
  { label: '1/4', t: 24 },
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
    <div class="panel row">
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
  );
}
