package main

import (
	"context"
	"os"
	"strings"
	"time"

	progressbar "charm.land/bubbles/v2/progress"
	"charm.land/bubbles/v2/spinner"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
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
	width           int
	height          int
	spinner         spinner.Model
	bar             progressbar.Model
	logs            []string
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
	spin := spinner.New()
	spin.Spinner = spinner.MiniDot
	spin.Style = lipgloss.NewStyle().Foreground(mauve)
	bar := progressbar.New(
		progressbar.WithColors(sapphire, mauve),
		progressbar.WithFillCharacters(progressbar.DefaultFullCharFullBlock, progressbar.DefaultEmptyCharBlock),
	)
	bar.PercentageStyle = labelStyle
	model := operationModel{title: title, events: events, cancel: cancel, width: 80, height: 24, spinner: spin, bar: bar}
	final, err := tea.NewProgram(model, tea.WithOutput(os.Stderr)).Run()
	if err != nil {
		return err
	}
	return final.(operationModel).operationError
}

func (model operationModel) Init() tea.Cmd {
	return tea.Batch(waitForEvent(model.events), model.spinner.Tick)
}

func (model operationModel) Update(message tea.Msg) (tea.Model, tea.Cmd) {
	switch typed := message.(type) {
	case progressMessage:
		model.latest = typed.progress
		model.logs = append(model.logs, formatProgressLog(typed.progress))
		if len(model.logs) > 8 {
			model.logs = model.logs[len(model.logs)-8:]
		}
		return model, tea.Batch(waitForEvent(model.events), model.bar.SetPercent(model.fraction()))
	case completeMessage:
		model.complete = true
		model.operationError = typed.err
		if typed.err != nil {
			model.latest = progress{Phase: "failed", Detail: typed.err.Error(), Current: model.latest.Current, Total: model.latest.Total}
		} else {
			model.latest = progress{Phase: "complete", Detail: "complete", Current: model.latest.Total, Total: model.latest.Total}
		}
		return model, tea.Quit
	case tea.WindowSizeMsg:
		model.width = typed.Width
		model.height = typed.Height
		model.resizeBar()
		return model, nil
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
	var commands []tea.Cmd
	model.spinner, commands = updateSpinner(model.spinner, message, commands)
	model.bar, commands = updateProgress(model.bar, message, commands)
	return model, tea.Batch(commands...)
}

func (model operationModel) View() tea.View {
	event := model.latest
	icon := model.spinner.View()
	if model.complete {
		icon = lipgloss.NewStyle().Bold(true).Foreground(green).Render("✓")
		if model.operationError != nil {
			icon = lipgloss.NewStyle().Bold(true).Foreground(red).Render("✗")
		}
	}
	status := strings.TrimSpace(strings.Join([]string{icon, phaseBadge(event.Phase), componentStyle.Render(event.Component)}, "  "))
	lines := []string{status, labelStyle.Render(fallback(event.Detail, "Waiting for first event")), "", model.bar.ViewAs(model.fraction())}
	if len(model.logs) > 0 {
		logWidth := clamp(model.panelWidth()-8, 32, 88)
		visibleLogs := model.logs
		limit := clamp(model.height-16, 2, 8)
		if len(visibleLogs) > limit {
			visibleLogs = visibleLogs[len(visibleLogs)-limit:]
		}
		logs := make([]string, len(visibleLogs))
		for index, line := range visibleLogs {
			logs[index] = dimStyle.MaxWidth(logWidth - 4).Render(line)
		}
		logBox := lipgloss.NewStyle().Width(logWidth-4).Padding(0, 1).Border(lipgloss.RoundedBorder()).BorderForeground(surface).Render(strings.Join(logs, "\n"))
		lines = append(lines, "", labelStyle.Render("Logs"), logBox)
	}
	if !model.complete {
		lines = append(lines, "", strings.Join([]string{keyHint("q", "cancel"), keyHint("esc", "cancel"), keyHint("ctrl+c", "cancel")}, "    "))
	}
	border := surface
	if model.operationError != nil {
		border = red
	}
	return tea.NewView(panel(model.title, strings.Join(lines, "\n"), model.panelWidth(), border) + "\n")
}

func (model operationModel) panelWidth() int {
	return clamp(model.width-2, 20, 100)
}

func (model *operationModel) resizeBar() {
	model.bar.SetWidth(clamp(model.panelWidth()-8, 24, 88))
}

func (model operationModel) fraction() float64 {
	if model.latest.Total <= 0 {
		return 0
	}
	return float64(model.latest.Current) / float64(model.latest.Total)
}

func formatProgressLog(event progress) string {
	fields := []string{time.Now().Format("15:04:05"), strings.ToUpper(event.Phase), event.Component, event.Detail}
	return strings.Join(nonEmpty(fields), "  ")
}

func nonEmpty(values []string) []string {
	result := values[:0]
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			result = append(result, value)
		}
	}
	return result
}

func updateSpinner(model spinner.Model, message tea.Msg, commands []tea.Cmd) (spinner.Model, []tea.Cmd) {
	updated, command := model.Update(message)
	return updated, append(commands, command)
}

func updateProgress(model progressbar.Model, message tea.Msg, commands []tea.Cmd) (progressbar.Model, []tea.Cmd) {
	updated, command := model.Update(message)
	return updated, append(commands, command)
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
