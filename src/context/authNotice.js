// sessionStorage key carrying a one-shot message to the login screen
// (e.g. the account was deactivated while the session was open).
export const AUTH_NOTICE_KEY = "spi_auth_notice";

export const AUTH_NOTICES = {
  deactivated: "Tu cuenta fue desactivada. Si crees que es un error, contacta a la administración.",
};

export function consumeAuthNotice() {
  try {
    const key = sessionStorage.getItem(AUTH_NOTICE_KEY);
    if (!key) return null;
    sessionStorage.removeItem(AUTH_NOTICE_KEY);
    return AUTH_NOTICES[key] ?? null;
  } catch {
    return null;
  }
}
