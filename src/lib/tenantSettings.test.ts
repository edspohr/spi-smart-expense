import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from './tenantSettings';

describe('mergeSettings', () => {
  it('falls back to the build-time tenant defaults', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.security.pinEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.modules.reports).toBe(true);
  });

  it('applies Firestore overrides and ignores malformed values', () => {
    const merged = mergeSettings({
      security: { pinEnabled: true },
      modules: { reports: false, bulkUpload: 'yes' },
      ai: { dailyLimitUser: 20, dailyLimitTenant: 1.5 },
      updatedByName: 'Edmundo',
    });
    expect(merged.security.pinEnabled).toBe(true);
    expect(merged.modules.reports).toBe(false);
    expect(merged.modules.bulkUpload).toBe(true);
    expect(merged.ai).toEqual({ dailyLimitUser: 20, dailyLimitTenant: null, localFirst: false });
    expect(merged.updatedByName).toBe('Edmundo');
  });

  it('keeps the offline reader off unless the tenant turns it on', () => {
    expect(DEFAULT_SETTINGS.offline.localReader).toBe(false);
    expect(DEFAULT_SETTINGS.ai.localFirst).toBe(false);
    const merged = mergeSettings({ offline: { localReader: true }, ai: { localFirst: 'yes' } });
    expect(merged.offline.localReader).toBe(true);
    expect(merged.ai.localFirst).toBe(false);
  });
});
