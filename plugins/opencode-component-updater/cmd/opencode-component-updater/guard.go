package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	tea "charm.land/bubbletea/v2"
)

type openCodeRunningError struct {
	Processes []openCodeProcess
}

var findOpenCodeProcesses = listOpenCodeProcesses

func (err *openCodeRunningError) Error() string {
	lines := []string{"OpenCode is still running; close every OpenCode process before changing components."}
	for _, process := range err.Processes {
		lines = append(lines, fmt.Sprintf("pid %d: %s", process.PID, fallback(process.Executable, process.Command)))
	}
	return strings.Join(lines, "\n")
}

func ensureNoOpenCodeProcesses() error {
	processes, err := findOpenCodeProcesses()
	if err != nil {
		return err
	}
	if len(processes) != 0 {
		return &openCodeRunningError{Processes: processes}
	}
	return nil
}

func waitForOpenCodeExit(ctx context.Context) error {
	if err := ensureNoOpenCodeProcesses(); err == nil {
		return nil
	} else if !interactiveTerminal() {
		return err
	}
	model := processGuardModel{ctx: ctx}
	final, err := tea.NewProgram(model, tea.WithOutput(os.Stderr)).Run()
	if err != nil {
		return err
	}
	return final.(processGuardModel).err
}

type processScanMessage struct {
	processes []openCodeProcess
	err       error
}

type processGuardModel struct {
	ctx       context.Context
	processes []openCodeProcess
	err       error
}

func (model processGuardModel) Init() tea.Cmd {
	return scanOpenCodeProcesses()
}

func (model processGuardModel) Update(message tea.Msg) (tea.Model, tea.Cmd) {
	switch typed := message.(type) {
	case processScanMessage:
		if typed.err != nil {
			model.err = typed.err
			return model, tea.Quit
		}
		model.processes = typed.processes
		if len(typed.processes) == 0 {
			return model, tea.Quit
		}
	case tea.KeyPressMsg:
		switch typed.String() {
		case "r":
			return model, scanOpenCodeProcesses()
		case "q", "esc", "ctrl+c":
			model.err = &openCodeRunningError{Processes: model.processes}
			return model, tea.Quit
		}
	}
	return model, nil
}

func (model processGuardModel) View() tea.View {
	lines := []string{"OpenCode Component Updater", "", "OpenCode is still running.", "", "PID    EXECUTABLE"}
	for _, process := range model.processes {
		lines = append(lines, fmt.Sprintf("%-6d %s", process.PID, fallback(process.Executable, process.Command)))
	}
	lines = append(lines, "", "Close every OpenCode process before changing components.", "", "r: retry    q: exit")
	return tea.NewView(strings.Join(lines, "\n") + "\n")
}

func scanOpenCodeProcesses() tea.Cmd {
	return func() tea.Msg {
		processes, err := findOpenCodeProcesses()
		return processScanMessage{processes: processes, err: err}
	}
}

func isOpenCodeBlocked(err error) bool {
	var blocked *openCodeRunningError
	return errors.As(err, &blocked)
}
