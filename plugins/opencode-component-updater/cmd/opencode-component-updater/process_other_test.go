//go:build !linux

package main

import "testing"

func TestUnsupportedPlatformProcessScanFailsClosed(t *testing.T) {
	if _, err := listOpenCodeProcesses(); err == nil {
		t.Fatal("unsupported platform process scan must fail closed")
	}
}
