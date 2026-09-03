# Building and installing Innerlume on macOS

## Quick start (from the source zip)

Node 20+ and Xcode Command Line Tools (`xcode-select --install`) are the only
prerequisites — everything else comes from npm.

```bash
unzip innerlume-desktop-mac-build.zip -d innerlume
cd innerlume
npm install            # devDependencies included; electron-builder needs them
npm run package        # → release/Innerlume-0.1.0-universal.dmg
```

The zip carries no `node_modules`, no `out/`, and no `release/` — those are all
produced by the two commands above. The app icons in `build/` are pre-generated
and committed, so `npm run icons` is NOT needed (it is the only thing that
requires `sharp`, so a `sharp` install warning on macOS is harmless).

Read on for the three things about macOS that are not obvious.

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

### "Innerlume contains malware and was moved to the Trash"

This is the same problem wearing a much more alarming hat, and it is what macOS
14+ says instead of the older "unidentified developer" wording. Nothing was
found in the app. The build is ad-hoc signed (`hardenedRuntime` is on but
`notarize` is off and there is no Developer ID), so there is no signature for
Apple to check — and an unverifiable app that also carries the quarantine flag
is treated as hostile rather than merely unknown.

It happens even on the Mac that built the app, because the quarantine flag rides
along with whatever the source arrived in.

Recover it:

```bash
# 1. Put it back — macOS moved it, it did not delete it
open ~/.Trash                 # drag Innerlume.app to /Applications

# 2. Clear the flag and re-sign
bash scripts/mac-fix-quarantine.sh

# 3. Open it
open /Applications/Innerlume.app
```

Or by hand, if the script is not to hand:

```bash
xattr -dr com.apple.quarantine /Applications/Innerlume.app
codesign --force --sign - /Applications/Innerlume.app
```

Every rebuild needs this again until the app is notarized — clearing quarantine
treats the symptom, and only a Developer ID signature removes the cause.

### Signing with an existing Developer ID

If you already hold a Developer ID certificate from another project, Innerlume
can use it without editing `package.json`. electron-builder reads `CSC_NAME`:

```bash
security find-identity -v -p codesigning     # confirm the cert is in the keychain
export CSC_NAME="Developer ID Application: Your Org (TEAMID)"
npm run package
```

That is the difference between a build macOS calls malware and one it merely
warns about: a signed app fails to a "cannot check it for malicious software"
dialog where **Open Anyway** works, instead of being moved to the Trash.

The identity is deliberately NOT committed here. Pinning one in `package.json`
breaks the build on any machine that lacks that certificate — electron-builder
aborts rather than falling back — and `CSC_NAME` keeps the unsigned path working
for anyone who just wants to run it locally.

Signing still is not notarization. macOS 10.15+ wants both for downloaded apps,
so a signed-but-unnotarized build is a better failure, not a clean one. To
finish the job, set the three `APPLE_*` variables above and flip
`build.mac.notarize` to `true`.

## 3. Traffic lights overlap the content

The window uses `titleBarStyle: 'hiddenInset'`, which removes the title bar but
leaves the close/minimise/zoom buttons floating over the top-left of our own UI.
The renderer stamps `data-platform` on `<html>` from `window.innerlume.platform`,
and `index.css` reserves 88px of left padding on the top bar for darwin only.

If the top bar ever gains something at its far left, check it on macOS — Windows
and Linux keep a real title bar and ignore `titleBarStyle`, so this class of bug
is invisible everywhere except the machine she actually uses.
