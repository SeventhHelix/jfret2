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
          <p class="muted">
            Click frets to sketch notes · Drag blocks to move, drag the right edge to resize · Click empty roll space to move the
            insert cursor · Drag across the tab to loop · Space play · 1–6 set length · Ctrl+Z undo
          </p>
        </>
      )}
    </div>
  );
}
