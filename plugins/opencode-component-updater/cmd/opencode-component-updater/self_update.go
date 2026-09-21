package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

const (
	selfUpdateComponentID = "plugin.opencode-component-updater"
	selfUpdateBinaryID    = "updater.binary"
	selfUpdatePluginID    = "updater.plugin"
	selfUpdateBranch      = "main"
	defaultUpdaterRemote  = "https://github.com/jus1-c/opencode-component-updater.git"
)

var selfUpdateExecutable = os.Executable

type selfUpdateTargets struct {
	Binary component
	Plugin component
}

func parseSelfUpdateArgs(args []string) (string, string, error) {
	if len(args) == 0 {
		return "check", "", nil
	}
	switch args[0] {
	case "check", "rollback":
		if len(args) != 1 {
			return "", "", fmt.Errorf("self-update %s takes no arguments", args[0])
		}
		return args[0], "", nil
	case "apply":
		if len(args) > 2 {
			return "", "", errors.New("self-update apply accepts at most one commit")
		}
		if len(args) == 2 && !commitPattern.MatchString(args[1]) {
			return "", "", errors.New("self-update commit must be a 40-character SHA")
		}
		if len(args) == 1 {
			return "apply", "", nil
		}
		return "apply", strings.ToLower(args[1]), nil
	default:
		return "", "", fmt.Errorf("unknown self-update action %q", args[0])
	}
}

func runSelfUpdateCheck(ctx context.Context, value paths, out io.Writer) error {
	lock, err := acquireOperationLock(value, "self-update-check")
	if err != nil {
		return err
	}
	defer lock.release()
	result := checkSelfUpdate(ctx, value, defaultDefaults())
	if err := saveSelfUpdateCheck(value, result); err != nil {
		return err
	}
	fmt.Fprintf(out, "%s: %s\n", result.Status, result.Summary)
	return nil
}

func runSelfUpdate(ctx context.Context, value paths, expected string, stderr io.Writer) error {
	lock, err := acquireOperationLock(value, "self-update")
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
	operation := func(worker context.Context, report reporter) error {
		return applySelfUpdate(worker, value, expected, report)
	}
	if interactiveTerminal() {
		return runOperationTUI(ctx, "Updating OpenCode Component Updater", operation)
	}
	return operation(ctx, stderrReporter(stderr))
}

func runSelfUpdateRollback(ctx context.Context, value paths, stderr io.Writer) error {
	lock, err := acquireOperationLock(value, "self-update-rollback")
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
	operation := func(worker context.Context, report reporter) error {
		return rollbackSelfUpdate(worker, value, report)
	}
	if interactiveTerminal() {
		return runOperationTUI(ctx, "Rolling Back OpenCode Component Updater", operation)
	}
	return operation(ctx, stderrReporter(stderr))
}

func stderrReporter(stderr io.Writer) reporter {
	return func(event progress) {
		if event.Component == "" {
			fmt.Fprintf(stderr, "[%s] %s\n", event.Phase, event.Detail)
			return
		}
		fmt.Fprintf(stderr, "[%s] %s: %s\n", event.Phase, event.Component, event.Detail)
	}
}

func applySelfUpdate(ctx context.Context, value paths, expected string, report reporter) error {
	if report != nil {
		report(progress{Phase: "check", Component: selfUpdateComponentID, Detail: "checking main"})
	}
	result := checkSelfUpdate(ctx, value, defaultDefaults())
	if err := saveSelfUpdateCheck(value, result); err != nil {
		return err
	}
	if result.Status != "current" && result.Status != "update-available" {
		return fmt.Errorf("self-update cannot apply: %s", result.Summary)
	}
	if expected != "" && expected != result.Latest {
		return errors.New("requested self-update commit does not match fresh main")
	}
	if result.Status == "current" {
		if report != nil {
			report(progress{Phase: "complete", Component: selfUpdateComponentID, Detail: "already current", Current: 1, Total: 1})
		}
		return nil
	}
	if report != nil {
		report(progress{Phase: "stage", Component: selfUpdateComponentID, Detail: "building checked commit", Current: 0, Total: 2})
	}
	plan, staged, err := stageSelfUpdateCandidate(ctx, value, result)
	if err != nil {
		return err
	}
	if err := saveUpgradePlan(value, plan); err != nil {
		cleanupStages(staged)
		return err
	}
	if err := ensureNoOpenCodeProcesses(); err != nil {
		cleanupStages(staged)
		return err
	}
	_, err = applyStagedPlan(ctx, value, config{}, plan, staged, false, report)
	return err
}

