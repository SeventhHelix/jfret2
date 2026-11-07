// Keep the screen on while playing (phones dim and lock during a long solo otherwise).
// Screen Wake Lock API: Chrome/Android, Safari 16.4+, HTTPS only. Where it's missing, this does nothing.

let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire() {
  if (!wanted || sentinel || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
    if (!wanted) void release(); // playback stopped while the request was pending
  } catch { /* not allowed right now (e.g. low battery mode): nothing to do */ }
}

async function release() {
  const s = sentinel;
  sentinel = null;
  try { await s?.release(); } catch { /* already released */ }
}

/** On while playing, off otherwise. */
export function keepScreenOn(on: boolean) {
  wanted = on;
  void (on ? acquire() : release());
}

// The browser drops the lock when the page is hidden; take it back when you return mid-song.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void acquire(); });
}
