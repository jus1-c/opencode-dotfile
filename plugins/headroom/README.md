# headroom plugin (owner: plugin.headroom)

Standalone OpenCode transport plugin for the Headroom proxy.

## What it does

Patches `fetch`, `http.request`, `https.request`, `http2.connect`, and child
process spawning inside the OpenCode process so every external HTTP(S) call is
routed through the local Headroom proxy (`http://127.0.0.1:8787`). Each request
keeps its original upstream via the `x-headroom-base-url` header, so new
providers and models work without any per-provider registration.

Direct HTTP/2 connections are blocked on purpose (fail closed) - if the proxy is
not reachable, requests fail instead of silently bypassing compression.

The proxy itself is started and stopped by:

- `plugins/headroom-ctl/plugin.ts` - ensures the proxy is healthy at OpenCode
  startup and re-checks before each model call.
- `mcps/headroom-ctl/` - holds a lease per OpenCode process and stops the proxy
  when the last one exits.

## Payload

The payload is the standalone bundle shipped inside the `headroom-ai` Python
wheel, so the plugin always matches the `headroom` CLI/proxy version:

| Path | Source in wheel |
| --- | --- |
| `dist/entry.opencode.js` | `headroom/providers/opencode/_dist/entry.opencode.js` |
| `hook-shim/handler.js` | `headroom/providers/opencode/hook-shim/handler.js` |
| `VERSION` | installed `headroom-ai` version |

## Memory

The proxy runs with `--memory --memory-storage=global --memory-db-path ~/.headroom/memory.db
--no-memory-tools`. Context injection (relevant past memories) stays enabled, but
tool definitions are NOT injected into requests: OpenCode cannot execute
proxy-injected tools, so the memory tools are registered as a real MCP server
instead (`mcp.headroom-memory`, `python -m headroom.memory.mcp_server`) pointing
at the same DB. `--no-memory-tools` avoids duplicate definitions.

## Updating

Managed by `opencode-component-updater` (`plugin.headroom`, `source.mode = script`).
`component-updater check|update|healthcheck` tracks PyPI `headroom-ai`, downloads
the matching wheel, verifies its sha256 digest, and stages the two bundle files.

The `headroom` CLI is separate: it is a uv tool, updated with
`uv tool upgrade headroom-ai` (`uv` owns it, so it is not an updater inventory
entry). Keep both on the same version.
