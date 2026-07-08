import { app, BrowserWindow, ipcMain, nativeImage, nativeTheme, shell } from 'electron';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { courier } from './courier';
import { createTray } from './tray';



// Locate the Bee CLI (`@beeai/cli`, bin/bee.js) that ships INSIDE the app, so
// Nicole never installs Node, npm, or the CLI — she just runs the app. We run it
// with Electron's own Node runtime (ELECTRON_RUN_AS_NODE). Checks the packaged
// locations first (asar-unpacked / extraResources), then the dev node_modules;
// falls back to `bee` on PATH only if the bundle is somehow missing.
function resolveBeeCli(): { command: string; argsPrefix: string[]; env: Record<string, string> } {
  const candidates = [
    process.env.BEE_CLI_PATH,
    join(process.resourcesPath ?? '', 'app.asar.unpacked', 'node_modules', '@beeai', 'cli', 'bin', 'bee.js'),
    join(process.resourcesPath ?? '', 'bee-cli', 'bin', 'bee.js'),
    join(app.getAppPath(), 'node_modules', '@beeai', 'cli', 'bin', 'bee.js'),
  ].filter((p): p is string => !!p);

  const cliPath = candidates.find((p) => existsSync(p));
  if (cliPath) {
    // Run the bundled CLI as plain Node via the Electron binary itself.
    return { command: process.execPath, argsPrefix: [cliPath], env: { ELECTRON_RUN_AS_NODE: '1' } };
  }
  return { command: 'bee', argsPrefix: [], env: {} }; // last-resort: a system `bee`
}

// The backend the dashboard talks to and the courier forwards Bee conversations
// to. Resolved from (in order): env var, an innerlume.config.json baked into the
// build (or dropped in userData post-install), then the localhost default — so a
// hosted URL can be baked into Nicole's build without touching code, and a dev
// can still override via env. Loaded once the app is ready (loadConfig).
let backendUrl = 'http://localhost:3000';
let webhookSecret: string | undefined;

function loadConfig(): void {
  const candidates = [
    join(app.getPath('userData'), 'innerlume.config.json'), // editable after install
    join(process.resourcesPath ?? '', 'innerlume.config.json'), // packaged default
    join(app.getAppPath(), 'innerlume.config.json'), // dev (project root)
  ];
  let file: { backendUrl?: string; beeWebhookSecret?: string } = {};
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        file = JSON.parse(readFileSync(p, 'utf8'));
        break;
      }
    } catch {
      /* ignore a malformed config file; fall through to the next candidate */
    }
  }
  backendUrl = process.env.INNERLUME_BACKEND_URL ?? file.backendUrl ?? 'http://localhost:3000';
  webhookSecret = process.env.BEE_WEBHOOK_SECRET ?? file.beeWebhookSecret;
}

// Brand assets live in desktop/build. Resolve from __dirname (out/main → ../../build)
// which is stable in dev; fall back to app.getAppPath() for the packaged layout.
const assets = existsSync(join(__dirname, '../../build', 'icon.png'))
  ? join(__dirname, '../../build')
  : join(app.getAppPath(), 'build');
// The full logo (with wordmark) is only legible large — perfect for the macOS
// dock. The window/taskbar icon on Linux/Windows renders small (~24–48px), where
// the wordmark blurs, so use the REAL mortar-&-pestle emblem tile (cropped from
// the logo, not a redrawn vector). See make-icons.mjs.
const logoPath = join(assets, 'icon.png'); // full logo (dock)
const windowIconPath = process.platform === 'darwin' ? logoPath : join(assets, 'emblem.png');

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let splashShownAt = 0;
// Keep the splash up at least this long so its entrance animation isn't cut off
// on a fast boot — but never block a slow one longer than it needs.
const SPLASH_MIN_MS = 1500;

/** Frameless, transparent branded splash shown while the dashboard boots.
 *  Loaded from the renderer's public assets (splash.html + logo-mark.png) so it
 *  works identically in dev (dev server) and packaged (file://). Closed the
 *  moment the main window is ready to show. */
