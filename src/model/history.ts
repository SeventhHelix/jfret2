export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private limit = 200) {}

  /** Record the state that existed before a change. */
  push(prev: T) {
    this.past.push(prev);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }
}
