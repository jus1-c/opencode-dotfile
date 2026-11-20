//go:build !linux

package main

import "testing"

func TestUnsupportedPlatformProcessCheckDoesNotReportDead(t *testing.T) {
	if _, err := processExists(1234); err == nil {
		t.Fatal("unsupported platform must not claim process is absent")
	}
}
