# opencode-dotfile

Personal [OpenCode](https://opencode.ai) harness, packaged to reinstall on any machine with one command.

## What's in here

| Path | Content |
|------|---------|
| `opencode.json` | V2 global config: MCP servers, providers, plugins. Secrets referenced via `{env:VAR}` |
| `cli.json` | V2 global CLI/TUI settings and plugins |
| `AGENTS.md` | Global agent rules (Context7 workflow, coding guidelines, math output) |
| `skills/` | Local skills: coding workflow, CTF publishing, Draw.io, and OpenCode component maintenance |
| `plugins/` | Local plugins: caveman, CTF skills, quota, RTK, reverse-skill, providers, taste-skill, superpowers, and updater components |
| `mcps/` | MCP install scripts + requirements lockfiles. Venvs/binaries are generated, not committed |
| `component-updater/` | Manifest template driving the component-updater plugin |
| `install.sh` | One-shot bootstrap |
| `scripts/verify-no-secrets.sh` | Secret/personal-info gate (pre-commit + CI) |

## Install

```bash
git clone <this-repo> ~/opencode-dotfile
cd ~/opencode-dotfile
./install.sh                 # full install
SKIP=ghidra-mcp ./install.sh # skip the ~2GB Ghidra toolchain
```

`install.sh`:

1. Refuses to replace an existing non-symlink `~/.config/opencode`
2. Symlinks this repo to `~/.config/opencode`
3. Renders updater config outside repo when the repo is symlinked
4. Creates `~/.config/opencode-secrets.env` from `.env.example`
5. Installs locked npm dependencies and builds the Vilao provider
6. Restores pinned CTF, taste, reverse-skill, RTK, and updater runtimes
7. Creates or syncs MCP venvs with uv from locked requirements
8. Leaves Ghidra setup for its updater and warns when its runtime is absent
9. Enables `frida-game-hacking` through ignored local `opencode.jsonc` only when `FRIDA_PYTHON` is set

## Secrets

```bash
$EDITOR ~/.config/opencode-secrets.env   # fill in the keys
# add to ~/.zshrc:
[ -f "$HOME/.config/opencode-secrets.env" ] && source "$HOME/.config/opencode-secrets.env"
```

Variables: `VIRUSTOTAL_API_KEY`, `CONTEXT7_API_KEY`, `ANYSEARCH_BEARER`, `GITHUB_TOKEN`, `KIROBOT_CLAUDE_API_KEY`, `KIROBOT_GPT_API_KEY`. Optional: `FRIDA_PYTHON` + `FRIDA_MIRROR` + `FRIDA_MIRROR_WIN` (WSL frida-game-hacking), `TSHARK_PATH`/`CAPINFOS_PATH` overrides.

`opencode-secrets.env` is outside repo. Never commit real values.

## Machine-local data (NOT in this repo)

Auth and session state live outside the config dir and must be recreated per machine:

- `~/.local/share/opencode/auth.json`, `auth-v2.json`, `account.json` — provider logins (`opencode auth login` / llmgate login flow)
- `~/.local/share/opencode/llmgate-login.v1.json` — llmgate-provider login
- `~/.local/share/opencode/opencode.db` — session history
- CTF scope config points `OPENCODE_CONFIG` at `plugins/ctf-skills/ctf-skills.json` while inside `OPENCODE_CTF_ROOT`

## External tool prerequisites

- `opencode` CLI, `node`/`npm`, `bun`, `python3`, `uv`, `ripgrep`, `gh` (ghidra updater)
- `codegraph` binary (codegraph MCP)
- `tshark`/`capinfos` (network-forensics MCP; absolute paths in `opencode.json` — adjust if yours live in `/usr/bin`)

## OpenCode V2

The repository uses native V2 configuration. OpenCode V2 keeps server settings in `opencode.json` and terminal settings
in global `cli.json`; V1 `tui.json` is not used.

## Updating components

Runtime updates go through the `opencode-component-updater` plugin, which drives each `component-updater` script with a staged plan (venv rebuild, manifest apply, rollback). Python MCP venvs are recreated from `requirements.lock` with `uv pip sync`.

## Ghi chú nguồn component

Một số MCP server/plugin cài trực tiếp từ repo GitHub của tác giả dotfile (xem `mcps/*/requirements.in`, `plugins/*/component-updater`).
