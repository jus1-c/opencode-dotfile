package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestDiscoverComponentsReadsNativeV2Config(t *testing.T) {
	root := t.TempDir()
	mcpRoot := filepath.Join(root, "mcps", "example")
	pluginRoot := filepath.Join(root, "plugins", "example-plugin")
	if err := os.MkdirAll(mcpRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(pluginRoot, 0o700); err != nil {
		t.Fatal(err)
	}

	openCodeConfig := map[string]any{
		"mcp": map[string]any{
			"servers": map[string]any{
				"example": map[string]any{
					"type":    "local",
					"command": []string{filepath.Join(mcpRoot, "bin", "example")},
				},
			},
		},
		"plugins": []string{"file://" + filepath.Join(pluginRoot, "index.js")},
	}
	writeJSON := func(path string, value any) {
		t.Helper()
		contents, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, contents, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	writeJSON(filepath.Join(root, "opencode.json"), openCodeConfig)
	writeJSON(filepath.Join(root, "cli.json"), map[string]any{
		"plugins": []string{"file://" + filepath.Join(pluginRoot, "index.js")},
	})

	components, err := discoverComponents(root)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := components["mcp.example"]; !ok {
		t.Fatalf("native V2 MCP was not discovered: %#v", components)
	}
	if _, ok := components["plugin.example-plugin"]; !ok {
		t.Fatalf("native V2 plugin was not discovered: %#v", components)
	}
}
