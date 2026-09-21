//go:build !linux

package main

type openCodeProcess struct {
	PID        int
	Executable string
	Command    string
}

func listOpenCodeProcesses() ([]openCodeProcess, error) {
	return []openCodeProcess{}, nil
}

func processExists(pid int) bool {
	return false
}

func isOpenCodeProcess(executable, comm string, executableAvailable bool) bool {
	return false
}
