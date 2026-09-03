#!/bin/bash
# Make a locally built Innerlume.app launchable on the Mac that built it.
#
# An unsigned (ad-hoc signed) app that carries com.apple.quarantine is refused by
# Gatekeeper on macOS 14+, and the dialog says the app "contains malware" and
# offers to move it to the Trash. That wording is about Apple being unable to
# VERIFY the app, not about anything found in it — there is no Developer ID
# signature to check, so macOS assumes the worst.
#
# This clears the quarantine flag and re-applies an ad-hoc signature. It is the
# interim measure for the pilot; the real fix is notarization (see MAC-BUILD.md).
#
#   bash scripts/mac-fix-quarantine.sh [/Applications/Innerlume.app]

set -euo pipefail

APP="${1:-/Applications/Innerlume.app}"

if [ ! -d "$APP" ]; then
  echo "Not found: $APP"
  echo
  echo "If macOS already moved it to the Trash, restore it first:"
  echo "  open ~/.Trash        # drag Innerlume back to /Applications"
  echo
  echo "Then re-run:  bash scripts/mac-fix-quarantine.sh"
  exit 1
fi

echo "→ Removing the quarantine flag from $APP"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

echo "→ Re-applying an ad-hoc signature"
# Nested helpers must be signed before the bundle that contains them, so sign
# depth-first rather than relying on --deep (deprecated, and unreliable on the
# Electron framework layout).
find "$APP/Contents/Frameworks" -type d \( -name "*.app" -o -name "*.framework" \) -prune -print 2>/dev/null \
  | while read -r nested; do
      codesign --force --sign - --timestamp=none "$nested" 2>/dev/null || true
    done
codesign --force --sign - --timestamp=none \
  --entitlements "$(dirname "$0")/../build/entitlements.mac.plist" "$APP" 2>/dev/null \
  || codesign --force --sign - --timestamp=none "$APP"

echo "→ Verifying"
if codesign --verify --deep --strict "$APP" 2>/dev/null; then
  echo "   signature OK"
else
  echo "   signature is ad-hoc and unverifiable by Apple — expected, and fine locally"
fi

echo
echo "Done. Open it with:  open '$APP'"
echo "If macOS still refuses: System Settings → Privacy & Security → Open Anyway."
