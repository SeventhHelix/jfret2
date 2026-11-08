import { useEffect, useRef } from 'preact/hooks';
import { byRecent, timeAgo } from '../model/library';
import { GP_ACCEPT } from './ImportDialog';
import { currentTabId, deleteTab, importFile, library, newSong, openTab, saveToMyTabs, song } from '../state/store';

/** ☰ My tabs: the songs saved in this browser. Open one, save the riff you're on, start new, import a file. */
export function MyTabs() {
  const ref = useRef<HTMLDetailsElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const closeMenu = () => { if (ref.current) ref.current.open = false; };
  const cur = currentTabId.value;
  const tabs = byRecent(library.value);
  const now = Date.now();
  const unsaved = !cur && song.value.notes.length > 0;
  return (
    <details class="opts my-tabs" ref={ref}>
      <summary title="My tabs: songs saved in this browser">☰</summary>
      <div class="opts-pop">
        <div class="mt-head">
          <b>My tabs</b>
          <span class="muted">saved in this browser</span>
        </div>
        {unsaved && (
          <button class="primary mt-save" onClick={saveToMyTabs}>＋ Save “{song.value.title || 'Untitled riff'}”</button>
        )}
        {tabs.length ? (
          <ul class="mt-list">
            {tabs.map(t => (
              <li key={t.id} class={t.id === cur ? 'on' : ''}>
                <button class="mt-open" onClick={() => { if (t.id !== cur) openTab(t.id); closeMenu(); }}>
                  <span class="mt-title">{t.title.trim() || 'Untitled riff'}</span>
                  <span class="muted mt-when">{t.id === cur ? 'open' : timeAgo(t.updated, now)}</span>
                </button>
                <button class="ghost mt-del" title="Remove from My tabs"
                  onClick={() => { if (confirm(`Remove “${t.title || 'Untitled riff'}” from My tabs?`)) deleteTab(t.id); }}>✕</button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="muted mt-empty">Nothing saved yet. Import a Guitar Pro file, or save the riff you're on.</p>
        )}
        <div class="mt-foot">
          <button onClick={() => { closeMenu(); newSong(); }}>New riff</button>
          <button onClick={() => fileRef.current?.click()}>Import file…</button>
          <input ref={fileRef} type="file" accept={GP_ACCEPT} hidden
            onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) { closeMenu(); importFile.value = f; } }} />
        </div>
      </div>
    </details>
  );
}
