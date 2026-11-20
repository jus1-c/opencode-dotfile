# OpenCode Component Updater

Standalone Linux/WSL updater for locally managed OpenCode MCP servers and plugins.

`opencode-component-updater` owns checks, staging, apply, backup, recovery,
rollback, and its own paired binary/plugin update. The OpenCode plugin is
read-only: it shows status and periodically runs `check --quiet`.

This source repository does not deploy itself or change an active OpenCode
configuration.

## Build And Install

Build a binary carrying its source commit. Without build metadata,
self-update needs the deployed plugin directory to be the matching Git checkout.

```bash
install -d "$HOME/.local/bin"
go build -trimpath -ldflags "-X main.commit=$(git rev-parse HEAD)" \
  -o "$HOME/.local/bin/opencode-component-updater" \
  ./cmd/opencode-component-updater
export PATH="$HOME/.local/bin:$PATH"
opencode-component-updater doctor
```

Register `index.js` as an OpenCode plugin only after the binary is available
on `PATH`, or set `OPENCODE_COMPONENT_UPDATER_BIN` to its absolute path.

Canonical runtime paths:

```text
$XDG_CONFIG_HOME/opencode-component-updater/components.json
$XDG_STATE_HOME/opencode/component-updater/
```

Defaults resolve to `~/.config/opencode-component-updater/components.json` and
`~/.local/state/opencode/component-updater/`. Override only when needed:

```text
OPENCODE_CONFIG_DIR
OPENCODE_COMPONENT_UPDATER_CONFIG
OPENCODE_COMPONENT_UPDATER_STATE_DIR
OPENCODE_COMPONENT_UPDATER_PLUGIN_DIR
OPENCODE_COMPONENT_UPDATER_REPOSITORY
```

## Commands

```text
opencode-component-updater check [--quiet]
opencode-component-updater upgrade [--best-effort] [--allow-running]
opencode-component-updater rollback [component-id] [--allow-running]
opencode-component-updater self-update [check|apply [commit]|rollback] [--allow-running]
opencode-component-updater status
opencode-component-updater doctor
```

- `check` is read-only for component targets. It refreshes metadata and retains
  a valid prior result when a later check fails. Checks run concurrently, up to
  `defaults.checkConcurrency`.
- `upgrade` force-checks, stages every strict update, then applies by
  journaled same-filesystem renames. Staging runs concurrently, up to
  `defaults.stageConcurrency`, while apply, rollback, and recovery stay
  sequential. `--best-effort` skips failed components and exits `4` for a
  partial result.
- `rollback` restores a verified backup. A component ID is required outside an
  interactive terminal.
- `self-update` is explicit. Ordinary `upgrade` never upgrades this updater.
- Every mutating command refuses to run while OpenCode is open **unless a live
  OpenCode V2 service answers `/api/info`**, in which case it applies
  immediately. `--allow-running` (or `OPENCODE_COMPONENT_UPDATER_ALLOW_RUNNING=1`)
  forces that behavior. It never sends a signal, kills a process, or
  starts/stops OpenCode.

## OpenCode Plugin

The plugin is a V2 CLI plugin, loaded from `cli.json`, with a no-op server
entrypoint so the package can also be listed in `opencode.json`.

```text
/component-status      list components and show one component's detail
/component-update      confirm, run `upgrade --allow-running`, reload locations
/component-rollback    pick a component, restore its last backup
```

`/component-update` streams updater progress into toasts and calls
`POST /api/location/reload` only after a clean exit, so the new code is live
without restarting OpenCode. A partial exit (`4`) or an error shows the failure
tail in a dialog and does not reload.

## Component Configuration

Use `config/components.example.json` as the schema-2 baseline. Inventory keeps
every discovered MCP and plugin, including disabled external components.
Component IDs carry kind and name (`mcp.example`, `plugin.example`), so compact
entries normally need only `enabled`, `target`, and `source`. Scope, safe policy
defaults, and empty command/path lists are inferred.

Concurrency defaults are `checkConcurrency: 16`, `stageConcurrency: 8`, and
`archiveConcurrency: 4`. Set any of them to `1` to reproduce the sequential
path. Staging and archiving never overlap apply, rollback, or recovery.

Built-in sources remove per-component command wiring:

```json
{
  "enabled": true,
  "target": "/tmp/example-home/.config/opencode/mcps/example",
  "source": {
    "type": "git",
    "url": "https://github.com/example/server.git",
    "path": "source",
    "track": "release"
  }
}
```

Supported source types:

- `git`: newest semver release by default, falling back to default-branch HEAD
  when no release exists. Set `track: "head"` to always track HEAD. `path` is
  required and names the owned checkout path below the component directory.
- `npm`: newest published version and registry integrity. `name` is required;
  optional `path` points at the wrapper/runtime containing `package.json`.
  This driver manages a dependency wrapper. A package-root installation uses a
  component script because replacing its source/build layout is package-specific.
- `pypi`: newest published version and SHA-256 artifact. `name` is required;
  optional `path` points at the Python runtime root.
- `script`: executable regular file `<target>/component-updater`, invoked as
  `check`, `update`, and `healthcheck`.

Script `check` writes the schema-1 result below. `update` writes staged output
and a schema-2 manifest. `healthcheck` verifies that stage before apply. The
script itself is protected from staged replacement. Component-specific logic
belongs in this file, never in updater core.

Legacy command arrays remain accepted during migration. A component is
eligible for automatic upgrade when:

```text
enabled == true
target is set
policy.apply == "manifest"
source.type is set or update.command is non-empty
```

Checks may write this exact JSON to `OPENCODE_UPDATER_CHECK_RESULT`:

```json
{
  "schemaVersion": 1,
  "status": "update-available",
  "current": "1.2.3",
  "latest": "1.2.4",
  "summary": "optional status text"
}
```

`current` and `latest` must be exact semver values or 40-character commits.
Update commands and scripts receive immutable plan, stage, manifest, current,
latest, and source environment variables. They write a schema-2 manifest naming
only owned paths. Symlinks, external hardlinks, protected paths, traversal, and
overlapping paths are rejected.

Backups are verified `.tar.gz` archives with SHA-256 metadata. Three archives
per component are retained.

## Updater Self-Update

`self-update check` resolves the exact `main` SHA from the configured
repository. `self-update apply` checks again, rejects a non-fast-forward,
builds the checked Go source, syntax-checks the read-only plugin payload, then
atomically stages both targets through the normal transaction journal.

The installed binary must be a regular unlinked file. The plugin target is
`$OPENCODE_COMPONENT_UPDATER_PLUGIN_DIR`, defaulting to:

```text
~/.config/opencode/plugins/opencode-component-updater
```

`self-update rollback` restores both targets from their matching verified
archives. Neither self-update path runs `npm install`, package lifecycle
scripts, or deployment commands.

## Development

```bash
npm run check
npm test
go test ./...
go vet ./...
go build -o /tmp/opencode/component-updater ./cmd/opencode-component-updater
```
