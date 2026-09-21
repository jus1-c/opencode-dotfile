package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

type journal struct {
	SchemaVersion int                `json:"schemaVersion"`
	RunID         string             `json:"runId"`
	Mode          string             `json:"mode"`
	Phase         string             `json:"phase"`
	Components    []journalComponent `json:"components"`
}

type journalComponent struct {
	ID        string           `json:"id"`
	Target    string           `json:"target"`
	Stage     string           `json:"stage"`
	RawBackup string           `json:"rawBackup"`
	Plan      plannedComponent `json:"plan"`
	Moves     []journalMove    `json:"moves"`
	Committed bool             `json:"committed"`
	Archived  bool             `json:"archived"`
}

type journalMove struct {
	Path       string `json:"path"`
	OldExisted bool   `json:"oldExisted"`
	OldMoved   bool   `json:"oldMoved"`
	NewMoved   bool   `json:"newMoved"`
}

func loadJournal(path string) (*journal, error) {
	contents, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var value journal
	if err := json.Unmarshal(contents, &value); err != nil {
		return nil, fmt.Errorf("parse journal: %w", err)
	}
	if value.SchemaVersion != 1 || value.RunID == "" || value.Phase == "" {
		return nil, errors.New("journal is invalid")
	}
	return &value, nil
}

func saveJournal(value paths, journal journal) error {
	return writeJSONAtomic(value.JournalPath, journal)
}

func removeJournal(value paths) error {
	if err := os.Remove(value.JournalPath); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return syncDirectory(filepath.Dir(value.JournalPath))
}

func recoverTransaction(value paths, report reporter) error {
	current, err := loadJournal(value.JournalPath)
	if err != nil || current == nil {
		return err
	}
	if err := ensureNoOpenCodeProcesses(); err != nil {
		return err
	}
	if current.Phase == "batch-committed" || current.Phase == "archiving" {
		for index := range current.Components {
			if current.Components[index].Archived {
				continue
			}
			if report != nil {
				report(progress{Phase: "recover", Component: current.Components[index].ID, Detail: "archiving committed backup"})
			}
			if err := archiveComponentBackup(value, current.RunID, &current.Components[index]); err != nil {
				return err
			}
			current.Components[index].Archived = true
			current.Phase = "archiving"
			if err := saveJournal(value, *current); err != nil {
				return err
			}
		}
		return finalizeCommittedTransaction(value, current)
	}
	if report != nil {
		report(progress{Phase: "recover", Detail: "restoring interrupted transaction"})
	}
	for index := len(current.Components) - 1; index >= 0; index-- {
		if err := restoreJournalComponent(&current.Components[index]); err != nil {
			return err
		}
	}
	return removeJournal(value)
}

