const STORAGE_KEY = 'todo-auth';
const PKCE_VERIFIER_KEY = 'todo-pkce-verifier';
const PKCE_STATE_KEY = 'todo-pkce-state';
const RETURN_TO_KEY = 'todo-return-to';

export function getStoredAuth() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function sanitizeStoredAuth(auth) {
  if (!auth?.access_token || !auth?.expires_at) return null;
  return {
    access_token: auth.access_token,
    expires_at: auth.expires_at,
  };
}

export function setStoredAuth(auth) {
  const sanitized = sanitizeStoredAuth(auth);
  if (!sanitized) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
}

export function clearStoredAuth() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function getReturnTo(defaultValue = '/') {
  return sessionStorage.getItem(RETURN_TO_KEY) || defaultValue;
}

export function setReturnTo(returnTo) {
  sessionStorage.setItem(RETURN_TO_KEY, returnTo);
}

export function clearReturnTo() {
  sessionStorage.removeItem(RETURN_TO_KEY);
}

export function getPkceVerifier() {
  return sessionStorage.getItem(PKCE_VERIFIER_KEY);
}

export function setPkceVerifier(verifier) {
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
}

export function clearPkceVerifier() {
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
}

export function getPkceState() {
  return sessionStorage.getItem(PKCE_STATE_KEY);
}

export function setPkceState(state) {
  sessionStorage.setItem(PKCE_STATE_KEY, state);
}

export function clearPkceState() {
  sessionStorage.removeItem(PKCE_STATE_KEY);
}

export function isTokenValid(auth) {
  if (!auth?.access_token || !auth?.expires_at) return false;
  return Date.now() < auth.expires_at - 15_000;
}
