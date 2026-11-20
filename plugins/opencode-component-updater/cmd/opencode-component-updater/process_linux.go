//go:build linux

package main

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type openCodeProcess struct {
	PID        int
	Executable string
	Command    string
}

func listOpenCodeProcesses() ([]openCodeProcess, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, err
	}
	processes := []openCodeProcess{}
	for _, entry := range entries {
		pid, err := strconv.Atoi(entry.Name())
		if err != nil || pid == os.Getpid() || processIsZombie(pid) {
			continue
		}
		executable, executableErr := filepath.EvalSymlinks(filepath.Join("/proc", entry.Name(), "exe"))
		command := readProcCommand(pid)
		comm, _ := os.ReadFile(filepath.Join("/proc", entry.Name(), "comm"))
		if !isOpenCodeProcess(executable, strings.TrimSpace(string(comm)), executableErr == nil) {
			continue
		}
		processes = append(processes, openCodeProcess{PID: pid, Executable: executable, Command: command})
	}
	return processes, nil
}

func processExists(pid int) (bool, error) {
	procInfo, err := os.Stat("/proc")
	if err != nil {
		return false, fmt.Errorf("cannot inspect /proc: %w", err)
	}
	if !procInfo.IsDir() {
		return false, errors.New("/proc is not a directory")
	}
	_, err = os.Stat(filepath.Join("/proc", strconv.Itoa(pid)))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func processIsZombie(pid int) bool {
	contents, err := os.ReadFile(filepath.Join("/proc", strconv.Itoa(pid), "status"))
	return err == nil && strings.Contains(string(contents), "\nState:\tZ")
}

func readProcCommand(pid int) string {
	contents, err := os.ReadFile(filepath.Join("/proc", strconv.Itoa(pid), "cmdline"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(strings.ReplaceAll(string(contents), "\x00", " "))
}

func isOpenCodeProcess(executable, comm string, executableAvailable bool) bool {
	if executableAvailable {
		name := strings.TrimSuffix(filepath.Base(executable), " (deleted)")
		return name == "opencode"
	}
	return comm == "opencode"
}
