package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const configSchemaVersion = 2
const stateSchemaVersion = 2

type paths struct {
	OpenCodeConfigRoot string
	ConfigPath         string
	StateRoot          string
	StatePath          string
	BackupRoot         string
	JournalPath        string
	LockPath           string
	RunsRoot           string
	TmpRoot            string
	PluginRoot         string
}

type defaults struct {
	CheckIntervalHours int `json:"checkIntervalHours"`
	CheckTimeoutMS     int `json:"checkTimeoutMs"`
	UpdateTimeoutMS    int `json:"updateTimeoutMs"`
	MaxOutputBytes     int `json:"maxOutputBytes"`
}

type config struct {
	SchemaVersion int                  `json:"schemaVersion"`
	Defaults      defaults             `json:"defaults"`
	Components    map[string]component `json:"components"`
}

type component struct {
	Scope   string  `json:"scope"`
	Kind    string  `json:"kind"`
	Name    string  `json:"name"`
	Target  *string `json:"target"`
	Enabled bool    `json:"enabled"`
	Source  struct {
		Mode string `json:"mode"`
	} `json:"source"`
	Policy struct {
		Apply          string   `json:"apply"`
		Dirty          string   `json:"dirty"`
		AllowedPaths   []string `json:"allowedPaths"`
		ProtectedPaths []string `json:"protectedPaths"`
	} `json:"policy"`
	Check struct {
		Command []string `json:"command"`
	} `json:"check"`
	Update struct {
		Command     []string `json:"command"`
		Healthcheck []string `json:"healthcheck"`
	} `json:"update"`
}

type sourceInfo struct {
	Type    string `json:"type"`
	Name    string `json:"name,omitempty"`
	URL     string `json:"url,omitempty"`
	Root    string `json:"root,omitempty"`
	Current string `json:"current,omitempty"`
	Dirty   bool   `json:"dirty,omitempty"`
}

// artifactInfo pins a published release download so apply cannot silently use a
// different build than the one the check resolved.
type artifactInfo struct {
	URL       string `json:"url,omitempty"`
	Integrity string `json:"integrity,omitempty"`
}

type checkResult struct {
	CheckedAt         int64         `json:"checkedAt"`
	Status            string        `json:"status"`
	Summary           string        `json:"summary"`
	Current           string        `json:"current,omitempty"`
	Latest            string        `json:"latest,omitempty"`
	Source            *sourceInfo   `json:"source,omitempty"`
	Artifact          *artifactInfo `json:"artifact,omitempty"`
	// SourceCommit is provenance only. Registry releases are identified by their
	// published version and artifact, never by this commit.
	SourceCommit      string `json:"sourceCommit,omitempty"`
	SourceFingerprint string `json:"sourceFingerprint,omitempty"`
	ConfigFingerprint string `json:"configFingerprint,omitempty"`
}

type appliedRecord struct {
	AppliedAt int64  `json:"appliedAt"`
	From      string `json:"from,omitempty"`
	To        string `json:"to,omitempty"`
	RunID     string `json:"runId,omitempty"`
	Backup    string `json:"backup,omitempty"`
}

type componentState struct {
	LastAttempt *checkResult   `json:"lastAttempt,omitempty"`
	LastGood    *checkResult   `json:"lastGood,omitempty"`
	LastApplied *appliedRecord `json:"lastApplied,omitempty"`
}

type state struct {
	SchemaVersion int                       `json:"schemaVersion"`
	Components    map[string]componentState `json:"components"`
	SelfUpdate    *componentState           `json:"selfUpdate,omitempty"`
}

