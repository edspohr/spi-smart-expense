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
      VITE_GEMINI_API_KEY: 'your_gemini_api_key',
      VITE_FIREBASE_APP_ID: '   ',
    });
    expect(result.missing).toEqual(['VITE_FIREBASE_APP_ID', 'VITE_GEMINI_API_KEY']);
  });
});
