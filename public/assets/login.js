import { startLogin, getStoredAuth, isTokenValid } from './auth.js';

const button = document.getElementById('login');
const error = document.getElementById('error');

if (isTokenValid(getStoredAuth())) {
  window.location.replace('/');
}

button.addEventListener('click', async () => {
  try {
    const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '/';
    await startLogin(returnTo);
  } catch (err) {
    error.textContent = err.message || 'Login failed';
  }
});
