package main

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	tea "charm.land/bubbletea/v2"
)

type backupChoice struct {
	Archive  string
	Metadata backupMetadata
}

func runRollback(ctx context.Context, value paths, componentID string, stderr io.Writer) error {
	lock, err := acquireOperationLock(value, "rollback")
	if err != nil {
		return err
	}
	defer lock.release()
	if err := waitForOpenCodeExit(ctx); err != nil {
		return err
	}
	if err := recoverTransaction(value, nil); err != nil {
		return err
	}
	choice, err := selectRollbackChoice(componentID, value)
	if err != nil {
		return err
	}
	operation := func(worker context.Context, report reporter) error {
		return rollbackBackup(worker, value, choice, report)
	}
	if interactiveTerminal() {
		return runOperationTUI(ctx, "Rolling back "+choice.Metadata.ComponentID, operation)
	}
	return operation(ctx, func(event progress) {
		if event.Component == "" {
			fmt.Fprintf(stderr, "[%s] %s\n", event.Phase, event.Detail)
			return
		}
		fmt.Fprintf(stderr, "[%s] %s: %s\n", event.Phase, event.Component, event.Detail)
	})
}

func selectRollbackChoice(componentID string, value paths) (backupChoice, error) {
	choices, err := listBackupChoices(value, componentID)
	if err != nil {
		return backupChoice{}, err
	}
	if len(choices) == 0 {
		if componentID == "" {
			return backupChoice{}, errors.New("no component backup is available")
		}
		return backupChoice{}, fmt.Errorf("no backup is available for %s", componentID)
	}
	if componentID != "" {
		return choices[0], nil
	}
	if !interactiveTerminal() {
		return backupChoice{}, errors.New("component id is required outside an interactive terminal")
	}
	return selectBackupTUI(choices)
}

func listBackupChoices(value paths, componentID string) ([]backupChoice, error) {
	pattern := filepath.Join(value.BackupRoot, "*", "*.json")
	paths, err := filepath.Glob(pattern)
	if err != nil {
		return nil, err
	}
	choices := []backupChoice{}
	for _, metadataPath := range paths {
		contents, err := os.ReadFile(metadataPath)
		if err != nil {
			return nil, err
		}
		var metadata backupMetadata
		if err := json.Unmarshal(contents, &metadata); err != nil {
			continue
		}
		if metadata.SchemaVersion != 1 || metadata.ComponentID == "" || metadata.Target == "" || metadata.RunID == "" {
			continue
		}
		if metadata.ComponentID == selfUpdateComponentID || metadata.ComponentID == selfUpdateBinaryID || metadata.ComponentID == selfUpdatePluginID || pathOverlaps(metadata.Target, value.PluginRoot) {
			continue
		}
		if componentID != "" && metadata.ComponentID != componentID {
			continue
		}
		archive := strings.TrimSuffix(metadataPath, ".json") + ".tar.gz"
		if _, err := os.Stat(archive); err != nil {
			continue
		}
		choices = append(choices, backupChoice{Archive: archive, Metadata: metadata})
	}
	sort.Slice(choices, func(left, right int) bool {
		if choices[left].Metadata.CreatedAt == choices[right].Metadata.CreatedAt {
			return choices[left].Archive > choices[right].Archive
		}
		return choices[left].Metadata.CreatedAt > choices[right].Metadata.CreatedAt
	})
	return choices, nil
}

func rollbackBackup(ctx context.Context, value paths, choice backupChoice, report reporter) error {
	loaded, exists, err := loadConfig(value.ConfigPath)
	if err != nil {
		return err
	}
	if !exists {
		return errors.New("component updater config is missing")
	}
	item, found := loaded.Components[choice.Metadata.ComponentID]
	if !found || item.Target == nil {
		return fmt.Errorf("component config is unavailable: %s", choice.Metadata.ComponentID)
	}
	if pathOverlaps(*item.Target, value.PluginRoot) {
		return errors.New("updater plugin backups require self-update rollback")
	}
	if report != nil {
		report(progress{Phase: "rollback", Component: choice.Metadata.ComponentID, Detail: "verifying backup"})
	}
	componentPlan, err := stageBackupRestore(choice, item)
	if err != nil {
		return err
	}
	cleanup := true
	defer func() {
		if cleanup {
			cleanupStages([]plannedComponent{componentPlan})
		}
	}()
	plan := upgradePlan{
		SchemaVersion: 1,
		RunID:         newRunID(),
		Mode:          "strict",
		CreatedAt:     nowMillis(),
		Components:    []plannedComponent{componentPlan},
	}
	if err := saveUpgradePlan(value, plan); err != nil {
		return err
	}
	if err := ensureNoOpenCodeProcesses(); err != nil {
		return err
	}
	if report != nil {
		report(progress{Phase: "rollback", Component: componentPlan.ID, Detail: "restoring backup", Current: 0, Total: 1})
	}
	// The transaction owns this stage after it records the journal, including recovery on a later error.
	cleanup = false
	_, err = applyStagedPlan(ctx, value, loaded, plan, []plannedComponent{componentPlan}, false, report)
	if err != nil {
		return err
	}
	return nil
}