func applyStagedPlan(ctx context.Context, value paths, settings config, plan upgradePlan, staged []plannedComponent, bestEffort bool, report reporter) ([]string, error) {
	journal := journal{SchemaVersion: 1, RunID: plan.RunID, Mode: plan.Mode, Phase: "applying"}
	for _, componentPlan := range staged {
		backup, err := os.MkdirTemp(filepath.Dir(componentPlan.Target), ".component-updater-backup-"+safeName(componentPlan.ID)+"-")
		if err != nil {
			cleanupStages(staged)
			cleanupRawBackups(journal.Components)
			return nil, err
		}
		journal.Components = append(journal.Components, journalComponent{
			ID:        componentPlan.ID,
			Target:    componentPlan.Target,
			Stage:     componentPlan.Stage,
			RawBackup: backup,
			Plan:      componentPlan,
		})
	}
	if err := saveJournal(value, journal); err != nil {
		// The journal may have been renamed before its directory sync failed; preserve recovery inputs.
		return nil, err
	}
	failures := []string{}
	for index := range journal.Components {
		if err := ctx.Err(); err != nil {
			if rollbackErr := rollbackJournal(value, &journal, report); rollbackErr != nil {
				return nil, rollbackErr
			}
			return nil, err
		}
		if err := ensureNoOpenCodeProcesses(); err != nil {
			if rollbackErr := rollbackJournal(value, &journal, report); rollbackErr != nil {
				return nil, rollbackErr
			}
			return nil, err
		}
		componentJournal := &journal.Components[index]
		if report != nil {
			report(progress{Phase: "apply", Component: componentJournal.ID, Detail: "swapping files", Current: index, Total: len(journal.Components)})
		}
		if err := applyJournalComponent(value, &journal, componentJournal); err != nil {
			failure := componentJournal.ID + ": " + sanitizeSummary(err.Error())
			if !bestEffort {
				if rollbackErr := rollbackJournal(value, &journal, report); rollbackErr != nil {
					return nil, rollbackErr
				}
				return nil, &preflightError{Failures: []string{failure}}
			}
			if restoreErr := restoreJournalComponent(componentJournal); restoreErr != nil {
				return nil, restoreErr
			}
			failures = append(failures, failure)
			continue
		}
		componentJournal.Committed = true
		if err := saveJournal(value, journal); err != nil {
			return nil, err
		}
		if report != nil {
			report(progress{Phase: "apply", Component: componentJournal.ID, Detail: "complete", Current: index + 1, Total: len(journal.Components)})
		}
	}
	committed := committedComponents(journal.Components)
	if len(committed) == 0 {
		if err := rollbackJournal(value, &journal, report); err != nil {
			return nil, err
		}
		return failures, nil
	}
	journal.Phase = "batch-committed"
	if err := saveJournal(value, journal); err != nil {
		return nil, err
	}
	for index := range journal.Components {
		componentJournal := &journal.Components[index]
		if !componentJournal.Committed {
			_ = os.RemoveAll(componentJournal.RawBackup)
			_ = os.RemoveAll(componentJournal.Stage)
			continue
		}
		if report != nil {
			report(progress{Phase: "archive", Component: componentJournal.ID, Detail: "compressing backup", Current: index, Total: len(journal.Components)})
		}
		if err := archiveComponentBackup(value, journal.RunID, componentJournal); err != nil {
			return failures, err
		}
		componentJournal.Archived = true
		journal.Phase = "archiving"
		if err := saveJournal(value, journal); err != nil {
			return failures, err
		}
		if report != nil {
			report(progress{Phase: "archive", Component: componentJournal.ID, Detail: "complete", Current: index + 1, Total: len(journal.Components)})
		}
	}
	if err := finalizeCommittedTransaction(value, &journal); err != nil {
		return failures, err
	}
	return failures, nil
}

func cleanupRawBackups(components []journalComponent) {
	for _, component := range components {
		_ = os.RemoveAll(component.RawBackup)
	}
}

func applyJournalComponent(value paths, current *journal, componentJournal *journalComponent) error {
	item := componentJournal.Plan
	for _, path := range item.Manifest.Paths {
		move := journalMove{Path: path}
		currentPath, err := resolveChild(componentJournal.Target, path)
		if err != nil {
			return err
		}
		stagePath, err := resolveChild(componentJournal.Stage, path)
		if err != nil {
			return err
		}
		backupPath, err := resolveChild(componentJournal.RawBackup, path)
		if err != nil {
			return err
		}
		if _, err := os.Lstat(currentPath); err == nil {
			move.OldExisted = true
		} else if !errors.Is(err, fs.ErrNotExist) {
			return err
		}
		componentJournal.Moves = append(componentJournal.Moves, move)
		moveIndex := len(componentJournal.Moves) - 1
		// Persist intent before moving anything so recovery always knows this path.
		if err := saveJournal(value, *current); err != nil {
			return err
		}
		if move.OldExisted {
			if err := os.MkdirAll(filepath.Dir(backupPath), 0o700); err != nil {
				return err
			}
			if err := os.Rename(currentPath, backupPath); err != nil {
				return err
			}
			componentJournal.Moves[moveIndex].OldMoved = true
			if err := saveJournal(value, *current); err != nil {
				return err
			}
		}
		if err := os.MkdirAll(filepath.Dir(currentPath), 0o700); err != nil {
			return err
		}
		if err := os.Rename(stagePath, currentPath); err != nil {
			return err
		}
		componentJournal.Moves[moveIndex].NewMoved = true
		if err := saveJournal(value, *current); err != nil {
			return err
		}
	}
	return os.RemoveAll(componentJournal.Stage)
}

