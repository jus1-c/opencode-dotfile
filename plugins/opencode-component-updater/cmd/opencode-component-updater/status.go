package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"charm.land/lipgloss/v2"
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
	configState := value.ConfigPath
	if !exists {
		configState = "missing (" + value.ConfigPath + ")"
	}
	sections := []string{strings.Join([]string{
		statusField("Config", configState),
		statusField("Processes", fmt.Sprint(len(processes))),
		statusField("Live mode", liveModeLabel()),
		statusField("Journal", fileState(value.JournalPath)),
		statusField("Backups", fmt.Sprint(backupCount(value.BackupRoot))),
	}, "\n")}
	if cached.SelfUpdate != nil {
		sections = append(sections, componentStatusBlock(selfUpdateComponentID, *cached.SelfUpdate))
	}
	if exists {
		for _, id := range managedComponentIDs(value, loaded.Components) {
			item := loaded.Components[id]
			entry := cached.Components[componentKey(id, item)]
			if !item.Enabled {
				entry.LastGood = &checkResult{Status: "disabled", Summary: "Disabled"}
			}
			sections = append(sections, componentStatusBlock(id, entry))
		}
	}
	writeStyled(out, panel("Component Status", strings.Join(sections, "\n"+dimStyle.Render(strings.Repeat("─", clamp(outputWidth(out)-8, 20, 88)))+"\n"), outputWidth(out), surface))
	return nil
}

func printSelfUpdateStatus(out io.Writer, entry componentState) {
	writeStyled(out, componentStatusBlock(selfUpdateComponentID, entry))
}

func componentStatusBlock(id string, entry componentState) string {
	good := entry.LastGood
	status := "not checked"
	summary := "Not checked"
	if good != nil {
		status = good.Status
		summary = good.Summary
	}
	heading := componentStyle.Render(id) + "  " + statusBadge(status)
	lines := []string{heading, labelStyle.Render(summary)}
	if good != nil && good.Status != "disabled" {
		current := displayVersion(fallback(good.Current, "unknown"))
		latest := displayVersion(fallback(good.Latest, "unknown"))
		lines = append(lines, statusField("Version", current+" → "+latest), statusField("Checked", humanTimestamp(good.CheckedAt)))
	}
	if entry.LastAttempt != nil && (good == nil || entry.LastAttempt.CheckedAt != good.CheckedAt) {
		lines = append(lines, statusField("Last attempt", humanTimestamp(entry.LastAttempt.CheckedAt)+" • "+entry.LastAttempt.Summary))
	}
	if entry.LastApplied != nil {
		lines = append(lines, statusField("Last applied", humanTimestamp(entry.LastApplied.AppliedAt)), statusField("Last backup", fallback(entry.LastApplied.Backup, "none")))
	}
	return strings.Join(lines, "\n")
}

func printDoctor(value paths, out io.Writer) error {
	loaded, exists, err := loadConfig(value.ConfigPath)
	if err != nil {
		return err
	}
	processes, processErr := findOpenCodeProcesses()
	lines := []string{
		doctorLine(exists, "config", doctorState(exists, value.ConfigPath)),
		doctorLine(fileState(value.StatePath) == "present", "state", fileState(value.StatePath)),
		doctorLine(fileState(value.JournalPath) == "present", "journal", fileState(value.JournalPath)),
		doctorLine(pathContainsExecutable(), "binary in PATH", fmt.Sprint(pathContainsExecutable())),
		doctorLine(fileState(value.PluginRoot) == "present", "updater plugin", doctorState(fileState(value.PluginRoot) == "present", value.PluginRoot)),
		doctorLine(detectLiveService().Reload, "live reload", liveModeLabel()),
	}
	if processErr != nil {
		lines = append(lines, "", doctorLine(false, "OpenCode processes", processErr.Error()))
	} else {
		lines = append(lines, "", labelStyle.Render(fmt.Sprintf("OpenCode processes: %d", len(processes))))
		for _, process := range processes {
			lines = append(lines, fmt.Sprintf("  %s  %s", componentStyle.Render(fmt.Sprintf("pid %-7d", process.PID)), dimStyle.Render(fallback(process.Executable, process.Command))))
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
				lines = append(lines, doctorLine(false, id, "target: "+err.Error()))
				continue
			}
			if !info.IsDir() {
				lines = append(lines, doctorLine(false, id, "target is not a directory"))
			} else {
				lines = append(lines, doctorLine(true, id, "target ok"))
			}
		}
	}
	writeStyled(out, panel("Doctor", strings.Join(lines, "\n"), outputWidth(out), surface))
	return nil
}

func statusField(label, value string) string {
	return fmt.Sprintf("%-13s %s", labelStyle.Render(label), bodyStyle.Render(value))
}

func doctorLine(ok bool, label, detail string) string {
	symbol, color := "✗", red
	if ok {
		symbol, color = "✓", green
	}
	return lipgloss.NewStyle().Bold(true).Foreground(color).Render(symbol) + "  " + fmt.Sprintf("%-16s %s", labelStyle.Render(label), bodyStyle.Render(detail))
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

// liveModeLabel describes whether component changes can be applied without a
// restart.
func liveModeLabel() string {
	if service := detectLiveService(); service.Reload {
		return "live reload (OpenCode " + service.Version + ")"
	}
	if allowRunning || os.Getenv("OPENCODE_COMPONENT_UPDATER_ALLOW_RUNNING") == "1" {
		return "forced (--allow-running)"
	}
	return "requires OpenCode exit"
}

func sortedStrings(values []string) []string {
	sort.Strings(values)
	return values
}
