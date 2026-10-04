import { Transport } from './Transport';
import { Fretboard } from './Fretboard';
import { TabView } from './TabView';
import { Toolbar } from './Toolbar';
import { TabRoll } from './TabRoll';
import { useKeyboard } from './keyboard';
import { editMode, errorMsg } from '../state/store';

export function App() {
  useKeyboard();
  return (
    <div class="app">
      {errorMsg.value && <div class="error" onClick={() => { errorMsg.value = null; }}>{errorMsg.value} (click to dismiss)</div>}
      <Transport />
      <TabView />
      <Fretboard />
      {editMode.value && (
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
            <span><kbd>1</kbd>–<kbd>6</kbd> note length, <kbd>.</kbd> dotted</span>
            <span><kbd>←</kbd><kbd>→</kbd> nudge, <kbd>↑</kbd><kbd>↓</kbd> change string</span>
            <span><kbd>Backspace</kbd> remove the note you just entered</span>
            <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo</span>
          </p>
        </>
      )}
    </div>
  );
}
