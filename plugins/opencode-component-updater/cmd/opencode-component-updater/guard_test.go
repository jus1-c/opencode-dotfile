package main

import (
	"sync"
	"testing"
)

func resetLiveProbe(t *testing.T, service liveServiceInfo) {
	t.Helper()
	previousProbe := probeLiveService
	liveServiceOnce = sync.Once{}
	liveService = liveServiceInfo{}
	probeLiveService = func() liveServiceInfo { return service }
	t.Cleanup(func() {
		probeLiveService = previousProbe
		liveServiceOnce = sync.Once{}
		liveService = liveServiceInfo{}
	})
}

func TestLiveApplyAllowedHonoursOverride(t *testing.T) {
	previous := allowRunning
	t.Cleanup(func() { allowRunning = previous })
	resetLiveProbe(t, liveServiceInfo{})
	t.Setenv("OPENCODE_COMPONENT_UPDATER_ALLOW_RUNNING", "")

	allowRunning = true
	if !liveApplyAllowed() {
		t.Fatal("--allow-running must permit live apply")
	}

	allowRunning = false
	t.Setenv("OPENCODE_COMPONENT_UPDATER_ALLOW_RUNNING", "1")
	if !liveApplyAllowed() {
		t.Fatal("env override must permit live apply")
	}
}

func TestLiveApplyAllowedUsesDetectedService(t *testing.T) {
	previous := allowRunning
	t.Cleanup(func() { allowRunning = previous })
	allowRunning = false
	t.Setenv("OPENCODE_COMPONENT_UPDATER_ALLOW_RUNNING", "")

	resetLiveProbe(t, liveServiceInfo{Version: "2.1.4", Reload: true})
	if !liveApplyAllowed() {
		t.Fatal("a V2 service must permit live apply")
	}

	resetLiveProbe(t, liveServiceInfo{})
	if liveApplyAllowed() {
		t.Fatal("without a V2 service live apply must stay off")
	}
}

func TestEnsureNoProcessesSkipsGuardWhenLive(t *testing.T) {
	previousAllow := allowRunning
	previousFinder := findOpenCodeProcesses
	t.Cleanup(func() {
		allowRunning = previousAllow
		findOpenCodeProcesses = previousFinder
	})
	t.Setenv("OPENCODE_COMPONENT_UPDATER_ALLOW_RUNNING", "")

	allowRunning = true
	findOpenCodeProcesses = func() ([]openCodeProcess, error) {
		return []openCodeProcess{{PID: 42, Executable: "/usr/bin/opencode"}}, nil
	}
	if err := ensureNoOpenCodeProcesses(); err != nil {
		t.Fatalf("live mode must not block: %v", err)
	}

	allowRunning = false
	resetLiveProbe(t, liveServiceInfo{})
	if err := ensureNoOpenCodeProcesses(); err == nil {
		t.Fatal("without live support a running process must block")
	}
}

func TestEnsureNoProcessesRequiresSingleVerifiedService(t *testing.T) {
	previousAllow := allowRunning
	previousFinder := findOpenCodeProcesses
	t.Cleanup(func() {
		allowRunning = previousAllow
		findOpenCodeProcesses = previousFinder
	})
	allowRunning = false
	t.Setenv("OPENCODE_COMPONENT_UPDATER_ALLOW_RUNNING", "")
	findOpenCodeProcesses = func() ([]openCodeProcess, error) {
		return []openCodeProcess{{PID: 42, Executable: "/usr/bin/opencode"}}, nil
	}

	resetLiveProbe(t, liveServiceInfo{Version: "2.1.4", Reload: false})
	if err := ensureNoOpenCodeProcesses(); err == nil {
		t.Fatal("service without reload support must block")
	}

	resetLiveProbe(t, liveServiceInfo{Version: "2.1.4", Reload: true})
	findOpenCodeProcesses = func() ([]openCodeProcess, error) {
		return []openCodeProcess{
			{PID: 42, Executable: "/usr/bin/opencode"},
			{PID: 43, Executable: "/usr/bin/opencode", Command: "opencode --standalone"},
		}, nil
	}
	if err := ensureNoOpenCodeProcesses(); err == nil {
		t.Fatal("multiple OpenCode processes must block despite one compatible service")
	}
}

func TestHasFlagAndRemoveFlag(t *testing.T) {
	args := []string{"--best-effort", "--allow-running"}
	if !hasFlag(args, "--allow-running") {
		t.Fatal("flag not detected")
	}
	got := removeFlag(args, "--allow-running")
	if len(got) != 1 || got[0] != "--best-effort" {
		t.Fatalf("removeFlag = %v", got)
	}
}
