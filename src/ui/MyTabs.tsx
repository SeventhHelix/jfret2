import { useEffect, useRef, useState } from 'preact/hooks';
import { byRecent, timeAgo } from '../model/library';
import { GP_ACCEPT } from './ImportDialog';
import { currentTabId, deleteTab, importFile, library, newSong, openTab, saveToMyTabs, setSection, song } from '../state/store';

// Find a tab to download: each site's own search, with the query filled in. (Their files can't be fetched from
// here: browsers block cross-site downloads and the sites don't allow it. Download there, then drop the file here.)
const TAB_SITES: { name: string; note: string; url: (q: string) => string }[] = [
  { name: 'Ultimate Guitar', note: 'Guitar Pro tabs, the biggest catalogue', url: q => `https://www.ultimate-guitar.com/search.php?search_type=title&value=${q}&type=500` },
  { name: 'Songsterr', note: 'play along there; downloads need Plus', url: q => `https://www.songsterr.com/?pattern=${q}` },
  { name: 'GProTab', note: 'free Guitar Pro downloads', url: q => `https://gprotab.net/en/search?q=${q}` },
  { name: 'Web search', note: 'anywhere else', url: q => `https://duckduckgo.com/?q=${q}%20guitar%20pro%20tab%20gp5` },
];

function FindTab() {
  const [q, setQ] = useState('');
  const enc = encodeURIComponent(q.trim());
  return (
    <div class="mt-find">
      <input type="search" value={q} placeholder="Find a tab: band or song" aria-label="Find a tab to download"
        onInput={e => setQ(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter' && enc) window.open(TAB_SITES[0].url(enc), '_blank', 'noopener'); }} />
      {enc && (
        <ul class="mt-sites">
          {TAB_SITES.map(s => (
            <li key={s.name}>
              <a href={s.url(enc)} target="_blank" rel="noopener noreferrer">{s.name} ↗</a>
              <span class="muted">{s.note}</span>
            </li>
          ))}
          <li class="muted mt-find-tip">Download the .gp file, then drop it on this page (or Import file… below). The solo gets picked for you if the file marks one.</li>
        </ul>
      )}
    </div>
  );
}

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
        {/* Phones: Play's header has no room for the section switch, so it lives here. */}
        <div class="mt-sections">
          <span class="seg small" role="group" aria-label="Section">
            <button class="on">♪ Play</button>
            <button onClick={() => { closeMenu(); setSection('learn'); }}>◎ Learn</button>
            <button onClick={() => { closeMenu(); setSection('speed'); }}>⚡ Speed</button>
          </span>
        </div>
        <div class="mt-head">
          <b>My tabs</b>
          <span class="muted">saved in this browser</span>
        </div>
        <FindTab />
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
