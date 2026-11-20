#!/usr/bin/env bash
set -euo pipefail
# Bootstrap opencode config from this dotfile repo.
# Usage: ./install.sh            (full install)
#        SKIP=ghidra-mcp ./install.sh

REPO="$(cd "$(dirname "$0")" && pwd)"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
DEST="${OPENCODE_CONFIG_DIR:-$CONFIG_HOME/opencode}"
SKIP="${SKIP:-}"

echo "opencode-dotfile install"
echo "  repo: $REPO"
echo "  dest: $DEST"

for tool in git node npm python3 uv rg bun; do
  command -v "$tool" >/dev/null 2>&1 || { echo "missing tool: $tool"; exit 1; }
done
if ! command -v opencode-component-updater >/dev/null 2>&1; then
  command -v go >/dev/null 2>&1 || { echo "missing tool: go"; exit 1; }
fi

if [[ -e "$DEST" && ! -L "$DEST" ]]; then
  echo "$DEST exists and is not this repo; refusing to replace it. Move it aside first."
  exit 1
fi

if [[ ! -e "$DEST" ]]; then
  mkdir -p "$(dirname "$DEST")"
  ln -s "$REPO" "$DEST"
  echo "symlinked $DEST -> $REPO"
elif [[ "$(readlink -f "$DEST")" == "$(readlink -f "$REPO")" ]]; then
  echo "already linked"
else
  echo "$DEST exists and is not this repo; refusing. Move it aside first."
  exit 1
fi

if [[ "$(readlink -f "$DEST")" == "$(readlink -f "$REPO")" ]]; then
  LEGACY_COMPONENTS="$REPO/component-updater/components.json"
  mkdir -p "$CONFIG_HOME/opencode-component-updater"
  EXTERNAL_COMPONENTS="$CONFIG_HOME/opencode-component-updater/components.json"
  if [[ -e "$EXTERNAL_COMPONENTS" || -L "$EXTERNAL_COMPONENTS" ]]; then
    echo "preserving existing updater config: $EXTERNAL_COMPONENTS"
  elif [[ -f "$LEGACY_COMPONENTS" && ! -L "$LEGACY_COMPONENTS" ]]; then
    cp -n "$LEGACY_COMPONENTS" "$EXTERNAL_COMPONENTS"
    echo "copied legacy updater config; original retained"
  else
    python3 - "$REPO/component-updater/components.json.tmpl" "$EXTERNAL_COMPONENTS" "$HOME" "$DEST" <<'PYEOF'
import json, os, sys
source, destination, home, opencode_root = sys.argv[1:]
def replace(value):
    if isinstance(value, str): return value.replace("__HOME__/.config/opencode", opencode_root).replace("__HOME__", home)
    if isinstance(value, list): return [replace(item) for item in value]
    if isinstance(value, dict): return {key: replace(item) for key, item in value.items()}
    return value
with open(source) as handle: config = replace(json.load(handle))
with open(destination, "w") as handle:
    json.dump(config, handle, indent=2)
    handle.write("\n")
PYEOF
  fi
  if [[ ! -e "$LEGACY_COMPONENTS" && ! -L "$LEGACY_COMPONENTS" ]]; then
    ln -s "$EXTERNAL_COMPONENTS" "$LEGACY_COMPONENTS"
  fi
fi

if [[ "$DEST" != "$HOME/.config/opencode" && ! -e "$DEST/opencode.jsonc" ]]; then
  python3 - "$DEST/opencode.json" "$DEST/opencode.jsonc" "$DEST" <<'PYEOF'
import json, os, sys
source, destination, opencode_root = sys.argv[1:]
with open(source) as handle:
    config = json.load(handle)
def replace(value):
    if isinstance(value, str): return value.replace("{env:HOME}/.config/opencode", opencode_root)
    if isinstance(value, list): return [replace(item) for item in value]
    if isinstance(value, dict): return {key: replace(item) for key, item in value.items()}
    return value
config = replace(config)
if "FRIDA_PYTHON" in os.environ:
    config["mcp"]["servers"]["frida-game-hacking"]["disabled"] = False
with open(destination, "x") as handle:
    json.dump(config, handle, indent=2)
    handle.write("\n")
PYEOF
  echo "created $DEST/opencode.jsonc for custom config root"
fi

if [[ -n "${FRIDA_PYTHON:-}" && ! -e "$DEST/opencode.jsonc" ]]; then
  python3 - "$DEST/opencode.json" "$DEST/opencode.jsonc" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as handle:
    server = json.load(handle)["mcp"]["servers"]["frida-game-hacking"]
server["disabled"] = False
with open(sys.argv[2], "x") as handle:
    json.dump({"mcp": {"servers": {"frida-game-hacking": server}}}, handle, indent=2)
    handle.write("\n")
PYEOF
  echo "enabled frida-game-hacking in local opencode.jsonc"
elif [[ -n "${FRIDA_PYTHON:-}" ]]; then
  echo "existing opencode.jsonc retained; check frida-game-hacking manually"
fi

