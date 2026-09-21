#!/usr/bin/env bash
set -euo pipefail
# Bootstrap opencode config from this dotfile repo.
# Usage: ./install.sh            (full install)
#        SKIP=ghidra-mcp ./install.sh

REPO="$(cd "$(dirname "$0")" && pwd)"
DEST="${HOME}/.config/opencode"
SKIP="${SKIP:-}"

echo "opencode-dotfile install"
echo "  repo: $REPO"
echo "  dest: $DEST"

for tool in git node npm python3 uv rg; do
  command -v "$tool" >/dev/null 2>&1 || { echo "missing tool: $tool"; exit 1; }
done

if [[ -e "$DEST" && ! -L "$DEST" ]]; then
  BAK="${DEST}.bak-$(date +%Y%m%d-%H%M%S)"
  echo "backing up existing $DEST -> $BAK"
  mv "$DEST" "$BAK"
fi

if [[ ! -e "$DEST" ]]; then
  ln -s "$REPO" "$DEST"
  echo "symlinked $DEST -> $REPO"
elif [[ "$(readlink -f "$DEST")" == "$(readlink -f "$REPO")" ]]; then
  echo "already linked"
else
  echo "$DEST exists and is not this repo; refusing. Move it aside first."
  exit 1
fi

sed "s|__HOME__|$HOME|g" "$REPO/component-updater/components.json.tmpl" \
  > "$DEST/component-updater/components.json"
echo "rendered components.json"

if [[ ! -f "$DEST/secrets.env" ]]; then
  cp "$REPO/.env.example" "$DEST/secrets.env"
  echo "created $DEST/secrets.env"
  echo "  -> fill in the keys, then add to ~/.zshrc:"
  echo '     [ -f "$HOME/.config/opencode/secrets.env" ] && source "$HOME/.config/opencode/secrets.env"'
fi

echo "npm deps ..."
(cd "$REPO" && npm install --silent)
for c in goal opencode-dir opencode-md-table-formatter ponytail; do
  (cd "$REPO/plugins/$c" && npm ci --silent)
done
(cd "$REPO/mcps/cloakbrowser/runtime" && npm ci --silent)

echo "python MCP venvs ..."
for d in "$REPO"/mcps/*/; do
  name="$(basename "$d")"
  if [[ ",$SKIP," == *",$name,"* ]]; then echo "skip $name"; continue; fi
  [[ -f "$d/requirements.lock" ]] || continue
  if [[ -e "$d/.venv/bin/python" ]]; then echo "ok $name (venv exists)"; continue; fi
  echo "  venv $name ..."
  python3 -m venv --copies "$d/.venv"
  uv pip sync --quiet --link-mode copy --python "$d/.venv/bin/python" "$d/requirements.lock"
done

if [[ ",$SKIP," != *",ghidra-mcp,"* && ! -e "$REPO/mcps/ghidra-mcp/ghidra-releases" ]]; then
  echo "ghidra-mcp: self-updater downloads JDK/Maven/Ghidra (~2GB, needs gh CLI) ..."
  "$REPO/mcps/ghidra-mcp/component-updater" update \
    || echo "ghidra-mcp updater failed; rerun: $REPO/mcps/ghidra-mcp/component-updater update"
fi

command -v opencode >/dev/null 2>&1 && { opencode --version && echo "smoke ok"; }

echo "done."
echo "secrets: $DEST/secrets.env (fill in + source from shell rc)"
