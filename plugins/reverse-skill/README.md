# Reverse skill

The installer checks out the pinned upstream revision under `repo/`. The
`skills/reverse-skill-router` symlink exposes the router and its supporting
files to OpenCode. `opencode-component-updater` manages subsequent updates.

Reverse-engineering tools are separate prerequisites. Run
`repo/skills/scripts/refresh-tool-index.sh` to inspect their availability.