func resolvePaths() (paths, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return paths{}, err
	}
	configHome := envOr("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	stateHome := envOr("XDG_STATE_HOME", filepath.Join(home, ".local", "state"))
	opencodeRoot := envOr("OPENCODE_CONFIG_DIR", filepath.Join(configHome, "opencode"))
	configPath := envOr("OPENCODE_COMPONENT_UPDATER_CONFIG", filepath.Join(opencodeRoot, "component-updater", "components.json"))
	stateRoot := envOr("OPENCODE_COMPONENT_UPDATER_STATE_DIR", filepath.Join(stateHome, "opencode", "component-updater"))
	pluginRoot := envOr("OPENCODE_COMPONENT_UPDATER_PLUGIN_DIR", filepath.Join(opencodeRoot, "plugins", "opencode-component-updater"))

	for _, value := range []*string{&opencodeRoot, &configPath, &stateRoot, &pluginRoot} {
		absolute, err := filepath.Abs(*value)
		if err != nil {
			return paths{}, err
		}
		*value = absolute
	}
	return paths{
		OpenCodeConfigRoot: opencodeRoot,
		ConfigPath:         configPath,
		StateRoot:          stateRoot,
		StatePath:          filepath.Join(stateRoot, "state.json"),
		BackupRoot:         filepath.Join(stateRoot, "backups"),
		JournalPath:        filepath.Join(stateRoot, "journal.json"),
		LockPath:           filepath.Join(stateRoot, "operation.lock"),
		RunsRoot:           filepath.Join(stateRoot, "runs"),
		TmpRoot:            filepath.Join(stateRoot, "tmp"),
		PluginRoot:         pluginRoot,
	}, nil
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func samePath(left, right string) bool {
	left, leftErr := filepath.Abs(left)
	right, rightErr := filepath.Abs(right)
	return leftErr == nil && rightErr == nil && filepath.Clean(left) == filepath.Clean(right)
}

func pathOverlaps(left, right string) bool {
	left, leftErr := filepath.Abs(left)
	right, rightErr := filepath.Abs(right)
	if leftErr != nil || rightErr != nil {
		return false
	}
	return within(filepath.Clean(left), filepath.Clean(right)) || within(filepath.Clean(right), filepath.Clean(left))
}

func defaultDefaults() defaults {
	return defaults{
		CheckIntervalHours: 24,
		CheckTimeoutMS:     60_000,
		UpdateTimeoutMS:    1_800_000,
		MaxOutputBytes:     65_536,
	}
}

func defaultConfig() config {
	return config{
		SchemaVersion: configSchemaVersion,
		Defaults:      defaultDefaults(),
		Components:    map[string]component{},
	}
}

func normalizeConfig(input config) (config, error) {
	if input.SchemaVersion != 1 && input.SchemaVersion != configSchemaVersion {
		return config{}, fmt.Errorf("unsupported config schema version: %d", input.SchemaVersion)
	}
	output := input
	output.SchemaVersion = configSchemaVersion
	if output.Components == nil {
		output.Components = map[string]component{}
	}
	fallback := defaultDefaults()
	if output.Defaults.CheckIntervalHours <= 0 {
		output.Defaults.CheckIntervalHours = fallback.CheckIntervalHours
	}
	if output.Defaults.CheckTimeoutMS <= 0 {
		output.Defaults.CheckTimeoutMS = fallback.CheckTimeoutMS
	}
	if output.Defaults.UpdateTimeoutMS <= 0 {
		output.Defaults.UpdateTimeoutMS = fallback.UpdateTimeoutMS
	}
	if output.Defaults.MaxOutputBytes <= 0 {
		output.Defaults.MaxOutputBytes = fallback.MaxOutputBytes
	}
	for id, item := range output.Components {
		if id == "" || item.Name == "" {
			return config{}, fmt.Errorf("component id and name are required")
		}
		if item.Kind != "mcp" && item.Kind != "plugin" {
			return config{}, fmt.Errorf("component %s must have kind mcp or plugin", id)
		}
		if item.Target != nil && *item.Target == "" {
			return config{}, fmt.Errorf("component %s has an empty target", id)
		}
		if item.Scope == "" {
			item.Scope = "global"
		}
		if item.Source.Mode == "" {
			item.Source.Mode = "auto"
		}
		if item.Policy.Apply == "" {
			item.Policy.Apply = "manual"
		}
		if item.Policy.Apply != "manifest" && item.Policy.Apply != "manual" && item.Policy.Apply != "none" {
			return config{}, fmt.Errorf("component %s has unsupported apply policy", id)
		}
		if item.Policy.Dirty == "" {
			item.Policy.Dirty = "refuse"
		}
		if item.Policy.Dirty != "allow" && item.Policy.Dirty != "refuse" {
			return config{}, fmt.Errorf("component %s has unsupported dirty policy", id)
		}
		if item.Policy.AllowedPaths == nil {
			item.Policy.AllowedPaths = []string{}
		}
		if item.Policy.ProtectedPaths == nil {
			item.Policy.ProtectedPaths = []string{}
		}
		if item.Check.Command == nil {
			item.Check.Command = []string{}
		}
		if item.Update.Command == nil {
			item.Update.Command = []string{}
		}
		if item.Update.Healthcheck == nil {
			item.Update.Healthcheck = []string{}
		}
		if err := validateCommand(item.Check.Command); err != nil && len(item.Check.Command) > 0 {
			return config{}, fmt.Errorf("component %s check: %w", id, err)
		}
		if err := validateCommand(item.Update.Command); err != nil && len(item.Update.Command) > 0 {
			return config{}, fmt.Errorf("component %s update: %w", id, err)
		}
		if err := validateCommand(item.Update.Healthcheck); err != nil && len(item.Update.Healthcheck) > 0 {
			return config{}, fmt.Errorf("component %s healthcheck: %w", id, err)
		}
		output.Components[id] = item
	}
	return output, nil
}

func loadConfig(path string) (config, bool, error) {
	contents, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return config{}, false, nil
	}
	if err != nil {
		return config{}, false, err
	}
	var input config
	if err := json.Unmarshal(contents, &input); err != nil {
		return config{}, false, fmt.Errorf("parse config: %w", err)
	}
	normalized, err := normalizeConfig(input)
	return normalized, true, err
}

func saveConfig(path string, value config) error {
	normalized, err := normalizeConfig(value)
	if err != nil {
		return err
	}
	return writeJSONAtomic(path, normalized)
}

