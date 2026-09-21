---
name: opencode-component-install
description: Use ONLY when installing, adding, upgrading, repairing, or removing an OpenCode MCP server or plugin. Keeps local components isolated and registered with opencode-component-updater.
license: CC0-1.0
compatibility: opencode
---

# OpenCode Component Install

Use this skill only for OpenCode MCP/plugin maintenance. Do not load it to use an already configured MCP/plugin, or for ordinary project dependencies.

## Layout Contract

`CONFIG_DIR=~/.config/opencode`

| Component | Owner directory |
|---|---|
| Local MCP | `CONFIG_DIR/mcps/<name>/` |
| Local plugin | `CONFIG_DIR/plugins/<name>/` |
| MCP source retained locally | `CONFIG_DIR/mcps/<name>/source/` |
| MCP Node runtime | `CONFIG_DIR/mcps/<name>/runtime/` |
| MCP wrapper/launcher | `CONFIG_DIR/mcps/<name>/bin/` |
| Python MCP environment | `CONFIG_DIR/mcps/<name>/.venv/` |

Never create or restore shared runtime directories at `CONFIG_DIR` root. In particular, do not use root `node_modules/`, `venv/`, `mcp-runtime/`, `mcp-server/`, `mcp-venvs/`, `mcp/`, `packages/`, `tools/`, or `uv/`.

## Before Changing Anything

1. Read `CONFIG_DIR/opencode.json`, `CONFIG_DIR/tui.json`, and the target component directory if it exists.
2. Search `mcps/` and `plugins/` for the package/server name before adding another copy.
3. Read the deployed updater contract and inventory before planning:
   - `CONFIG_DIR/plugins/opencode-component-updater/README.md`
   - `CONFIG_DIR/plugins/opencode-component-updater/config/components.example.json`
   - `CONFIG_DIR/component-updater/components.json`
4. Confirm component kind and ownership. Prefer local ownership through `opencode-component-updater` whenever its release/install model can manage the component safely:
   - Remote MCP or system-managed executable: config only. Do not create an empty local runtime.
   - Local Python MCP: isolated component directory and `.venv`.
   - Local Node MCP: dependencies under that MCP's `runtime/`.
   - Local plugin: dependencies and build output under that plugin's directory.
   - Published npm plugin: default to an isolated local owner directory and updater-managed npm release. Use OpenCode's cache-managed npm spec only when updater management is impossible or the user explicitly prefers it.
5. For upstream packages, SDKs, CLIs, or framework-specific setup, use the `context7-library-check` skill before selecting install commands or config fields.
6. Do not change an existing component's source, package manager, or version strategy without a concrete need.

## Component Updater Contract

Every locally owned MCP or plugin must be registered with `opencode-component-updater`. Registration is part of installation, repair, upgrade, and removal. Before accepting another updater, package cache, or manual update path, first determine whether `opencode-component-updater` can own checks, staging, healthchecks, backups, apply, and rollback; use it when it can.

Follow the deployed README and schema read above; do not duplicate their field definitions here. Select the simplest supported source:

1. Published release for npm or PyPI.
2. Latest Git release by default, with automatic HEAD fallback when no release exists.
3. Explicit Git HEAD only when requested or concretely required.
4. Executable `<component>/component-updater` for complex/native logic.

Complex logic belongs inside the component owner directory. Never add component-named modes or branches to updater core. Script updates stage output by default so validation, backup, transaction, and rollback remain available.

### Component Update Scripts

Prefer a component-owned executable at `<component>/component-updater` whenever update handling needs custom commands. Keep `components.json` compact:

```json
{
  "enabled": true,
  "target": "/absolute/path/to/component",
  "source": {"type": "script"}
}
```

Do not expand routine script configuration into `policy`, `check.command`, or `update.command` blocks in inventory. The updater discovers the component script and supplies transaction policy automatically. Put these actions in the script instead:

- `check`: resolve current/latest versions and write the schema-1 result to `OPENCODE_UPDATER_CHECK_RESULT`; include immutable artifact URL and integrity when available.
- `update`: download only the planned artifact, verify `OPENCODE_UPDATER_ARTIFACT_INTEGRITY`, build/install entirely under `OPENCODE_UPDATER_STAGE`, and write a schema-2 manifest to `OPENCODE_UPDATER_MANIFEST` bound to `OPENCODE_UPDATER_PLAN_SHA256`.
- `healthcheck`: validate staged version, required entry points, imports, executability, or tool discovery before apply.

