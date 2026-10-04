import { render } from 'preact';
import { App } from './ui/App';
import { loadInitial, startAutosave } from './state/store';
import './styles.css';

loadInitial();
startAutosave();
render(<App />, document.getElementById('app')!);
