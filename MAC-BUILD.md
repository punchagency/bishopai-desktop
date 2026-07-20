# Building and installing Innerlume on macOS

Nicole runs a Mac. Three things about that are not obvious.

## 1. The DMG can only be built on a Mac

`electron-builder`'s `dmg` target needs macOS tooling (`hdiutil`, `codesign`).
It cannot be produced from Linux or Windows, so packaging her installer needs
either a Mac or a macOS CI runner.

```bash
npm run package        # on macOS → release/Innerlume-<version>-universal.dmg
```

The target is `universal`, so one DMG covers both Apple Silicon and Intel.

## 2. Unsigned builds are blocked by Gatekeeper

This is the part that will stop her, not a bug in the app.

macOS attaches a `com.apple.quarantine` flag to anything arriving by **download,
AirDrop, or email**. A quarantined app without a Developer ID signature will not
open — on recent macOS the old right-click → Open workaround no longer clears
it, and she'd have to go to System Settings → Privacy & Security → "Open Anyway".

Two ways through:

**Proper (for the pilot and beyond)** — Apple Developer Program, $99/yr:

1. Create a *Developer ID Application* certificate and install it in the login keychain.
2. Set notarization credentials in the build environment:
   ```bash
   export APPLE_ID="…"            # Apple ID email
   export APPLE_APP_SPECIFIC_PASSWORD="…"   # appleid.apple.com → App-Specific Passwords
   export APPLE_TEAM_ID="…"       # 10-character team id
   ```
3. Flip `build.mac.notarize` to `true` in `package.json` and run `npm run package`.

`hardenedRuntime` and the entitlements in `build/entitlements.mac.plist` are
already configured — notarization rejects an app without them, and Electron
crashes at launch under the hardened runtime without the JIT entitlements.

**Interim (no certificate yet)** — hand her the app on a **USB stick**. Files
copied from removable media are not quarantined, so an unsigned build opens
normally. Downloading or AirDropping the same file will not work.

## 3. Traffic lights overlap the content

The window uses `titleBarStyle: 'hiddenInset'`, which removes the title bar but
leaves the close/minimise/zoom buttons floating over the top-left of our own UI.
The renderer stamps `data-platform` on `<html>` from `window.innerlume.platform`,
and `index.css` reserves 88px of left padding on the top bar for darwin only.

If the top bar ever gains something at its far left, check it on macOS — Windows
and Linux keep a real title bar and ignore `titleBarStyle`, so this class of bug
is invisible everywhere except the machine she actually uses.
