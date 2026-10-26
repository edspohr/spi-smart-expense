import { useSyncExternalStore } from 'react';
import { isOnline, subscribeConnectivity } from './connectivity';

/** Network status for components: the browser's signal or a simulated outage. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeConnectivity, isOnline, () => true);
}
