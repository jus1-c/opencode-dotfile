package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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

func TestOpenCodeProcessClassification(t *testing.T) {
	if !isOpenCodeProcess("/home/c/.opencode/bin/opencode", "other", true) {
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
	for _, name := range []string{"go.mod", "go.sum", "cmd", "index.js", "package.json", "src"} {
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
