//go:build !linux

package main

import "errors"

type openCodeProcess struct {
	PID        int
	Executable string
	Command    string
}

func listOpenCodeProcesses() ([]openCodeProcess, error) {
	return nil, errors.New("OpenCode process detection is unsupported on this platform")
}

func processExists(pid int) (bool, error) {
	return false, errors.New("process detection is unsupported on this platform")
}

func isOpenCodeProcess(executable, comm string, executableAvailable bool) bool {
	return false
}
