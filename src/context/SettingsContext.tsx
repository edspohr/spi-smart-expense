import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './useAuth';
import { DEFAULT_SETTINGS, mergeSettings, type TenantSettings } from '../lib/tenantSettings';

const SettingsContext = createContext<TenantSettings>(DEFAULT_SETTINGS);

// Live subscription to settings/tenant while someone is signed in, so a
// superadmin's change (modules, PIN toggle) reaches every open session
// without a redeploy or reload.
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth() as unknown as { currentUser: unknown };
  const [settings, setSettings] = useState<TenantSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!currentUser || !db) return undefined;
    return onSnapshot(
      doc(db as Firestore, 'settings', 'tenant'),
      (snap) => setSettings(mergeSettings(snap.exists() ? snap.data() : null)),
      () => setSettings(DEFAULT_SETTINGS),
    );
  }, [currentUser]);

  return <SettingsContext.Provider value={currentUser ? settings : DEFAULT_SETTINGS}>{children}</SettingsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTenantSettings(): TenantSettings {
  return useContext(SettingsContext);
}
