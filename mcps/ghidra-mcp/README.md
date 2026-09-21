# Ghidra MCP

Local MCP component providing 253+ reverse engineering tools via [bethington/ghidra-mcp](https://github.com/bethington/ghidra-mcp).

## Versions

- **ghidra-mcp**: v6.0.0 (`8cd2078e`)
- **Ghidra**: 12.1.2
- **JDK**: Temurin 21.0.12.1 (portable, in `runtime/jdk/`)
- **Maven**: 3.9.9 (portable, in `runtime/maven/`)

## Architecture

```
OpenCode → ghidra-mcp-launcher → bridge-mcp-ghidra (stdio) → Ghidra Headless Server (HTTP 127.0.0.1:8089)
```

Launcher auto-starts headless server on first MCP connection. PID tracked in `runtime/state/headless.pid`.

## Paths

| Path | Purpose |
|------|---------|
| `source/` | ghidra-mcp git repo (pinned tag) |
| `runtime/.venv/` | Python bridge environment |
| `runtime/GhidraMCP.jar` | Built headless server JAR |
| `runtime/jdk/` | Portable JDK 21 |
| `runtime/maven/` | Portable Maven 3.9.9 |
| `runtime/projects/` | Ghidra project databases |
| `runtime/logs/` | Headless server logs |
| `runtime/state/` | PID file |
| `ghidra-releases/` | Versioned Ghidra installations |
| `ghidra` | Symlink to active Ghidra release |

## Security

- Server binds `127.0.0.1` only
- Script execution endpoints disabled (default)
- No auth required (loopback only)
- Binary imports allowed from any readable path

## Auto-Update

Component-updater handles all dependencies automatically:

| Dependency | Detection | Update mechanism |
|------------|-----------|------------------|
| ghidra-mcp source | GitHub releases API (via `gh cli`) | git clone tag, rebuild |
| Ghidra binary | pom.xml `ghidra.version` + GitHub NSA releases API | Download zip, verify SHA256 |
| JDK (Temurin) | Compatibility map (Ghidra version → JDK major) | Adoptium API download |
| Maven | Only when build fails with current version | Apache archive download |
| Python deps | pyproject.toml in new source | `uv pip install -e .` |

All updates are staged first, healthchecked on port 8090, then applied atomically. Failed updates leave current installation untouched. Rollback via `opencode-component-updater rollback mcp.ghidra-mcp`.

## Update Commands

```bash
opencode-component-updater check       # Check for updates (uses gh cli)
opencode-component-updater status      # Show component state
opencode-component-updater upgrade     # Apply available updates
opencode-component-updater rollback mcp.ghidra-mcp  # Restore previous version
```

## Diagnostics

```bash
curl http://127.0.0.1:8089/check_connection
curl http://127.0.0.1:8089/get_version
cat runtime/logs/headless.log
```

## Manual Lifecycle

```bash
bin/start-headless    # Start headless server background
bin/stop-headless     # Stop component-owned server
```

## Recovery

If update fails or server is broken:
1. `opencode-component-updater rollback mcp.ghidra-mcp`
2. `bin/stop-headless`
3. Restart OpenCode

## Notes

- Previous IDA Pro MCP at `127.0.0.1:13337` is external/unmanaged
- Ghidra projects persist in `~/Documents/rev/projects/`
- First MCP call may take ~10s for headless server startup