The script must preserve itself in the staged manifest so future updates remain manageable. It must not modify the live target during `update` or `healthcheck`, except for a documented unavoidable external integration. Prefer standard-library downloads and explicit digest verification; never trust a moving URL without integrity. Keep component-specific logic in this script, not updater core or global inventory.

Before implementation, state owner directory, authoritative source, release/HEAD choice, driver/script choice, healthcheck, rollback behavior, and updater inventory change. Remote or system-managed components remain inventory entries but must not gain fake local runtimes.

## Local MCP Rules

### Python

Keep direct requirements in `requirements.in` and reproducible resolved requirements in `requirements.lock`. Install only into `mcps/<name>/.venv/`. Configure OpenCode with an absolute command array pointing at that environment, for example:

```json
{
  "type": "local",
  "command": [
    "~/.config/opencode/mcps/example/.venv/bin/example-mcp"
  ],
  "enabled": true
}
```

### Node

Put manifest, lockfile, and `node_modules/` below `mcps/<name>/runtime/`. Put a small launcher only when needed in `mcps/<name>/bin/`. Configure the absolute `node` command plus launcher path. Do not install Node dependencies in `CONFIG_DIR`.

### Source-based MCPs

Keep retained source in `mcps/<name>/source/`. Record a fixed release, tag, or commit in that component's README or manifest. Do not silently `git pull`, switch branches, or overwrite user edits.

### Remote and system-managed MCPs

For a remote endpoint, use `type: "remote"`, its URL, and `{env:VAR}` for any new secret header. For a system command such as `codegraph` or a one-shot `npx` package, add only the needed `type: "local"` command entry. Do not make a local component directory unless it owns files.

## Plugin Rules

1. Put local source, `package.json`, lockfile, `node_modules/`, config, and build output under `plugins/<name>/`.
2. Add local plugins to `opencode.json` with an absolute `file://~/.config/opencode/plugins/...` target. Use a directory target when it has `package.json`; use its explicit entry file otherwise.
3. Add a plugin to `tui.json` only when it exports a TUI plugin and needs TUI loading. Keep its server entry in `opencode.json` when it also has server hooks.
4. For a published npm plugin, prefer an isolated `plugins/<name>/` owner containing `package.json`, lockfile, and `node_modules`, load its package through an absolute `file://` target, and register its npm source with `opencode-component-updater`.
5. Use an exact npm spec such as `@scope/package@x.y.z` only when local updater ownership is not supported or the user explicitly chooses OpenCode cache ownership. Never use a bare package or `@latest` by default.
6. Do not move an existing local plugin to an npm spec, or vice versa, unless the user asks.

## Config and Secrets

- Preserve `$schema`, existing entries, ordering, and unrelated fields in `opencode.json` and `tui.json`.
- `mcp.<name>.command` must be an array of strings; local and remote MCP entries require the correct `type`.
- Set a timeout only when normal operations justify it; do not copy another MCP's timeout blindly.
- Use `{env:NAME}` for new credentials in headers. Use `environment` for local MCP environment variables. Never write a new API key, token, password, or private key into config, logs, or a skill.
- Do not add a root package manifest merely to install one plugin or MCP.

## Upgrade, Repair, and Removal

- Upgrade only the requested component, retain its lock/version evidence, then validate before changing config references.
- Repair inside the existing owner directory; do not recreate legacy shared roots.
- On removal, delete the component directory only after removing its matching config entries and confirming no other active entry references it.
- Never delete another component's dependencies or an unrelated dirty source tree.
- Keep `CONFIG_DIR/component-updater/components.json` synchronized with each component lifecycle change.

## Required Validation

1. Confirm every active local config path exists and belongs to the named component.
2. Run the component's smallest harmless check: import/version/help/tool discovery, as applicable.
3. Run `opencode debug info` and `opencode mcp list` after MCP or plugin config changes.
4. For an MCP, make one read-only or discovery smoke call when practical.
5. Validate updater config and confirm `opencode-component-updater status` recognizes the component. Do not run an update unless requested.
6. Report owner directory, config entries, updater registration, version/lock source, and any external service still required.
7. Tell the user to quit and restart OpenCode: plugins, skills, and MCP config load at startup.