func rollbackSelfUpdate(ctx context.Context, value paths, report reporter) error {
	cached, err := loadState(value.StatePath)
	if err != nil {
		return err
	}
	if cached.SelfUpdate == nil || cached.SelfUpdate.LastApplied == nil || cached.SelfUpdate.LastApplied.RunID == "" {
		return errors.New("no updater self-update backup is available")
	}
	last := cached.SelfUpdate.LastApplied
	targets, err := selfUpdateTargetComponents(value)
	if err != nil {
		return err
	}
	binaryBackup, err := backupChoiceForArchive(backupArchivePath(value, selfUpdateBinaryID, last.RunID), selfUpdateBinaryID, last.RunID)
	if err != nil {
		return err
	}
	pluginBackup, err := backupChoiceForArchive(backupArchivePath(value, selfUpdatePluginID, last.RunID), selfUpdatePluginID, last.RunID)
	if err != nil {
		return err
	}
	if report != nil {
		report(progress{Phase: "rollback", Component: selfUpdateComponentID, Detail: "verifying backups", Current: 0, Total: 2})
	}
	binaryPlan, err := stageSelfUpdateBackupRestore(binaryBackup, targets.Binary)
	if err != nil {
		return err
	}
	pluginPlan, err := stageSelfUpdateBackupRestore(pluginBackup, targets.Plugin)
	if err != nil {
		cleanupStages([]plannedComponent{binaryPlan})
		return err
	}
	plan := upgradePlan{
		SchemaVersion: 1,
		RunID:         newRunID(),
		Mode:          "strict",
		CreatedAt:     nowMillis(),
		Components:    []plannedComponent{binaryPlan, pluginPlan},
	}
	if err := saveUpgradePlan(value, plan); err != nil {
		cleanupStages([]plannedComponent{binaryPlan, pluginPlan})
		return err
	}
	if err := ensureNoOpenCodeProcesses(); err != nil {
		cleanupStages([]plannedComponent{binaryPlan, pluginPlan})
		return err
	}
	_, err = applyStagedPlan(ctx, value, config{}, plan, []plannedComponent{binaryPlan, pluginPlan}, false, report)
	return err
}

func stageSelfUpdateBackupRestore(choice backupChoice, item component) (plannedComponent, error) {
	componentPlan, err := stageBackupRestore(choice, item)
	if err != nil {
		return plannedComponent{}, err
	}
	cleanup := true
	defer func() {
		if cleanup {
			cleanupStages([]plannedComponent{componentPlan})
		}
	}()
	componentPlan.SelfUpdate = true
	componentPlan.PlanSHA256 = planDigest(componentPlan)
	manifest := stageManifest{SchemaVersion: 2, PlanSHA256: componentPlan.PlanSHA256, Paths: componentPlan.Manifest.Paths}
	if err := writeJSONAtomic(filepath.Join(componentPlan.Stage, manifestFile), manifest); err != nil {
		return plannedComponent{}, err
	}
	validated, err := validateManifest(item, componentPlan, componentPlan.Stage)
	if err != nil {
		return plannedComponent{}, err
	}
	componentPlan.Manifest = validated
	cleanup = false
	return componentPlan, nil
}

