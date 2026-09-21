# opencode-dotfile

Personal [OpenCode](https://opencode.ai) harness, packaged to reinstall on any machine with one command.

## What's in here

| Path | Content |
|------|---------|
| `opencode.json` | Global config: MCP servers, providers, plugins. Secrets referenced via `{env:VAR}` |
| `tui.json` | TUI plugin list |
| `AGENTS.md` | Global agent rules (Context7 workflow, coding guidelines, math output) |
| `skills/` | Local skills: karpathy-guidelines, context7-library-check, opencode-component-install, windows-disk-forensics |
| `plugins/` | Local plugins: caveman, quota, rtk, headroom, headroom-ctl, llmgate-provider, vilao-provider, taste-skill, superpowers, opencode-component-updater |
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

1. Backs up an existing `~/.config/opencode` to `~/.config/opencode.bak-<date>`
2. Symlinks this repo to `~/.config/opencode`
3. Renders `component-updater/components.json` from the `__HOME__` template
4. Creates `secrets.env` from `.env.example`
5. Installs npm deps (root + npm-sourced plugins)
6. Builds each MCP venv with uv (per-MCP Python version from its `component-updater` CONFIG; uv downloads the interpreter if missing)
7. Ghidra MCP: runs its self-updater (downloads JDK/Maven/Ghidra; needs `gh` CLI)

## Secrets

```bash
$EDITOR ~/.config/opencode/secrets.env   # fill in the keys
# add to ~/.zshrc:
[ -f "$HOME/.config/opencode/secrets.env" ] && source "$HOME/.config/opencode/secrets.env"
```

Variables: `VIRUSTOTAL_API_KEY`, `CONTEXT7_API_KEY`, `ANYSEARCH_BEARER`, `KIROBOT_CLAUDE_API_KEY`, `KIROBOT_GPT_API_KEY`. Optional: `FRIDA_PYTHON` + `FRIDA_MIRROR` + `FRIDA_MIRROR_WIN` (WSL frida-game-hacking), `TSHARK_PATH`/`CAPINFOS_PATH` overrides.

`secrets.env` is gitignored. Never commit real values.

## Machine-local data (NOT in this repo)

Auth and session state live outside the config dir and must be recreated per machine:

- `~/.local/share/opencode/auth.json`, `auth-v2.json`, `account.json` — provider logins (`opencode auth login` / llmgate login flow)
- `~/.local/share/opencode/llmgate-login.v1.json` — llmgate-provider login
- `~/.local/share/opencode/opencode.db` — session history
- `~/.headroom/memory.db` — headroom-memory data

## External tool prerequisites

- `opencode` CLI, `node`/`npm`, `python3`, `uv`, `ripgrep`, `gh` (ghidra updater)
- `codegraph` binary (codegraph MCP)
- `headroom` binary + `uv tool install headroom-ai` (headroom plugins/MCP)
- `tshark`/`capinfos` (network-forensics MCP; absolute paths in `opencode.json` — adjust if yours live in `/usr/bin`)

## Updating components

Runtime updates go through the `opencode-component-updater` plugin, which drives each `component-updater` script with a staged plan (venv rebuild, manifest apply, rollback). Python MCP venvs are recreated from `requirements.lock` with `uv pip sync`.

## Ghi chú nguồn component

Một số MCP server/plugin cài trực tiếp từ repo GitHub của tác giả dotfile (xem `mcps/*/requirements.in`, `plugins/*/component-updater`).
