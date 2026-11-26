// Play: the song's marked sections as chips. Click one to loop it; mark the current loop to add one.
import { Mark } from '../model/library';
import { addMark, loop, loopOn, playMark, removeMark, renameMark, songMarks } from '../state/store';

const fmt = (t: number) => `bar ${Math.floor(t / 96) + 1}`;

export function SectionsBar() {
  const marks = songMarks.value;
  const lp = loopOn.value ? loop.value : null;
  const isOn = (m: Mark) => !!lp && lp.start === m.start && lp.end === m.end;
  const loopIsNew = !!lp && !marks.some(isOn);
  if (!marks.length && !lp) return null;
  return (
    <div class="row secs">
      <span class="muted secs-lbl" title="Parts of this song you practise: click one to loop it">Sections</span>
      {marks.map(m => (
        <span key={m.id} class={`sec-chip${isOn(m) ? ' on' : ''}`}>
          <button onClick={() => playMark(m)} title={`${fmt(m.start)}–${fmt(m.end - 1)}. Click to loop it (again to stop).`}>{m.name}</button>
          {isOn(m) && <>
            <button class="sec-x" title="Rename" onClick={() => { const n = prompt('Section name', m.name); if (n !== null) renameMark(m.id, n); }}>✎</button>
            <button class="sec-x" title="Remove this section" onClick={() => { if (confirm(`Remove the section “${m.name}”?`)) removeMark(m.id); }}>✕</button>
          </>}
        </span>
      ))}
      {loopIsNew && (
        <button class="mini sec-add" title="Save the looped bars as a named section of this song (also usable in Speed)"
          onClick={() => { const n = prompt('Name this section', `Section ${marks.length + 1}`); if (n !== null) addMark(n); }}>＋ Mark this loop</button>
      )}
      {!marks.length && !loopIsNew && <span class="muted">Loop some bars (drag across the tab), then mark them</span>}
    </div>
  );
}