func checkSelfUpdate(ctx context.Context, value paths, settings defaults) checkResult {
	result := checkResult{CheckedAt: nowMillis()}
	if _, err := selfUpdateTargetComponents(value); err != nil {
		result.Status = "manual-only"
		result.Summary = sanitizeSummary(err.Error())
		return result
	}
	current, err := selfUpdateCurrentCommit(ctx, value)
	if err != nil {
		result.Status = "check-error"
		result.Summary = sanitizeSummary(err.Error())
		return result
	}
	remote := selfUpdateRemote()
	source := sourceInfo{Type: "git", URL: sanitizeRemote(remote), Root: value.PluginRoot, Current: current}
	result.Source = &source
	result.SourceFingerprint = sourceFingerprint(source)
	if !commitPattern.MatchString(current) {
		result.Status = "manual-only"
		result.Summary = "running updater commit is unknown; rebuild with commit metadata"
		return result
	}
	output := runCommand(ctx, []string{"git", "ls-remote", remote, "refs/heads/" + selfUpdateBranch}, "", nil, settings.CheckTimeoutMS, settings.MaxOutputBytes)
	latest := outputCommit(output)
	if output.Code != 0 || latest == "" {
		result.Status = "check-error"
		result.Summary = firstOutputLine(output)
		if result.Summary == "" {
			result.Summary = fallback(output.Reason, "git ls-remote failed")
		}
		return result
	}
	result.Latest = latest
	result.Current = current
	if current == latest {
		result.Status = "current"
		result.Summary = current
		return result
	}
	result.Status = "update-available"
	result.Summary = current[:7] + " -> " + latest[:7]
	return result
}

func saveSelfUpdateCheck(value paths, result checkResult) error {
	cached, err := loadState(value.StatePath)
	if err != nil {
		return err
	}
	recordSelfUpdateCheck(&cached, result)
	return saveState(value.StatePath, cached)
}

func recordSelfUpdateCheck(cached *state, result checkResult) {
	entry := componentState{}
	if cached.SelfUpdate != nil {
		entry = *cached.SelfUpdate
	}
	entry.LastAttempt = &result
	if isGoodStatus(result.Status) && validExact(result.Current) && validExact(result.Latest) {
		good := result
		entry.LastGood = &good
	}
	cached.SelfUpdate = &entry
}

func selfUpdateCurrentCommit(ctx context.Context, value paths) (string, error) {
	if commitPattern.MatchString(commit) {
		return strings.ToLower(commit), nil
	}
	output := runCommand(ctx, []string{"git", "-C", value.PluginRoot, "rev-parse", "HEAD"}, "", nil, 5_000, 8_192)
	return outputCommit(output), nil
}

func outputCommit(output commandOutput) string {
	fields := strings.Fields(output.Stdout)
	if len(fields) == 0 || !commitPattern.MatchString(fields[0]) {
		return ""
	}
	return strings.ToLower(fields[0])
}

func selfUpdateRemote() string {
	return envOr("OPENCODE_COMPONENT_UPDATER_REPOSITORY", defaultUpdaterRemote)
}

