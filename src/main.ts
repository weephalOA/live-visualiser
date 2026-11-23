import './style.css';
import {
  describeInputError,
  LiveAudioInput,
  microphoneSupported,
  systemCaptureSupported,
  type InputKind,
} from './analysis/live';
import { IdleSource } from './engine/idle';
import { Engine } from './engine/loop';
import { THEMES } from './themes';
import {
  autoHide,
  buildThemePickers,
  fullscreenSupported,
  loadThemeId,
  saveThemeId,
  toggleFullscreen,
} from './ui/controls';
import { StatsPanel } from './ui/stats';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const startPanel = $('start');
const hud = $('hud');
const errorEl = $('error');
const systemBtn = $<HTMLButtonElement>('use-system');
const micBtn = $<HTMLButtonElement>('use-mic');
const statsBtn = $<HTMLButtonElement>('toggle-stats');
const fullscreenBtn = $<HTMLButtonElement>('toggle-fullscreen');

const stats = new StatsPanel($('stats'), $<HTMLCanvasElement>('va-plot'), $('stats-list'));
const engine = new Engine($('stage'), { onFrame: (f) => stats.update(f) });
const idle = new IdleSource();
let input: LiveAudioInput | null = null;
let wakeLock: { release(): Promise<void> } | null = null;

function showError(msg: string | null): void {
  errorEl.hidden = !msg;
  errorEl.textContent = msg ?? '';
}

let currentThemeId = '';
const markTheme = buildThemePickers(selectTheme);

function selectTheme(id: string): void {
  if (id === currentThemeId) return;
  const def = THEMES.find((t) => t.id === id) ?? THEMES[0];
  try {
    engine.setTheme(def.create());
    currentThemeId = def.id;
    saveThemeId(def.id);
    markTheme(def.id);
  } catch (err) {
    console.error(err);
    showError(`${def.name} could not start: ${(err as Error).message}`);
    const fallback = THEMES.find((t) => t.id !== def.id);
    if (fallback && currentThemeId !== fallback.id) selectTheme(fallback.id);
  }
}

async function startListening(kind: InputKind): Promise<void> {
  showError(null);
  systemBtn.disabled = micBtn.disabled = true;
  try {
    const live = await LiveAudioInput.create(kind);
    input = live;
    live.onEnded = () => void stopListening();
    engine.setSource(live);
    startPanel.hidden = true;
    hud.hidden = false;
    wakeHud();
    try {
      wakeLock = await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } })
        .wakeLock?.request('screen') ?? null;
    } catch {
      wakeLock = null;
    }
  } catch (err) {
    console.error(err);
    showError(describeInputError(err, kind));
  } finally {
    systemBtn.disabled = micBtn.disabled = false;
  }
}

async function stopListening(): Promise<void> {
  const live = input;
  input = null;
  engine.setSource(idle);
  hud.hidden = true;
  stats.setVisible(false);
  statsBtn.setAttribute('aria-pressed', 'false');
  startPanel.hidden = false;
  await wakeLock?.release().catch(() => undefined);
  wakeLock = null;
  await live?.stop();
}

function toggleStats(): void {
  stats.setVisible(!stats.visible);
  statsBtn.setAttribute('aria-pressed', String(stats.visible));
}

// Sources available on this device.
if (!systemCaptureSupported()) {
  systemBtn.hidden = true;
  $('system-hint').hidden = true;
}
if (!microphoneSupported()) {
  micBtn.hidden = true;
  if (systemBtn.hidden) showError('This browser cannot capture audio. Try a recent Chrome, Edge, Firefox or Safari over HTTPS.');
}
if (!fullscreenSupported()) fullscreenBtn.hidden = true;

systemBtn.addEventListener('click', () => void startListening('system'));
micBtn.addEventListener('click', () => void startListening('microphone'));
$('stop').addEventListener('click', () => void stopListening());
statsBtn.addEventListener('click', toggleStats);
fullscreenBtn.addEventListener('click', () => void toggleFullscreen());

window.addEventListener('keydown', (e) => {
  if (!input || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'f' || e.key === 'F') void toggleFullscreen();
  else if (e.key === 's' || e.key === 'S') toggleStats();
  else if (e.key === 'Escape' && !document.fullscreenElement) void stopListening();
  else {
    const n = Number(e.key);
    if (n >= 1 && n <= THEMES.length) selectTheme(THEMES[n - 1].id);
  }
});

const wakeHud = autoHide(hud);

selectTheme(loadThemeId());
engine.setSource(idle);
engine.start();
