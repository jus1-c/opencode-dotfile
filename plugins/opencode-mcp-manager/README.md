# OpenCode MCP Manager

OpenCode **V2** plugin for saving and applying MCP server templates from the native TUI.

## Requirements

- OpenCode V2 (`@opencode/cli` >= 2.1.4)
- This plugin does **not** support OpenCode V1 (`@opencode-ai/plugin`). Use the `v1` tag for the V1 build.

## Install

Install directly from GitHub:

```bash
opencode plugin "jus1-c/opencode-mcp-manager"
```

Or build from source:

```bash
git clone https://github.com/jus1-c/opencode-mcp-manager.git
cd opencode-mcp-manager
git checkout main
bun install
bun run build
```

Then register the plugin in `opencode.json`:

```jsonc
{
  "plugins": ["opencode-mcp-manager"]
}
```

and the TUI part in `cli.json` (V2 terminal client configuration):

```jsonc
{
  "plugins": ["opencode-mcp-manager"]
}
```

Restart OpenCode. Run `/mcp-man` to open the manager.

## Features

- Apply saved MCP templates at startup through `ctx.mcp.transform`, scoped per project location.
- Connect and disconnect MCP servers at runtime from the native TUI.
- Save current MCP state under a named template.
- Change or delete non-default templates.
- Store only enabled state; connection configuration stays in OpenCode config.
- Persist the last-applied template per directory in plugin storage.
- No `instance.dispose()` workaround: OpenCode V2 emits `mcp.status.changed`, so the TUI list refreshes on its own.

## Menu

```
MCP Manager
  Apply template        → submenu listing templates
  Save current state
  Set default template
  Delete template
```

Applying a template only affects the current project location. Other projects keep following the default template.

## Storage

Templates are stored in plugin storage (server-side, namespace `plugin:<id>:`) under the `templates` key:

```json
{
  "version": 1,
  "defaultTemplate": "default",
  "activeTemplates": {
    "/workspace/project-a": "work"
  },
  "templates": {
    "default": { "mcp": { "context7": true, "browser": false } },
    "work": { "mcp": { "context7": false, "browser": true } }
  }
}
```

The TUI reaches the server through the `opencode-mcp-manager` RPC (`src/rpc.ts`), because V2 keeps TUI storage and server storage in separate namespaces.

New configured MCP servers enter every template as enabled. Removed servers are pruned. Invalid stored data fails closed to an empty store.

## Architecture

| Piece | File | API |
| --- | --- | --- |
| Server plugin | `src/server.ts` | `@opencode/plugin` — `ctx.mcp.transform`, `ctx.rpc.register`, `ctx.storage` |
| TUI plugin | `src/tui.ts` | `@opencode/plugin/tui` — `ctx.keymap.layer`, `ctx.ui.dialog.*` |
| RPC contract | `src/rpc.ts` | `@opencode/plugin/rpc` |
| Store logic | `src/store.ts` | pure functions, no filesystem |
| Template rules | `src/template.ts` | reconcile + apply (v2 `disabled` inverse) |

## Development

```bash
bun test
bun run check
bun run build
```
