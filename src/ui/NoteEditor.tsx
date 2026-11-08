import { useEffect, useRef, useState } from 'preact/hooks';
import { MAX_FRET, TUNINGS, barTicks, noteName } from '../model/song';
import { deleteOpenNotes, editOpenNotes, noteEditor, song } from '../state/store';

/** Small popup for fixing a note: type a fret (Enter), step it, move it to another string, or delete it. */
export function NoteEditor() {
  const ed = noteEditor.value;
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const s = song.value;
  const notes = ed ? s.notes.filter(n => ed.ids.includes(n.id)) : [];
  const first = notes[0];
  const [draft, setDraft] = useState('');
  useEffect(() => { if (first) setDraft(String(first.fret)); }, [first?.fret, ed?.ids.join()]);
  useEffect(() => {
    if (!ed) return;
    input.current?.focus();
    input.current?.select();
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) noteEditor.value = null; };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') noteEditor.value = null; };
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', key); };
  }, [ed?.ids.join()]);
  if (!ed || !first) return null;

  const fret = Number(draft);
  const valid = draft !== '' && Number.isInteger(fret) && fret >= 0 && fret <= MAX_FRET;
  const bar = Math.floor(first.start / barTicks(s.timeSig)) + 1;
  const open = TUNINGS[s.tuning].pitches;
  // Keep the popup on screen, just below where you clicked.
  const left = Math.max(8, Math.min(ed.x - 110, window.innerWidth - 228));
  const top = Math.min(ed.y + 14, window.innerHeight - 190);
  return (
    <div class="note-editor" ref={ref} style={{ left, top }} role="dialog" aria-label="Edit note">
      <div class="ne-head">
        <b>{notes.length > 1 ? `${notes.length} notes` : 'Note'}</b>
        <span class="muted"> · bar {bar}</span>
        <button class="ghost" onClick={() => { noteEditor.value = null; }} aria-label="Close">✕</button>
      </div>
      <div class="ne-row">
        <span class="muted">Fret</span>
        <button onClick={() => editOpenNotes({ fret: first.fret - 1 })} disabled={first.fret <= 0} aria-label="One fret down">−</button>
        <input ref={input} type="number" inputMode="numeric" min={0} max={MAX_FRET} value={draft}
          onInput={e => setDraft(e.currentTarget.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && valid) { editOpenNotes({ fret }); noteEditor.value = null; }
          }} />
        <button onClick={() => editOpenNotes({ fret: first.fret + 1 })} disabled={first.fret >= MAX_FRET} aria-label="One fret up">+</button>
        <button class="primary" disabled={!valid || fret === first.fret} onClick={() => { editOpenNotes({ fret }); noteEditor.value = null; }}>Set</button>
      </div>
      <div class="ne-row">
        <span class="muted">String</span>
        <span class="seg small" role="group" aria-label="String">
          {open.map((p, i) => (
            <button key={i} class={first.string === i ? 'on' : ''} onClick={() => editOpenNotes({ string: i })}>{noteName(p).replace(/\d/, '')}</button>
          ))}
        </span>
      </div>
      <div class="ne-row">
        <button class="danger" onClick={deleteOpenNotes}>Delete</button>
        <span class="muted ne-hint">Enter to set · Esc to close</span>
      </div>
    </div>
  );
}
