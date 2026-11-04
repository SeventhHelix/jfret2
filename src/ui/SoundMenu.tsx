import { useEffect, useRef } from 'preact/hooks';
import { CLICK_SOUNDS, ClickSoundId, INSTRUMENTS, InstrumentId, previewClick } from '../audio/synth';
import { previewNote, setSoundOpts, sound } from '../state/store';

/** Instrument, metronome sound and their volumes (saved in this browser). */
export function SoundMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const s = sound.value;
  const pct = (v: number) => Math.round(v * 100);
  return (
    <details class="opts sound" ref={ref}>
      <summary title="Instrument, metronome sound and volume (saved in this browser)">🔊 Sound</summary>
      <div class="opts-pop">
        <div class="snd-row">
          <b>Guitar</b>
          <select value={s.instrument} onChange={e => { setSoundOpts({ instrument: e.currentTarget.value as InstrumentId }); previewNote(1, 5); }}>
            {INSTRUMENTS.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <label class="snd-vol">
          <span class="muted">Volume</span>
          <input type="range" min={0} max={100} value={pct(s.volume)} onInput={e => setSoundOpts({ volume: Number(e.currentTarget.value) / 100 })}
            onChange={() => previewNote(1, 5)} />
          <span class="snd-val">{pct(s.volume)}</span>
        </label>
        <div class="snd-row">
          <b>Metronome</b>
          <select value={s.click} onChange={e => { setSoundOpts({ click: e.currentTarget.value as ClickSoundId }); previewClick(); }}>
            {CLICK_SOUNDS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <label class="snd-vol">
          <span class="muted">Volume</span>
          <input type="range" min={0} max={100} value={pct(s.clickVolume)} onInput={e => setSoundOpts({ clickVolume: Number(e.currentTarget.value) / 100 })}
            onChange={previewClick} />
          <span class="snd-val">{pct(s.clickVolume)}</span>
        </label>
      </div>
    </details>
  );
}
