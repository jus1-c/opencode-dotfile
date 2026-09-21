package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"time"
)

func printStatus(value paths, out io.Writer) error {
	loaded, exists, err := loadConfig(value.ConfigPath)
	if err != nil {
		return err
	}
	cached, err := loadState(value.StatePath)
	if err != nil {
		return err
	}
	processes, err := findOpenCodeProcesses()
	if err != nil {
		return err
	}
	if exists {
		fmt.Fprintf(out, "Config: %s\n", value.ConfigPath)
	} else {
		fmt.Fprintf(out, "Config: missing (%s)\n", value.ConfigPath)
	}
	fmt.Fprintf(out, "OpenCode processes: %d\n", len(processes))
	fmt.Fprintf(out, "Journal: %s\n", fileState(value.JournalPath))
	fmt.Fprintf(out, "Backups: %d\n", backupCount(value.BackupRoot))
	if cached.SelfUpdate != nil {
		printSelfUpdateStatus(out, *cached.SelfUpdate)
	}
	if !exists {
		return nil
	}
	for _, id := range managedComponentIDs(value, loaded.Components) {
		item := loaded.Components[id]
		entry := cached.Components[componentKey(id, item)]
		good := entry.LastGood
		displayed := displayedCheck(entry)
		status := "not checked"
		summary := "Not checked"
		if !item.Enabled {
			status = "disabled"
			summary = "Disabled"
		} else if displayed != nil {
			status = displayed.Status
			summary = displayed.Summary
		}
		fmt.Fprintf(out, "\n%s\n  status: %s\n  summary: %s\n", id, status, summary)
		if good != nil {
			fmt.Fprintf(out, "  installed: %s\n  cached latest: %s\n  last good check: %s\n", fallback(good.Current, "unknown"), fallback(good.Latest, "unknown"), timestamp(good.CheckedAt))
		}
		if entry.LastAttempt != nil && (good == nil || entry.LastAttempt.CheckedAt != good.CheckedAt) {
			fmt.Fprintf(out, "  last attempt: %s (%s)\n", timestamp(entry.LastAttempt.CheckedAt), entry.LastAttempt.Summary)
		}
		if entry.LastApplied != nil {
			fmt.Fprintf(out, "  last applied: %s\n  last backup: %s\n", timestamp(entry.LastApplied.AppliedAt), fallback(entry.LastApplied.Backup, "none"))
		}
	}
	return nil
}

// displayedCheck prefers the last verified result but falls back to the most
// recent attempt so a component whose first check failed is not shown as
// "not checked".
func displayedCheck(entry componentState) *checkResult {
	if entry.LastGood != nil {
		return entry.LastGood
	}
	return entry.LastAttempt
}

func printSelfUpdateStatus(out io.Writer, entry componentState) {
	good := entry.LastGood
	displayed := displayedCheck(entry)
	status := "not checked"
	summary := "Not checked"
	if displayed != nil {
		status = displayed.Status
		summary = displayed.Summary
	}
	fmt.Fprintf(out, "\n%s\n  status: %s\n  summary: %s\n", selfUpdateComponentID, status, summary)
	if good != nil {
		fmt.Fprintf(out, "  installed: %s\n  cached latest: %s\n  last good check: %s\n", fallback(good.Current, "unknown"), fallback(good.Latest, "unknown"), timestamp(good.CheckedAt))
	}
	if entry.LastAttempt != nil && (good == nil || entry.LastAttempt.CheckedAt != good.CheckedAt) {
		fmt.Fprintf(out, "  last attempt: %s (%s)\n", timestamp(entry.LastAttempt.CheckedAt), entry.LastAttempt.Summary)
	}
	if entry.LastApplied != nil {
		fmt.Fprintf(out, "  last applied: %s\n  last backup: %s\n", timestamp(entry.LastApplied.AppliedAt), fallback(entry.LastApplied.Backup, "none"))
	}
}

func printDoctor(value paths, out io.Writer) error {
	loaded, exists, err := loadConfig(value.ConfigPath)
	if err != nil {
		return err
	}
	processes, processErr := findOpenCodeProcesses()
	fmt.Fprintf(out, "config: %s\n", doctorState(exists, value.ConfigPath))
	fmt.Fprintf(out, "state: %s\n", fileState(value.StatePath))
	fmt.Fprintf(out, "journal: %s\n", fileState(value.JournalPath))
	fmt.Fprintf(out, "binary directory in PATH: %t\n", pathContainsExecutable())
	fmt.Fprintf(out, "updater plugin directory: %s\n", doctorState(fileState(value.PluginRoot) == "present", value.PluginRoot))
	if processErr != nil {
		fmt.Fprintf(out, "opencode processes: error: %v\n", processErr)
	} else {
		fmt.Fprintf(out, "opencode processes: %d\n", len(processes))
		for _, process := range processes {
			fmt.Fprintf(out, "  pid %d: %s\n", process.PID, fallback(process.Executable, process.Command))
		}
	}
	if exists {
		ids := managedComponentIDs(value, loaded.Components)
		for _, id := range ids {
			item := loaded.Components[id]
			if item.Target == nil {
				continue
			}
			info, err := os.Stat(*item.Target)
			if err != nil {
				fmt.Fprintf(out, "component %s target: error: %v\n", id, err)
				continue
			}
			if !info.IsDir() {
				fmt.Fprintf(out, "component %s target: not a directory\n", id)
			}
		}
	}
	return nil
}

func backupCount(root string) int {
	entries, err := os.ReadDir(root)
	if err != nil {
		return 0
	}
	count := 0
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		archives, _ := filepath.Glob(filepath.Join(root, entry.Name(), "*.tar.gz"))
		count += len(archives)
	}
	return count
}

func fileState(path string) string {
	if _, err := os.Stat(path); err == nil {
		return "present"
	}
	return "missing"
}

func doctorState(exists bool, path string) string {
	if exists {
		return "present (" + path + ")"
	}
	return "missing (" + path + ")"
}

func pathContainsExecutable() bool {
	directory := filepath.Dir(os.Args[0])
	for _, entry := range filepath.SplitList(os.Getenv("PATH")) {
		if entry == directory {
			return true
		}
	}
	return false
}

func fallback(value, defaultValue string) string {
	if value == "" {
		return defaultValue
	}
	return value
}

func timestamp(value int64) string {
	if value <= 0 {
		return "never"
	}
	return time.UnixMilli(value).UTC().Format(time.RFC3339)
}

func sortedStrings(values []string) []string {
	sort.Strings(values)
	return values
}
