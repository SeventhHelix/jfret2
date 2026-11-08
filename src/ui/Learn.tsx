// Learn: short fretboard-knowledge drills (notes, intervals, chord shapes, scales). One question engine for all of
// them: a prompt, a part of the neck, and spots to find: on the guitar (then Reveal), or by tapping the neck.
import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Neck, NeckMark } from './Neck';
import { SectionNav } from './SectionNav';
import { CATEGORIES, Category, DRILLS, DrillId, Mark, Question, drillById } from '../learn/drills';
import { landmarkHint, pitchAt, posKey, Pos } from '../learn/fretmap';
import { LearnStats, accuracy, readStats, readyToLevelUp, record, streakDays, dayKey, weight } from '../learn/stats';
import { getCtx, playPluck } from '../audio/synth';
import { intervalHue } from './colors';
import { pc } from '../model/theory';

// ---- persisted state ----
const STATS_KEY = 'jfret:learn';
const OPTS_KEY = 'jfret:learn-opts';
const read = (k: string) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

type Pick = DrillId | `mix:${Category}`;
type Opts = { pick: Pick; answer: 'reveal' | 'tap'; sound: boolean };
const DEFAULT_OPTS: Opts = { pick: 'n-box', answer: 'reveal', sound: true };
const stats = signal<LearnStats>(readStats(read(STATS_KEY)));
const opts = signal<Opts>({ ...DEFAULT_OPTS, ...(read(OPTS_KEY) ?? {}) });
const setOpts = (p: Partial<Opts>) => { opts.value = { ...opts.value, ...p }; write(OPTS_KEY, opts.value); };
const levelOf = (id: DrillId) => stats.value.levels[id] ?? 1;
function setLevel(id: DrillId, level: number) {
  stats.value = { ...stats.value, levels: { ...stats.value.levels, [id]: level } };
  write(STATS_KEY, stats.value);
}

// ---- the current question ----
type Phase = 'ask' | 'shown';
type QState = {
  q: Question;
  phase: Phase;
  started: number;
  hints: string[];             // revealed target keys, in order
  hit: Set<string>;            // tap mode: found
  miss: Set<string>;           // tap mode: wrong taps
  chosen: string | null;       // name-it: the button picked
  graded: boolean;
};
const cur = signal<QState | null>(null);
const sessionStart = signal<number | null>(null);
const answered = signal(0);

const catOf = (p: Pick): Category => (p.startsWith('mix:') ? (p.slice(4) as Category) : drillById(p as DrillId).cat);

function nextQuestion() {
  const p = opts.value.pick;
  const pool = p.startsWith('mix:') ? DRILLS.filter(d => d.cat === catOf(p)) : [drillById(p as DrillId)];
  const prev = cur.value?.q;
  const now = Date.now();
  const s = stats.value;
  let q: Question | null = null;
  for (let tries = 0; tries < 6; tries++) {
    const d = pool[Math.floor(Math.random() * pool.length)];
    q = d.gen(levelOf(d.id), { rng: Math.random, weigh: (dr, item) => weight(s, dr, item, now) });
    if (!prev || q.prompt !== prev.prompt || q.sub !== prev.sub) break; // don't ask the exact same thing twice in a row
  }
  cur.value = { q: q!, phase: 'ask', started: now, hints: [], hit: new Set(), miss: new Set(), chosen: null, graded: false };
}

function grade(ok: boolean) {
  const c = cur.value;
  if (!c || c.graded) return;
  const now = Date.now();
  stats.value = record(stats.value, c.q.drill, c.q.level, c.q.item, ok, now - c.started, now);
  write(STATS_KEY, stats.value);
  sessionStart.value ??= c.started;
  answered.value++;
  cur.value = { ...c, graded: true };
}

