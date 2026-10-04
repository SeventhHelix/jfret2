import { useEffect } from 'preact/hooks';
import { moveNotes } from '../model/ops';
import {
  commit, copySelection, cutSelection, deleteBeforeCursor, deleteSelection, duplicateSelection, editMode, grid, nudgeFrets,
  pasteAtCursor, redo, selectAll, selection, setBaseLength, song, toggleDotted, toggleLoop, togglePlay, undo,
} from '../state/store';

// 1=whole 2=half 3=quarter 4=8th 5=16th 6=32nd
const DUR_KEYS: Record<string, number> = { '1': 96, '2': 48, '3': 24, '4': 12, '5': 6, '6': 3 };

export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : document.body;
      if (t.closest('textarea, select') || (t instanceof HTMLInputElement && !['range', 'checkbox', 'button'].includes(t.type))) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) togglePlay(); return; }
      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && key === 'y') { e.preventDefault(); redo(); return; }
      if (!mod && key === 'l') { e.preventDefault(); toggleLoop(); return; }
      if (e.key === 'Escape') { selection.value = new Set(); return; }
      if (!editMode.value) return;
      if (mod && key === 'a') { e.preventDefault(); selectAll(); return; }
      if (mod && key === 'c') { e.preventDefault(); copySelection(); return; }
      if (mod && key === 'x') { e.preventDefault(); cutSelection(); return; }
      if (mod && key === 'v') { e.preventDefault(); pasteAtCursor(); return; }
      if (mod && key === 'd') { e.preventDefault(); duplicateSelection(); return; }
      if (DUR_KEYS[e.key] && !mod) { setBaseLength(DUR_KEYS[e.key]); return; } // also resets selected notes
      if (e.key === '.' && !mod) { toggleDotted(); return; }
      const sel = selection.value;
      if (!sel.size) {
        if (e.key === 'Backspace') { e.preventDefault(); deleteBeforeCursor(); }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.altKey ? 1 : grid.value;
        commit(moveNotes(song.value, sel, e.key === 'ArrowLeft' ? -step : step, 0));
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
        e.preventDefault();
        nudgeFrets(e.key === 'ArrowUp' ? 1 : -1); // fine-tune pitch, same string
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        commit(moveNotes(song.value, sel, 0, e.key === 'ArrowUp' ? -1 : 1));
      }
    };
    // Firefox clicks a focused button on Space keyup; stop that.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement).closest('button')) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
