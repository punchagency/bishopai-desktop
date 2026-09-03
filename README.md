# bishopai-desktop

The Innerlume dashboard, in two shells over the same `src/renderer` code:

- **Desktop** — an Electron app (main + preload + renderer).
- **Website** — the renderer alone, built as a static site.

Everything renders and fetches the same way in both; the only difference is
how the app finds out which backend to talk to and how it opens external
links (Microsoft's consent screen). Both paths live in
`src/renderer/src/lib/platform.ts`: it uses `window.innerlume` (the Electron
bridge from `src/preload/index.ts`) when present, and falls back to a
build-time default otherwise.

## Desktop (Electron)

```sh
npm run dev        # electron-vite dev, with hot reload
npm run build       # electron-vite build → out/
npm run package      # electron-builder → release/ (dmg/nsis/deb/AppImage)
```

Backend is resolved by `src/main/index.ts`: an env var (`INNERLUME_BACKEND_URL`),
then `innerlume.config.json` (bundled default, or dropped into the app's
`userData` dir post-install to repoint an existing build), then
`http://localhost:3000`.

## Website

```sh
npm run dev:web      # vite dev server
npm run build:web    # → dist-web/, a static site — drop it on any host
npm run preview:web  # serve the build locally to sanity-check it
```

Backend is resolved at build time via `VITE_BACKEND_URL` (copy
`.env.web.example` to `.env.web` and set it, or export it in your shell before
`build:web`/`dev:web`). Unset, it falls back to the hosted Railway backend —
see `WEB_DEFAULT_BACKEND` in `lib/platform.ts`.

`dist-web/` is a plain static bundle (relative asset paths — `base: './'` in
`vite.web.config.ts` — so it works from any subpath, not just a domain root).
Deploy it anywhere that serves static files (Netlify, Vercel, S3 + CloudFront,
or the backend's own Express server via `express.static`). The backend already
answers CORS with `Access-Control-Allow-Origin: *` (see `bishopai-server/src/app.ts`)
and uses bearer-token auth rather than cookies, so it accepts requests from
whatever origin the site ends up on with no extra config.

Nothing native is available to the website build — no splash screen, no tray
icon, no custom title bar, and "Connect Outlook" opens the consent screen in a
new tab (`window.open`) instead of routing through Electron's allowlisted
`shell.openExternal`. Everything else — every view, every API call — is
identical to the desktop build.
