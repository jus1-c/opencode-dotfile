package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateArtifactRejectsUnusableValues(t *testing.T) {
	valid := artifactInfo{
		URL:       "https://registry.npmjs.org/example/-/example-1.0.0.tgz",
		Integrity: "sha512-DOiqZR7GKBedUCLAV2xW0rzaU2GUztvxLxesLNcjdzF1sFPxhMk8nrnKd79X9J9cOt2qvQIhGSJ/BcegnVo0Hw==",
	}
	if err := validateArtifact(valid); err != nil {
		t.Fatalf("valid artifact rejected: %v", err)
	}
	for name, artifact := range map[string]artifactInfo{
		"missing integrity": {URL: valid.URL},
		"missing url":       {Integrity: valid.Integrity},
		"plain http":        {URL: "http://registry.npmjs.org/x.tgz", Integrity: valid.Integrity},
		"relative url":      {URL: "/x.tgz", Integrity: valid.Integrity},
		"unknown digest":    {URL: valid.URL, Integrity: "md5-abc"},
	} {
		if err := validateArtifact(artifact); err == nil {
			t.Fatalf("%s was accepted", name)
		}
	}
}

func TestCustomCheckRecordsArtifactAndProvenance(t *testing.T) {
	root := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(root, "config"))
	t.Setenv("XDG_STATE_HOME", filepath.Join(root, "state"))
	t.Setenv("OPENCODE_CONFIG_DIR", filepath.Join(root, "opencode"))
	value, err := resolvePaths()
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(root, "component")
	if err := os.MkdirAll(target, 0o700); err != nil {
		t.Fatal(err)
	}
	item := discoveredComponent("plugin", "example", &target)
	item.Enabled = true
	item.Check.Command = []string{"sh", "-c", `printf '%s' '{"schemaVersion":1,"status":"update-available","current":"0.9.27","latest":"0.9.28","artifact":{"url":"https://registry.npmjs.org/x/-/x-0.9.28.tgz","integrity":"sha512-DOiqZR7GKBedUCLAV2xW0rzaU2GUztvxLxesLNcjdzF1sFPxhMk8nrnKd79X9J9cOt2qvQIhGSJ/BcegnVo0Hw=="},"sourceCommit":"08f742c13b1813f04ef9ddf38a55b881c5e35792"}' > "$OPENCODE_UPDATER_CHECK_RESULT"`}

	result := checkComponent(context.Background(), value, "plugin.example", item, defaultDefaults())
	if result.Status != "update-available" {
		t.Fatalf("unexpected status %q: %s", result.Status, result.Summary)
	}
	if result.Current != "0.9.27" || result.Latest != "0.9.28" {
		t.Fatalf("registry identity must be the published version, got %s -> %s", result.Current, result.Latest)
	}
	if result.Artifact == nil || result.Artifact.Integrity == "" {
		t.Fatal("artifact metadata was not recorded")
	}
	if result.SourceCommit != "08f742c13b1813f04ef9ddf38a55b881c5e35792" {
		t.Fatalf("source commit provenance lost: %q", result.SourceCommit)
	}
}

func TestCustomCheckRejectsUnverifiableArtifact(t *testing.T) {
	root := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(root, "config"))
	t.Setenv("XDG_STATE_HOME", filepath.Join(root, "state"))
	t.Setenv("OPENCODE_CONFIG_DIR", filepath.Join(root, "opencode"))
	value, err := resolvePaths()
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(root, "component")
	if err := os.MkdirAll(target, 0o700); err != nil {
		t.Fatal(err)
	}
	item := discoveredComponent("plugin", "example", &target)
	item.Enabled = true
	item.Check.Command = []string{"sh", "-c", `printf '%s' '{"schemaVersion":1,"status":"update-available","current":"1.0.0","latest":"1.0.1","artifact":{"url":"https://example.com/x.tgz"}}' > "$OPENCODE_UPDATER_CHECK_RESULT"`}

	result := checkComponent(context.Background(), value, "plugin.example", item, defaultDefaults())
	if result.Status != "check-error" {
		t.Fatalf("expected check-error, got %q", result.Status)
	}
}