function createSplash(): void {
  const splash = new BrowserWindow({
    width: 440,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    show: false,
    // Match the logo's own rust so it never flashes a white box if the WM
    // can't composite transparency.
    backgroundColor: '#7f3110',
    skipTaskbar: true,
    webPreferences: { sandbox: true },
  });
  splashWindow = splash;
  splash.once('ready-to-show', () => {
    if (splash.isDestroyed()) return;
    splashShownAt = Date.now();
    splash.show();
  });
  splash.on('closed', () => {
    if (splashWindow === splash) splashWindow = null;
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void splash.loadURL(`${process.env.ELECTRON_RENDERER_URL}/splash.html`);
  } else {
    void splash.loadFile(join(__dirname, '../renderer/splash.html'));
  }
}

/** Dismiss the splash (if still up) once the dashboard has painted. */
function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

/** Focus the dashboard if open, otherwise (re)create it. Used by the tray. */
function ensureWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    show: false,
    icon: nativeImage.createFromPath(windowIconPath),
    // Warm off-white / espresso so the first paint matches the brand, not a flash.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a120e' : '#faf7f4',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow = win;
  // Linux (X11): the constructor `icon` sets _NET_WM_ICON, but some WMs (incl.
  // Cinnamon's window-list) only pick it up from an explicit setIcon after the
  // window exists. Belt-and-suspenders — no-op on mac/win where the packaged
  // icon governs.
  if (process.platform === 'linux') {
    const img = nativeImage.createFromPath(windowIconPath);
    if (!img.isEmpty()) win.setIcon(img);
  }
  win.once('ready-to-show', () => {
    // Hold the splash for its minimum, then cross over to the dashboard.
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashShownAt));
    setTimeout(() => {
      win.show();
      closeSplash();
    }, splashShownAt ? wait : 0);
  });

  // Forward live courier status to this window.
  const onStatus = (s: unknown) => win.webContents.send('bee:status', s);
  courier.on('status', onStatus);
  win.on('closed', () => {
    courier.off('status', onStatus);
    if (mainWindow === win) mainWindow = null;
  });

  // electron-vite injects the dev server URL; fall back to the built file.
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// --- IPC surface (kept tiny; renderer talks only through preload) ------------
ipcMain.handle('app:info', () => ({ backendUrl, version: app.getVersion() }));
ipcMain.handle('bee:status', () => courier.status());
ipcMain.handle('bee:connect', () => courier.connect());
ipcMain.on('app:open-external', (_e, url: string) => {
  if (typeof url !== 'string') return;
  // Allowlist by parsed ORIGIN (not string prefix, which `...@evil.com` and
  // `localhost:3000.evil.com` slip past): the Bee approval origin, the Microsoft
  // sign-in origin (the Outlook "Connect" flow opens Microsoft's consent screen),
  // and the configured backend. Nothing else opens.
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return;
  const isBee = u.protocol === 'https:' && u.hostname === 'bee.computer';
  const isMsLogin = u.protocol === 'https:' && u.hostname === 'login.microsoftonline.com';
  let isBackend = false;
  try {
    const b = new URL(backendUrl);
    isBackend = u.protocol === b.protocol && u.hostname === b.hostname && u.port === b.port;
  } catch {
    /* malformed backendUrl → only Bee / Microsoft are allowed */
  }
  if (isBee || isMsLogin || isBackend) void shell.openExternal(u.toString());
});

app.setName('Innerlume'); // WM/window title + helps Linux associate the icon

app.whenReady().then(() => {
  loadConfig(); // resolve backendUrl + webhookSecret (env → config file → default)
  if (process.platform === 'darwin') app.dock?.setIcon(nativeImage.createFromPath(logoPath));
  const bee = resolveBeeCli();
  courier.init({
    backendUrl,
    webhookSecret,
    dataDir: app.getPath('userData'),
    beeCommand: bee.command,
    beeArgsPrefix: bee.argsPrefix,
    beeEnv: bee.env,
  });
  createTray(ensureWindow); // courier lives in the tray; syncs with window closed
  createSplash(); // branded splash while the dashboard boots
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => courier.stop());

app.on('window-all-closed', () => {
  // On macOS apps usually stay alive; the courier can keep syncing in the tray.
  if (process.platform !== 'darwin') app.quit();
});
