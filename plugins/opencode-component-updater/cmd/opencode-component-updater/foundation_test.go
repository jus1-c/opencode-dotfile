package main

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	progressbar "charm.land/bubbles/v2/progress"
	"charm.land/bubbles/v2/spinner"
	"github.com/charmbracelet/x/ansi"
)

func TestHumanTimestampIncludesAbsoluteAndRelativeTime(t *testing.T) {
	stamp := time.Now().UTC().Add(-4*time.Hour - 36*time.Minute)
	value := humanTimestamp(stamp.UnixMilli())
	if !strings.Contains(value, stamp.Format("Jan 2, 2006 15:04 UTC")) || !strings.Contains(value, "4 hours and 36 minutes ago") {
		t.Fatalf("unexpected human timestamp: %q", value)
	}
}

func TestOperationViewIncludesProgressAndLogs(t *testing.T) {
	model := operationModel{title: "Upgrade", width: 80, height: 24, latest: progress{Phase: "apply", Component: "mcp.example", Detail: "swapping files", Current: 1, Total: 2}, logs: []string{"12:00:00  APPLY  mcp.example  swapping files"}}
	model.bar = progressbar.New(progressbar.WithWidth(60))
	model.spinner = spinner.New()
	view := ansi.Strip(model.View().Content)
	for _, expected := range []string{"Upgrade", "APPLY", "mcp.example", "50%", "Logs", "swapping files"} {
		if !strings.Contains(view, expected) {
			t.Fatalf("operation view missing %q:\n%s", expected, view)
		}
	}
}

func TestCheckPreservesLastGoodAfterFailure(t *testing.T) {
	root := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(root, "config"))
	t.Setenv("XDG_STATE_HOME", filepath.Join(root, "state"))
	t.Setenv("OPENCODE_CONFIG_DIR", filepath.Join(root, "opencode"))
	paths, err := resolvePaths()
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(root, "component")
	if err := os.MkdirAll(target, 0o700); err != nil {
		t.Fatal(err)
	}
	item := discoveredComponent("plugin", "example", &target)
	item.Enabled = true
	item.Check.Command = []string{"sh", "-c", "printf '{\"schemaVersion\":1,\"status\":\"update-available\",\"current\":\"1.0.0\",\"latest\":\"1.1.0\"}' > \"$OPENCODE_UPDATER_CHECK_RESULT\""}
	if err := saveConfig(paths.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaultDefaults(), Components: map[string]component{"plugin.example": item}}); err != nil {
		t.Fatal(err)
	}
	if _, err := checkAll(context.Background(), paths, nil); err != nil {
		t.Fatal(err)
	}
	item.Check.Command = []string{"sh", "-c", "exit 1"}
	if err := saveConfig(paths.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaultDefaults(), Components: map[string]component{"plugin.example": item}}); err != nil {
		t.Fatal(err)
	}
	if _, err := checkAll(context.Background(), paths, nil); err != nil {
		t.Fatal(err)
	}
	state, err := loadState(paths.StatePath)
	if err != nil {
		t.Fatal(err)
	}
	entry := state.Components[componentKey("plugin.example", item)]
	if entry.LastGood == nil || entry.LastGood.Latest != "1.1.0" {
		t.Fatalf("last good result lost: %#v", entry.LastGood)
	}
	if entry.LastAttempt == nil || entry.LastAttempt.Status != "check-error" {
		t.Fatalf("last attempt not recorded: %#v", entry.LastAttempt)
	}
}

func TestResolvePathsUsesExternalConfigByDefault(t *testing.T) {
	root := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(root, "config"))
	t.Setenv("XDG_STATE_HOME", filepath.Join(root, "state"))
	t.Setenv("OPENCODE_CONFIG_DIR", "")
	t.Setenv("OPENCODE_COMPONENT_UPDATER_CONFIG", "")
	paths, err := resolvePaths()
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(root, "config", "opencode-component-updater", "components.json")
	if paths.ConfigPath != want {
		t.Fatalf("config path = %q, want %q", paths.ConfigPath, want)
	}
}

func TestGitReleaseDefaultsAndFallsBackToHead(t *testing.T) {
	root := t.TempDir()
	repository := filepath.Join(root, "repository")
	if err := os.MkdirAll(repository, 0o700); err != nil {
		t.Fatal(err)
	}
	runTestCommand(t, repository, "git", "init")
	runTestCommand(t, repository, "git", "config", "user.email", "test@example.com")
	runTestCommand(t, repository, "git", "config", "user.name", "Test")
	runTestCommand(t, repository, "git", "checkout", "-b", "main")
	if err := os.WriteFile(filepath.Join(repository, "version"), []byte("one"), 0o600); err != nil {
		t.Fatal(err)
	}
	runTestCommand(t, repository, "git", "add", ".")
	runTestCommand(t, repository, "git", "commit", "-m", "one")
	first := runTestCommand(t, repository, "git", "rev-parse", "HEAD")
	runTestCommand(t, repository, "git", "tag", "v1.0.0")
	if err := os.WriteFile(filepath.Join(repository, "version"), []byte("two"), 0o600); err != nil {
		t.Fatal(err)
	}
	runTestCommand(t, repository, "git", "add", ".")
	runTestCommand(t, repository, "git", "commit", "-m", "two")
	head := runTestCommand(t, repository, "git", "rev-parse", "HEAD")

	latest, label, err := gitLatest(context.Background(), repository, "release", defaultDefaults())
	if err != nil || latest != first || !strings.HasPrefix(label, "v1.0.0") {
		t.Fatalf("release selection failed: %s %s %v", latest, label, err)
	}
	latest, _, err = gitLatest(context.Background(), repository, "head", defaultDefaults())
	if err != nil || latest != head {
		t.Fatalf("HEAD selection failed: %s %v", latest, err)
	}
	runTestCommand(t, repository, "git", "tag", "-d", "v1.0.0")
	latest, _, err = gitLatest(context.Background(), repository, "release", defaultDefaults())
	if err != nil || latest != head {
		t.Fatalf("release fallback failed: %s %v", latest, err)
	}
}

