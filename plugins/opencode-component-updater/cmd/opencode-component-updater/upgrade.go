package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type upgradePlan struct {
	SchemaVersion int                `json:"schemaVersion"`
	RunID         string             `json:"runId"`
	Mode          string             `json:"mode"`
	CreatedAt     int64              `json:"createdAt"`
	Components    []plannedComponent `json:"components"`
}

type plannedComponent struct {
	ID                string        `json:"id"`
	Key               string        `json:"key"`
	Target            string        `json:"target"`
	Current           string        `json:"current"`
	Latest            string        `json:"latest"`
	ResultSource      string        `json:"resultSource"`
	Source            sourceInfo    `json:"source"`
	Artifact          *artifactInfo `json:"artifact,omitempty"`
	SourceCommit      string        `json:"sourceCommit,omitempty"`
	SourceFingerprint string        `json:"sourceFingerprint"`
	ConfigFingerprint string        `json:"configFingerprint"`
	PlanSHA256        string        `json:"planSha256"`
	Stage             string        `json:"stage,omitempty"`
	Manifest          stageManifest `json:"manifest,omitempty"`
	SelfUpdate        bool          `json:"selfUpdate,omitempty"`
}

type stageManifest struct {
	SchemaVersion int      `json:"schemaVersion"`
	PlanSHA256    string   `json:"planSha256"`
	Paths         []string `json:"paths"`
}

type preflightError struct {
	Failures []string
}

func (err *preflightError) Error() string {
	return "upgrade preflight failed: " + strings.Join(err.Failures, "; ")
}

type partialUpgradeError struct {
	Failures []string
}

func (err *partialUpgradeError) Error() string {
	return "upgrade completed partially: " + strings.Join(err.Failures, "; ")
}

func runUpgrade(ctx context.Context, value paths, bestEffort bool, stderr io.Writer) error {
	lock, err := acquireOperationLock(value, "upgrade")
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
		return upgradeAll(worker, value, bestEffort, report)
	}
	if interactiveTerminal() {
		return runOperationTUI(ctx, "Upgrading OpenCode components", operation)
	}
	return operation(ctx, func(event progress) {
		if event.Component == "" {
			fmt.Fprintf(stderr, "[%s] %s\n", event.Phase, event.Detail)
			return
		}
		fmt.Fprintf(stderr, "[%s] %s: %s\n", event.Phase, event.Component, event.Detail)
	})
}

func upgradeAll(ctx context.Context, value paths, bestEffort bool, report reporter) error {
	if report != nil {
		report(progress{Phase: "check", Detail: "force checking components"})
	}
	summary, err := checkAll(ctx, value, report)
	if err != nil {
		return err
	}
	plan, skipped, err := buildUpgradePlan(ctx, value, summary, bestEffort)
	if err != nil {
		return err
	}
	if len(plan.Components) == 0 {
		if report != nil {
			detail := "all managed components are current"
			if len(skipped) > 0 {
				detail = "no component can be upgraded: " + strings.Join(skipped, "; ")
			}
			report(progress{Phase: "complete", Detail: detail})
		}
		if len(skipped) > 0 {
			return &partialUpgradeError{Failures: skipped}
		}
		return nil
	}
	if report != nil {
		report(progress{Phase: "plan", Detail: fmt.Sprintf("%d update(s) planned", len(plan.Components)), Total: len(plan.Components)})
	}
	if err := saveUpgradePlan(value, plan); err != nil {
		return err
	}
	staged, stageFailures := stageAll(ctx, value, summary.Config, plan, bestEffort, report)
	if len(stageFailures) > 0 && !bestEffort {
		cleanupStages(staged)
		return &preflightError{Failures: stageFailures}
	}
	if len(staged) == 0 {
		return &partialUpgradeError{Failures: append(skipped, stageFailures...)}
	}
	if err := ensureNoOpenCodeProcesses(); err != nil {
		cleanupStages(staged)
		return err
	}
	applyFailures, err := applyStagedPlan(ctx, value, summary.Config, plan, staged, bestEffort, report)
	if err != nil {
		return err
	}
	failures := append(skipped, stageFailures...)
	failures = append(failures, applyFailures...)
	if len(failures) > 0 {
		return &partialUpgradeError{Failures: failures}
	}
	return nil
}

