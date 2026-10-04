import { MAX_FRET, STRINGS, TUNINGS, barTicks, beatTicks, noteName, pitchOf } from '../model/song';
import {
  cursor, cursorIds, editMode, fretMode, hotIds, insertNote, nextIds, playhead, playing, previewNote, softIds, softSource, song,
} from '../state/store';

const ROW_H = 52;
const OPEN_W = 52;
const FRET_W = 64;
const SINGLE_DOTS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_DOTS = [12, 24];

const cellX = (f: number) => (f === 0 ? 0 : OPEN_W + (f - 1) * FRET_W);
const cellW = (f: number) => (f === 0 ? OPEN_W : FRET_W);
const midX = (f: number) => OPEN_W + (f - 0.5) * FRET_W;

type CellState = { hot: boolean; soft: boolean; next: boolean; atCursor: boolean };

export function Fretboard() {
  const s = song.value;
  const edit = editMode.value;
  const hot = hotIds.value;
  const soft = softIds.value;
  // While editing with playback stopped, the cursor ring is the useful cue; the "next" ring is for playing along.
  const next = playing.value || !edit ? nextIds.value : new Set<number>();
  const atCursor = edit && !playing.value ? cursorIds.value : new Set<number>();
  const cells = new Map<string, CellState>();
  for (const n of s.notes) {
    const flags = { hot: hot.has(n.id), soft: soft.has(n.id), next: next.has(n.id), atCursor: atCursor.has(n.id) };
    if (!flags.hot && !flags.soft && !flags.next && !flags.atCursor) continue;
    const k = `${n.string}:${n.fret}`;
    const c = cells.get(k) ?? { hot: false, soft: false, next: false, atCursor: false };
    cells.set(k, { hot: c.hot || flags.hot, soft: c.soft || flags.soft, next: c.next || flags.next, atCursor: c.atCursor || flags.atCursor });
  }

  const bar = barTicks(s.timeSig);
  const src = softSource.value;
  const barNo = Math.floor(playhead.value / bar) + 1;
  const label = { bar: `Bar ${barNo}`, selection: 'Selection', loop: 'Loop', live: 'Live' }[src];
  const cBar = Math.floor(cursor.value / bar) + 1;
  const cBeat = (cursor.value % bar) / beatTicks(s.timeSig) + 1;
  const cBeatLabel = Number.isInteger(cBeat) ? `beat ${cBeat}` : `beat ${Math.floor(cBeat)}+`;
  const width = OPEN_W + MAX_FRET * FRET_W;
  const onCell = (string: number, fret: number, shift: boolean) =>
    (edit ? insertNote(string, fret, shift) : previewNote(string, fret));

  return (
    <div class="panel">
      <div class="row" style={{ marginBottom: 8 }}>
        <strong>Fretboard</strong>
        <span class="muted">{label}</span>
        {edit && (
          <span class="cursor-badge" title="Where the next fret click goes. Click a note in the tab or roll to insert in front of it.">
            Next note → bar {cBar}, {cBeatLabel}
          </span>
        )}
        <span class="spacer" />
        <span class="legend muted">
          <i class="lg hot" /> playing <i class="lg next" /> next <i class="lg soft" /> in view
        </span>
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
                const c = cells.get(`${str}:${f}`);
                const cls = c
                  ? `${c.hot ? ' hot' : c.soft ? ' soft' : ''}${c.next && !c.hot ? ' next' : ''}${c.atCursor ? ' at-cursor' : ''}`
                  : '';
                return (
                  <div key={`${str}:${f}`} class={`fb-cell${cls}`}
                    style={{ left: cellX(f), top: str * ROW_H, width: cellW(f), height: ROW_H }}
                    title={edit ? 'Click to add · Shift-click to stack on the previous note (chord)' : undefined}
                    onPointerDown={e => { e.preventDefault(); onCell(str, f, e.shiftKey); }}>
                    <span class="fb-dot">{c ? f : noteName(pitchOf(s, { string: str, fret: f }))}</span>
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