// ---- sound ----
function playPitches(ps: number[], gap = 0.16) {
  if (!opts.value.sound || !ps.length) return;
  const ctx = getCtx();
  void ctx.resume();
  const t0 = ctx.currentTime + 0.03;
  ps.forEach((p, i) => playPluck(ctx, p, t0 + i * gap, 0.7));
}
function playAnswer(q: Question) {
  if (q.sound === 'none') return;
  if (q.sound === 'interval') {
    const r = q.given.find(m => m.root), t = q.targets[0];
    if (r && t) {
      const a = pitchAt(r.pos), b = pitchAt(t.pos);
      playPitches([a, b], 0.45);
      const ctx = getCtx();
      if (opts.value.sound) { playPluck(ctx, a, ctx.currentTime + 1.0, 0.9); playPluck(ctx, b, ctx.currentTime + 1.0, 0.9); }
    }
    return;
  }
  const ps = [...new Set(q.targets.map(m => pitchAt(m.pos)))].sort((a, b) => a - b).slice(0, 10);
  playPitches(ps);
}

function reveal() {
  const c = cur.value;
  if (!c || c.phase === 'shown') return;
  cur.value = { ...c, phase: 'shown' };
  playAnswer(c.q);
  if (opts.value.answer === 'tap' && !c.q.choices) grade(false); // gave up
}

/** One more target shown: roots first, then the one nearest a landmark (easiest to work out from). */
function hint() {
  const c = cur.value;
  if (!c || c.phase === 'shown' || c.q.choices) return;
  const left = c.q.targets.filter(m => !c.hints.includes(posKey(m.pos)) && !c.hit.has(posKey(m.pos)));
  if (!left.length) return;
  const dist = (m: Mark) => Math.min(...[0, 5, 7, 12, 17].map(l => Math.abs(l - m.pos.fret)));
  const m = [...left].sort((a, b) => Number(!!b.root) - Number(!!a.root) || dist(a) - dist(b))[0];
  cur.value = { ...c, hints: [...c.hints, posKey(m.pos)] };
  playPitches([pitchAt(m.pos)]);
}

function tap(p: Pos) {
  const c = cur.value;
  if (!c) return;
  const k = posKey(p);
  playPitches([pitchAt(p)]);
  if (c.phase === 'shown' || opts.value.answer !== 'tap' || c.q.choices) return; // just a sound
  const isTarget = c.q.targets.some(m => posKey(m.pos) === k);
  if (c.q.given.some(m => posKey(m.pos) === k)) return;
  const hit = new Set(c.hit), miss = new Set(c.miss);
  if (isTarget) hit.add(k); else miss.add(k);
  const next = { ...c, hit, miss };
  const done = c.q.targets.every(m => hit.has(posKey(m.pos)) || c.hints.includes(posKey(m.pos)));
  cur.value = done ? { ...next, phase: 'shown' } : next;
  if (done) grade(miss.size === 0 && c.hints.length === 0);
}

function choose(name: string) {
  const c = cur.value;
  if (!c || c.phase === 'shown') return;
  cur.value = { ...c, chosen: name, phase: 'shown' };
  playAnswer(c.q);
  grade(name === c.q.answer);
}

// ---- view ----
const PRINCIPLES: [string, string][] = [
  ['Recall first, then check',
    "Pull the answer out of your own head before you look: find it on the guitar and say it out loud, then reveal. Struggling for a few seconds is the workout; reading a diagram feels productive but barely sticks. Tap mode makes you commit to every spot before you see it."],
  ['Link it to something you know',
    'Nobody memorises 72 separate spots. Every drill here hangs a new fact off an anchor: the open strings and 5th/7th/12th frets, octave shapes, the root under your finger, the shape you just played. Hints show that link, not just the answer.'],
  ['Mix it up, a little every day',
    'Shuffled questions feel harder than drilling one thing, and they stick much better (it holds for musicians too). Use Mix once a drill feels easy. Missed items come back sooner, solid ones less often. Five focused minutes a day beats an hour once a week; stop while it still feels fresh.'],
];

const markStyle = (m: Mark, root: number | null): JSX.CSSProperties | undefined =>
  root === null || m.root ? undefined : ({ '--ic': intervalHue(pc(pitchAt(m.pos)) - root) } as JSX.CSSProperties);

