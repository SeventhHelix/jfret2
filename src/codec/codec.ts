import { MAX_FRET, MAX_TICKS, STRINGS, Song, TUNING_IDS, newId, normalizeNotes, sortNotes, Note, Tech } from '../model/song';
import { cleanTech } from '../model/tech';

// Version 2: the duration varint is dur * 2 + hasTech, and only notes with techniques carry a flags byte.
// BEND means one more byte follows: semitones (bits 0-2) | release << 3.
const T_VIBRATO = 1, T_SLIDE = 2, T_LEGATO = 4, T_MUTE = 8, T_HARMONIC = 16, T_DEAD = 32, T_BEND = 64;

function writeTech(out: number[], c: Tech) {
  let f = 0;
  if (c.vibrato) f |= T_VIBRATO;
  if (c.slide) f |= T_SLIDE;
  if (c.legato) f |= T_LEGATO;
  if (c.mute) f |= T_MUTE;
  if (c.harmonic) f |= T_HARMONIC;
  if (c.dead) f |= T_DEAD;
  if (c.bend) f |= T_BEND;
  out.push(f);
  if (c.bend) out.push(c.bend | (c.release ? 8 : 0));
}

function readTech(r: Reader): Tech | undefined {
  const f = r.byte();
  if (f & 0x80) throw new Error('bad technique flags');
  const t: Tech = {};
  if (f & T_VIBRATO) t.vibrato = true;
  if (f & T_SLIDE) t.slide = true;
  if (f & T_LEGATO) t.legato = true;
  if (f & T_MUTE) t.mute = true;
  if (f & T_HARMONIC) t.harmonic = true;
  if (f & T_DEAD) t.dead = true;
  if (f & T_BEND) {
    const b = r.byte();
    const semis = b & 7;
    if (semis < 1 || semis > 4 || b > 15) throw new Error('bad bend');
    t.bend = semis;
    if (b & 8) t.release = true;
  }
  return cleanTech(t);
}

const VERSION = 2; // 2 adds techniques; version 1 links still decode
const MAX_TITLE_BYTES = 60;
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

function writeVarint(out: number[], n: number) {
  n = Math.max(0, Math.floor(n));
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
}

class Reader {
  private i = 0;
  constructor(private b: Uint8Array) {}
  byte(): number {
    if (this.i >= this.b.length) throw new Error('truncated payload');
    return this.b[this.i++];
  }
  varint(): number {
    let result = 0;
    let mul = 1;
    for (let k = 0; k < 5; k++) {
      const x = this.byte();
      result += (x & 0x7f) * mul;
      if (!(x & 0x80)) return result;
      mul *= 0x80;
    }
    throw new Error('bad varint');
  }
  bytes(n: number): Uint8Array {
    if (this.i + n > this.b.length) throw new Error('truncated payload');
    const s = this.b.subarray(this.i, this.i + n);
    this.i += n;
    return s;
  }
}

function truncateTitle(title: string): Uint8Array {
  const chars = Array.from(title);
  let bytes = enc.encode(title);
  while (bytes.length > MAX_TITLE_BYTES) {
    chars.pop();
    bytes = enc.encode(chars.join(''));
  }
  return bytes;
}

export function toBase64Url(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = t + '==='.slice((t.length + 3) % 4);
  const bin = atob(padded); // throws on invalid input
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export function encodeSong(song: Song): string {
  const out: number[] = [VERSION];
  writeVarint(out, song.bpm);
  out.push(song.timeSig[0], song.timeSig[1]);
  out.push(Math.max(0, TUNING_IDS.indexOf(song.tuning)));
  const title = truncateTitle(song.title);
  writeVarint(out, title.length);
  out.push(...title);
  const notes = sortNotes(song.notes);
  writeVarint(out, notes.length);
  let prev = 0;
  for (const n of notes) {
    writeVarint(out, n.start - prev);
    const tech = cleanTech(n.tech);
    writeVarint(out, n.dur * 2 + (tech ? 1 : 0));
    out.push((n.string << 5) | n.fret);
    if (tech) writeTech(out, tech);
    prev = n.start;
  }
  return toBase64Url(Uint8Array.from(out));
}

export function decodeSong(payload: string): Song {
  const r = new Reader(fromBase64Url(payload));
  const version = r.byte();
  if (version !== 1 && version !== 2) throw new Error(`unsupported version ${version}`);
  const bpm = r.varint();
  if (bpm < 30 || bpm > 300) throw new Error('bad bpm');
  const num = r.byte();
  const den = r.byte();
  if (num < 1 || num > 16 || ![2, 4, 8, 16].includes(den)) throw new Error('bad time signature');
  const tuning = TUNING_IDS[r.byte()];
  if (!tuning) throw new Error('bad tuning');
  const titleLen = r.varint();
  if (titleLen > MAX_TITLE_BYTES) throw new Error('bad title');
  const title = dec.decode(r.bytes(titleLen));
  const count = r.varint();
  const notes: Note[] = [];
  let start = 0;
  for (let i = 0; i < count; i++) {
    start += r.varint();
    const durField = r.varint();
    const dur = version >= 2 ? durField >> 1 : durField;
    const sf = r.byte();
    const string = sf >> 5;
    const fret = sf & 0x1f;
    const tech = version >= 2 && durField & 1 ? readTech(r) : undefined;
    if (dur < 1 || start + dur > MAX_TICKS || string >= STRINGS || fret > MAX_FRET) throw new Error('bad note');
    notes.push(tech ? { id: newId(), start, dur, string, fret, tech } : { id: newId(), start, dur, string, fret });
  }
  return { v: 1, title, bpm, timeSig: [num, den], tuning, notes: normalizeNotes(notes) }; // also repairs links saved before the one-note-per-string rule
}
