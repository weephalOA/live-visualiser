# Live Visualiser

A browser-based, real-time music visualiser. It listens to **tab/system audio** or the
**microphone**, estimates the music's mood on a valence-arousal plane, and drives the visuals
from that, using the emotion model from the Honours dissertation *A Computational Creativity
Approach from Music to Images* (University of Stirling, 2025-26).

Everything runs client-side as a static site. Audio never leaves the browser.

## Running it

```sh
npm install
npm run dev        # local dev server (microphone needs localhost or HTTPS)
npm test           # unit tests (Vitest)
npm run build      # static build in dist/
```

### Deploying to GitHub Pages

`.github/workflows/deploy.yml` tests, builds and deploys on every push to `main`. One-off setup:
**Settings → Pages → Build and deployment → Source: GitHub Actions**. The site is served from
`/live-visualiser/`; if the repository is renamed, update `PAGES_BASE` in `vite.config.ts`.

## Audio sources

| Source | Where it works | Notes |
|---|---|---|
| Tab or system audio | Desktop Chrome/Edge (best), Firefox/Safari partly | Uses screen sharing. Pick a tab and tick **Share audio**; on Windows/ChromeOS "Entire screen" can share all system audio. Clean signal. |
| Microphone | Everywhere, including phones | Picks up room sound. Browser voice processing (echo cancellation, noise suppression, auto gain) is turned off so music is not filtered. |

Phones cannot capture other apps' audio from a web page, so only the microphone is offered there.

## How it works

```
audio input ─▶ AudioWorklet ─▶ AudioFeatureExtractor ─▶ FeatureFrame ─▶ toVisualParams ─▶ ease + drift ─▶ theme.render
(mic / tab)    (raw samples)    sliding 4-bar window      A4 features      A6-A7 mapping     (replaces GA)    (every frame)
                                + onsets (note-ons)       + A5 scores
```

- `src/analysis/features.ts`: valence, arousal, complexity, cadence and motif formulas, ported unchanged.
- `src/analysis/key.ts`: key finder (Aarden-Essen profiles, as music21's default `analyze('key')`).
- `src/analysis/extractor.ts`: estimates every dissertation feature from live audio (below).
- `src/mapping/`: hue, brightness, saturation, shape ranking and colour harmony, ported unchanged. The cool clamp is applied everywhere, including after drift and in the shader.
- `src/engine/`: per-frame easing (shortest-arc hue) and seeded simplex drift inside a fraction of the GA gene bounds, narrowed at low valence.
- `src/themes/`: one renderer per theme behind a shared `Theme` interface.

### Estimating the features from audio

| Feature | MIDI version (dissertation) | Live audio version |
|---|---|---|
| `avgPitch`, `pitchVar` | Mean/variance of note pitches | Spectral peaks (8192-point FFT, 55 Hz-4.2 kHz) with overtone suppression, weighted by sounding time |
| `density` | Note events per bar | Spectral-flux onsets per bar (a chord is one onset) |
| `tempo` | Tempo markings | Onset-envelope autocorrelation with a 120 BPM prior, median-smoothed, carried forward when unclear |
| `key`, `keyMode` | music21 key analysis | Pitch-class histogram (~15 s memory) → key finder with hysteresis. `key` = detected key's signature |
| `beatsPerBar` | Time signature | Fixed at 4 (metre is not reliably detectable) |
| `motifScore` | Pitch-class trigrams per bar | Same, using each onset's dominant pitch |
| first/second-half values | Bars 1-2 vs 3-4 | First vs second half of the sliding window |

The window is 4 bars at the current tempo and slides with every 512-sample hop (~11 ms), so
valence and arousal form a continuous curve rather than stepping every 4 bars.

## Themes

| Theme | Renderer | Mapping |
|---|---|---|
| **Psychedelic** | WebGL fragment shader | Infinite zoom: shapes on a log-polar grid, a logarithmic spiral on screen. Arousal sets zoom and rotation speed, complexity sets shapes per turn, shape kinds ranked by sharpness vs arousal, motif score above 0.4 fades in 6-fold kaleidoscope symmetry, onsets pulse the shapes. Radial gradient background and dynamics vignette from the baseline renderer. |
| **Ambient** | Canvas 2D | Slow drifting soft blobs (count from complexity) with 3 s easing. Arousal barely changes speed; valence sets colour temperature. Onsets make faint blooms placed by pitch, low to high from left to right. |

Press **S** for the analysis overlay (live valence-arousal plot and raw features), **F** for
full screen, **1**/**2** to switch themes and **Esc** to stop.

Adding a theme: implement `Theme` from `src/themes/types.ts` and add it to `src/themes/index.ts`.
