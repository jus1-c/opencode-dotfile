package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

type openCodeConfig struct {
	MCP     map[string]mcpEntry `json:"mcp"`
	Servers map[string]mcpEntry `json:"-"`
	Plugin  []any               `json:"plugin"`
	Plugins []any               `json:"plugins"`
}

type rawOpenCodeConfig struct {
	MCP     json.RawMessage `json:"mcp"`
	Plugin  []any           `json:"plugin"`
	Plugins []any           `json:"plugins"`
}

type tuiConfig struct {
	Plugin []any `json:"plugin"`
}

type cliConfig struct {
	Plugins []any `json:"plugins"`
}

type mcpEntry struct {
	Type    string `json:"type"`
	Command []any  `json:"command"`
}

func discoverComponents(configRoot string) (map[string]component, error) {
	openConfig, err := readOpenCodeConfig(filepath.Join(configRoot, "opencode.json"))
	if err != nil {
		return nil, err
	}
	var tui tuiConfig
	if err := readOptionalJSON(filepath.Join(configRoot, "tui.json"), &tui); err != nil {
		return nil, err
	}
	var cli cliConfig
	if err := readOptionalJSON(filepath.Join(configRoot, "cli.json"), &cli); err != nil {
		return nil, err
	}

	mcpRoot := filepath.Join(configRoot, "mcps")
	pluginRoot := filepath.Join(configRoot, "plugins")
	components := map[string]component{}
	// V2 nests servers under mcp.servers; V1 kept them directly under mcp.
	for name, entry := range openConfig.Servers {
		components["mcp."+name] = discoveredMCPServer(name, entry, mcpRoot)
	}
	for name, entry := range openConfig.MCP {
		if _, found := components["mcp."+name]; found {
			continue
		}
		components["mcp."+name] = discoveredMCPServer(name, entry, mcpRoot)
	}
	// V2 uses `plugins` in opencode.json and cli.json; V1 used `plugin` plus tui.json.
	specs := append([]any{}, openConfig.Plugins...)
	specs = append(specs, cli.Plugins...)
	specs = append(specs, openConfig.Plugin...)
	specs = append(specs, tui.Plugin...)
	for _, raw := range specs {
		spec := pluginSpec(raw)
		target := ownerTarget(localPath(spec, configRoot), pluginRoot)
		name := pluginName(spec, target)
		id := "plugin." + name
		if _, found := components[id]; !found {
			components[id] = discoveredComponent("plugin", name, target)
		}
	}
	for _, root := range []struct {
		kind string
		path string
	}{
		{kind: "mcp", path: mcpRoot},
		{kind: "plugin", path: pluginRoot},
	} {
		entries, err := os.ReadDir(root.path)
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, err
		}
		for _, entry := range entries {
			if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
				continue
			}
			id := root.kind + "." + entry.Name()
			if _, found := components[id]; !found {
				target := filepath.Join(root.path, entry.Name())
				components[id] = discoveredComponent(root.kind, entry.Name(), &target)
			}
		}
	}
	return components, nil
}

func discoveredMCPServer(name string, entry mcpEntry, mcpRoot string) component {
	var target *string
	if entry.Type == "local" {
		target = commandOwner(entry.Command, mcpRoot)
	}
	return discoveredComponent("mcp", name, target)
}

// readOpenCodeConfig accepts both shapes of the mcp block, including a file
// that mixes them: V2 nests servers under mcp.servers while V1 kept them
// directly under mcp.
func readOpenCodeConfig(path string) (openCodeConfig, error) {
	var raw rawOpenCodeConfig
	if err := readOptionalJSON(path, &raw); err != nil {
		return openCodeConfig{}, err
	}
	result := openCodeConfig{Plugin: raw.Plugin, Plugins: raw.Plugins, MCP: map[string]mcpEntry{}}
	if len(raw.MCP) == 0 {
		return result, nil
	}
	var block map[string]json.RawMessage
	if err := json.Unmarshal(raw.MCP, &block); err != nil {
		return openCodeConfig{}, fmt.Errorf("parse %s: %w", path, err)
	}
	for name, contents := range block {
		if name == "servers" {
			if err := json.Unmarshal(contents, &result.Servers); err != nil {
				return openCodeConfig{}, fmt.Errorf("parse %s mcp.servers: %w", path, err)
			}
			continue
		}
		var entry mcpEntry
		if err := json.Unmarshal(contents, &entry); err != nil {
			return openCodeConfig{}, fmt.Errorf("parse %s mcp.%s: %w", path, name, err)
		}
		result.MCP[name] = entry
	}
	return result, nil
}

func readOptionalJSON(path string, destination any) error {
	contents, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := json.Unmarshal(contents, destination); err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}
	return nil
}

func discoveredComponent(kind, name string, target *string) component {
	item := component{Scope: "global", Kind: kind, Name: name, Target: target}
	item.Policy.Apply = "none"
	if target != nil {
		item.Policy.Apply = "manual"
	}
	item.Policy.Dirty = "refuse"
	item.Policy.AllowedPaths = []string{}
	item.Policy.ProtectedPaths = []string{}
	item.Check.Command = []string{}
	item.Update.Command = []string{}
	item.Update.Healthcheck = []string{}
	return item
}

func commandOwner(command []any, root string) *string {
	owners := map[string]struct{}{}
	for _, raw := range command {
		path, ok := raw.(string)
		if !ok {
			continue
		}
		candidate := localPath(path, root)
		if owner := ownerTarget(candidate, root); owner != nil {
			owners[*owner] = struct{}{}
		}
	}
	if len(owners) != 1 {
		return nil
	}
	for owner := range owners {
		return &owner
	}
	return nil
}

func pluginSpec(raw any) string {
	if value, ok := raw.(string); ok {
		return value
	}
	if values, ok := raw.([]any); ok && len(values) > 0 {
		if value, ok := values[0].(string); ok {
			return value
		}
	}
	// V2 object form: {"package": "...", "options": {...}}
	if object, ok := raw.(map[string]any); ok {
		if value, ok := object["package"].(string); ok {
			return value
		}
	}
	return ""
}

func pluginName(spec string, target *string) string {
	if target != nil {
		return filepath.Base(*target)
	}
	name := strings.TrimPrefix(spec, "@")
	name = strings.NewReplacer("/", "-", "\\", "-").Replace(name)
	if name == "" {
		return "unknown"
	}
	return name
}

func localPath(spec, root string) string {
	if spec == "" {
		return ""
	}
	if strings.HasPrefix(spec, "file://") {
		parsed, err := url.Parse(spec)
		if err != nil || parsed.Path == "" {
			return ""
		}
		return filepath.Clean(parsed.Path)
	}
	if filepath.IsAbs(spec) {
		return filepath.Clean(spec)
	}
	if strings.HasPrefix(spec, ".") {
		return filepath.Clean(filepath.Join(root, spec))
	}
	return ""
}

func ownerTarget(candidate, root string) *string {
	if candidate == "" || !within(root, candidate) {
		return nil
	}
	relative, err := filepath.Rel(root, candidate)
	if err != nil || relative == "." {
		return nil
	}
	first := strings.Split(relative, string(filepath.Separator))[0]
	if first == "" || first == "." || first == ".." {
		return nil
	}
	target := filepath.Join(root, first)
	return &target
}

func within(root, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	return relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative)
}
