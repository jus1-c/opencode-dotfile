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
	MCP    map[string]mcpEntry `json:"mcp"`
	Plugin []any               `json:"plugin"`
}

type tuiConfig struct {
	Plugin []any `json:"plugin"`
}

type mcpEntry struct {
	Type    string `json:"type"`
	Command []any  `json:"command"`
}

func discoverComponents(configRoot string) (map[string]component, error) {
	var openConfig openCodeConfig
	if err := readOptionalJSON(filepath.Join(configRoot, "opencode.json"), &openConfig); err != nil {
		return nil, err
	}
	var tui tuiConfig
	if err := readOptionalJSON(filepath.Join(configRoot, "tui.json"), &tui); err != nil {
		return nil, err
	}

	mcpRoot := filepath.Join(configRoot, "mcps")
	pluginRoot := filepath.Join(configRoot, "plugins")
	components := map[string]component{}
	for name, entry := range openConfig.MCP {
		var target *string
		if entry.Type == "local" {
			target = commandOwner(entry.Command, mcpRoot)
		}
		components["mcp."+name] = discoveredComponent("mcp", name, target)
	}
	for _, raw := range append(openConfig.Plugin, tui.Plugin...) {
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
	item.Source.Mode = "auto"
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