func ensureConfig(value paths) (config, error) {
	loaded, exists, err := loadConfig(value.ConfigPath)
	if err != nil {
		return config{}, err
	}
	changed := false
	if exists {
		contents, err := os.ReadFile(value.ConfigPath)
		if err != nil {
			return config{}, err
		}
		var raw struct {
			SchemaVersion int `json:"schemaVersion"`
		}
		if err := json.Unmarshal(contents, &raw); err != nil {
			return config{}, fmt.Errorf("parse config: %w", err)
		}
		changed = raw.SchemaVersion != configSchemaVersion
	}
	if !exists {
		for _, legacy := range []string{
			filepath.Join(value.OpenCodeConfigRoot, "plugins", "component-updater", "config", "components.json"),
			filepath.Join(value.OpenCodeConfigRoot, "plugins", "opencode-component-updater", "config", "components.json"),
		} {
			loaded, exists, err = loadConfig(legacy)
			if err != nil {
				return config{}, err
			}
			if exists {
				changed = true
				break
			}
		}
		if !exists {
			loaded = defaultConfig()
			changed = true
		}
	}
	discovered, err := discoverComponents(value.OpenCodeConfigRoot)
	if err != nil {
		return config{}, err
	}
	for id, item := range discovered {
		if _, ok := loaded.Components[id]; !ok {
			loaded.Components[id] = item
			changed = true
		}
	}
	if changed || loaded.SchemaVersion != configSchemaVersion {
		if err := saveConfig(value.ConfigPath, loaded); err != nil {
			return config{}, err
		}
	}
	return loaded, nil
}

func loadState(path string) (state, error) {
	contents, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return state{SchemaVersion: stateSchemaVersion, Components: map[string]componentState{}}, nil
	}
	if err != nil {
		return state{}, err
	}
	var raw struct {
		SchemaVersion int                        `json:"schemaVersion"`
		Components    map[string]json.RawMessage `json:"components"`
		SelfUpdate    json.RawMessage            `json:"selfUpdate"`
	}
	if err := json.Unmarshal(contents, &raw); err != nil {
		return state{}, fmt.Errorf("parse state: %w", err)
	}
	if raw.SchemaVersion != 1 && raw.SchemaVersion != stateSchemaVersion {
		return state{}, fmt.Errorf("unsupported state schema version: %d", raw.SchemaVersion)
	}
	output := state{SchemaVersion: stateSchemaVersion, Components: map[string]componentState{}}
	for key, item := range raw.Components {
		if raw.SchemaVersion == stateSchemaVersion {
			var cached componentState
			if err := json.Unmarshal(item, &cached); err != nil {
				continue
			}
			output.Components[key] = cached
			continue
		}
		var legacy struct {
			Status        string `json:"status"`
			Summary       string `json:"summary"`
			LastCheckedAt int64  `json:"lastCheckedAt"`
			Current       string `json:"current"`
			Latest        string `json:"latest"`
		}
		if json.Unmarshal(item, &legacy) == nil && isGoodStatus(legacy.Status) && validExact(legacy.Current) && validExact(legacy.Latest) {
			output.Components[key] = componentState{LastGood: &checkResult{
				CheckedAt: legacy.LastCheckedAt,
				Status:    legacy.Status,
				Summary:   legacy.Summary,
				Current:   legacy.Current,
				Latest:    legacy.Latest,
			}}
		}
	}
	if raw.SchemaVersion == stateSchemaVersion && len(raw.SelfUpdate) != 0 && string(raw.SelfUpdate) != "null" {
		var self componentState
		if json.Unmarshal(raw.SelfUpdate, &self) == nil {
			output.SelfUpdate = &self
		}
	}
	return output, nil
}

func saveState(path string, value state) error {
	if value.Components == nil {
		value.Components = map[string]componentState{}
	}
	value.SchemaVersion = stateSchemaVersion
	return writeJSONAtomic(path, value)
}

func writeJSONAtomic(path string, value any) error {
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(directory, ".component-updater-*.tmp")
	if err != nil {
		return err
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return err
	}
	encoder := json.NewEncoder(temporary)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporaryName, path); err != nil {
		return err
	}
	return syncDirectory(directory)
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

func componentKey(id string, item component) string {
	target := "external"
	if item.Target != nil {
		target = *item.Target
	}
	scope := item.Scope
	if scope == "" {
		scope = "global"
	}
	return scope + ":" + id + ":" + target
}

func componentFingerprint(item component) string {
	encoded, _ := json.Marshal(item)
	return hashBytes(encoded)
}

func sourceFingerprint(source sourceInfo) string {
	return hashBytes([]byte(strings.Join([]string{source.Type, source.Name, source.URL, source.Root}, "\x00")))
}

func hashBytes(value []byte) string {
	digest := sha256.Sum256(value)
	return "sha256:" + hex.EncodeToString(digest[:])
}

func sortedComponentIDs(components map[string]component) []string {
	ids := make([]string, 0, len(components))
	for id := range components {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func nowMillis() int64 {
	return time.Now().UnixMilli()
}
