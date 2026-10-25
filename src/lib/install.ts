import { useSyncExternalStore } from 'react';

// Install-prompt store. Captures `beforeinstallprompt` the moment this module
// loads (it is the first import in main.jsx) so a permanent button can offer
// installation at any time instead of a one-off banner. iOS Safari never fires
// the event, so the button shows manual steps there. Hidden once installed.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'hidden' | 'prompt' | 'ios' | 'manual';

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  // iPadOS 13+ reports itself as a Mac; touch points tell it apart.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function getInstallMode(): InstallMode {
  if (installed || isStandalone()) return 'hidden';
  if (deferred) return 'prompt';
  if (isIOS()) return 'ios';
  return 'manual';
}

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getInstallMode,
    () => 'hidden',
  );
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const evt = deferred;
  await evt.prompt();
  const { outcome } = await evt.userChoice;
  // The event can only be used once; a dismissed prompt falls back to manual steps.
  deferred = null;
  emit();
  return outcome === 'accepted';
}
