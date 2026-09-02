#!/usr/bin/env node
/**
 * Give the running app a panel/taskbar icon on Linux — including `npm run dev`.
 *
 * WHY THIS IS NEEDED AT ALL
 *
 * Electron cannot set the window icon on X11 here. Both the BrowserWindow
 * `icon:` option and a later `win.setIcon()` leave `_NET_WM_ICON` empty —
 * verified with `xprop -id <win> _NET_WM_ICON`, before and after the call, with
 * a valid non-empty 256x256 nativeImage. So there is nothing on the window for
 * the panel to draw.
 *
 * What Cinnamon (and GNOME/KDE) actually do is match the window to an installed
 * .desktop entry via WM_CLASS, then resolve that entry's `Icon=` name through
 * the icon theme. The packaged .deb ships such an entry, which is why installing
 * it fixes the icon. A dev run installs nothing, so there is nothing to match —
 * hence no icon, no matter what the app does at runtime.
 *
 * This installs the same entry into the per-user directories, no root needed.
 * The dev window and the packaged window share one WM_CLASS ("innerlume",
 * "Innerlume"), so one entry covers both.
 *
 *   node scripts/install-desktop-entry.mjs
 *   node scripts/install-desktop-entry.mjs --uninstall
 *
 * Deliberately uses the SAME basename as the .deb's entry
 * (innerlume-desktop.desktop). If the .deb is installed later, the per-user
 * copy shadows the system one instead of adding a duplicate menu entry.
 */
import { mkdir, copyFile, writeFile, rm, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const REPO = resolve(import.meta.dirname, '..');
const NAME = 'innerlume-desktop';
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const APPS = join(homedir(), '.local/share/applications');
const ICONS = join(homedir(), '.local/share/icons/hicolor');
const entryPath = join(APPS, `${NAME}.desktop`);

const exists = (p) => access(p).then(() => true, () => false);

async function refresh() {
  // Best-effort: the panel usually notices without these, and neither tool is
  // guaranteed to be installed.
  for (const [cmd, args] of [
    ['update-desktop-database', [APPS]],
    ['gtk-update-icon-cache', ['-f', '-t', ICONS]],
  ]) {
    await run(cmd, args).catch(() => {});
  }
}

if (process.argv.includes('--uninstall')) {
  await rm(entryPath, { force: true });
  for (const n of SIZES) {
    await rm(join(ICONS, `${n}x${n}/apps/${NAME}.png`), { force: true });
  }
  await refresh();
  console.log('removed', entryPath, 'and its icons');
  process.exit(0);
}

// The icon set is built by scripts/make-icons.mjs. Without it a themed
// `Icon=` name resolves to nothing, which looks exactly like the bug this
// script exists to fix — so say so rather than installing a broken entry.
if (!(await exists(join(REPO, 'build/icons/256x256.png')))) {
  console.error('build/icons/ is missing — run `npm run icons` first.');
  process.exit(1);
}

for (const n of SIZES) {
  const dir = join(ICONS, `${n}x${n}/apps`);
  await mkdir(dir, { recursive: true });
  await copyFile(join(REPO, `build/icons/${n}x${n}.png`), join(dir, `${NAME}.png`));
}

// Launches the real app if it has been packaged; otherwise the dev server.
// Either way the icon mapping is what matters — that comes from StartupWMClass.
const packaged = join(REPO, 'release/linux-unpacked/innerlume-desktop');
const exec = (await exists(packaged))
  ? `${packaged} %U`
  : `sh -c 'cd ${REPO} && npm run dev'`;

await mkdir(APPS, { recursive: true });
await writeFile(
  entryPath,
  `[Desktop Entry]
Name=Innerlume
Comment=Innerlume practice dashboard
Exec=${exec}
Icon=${NAME}
Terminal=false
Type=Application
Categories=Office;
StartupWMClass=Innerlume
`,
);
await refresh();
console.log(`installed ${entryPath}\nicons -> ${ICONS}/<size>/apps/${NAME}.png\nExec=${exec}`);
