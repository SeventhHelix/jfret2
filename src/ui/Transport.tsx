import { useState } from 'preact/hooks';
import { Song, TUNINGS, TUNING_IDS, TuningId } from '../model/song';
import {
  commit, countIn, editMode, loop, loopOn, metronome, newSong, playing, redo, rewind, setLoopFromSelection,
  shareUrl, song, speed, togglePlay, undo,
} from '../state/store';

export function Transport() {
  const s = song.value;
  const [copied, setCopied] = useState(false);
  const setMeta = (patch: Partial<Song>) => commit({ ...s, ...patch });
  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const toggleLoop = () => {
    if (!loop.value) setLoopFromSelection();
    else loopOn.value = !loopOn.value;
  };

  return (
    <div class="panel row">
      <input class="title-input" value={s.title} maxLength={60} onChange={e => setMeta({ title: e.currentTarget.value })} />
      <button onClick={rewind} title="Back to start">⏮</button>
      <button class="play" onClick={togglePlay}>{playing.value ? '⏸ Pause' : '▶ Play'}</button>
      <button class={loopOn.value ? 'on' : ''} onClick={toggleLoop} title="Drag across the tab (or select notes) to set a loop">⟳ Loop</button>
      <label class="muted">
        Speed{' '}
        <input type="range" min={25} max={150} step={5} value={Math.round(speed.value * 100)}
          onInput={e => { speed.value = Number(e.currentTarget.value) / 100; }} />{' '}
        {Math.round(speed.value * 100)}%
      </label>
      <button class={metronome.value ? 'on' : ''} onClick={() => { metronome.value = !metronome.value; }}>Click</button>
      <button class={countIn.value ? 'on' : ''} onClick={() => { countIn.value = !countIn.value; }}>Count-in</button>
      <span class="spacer" />
      {editMode.value && (
        <>
          <label class="muted">
            BPM{' '}
            <input type="number" min={30} max={300} value={s.bpm} style={{ width: 70 }}
              onChange={e => { const v = Number(e.currentTarget.value); if (v >= 30 && v <= 300) setMeta({ bpm: v }); }} />
          </label>
          <select value={s.timeSig.join('/')}
            onChange={e => setMeta({ timeSig: e.currentTarget.value.split('/').map(Number) as [number, number] })}>
            {['4/4', '3/4', '6/8'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={s.tuning} onChange={e => setMeta({ tuning: e.currentTarget.value as TuningId })}>
            {TUNING_IDS.map(id => <option key={id} value={id}>{TUNINGS[id].name}</option>)}
          </select>
          <button onClick={undo} title="Undo (Ctrl+Z)">↶</button>
          <button onClick={redo} title="Redo (Ctrl+Shift+Z)">↷</button>
          <button onClick={newSong}>New</button>
        </>
      )}
      <button onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
      <button class={editMode.value ? 'on' : ''} onClick={() => { editMode.value = !editMode.value; }}>
        {editMode.value ? 'Done editing' : 'Edit / remix'}
      </button>
    </div>
  );
}