func stageBackupRestore(choice backupChoice, item component) (plannedComponent, error) {
	if item.Target == nil || !samePath(*item.Target, choice.Metadata.Target) {
		return plannedComponent{}, fmt.Errorf("backup target changed for %s", choice.Metadata.ComponentID)
	}
	if err := assertSecureDirectory(*item.Target); err != nil {
		return plannedComponent{}, err
	}
	digest, err := verifyArchive(choice.Archive)
	if err != nil {
		return plannedComponent{}, err
	}
	if digest != choice.Metadata.ArchiveSHA256 {
		return plannedComponent{}, errors.New("backup archive checksum mismatch")
	}
	manifestPaths, err := normalizeManifestPaths(choice.Metadata.Paths)
	if err != nil || len(manifestPaths) == 0 {
		return plannedComponent{}, errors.New("backup metadata has invalid paths")
	}
	stage, err := os.MkdirTemp(filepath.Dir(*item.Target), ".component-updater-rollback-"+safeName(choice.Metadata.ComponentID)+"-")
	if err != nil {
		return plannedComponent{}, err
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.RemoveAll(stage)
		}
	}()
	if err := extractArchive(choice.Archive, stage); err != nil {
		return plannedComponent{}, err
	}
	componentPlan := plannedComponent{
		ID:           choice.Metadata.ComponentID,
		Key:          componentKey(choice.Metadata.ComponentID, item),
		Target:       *item.Target,
		Current:      choice.Metadata.To,
		Latest:       choice.Metadata.From,
		ResultSource: "backup",
		Source:       sourceInfo{Type: "backup", Root: choice.Archive, Current: choice.Metadata.To},
	}
	componentPlan.SourceFingerprint = sourceFingerprint(componentPlan.Source)
	componentPlan.ConfigFingerprint = componentFingerprint(item)
	componentPlan.PlanSHA256 = planDigest(componentPlan)
	componentPlan.Stage = stage
	manifest := stageManifest{SchemaVersion: 2, PlanSHA256: componentPlan.PlanSHA256, Paths: manifestPaths}
	if err := writeJSONAtomic(filepath.Join(stage, manifestFile), manifest); err != nil {
		return plannedComponent{}, err
	}
	validated, err := validateManifest(item, componentPlan, stage)
	if err != nil {
		return plannedComponent{}, err
	}
	componentPlan.Manifest = validated
	cleanup = false
	return componentPlan, nil
}

func extractArchive(archive, destination string) error {
	input, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer input.Close()
	gzipReader, err := gzip.NewReader(input)
	if err != nil {
		return err
	}
	defer gzipReader.Close()
	tarReader := tar.NewReader(gzipReader)
	seen := map[string]bool{}
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		relative, err := normalizeRelativePath(strings.TrimSuffix(header.Name, "/"))
		if err != nil {
			return fmt.Errorf("unsafe archive path: %w", err)
		}
		if seen[relative] {
			return fmt.Errorf("duplicate archive entry: %s", relative)
		}
		seen[relative] = true
		path, err := resolveChild(destination, relative)
		if err != nil {
			return err
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(path, 0o700); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
				return err
			}
			output, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, fs.FileMode(header.Mode)&0o777)
			if err != nil {
				return err
			}
			_, copyErr := io.Copy(output, tarReader)
			syncErr := output.Sync()
			closeErr := output.Close()
			if copyErr != nil {
				return copyErr
			}
			if syncErr != nil {
				return syncErr
			}
			if closeErr != nil {
				return closeErr
			}
		default:
			return fmt.Errorf("unsupported archive entry: %s", header.Name)
		}
	}
}

type backupSelectorModel struct {
	choices  []backupChoice
	cursor   int
	selected *backupChoice
	err      error
}

func selectBackupTUI(choices []backupChoice) (backupChoice, error) {
	model := backupSelectorModel{choices: choices}
	final, err := tea.NewProgram(model, tea.WithOutput(os.Stderr)).Run()
	if err != nil {
		return backupChoice{}, err
	}
	selection := final.(backupSelectorModel)
	if selection.err != nil {
		return backupChoice{}, selection.err
	}
	if selection.selected == nil {
		return backupChoice{}, errors.New("rollback cancelled")
	}
	return *selection.selected, nil
}

func (model backupSelectorModel) Init() tea.Cmd {
	return nil
}

func (model backupSelectorModel) Update(message tea.Msg) (tea.Model, tea.Cmd) {
	if key, ok := message.(tea.KeyPressMsg); ok {
		switch key.String() {
		case "up", "k":
			if model.cursor > 0 {
				model.cursor--
			}
		case "down", "j":
			if model.cursor < len(model.choices)-1 {
				model.cursor++
			}
		case "enter":
			selected := model.choices[model.cursor]
			model.selected = &selected
			return model, tea.Quit
		case "q", "esc", "ctrl+c":
			model.err = errors.New("rollback cancelled")
			return model, tea.Quit
		}
	}
	return model, nil
}

func (model backupSelectorModel) View() tea.View {
	lines := []string{"Select backup to restore", ""}
	for index, choice := range model.choices {
		marker := " "
		if index == model.cursor {
			marker = ">"
		}
		lines = append(lines, fmt.Sprintf("%s %s  %s -> %s  %s", marker, choice.Metadata.ComponentID, choice.Metadata.From, choice.Metadata.To, timestamp(choice.Metadata.CreatedAt)))
	}
	lines = append(lines, "", "up/down: select    enter: restore    q: exit")
	return tea.NewView(strings.Join(lines, "\n") + "\n")
}
