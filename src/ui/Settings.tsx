// The one settings menu (⚙): playback sound, layout, and how the fretboard looks. Saved per browser.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { CLICK_SOUNDS, ClickSoundId, INSTRUMENTS, InstrumentId, previewClick } from '../audio/synth';
import { FlowGrouping } from '../model/flow';
import { FretNeck, PANEL_NAMES, SIZES, TAB_BARS, TAB_LINES, movePanel } from '../model/layout';
import {
  countIn, fretMode, guide, layout, previewNote, setGuide, setLayout, setSoundOpts, setView, sound, toggleView, view,
} from '../state/store';

const FLOW_GROUPINGS: [FlowGrouping, string, string][] = [
  ['none', 'None', 'One unbroken line'],
  ['beat', 'Beat', 'Groups by note value, on the beat: quarters 2, 8ths 4, triplets 3, 16ths 6'],
  ['strings', 'Strings', 'New group when you move to another string after 2+ notes on one'],
  ['contour', 'Contour', 'New group at each peak and low point after a run of 3+ notes'],
  ['arc', 'Arc', 'New group at each low point only, so an up-and-back sweep is one shape'],
];
const pct = (z: number) => `${Math.round(z * 100)}%`;

function Section({ title, open, children }: { title: string; open?: boolean; children: ComponentChildren }) {
  return (
    <details class="sm-sec" open={open}>
      <summary>{title}</summary>
      <div class="sm-body">{children}</div>
    </details>
  );
}

function Seg<T extends string>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <span class="seg small" role="group">
      {options.map(([k, label]) => <button key={k} class={value === k ? 'on' : ''} onClick={() => onPick(k)}>{label}</button>)}
    </span>
  );
}

