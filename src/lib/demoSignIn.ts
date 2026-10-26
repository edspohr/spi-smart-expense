import { signInWithCustomToken, type Auth } from 'firebase/auth';
import { auth } from './firebase';
import { callFunction } from './functions';
import { track } from './analytics';

/** Where Login sends the user after a demo sign-in (read once, then cleared). */
export const POST_LOGIN_KEY = 'postLoginPath';
/** Marks the browser session as a one-click demo (value: the role). */
const DEMO_SESSION_KEY = 'demoSession';

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode / blocked storage
  }
}

/** One-click demo: the server returns a custom token for the role's fixed account. */
export async function startDemo(role: string, path: string): Promise<void> {
  const { token } = await callFunction<{ role: string }, { token: string }>('demoSignIn', { role });
  try {
    sessionStorage.setItem(POST_LOGIN_KEY, path);
  } catch {
    /* private mode: Login falls back to /dashboard */
  }
  store()?.setItem(DEMO_SESSION_KEY, role);
  track('demo_start', { role });
  await signInWithCustomToken(auth as Auth, token);
}

export function takePostLoginPath(): string | null {
  try {
    const p = sessionStorage.getItem(POST_LOGIN_KEY);
    sessionStorage.removeItem(POST_LOGIN_KEY);
    return p && p.startsWith('/') ? p : null;
  } catch {
    return null;
  }
}

/** The role of the active one-click demo session, or null for real users. */
export function getDemoRole(): string | null {
  return store()?.getItem(DEMO_SESSION_KEY) ?? null;
}

export function endDemoSession(): void {
  store()?.removeItem(DEMO_SESSION_KEY);
}
