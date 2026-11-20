//go:build linux

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestAcquireOperationLockPreservesDeadLinuxOwner(t *testing.T) {
	root := t.TempDir()
	value := paths{LockPath: filepath.Join(root, "operation.lock")}
	contents, err := json.Marshal(lockRecord{Token: "old", PID: 99999999, Operation: "old"})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(value.LockPath, contents, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := acquireOperationLock(value, "new"); err == nil {
		t.Fatal("stale lock must require manual cleanup")
	}
	if _, err := os.Stat(value.LockPath); err != nil {
		t.Fatalf("stale lock was removed: %v", err)
	}
}
