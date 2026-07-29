#!/usr/bin/env bash
#
# Build Braindot.app and a .dmg — everything, in one file.
#
# Copy this file to your Mac and run it. It clones the repo if you are not
# already inside it, installs what is missing, writes the one environment
# variable the build needs, and produces the installer.
#
#   bash build-mac.sh
#
# Options (all optional):
#   NEXT_PUBLIC_CONVEX_URL=https://…   the Convex deployment to sync with
#   BRAINDOT_REPO=https://…            clone from somewhere other than origin
#   BRAINDOT_DIR=~/somewhere           where to clone
#   BRAINDOT_BRANCH=desktop-app        a branch other than the repo default,
#                                      for before the desktop work is merged
#
# Safe to run again: every step checks before it acts.

set -euo pipefail

REPO="${BRAINDOT_REPO:-https://github.com/siddhpatel299/braindot.git}"
TARGET_DIR="${BRAINDOT_DIR:-$HOME/braindot}"
BRANCH="${BRAINDOT_BRANCH:-}"

# Not a secret: Next inlines NEXT_PUBLIC_* into the client bundle, so this value
# already ships inside the deployed web app. It matters because the desktop app
# has to point at the *same* deployment as your other devices, or it will open a
# separate, empty vault.
DEFAULT_CONVEX_URL="https://merry-beagle-541.convex.cloud"

bold=$'\033[1m'; dim=$'\033[2m'; red=$'\033[31m'; grn=$'\033[32m'; mag=$'\033[35m'; off=$'\033[0m'
step() { printf '\n%s▸%s %s%s%s\n' "$mag" "$off" "$bold" "$1" "$off"; }
info() { printf '  %s%s%s\n' "$dim" "$1" "$off"; }
ok()   { printf '%s✓%s %s\n' "$grn" "$off" "$1"; }
die()  { printf '\n%s✗ %s%s\n\n' "$red" "$1" "$off" >&2; exit 1; }

# ---------------------------------------------------------------- 1. platform

step "Checking the machine"

[ "$(uname -s)" = "Darwin" ] || die "This script only runs on macOS.
  A .dmg cannot be built anywhere else — electron-builder refuses outright.
  On Windows, use: bun run desktop:dist"

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) DMG_ARCH="arm64"; info "Apple silicon ($ARCH)" ;;
  x86_64) DMG_ARCH="x64";  info "Intel ($ARCH)" ;;
  *) die "Unexpected architecture: $ARCH" ;;
esac

command -v git >/dev/null 2>&1 || die "git is not installed. Run: xcode-select --install"

# ---------------------------------------------------------------- 2. the repo

step "Getting the source"

# Run from inside a checkout if there is one, otherwise clone.
if [ -f "package.json" ] && grep -q '"name": *"braindot"' package.json 2>/dev/null; then
  info "already inside a braindot checkout: $(pwd)"
elif [ -d "$TARGET_DIR/.git" ]; then
  info "using existing clone at $TARGET_DIR"
  cd "$TARGET_DIR"
  if [ -n "$BRANCH" ]; then
    git fetch origin "$BRANCH"
    git checkout "$BRANCH"
  fi
  git pull --ff-only || info "could not fast-forward — continuing with what is checked out"
else
  info "cloning $REPO${BRANCH:+ (branch $BRANCH)}"
  if [ -n "$BRANCH" ]; then
    git clone --branch "$BRANCH" "$REPO" "$TARGET_DIR"
  else
    git clone "$REPO" "$TARGET_DIR"
  fi
  cd "$TARGET_DIR"
fi

# The desktop shell is what we are here to build. If it is missing, the branch on
# GitHub predates it — which almost always means it was never pushed.
if [ ! -f "electron/main.js" ] || [ ! -f "scripts/build-desktop.mjs" ]; then
  die "This checkout has no desktop shell (electron/main.js is missing).

  The desktop work has not been pushed yet. On the machine where it was written:

      git add -A && git commit -m 'feat: desktop app' && git push

  then run this script again."
fi

ok "source ready — $(pwd)"

# ---------------------------------------------------------------- 3. toolchain

step "Checking Bun"

if ! command -v bun >/dev/null 2>&1; then
  info "bun not found — installing"
  curl -fsSL https://bun.sh/install | bash
  # The installer only edits your shell profile, which does not affect a script
  # that is already running; put it on PATH for this run too.
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
fi
command -v bun >/dev/null 2>&1 || die "bun is still not on PATH. Open a new terminal and re-run."
ok "bun $(bun --version)"

