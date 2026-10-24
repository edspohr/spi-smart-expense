export const REQUIRED_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_GEMINI_API_KEY',
] as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

const PLACEHOLDER = /^your_/i;

export interface EnvValidation {
  ok: boolean;
  missing: RequiredEnvVar[];
}

export function validateEnv(env: Record<string, unknown> = import.meta.env): EnvValidation {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = env[key];
    return typeof value !== 'string' || value.trim() === '' || PLACEHOLDER.test(value);
  });
  return { ok: missing.length === 0, missing };
}
