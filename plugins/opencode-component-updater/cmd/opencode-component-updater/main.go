package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"charm.land/lipgloss/v2"
)

var version = "dev"
var commit = "unknown"

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		printUsage(stdout)
		return 0
	}

	paths, err := resolvePaths()
	if err != nil {
		printError(stderr, err)
		return 1
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	allowRunning = hasFlag(args[1:], "--allow-running")
	if allowRunning {
		args = append([]string{args[0]}, removeFlag(args[1:], "--allow-running")...)
	}

	switch args[0] {
	case "version":
		writeStyled(stdout, fmt.Sprintf("%s  %s  %s", titleStyle.Render("opencode-component-updater"), bodyStyle.Render(version), dimStyle.Render(commit)))
		return 0
	case "check":
		quiet, err := parseCheckArgs(args[1:])
		if err != nil {
			printError(stderr, err)
			return 2
		}
		if err := runCheck(ctx, paths, quiet, stderr); err != nil {
			if !errors.Is(err, context.Canceled) {
				printError(stderr, err)
			}
			return 1
		}
		return 0
	case "upgrade":
		bestEffort, err := parseUpgradeArgs(args[1:])
		if err != nil {
			printError(stderr, err)
			return 2
		}
		if err := runUpgrade(ctx, paths, bestEffort, stderr); err != nil {
			if !errors.Is(err, context.Canceled) {
				printError(stderr, err)
			}
			var partial *partialUpgradeError
			if errors.As(err, &partial) {
				return 4
			}
			return 1
		}
		return 0
	case "rollback":
		componentID, err := parseRollbackArgs(args[1:])
		if err != nil {
			printError(stderr, err)
			return 2
		}
		if err := runRollback(ctx, paths, componentID, stderr); err != nil {
			if !errors.Is(err, context.Canceled) {
				printError(stderr, err)
			}
			return 1
		}
		return 0
	case "self-update":
		action, expected, err := parseSelfUpdateArgs(args[1:])
		if err != nil {
			printError(stderr, err)
			return 2
		}
		var runErr error
		switch action {
		case "check":
			runErr = runSelfUpdateCheck(ctx, paths, stdout)
		case "apply":
			runErr = runSelfUpdate(ctx, paths, expected, stderr)
		case "rollback":
			runErr = runSelfUpdateRollback(ctx, paths, stderr)
		}
		if runErr != nil {
			if !errors.Is(runErr, context.Canceled) {
				printError(stderr, runErr)
			}
			return 1
		}
		return 0
	case "status":
		if len(args) != 1 {
			printError(stderr, errors.New("status takes no arguments"))
			return 2
		}
		if err := printStatus(paths, stdout); err != nil {
			printError(stderr, err)
			return 1
		}
		return 0
	case "doctor":
		if len(args) != 1 {
			printError(stderr, errors.New("doctor takes no arguments"))
			return 2
		}
		if err := printDoctor(paths, stdout); err != nil {
			printError(stderr, err)
			return 1
		}
		return 0
	default:
		printError(stderr, fmt.Errorf("unknown command %q", args[0]))
		printUsage(stderr)
		return 2
	}
}

func hasFlag(args []string, flag string) bool {
	for _, arg := range args {
		if arg == flag {
			return true
		}
	}
	return false
}

func removeFlag(args []string, flag string) []string {
	output := make([]string, 0, len(args))
	for _, arg := range args {
		if arg != flag {
			output = append(output, arg)
		}
	}
	return output
}

func parseCheckArgs(args []string) (bool, error) {
	quiet := false
	for _, arg := range args {
		switch arg {
		case "--quiet":
			quiet = true
		default:
			return false, fmt.Errorf("unknown check option %q", arg)
		}
	}
	return quiet, nil
}

func parseUpgradeArgs(args []string) (bool, error) {
	bestEffort := false
	for _, arg := range args {
		switch arg {
		case "--best-effort":
			bestEffort = true
		default:
			return false, fmt.Errorf("unknown upgrade option %q", arg)
		}
	}
	return bestEffort, nil
}

func parseRollbackArgs(args []string) (string, error) {
	if len(args) > 1 {
		return "", errors.New("rollback accepts at most one component id")
	}
	if len(args) == 0 {
		return "", nil
	}
	if args[0] == "" {
		return "", errors.New("component id must not be empty")
	}
	return args[0], nil
}

func printUsage(out io.Writer) {
	commands := []struct{ name, args, description string }{
		{"check", "[--quiet]", "Check all components for updates"},
		{"upgrade", "[--best-effort] [--allow-running]", "Upgrade managed components"},
		{"rollback", "[component-id] [--allow-running]", "Restore a previous backup"},
		{"self-update", "[check|apply [commit]|rollback] [--allow-running]", "Manage the updater itself"},
		{"status", "", "Show component status"},
		{"doctor", "", "Diagnose configuration and targets"},
		{"version", "", "Print version and commit"},
	}
	lines := []string{
		titleStyle.Render("opencode-component-updater") + bodyStyle.Render(" — OpenCode component lifecycle manager"),
		"",
		titleStyle.Render("USAGE"),
		"  " + componentStyle.Render("opencode-component-updater") + " " + labelStyle.Render("<command> [options]"),
		"",
		titleStyle.Render("COMMANDS"),
	}
	for _, command := range commands {
		invocation := command.name
		if command.args != "" {
			invocation += " " + command.args
		}
		lines = append(lines, fmt.Sprintf("  %-42s %s", componentStyle.Render(invocation), labelStyle.Render(command.description)))
	}
	lines = append(lines, "", dimStyle.Render("Run opencode-component-updater <command> --help for command options."))
	writeStyled(out, panel("Help", strings.Join(lines, "\n"), outputWidth(out), surface))
}

func printError(out io.Writer, err error) {
	prefix := lipgloss.NewStyle().Bold(true).Foreground(red).Render("✗ error:")
	writeStyled(out, prefix+" "+bodyStyle.Render(err.Error()))
}
