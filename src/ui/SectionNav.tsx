// Play / Learn / Speed: the three sections, first thing in each header.
import { Section, section, setSection } from '../state/store';

const SECTIONS: [Section, string, string, string][] = [
  ['play', '♪', 'Play', 'Play and sketch riffs'],
  ['learn', '◎', 'Learn', 'Learn the neck: notes, intervals, chord shapes, scales'],
  ['speed', '⚡', 'Speed', 'Speed trainer: technique patterns, bursts, tempo ladder'],
];

export function SectionNav({ inPlay }: { inPlay?: boolean }) {
  return (
    <>
    {/* Narrow screens: one small native picker, so the header doesn't grow a row. */}
    <select class={`section-pick${inPlay ? ' in-play' : ''}`} value={section.value} aria-label="Section" title="Play, Learn or Speed"
      onChange={e => { setSection(e.currentTarget.value as Section); e.currentTarget.blur(); }}>
      {SECTIONS.map(([id, icon, name]) => <option key={id} value={id}>{icon} {name}</option>)}
    </select>
    <span class="seg small section-nav" role="tablist" aria-label="Section">
      {SECTIONS.map(([id, icon, name, title]) => (
        <button key={id} role="tab" aria-selected={section.value === id} class={section.value === id ? 'on' : ''}
          onClick={() => setSection(id)} title={title}>{icon}<span class="lbl"> {name}</span></button>
      ))}
    </span>
    </>
  );
}
