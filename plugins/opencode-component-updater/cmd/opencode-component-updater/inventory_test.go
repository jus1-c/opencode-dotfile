package main

import (
	"os"
	"path/filepath"
	"testing"
)

func writeConfigFile(t *testing.T, path, contents string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestDiscoverComponentsReadsV2Shapes(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "mcps", "local-mcp"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "plugins", "local-plugin"), 0o700); err != nil {
		t.Fatal(err)
	}
	writeConfigFile(t, filepath.Join(root, "opencode.json"), `{
		"plugins": ["file://`+filepath.Join(root, "plugins", "local-plugin")+`", {"package": "@scope/v2-plugin"}],
		"mcp": {
			"servers": {
				"codegraph": {"type": "local", "command": ["codegraph", "serve", "--mcp"]},
				"owned": {"type": "local", "command": ["`+filepath.Join(root, "mcps", "local-mcp", ".venv", "bin", "server")+`"]}
			}
		}
	}`)
	writeConfigFile(t, filepath.Join(root, "cli.json"), `{"plugins": ["file://`+filepath.Join(root, "plugins", "local-plugin")+`"]}`)

	components, err := discoverComponents(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"mcp.codegraph", "mcp.owned", "plugin.local-plugin", "plugin.scope-v2-plugin"} {
		if _, found := components[id]; !found {
			t.Fatalf("missing component %q in %v", id, components)
		}
	}
	if target := components["mcp.owned"].Target; target == nil || *target != filepath.Join(root, "mcps", "local-mcp") {
		t.Fatalf("unexpected owner target: %v", target)
	}
	if target := components["mcp.codegraph"].Target; target != nil {
		t.Fatalf("system-managed MCP must have no target, got %v", *target)
	}
}

func TestDiscoverComponentsStillReadsLegacyShapes(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "plugins", "legacy-plugin"), 0o700); err != nil {
		t.Fatal(err)
	}
	writeConfigFile(t, filepath.Join(root, "opencode.json"), `{
		"plugin": ["file://`+filepath.Join(root, "plugins", "legacy-plugin")+`"],
		"mcp": {"legacy": {"type": "local", "command": ["server"]}}
	}`)
	writeConfigFile(t, filepath.Join(root, "tui.json"), `{"plugin": ["file://`+filepath.Join(root, "plugins", "legacy-plugin")+`"]}`)

	components, err := discoverComponents(root)
	if err != nil {
		t.Fatal(err)
	}
	if _, found := components["mcp.legacy"]; !found {
		t.Fatal("legacy mcp entry was not discovered")
	}
	if _, found := components["plugin.legacy-plugin"]; !found {
		t.Fatal("legacy plugin entry was not discovered")
	}
}

func TestDiscoverComponentsReadsMixedMCPShapes(t *testing.T) {
	root := t.TempDir()
	writeConfigFile(t, filepath.Join(root, "opencode.json"), `{
		"mcp": {
			"legacy-server": {"type": "local", "command": ["legacy"]},
			"servers": {"v2-server": {"type": "local", "command": ["v2"]}}
		}
	}`)

	components, err := discoverComponents(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"mcp.legacy-server", "mcp.v2-server"} {
		if _, found := components[id]; !found {
			t.Fatalf("missing %q in %v", id, components)
		}
	}
	if _, found := components["mcp.servers"]; found {
		t.Fatal("the servers wrapper must not become a component")
	}
}

func TestPluginSpecAcceptsV2Object(t *testing.T) {
	object := map[string]any{"package": "@scope/name", "options": map[string]any{"strict": true}}
	if got := pluginSpec(object); got != "@scope/name" {
		t.Fatalf("pluginSpec = %q", got)
	}
	if got := pluginSpec("plain"); got != "plain" {
		t.Fatalf("pluginSpec = %q", got)
	}
	if got := pluginSpec([]any{"tuple", map[string]any{}}); got != "tuple" {
		t.Fatalf("pluginSpec = %q", got)
	}
}
