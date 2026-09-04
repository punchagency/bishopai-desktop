// Bridges the two shells this renderer ships in: the Electron desktop app
// (window.innerlume, from preload/index.ts) and a plain static-hosted website
// (no bridge at all — this module IS the bridge there). Every call site goes
// through here instead of touching `window.innerlume` directly, so neither
// shell has to know the other exists.

// What a website build talks to when there's no Electron config to read.
// VITE_BACKEND_URL is baked in at `npm run build:web` time (see .env.web);
// the Render URL matches innerlume.config.json's own default so an
// unconfigured build still points somewhere real instead of localhost.
const WEB_DEFAULT_BACKEND =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  'https://bishopai-server.onrender.com';

/**
 * Which backend this dashboard talks to.
 *
 * Desktop: main resolves it (env var → innerlume.config.json → localhost)
 * and hands it over via IPC (`window.innerlume.getAppInfo`). Website: there
 * is no main process, so `window.innerlume` is undefined and this falls
 * back to the build-time default above.
 */
export async function getBackendUrl(): Promise<string> {
  try {
    const info = await window.innerlume?.getAppInfo();
    if (info?.backendUrl) return info.backendUrl;
  } catch {
    /* no bridge, or it failed — fall through to the web default */
  }
  return WEB_DEFAULT_BACKEND;
}

/**
 * Open a URL outside the app — Microsoft's consent screen, mainly.
 *
 * Desktop routes this through main's allowlisted `shell.openExternal` (see
 * preload/index.ts) so a renderer bug can't be tricked into opening an
 * arbitrary URL on the user's machine. A browser tab has no such privilege
 * to protect — it IS the outside world already — so a plain `window.open`
 * does the same job.
 */
export function openExternal(url: string): void {
  if (window.innerlume) window.innerlume.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}
