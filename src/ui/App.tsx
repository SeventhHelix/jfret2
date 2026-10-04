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
            <span>Drag a block to move it; drag its right edge to resize</span>
            <span>Click empty space to move the <b class="c-cursor">green insert cursor</b></span>
            <span>Drag across the tab to loop</span>
            <span><kbd>Space</kbd> play</span>
            <span><kbd>1</kbd>–<kbd>6</kbd> note length</span>
            <span><kbd>←</kbd><kbd>→</kbd> nudge, <kbd>↑</kbd><kbd>↓</kbd> change string</span>
            <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</span>
          </p>
        </>
      )}
    </div>
  );
}
