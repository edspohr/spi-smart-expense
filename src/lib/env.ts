export const REQUIRED_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

const PLACEHOLDER = /^your_/i;

export interface EnvValidation {
  ok: boolean;
  missing: RequiredEnvVar[];
}

// Each variable is read with an explicit property access. Referencing
// `import.meta.env` as a whole makes Vite inline EVERY VITE_* variable from
// .env into the bundle, including ones the client must never ship.
function readRequiredEnv(): Record<RequiredEnvVar, unknown> {
  return {
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

export function validateEnv(env: Record<string, unknown> = readRequiredEnv()): EnvValidation {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = env[key];
    return typeof value !== 'string' || value.trim() === '' || PLACEHOLDER.test(value);
  });
  return { ok: missing.length === 0, missing };
}
