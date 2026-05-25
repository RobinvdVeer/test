const STORAGE_KEY = 'todo-auth';
const PKCE_VERIFIER_KEY = 'todo-pkce-verifier';
const PKCE_STATE_KEY = 'todo-pkce-state';
const RETURN_TO_KEY = 'todo-return-to';

export async function loadAuthConfig() {
  const response = await fetch('/auth-config.json', { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Unable to load auth config (${response.status})`);
  }
  return response.json();
}

export function getStoredAuth() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setStoredAuth(auth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function clearStoredAuth() {
  localStorage.removeItem(STORAGE_KEY);
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

export async function generatePkcePair() {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64UrlEncode(new Uint8Array(digest));
  return { verifier, challenge };
}

export function createState() {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

export async function startLogin(returnTo = '/') {
  const config = await loadAuthConfig();
  const { verifier, challenge } = await generatePkcePair();
  const state = createState();

  setPkceVerifier(verifier);
  setPkceState(state);
  setReturnTo(returnTo);

  const url = new URL(config.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scope || 'openid profile email');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);

  window.location.assign(url.toString());
}

export async function completeLoginFromCallback() {
  const config = await loadAuthConfig();
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const returnedState = params.get('state');
  const storedState = getPkceState();
  const verifier = getPkceVerifier();

  if (!code) throw new Error('Missing authorization code');
  if (!returnedState || returnedState !== storedState) throw new Error('Invalid state');
  if (!verifier) throw new Error('Missing PKCE verifier');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed (${response.status})`);
  }

  const token = await response.json();
  const expiresIn = Number(token.expires_in || 0);
  setStoredAuth({
    ...token,
    expires_at: Date.now() + expiresIn * 1000,
  });

  const returnTo = getReturnTo('/');
  clearPkceVerifier();
  clearPkceState();
  clearReturnTo();

  return returnTo;
}

export function logout() {
  const auth = getStoredAuth();
  clearStoredAuth();
  clearReturnTo();
  clearPkceVerifier();
  clearPkceState();
  return auth;
}

export function sanitizeReturnTo(returnTo) {
  try {
    const url = new URL(returnTo, window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    return `${url.pathname}${url.search}${url.hash}` || '/';
  } catch (_) {
    return '/';
  }
}

function base64UrlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
