#!/usr/bin/env bash
set -euo pipefail
# Fail if any personal secret / identifier pattern appears in tracked files.
# Run from repo root: scripts/verify-no-secrets.sh

PATTERNS=(
  'sk-[A-Za-z0-9]{16,}'
  'ctx7sk-[a-z0-9-]{8,}'
  'as_sk_[a-z0-9]{8,}'
  '/home/[a-z0-9]+/'
  '/mnt/c/Users/[A-Za-z]+'
  '(?i)c:[\\\\/]users'
  'home_ts'
  'Administrator'
  '--user "?c"?'
)

cd "$(dirname "$0")/.."

fail=0
for p in "${PATTERNS[@]}"; do
  # --glob skips this script itself and docs that legitimately show the pattern syntax
  hits=$(rg -n --hidden -g '!.git' -g '!scripts/verify-no-secrets.sh' -g '!.superpowers' -e "$p" . 2>/dev/null | rg -v '<you>' || true)
  if [[ -n "$hits" ]]; then
    echo "LEAK pattern [$p]:"
    echo "$hits" | head -20
    fail=1
  fi
done

if [[ "$fail" -eq 1 ]]; then
  echo "FAIL: personal info detected."
  exit 1
fi
echo "OK: no personal info in repo."
