import { Transport } from './Transport';
import { useKeyboard } from './keyboard';
import { errorMsg } from '../state/store';

export function App() {
  useKeyboard();
  return (
    <div class="app">
      {errorMsg.value && <div class="error" onClick={() => { errorMsg.value = null; }}>{errorMsg.value} (click to dismiss)</div>}
      <Transport />
    </div>
  );
}
