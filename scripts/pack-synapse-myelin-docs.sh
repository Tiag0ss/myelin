#!/usr/bin/env bash
# Pack docs/synapse-myelin-manual into a Synapse-importable ZIP.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/docs/synapse-myelin-manual"
OUT="$ROOT/docs/synapse-myelin-manual.zip"

if [[ ! -d "$SRC" ]]; then
  echo "Missing source directory: $SRC" >&2
  exit 1
fi

rm -f "$OUT"
# Run from docs/ so the ZIP root is synapse-myelin-manual/ (Synapse strips a single top folder).
(
  cd "$ROOT/docs"
  zip -r "$(basename "$OUT")" synapse-myelin-manual \
    -x '*/.DS_Store' \
    -x '**/.DS_Store' \
    -x '*/__MACOSX/*'
)

bytes=$(wc -c < "$OUT" | tr -d ' ')
notes=$(find "$SRC" -type f -name '*.md' | wc -l | tr -d ' ')
echo "Wrote $OUT ($bytes bytes, $notes markdown files)"
if (( bytes > 20971520 )); then
  echo "WARNING: ZIP exceeds Synapse 20 MB import limit" >&2
  exit 1
fi
