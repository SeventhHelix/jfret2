import { useEffect } from 'preact/hooks';
import { Transport } from './Transport';
import { Fretboard } from './Fretboard';
import { TabView } from './TabView';
import { Toolbar } from './Toolbar';
import { TabRoll } from './TabRoll';
import { useKeyboard } from './keyboard';
import { ImportDialog, isGpFile } from './ImportDialog';
import { NoteEditor } from './NoteEditor';
import { Fragment } from 'preact';
import type { PanelId } from '../model/layout';
import { editMode, errorMsg, importFile, layout } from '../state/store';

/** Dropping a Guitar Pro file anywhere on the page opens the import dialog. */
function useFileDrop() {
  useEffect(() => {
    const hasFile = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const over = (e: DragEvent) => { if (hasFile(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      const f = e.dataTransfer?.files[0];
      if (!f) return;
      e.preventDefault();
      if (isGpFile(f)) importFile.value = f;
      else errorMsg.value = `Can't import ${f.name}: only Guitar Pro files (.gp, .gpx, .gp3, .gp4, .gp5).`;
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, []);
}

export function App() {
  useKeyboard();
  useFileDrop();
  const l = layout.value;
  // Panels in the order and visibility chosen in the View menu. The editor only exists in Edit mode.
  const panel = (id: PanelId) =>
    id === 'tab' ? <TabView /> : id === 'fretboard' ? <Fretboard /> : editMode.value ? <Editor /> : null;
  return (
    <div class="app" style={l.fullWidth ? { maxWidth: 'none' } : undefined}>
      {importFile.value && <ImportDialog file={importFile.value} />}
      <NoteEditor />
      {errorMsg.value && <div class="error" onClick={() => { errorMsg.value = null; }}>{errorMsg.value} (click to dismiss)</div>}
      <Transport />
      {l.panels.filter(p => p.on).map(p => <Fragment key={p.id}>{panel(p.id)}</Fragment>)}
      {!l.panels.some(p => p.on) && <p class="muted empty-view">All panels are hidden. Turn some back on in <b>▦ View</b>.</p>}
    </div>
  );
}

function Editor() {
  return (
        <>
          <Toolbar />
          <TabRoll />
          <p class="hints">
            <span>Click frets to sketch</span>
            <span><kbd>Shift</kbd>+click a fret to stack a chord</span>
            <span>Click a note (tab or roll) to put the <b class="c-cursor">green insert cursor</b> in front of it</span>
            <span>Drag a block to move it; drag its right edge to resize</span>
            <span>Drag across the tab to loop</span>
            <span><kbd>Space</kbd> play</span>
            <span><kbd>1</kbd>–<kbd>6</kbd> note length, <kbd>.</kbd> dotted, <kbd>T</kbd> triplet</span>
            <span><kbd>B</kbd> bend (again to change it) · <kbd>R</kbd> release · <kbd>V</kbd> vibrato · <kbd>S</kbd> slide · <kbd>H</kbd> hammer-on/pull-off · <kbd>M</kbd> palm mute · <kbd>N</kbd> harmonic · <kbd>P</kbd> pinch harmonic · <kbd>X</kbd> dead note</span>
            <span><kbd>←</kbd><kbd>→</kbd> nudge, <kbd>↑</kbd><kbd>↓</kbd> change string</span>
            <span><kbd>Alt</kbd>+<kbd>↑</kbd><kbd>↓</kbd> or mouse wheel on a note: up/down a fret</span>
            <span>Click a bar number to select the bar, <kbd>L</kbd> to loop it</span>
            <span><kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate · <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd> copy, paste at cursor</span>
            <span>Double-click, right-click or long-press a note (or <kbd>Enter</kbd> on a selection) to change its fret or string</span>
            <span><kbd>Backspace</kbd> remove the note you just entered</span>
            <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo</span>
            <span>Drop a Guitar Pro file on the page (or <b>Import…</b>) to bring in part of a song</span>
          </p>
        </>
  );
}
