/**
 * The bearer token, kept in localStorage so a page reload does not sign the
 * storekeeper out mid-shift. Storage can be unavailable (private windows,
 * blocked site data), so every access is guarded and the app still works for
 * the life of the tab.
 */

const KEY = 'cdc-issue-tool.token';
let memory: string | null = null;

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function setToken(token: string | null): void {
  memory = token;
  try {
    if (token) window.localStorage.setItem(KEY, token);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Memory copy above is enough for this tab.
  }
}
