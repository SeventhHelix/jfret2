import { describe, expect, it } from 'vitest';
import { DEFAULT_PRACTICE, Practice, formatPractice, pageTitle, parsePractice } from './practice';

describe('practice settings in the link', () => {
  it('writes nothing for defaults, and a link without settings sets none', () => {
    expect(formatPractice(DEFAULT_PRACTICE)).toBe('');
    expect(parsePractice('#s=AQBk')).toBeNull();
  });

  it('round-trips every setting', () => {
    const p: Practice = {
      speed: 0.75, loop: { start: 96, end: 288 }, metronome: true, countIn: true,
      volume: 0.5, clickVolume: 0.3, instrument: 'overdrive', click: 'woodblock',
    };
    const hash = `#s=AQBk${formatPractice(p)}`;
    expect(hash).toBe('#s=AQBk&sp=75&lp=96-288&m=1&ci=1&v=50,30&i=overdrive&c=woodblock');
    expect(parsePractice(hash)).toEqual(p);
  });

  it('fills unspecified settings with defaults', () => {
    expect(parsePractice('#s=x&sp=60')).toEqual({ ...DEFAULT_PRACTICE, speed: 0.6 });
  });

  it('ignores malformed values instead of failing', () => {
    expect(parsePractice('#s=x&sp=999&lp=50-10&v=abc&i=banjo&c=<script>')).toEqual(DEFAULT_PRACTICE);
  });

  it('page title', () => {
    expect(pageTitle('Demo Song · Solo')).toBe('jFret - Demo Song · Solo');
    expect(pageTitle('  ')).toBe('jFret');
    expect(pageTitle('Untitled riff')).toBe('jFret');
  });
});
