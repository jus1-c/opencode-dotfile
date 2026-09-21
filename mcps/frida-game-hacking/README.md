# Frida Game Hacking MCP

Source-based MCP: `jus1-c/frida-game-hacking-mcp` (fork, Frida 17 compat)
Pinned commit: `c0ceaa537347450dc506f3776ebce49ae16bc7cf`

## Architecture

```
WSL (OpenCode stdio) ──WSL interop──▶ Windows Python 3.12 ──Frida──▶ game process
```

- **WSL**: `mcps/frida-game-hacking/source/` (canonical Git repo)
- **Windows mirror**: `C:\Users\Administrator\AppData\Local\FridaMCP\` (no .git, editable pip install)
- **Windows Python**: Scoop `python312` (3.12.10) — frida 17.17.0, mcp 1.30.0

## Dependencies

- frida 17.17.0
- frida-tools 14.10.4
- mcp 1.30.0 (pinned `<2` — FastMCP API removed in mcp 2.x)
- pillow 12.3.0
- pywin32 311

## Update Flow

1. `opencode-component-updater check` — compare Git HEAD on GitHub vs local
2. `opencode-component-updater upgrade` — stage new commit, sync mirror, pip install -e .
3. Editable install auto-reflects source changes (no reinstall needed unless deps change)