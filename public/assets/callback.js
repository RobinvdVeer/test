import { completeLoginFromCallback } from './auth.js';

const status = document.getElementById('status');

(async () => {
  try {
    const returnTo = await completeLoginFromCallback();
    window.location.replace(returnTo);
  } catch (err) {
    status.textContent = err.message || 'Authentication failed';
    window.location.replace(`/login?returnTo=${encodeURIComponent('/')}`);
  }
})();