func buildUpgradePlan(ctx context.Context, value paths, summary checkSummary, bestEffort bool) (upgradePlan, []string, error) {
	mode := "strict"
	if bestEffort {
		mode = "best-effort"
	}
	plan := upgradePlan{SchemaVersion: 1, RunID: newRunID(), Mode: mode, CreatedAt: nowMillis()}
	failures := []string{}
	for _, id := range managedComponentIDs(value, summary.Config.Components) {
		item := summary.Config.Components[id]
		if !eligibleForUpgrade(item) {
			continue
		}
		result, origin, ok := chooseCheckResult(ctx, value, id, item, summary)
		if !ok {
			failures = append(failures, id+": no fresh or valid cached update plan")
			continue
		}
		if result.Status == "current" {
			continue
		}
		if result.Status != "update-available" || !validExact(result.Current) || !validExact(result.Latest) || result.Source == nil {
			failures = append(failures, id+": check result cannot produce an exact update plan")
			continue
		}
		componentPlan := plannedComponent{
			ID:                id,
			Key:               componentKey(id, item),
			Target:            *item.Target,
			Current:           result.Current,
			Latest:            result.Latest,
			ResultSource:      origin,
			Source:            *result.Source,
			Artifact:          result.Artifact,
			SourceCommit:      result.SourceCommit,
			SourceFingerprint: result.SourceFingerprint,
			ConfigFingerprint: result.ConfigFingerprint,
		}
		componentPlan.PlanSHA256 = planDigest(componentPlan)
		plan.Components = append(plan.Components, componentPlan)
	}
	if len(failures) > 0 && !bestEffort {
		return upgradePlan{}, nil, &preflightError{Failures: failures}
	}
	return plan, failures, nil
}

func eligibleForUpgrade(item component) bool {
	return item.Enabled && item.Target != nil && item.Policy.Apply == "manifest" && len(item.Update.Command) > 0
}

func chooseCheckResult(ctx context.Context, value paths, id string, item component, summary checkSummary) (checkResult, string, bool) {
	fresh := summary.Results[id]
	if fresh.Status == "update-available" || fresh.Status == "current" {
		return fresh, "fresh", true
	}
	if fresh.Status != "check-error" {
		return checkResult{}, "", false
	}
	cached := summary.State.Components[componentKey(id, item)].LastGood
	if cached == nil || !validCachedResult(ctx, value, item, *cached) {
		return checkResult{}, "", false
	}
	return *cached, "cache", true
}

func validCachedResult(ctx context.Context, value paths, item component, cached checkResult) bool {
	if !isGoodStatus(cached.Status) || !validExact(cached.Current) || !validExact(cached.Latest) || cached.Source == nil {
		return false
	}
	if cached.ConfigFingerprint != componentFingerprint(item) {
		return false
	}
	source, err := detectSource(ctx, item, value)
	if err != nil || source.Dirty && item.Policy.Dirty != "allow" {
		return false
	}
	if sourceFingerprint(source) != cached.SourceFingerprint || source.Current == "" || source.Current != cached.Current {
		return false
	}
	return true
}

func newRunID() string {
	token, err := randomToken()
	if err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return time.Now().UTC().Format("20060102T150405Z") + "-" + token
}

func planDigest(component plannedComponent) string {
	component.PlanSHA256 = ""
	component.Stage = ""
	component.Manifest = stageManifest{}
	encoded, _ := jsonMarshal(component)
	return hashBytes(encoded)
}

func jsonMarshal(value any) ([]byte, error) {
	return json.Marshal(value)
}

func saveUpgradePlan(value paths, plan upgradePlan) error {
	return writeJSONAtomic(filepath.Join(value.RunsRoot, plan.RunID, "plan.json"), plan)
}

func stageAll(ctx context.Context, value paths, settings config, plan upgradePlan, bestEffort bool, report reporter) ([]plannedComponent, []string) {
	staged := []plannedComponent{}
	failures := []string{}
	for index, componentPlan := range plan.Components {
		if err := ctx.Err(); err != nil {
			failures = append(failures, err.Error())
			break
		}
		if report != nil {
			report(progress{Phase: "stage", Component: componentPlan.ID, Detail: "staging", Current: index, Total: len(plan.Components)})
		}
		item := settings.Components[componentPlan.ID]
		stagedPlan, err := stageComponent(ctx, value, settings.Defaults, item, componentPlan)
		if err != nil {
			failures = append(failures, componentPlan.ID+": "+sanitizeSummary(err.Error()))
			if !bestEffort {
				break
			}
			continue
		}
		staged = append(staged, stagedPlan)
		if report != nil {
			report(progress{Phase: "stage", Component: componentPlan.ID, Detail: "ready", Current: index + 1, Total: len(plan.Components)})
		}
	}
	if len(failures) > 0 && !bestEffort {
		cleanupStages(staged)
		return nil, failures
	}
	return staged, failures
}

