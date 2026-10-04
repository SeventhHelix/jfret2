import { MAX_FRET, STRINGS, TUNINGS, barTicks, noteName, pitchOf } from '../model/song';
import { editMode, fretMode, hotIds, insertNote, playhead, previewNote, softIds, softSource, song } from '../state/store';

const ROW_H = 52;
const OPEN_W = 52;
const FRET_W = 64;
const SINGLE_DOTS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_DOTS = [12, 24];

const cellX = (f: number) => (f === 0 ? 0 : OPEN_W + (f - 1) * FRET_W);
const cellW = (f: number) => (f === 0 ? OPEN_W : FRET_W);
const midX = (f: number) => OPEN_W + (f - 0.5) * FRET_W;

export function Fretboard() {
  const s = song.value;
  const hot = hotIds.value;
  const soft = softIds.value;
  const state = new Map<string, 'hot' | 'soft'>();
  for (const n of s.notes) {
    const k = `${n.string}:${n.fret}`;
    if (hot.has(n.id)) state.set(k, 'hot');
    else if (soft.has(n.id) && !state.has(k)) state.set(k, 'soft');
  }
  const src = softSource.value;
  const barNo = Math.floor(playhead.value / barTicks(s.timeSig)) + 1;
  const label = { bar: `Bar ${barNo}`, selection: 'Selection', loop: 'Loop', live: 'Live' }[src];
  const width = OPEN_W + MAX_FRET * FRET_W;
  const onCell = (string: number, fret: number) => (editMode.value ? insertNote(string, fret) : previewNote(string, fret));

  return (
    <div class="panel">
      <div class="row" style={{ marginBottom: 8 }}>
        <strong>Fretboard</strong>
        <span class="muted">{label}</span>
        <span class="spacer" />
        <button class={fretMode.value === 'live' ? 'on' : ''} onClick={() => { fretMode.value = 'live'; }}>Live</button>
        <button class={fretMode.value === 'bar' ? 'on' : ''} onClick={() => { fretMode.value = 'bar'; }}>Bar / selection</button>
      </div>
      <div class="fb-wrap">
        <div class="fb-names">
          {TUNINGS[s.tuning].pitches.map((p, i) => <div key={i} style={{ height: ROW_H }}>{noteName(p)}</div>)}
        </div>
        <div class="fb-scroll">
          <div class="fb" style={{ width, height: ROW_H * STRINGS }}>
            <div class="fb-nut" style={{ left: OPEN_W - 6 }} />
            {Array.from({ length: MAX_FRET }, (_, i) => (
              <div key={i} class="fb-wire" style={{ left: OPEN_W + (i + 1) * FRET_W - 1 }} />
            ))}
            {SINGLE_DOTS.map(f => <div key={f} class="fb-marker" style={{ left: midX(f), top: ROW_H * 3 }} />)}
            {DOUBLE_DOTS.flatMap(f => [
              <div key={`${f}a`} class="fb-marker" style={{ left: midX(f), top: ROW_H * 2 }} />,
              <div key={`${f}b`} class="fb-marker" style={{ left: midX(f), top: ROW_H * 4 }} />,
            ])}
            {Array.from({ length: STRINGS }, (_, i) => (
              <div key={i} class="fb-string" style={{ top: i * ROW_H + ROW_H / 2, height: 1 + i * 0.5 }} />
            ))}
            {Array.from({ length: STRINGS }, (_, str) =>
              Array.from({ length: MAX_FRET + 1 }, (_, f) => {
                const st = state.get(`${str}:${f}`);
                return (
                  <div key={`${str}:${f}`} class={`fb-cell ${st ?? ''}`}
                    style={{ left: cellX(f), top: str * ROW_H, width: cellW(f), height: ROW_H }}
                    onPointerDown={e => { e.preventDefault(); onCell(str, f); }}>
                    <span class="fb-dot">{st ? f : noteName(pitchOf(s, { string: str, fret: f }))}</span>
                  </div>
                );
              }),
            )}
          </div>
          <div class="fb-nums" style={{ width }}>
            {Array.from({ length: MAX_FRET + 1 }, (_, f) => (
              <span key={f} class={SINGLE_DOTS.includes(f) || DOUBLE_DOTS.includes(f) ? 'mk' : ''}
                style={{ left: f === 0 ? OPEN_W / 2 : midX(f) }}>{f}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