func selfUpdateTargetComponents(value paths) (selfUpdateTargets, error) {
	executable, err := selfUpdateExecutable()
	if err != nil {
		return selfUpdateTargets{}, err
	}
	executable, err = filepath.EvalSymlinks(executable)
	if err != nil {
		return selfUpdateTargets{}, err
	}
	executable, err = filepath.Abs(executable)
	if err != nil {
		return selfUpdateTargets{}, err
	}
	info, err := os.Lstat(executable)
	if err != nil {
		return selfUpdateTargets{}, err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || hasExternalHardlink(info) {
		return selfUpdateTargets{}, errors.New("updater executable must be a regular unlinked file")
	}
	binaryTarget := filepath.Dir(executable)
	if err := assertSecureDirectory(binaryTarget); err != nil {
		return selfUpdateTargets{}, err
	}
	if err := assertSecureDirectory(value.PluginRoot); err != nil {
		return selfUpdateTargets{}, err
	}
	binary := selfUpdateComponent(selfUpdateBinaryID, "binary", binaryTarget, []string{filepath.Base(executable)})
	plugin := selfUpdateComponent(selfUpdatePluginID, "plugin", value.PluginRoot, []string{"index.js", "package.json", "src"})
	return selfUpdateTargets{Binary: binary, Plugin: plugin}, nil
}

func selfUpdateComponent(id, name, target string, allowed []string) component {
	item := component{Scope: "updater", Kind: "plugin", Name: name, Target: &target, Enabled: true}
	item.Source.Mode = "git"
	item.Policy.Apply = "manifest"
	item.Policy.Dirty = "refuse"
	item.Policy.AllowedPaths = allowed
	item.Policy.ProtectedPaths = []string{}
	item.Check.Command = []string{}
	item.Update.Command = []string{}
	item.Update.Healthcheck = []string{}
	return item
}

func stageSelfUpdateCandidate(ctx context.Context, value paths, result checkResult) (upgradePlan, []plannedComponent, error) {
	targets, err := selfUpdateTargetComponents(value)
	if err != nil {
		return upgradePlan{}, nil, err
	}
	if err := os.MkdirAll(value.TmpRoot, 0o700); err != nil {
		return upgradePlan{}, nil, err
	}
	source, err := os.MkdirTemp(value.TmpRoot, "self-update-source-")
	if err != nil {
		return upgradePlan{}, nil, err
	}
	defer os.RemoveAll(source)
	remote := selfUpdateRemote()
	if output := runCommand(ctx, []string{"git", "clone", "--no-checkout", remote, source}, "", nil, defaultDefaults().UpdateTimeoutMS, defaultDefaults().MaxOutputBytes); output.Code != 0 || output.Reason != "" {
		return upgradePlan{}, nil, commandFailure("clone updater source", output)
	}
	if output := runCommand(ctx, []string{"git", "-C", source, "checkout", "--detach", result.Latest}, "", nil, defaultDefaults().UpdateTimeoutMS, defaultDefaults().MaxOutputBytes); output.Code != 0 || output.Reason != "" {
		return upgradePlan{}, nil, commandFailure("checkout updater source", output)
	}
	if head := outputCommit(runCommand(ctx, []string{"git", "-C", source, "rev-parse", "HEAD"}, "", nil, 5_000, 8_192)); head != result.Latest {
		return upgradePlan{}, nil, errors.New("checked out updater commit does not match fresh main")
	}
	if output := runCommand(ctx, []string{"git", "-C", source, "merge-base", "--is-ancestor", result.Current, result.Latest}, "", nil, 30_000, 8_192); output.Code != 0 || output.Reason != "" {
		return upgradePlan{}, nil, errors.New("fresh main is not a fast-forward from the running updater")
	}
	if err := validateCandidatePackage(source); err != nil {
		return upgradePlan{}, nil, err
	}

	binaryStage, err := os.MkdirTemp(filepath.Dir(*targets.Binary.Target), ".component-updater-self-binary-")
	if err != nil {
		return upgradePlan{}, nil, err
	}
	pluginStage, err := os.MkdirTemp(filepath.Dir(*targets.Plugin.Target), ".component-updater-self-plugin-")
	if err != nil {
		_ = os.RemoveAll(binaryStage)
		return upgradePlan{}, nil, err
	}
	staged := []plannedComponent{{Stage: binaryStage}, {Stage: pluginStage}}
	cleanup := true
	defer func() {
		if cleanup {
			cleanupStages(staged)
		}
	}()
	binaryName := targets.Binary.Policy.AllowedPaths[0]
	binaryPath := filepath.Join(binaryStage, binaryName)
	if output := runCommand(ctx, []string{"go", "build", "-trimpath", "-ldflags", "-X main.commit=" + result.Latest, "-o", binaryPath, "./cmd/opencode-component-updater"}, source, nil, defaultDefaults().UpdateTimeoutMS, defaultDefaults().MaxOutputBytes); output.Code != 0 || output.Reason != "" {
		return upgradePlan{}, nil, commandFailure("build updater candidate", output)
	}
	if err := assertCandidateFile(binaryPath); err != nil {
		return upgradePlan{}, nil, err
	}
	for _, name := range []string{"index.js", "package.json", "src"} {
		if err := copySafeTree(filepath.Join(source, name), filepath.Join(pluginStage, name)); err != nil {
			return upgradePlan{}, nil, err
		}
	}
	if err := checkCandidatePlugin(ctx, pluginStage); err != nil {
		return upgradePlan{}, nil, err
	}

	plan := upgradePlan{SchemaVersion: 1, RunID: newRunID(), Mode: "strict", CreatedAt: nowMillis()}
	binaryPlan, err := makeSelfUpdatePlan(targets.Binary, selfUpdateBinaryID, binaryStage, result, source)
	if err != nil {
		return upgradePlan{}, nil, err
	}
	pluginPlan, err := makeSelfUpdatePlan(targets.Plugin, selfUpdatePluginID, pluginStage, result, source)
	if err != nil {
		return upgradePlan{}, nil, err
	}
	plan.Components = []plannedComponent{binaryPlan, pluginPlan}
	staged = plan.Components
	cleanup = false
	return plan, staged, nil
}

func commandFailure(label string, output commandOutput) error {
	detail := firstOutputLine(output)
	if detail == "" {
		detail = fallback(output.Reason, fmt.Sprintf("exit %d", output.Code))
	}
	return fmt.Errorf("%s: %s", label, detail)
}

func makeSelfUpdatePlan(item component, id, stage string, result checkResult, sourceRoot string) (plannedComponent, error) {
	plan := plannedComponent{
		ID:           id,
		Key:          "updater:" + id,
		Target:       *item.Target,
		Current:      result.Current,
		Latest:       result.Latest,
		ResultSource: "fresh",
		Source:       sourceInfo{Type: "git", URL: result.Source.URL, Root: sourceRoot, Current: result.Latest},
		SelfUpdate:   true,
		Stage:        stage,
	}
	plan.SourceFingerprint = sourceFingerprint(plan.Source)
	plan.ConfigFingerprint = componentFingerprint(item)
	plan.PlanSHA256 = planDigest(plan)
	manifest := stageManifest{SchemaVersion: 2, PlanSHA256: plan.PlanSHA256, Paths: item.Policy.AllowedPaths}
	if err := writeJSONAtomic(filepath.Join(stage, manifestFile), manifest); err != nil {
		return plannedComponent{}, err
	}
	validated, err := validateManifest(item, plan, stage)
	if err != nil {
		return plannedComponent{}, err
	}
	plan.Manifest = validated
	return plan, nil
}

func validateCandidatePackage(root string) error {
	contents, err := os.ReadFile(filepath.Join(root, "package.json"))
	if err != nil {
		return err
	}
	var pkg struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}
	if err := json.Unmarshal(contents, &pkg); err != nil {
		return fmt.Errorf("parse updater package: %w", err)
	}
	if pkg.Name != "opencode-component-updater" || pkg.Type != "module" {
		return errors.New("candidate package is not a compatible updater plugin")
	}
	return nil
}

