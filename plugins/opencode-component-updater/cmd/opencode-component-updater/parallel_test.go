package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// checkBarrierScript blocks until the peer check wrote its marker, so a
// sequential runner fails by timeout and a concurrent runner succeeds.
func checkBarrierScript(dir, mine, peer string) string {
	return fmt.Sprintf(
		`touch %[1]s/%[2]s; i=0; while [ ! -f %[1]s/%[3]s ]; do i=$((i+1)); [ "$i" -gt 200 ] && exit 3; sleep 0.05; done; printf '{"schemaVersion":1,"status":"update-available","current":"1.0.0","latest":"1.1.0"}' > "$OPENCODE_UPDATER_CHECK_RESULT"`,
		dir, mine, peer,
	)
}

func updateBarrierScript(dir, mine, peer string) string {
	return fmt.Sprintf(
		`touch %[1]s/%[2]s; i=0; while [ ! -f %[1]s/%[3]s ]; do i=$((i+1)); [ "$i" -gt 200 ] && exit 3; sleep 0.05; done; mkdir -p "$OPENCODE_UPDATER_STAGE/runtime"; printf new > "$OPENCODE_UPDATER_STAGE/runtime/version.txt"; printf '{"schemaVersion":2,"planSha256":"%%s","paths":["runtime"]}' "$OPENCODE_UPDATER_PLAN_SHA256" > "$OPENCODE_UPDATER_MANIFEST"`,
		dir, mine, peer,
	)
}

func TestCheckAllRunsComponentsConcurrently(t *testing.T) {
	root := t.TempDir()
	barrier := filepath.Join(root, "barrier")
	if err := os.MkdirAll(barrier, 0o700); err != nil {
		t.Fatal(err)
	}
	value := testPaths(root)
	items := map[string]component{}
	for index, names := range [][2]string{{"a", "b"}, {"b", "a"}} {
		target := filepath.Join(root, fmt.Sprintf("component-%d", index))
		if err := os.MkdirAll(target, 0o700); err != nil {
			t.Fatal(err)
		}
		item := discoveredComponent("plugin", names[0], &target)
		item.Enabled = true
		item.Check.Command = []string{"sh", "-c", checkBarrierScript(barrier, names[0], names[1])}
		items["plugin."+names[0]] = item
	}
	if err := saveConfig(value.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaultDefaults(), Components: items}); err != nil {
		t.Fatal(err)
	}
	summary, err := checkAll(context.Background(), value, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"plugin.a", "plugin.b"} {
		if got := summary.Results[id].Status; got != "update-available" {
			t.Fatalf("%s check did not run concurrently: status %q (%s)", id, got, summary.Results[id].Summary)
		}
	}
}

func TestStageAllRunsComponentsConcurrently(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	barrier := filepath.Join(root, "barrier")
	if err := os.MkdirAll(barrier, 0o700); err != nil {
		t.Fatal(err)
	}
	value := testPaths(root)
	items := map[string]component{}
	for index, names := range [][2]string{{"a", "b"}, {"b", "a"}} {
		target := filepath.Join(root, fmt.Sprintf("component-%d", index))
		if err := os.MkdirAll(target, 0o700); err != nil {
			t.Fatal(err)
		}
		item := discoveredComponent("plugin", names[0], &target)
		item.Enabled = true
		item.Policy.Apply = "manifest"
		item.Policy.AllowedPaths = []string{"runtime"}
		item.Check.Command = []string{"sh", "-c", `printf '{"schemaVersion":1,"status":"update-available","current":"1.0.0","latest":"1.1.0"}' > "$OPENCODE_UPDATER_CHECK_RESULT"`}
		item.Update.Command = []string{"sh", "-c", updateBarrierScript(barrier, names[0], names[1])}
		items["plugin."+names[0]] = item
	}
	if err := saveConfig(value.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaultDefaults(), Components: items}); err != nil {
		t.Fatal(err)
	}
	if err := upgradeAll(context.Background(), value, false, nil); err != nil {
		t.Fatal(err)
	}
	for index := range 2 {
		contents, err := os.ReadFile(filepath.Join(root, fmt.Sprintf("component-%d", index), "runtime", "version.txt"))
		if err != nil || strings.TrimSpace(string(contents)) != "new" {
			t.Fatalf("component %d was not staged concurrently: %q %v", index, contents, err)
		}
	}
}

func TestStageConcurrencyIsBounded(t *testing.T) {
	withoutLiveOpenCode(t)
	root := t.TempDir()
	value := testPaths(root)
	concurrencyDir := filepath.Join(root, "active")
	if err := os.MkdirAll(concurrencyDir, 0o700); err != nil {
		t.Fatal(err)
	}
	items := map[string]component{}
	names := []string{"a", "b", "c", "d"}
	for _, name := range names {
		target := filepath.Join(root, "component-"+name)
		if err := os.MkdirAll(target, 0o700); err != nil {
			t.Fatal(err)
		}
		item := discoveredComponent("plugin", name, &target)
		item.Enabled = true
		item.Policy.Apply = "manifest"
		item.Policy.AllowedPaths = []string{"runtime"}
		item.Check.Command = []string{"sh", "-c", `printf '{"schemaVersion":1,"status":"update-available","current":"1.0.0","latest":"1.1.0"}' > "$OPENCODE_UPDATER_CHECK_RESULT"`}
		item.Update.Command = []string{"sh", "-c", fmt.Sprintf(`d=%[1]s; touch "$d/$$"; n=$(ls "$d" | wc -l); sleep 0.2; [ "$n" -gt 2 ] && exit 8; rm -f "$d/$$"; mkdir -p "$OPENCODE_UPDATER_STAGE/runtime"; printf new > "$OPENCODE_UPDATER_STAGE/runtime/version.txt"; printf '{"schemaVersion":2,"planSha256":"%%s","paths":["runtime"]}' "$OPENCODE_UPDATER_PLAN_SHA256" > "$OPENCODE_UPDATER_MANIFEST"`, concurrencyDir)}
		items["plugin."+name] = item
	}
	defaults := defaultDefaults()
	defaults.StageConcurrency = 2
	if err := saveConfig(value.ConfigPath, config{SchemaVersion: configSchemaVersion, Defaults: defaults, Components: items}); err != nil {
		t.Fatal(err)
	}
	if err := upgradeAll(context.Background(), value, false, nil); err != nil {
		t.Fatalf("stageConcurrency 2 let more than two stages overlap: %v", err)
	}
}