export function SettingsMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const s = sound.value, l = layout.value, opts = view.value, g = guide.value;
  return (
    <details class="opts settings" ref={ref}>
      <summary title="Settings: sound, layout, fretboard (saved in this browser)">⚙<span class="lbl"> Settings</span></summary>
      <div class="opts-pop">
        <Section title="Playback" open>
          <label><input type="checkbox" checked={countIn.value} onChange={() => { countIn.value = !countIn.value; }} />
            <span><b>Count-in</b> a bar of clicks before playing</span></label>
          <div class="snd-row"><b>Guitar</b>
            <select value={s.instrument} onChange={e => { setSoundOpts({ instrument: e.currentTarget.value as InstrumentId }); previewNote(1, 5); }}>
              {INSTRUMENTS.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select></div>
          <label class="snd-vol"><span class="muted">Volume</span>
            <input type="range" min={0} max={100} value={Math.round(s.volume * 100)} onInput={e => setSoundOpts({ volume: Number(e.currentTarget.value) / 100 })}
              onChange={() => previewNote(1, 5)} />
            <span class="snd-val">{Math.round(s.volume * 100)}</span></label>
          <div class="snd-row"><b>Metronome</b>
            <select value={s.click} onChange={e => { setSoundOpts({ click: e.currentTarget.value as ClickSoundId }); previewClick(); }}>
              {CLICK_SOUNDS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <label class="snd-vol"><span class="muted">Volume</span>
            <input type="range" min={0} max={100} value={Math.round(s.clickVolume * 100)} onInput={e => setSoundOpts({ clickVolume: Number(e.currentTarget.value) / 100 })}
              onChange={previewClick} />
            <span class="snd-val">{Math.round(s.clickVolume * 100)}</span></label>
        </Section>

        <Section title="Layout">
          {l.panels.map((p, i) => (
            <div key={p.id} class="vm-panel">
              <label><input type="checkbox" checked={p.on} onChange={() => setLayout({ panels: l.panels.map(q => (q.id === p.id ? { ...q, on: !q.on } : q)) })} />
                <span>{PANEL_NAMES[p.id]}</span></label>
              <span class="vm-move">
                <button disabled={i === 0} onClick={() => (layout.value = movePanel(l, p.id, -1))} aria-label={`Move ${PANEL_NAMES[p.id]} up`}>↑</button>
                <button disabled={i === l.panels.length - 1} onClick={() => (layout.value = movePanel(l, p.id, 1))} aria-label={`Move ${PANEL_NAMES[p.id]} down`}>↓</button>
              </span>
            </div>
          ))}
          <label><input type="checkbox" checked={l.fullWidth} onChange={() => setLayout({ fullWidth: !l.fullWidth })} />
            <span>Use the full screen width</span></label>
          <div class="snd-row"><span class="muted">Tab: bars per line</span>
            <select value={l.tabBars} onChange={e => setLayout({ tabBars: Number(e.currentTarget.value) })}>
              {TAB_BARS.map(n => <option key={n} value={n}>{n ? n : 'As many as fit'}</option>)}
            </select></div>
          <div class="snd-row"><span class="muted">Tab: lines shown</span>
            <select value={l.tabLines} onChange={e => setLayout({ tabLines: Number(e.currentTarget.value) })}>
              {TAB_LINES.map(n => <option key={n} value={n}>{n ? n : 'All'}</option>)}
            </select></div>
          <div class="snd-row"><span class="muted">Tab: size</span>
            <select value={l.tabZoom} onChange={e => setLayout({ tabZoom: Number(e.currentTarget.value) })}>
              {SIZES.map(z => <option key={z} value={z}>{pct(z)}</option>)}
            </select></div>
          <div class="snd-row"><span class="muted">Fretboard: neck</span>
            <select value={l.fbNeck} onChange={e => setLayout({ fbNeck: e.currentTarget.value as FretNeck })}>
              <option value="scroll">Scroll to follow</option>
              <option value="neck">Fit the whole neck</option>
              <option value="bar">Zoom to the bar</option>
            </select></div>
          <div class="snd-row"><span class="muted">Fretboard: size</span>
            <select value={l.fbZoom} onChange={e => setLayout({ fbZoom: Number(e.currentTarget.value) })}>
              {SIZES.map(z => <option key={z} value={z}>{pct(z)}</option>)}
            </select></div>
        </Section>

        <Section title="Fretboard">
          <div class="snd-row"><span class="muted" title="Bar: the whole bar (or selection / loop) at once. Live: just what's sounding.">Shows</span>
            <Seg value={fretMode.value} options={[['bar', 'Whole bar'], ['live', 'Live']]} onPick={v => { fretMode.value = v; }} /></div>
          <div class="snd-row"><span class="muted">Labels</span>
            <Seg value={g.labels} options={[['fret', 'Fret'], ['note', 'Note'], ['interval', 'Interval']]} onPick={v => setGuide({ labels: v })} /></div>
          <label><input type="checkbox" checked={g.on} onChange={() => setGuide({ on: !g.on })} />
            <span><b>Scale guide</b> show a scale on the neck and flag notes outside it</span></label>
          <label><input type="checkbox" checked={opts.lookAhead} onChange={() => toggleView('lookAhead')} />
            <span><b>Look-ahead</b> fade in the next bar's notes as the bar runs out</span></label>
          <label><input type="checkbox" checked={opts.nextRing} onChange={() => toggleView('nextRing')} />
            <span><b>Next-note ring</b> dashed outline on the note that comes next</span></label>
          <label><input type="checkbox" checked={opts.motion} onChange={() => toggleView('motion')} />
            <span><b>Motion</b> upcoming notes grow in, far-off and played notes fade</span></label>
          <label><input type="checkbox" checked={opts.flow} onChange={() => toggleView('flow')} />
            <span><b>Flow path</b> a curve through the notes in playing order</span></label>
          <div class={`opts-sub${opts.flow ? '' : ' off'}`}>
            <span class="seg small" role="group" aria-label="Flow grouping">
              {FLOW_GROUPINGS.map(([k, label, tip]) => (
                <button key={k} class={opts.flowGrouping === k ? 'on' : ''} onClick={() => setView({ flowGrouping: k })} title={tip}>{label}</button>
              ))}
            </span>
          </div>
          <label><input type="checkbox" checked={opts.hand} onChange={() => toggleView('hand')} />
            <span><b>Hand position</b> a box around the frets the bar uses</span></label>
          <label><input type="checkbox" checked={opts.colour} onChange={() => toggleView('colour')} />
            <span><b>Colour by position</b> same colours on the neck and the timeline</span></label>
          <div class={`opts-sub${opts.colour ? '' : ' off'}`}>
            <Seg value={opts.colourRange} options={[['riff', 'Riff'], ['bar', 'Per bar'], ['neck', 'Whole neck']]} onPick={v => setView({ colourRange: v })} />
          </div>
        </Section>
      </div>
    </details>
  );
}