func TestCompactConfigInfersIdentityAndDefaults(t *testing.T) {
	target := t.TempDir()
	input := config{SchemaVersion: configSchemaVersion, Components: map[string]component{"mcp.example": {Target: &target, Enabled: true}}}
	item := input.Components["mcp.example"]
	item.Source.Type = "script"
	input.Components["mcp.example"] = item
	normalized, err := normalizeConfig(input)
	if err != nil {
		t.Fatal(err)
	}
	item = normalized.Components["mcp.example"]
	if item.Kind != "mcp" || item.Name != "example" || item.Scope != "global" || item.Policy.Apply != "manifest" || item.Policy.Dirty != "refuse" {
		t.Fatalf("compact defaults not applied: %#v", item)
	}
}

func TestConfiguredNPMRejectsPackageRootInstall(t *testing.T) {
	target := t.TempDir()
	if err := os.WriteFile(filepath.Join(target, "package.json"), []byte(`{"name":"example","version":"1.0.0"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	item := discoveredComponent("plugin", "example", &target)
	item.Source.Type = "npm"
	item.Source.Name = "example"
	if _, err := configuredSource(context.Background(), item, target); err == nil || !strings.Contains(err.Error(), "component script") {
		t.Fatalf("package-root install accepted: %v", err)
	}
}

func TestConfiguredGitRejectsWrongOrigin(t *testing.T) {
	target := t.TempDir()
	source := filepath.Join(target, "source")
	if err := os.MkdirAll(source, 0o700); err != nil {
		t.Fatal(err)
	}
	runTestCommand(t, source, "git", "init")
	runTestCommand(t, source, "git", "config", "user.email", "test@example.com")
	runTestCommand(t, source, "git", "config", "user.name", "Test")
	runTestCommand(t, source, "git", "remote", "add", "origin", "https://example.invalid/wrong.git")
	if err := os.WriteFile(filepath.Join(source, "file"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	runTestCommand(t, source, "git", "add", ".")
	runTestCommand(t, source, "git", "commit", "-m", "source")
	item := discoveredComponent("mcp", "example", &target)
	item.Source.Type = "git"
	item.Source.URL = "https://example.invalid/right.git"
	item.Source.Path = "source"
	if _, err := configuredSource(context.Background(), item, target); err == nil || !strings.Contains(err.Error(), "origin") {
		t.Fatalf("wrong origin accepted: %v", err)
	}
}

func TestConventionalComponentScriptRunsLifecycle(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	target := filepath.Join(root, "component")
	if err := os.MkdirAll(filepath.Join(target, "runtime"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "runtime", "version.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	script := `#!/bin/sh
set -eu
case "$1" in
check) printf '{"schemaVersion":1,"status":"update-available","current":"1.0.0","latest":"1.1.0"}' > "$OPENCODE_UPDATER_CHECK_RESULT" ;;
update) mkdir -p "$OPENCODE_UPDATER_STAGE/runtime"; printf new > "$OPENCODE_UPDATER_STAGE/runtime/version.txt"; printf '{"schemaVersion":2,"planSha256":"%s","paths":["runtime"]}' "$OPENCODE_UPDATER_PLAN_SHA256" > "$OPENCODE_UPDATER_MANIFEST" ;;
healthcheck) test "$(cat "$OPENCODE_UPDATER_STAGE/runtime/version.txt")" = new ;;
esac
`
	if err := os.WriteFile(filepath.Join(target, "component-updater"), []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	value := testPaths(root)
	item := discoveredComponent("plugin", "example", &target)
	item.Enabled = true
	item.Source.Type = "script"
	item.Policy.Apply = "manifest"
	if err := saveConfig(value.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaultDefaults(), Components: map[string]component{"plugin.example": item}}); err != nil {
		t.Fatal(err)
	}
	if err := upgradeAll(context.Background(), value, false, nil); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(filepath.Join(target, "runtime", "version.txt"))
	if err != nil || string(contents) != "new" {
		t.Fatalf("script update failed: %q %v", contents, err)
	}
	if _, err := os.Stat(filepath.Join(target, "component-updater")); err != nil {
		t.Fatalf("component script was overwritten: %v", err)
	}
}

func TestOpenCodeProcessClassification(t *testing.T) {
	if !isOpenCodeProcess("/tmp/example-home/.opencode/bin/opencode", "other", true) {
		t.Fatal("expected exact executable name to match")
	}
	if isOpenCodeProcess("/usr/bin/not-opencode", "opencode", true) {
		t.Fatal("executable must win when available")
	}
	if !isOpenCodeProcess("", "opencode", false) {
		t.Fatal("expected comm fallback to match")
	}
	if isOpenCodeProcess("/usr/bin/opencode-wrapper", "opencode-wrapper", true) {
		t.Fatal("substring match must not classify as OpenCode")
	}
}

func TestStrictUpgradeStagesThenAppliesAndArchives(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	target := filepath.Join(root, "component")
	if err := os.MkdirAll(filepath.Join(target, "runtime"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "runtime", "version.txt"), []byte("old\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	value := testPaths(root)
	item := discoveredComponent("plugin", "example", &target)
	item.Enabled = true
	item.Policy.Apply = "manifest"
	item.Policy.AllowedPaths = []string{"runtime"}
	item.Check.Command = []string{"sh", "-c", "printf '{\"schemaVersion\":1,\"status\":\"update-available\",\"current\":\"1.0.0\",\"latest\":\"1.1.0\"}' > \"$OPENCODE_UPDATER_CHECK_RESULT\""}
	item.Update.Command = []string{"sh", "-c", "mkdir -p \"$OPENCODE_UPDATER_STAGE/runtime\"; printf new > \"$OPENCODE_UPDATER_STAGE/runtime/version.txt\"; printf '{\"schemaVersion\":2,\"planSha256\":\"%s\",\"paths\":[\"runtime\"]}' \"$OPENCODE_UPDATER_PLAN_SHA256\" > \"$OPENCODE_UPDATER_MANIFEST\""}
	if err := saveConfig(value.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaultDefaults(), Components: map[string]component{"plugin.example": item}}); err != nil {
		t.Fatal(err)
	}
	if err := upgradeAll(context.Background(), value, false, nil); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(filepath.Join(target, "runtime", "version.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != "new" {
		t.Fatalf("unexpected target content: %q", contents)
	}
	archives, err := filepath.Glob(filepath.Join(value.BackupRoot, "plugin.example", "*.tar.gz"))
	if err != nil || len(archives) != 1 {
		t.Fatalf("expected one backup archive, got %v, %v", archives, err)
	}
	if _, err := verifyArchive(archives[0]); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(value.JournalPath); !os.IsNotExist(err) {
		t.Fatalf("journal should be removed: %v", err)
	}
}

func TestUpgradeReplacesLegacyInternalSymlinkAndRollbackRestoresIt(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	target := filepath.Join(root, "component")
	bin := filepath.Join(target, "runtime", "node_modules", ".bin")
	packageBin := filepath.Join(target, "runtime", "node_modules", "example", "bin")
	if err := os.MkdirAll(bin, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(packageBin, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(packageBin, "cli.js"), []byte("old\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("../example/bin/cli.js", filepath.Join(bin, "example")); err != nil {
		t.Fatal(err)
	}
	cache := filepath.Join(root, "cache-file")
	if err := os.WriteFile(cache, []byte("cached\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(cache, filepath.Join(target, "runtime", "node_modules", "cached.txt")); err != nil {
		t.Fatal(err)
	}
	value := testPaths(root)
	item := discoveredComponent("plugin", "example", &target)
	item.Enabled = true
	item.Policy.Apply = "manifest"
	item.Policy.AllowedPaths = []string{"runtime/node_modules"}
	item.Check.Command = []string{"sh", "-c", "printf '{\"schemaVersion\":1,\"status\":\"update-available\",\"current\":\"1.0.0\",\"latest\":\"1.1.0\"}' > \"$OPENCODE_UPDATER_CHECK_RESULT\""}
	item.Update.Command = []string{"sh", "-c", "mkdir -p \"$OPENCODE_UPDATER_STAGE/runtime/node_modules\"; printf new > \"$OPENCODE_UPDATER_STAGE/runtime/node_modules/version.txt\"; printf '{\"schemaVersion\":2,\"planSha256\":\"%s\",\"paths\":[\"runtime/node_modules\"]}' \"$OPENCODE_UPDATER_PLAN_SHA256\" > \"$OPENCODE_UPDATER_MANIFEST\""}
	if err := saveConfig(value.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaultDefaults(), Components: map[string]component{"plugin.example": item}}); err != nil {
		t.Fatal(err)
	}
	if err := upgradeAll(context.Background(), value, false, nil); err != nil {
		t.Fatal(err)
	}
	state, err := loadState(value.StatePath)
	if err != nil {
		t.Fatal(err)
	}
	applied := state.Components[componentKey("plugin.example", item)].LastApplied
	if applied == nil {
		t.Fatal("missing applied update state")
	}
	choices, err := listBackupChoices(value, "plugin.example")
	if err != nil || len(choices) != 1 {
		t.Fatalf("expected one rollback choice, got %v, %v", choices, err)
	}
	if err := rollbackBackup(context.Background(), value, choices[0], nil); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(target, "runtime", "node_modules", ".bin", "example")
	destination, err := os.Readlink(link)
	if err != nil || destination != "../example/bin/cli.js" {
		t.Fatalf("rollback did not restore internal symlink: %q, %v", destination, err)
	}
	contents, err := os.ReadFile(filepath.Join(target, "runtime", "node_modules", "cached.txt"))
	if err != nil || string(contents) != "cached\n" {
		t.Fatalf("rollback did not restore legacy hardlink content: %q, %v", contents, err)
	}
}

func TestManifestAllowsLegacyTargetSymlinkAndRejectsStagedSymlink(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "component")
	stage := filepath.Join(root, "stage")
	for _, path := range []string{target, stage} {
		if err := os.MkdirAll(filepath.Join(path, "runtime"), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	outside := filepath.Join(root, "outside")
	if err := os.WriteFile(outside, []byte("outside"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(target, "runtime", "escape")); err != nil {
		t.Fatal(err)
	}
	item := discoveredComponent("plugin", "example", &target)
	item.Policy.Apply = "manifest"
	item.Policy.AllowedPaths = []string{"runtime"}
	plan := plannedComponent{ID: "plugin.example", Target: target, PlanSHA256: "sha256:test"}
	manifest := stageManifest{SchemaVersion: 2, PlanSHA256: plan.PlanSHA256, Paths: []string{"runtime"}}
	if err := writeJSONAtomic(filepath.Join(stage, manifestFile), manifest); err != nil {
		t.Fatal(err)
	}
	if _, err := validateManifest(item, plan, stage); err != nil {
		t.Fatalf("legacy target symlink should be replaceable: %v", err)
	}
	if err := os.Remove(filepath.Join(target, "runtime", "escape")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("missing", filepath.Join(stage, "runtime", "staged-link")); err != nil {
		t.Fatal(err)
	}
	if _, err := validateManifest(item, plan, stage); err == nil {
		t.Fatal("expected staged symlink to fail")
	}
}

func TestArchiveExtractionRejectsFileBelowSymlink(t *testing.T) {
	root := t.TempDir()
	archive := filepath.Join(root, "unsafe.tar.gz")
	file, err := os.Create(archive)
	if err != nil {
		t.Fatal(err)
	}
	gzipWriter := gzip.NewWriter(file)
	tarWriter := tar.NewWriter(gzipWriter)
	entries := []struct {
		header *tar.Header
		body   string
	}{
		{header: &tar.Header{Name: "link", Typeflag: tar.TypeSymlink, Linkname: "target", Mode: 0o777}},
		{header: &tar.Header{Name: "link/file", Typeflag: tar.TypeReg, Mode: 0o600, Size: 4}, body: "evil"},
	}
	for _, entry := range entries {
		if err := tarWriter.WriteHeader(entry.header); err != nil {
			t.Fatal(err)
		}
		if entry.body != "" {
			if _, err := tarWriter.Write([]byte(entry.body)); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if err := extractArchive(archive, filepath.Join(root, "destination")); err == nil {
		t.Fatal("expected archive path through symlink to fail")
	}
}

func TestRollbackRestoresVerifiedBackupAndRejectsChangedDigest(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	target := filepath.Join(root, "component")
	if err := os.MkdirAll(filepath.Join(target, "runtime"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "runtime", "version.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	value := testPaths(root)
	item := discoveredComponent("plugin", "example", &target)
	item.Enabled = true
	item.Policy.Apply = "manifest"
	item.Policy.AllowedPaths = []string{"runtime"}
	item.Check.Command = []string{"sh", "-c", "printf '{\"schemaVersion\":1,\"status\":\"update-available\",\"current\":\"1.0.0\",\"latest\":\"1.1.0\"}' > \"$OPENCODE_UPDATER_CHECK_RESULT\""}
	item.Update.Command = []string{"sh", "-c", "mkdir -p \"$OPENCODE_UPDATER_STAGE/runtime\"; printf new > \"$OPENCODE_UPDATER_STAGE/runtime/version.txt\"; printf '{\"schemaVersion\":2,\"planSha256\":\"%s\",\"paths\":[\"runtime\"]}' \"$OPENCODE_UPDATER_PLAN_SHA256\" > \"$OPENCODE_UPDATER_MANIFEST\""}
	if err := saveConfig(value.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaultDefaults(), Components: map[string]component{"plugin.example": item}}); err != nil {
		t.Fatal(err)
	}
	if err := upgradeAll(context.Background(), value, false, nil); err != nil {
		t.Fatal(err)
	}
	choices, err := listBackupChoices(value, "plugin.example")
	if err != nil || len(choices) != 1 {
		t.Fatalf("expected one rollback choice, got %v, %v", choices, err)
	}
	if err := rollbackBackup(context.Background(), value, choices[0], nil); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(filepath.Join(target, "runtime", "version.txt"))
	if err != nil || string(contents) != "old" {
		t.Fatalf("rollback did not restore backup: %q, %v", contents, err)
	}
	invalid := choices[0]
	invalid.Metadata.ArchiveSHA256 = "sha256:wrong"
	if err := rollbackBackup(context.Background(), value, invalid, nil); err == nil {
		t.Fatal("expected checksum mismatch")
	}
	contents, err = os.ReadFile(filepath.Join(target, "runtime", "version.txt"))
	if err != nil || string(contents) != "old" {
		t.Fatalf("target changed after checksum failure: %q, %v", contents, err)
	}
}

func TestSelfUpdateAppliesAndRollsBackPairedTargets(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	repository, initial, latest := selfUpdateTestRepository(t, root)
	pluginRoot := filepath.Join(root, "plugin")
	runTestCommand(t, "", "git", "clone", repository, pluginRoot)
	runTestCommand(t, pluginRoot, "git", "checkout", "--detach", initial)

	binaryDirectory := filepath.Join(root, "bin")
	if err := os.MkdirAll(binaryDirectory, 0o700); err != nil {
		t.Fatal(err)
	}
	binary := filepath.Join(binaryDirectory, "component-updater")
	if err := os.WriteFile(binary, []byte("old updater binary\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	value := testPaths(root)
	value.PluginRoot = pluginRoot
	t.Setenv("OPENCODE_COMPONENT_UPDATER_REPOSITORY", repository)
	previousExecutable := selfUpdateExecutable
	selfUpdateExecutable = func() (string, error) { return binary, nil }
	t.Cleanup(func() { selfUpdateExecutable = previousExecutable })
	previousCommit := commit
	commit = "unknown"
	t.Cleanup(func() { commit = previousCommit })

	if err := applySelfUpdate(context.Background(), value, initial, nil); err == nil {
		t.Fatal("expected mismatched self-update SHA to fail")
	}
	if err := applySelfUpdate(context.Background(), value, latest, nil); err != nil {
		t.Fatal(err)
	}
	assertStoredPlanBound(t, value, latest)
	version := runTestCommand(t, "", binary, "version")
	if !strings.Contains(version, latest) {
		t.Fatalf("candidate binary did not report checked commit: %q", version)
	}
	if _, err := os.Stat(filepath.Join(pluginRoot, "src", "update-marker.js")); err != nil {
		t.Fatalf("candidate plugin was not installed: %v", err)
	}
	state, err := loadState(value.StatePath)
	if err != nil || state.SelfUpdate == nil || state.SelfUpdate.LastApplied == nil || state.SelfUpdate.LastApplied.To != latest {
		t.Fatalf("self-update state missing checked commit: %#v, %v", state.SelfUpdate, err)
	}
	for _, id := range []string{selfUpdateBinaryID, selfUpdatePluginID} {
		if _, err := os.Stat(backupArchivePath(value, id, state.SelfUpdate.LastApplied.RunID)); err != nil {
			t.Fatalf("missing %s backup: %v", id, err)
		}
	}

	if err := rollbackSelfUpdate(context.Background(), value, nil); err != nil {
		t.Fatal(err)
	}
	assertStoredPlanBound(t, value, initial)
	contents, err := os.ReadFile(binary)
	if err != nil || string(contents) != "old updater binary\n" {
		t.Fatalf("rollback did not restore binary: %q, %v", contents, err)
	}
	if _, err := os.Stat(filepath.Join(pluginRoot, "src", "update-marker.js")); !os.IsNotExist(err) {
		t.Fatalf("rollback did not restore plugin: %v", err)
	}
}

func assertStoredPlanBound(t *testing.T, value paths, expected string) {
	t.Helper()
	state, err := loadState(value.StatePath)
	if err != nil || state.SelfUpdate == nil || state.SelfUpdate.LastApplied == nil {
		t.Fatalf("self-update state missing: %#v, %v", state.SelfUpdate, err)
	}
	contents, err := os.ReadFile(filepath.Join(value.RunsRoot, state.SelfUpdate.LastApplied.RunID, "plan.json"))
	if err != nil {
		t.Fatal(err)
	}
	var plan upgradePlan
	if err := json.Unmarshal(contents, &plan); err != nil {
		t.Fatal(err)
	}
	if len(plan.Components) != 2 {
		t.Fatalf("expected paired self-update plan, got %#v", plan.Components)
	}
	for _, component := range plan.Components {
		if !component.SelfUpdate || component.Latest != expected || component.PlanSHA256 != planDigest(component) || component.Manifest.PlanSHA256 != component.PlanSHA256 {
			t.Fatalf("self-update plan is not bound: %#v", component)
		}
	}
}

func TestStrictUpgradeLeavesTargetUntouchedWhenStageFails(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	target := filepath.Join(root, "component")
	if err := os.MkdirAll(filepath.Join(target, "runtime"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "runtime", "version.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	value := testPaths(root)
	item := discoveredComponent("plugin", "example", &target)
	item.Enabled = true
	item.Policy.Apply = "manifest"
	item.Policy.AllowedPaths = []string{"runtime"}
	item.Check.Command = []string{"sh", "-c", "printf '{\"schemaVersion\":1,\"status\":\"update-available\",\"current\":\"1.0.0\",\"latest\":\"1.1.0\"}' > \"$OPENCODE_UPDATER_CHECK_RESULT\""}
	item.Update.Command = []string{"sh", "-c", "exit 1"}
	if err := saveConfig(value.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaultDefaults(), Components: map[string]component{"plugin.example": item}}); err != nil {
		t.Fatal(err)
	}
	err := upgradeAll(context.Background(), value, false, nil)
	if err == nil {
		t.Fatal("expected strict upgrade to fail")
	}
	contents, readErr := os.ReadFile(filepath.Join(target, "runtime", "version.txt"))
	if readErr != nil || string(contents) != "old" {
		t.Fatalf("target changed after failed preflight: %q, %v", contents, readErr)
	}
}

func TestGenericUpgradeSkipsUpdaterPluginTarget(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	target := filepath.Join(root, "plugin")
	if err := os.MkdirAll(filepath.Join(target, "runtime"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "runtime", "version.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	value := testPaths(root)
	item := discoveredComponent("plugin", "component-updater", &target)
	item.Enabled = true
	item.Policy.Apply = "manifest"
	item.Policy.AllowedPaths = []string{"runtime"}
	item.Check.Command = []string{"sh", "-c", "printf '{\"schemaVersion\":1,\"status\":\"update-available\",\"current\":\"1.0.0\",\"latest\":\"1.1.0\"}' > \"$OPENCODE_UPDATER_CHECK_RESULT\""}
	item.Update.Command = []string{"sh", "-c", "mkdir -p \"$OPENCODE_UPDATER_STAGE/runtime\"; printf new > \"$OPENCODE_UPDATER_STAGE/runtime/version.txt\"; printf '{\"schemaVersion\":2,\"planSha256\":\"%s\",\"paths\":[\"runtime\"]}' \"$OPENCODE_UPDATER_PLAN_SHA256\" > \"$OPENCODE_UPDATER_MANIFEST\""}
	value.PluginRoot = target
	if err := saveConfig(value.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaultDefaults(), Components: map[string]component{"plugin.component-updater": item}}); err != nil {
		t.Fatal(err)
	}
	if err := upgradeAll(context.Background(), value, false, nil); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(filepath.Join(target, "runtime", "version.txt"))
	if err != nil || string(contents) != "old" {
		t.Fatalf("generic upgrade changed reserved updater target: %q, %v", contents, err)
	}
}

func TestManagedComponentIDsExcludeUpdaterPathOverlap(t *testing.T) {
	root := t.TempDir()
	value := testPaths(root)
	value.PluginRoot = filepath.Join(root, "plugins", "updater")
	parent := filepath.Join(root, "plugins")
	nested := filepath.Join(value.PluginRoot, "src")
	other := filepath.Join(root, "other")
	components := map[string]component{
		"plugin.parent": {Target: &parent},
		"plugin.nested": {Target: &nested},
		"plugin.other":  {Target: &other},
	}
	ids := managedComponentIDs(value, components)
	if len(ids) != 1 || ids[0] != "plugin.other" {
		t.Fatalf("unexpected managed component ids: %#v", ids)
	}
}

func testPaths(root string) paths {
	return paths{
		OpenCodeConfigRoot: filepath.Join(root, "opencode"),
		ConfigPath:         filepath.Join(root, "config", "components.json"),
		StateRoot:          filepath.Join(root, "state"),
		StatePath:          filepath.Join(root, "state", "state.json"),
		BackupRoot:         filepath.Join(root, "state", "backups"),
		JournalPath:        filepath.Join(root, "state", "journal.json"),
		LockPath:           filepath.Join(root, "state", "operation.lock"),
		RunsRoot:           filepath.Join(root, "state", "runs"),
		TmpRoot:            filepath.Join(root, "state", "tmp"),
		PluginRoot:         filepath.Join(root, "opencode", "plugins", "opencode-component-updater"),
	}
}

func withoutLiveOpenCode(t *testing.T) {
	t.Helper()
	previous := findOpenCodeProcesses
	findOpenCodeProcesses = func() ([]openCodeProcess, error) { return nil, nil }
	t.Cleanup(func() { findOpenCodeProcesses = previous })
}

func selfUpdateTestRepository(t *testing.T, root string) (string, string, string) {
	t.Helper()
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	projectRoot := filepath.Clean(filepath.Join(cwd, "..", ".."))
	repository := filepath.Join(root, "source")
	if err := os.MkdirAll(repository, 0o700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"go.mod", "go.sum", "cmd", "index.js", "server.js", "tui.js", "package.json", "src"} {
		if err := copySafeTree(filepath.Join(projectRoot, name), filepath.Join(repository, name)); err != nil {
			t.Fatal(err)
		}
	}
	runTestCommand(t, repository, "git", "init")
	runTestCommand(t, repository, "git", "config", "user.email", "test@example.com")
	runTestCommand(t, repository, "git", "config", "user.name", "Test")
	runTestCommand(t, repository, "git", "checkout", "-b", "main")
	runTestCommand(t, repository, "git", "add", ".")
	runTestCommand(t, repository, "git", "commit", "-m", "initial")
	initial := runTestCommand(t, repository, "git", "rev-parse", "HEAD")
	if err := os.WriteFile(filepath.Join(repository, "src", "update-marker.js"), []byte("export const updated = true;\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runTestCommand(t, repository, "git", "add", "src/update-marker.js")
	runTestCommand(t, repository, "git", "commit", "-m", "update")
	return repository, initial, runTestCommand(t, repository, "git", "rev-parse", "HEAD")
}

func runTestCommand(t *testing.T, cwd string, command ...string) string {
	t.Helper()
	output := runCommand(context.Background(), command, cwd, nil, 120_000, 65_536)
	if output.Code != 0 || output.Reason != "" {
		t.Fatalf("command failed %q: %s", command, commandFailure("command", output))
	}
	return strings.TrimSpace(output.Stdout)
}

func TestPlanDigestIsStableWithoutStageFields(t *testing.T) {
	component := plannedComponent{ID: "plugin.example", Target: "/tmp/example", Current: "1.0.0", Latest: "1.1.0"}
	first := planDigest(component)
	component.Stage = "/tmp/stage"
	component.Manifest = stageManifest{SchemaVersion: 2, Paths: []string{"runtime"}}
	if second := planDigest(component); first != second {
		encoded, _ := json.Marshal(component)
		t.Fatalf("plan digest changed with stage data: %s: %s", first, encoded)
	}
}

func TestRecoveryRestoresInterruptedSwap(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	value := testPaths(root)
	target := filepath.Join(root, "component")
	stage := filepath.Join(root, "stage")
	backup := filepath.Join(root, "backup")
	for _, path := range []string{filepath.Join(target, "runtime"), filepath.Join(backup, "runtime"), stage} {
		if err := os.MkdirAll(path, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(target, "runtime", "version.txt"), []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(backup, "runtime", "version.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	journal := journal{
		SchemaVersion: 1,
		RunID:         "test-run",
		Mode:          "strict",
		Phase:         "applying",
		Components: []journalComponent{{
			ID:        "plugin.example",
			Target:    target,
			Stage:     stage,
			RawBackup: backup,
			Moves:     []journalMove{{Path: "runtime", OldExisted: true, OldMoved: true, NewMoved: true}},
		}},
	}
	if err := saveJournal(value, journal); err != nil {
		t.Fatal(err)
	}
	if err := recoverTransaction(value, nil); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(filepath.Join(target, "runtime", "version.txt"))
	if err != nil || string(contents) != "old" {
		t.Fatalf("recovery did not restore old target: %q, %v", contents, err)
	}
	if _, err := os.Stat(value.JournalPath); !os.IsNotExist(err) {
		t.Fatalf("journal should be removed: %v", err)
	}
}

func TestApplyArchivesEveryCommittedBackupConcurrently(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	value := testPaths(root)
	items := map[string]component{}
	for _, name := range []string{"a", "b", "c"} {
		target := filepath.Join(root, "component-"+name)
		if err := os.MkdirAll(filepath.Join(target, "runtime"), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(target, "runtime", "version.txt"), []byte("old\n"), 0o600); err != nil {
			t.Fatal(err)
		}
		item := discoveredComponent("plugin", name, &target)
		item.Enabled = true
		item.Policy.Apply = "manifest"
		item.Policy.AllowedPaths = []string{"runtime"}
		item.Check.Command = []string{"sh", "-c", `printf '{"schemaVersion":1,"status":"update-available","current":"1.0.0","latest":"1.1.0"}' > "$OPENCODE_UPDATER_CHECK_RESULT"`}
		item.Update.Command = []string{"sh", "-c", `mkdir -p "$OPENCODE_UPDATER_STAGE/runtime"; printf new > "$OPENCODE_UPDATER_STAGE/runtime/version.txt"; printf '{"schemaVersion":2,"planSha256":"%s","paths":["runtime"]}' "$OPENCODE_UPDATER_PLAN_SHA256" > "$OPENCODE_UPDATER_MANIFEST"`}
		items["plugin."+name] = item
	}
	if err := saveConfig(value.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaultDefaults(), Components: items}); err != nil {
		t.Fatal(err)
	}
	if err := upgradeAll(context.Background(), value, false, nil); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"a", "b", "c"} {
		archives, err := filepath.Glob(filepath.Join(value.BackupRoot, "plugin."+name, "*.tar.gz"))
		if err != nil || len(archives) != 1 {
			t.Fatalf("%s: expected one archive, got %v %v", name, archives, err)
		}
		if _, err := verifyArchive(archives[0]); err != nil {
			t.Fatalf("%s: archive does not verify: %v", name, err)
		}
	}
	state, err := loadState(value.StatePath)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"a", "b", "c"} {
		item := items["plugin."+name]
		if entry := state.Components[componentKey("plugin."+name, item)]; entry.LastApplied == nil {
			t.Fatalf("%s: last applied not finalized: %#v", name, entry)
		}
	}
	if _, err := os.Stat(value.JournalPath); !os.IsNotExist(err) {
		t.Fatalf("journal should be removed: %v", err)
	}
}

func TestRecoveryFinishesArchivingPhase(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	value := testPaths(root)
	target := filepath.Join(root, "component")
	if err := os.MkdirAll(filepath.Join(target, "runtime"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "runtime", "version.txt"), []byte("new\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	raw := filepath.Join(root, "raw-backup")
	if err := os.MkdirAll(filepath.Join(raw, "runtime"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(raw, "runtime", "version.txt"), []byte("old\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	item := discoveredComponent("plugin", "example", &target)
	journal := journal{
		SchemaVersion: 1,
		RunID:         "test-run",
		Mode:          "strict",
		Phase:         "archiving",
		Components: []journalComponent{{
			ID:        "plugin.example",
			Target:    target,
			Stage:     filepath.Join(root, "stage"),
			RawBackup: raw,
			Committed: true,
			Moves:     []journalMove{{Path: "runtime", OldExisted: true, OldMoved: true, NewMoved: true}},
			Plan: plannedComponent{
				ID:       "plugin.example",
				Key:      componentKey("plugin.example", item),
				Target:   target,
				Current:  "1.0.0",
				Latest:   "1.1.0",
				Manifest: stageManifest{Paths: []string{"runtime"}},
			},
		}},
	}
	if err := saveJournal(value, journal); err != nil {
		t.Fatal(err)
	}
	if err := recoverTransaction(value, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(value.BackupRoot, "plugin.example", "test-run.tar.gz")); err != nil {
		t.Fatalf("recovery did not archive the committed backup: %v", err)
	}
	contents, err := os.ReadFile(filepath.Join(target, "runtime", "version.txt"))
	if err != nil || string(contents) != "new\n" {
		t.Fatalf("recovery rolled back a committed swap: %q %v", contents, err)
	}
	if _, err := os.Stat(value.JournalPath); !os.IsNotExist(err) {
		t.Fatalf("journal should be removed: %v", err)
	}
}

func TestCancelledStageReportsCancellationNotPartial(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	value := testPaths(root)
	target := filepath.Join(root, "component")
	if err := os.MkdirAll(filepath.Join(target, "runtime"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "runtime", "version.txt"), []byte("old\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	item := discoveredComponent("plugin", "example", &target)
	item.Enabled = true
	item.Policy.Apply = "manifest"
	item.Policy.AllowedPaths = []string{"runtime"}
	item.Check.Command = []string{"sh", "-c", `printf '{"schemaVersion":1,"status":"update-available","current":"1.0.0","latest":"1.1.0"}' > "$OPENCODE_UPDATER_CHECK_RESULT"`}
	item.Update.Command = []string{"sh", "-c", `sleep 0.3; mkdir -p "$OPENCODE_UPDATER_STAGE/runtime"; printf new > "$OPENCODE_UPDATER_STAGE/runtime/version.txt"; printf '{"schemaVersion":2,"planSha256":"%s","paths":["runtime"]}' "$OPENCODE_UPDATER_PLAN_SHA256" > "$OPENCODE_UPDATER_MANIFEST"`}
	if err := saveConfig(value.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaultDefaults(), Components: map[string]component{"plugin.example": item}}); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(150*time.Millisecond, cancel)
	err := upgradeAll(ctx, value, false, nil)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled stage reported %v instead of context.Canceled", err)
	}
	var partial *partialUpgradeError
	if errors.As(err, &partial) {
		t.Fatalf("cancellation must not be reported as a partial upgrade: %v", partial.Failures)
	}
	contents, readErr := os.ReadFile(filepath.Join(target, "runtime", "version.txt"))
	if readErr != nil || string(contents) != "old\n" {
		t.Fatalf("cancelled staging changed the target: %q %v", contents, readErr)
	}
}

func TestSelfUpdateIncludesPluginRootEntrypoints(t *testing.T) {
	allowed := strings.Join(selfUpdatePluginFiles, ",")
	for _, name := range []string{"server.js", "tui.js"} {
		if !strings.Contains(allowed, name) {
			t.Fatalf("self-update would leave %s stale: allowed paths %s", name, allowed)
		}
	}
}

func TestSelfUpdateTargetsIncludeSourceEntrypoints(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	value := testPaths(root)
	executable := filepath.Join(root, "bin", "opencode-component-updater")
	if err := os.MkdirAll(filepath.Dir(executable), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(executable, []byte("binary"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(value.PluginRoot, 0o700); err != nil {
		t.Fatal(err)
	}
	previous := selfUpdateExecutable
	selfUpdateExecutable = func() (string, error) { return executable, nil }
	t.Cleanup(func() { selfUpdateExecutable = previous })

	targets, err := selfUpdateTargetComponents(value)
	if err != nil {
		t.Fatal(err)
	}
	allowed := strings.Join(targets.Plugin.Policy.AllowedPaths, ",")
	for _, name := range []string{"server.js", "tui.js", "src"} {
		if !strings.Contains(allowed, name) {
			t.Fatalf("self-update target omits %s: %s", name, allowed)
		}
	}
}

func TestBackupRetentionKeepsThreeArchives(t *testing.T) {
	root := t.TempDir()
	value := testPaths(root)
	for index := 0; index < 4; index++ {
		raw := filepath.Join(root, "raw", fmt.Sprintf("%d", index))
		if err := os.MkdirAll(filepath.Join(raw, "runtime"), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(raw, "runtime", "version.txt"), []byte("old"), 0o600); err != nil {
			t.Fatal(err)
		}
		component := journalComponent{
			ID:        "plugin.example",
			Target:    filepath.Join(root, "target"),
			RawBackup: raw,
			Plan: plannedComponent{
				Current:  "1.0.0",
				Latest:   "1.1.0",
				Manifest: stageManifest{Paths: []string{"runtime"}},
			},
		}
		runID := fmt.Sprintf("20260101T00000%dZ-run", index)
		if err := archiveComponentBackup(value, runID, &component); err != nil {
			t.Fatal(err)
		}
	}
	archives, err := filepath.Glob(filepath.Join(value.BackupRoot, "plugin.example", "*.tar.gz"))
	if err != nil || len(archives) != 3 {
		t.Fatalf("expected 3 retained archives, got %v, %v", archives, err)
	}
}
