package main

import (
	"fmt"
	"image/color"
	"io"
	"strings"
	"time"

	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
	"github.com/charmbracelet/x/term"
)

var (
	mauve    = lipgloss.Color("#c6a0f6")
	lavender = lipgloss.Color("#b7bdf8")
	text     = lipgloss.Color("#cad3f5")
	subtext  = lipgloss.Color("#b8c0e0")
	overlay  = lipgloss.Color("#6e738d")
	surface  = lipgloss.Color("#494d64")
	green    = lipgloss.Color("#a6da95")
	yellow   = lipgloss.Color("#eed49f")
	peach    = lipgloss.Color("#f5a97f")
	sapphire = lipgloss.Color("#7dc4e4")
	red      = lipgloss.Color("#ed8796")

	titleStyle     = lipgloss.NewStyle().Bold(true).Foreground(mauve)
	componentStyle = lipgloss.NewStyle().Bold(true).Foreground(lavender)
	bodyStyle      = lipgloss.NewStyle().Foreground(text)
	labelStyle     = lipgloss.NewStyle().Foreground(subtext)
	dimStyle       = lipgloss.NewStyle().Foreground(overlay)
	helpStyle      = lipgloss.NewStyle().Foreground(overlay)
)

func panel(title, body string, width int, borderColor color.Color) string {
	width = clamp(width, 20, 100)
	heading := titleStyle.Render(title)
	content := lipgloss.JoinVertical(lipgloss.Left, heading, "", body)
	return lipgloss.NewStyle().
		Width(width-4).
		Padding(0, 1).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(borderColor).
		Render(content)
}

func statusBadge(status string) string {
	symbol, color := "?", overlay
	switch status {
	case "current", "complete", "present", "ok":
		symbol, color = "●", green
	case "update-available":
		symbol, color = "↑", yellow
	case "failed", "check-error", "error", "missing":
		symbol, color = "✗", red
	case "disabled", "manual-only", "not checked", "stale":
		symbol = "–"
	}
	return lipgloss.NewStyle().Bold(true).Foreground(color).Render(symbol + " " + status)
}

func phaseBadge(phase string) string {
	color := sapphire
	switch phase {
	case "stage", "apply", "archive", "rollback", "recover", "plan":
		color = peach
	case "complete":
		color = green
	case "failed":
		color = red
	}
	return lipgloss.NewStyle().Bold(true).Foreground(color).Render(strings.ToUpper(fallback(phase, "WAITING")))
}

func keyHint(key, action string) string {
	return lipgloss.NewStyle().Bold(true).Foreground(lavender).Render(key) + " " + helpStyle.Render(action)
}

func outputWidth(out io.Writer) int {
	if file, ok := out.(interface{ Fd() uintptr }); ok {
		if width, _, err := term.GetSize(file.Fd()); err == nil && width > 0 {
			return width - 2
		}
	}
	return 80
}

func writeStyled(out io.Writer, value string) {
	if !writerIsTerminal(out) {
		value = ansi.Strip(value)
	}
	fmt.Fprintln(out, value)
}

func writerIsTerminal(out io.Writer) bool {
	file, ok := out.(interface{ Fd() uintptr })
	return ok && term.IsTerminal(file.Fd())
}

func clamp(value, minimum, maximum int) int {
	if maximum < minimum {
		return maximum
	}
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
	}
	return value
}

func humanTimestamp(value int64) string {
	if value <= 0 {
		return "never"
	}
	stamp := time.UnixMilli(value).UTC()
	return stamp.Format("Jan 2, 2006 15:04 UTC") + " (" + relativeDuration(time.Since(stamp)) + ")"
}

func relativeDuration(duration time.Duration) string {
	future := duration < 0
	if future {
		duration = -duration
	}
	minutes := int(duration.Round(time.Minute) / time.Minute)
	if minutes < 1 {
		return "just now"
	}
	days, hours := minutes/(24*60), minutes/60%24
	minutes %= 60
	parts := make([]string, 0, 2)
	if days > 0 {
		parts = append(parts, plural(days, "day"))
		if hours > 0 {
			parts = append(parts, plural(hours, "hour"))
		}
	} else {
		if hours > 0 {
			parts = append(parts, plural(hours, "hour"))
		}
		if minutes > 0 {
			parts = append(parts, plural(minutes, "minute"))
		}
	}
	result := strings.Join(parts, " and ")
	if future {
		return "in " + result
	}
	return result + " ago"
}

func plural(value int, unit string) string {
	if value != 1 {
		unit += "s"
	}
	return fmt.Sprintf("%d %s", value, unit)
}

func displayVersion(value string) string {
	if len(value) == 40 && commitPattern.MatchString(value) {
		return value[:7]
	}
	return value
}
