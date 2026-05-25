import { loadAuthConfig } from './auth-config.js';
import {
  clearPkceState,
  clearPkceVerifier,
  clearReturnTo,
  getPkceState,
  getPkceVerifier,
  getReturnTo,
  setStoredAuth,
} from './storage.js';

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
