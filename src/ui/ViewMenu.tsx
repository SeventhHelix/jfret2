import { useEffect, useRef } from 'preact/hooks';
import { FretNeck, PANEL_NAMES, SIZES, TAB_BARS, TAB_LINES, movePanel } from '../model/layout';
import { layout, setLayout } from '../state/store';

const pct = (z: number) => `${Math.round(z * 100)}%`;

/** Which panels show and in what order, page width, and how big the tab and fretboard are (saved in this browser). */
export function ViewMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const l = layout.value;
  return (
    <details class="opts sound view-menu" ref={ref}>
      <summary title="Panels, their order and sizes (saved in this browser)">▦ View</summary>
      <div class="opts-pop">
        <b class="vm-head">Panels</b>
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

        <b class="vm-head">Tab</b>
        <div class="snd-row"><span class="muted">Bars per line</span>
          <select value={l.tabBars} onChange={e => setLayout({ tabBars: Number(e.currentTarget.value) })}>
            {TAB_BARS.map(n => <option key={n} value={n}>{n ? n : 'As many as fit'}</option>)}
          </select></div>
        <div class="snd-row"><span class="muted">Lines shown</span>
          <select value={l.tabLines} onChange={e => setLayout({ tabLines: Number(e.currentTarget.value) })}>
            {TAB_LINES.map(n => <option key={n} value={n}>{n ? n : 'All (no scrolling)'}</option>)}
          </select></div>
        <div class="snd-row"><span class="muted">Size</span>
          <select value={l.tabZoom} onChange={e => setLayout({ tabZoom: Number(e.currentTarget.value) })}>
            {SIZES.map(z => <option key={z} value={z}>{pct(z)}</option>)}
          </select></div>

        <b class="vm-head">Fretboard</b>
        <div class="snd-row"><span class="muted">Neck</span>
          <select value={l.fbNeck} onChange={e => setLayout({ fbNeck: e.currentTarget.value as FretNeck })}>
            <option value="scroll">Scroll to follow the notes</option>
            <option value="neck">Fit the whole neck</option>
            <option value="bar">Zoom to the notes in the bar</option>
          </select></div>
        <div class="snd-row"><span class="muted">Size</span>
          <select value={l.fbZoom} onChange={e => setLayout({ fbZoom: Number(e.currentTarget.value) })}>
            {SIZES.map(z => <option key={z} value={z}>{pct(z)}</option>)}
          </select></div>
      </div>
    </details>
  );
}
