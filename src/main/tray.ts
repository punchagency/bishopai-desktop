import { app, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { courier, type CourierStatus } from './courier';

let tray: Tray | null = null;

// desktop/build — resolve from __dirname (out/main → ../../build), stable in dev;
// fall back to app.getAppPath() for the packaged layout.
function assetsDir(): string {
  const rel = join(__dirname, '../../build');
  return existsSync(join(rel, 'tray.png')) ? rel : join(app.getAppPath(), 'build');
}

// A simplified bold mark (not the detailed logo) — see scripts/make-icons.mjs.
// Source + sizing are platform-specific for crispness:
//   • macOS  → monochrome template image (menu bar renders + recolors it).
//   • Linux  → one large PNG; GTK/AppIndicator (Cinnamon) downscales to the panel.
//   • Windows→ 16px base with @1.25x/@1.5x/@2x HiDPI variants alongside it.
function trayImage() {
  const dir = assetsDir();
  if (process.platform === 'darwin') {
    const img = nativeImage.createFromPath(join(dir, 'trayTemplate.png'));
    img.setTemplateImage(true);
    return img;
  }
  // Linux (Cinnamon/GTK) renders the tray at ~22px+ and downscales a large PNG,
  // so it can carry the REAL emblem. Windows draws it at 16px where the emblem
  // mushes — keep the bold vector mark there.
  const file = process.platform === 'linux' ? 'emblem.png' : 'tray.png';
  return nativeImage.createFromPath(join(dir, file));
}

export function createTray(ensureWindow: () => void): void {
  tray = new Tray(trayImage());

  const rebuild = (s: CourierStatus) => {
    tray?.setToolTip(`Innerlume — ${s.message}`);
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Innerlume', click: ensureWindow },
        { type: 'separator' },
        { label: statusLabel(s), enabled: false },
        { label: 'Connect Bee…', enabled: s.state !== 'connected', click: () => void courier.connect() },
        { type: 'separator' },
        { label: 'Quit Innerlume', click: () => app.quit() },
      ]),
    );
  };

  rebuild(courier.status());
  courier.on('status', rebuild);
  tray.on('click', ensureWindow); // Windows/Linux: click opens the dashboard
}

function statusLabel(s: CourierStatus): string {
  const dot = { connected: '🟢', connecting: '🟡', error: '🔴', disconnected: '⚪' }[s.state];
  return `${dot} ${s.message}`;
}
