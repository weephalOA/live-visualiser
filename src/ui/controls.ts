import { THEMES } from '../themes';

const STORAGE_KEY = 'live-visualiser:theme';

export function loadThemeId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id && THEMES.some((t) => t.id === id)) return id;
  } catch {
    // Storage may be unavailable (private mode); fall through to the default.
  }
  return THEMES[0].id;
}

export function saveThemeId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Not essential.
  }
}

/** Fills every [data-theme-picker] with radio chips that stay in sync. */
export function buildThemePickers(onSelect: (id: string) => void): (id: string) => void {
  const pickers = Array.from(document.querySelectorAll<HTMLElement>('[data-theme-picker]'));
  const buttons: HTMLButtonElement[] = [];
  for (const picker of pickers) {
    for (const theme of THEMES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.role = 'radio';
      b.dataset.id = theme.id;
      b.textContent = theme.name;
      b.title = theme.description;
      b.addEventListener('click', () => onSelect(theme.id));
      picker.appendChild(b);
      buttons.push(b);
    }
  }
  return (id: string) => {
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.id === id));
  };
}

/** Hides the HUD and cursor after a few seconds without pointer or key activity. */
export function autoHide(el: HTMLElement, delayMs = 3000): () => void {
  let timer = 0;
  const wake = () => {
    el.classList.remove('idle');
    document.body.classList.remove('hud-idle');
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (el.matches(':hover') || el.contains(document.activeElement)) return wake();
      el.classList.add('idle');
      document.body.classList.add('hud-idle');
    }, delayMs);
  };
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, wake, { passive: true });
  }
  return wake;
}

export async function toggleFullscreen(): Promise<void> {
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      await (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    } else {
      await (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
    }
  } catch {
    // Fullscreen is not available everywhere (e.g. iPhone Safari); ignore.
  }
}

export function fullscreenSupported(): boolean {
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  return !!(root.requestFullscreen || root.webkitRequestFullscreen);
}
