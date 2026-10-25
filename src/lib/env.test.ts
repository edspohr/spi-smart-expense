import { describe, it, expect } from 'vitest';
import { validateEnv, REQUIRED_ENV_VARS } from './env';

const complete = Object.fromEntries(REQUIRED_ENV_VARS.map((k) => [k, `value-${k}`]));

describe('validateEnv', () => {
  it('passes when every variable is set', () => {
    expect(validateEnv(complete)).toEqual({ ok: true, missing: [] });
  });

  it('reports every missing variable', () => {
    const result = validateEnv({});
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([...REQUIRED_ENV_VARS]);
  });

  it('treats .env.example placeholders and blanks as missing', () => {
    const result = validateEnv({
      ...complete,
      VITE_FIREBASE_PROJECT_ID: 'your_project_id',
      VITE_FIREBASE_APP_ID: '   ',
    });
    expect(result.missing).toEqual(['VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']);
  });
});