step "Installing dependencies"
bun install

# Bun blocks lifecycle scripts unless a package is trusted, and Electron's
# postinstall is what downloads the ~100MB binary. package.json trusts it, but
# check anyway — a skipped download fails much later and far less clearly.
if [ ! -f "node_modules/electron/path.txt" ]; then
  info "electron binary missing — running its installer directly"
  ( cd node_modules/electron && { node install.js || bun install.js; } )
fi
[ -f "node_modules/electron/path.txt" ] || die "Electron did not download. Try: bun pm trust electron"
ok "dependencies installed"

# ---------------------------------------------------------------- 4. env

step "Configuring the Convex deployment"

CONVEX_URL="${NEXT_PUBLIC_CONVEX_URL:-}"

if [ -z "$CONVEX_URL" ] && [ -f ".env.local" ]; then
  # `|| true` matters: pipefail is on, and a grep that matches nothing would
  # otherwise abort the script rather than falling through to the prompt.
  CONVEX_URL="$(grep -E '^NEXT_PUBLIC_CONVEX_URL=' .env.local | head -1 | cut -d= -f2- || true)"
  CONVEX_URL="${CONVEX_URL%$'\r'}"   # a .env.local authored on Windows
  CONVEX_URL="${CONVEX_URL//\"/}"
  CONVEX_URL="${CONVEX_URL//\'/}"
  CONVEX_URL="${CONVEX_URL// /}"
  if [ -n "$CONVEX_URL" ]; then info "found one in .env.local"; fi
fi

if [ -z "$CONVEX_URL" ]; then
  if [ -t 0 ]; then
    printf '  Convex URL [%s]: ' "$DEFAULT_CONVEX_URL"
    read -r CONVEX_URL || true
  fi
  CONVEX_URL="${CONVEX_URL:-$DEFAULT_CONVEX_URL}"
fi

case "$CONVEX_URL" in
  https://*.convex.cloud) ;;
  *) die "That does not look like a Convex URL: $CONVEX_URL" ;;
esac

# .env.local is gitignored, so it never arrives with the clone. Write the key
# without disturbing anything else already in the file.
touch .env.local
if grep -qE '^NEXT_PUBLIC_CONVEX_URL=' .env.local; then
  # BSD sed on macOS needs an explicit (empty) backup suffix for -i.
  sed -i '' -E "s|^NEXT_PUBLIC_CONVEX_URL=.*|NEXT_PUBLIC_CONVEX_URL=$CONVEX_URL|" .env.local
else
  printf 'NEXT_PUBLIC_CONVEX_URL=%s\n' "$CONVEX_URL" >> .env.local
fi
ok "syncing with $CONVEX_URL"

info "Your OpenAI key is deliberately not needed here — it is never baked into"
info "the app. Set it after launch in Braindot ▸ Settings… (⌘,)."

# ---------------------------------------------------------------- 5. build

step "Building (this takes a few minutes)"
bun run desktop:dist:mac

# ---------------------------------------------------------------- 6. report

step "Done"

# Prefer the .dmg for this machine's architecture; both are built.
DMG_NAME="$(ls dist-desktop 2>/dev/null | grep -E "^braindot-.*-${DMG_ARCH}\.dmg$" | head -1 || true)"
if [ -z "$DMG_NAME" ]; then
  # Fall back to whatever did get produced rather than claiming failure.
  DMG_NAME="$(ls dist-desktop 2>/dev/null | grep -E '\.dmg$' | head -1 || true)"
fi
DMG="dist-desktop/$DMG_NAME"
[ -f "$DMG" ] || die "The build finished but no .dmg was produced. Check the output above."

ok "$(cd "$(dirname "$DMG")" && pwd)/$(basename "$DMG")"
printf '  %s\n' "$(du -h "$DMG" | cut -f1) · built for $DMG_ARCH"

cat <<'NEXT'

  Open the .dmg and drag Braindot to Applications.

  The build is unsigned, so Gatekeeper will block the first launch. Either:
    • right-click the app ▸ Open ▸ Open, or
    • System Settings ▸ Privacy & Security ▸ "Open Anyway", or
    • xattr -dr com.apple.quarantine /Applications/braindot.app

  Then set your OpenAI key in Braindot ▸ Settings… (⌘,).

NEXT

command -v open >/dev/null 2>&1 && open "$(dirname "$DMG")" || true