func restoreJournalComponent(componentJournal *journalComponent) error {
	for index := len(componentJournal.Moves) - 1; index >= 0; index-- {
		move := componentJournal.Moves[index]
		currentPath, err := resolveChild(componentJournal.Target, move.Path)
		if err != nil {
			return err
		}
		stagePath, err := resolveChild(componentJournal.Stage, move.Path)
		if err != nil {
			return err
		}
		backupPath, err := resolveChild(componentJournal.RawBackup, move.Path)
		if err != nil {
			return err
		}
		backupExists, err := pathExists(backupPath)
		if err != nil {
			return err
		}
		currentExists, err := pathExists(currentPath)
		if err != nil {
			return err
		}
		stageExists, err := pathExists(stagePath)
		if err != nil {
			return err
		}
		if backupExists {
			if currentExists {
				if stageExists {
					return fmt.Errorf("recovery state is ambiguous for %s", move.Path)
				}
				if err := os.MkdirAll(filepath.Dir(stagePath), 0o700); err != nil {
					return err
				}
				if err := os.Rename(currentPath, stagePath); err != nil {
					return err
				}
			}
			if err := os.MkdirAll(filepath.Dir(currentPath), 0o700); err != nil {
				return err
			}
			if err := os.Rename(backupPath, currentPath); err != nil {
				return err
			}
			continue
		}
		// With no original path, a missing staged path means the new path won the swap.
		if !move.OldExisted && currentExists && !stageExists {
			if err := os.MkdirAll(filepath.Dir(stagePath), 0o700); err != nil {
				return err
			}
			if err := os.Rename(currentPath, stagePath); err != nil {
				return err
			}
		}
	}
	_ = os.RemoveAll(componentJournal.Stage)
	_ = os.RemoveAll(componentJournal.RawBackup)
	return nil
}

func pathExists(path string) (bool, error) {
	_, err := os.Lstat(path)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	return err == nil, err
}

func rollbackJournal(value paths, current *journal, report reporter) error {
	current.Phase = "rolling-back"
	if err := saveJournal(value, *current); err != nil {
		return err
	}
	for index := len(current.Components) - 1; index >= 0; index-- {
		if report != nil {
			report(progress{Phase: "rollback", Component: current.Components[index].ID, Detail: "restoring backup"})
		}
		if err := restoreJournalComponent(&current.Components[index]); err != nil {
			return err
		}
	}
	return removeJournal(value)
}

func committedComponents(components []journalComponent) []journalComponent {
	output := []journalComponent{}
	for _, component := range components {
		if component.Committed {
			output = append(output, component)
		}
	}
	return output
}

func finalizeCommittedTransaction(value paths, current *journal) error {
	cached, err := loadState(value.StatePath)
	if err != nil {
		return err
	}
	var selfApplied *appliedRecord
	for _, componentJournal := range current.Components {
		if !componentJournal.Committed {
			continue
		}
		if componentJournal.Plan.SelfUpdate {
			if componentJournal.ID == selfUpdateBinaryID || selfApplied == nil {
				selfApplied = &appliedRecord{
					AppliedAt: nowMillis(),
					From:      componentJournal.Plan.Current,
					To:        componentJournal.Plan.Latest,
					RunID:     current.RunID,
					Backup:    backupArchivePath(value, componentJournal.ID, current.RunID),
				}
			}
			continue
		}
		entry := cached.Components[componentJournal.Plan.Key]
		entry.LastApplied = &appliedRecord{
			AppliedAt: nowMillis(),
			From:      componentJournal.Plan.Current,
			To:        componentJournal.Plan.Latest,
			RunID:     current.RunID,
			Backup:    backupArchivePath(value, componentJournal.ID, current.RunID),
		}
		cached.Components[componentJournal.Plan.Key] = entry
	}
	if selfApplied != nil {
		entry := componentState{}
		if cached.SelfUpdate != nil {
			entry = *cached.SelfUpdate
		}
		entry.LastApplied = selfApplied
		cached.SelfUpdate = &entry
	}
	if err := saveState(value.StatePath, cached); err != nil {
		return err
	}
	return removeJournal(value)
}
