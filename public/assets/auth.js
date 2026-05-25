import { loadAuthConfig } from './auth-config.js';
import { generatePkcePair, createState } from './pkce.js';
import {
  clearPkceState,
  clearPkceVerifier,
  clearReturnTo,
  clearStoredAuth,
  getStoredAuth,
  isTokenValid,
  setPkceState,
  setPkceVerifier,
  setReturnTo,
} from './storage.js';
import { completeLoginFromCallback } from './token-exchange.js';

export { completeLoginFromCallback, getStoredAuth, isTokenValid, clearStoredAuth };

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
