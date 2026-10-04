import { useEffect, useState } from 'preact/hooks';
import { Song, TUNINGS, TUNING_IDS, TuningId } from '../model/song';
import {
  commit, countIn, editMode, loop, loopOn, metronome, newSong, playing, redo, rewind, selection, setLoopFromSelection,
  shareUrl, song, speed, togglePlay, undo,
} from '../state/store';

export function Transport() {
  const s = song.value;
  const [copied, setCopied] = useState(false);
  const [title, setTitle] = useState(s.title);
  useEffect(() => setTitle(s.title), [s.title]);
  const [bpm, setBpm] = useState(String(s.bpm));
  useEffect(() => setBpm(String(s.bpm)), [s.bpm]);
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

  const setEdit = (on: boolean) => {
    if (!on) selection.value = new Set();
    editMode.value = on;
  };
  const pct = Math.round(speed.value * 100);

  return (
    <div class="panel header">
      <div class="row">
        <input class="title-input" value={title} maxLength={60} placeholder="Name your riff"
          onInput={e => setTitle(e.currentTarget.value)} onChange={e => setMeta({ title: e.currentTarget.value })} />
        <div class="group">
          <button onClick={rewind} title="Back to start" aria-label="Back to start">⏮</button>
          <button class="play" onClick={togglePlay} title="Play / pause (Space)">{playing.value ? '⏸ Pause' : '▶ Play'}</button>
          <button class={loopOn.value ? 'on' : ''} onClick={toggleLoop} title="Drag across the tab, or select notes, to set a loop">⟳ Loop</button>
        </div>
        <label class="speed" title="Playback speed (doesn't change the saved tempo)">
          <span class="muted">Speed</span>
          <input type="range" min={25} max={150} step={5} value={pct} onInput={e => { speed.value = Number(e.currentTarget.value) / 100; }} />
          <button class="speed-val" onClick={() => { speed.value = 1; }} title="Reset to 100%">{pct}%</button>
        </label>
        <div class="group">
          <button class={metronome.value ? 'on' : ''} onClick={() => { metronome.value = !metronome.value; }} title="Metronome click">Click</button>
          <button class={countIn.value ? 'on' : ''} onClick={() => { countIn.value = !countIn.value; }}>Count-in</button>
        </div>
        <span class="spacer" />
        <button onClick={copy} title="Copy a link to this riff">{copied ? '✓ Copied' : 'Share'}</button>
        <div class="seg" role="group" aria-label="Mode">
          <button class={editMode.value ? 'on' : ''} onClick={() => setEdit(true)}>✎ Edit</button>
          <button class={editMode.value ? '' : 'on'} onClick={() => setEdit(false)}>♫ Practice</button>
        </div>
      </div>
      {editMode.value && (
        <div class="row sub">
          <label class="muted">
            Tempo{' '}
            <input type="number" min={30} max={300} value={bpm} style={{ width: 64 }}
              onInput={e => setBpm(e.currentTarget.value)}
              onChange={e => { const v = Number(e.currentTarget.value); if (v >= 30 && v <= 300) setMeta({ bpm: v }); else setBpm(String(s.bpm)); }} />{' '}
            BPM
          </label>
          <select value={s.timeSig.join('/')} title="Time signature"
            onChange={e => { setMeta({ timeSig: e.currentTarget.value.split('/').map(Number) as [number, number] }); e.currentTarget.blur(); }}>
            {['4/4', '3/4', '6/8'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={s.tuning} title="Tuning" onChange={e => { setMeta({ tuning: e.currentTarget.value as TuningId }); e.currentTarget.blur(); }}>
            {TUNING_IDS.map(id => <option key={id} value={id}>{TUNINGS[id].name}</option>)}
          </select>
          <span class="spacer" />
          <div class="group">
            <button onClick={undo} title="Undo (Ctrl+Z)">↶ Undo</button>
            <button onClick={redo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
          </div>
          <button onClick={newSong}>New riff</button>
        </div>
      )}
    </div>
  );
}
