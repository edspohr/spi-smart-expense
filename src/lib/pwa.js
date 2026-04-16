// PWA install helpers. No service worker in this phase — just a thin wrapper
// around the `beforeinstallprompt` event (stashed by the early listener in
// main.jsx on `window.__deferredPwaPrompt`) plus iOS/standalone/dismissed
// detection used by InstallPwaPrompt.

const DISMISS_KEY = 'spi_pwa_dismissed_at';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari uses a non-standard navigator.standalone
  return window.navigator.standalone === true;
}

export function isTouchDevice() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export function wasRecentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!ts) return false;
    return Date.now() - ts < DISMISS_MS;
  } catch {
    return false;
  }
}

export function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Private-mode storage failure is non-fatal
  }
}

export function canInstall() {
  return typeof window !== 'undefined' && !!window.__deferredPwaPrompt;
}

export async function triggerInstall() {
  const evt = typeof window !== 'undefined' ? window.__deferredPwaPrompt : null;
  if (!evt) return { ok: false, outcome: 'unsupported' };
  try {
    await evt.prompt();
    const choice = await evt.userChoice;
    // The deferred event can only be used once.
    window.__deferredPwaPrompt = null;
    return { ok: true, outcome: choice.outcome };
  } catch (e) {
    window.__deferredPwaPrompt = null;
    return { ok: false, outcome: 'error', error: e };
  }
}

export function shouldShowAndroidPrompt() {
  return isTouchDevice() && !isStandalone() && !wasRecentlyDismissed() && canInstall();
}

export function shouldShowIOSPrompt() {
  return isIOS() && isTouchDevice() && !isStandalone() && !wasRecentlyDismissed();
}
