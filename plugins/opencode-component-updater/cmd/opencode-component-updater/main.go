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
		fmt.Fprintf(stderr, "error: %v\n", err)
		return 1
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	switch args[0] {
	case "version":
		fmt.Fprintf(stdout, "opencode-component-updater %s (%s)\n", version, commit)
		return 0
	case "check":
		quiet, err := parseCheckArgs(args[1:])
		if err != nil {
			fmt.Fprintf(stderr, "error: %v\n", err)
			return 2
		}
		if err := runCheck(ctx, paths, quiet, stderr); err != nil {
			if !errors.Is(err, context.Canceled) {
				fmt.Fprintf(stderr, "error: %v\n", err)
			}
			return 1
		}
		return 0
	case "upgrade":
		bestEffort, err := parseUpgradeArgs(args[1:])
		if err != nil {
			fmt.Fprintf(stderr, "error: %v\n", err)
			return 2
		}
		if err := runUpgrade(ctx, paths, bestEffort, stderr); err != nil {
			if !errors.Is(err, context.Canceled) {
				fmt.Fprintf(stderr, "error: %v\n", err)
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
			fmt.Fprintf(stderr, "error: %v\n", err)
			return 2
		}
		if err := runRollback(ctx, paths, componentID, stderr); err != nil {
			if !errors.Is(err, context.Canceled) {
				fmt.Fprintf(stderr, "error: %v\n", err)
			}
			return 1
		}
		return 0
	case "self-update":
		action, expected, err := parseSelfUpdateArgs(args[1:])
		if err != nil {
			fmt.Fprintf(stderr, "error: %v\n", err)
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
				fmt.Fprintf(stderr, "error: %v\n", runErr)
			}
			return 1
		}
		return 0
	case "status":
		if len(args) != 1 {
			fmt.Fprintln(stderr, "error: status takes no arguments")
			return 2
		}
		if err := printStatus(paths, stdout); err != nil {
			fmt.Fprintf(stderr, "error: %v\n", err)
			return 1
		}
		return 0
	case "doctor":
		if len(args) != 1 {
			fmt.Fprintln(stderr, "error: doctor takes no arguments")
			return 2
		}
		if err := printDoctor(paths, stdout); err != nil {
			fmt.Fprintf(stderr, "error: %v\n", err)
			return 1
		}
		return 0
	default:
		fmt.Fprintf(stderr, "error: unknown command %q\n", args[0])
		printUsage(stderr)
		return 2
	}
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
	fmt.Fprintln(out, strings.TrimSpace(`Usage:
  opencode-component-updater check [--quiet]
  opencode-component-updater upgrade [--best-effort]
  opencode-component-updater rollback [component-id]
  opencode-component-updater self-update [check|apply [commit]|rollback]
  opencode-component-updater status
  opencode-component-updater doctor
  opencode-component-updater version`))
}