SECRETS_FILE="$CONFIG_HOME/opencode-secrets.env"
LEGACY_SECRETS="$DEST/secrets.env"
if [[ -L "$LEGACY_SECRETS" ]]; then
  echo "$LEGACY_SECRETS is a symlink; inspect it manually" >&2
  exit 1
elif [[ -e "$LEGACY_SECRETS" && ! -f "$LEGACY_SECRETS" ]]; then
  echo "$LEGACY_SECRETS is not a regular file; inspect it manually" >&2
  exit 1
elif [[ -f "$LEGACY_SECRETS" ]]; then
  chmod 600 "$LEGACY_SECRETS"
fi
if [[ -L "$SECRETS_FILE" ]]; then
  echo "$SECRETS_FILE is a symlink; refusing to use it" >&2
  exit 1
elif [[ -e "$SECRETS_FILE" && ! -f "$SECRETS_FILE" ]]; then
  echo "$SECRETS_FILE is not a regular file; refusing to use it" >&2
  exit 1
elif [[ ! -e "$SECRETS_FILE" ]]; then
  (umask 077; set -o noclobber; if [[ -f "$LEGACY_SECRETS" ]]; then cat "$LEGACY_SECRETS" > "$SECRETS_FILE"; else cat "$REPO/.env.example" > "$SECRETS_FILE"; fi)
  chmod 600 "$SECRETS_FILE"
  echo "created $SECRETS_FILE"
  echo "  -> fill in the keys, then add to ~/.zshrc:"
  printf '     [ -f "%s" ] && source "%s"\n' "$SECRETS_FILE" "$SECRETS_FILE"
else
  chmod 600 "$SECRETS_FILE"
fi

echo "npm deps ..."
for c in goal opencode-dir opencode-pty ponytail llmgate-provider quota opencode-mini-session opencode-mcp-manager vilao-provider; do
  (cd "$REPO/plugins/$c" && npm ci --silent)
done
(cd "$REPO/plugins/vilao-provider" && npm run build)
(cd "$REPO/mcps/agent-browser/runtime" && npm ci --silent)

mkdir -p /tmp/opencode
python3 "$REPO/scripts/bootstrap-skills.py"

mkdir -p "$HOME/.local/bin"
if ! command -v opencode-component-updater >/dev/null 2>&1; then
  binary="$HOME/.local/bin/opencode-component-updater"
  if [[ -e "$binary" || -L "$binary" ]]; then
    echo "$binary exists but is not on PATH; retaining it"
  else
    (cd "$REPO/plugins/opencode-component-updater" && go build -o "$binary" ./cmd/opencode-component-updater)
  fi
fi

if [[ ",$SKIP," != *",rtk,"* ]] && ! command -v rtk >/dev/null 2>&1; then
  binary="$HOME/.local/bin/rtk"
  if [[ -e "$binary" || -L "$binary" ]]; then
    echo "$binary exists but is not on PATH; retaining it"
  else
    python3 "$REPO/scripts/bootstrap-rtk.py"
    ln -s "$DEST/plugins/rtk/bin/rtk" "$binary"
  fi
fi

echo "python MCP venvs ..."
for d in "$REPO"/mcps/*/; do
  name="$(basename "$d")"
  if [[ ",$SKIP," == *",$name,"* ]]; then echo "skip $name"; continue; fi
  if [[ "$name" == "frida-game-hacking" ]]; then
    echo "skip frida-game-hacking (WSL/Windows-only deps; set FRIDA_PYTHON in secrets.env and run its component-updater on WSL)"
    continue
  fi
  [[ -f "$d/requirements.lock" ]] || continue
  py="$(python3 - "$d/component-updater" <<'PYEOF'
import ast, pathlib, sys
tree = ast.parse(pathlib.Path(sys.argv[1]).read_text())
for node in tree.body:
    if not isinstance(node, ast.Assign):
        continue
    for target in node.targets:
        if isinstance(target, ast.Name) and target.id == "CONFIG":
            print(ast.literal_eval(node.value).get("python", "3.14"))
            raise SystemExit
        if isinstance(target, ast.Name) and target.id == "PYTHON":
            print(ast.literal_eval(node.value))
            raise SystemExit
print("3.14")
PYEOF
)"
  if [[ -e "$d/.venv" ]]; then
    [[ -x "$d/.venv/bin/python" ]] || {
      echo "incomplete venv $d/.venv; refusing to replace it" >&2
      exit 1
    }
    echo "sync existing $name venv"
  else
    echo "  venv $name (${py:-python3}) ..."
    uv venv --python "${py:-python3}" "$d/.venv"
  fi
  uv pip sync --quiet --link-mode copy --python "$d/.venv/bin/python" "$d/requirements.lock"
done

if [[ ",$SKIP," != *",ghidra-mcp,"* && ! -e "$REPO/mcps/ghidra-mcp/ghidra-releases" ]]; then
  echo "WARN: Ghidra MCP needs an existing Ghidra/JDK/Maven runtime; see mcps/ghidra-mcp/README.md"
fi

command -v opencode >/dev/null 2>&1 && { opencode --version && echo "smoke ok"; }

echo "done."
echo "secrets: $SECRETS_FILE (fill in + source from shell rc)"
