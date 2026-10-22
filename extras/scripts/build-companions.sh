#!/usr/bin/env bash
# Build desktop installers + IDE packages into extras/release (CI / Docker).
# Visual Studio VSIX requires MSBuild on Windows and is not produced here.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RELEASE_DIR="$ROOT/extras/release"
mkdir -p "$RELEASE_DIR"

echo "==> Desktop: Linux AppImage"
(
  cd "$ROOT"
  pnpm run desktop:build:linux
)

echo "==> Desktop: Windows NSIS"
(
  cd "$ROOT"
  pnpm run desktop:build:win
)

echo "==> VS Code / Cursor VSIX"
(
  cd "$ROOT/extras/ide-extensions/vscode"
  pnpm install --ignore-workspace --frozen-lockfile
  pnpm run package
  cp -f ./*.vsix "$RELEASE_DIR/"
)

echo "==> Rider plugin ZIP"
(
  cd "$ROOT/extras/ide-extensions/rider"
  chmod +x ./gradlew
  ./gradlew buildPlugin --no-daemon
  cp -f ./build/distributions/*.zip "$RELEASE_DIR/"
)

echo "==> Prune intermediate electron-builder output"
rm -rf \
  "$RELEASE_DIR/linux-unpacked" \
  "$RELEASE_DIR/win-unpacked" \
  "$RELEASE_DIR"/*.blockmap \
  "$RELEASE_DIR"/builder-debug.yml \
  "$RELEASE_DIR"/builder-effective-config.yaml \
  "$RELEASE_DIR"/builder-*.yml \
  "$RELEASE_DIR"/builder-*.yaml \
  2>/dev/null || true

echo "==> Companions in $RELEASE_DIR:"
ls -lah "$RELEASE_DIR"
