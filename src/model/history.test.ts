import { it, expect } from 'vitest';
import { History } from './history';

it('undoes and redoes', () => {
  const h = new History<string>();
  h.push('a'); // state went a -> b
  expect(h.undo('b')).toBe('a');
  expect(h.redo('a')).toBe('b');
  expect(h.redo('b')).toBeNull();
});

it('clears redo on new push', () => {
  const h = new History<string>();
  h.push('a');
  h.undo('b');
  h.push('a');
  expect(h.redo('c')).toBeNull();
});

it('caps history length', () => {
  const h = new History<number>(2);
  h.push(1); h.push(2); h.push(3);
  expect(h.undo(4)).toBe(3);
  expect(h.undo(3)).toBe(2);
  expect(h.undo(2)).toBeNull();
});
