import { describe, it, expect, beforeEach, vi } from 'vitest';

// The store captures events at import time, so every test re-imports a fresh copy.
async function freshInstall() {
  vi.resetModules();
  return import('./install');
}

function fakePromptEvent(outcome: 'accepted' | 'dismissed') {
  const evt = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  evt.prompt = vi.fn(async () => {});
  evt.userChoice = Promise.resolve({ outcome });
  return evt;
}

function setUserAgent(ua: string, platform = 'Win32', maxTouchPoints = 0) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

describe('install store', () => {
  beforeEach(() => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/130');
    Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true });
  });

  it('is manual when no prompt event has fired on a non-iOS browser', async () => {
    const { getInstallMode } = await freshInstall();
    expect(getInstallMode()).toBe('manual');
  });

  it('switches to prompt when beforeinstallprompt fires, and consumes it once', async () => {
    const { getInstallMode, promptInstall } = await freshInstall();
    const evt = fakePromptEvent('accepted');
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(getInstallMode()).toBe('prompt');

    await expect(promptInstall()).resolves.toBe(true);
    expect(evt.prompt).toHaveBeenCalledTimes(1);
    expect(getInstallMode()).toBe('manual');
    await expect(promptInstall()).resolves.toBe(false);
  });

  it('hides after appinstalled', async () => {
    const { getInstallMode } = await freshInstall();
    window.dispatchEvent(new Event('appinstalled'));
    expect(getInstallMode()).toBe('hidden');
  });

  it('detects iPhone and iPadOS-as-Mac', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari');
    let mod = await freshInstall();
    expect(mod.getInstallMode()).toBe('ios');

    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari', 'MacIntel', 5);
    mod = await freshInstall();
    expect(mod.isIOS()).toBe(true);
  });

  it('hides when running as an installed iOS web app', async () => {
    setUserAgent('Mozilla/5.0 (iPhone) Safari');
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    const { getInstallMode } = await freshInstall();
    expect(getInstallMode()).toBe('hidden');
  });
});
