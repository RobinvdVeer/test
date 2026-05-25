export async function loadAuthConfig() {
  const response = await fetch('/auth-config.json', { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Unable to load auth config (${response.status})`);
  }
  return response.json();
}
