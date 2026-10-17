import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { TUNINGS } from '../model/song';
import { GpScore, barCounts, describeFit, extractSection, fitTuning, sections } from '../import/gpScore';
import { importFile, importSong } from '../state/store';

export const GP_ACCEPT = '.gp,.gpx,.gp3,.gp4,.gp5';
export const isGpFile = (f: File) => /\.(gp|gpx|gp[345])$/i.test(f.name);

type Range = { first: number; last: number };

/** Where to start: a section called "Solo" if there is one, else the first 8 bars where this track plays. */
function defaultRange(score: GpScore, track: number): Range {
  const solo = sections(score).find(s => /solo/i.test(s.name));
  if (solo) return { first: solo.first, last: solo.last };
  const counts = barCounts(score.tracks[track], score.bars.length);
  const first = Math.max(0, counts.findIndex(c => c > 0));
  return { first, last: Math.min(score.bars.length - 1, first + 7) };
}

export function ImportDialog({ file }: { file: File }) {
  const [score, setScore] = useState<GpScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [track, setTrack] = useState(0);
  const [range, setRange] = useState<Range>({ first: 0, last: 0 });
  const anchor = useRef(0);
  const dragging = useRef(false);
  const close = () => { importFile.value = null; };

  useEffect(() => {
    let live = true;
    setScore(null); setError(null);
    (async () => {
      try {
        const { readScoreFile } = await import('../import/gpRead');
        const sc = await readScoreFile(new Uint8Array(await file.arrayBuffer()));
        if (!live) return;
        if (!sc.tracks.length || !sc.bars.length) throw new Error('No guitar or bass tracks in this file.');
        // A "Solo" section picks the track that plays most in it; otherwise the first track with notes.
        const solo = sections(sc).find(s => /solo/i.test(s.name));
        const busy = (i: number) => barCounts(sc.tracks[i], sc.bars.length).slice(solo?.first, (solo?.last ?? -1) + 1).reduce((a, b) => a + b, 0);
        const t = solo
          ? sc.tracks.reduce((best, _, i) => (busy(i) > busy(best) ? i : best), 0)
          : Math.max(0, sc.tracks.findIndex(tr => tr.notes.length > 0));
        setScore(sc); setTrack(t); setRange(defaultRange(sc, t));
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerup', onUp); };
  }, []);

  const secs = useMemo(() => (score ? sections(score) : []), [score]);
  const counts = useMemo(() => (score ? barCounts(score.tracks[track], score.bars.length) : []), [score, track]);
  const result = useMemo(() => (score ? extractSection(score, track, range.first, range.last) : null), [score, track, range]);
  const maxCount = Math.max(1, ...counts);
  const secAt = new Map(secs.map(s => [s.first, s.name]));

  const pick = (i: number, extend: boolean) => {
    if (!extend) anchor.current = i;
    setRange({ first: Math.min(anchor.current, i), last: Math.max(anchor.current, i) });
  };
  const barAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-bar]');
    return el ? Number(el.dataset.bar) : null;
  };
  const setBound = (k: keyof Range, v: string) => {
    if (!score) return;
    const i = Math.min(score.bars.length, Math.max(1, Math.round(Number(v)) || 1)) - 1;
    setRange(r => (k === 'first' ? { first: i, last: Math.max(i, r.last) } : { first: Math.min(i, r.first), last: i }));
  };

  const bars = range.last - range.first + 1;
  const s = result?.song;
  return (
    <div class="modal-back" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div class="modal gp-import" role="dialog" aria-modal="true" aria-label="Import from Guitar Pro">
        <div class="modal-head">
          <div>
            <b>Import from Guitar Pro</b>
            <div class="muted">{score ? [score.title || file.name, score.artist].filter(Boolean).join(' · ') : file.name}</div>
          </div>
          <button class="ghost" onClick={close} aria-label="Close">✕</button>
        </div>

        {error && <p class="gp-error">Couldn't read this file. It may be damaged or not a Guitar Pro file. <span class="muted">({error})</span></p>}
        {!score && !error && <p class="muted">Reading file…</p>}

        {score && result && s && (
          <>
            <section>
              <h4>Track</h4>
              <div class="gp-tracks" role="radiogroup">
                {score.tracks.map((t, i) => (
                  <button key={i} role="radio" aria-checked={i === track} class={`gp-track${i === track ? ' on' : ''}`} onClick={() => setTrack(i)}>
                    <b>{t.name}</b>
                    <span class="muted">{t.tuning.length}-string · {describeFit(t, fitTuning(t.tuning))}{t.capo ? ` · capo ${t.capo}` : ''} · {t.notes.length} notes</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h4>Section</h4>
              {secs.length > 0 && (
                <div class="gp-chips">
                  {secs.map(sec => (
                    <button key={sec.first} class={sec.first === range.first && sec.last === range.last ? 'on' : ''}
                      onClick={() => setRange({ first: sec.first, last: sec.last })}>
                      {sec.name} <span class="muted">{sec.first + 1}–{sec.last + 1}</span>
                    </button>
                  ))}
                </div>
              )}
              <div class="gp-bars" onPointerMove={e => { if (!dragging.current) return; const i = barAt(e.clientX, e.clientY); if (i !== null) pick(i, true); }}>
                {counts.map((c, i) => (
                  <div key={i} data-bar={i}
                    class={`gp-bar${i >= range.first && i <= range.last ? ' on' : ''}${secAt.has(i) ? ' sec' : ''}`}
                    style={{ '--d': c / maxCount } as any}
                    title={`Bar ${i + 1}${secAt.has(i) ? ` · ${secAt.get(i)}` : ''} · ${c} note${c === 1 ? '' : 's'}`}
                    onPointerDown={e => {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
                      dragging.current = true;
                      pick(i, e.shiftKey);
                    }} />
                ))}
              </div>
              <div class="gp-range">
                <label>Bars <input type="number" min={1} max={score.bars.length} value={range.first + 1} onChange={e => setBound('first', e.currentTarget.value)} /></label>
                <label>to <input type="number" min={1} max={score.bars.length} value={range.last + 1} onChange={e => setBound('last', e.currentTarget.value)} /></label>
                <span class="muted">of {score.bars.length} · click a bar, shift-click or drag to extend</span>
              </div>
            </section>

            <p class="gp-summary">
              {bars} bar{bars === 1 ? '' : 's'} · {result.noteCount} notes · {s.timeSig.join('/')} · {s.bpm} bpm · {TUNINGS[s.tuning].name}
            </p>
            {result.warnings.length > 0 && <ul class="gp-warn">{result.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
          </>
        )}

        <div class="modal-foot">
          <button onClick={close}>Cancel</button>
          <button class="primary" disabled={!result || result.noteCount === 0} onClick={() => s && importSong(s)}
            title="Replaces the current riff. Undo brings it back.">
            {result && result.noteCount === 0 ? 'No notes in these bars' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