func TestStageEnvironmentExposesArtifactAndProvenance(t *testing.T) {
	plan := plannedComponent{
		ID:           "mcp.example",
		Target:       "/target",
		Current:      "0.9.27",
		Latest:       "0.9.28",
		SourceCommit: "08f742c13b1813f04ef9ddf38a55b881c5e35792",
		Artifact:     &artifactInfo{URL: "https://registry.npmjs.org/x.tgz", Integrity: "sha512-abc="},
	}
	environment := stageEnvironment(plan, "/stage", "/stage/manifest.json", "/stage/plan.json")
	for key, want := range map[string]string{
		"OPENCODE_UPDATER_LATEST":             "0.9.28",
		"OPENCODE_UPDATER_ARTIFACT_URL":       "https://registry.npmjs.org/x.tgz",
		"OPENCODE_UPDATER_ARTIFACT_INTEGRITY": "sha512-abc=",
		"OPENCODE_UPDATER_SOURCE_COMMIT":      "08f742c13b1813f04ef9ddf38a55b881c5e35792",
	} {
		if environment[key] != want {
			t.Fatalf("%s = %q, want %q", key, environment[key], want)
		}
	}

	plan.Artifact = nil
	if _, found := stageEnvironment(plan, "/stage", "/m", "/p")["OPENCODE_UPDATER_ARTIFACT_URL"]; found {
		t.Fatal("artifact url exposed without an artifact")
	}
}

func TestPlanDigestCoversArtifact(t *testing.T) {
	plan := plannedComponent{ID: "mcp.example", Current: "1.0.0", Latest: "1.0.1"}
	baseline := planDigest(plan)
	plan.Artifact = &artifactInfo{URL: "https://registry.npmjs.org/x.tgz", Integrity: "sha512-abc="}
	if planDigest(plan) == baseline {
		t.Fatal("artifact metadata must change the plan digest")
	}
}

func TestStatusFallsBackToLastAttempt(t *testing.T) {
	entry := componentState{LastAttempt: &checkResult{Status: "check-error", Summary: "registry unreachable"}}
	if displayed := displayedCheck(entry); displayed == nil || displayed.Status != "check-error" {
		t.Fatalf("expected the failed attempt to be displayed, got %#v", displayed)
	}
	entry.LastGood = &checkResult{Status: "current", Summary: "1.0.0"}
	if displayed := displayedCheck(entry); displayed.Status != "current" {
		t.Fatalf("expected the last good result to win, got %#v", displayed)
	}
}

func TestPrintStatusShowsFirstFailedCheck(t *testing.T) {
	root := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(root, "config"))
	t.Setenv("XDG_STATE_HOME", filepath.Join(root, "state"))
	t.Setenv("OPENCODE_CONFIG_DIR", filepath.Join(root, "opencode"))
	value, err := resolvePaths()
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(root, "component")
	if err := os.MkdirAll(target, 0o700); err != nil {
		t.Fatal(err)
	}
	item := discoveredComponent("plugin", "example", &target)
	item.Enabled = true
	if err := saveConfig(value.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaultDefaults(), Components: map[string]component{"plugin.example": item}}); err != nil {
		t.Fatal(err)
	}
	cached := state{SchemaVersion: stateSchemaVersion, Components: map[string]componentState{
		componentKey("plugin.example", item): {LastAttempt: &checkResult{Status: "check-error", Summary: "registry unreachable", CheckedAt: nowMillis()}},
	}}
	if err := saveState(value.StatePath, cached); err != nil {
		t.Fatal(err)
	}

	var out bytes.Buffer
	if err := printStatus(value, &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "status: check-error") {
		t.Fatalf("status did not surface the failed attempt:\n%s", out.String())
	}
	if strings.Contains(out.String(), "status: not checked") {
		t.Fatalf("status still reported not checked:\n%s", out.String())
	}
}