export function Learn() {
  useEffect(() => { if (!cur.value) nextQuestion(); }, []);
  useLearnKeys();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 15000); return () => clearInterval(t); }, []);
  const o = opts.value;
  const c = cur.value;
  const s = stats.value;
  if (!c) return null;
  const q = c.q;
  const drill = drillById(q.drill);
  const level = q.level;
  const isMix = o.pick.startsWith('mix:');
  const tapMode = o.answer === 'tap' && !q.choices;
  const shown = c.phase === 'shown';
  const today = s.days[dayKey(Date.now())] ?? 0;
  const streak = streakDays(s.days, Date.now());
  const mins = sessionStart.value ? (Date.now() - sessionStart.value) / 60000 : 0;
  const acc = accuracy(s, q.drill, level);
  const ready = !isMix && level < drill.levels.length && readyToLevelUp(s, q.drill, level);

  // Interval colouring uses the root when the question has one (given root, or the labels say R).
  const rootMark = [...q.given, ...q.targets].find(m => m.root);
  const root = rootMark ? pc(pitchAt(rootMark.pos)) : null;
  const marks = new Map<string, NeckMark>();
  for (const m of q.given) marks.set(posKey(m.pos), { label: m.label, cls: `lr-given${m.root ? ' lr-root' : ''}` });
  for (const m of q.targets) {
    const k = posKey(m.pos);
    const found = c.hit.has(k), hinted = c.hints.includes(k);
    if (shown || found || hinted) {
      const cls = q.choices ? (c.chosen === q.answer ? 'lr-hit' : 'lr-target') : found ? 'lr-hit' : hinted ? 'lr-hint' : tapMode ? 'lr-missed' : 'lr-target';
      marks.set(k, { label: m.label, cls: `${cls}${m.root ? ' lr-root' : ''}`, style: markStyle(m, root) });
    }
  }
  for (const k of c.miss) if (!marks.has(k)) marks.set(k, { label: '✕', cls: 'lr-wrong' });

  const lastHint = c.hints.length ? q.targets.find(m => posKey(m.pos) === c.hints[c.hints.length - 1]) : null;
  const left = q.targets.length - q.targets.filter(m => c.hit.has(posKey(m.pos)) || c.hints.includes(posKey(m.pos))).length;
  const pickDrill = (v: string) => { setOpts({ pick: v as Pick }); nextQuestion(); };

  return (
    <div class="learn">
      <div class="panel header">
        <div class="row">
          <SectionNav />
          <span class="seg small" role="group" aria-label="Topic">
            {CATEGORIES.map(([id, name]) => (
              <button key={id} class={catOf(o.pick) === id ? 'on' : ''}
                onClick={() => pickDrill(DRILLS.find(d => d.cat === id)!.id)}>{name}</button>
            ))}
          </span>
          <select value={o.pick} onChange={e => { pickDrill(e.currentTarget.value); e.currentTarget.blur(); }} title="Drill">
            {DRILLS.filter(d => d.cat === catOf(o.pick)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            <option value={`mix:${catOf(o.pick)}`}>Mix all of these</option>
          </select>
          {!isMix && (
            <select value={String(level)} title="Level" onChange={e => { setLevel(q.drill, Number(e.currentTarget.value)); nextQuestion(); e.currentTarget.blur(); }}>
              {drill.levels.map((l, i) => <option key={i} value={String(i + 1)}>Level {i + 1}: {l}</option>)}
            </select>
          )}
          <span class="spacer" />
          <span class="seg small" role="group" title="How you answer: on your guitar then Reveal, or by tapping the spots here">
            <button class={o.answer === 'reveal' ? 'on' : ''} onClick={() => setOpts({ answer: 'reveal' })}>🎸<span class="lbl"> Play &amp; reveal</span></button>
            <button class={o.answer === 'tap' ? 'on' : ''} onClick={() => setOpts({ answer: 'tap' })}>👆<span class="lbl"> Tap</span></button>
          </span>
          <button class={o.sound ? 'on' : ''} onClick={() => setOpts({ sound: !o.sound })} title="Play the answer's notes">♪</button>
        </div>
      </div>

      <div class="panel lr-q">
        <div class="lr-prompt">
          <div>
            <div class="lr-title">{q.prompt}</div>
            <div class="muted">{q.sub}{isMix && <> · <i>{drill.name}</i></>}</div>
          </div>
          <div class="lr-stats muted">
            {acc.of > 0 && <span title="Right answers out of the last 10 at this level">{acc.right}/{acc.of}</span>}
            <span title="Questions today">{today} today</span>
            {streak > 1 && <span title="Days in a row">🔥 {streak}</span>}
          </div>
        </div>
        <div class="row lr-actions">
          {q.choices ? (
            <div class="lr-choices">
              {q.choices.map(ch => (
                <button key={ch} onClick={() => choose(ch)} disabled={shown && ch !== c.chosen && ch !== q.answer}
                  class={shown ? (ch === q.answer ? 'right' : ch === c.chosen ? 'wrong' : '') : ''}>{ch}</button>
              ))}
            </div>
          ) : !shown ? (
            <>
              <button class="play" onClick={reveal} title="Show every answer (Space)">{tapMode ? 'Give up' : 'Reveal'}</button>
              <button onClick={hint} disabled={left === 0} title="Show one, with how to get there from a landmark (H)">Hint</button>
              {tapMode && <span class="muted">{left} to find{c.miss.size ? ` · ${c.miss.size} wrong` : ''}</span>}
            </>
          ) : null}
          {shown && !q.choices && !tapMode && !c.graded && (
            <>
              <span class="muted">Did you get them all?</span>
              <button class="right" onClick={() => { grade(true); nextQuestion(); }} title="1">✓ Yes</button>
              <button class="wrong" onClick={() => { grade(false); nextQuestion(); }} title="2">✗ Missed some</button>
            </>
          )}
          {shown && (c.graded || q.choices) && (
            <>
              {(tapMode || q.choices) && <span class={`lr-verdict ${(q.choices ? c.chosen === q.answer : c.miss.size === 0 && !c.hints.length && c.hit.size === q.targets.length) ? 'ok' : 'no'}`}>
                {q.choices ? (c.chosen === q.answer ? '✓ Right' : `✗ ${q.answer}`) : c.hit.size === q.targets.length && !c.miss.size && !c.hints.length ? '✓ All found' : '✗ Not quite'}
              </span>}
              <button class="play" onClick={nextQuestion} title="Space">Next →</button>
            </>
          )}
          {ready && <button class="mini lr-up" onClick={() => { setLevel(q.drill, level + 1); nextQuestion(); }}>8 of 10 right: try level {level + 1} →</button>}
        </div>
        {lastHint && !shown && q.drill.startsWith('n-') && <div class="lr-hinttext">💡 {landmarkHint(lastHint.pos)}</div>}
      </div>

      <div class="panel">
        <Neck marks={marks} region={q.region} view={q.view} onTap={tap} shapes={shown ? q.shapes : undefined} />
      </div>

      {mins >= 5 && answered.value >= 10 && (
        <div class="panel lr-done">✓ {Math.floor(mins)} minutes, {answered.value} questions. That's a good session: stopping while it's fresh and coming back tomorrow does more than pushing on.</div>
      )}

      <div class="panel lr-tips">
        <div class="lr-how"><b>How to practise this:</b> {drill.how}</div>
        <details class="sm-sec" open={Object.keys(s.items).length < 5}>
          <summary>Why it works</summary>
          <div class="lr-principles">
            {PRINCIPLES.map(([t, d], i) => <div key={i}><b>{i + 1}. {t}.</b> {d}</div>)}
          </div>
        </details>
        <p class="hints"><span><kbd>Space</kbd> reveal / next</span><span><kbd>H</kbd> hint</span><span><kbd>1</kbd> got them · <kbd>2</kbd> missed some</span></p>
      </div>
    </div>
  );
}

function useLearnKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : document.body;
      if (t.closest('textarea, select, input') || e.ctrlKey || e.metaKey || e.altKey) return;
      const c = cur.value;
      if (!c) return;
      const k = e.key.toLowerCase();
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        if (c.phase === 'ask' && !c.q.choices && opts.value.answer === 'reveal') reveal(); // Space never gives up in tap mode
        else if (c.phase === 'shown' && (c.graded || c.q.choices)) nextQuestion();
        return;
      }
      if (k === 'h') { hint(); return; }
      if (c.phase === 'shown' && !c.graded && (k === '1' || k === '2')) { grade(k === '1'); nextQuestion(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
