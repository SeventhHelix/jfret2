# jFret

Sketch guitar riffs on a clickable fretboard, fix the rhythm in a tab-roll, play them back, and share them as a link.
Everything runs in the browser — the whole riff lives in the URL after `#s=`. No server, no database.

## Develop

```bash
npm install
npm run dev      # hot-reloading dev server
npm test         # unit tests (codec, edit ops, rhythm)
npm run build    # static site in dist/
```

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml` and publishes to `https://<user>.github.io/<repo>/`.

## Using it

- **Edit mode:** click frets to sketch notes (each is an 8th at the green insert cursor). Fix rhythm in the tab-roll:
  drag to move, drag the right edge to resize, marquee-select, then Quantize / Apply feel / Even out / Legato.
- **Keys:** Space play · 1–6 set length (whole → 32nd) · arrows nudge/move string · Delete · Ctrl+Z / Ctrl+Shift+Z.
- **Watching:** the fretboard's Bar / selection mode softly shows every note in the current bar (or selection/loop)
  and strongly highlights the note being played.
- **Share:** "Copy link". Links open in a clean player view with an "Edit / remix" button.
