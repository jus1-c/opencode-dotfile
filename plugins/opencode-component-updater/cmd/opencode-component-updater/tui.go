package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	tea "charm.land/bubbletea/v2"
)

type progressMessage struct {
	progress progress
}

type completeMessage struct {
	err error
}

type operationModel struct {
	title           string
	events          <-chan tea.Msg
	cancel          context.CancelFunc
	latest          progress
	cancelRequested bool
	complete        bool
	operationError  error
}

func runOperationTUI(parent context.Context, title string, operation func(context.Context, reporter) error) error {
	ctx, cancel := context.WithCancel(parent)
	events := make(chan tea.Msg, 32)
	go func() {
		emit := func(event progress) {
			select {
			case events <- progressMessage{progress: event}:
			case <-ctx.Done():
			}
		}
		err := operation(ctx, emit)
		events <- completeMessage{err: err}
	}()
	model := operationModel{title: title, events: events, cancel: cancel}
	final, err := tea.NewProgram(model, tea.WithOutput(os.Stderr)).Run()
	if err != nil {
		return err
	}
	return final.(operationModel).operationError
}

func (model operationModel) Init() tea.Cmd {
	return waitForEvent(model.events)
}

func (model operationModel) Update(message tea.Msg) (tea.Model, tea.Cmd) {
	switch typed := message.(type) {
	case progressMessage:
		model.latest = typed.progress
		return model, waitForEvent(model.events)
	case completeMessage:
		model.complete = true
		model.operationError = typed.err
		if typed.err != nil {
			model.latest = progress{Phase: "failed", Detail: typed.err.Error(), Current: model.latest.Current, Total: model.latest.Total}
		} else {
			model.latest = progress{Phase: "complete", Detail: "complete", Current: model.latest.Total, Total: model.latest.Total}
		}
		return model, tea.Quit
	case tea.KeyPressMsg:
		switch typed.String() {
		case "q", "esc", "ctrl+c":
			if !model.complete && !model.cancelRequested {
				model.cancelRequested = true
				model.latest.Detail = "cancelling at a safe point"
				model.cancel()
			}
		}
	}
	return model, nil
}

func (model operationModel) View() tea.View {
	event := model.latest
	percent := 0
	if event.Total > 0 {
		percent = event.Current * 100 / event.Total
	}
	bar := strings.Repeat("#", percent/5) + strings.Repeat("-", 20-percent/5)
	content := fmt.Sprintf("%s\n\n%s\n[%s] %d%%\n", model.title, strings.TrimSpace(strings.Join([]string{event.Phase, event.Component, event.Detail}, " ")), bar, percent)
	if !model.complete {
		content += "\nq / esc / ctrl+c: cancel\n"
	}
	view := tea.NewView(content)
	view.ProgressBar = tea.NewProgressBar(tea.ProgressBarDefault, percent)
	if model.operationError != nil {
		view.ProgressBar = tea.NewProgressBar(tea.ProgressBarError, percent)
	}
	return view
}

func waitForEvent(events <-chan tea.Msg) tea.Cmd {
	return func() tea.Msg {
		return <-events
	}
}

func interactiveTerminal() bool {
	return isTerminal(os.Stdin) && isTerminal(os.Stderr)
}

func isTerminal(file *os.File) bool {
	info, err := file.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}