func stageComponent(ctx context.Context, value paths, settings defaults, item component, componentPlan plannedComponent) (plannedComponent, error) {
	if err := assertSecureDirectory(componentPlan.Target); err != nil {
		return plannedComponent{}, err
	}
	stage, err := os.MkdirTemp(filepath.Dir(componentPlan.Target), ".component-updater-stage-"+safeName(componentPlan.ID)+"-")
	if err != nil {
		return plannedComponent{}, err
	}
	componentPlan.Stage = stage
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.RemoveAll(stage)
		}
	}()
	planPath := filepath.Join(stage, "plan.json")
	if err := writeJSONAtomic(planPath, componentPlan); err != nil {
		return plannedComponent{}, err
	}
	manifestPath := filepath.Join(stage, ".opencode-component-updater-manifest.json")
	environment := stageEnvironment(componentPlan, stage, manifestPath, planPath)
	output := runCommand(ctx, item.Update.Command, stage, environment, settings.UpdateTimeoutMS, settings.MaxOutputBytes)
	if output.Code != 0 || output.Reason != "" {
		detail := firstOutputLine(output)
		if detail == "" {
			detail = output.Reason
		}
		return plannedComponent{}, fmt.Errorf("update command failed: %s", detail)
	}
	manifest, err := validateManifest(item, componentPlan, stage)
	if err != nil {
		return plannedComponent{}, err
	}
	if len(item.Update.Healthcheck) > 0 {
		output := runCommand(ctx, item.Update.Healthcheck, stage, environment, settings.UpdateTimeoutMS, settings.MaxOutputBytes)
		if output.Code != 0 || output.Reason != "" {
			detail := firstOutputLine(output)
			if detail == "" {
				detail = output.Reason
			}
			return plannedComponent{}, fmt.Errorf("stage healthcheck failed: %s", detail)
		}
	}
	componentPlan.Manifest = manifest
	cleanup = false
	return componentPlan, nil
}

func stageEnvironment(componentPlan plannedComponent, stage, manifestPath, planPath string) map[string]string {
	environment := map[string]string{
		"OPENCODE_UPDATER_COMPONENT_ID": componentPlan.ID,
		"OPENCODE_UPDATER_TARGET":       componentPlan.Target,
		"OPENCODE_UPDATER_STAGE":        stage,
		"OPENCODE_UPDATER_MANIFEST":     manifestPath,
		"OPENCODE_UPDATER_PLAN":         planPath,
		"OPENCODE_UPDATER_PLAN_SHA256":  componentPlan.PlanSHA256,
		"OPENCODE_UPDATER_CURRENT":      componentPlan.Current,
		"OPENCODE_UPDATER_LATEST":       componentPlan.Latest,
		"OPENCODE_UPDATER_PLAN_SOURCE":  componentPlan.ResultSource,
		"OPENCODE_UPDATER_SOURCE_URL":   componentPlan.Source.URL,
		"OPENCODE_UPDATER_SOURCE_TYPE":  componentPlan.Source.Type,
		"OPENCODE_UPDATER_SOURCE_NAME":  componentPlan.Source.Name,
		// Provenance only; registry components are pinned by artifact, not by commit.
		"OPENCODE_UPDATER_SOURCE_COMMIT": componentPlan.SourceCommit,
	}
	if componentPlan.Artifact != nil {
		environment["OPENCODE_UPDATER_ARTIFACT_URL"] = componentPlan.Artifact.URL
		environment["OPENCODE_UPDATER_ARTIFACT_INTEGRITY"] = componentPlan.Artifact.Integrity
	}
	return environment
}

func cleanupStages(components []plannedComponent) {
	for _, item := range components {
		if item.Stage != "" {
			_ = os.RemoveAll(item.Stage)
		}
	}
}
