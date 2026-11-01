import type { Analytics } from 'firebase/analytics';
import type { FirebaseApp } from 'firebase/app';
import { app, useEmulators } from './firebase';
import { tenant } from './tenant';

// Google Analytics (GA4 via Firebase) for the public login landing only:
// tenants without `landing`, the emulators and builds without a
// VITE_FIREBASE_MEASUREMENT_ID send nothing. The SDK loads lazily, so the
// app bundle for signed-in users is untouched.
let analytics: Promise<Analytics | null> | null = null;

function load(): Promise<Analytics | null> {
  if (analytics) return analytics;
  const enabled = !!tenant.landing && !useEmulators && !!import.meta.env.VITE_FIREBASE_MEASUREMENT_ID && !!app;
  analytics = !enabled
    ? Promise.resolve(null)
    : import('firebase/analytics')
        .then(async ({ getAnalytics, isSupported }) => ((await isSupported()) ? getAnalytics(app as FirebaseApp) : null))
        .catch(() => null);
  return analytics;
}

type Gtag = (...args: unknown[]) => void;
let secondaryReady = false;

// Firebase Analytics only talks to its own stream, so the main site's property
// gets the same events through the gtag.js that the SDK already loaded.
function sendToSecondary(event: string, params: Record<string, unknown>) {
  const id = tenant.landing?.secondaryMeasurementId;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (!id || !gtag) return;
  if (!secondaryReady) {
    gtag('config', id, { send_page_view: false });
    secondaryReady = true;
  }
  gtag('event', event, { ...params, send_to: id });
}

export type LandingEvent =
  | 'landing_view'
  | 'demo_start'
  | 'cta_click';

/** Fire-and-forget; never throws. */
export function track(event: LandingEvent, params: Record<string, string | number | boolean | undefined> = {}): void {
  void load().then(async (a) => {
    if (!a) return;
    const { logEvent } = await import('firebase/analytics');
    logEvent(a, event, { tenant: tenant.id, ...params });
    sendToSecondary(event, { tenant: tenant.id, ...params });
  });
}
