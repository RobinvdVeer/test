import { loadAuthConfig } from './auth-config.js';
import { createState, generatePkcePair } from './pkce.js';
import {
  clearPkceState,
  clearPkceVerifier,
  clearReturnTo,
  clearStoredAuth,
  getPkceState,
  getPkceVerifier,
  getReturnTo,
  getStoredAuth,
  isTokenValid,
  setPkceState,
  setPkceVerifier,
  setReturnTo as storeReturnTo,
  setStoredAuth,
} from './storage.js';
import { completeLoginFromCallback } from './token-exchange.js';

export {
  loadAuthConfig,
  generatePkcePair,
  createState,
  completeLoginFromCallback,
  getStoredAuth,
  setStoredAuth,
  clearStoredAuth,
  getReturnTo,
  clearReturnTo,
  getPkceVerifier,
  setPkceVerifier,
  clearPkceVerifier,
  getPkceState,
  setPkceState,
  clearPkceState,
  isTokenValid,
};

export function setReturnTo(returnTo) {
  storeReturnTo(sanitizeReturnTo(returnTo));
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