func checkCandidatePlugin(ctx context.Context, root string) error {
	for _, path := range []string{filepath.Join(root, "index.js"), filepath.Join(root, "src")} {
		if err := assertSafeTree(root, path); err != nil {
			return err
		}
	}
	files := []string{}
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.Type().IsRegular() || filepath.Ext(path) != ".js" {
			return nil
		}
		files = append(files, path)
		return nil
	})
	if err != nil {
		return err
	}
	for _, file := range files {
		output := runCommand(ctx, []string{"node", "--check", file}, "", nil, 30_000, 8_192)
		if output.Code != 0 || output.Reason != "" {
			return commandFailure("check updater plugin", output)
		}
	}
	return nil
}

func assertCandidateFile(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || hasExternalHardlink(info) || info.Mode()&0o111 == 0 {
		return errors.New("built updater candidate is not an executable regular file")
	}
	return nil
}

func copySafeTree(source, destination string) error {
	info, err := os.Lstat(source)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || (!info.IsDir() && !info.Mode().IsRegular()) || info.Mode().IsRegular() && hasExternalHardlink(info) {
		return fmt.Errorf("unsafe candidate path: %s", source)
	}
	if info.IsDir() {
		if err := os.Mkdir(destination, 0o700); err != nil {
			return err
		}
		entries, err := os.ReadDir(source)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if err := copySafeTree(filepath.Join(source, entry.Name()), filepath.Join(destination, entry.Name())); err != nil {
				return err
			}
		}
		return nil
	}
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, info.Mode().Perm())
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	syncErr := output.Sync()
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	if syncErr != nil {
		return syncErr
	}
	return closeErr
}

func backupChoiceForArchive(archive, componentID, runID string) (backupChoice, error) {
	contents, err := os.ReadFile(strings.TrimSuffix(archive, ".tar.gz") + ".json")
	if err != nil {
		return backupChoice{}, err
	}
	var metadata backupMetadata
	if err := json.Unmarshal(contents, &metadata); err != nil {
		return backupChoice{}, err
	}
	if metadata.SchemaVersion != 1 || metadata.ComponentID != componentID || metadata.RunID != runID {
		return backupChoice{}, errors.New("updater self-update backup metadata is invalid")
	}
	if _, err := os.Stat(archive); err != nil {
		return backupChoice{}, err
	}
	return backupChoice{Archive: archive, Metadata: metadata}, nil
}
