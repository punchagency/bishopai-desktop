import { app, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

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
  const file = process.platform === 'linux' ? 'tray-linux.png' : 'tray.png';
  const img = nativeImage.createFromPath(join(dir, file));
  return img;
}

export function createTray(ensureWindow: () => void): void {
  try {
    const img = trayImage();
    console.log('[tray] image empty?', img.isEmpty(), 'size:', JSON.stringify(img.getSize()));
    tray = new Tray(img);
    console.log('[tray] created ok');
  } catch (err) {
    console.error('[tray] failed to create:', err);
    return;
  }

  // No recorder status here any more: Pocket delivers to the backend, so the
  // tray has nothing local to report and is purely a way back to the window.
  tray.setToolTip('Innerlume');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Innerlume', click: ensureWindow },
      { type: 'separator' },
      { label: 'Quit Innerlume', click: () => app.quit() },
    ]),
  );
  tray.on('click', ensureWindow); // Windows/Linux: click opens the dashboard
}
