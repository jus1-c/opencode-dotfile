package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var commitPattern = regexp.MustCompile(`^[0-9a-fA-F]{40}$`)
var semverPattern = regexp.MustCompile(`^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$`)
var secretPattern = regexp.MustCompile(`(?i)\b(bearer\s+|api[_-]?key|token|password|secret)([:=\s]+)([^\s]+)`)
var urlCredentialPattern = regexp.MustCompile(`//[^\s/@:]+(?::[^\s/@]+)?@`)
var integrityPattern = regexp.MustCompile(`^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$`)

type commandOutput struct {
	Code   int
	Stdout string
	Stderr string
	Reason string
}

type limitedBuffer struct {
	buffer    bytes.Buffer
	limit     int
	truncated bool
}

func (writer *limitedBuffer) Write(value []byte) (int, error) {
	remaining := writer.limit - writer.buffer.Len()
	if remaining <= 0 {
		writer.truncated = true
		return len(value), nil
	}
	if len(value) > remaining {
		writer.truncated = true
		_, _ = writer.buffer.Write(value[:remaining])
		return len(value), nil
	}
	_, _ = writer.buffer.Write(value)
	return len(value), nil
}

func (writer *limitedBuffer) String() string {
	return writer.buffer.String()
}

func validateCommand(command []string) error {
	if len(command) == 0 {
		return errors.New("command must not be empty")
	}
	for _, value := range command {
		if value == "" {
			return errors.New("command arguments must not be empty")
		}
	}
	return nil
}

func runCommand(parent context.Context, command []string, cwd string, env map[string]string, timeoutMS, maxOutput int) commandOutput {
	if err := validateCommand(command); err != nil {
		return commandOutput{Code: -1, Reason: err.Error()}
	}
	ctx, cancel := context.WithTimeout(parent, time.Duration(timeoutMS)*time.Millisecond)
	defer cancel()
	child := exec.CommandContext(ctx, command[0], command[1:]...)
	child.Dir = cwd
	child.Env = mergedEnv(env)
	stdout := &limitedBuffer{limit: maxOutput}
	stderr := &limitedBuffer{limit: maxOutput}
	child.Stdout = stdout
	child.Stderr = stderr
	err := child.Run()
	result := commandOutput{Code: 0, Stdout: stdout.String(), Stderr: stderr.String()}
	if stdout.truncated || stderr.truncated {
		result.Reason = "output-limit"
	}
	if ctx.Err() != nil {
		result.Code = -1
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			result.Reason = "timeout"
		} else {
			result.Reason = "canceled"
		}
		return result
	}
	if err == nil {
		return result
	}
	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		result.Code = exitError.ExitCode()
		return result
	}
	result.Code = -1
	result.Reason = "spawn-error"
	result.Stderr = strings.TrimSpace(result.Stderr + "\n" + err.Error())
	return result
}

func mergedEnv(extra map[string]string) []string {
	values := map[string]string{}
	for _, entry := range os.Environ() {
		key, value, found := strings.Cut(entry, "=")
		if found {
			values[key] = value
		}
	}
	for key, value := range extra {
		values[key] = value
	}
	output := make([]string, 0, len(values))
	for key, value := range values {
		output = append(output, key+"="+value)
	}
	return output
}

func firstOutputLine(output commandOutput) string {
	for _, line := range strings.Split(output.Stdout+"\n"+output.Stderr, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			return sanitizeSummary(line)
		}
	}
	return ""
}

func sanitizeSummary(value string) string {
	value = secretPattern.ReplaceAllString(value, "$1$2[redacted]")
	return urlCredentialPattern.ReplaceAllString(value, "//[redacted]@")
}

func validExact(value string) bool {
	return commitPattern.MatchString(value) || semverPattern.MatchString(value)
}

func isGoodStatus(status string) bool {
	return status == "current" || status == "update-available"
}

type progress struct {
	Phase     string
	Component string
	Detail    string
	Current   int
	Total     int
}

type reporter func(progress)

type checkSummary struct {
	Config  config
	State   state
	Results map[string]checkResult
}

func runCheck(ctx context.Context, value paths, quiet bool, stderr io.Writer) error {
	lock, err := acquireOperationLock(value, "check")
	if err != nil {
		return err
	}
	defer lock.release()
	operation := func(worker context.Context, report reporter) error {
		_, err := checkAll(worker, value, report)
		return err
	}
	if !quiet && interactiveTerminal() {
		return runOperationTUI(ctx, "Force checking components", operation)
	}
	if quiet {
		return operation(ctx, nil)
	}
	return operation(ctx, func(event progress) {
		if event.Component == "" {
			fmt.Fprintf(stderr, "[%s] %s\n", event.Phase, event.Detail)
			return
		}
		fmt.Fprintf(stderr, "[%s] %s: %s\n", event.Phase, event.Component, event.Detail)
	})
}

func checkAll(ctx context.Context, value paths, report reporter) (checkSummary, error) {
	if report != nil {
		report(progress{Phase: "config", Detail: "loading configuration"})
	}
	loaded, err := ensureConfig(value)
	if err != nil {
		return checkSummary{}, err
	}
	cached, err := loadState(value.StatePath)
	if err != nil {
		return checkSummary{}, err
	}
	results := map[string]checkResult{}
	ids := managedComponentIDs(value, loaded.Components)
	total := len(ids) + 1
	for index, id := range ids {
		if err := ctx.Err(); err != nil {
			_ = saveState(value.StatePath, cached)
			return checkSummary{}, err
		}
		item := loaded.Components[id]
		if report != nil {
			report(progress{Phase: "check", Component: id, Detail: "checking", Current: index, Total: total})
		}
		result := checkComponent(ctx, value, id, item, loaded.Defaults)
		key := componentKey(id, item)
		entry := cached.Components[key]
		entry.LastAttempt = &result
		if isGoodStatus(result.Status) && validExact(result.Current) && validExact(result.Latest) {
			good := result
			entry.LastGood = &good
		}
		cached.Components[key] = entry
		results[id] = result
		if report != nil {
			report(progress{Phase: "check", Component: id, Detail: result.Summary, Current: index + 1, Total: total})
		}
	}
	if err := ctx.Err(); err != nil {
		_ = saveState(value.StatePath, cached)
		return checkSummary{}, err
	}
	if report != nil {
		report(progress{Phase: "check", Component: selfUpdateComponentID, Detail: "checking", Current: len(ids), Total: total})
	}
	self := checkSelfUpdate(ctx, value, loaded.Defaults)
	recordSelfUpdateCheck(&cached, self)
	results[selfUpdateComponentID] = self
	if report != nil {
		report(progress{Phase: "check", Component: selfUpdateComponentID, Detail: self.Summary, Current: total, Total: total})
	}
	if err := saveState(value.StatePath, cached); err != nil {
		return checkSummary{}, err
	}
	if report != nil {
		report(progress{Phase: "complete", Detail: "check complete", Current: total, Total: total})
	}
	return checkSummary{Config: loaded, State: cached, Results: results}, nil
}

func managedComponentIDs(value paths, components map[string]component) []string {
	ids := sortedComponentIDs(components)
	output := ids[:0]
	for _, id := range ids {
		item := components[id]
		if id == selfUpdateComponentID || item.Target != nil && pathOverlaps(*item.Target, value.PluginRoot) {
			continue
		}
		output = append(output, id)
	}
	return output
}

func checkComponent(ctx context.Context, value paths, id string, item component, settings defaults) checkResult {
	result := checkResult{CheckedAt: nowMillis()}
	if !item.Enabled {
		result.Status = "disabled"
		result.Summary = "Disabled"
		return result
	}
	source, err := detectSource(ctx, item, value)
	if err != nil {
		result.Status = "check-error"
		result.Summary = sanitizeSummary(err.Error())
		return result
	}
	result.Source = &source
	result.SourceFingerprint = sourceFingerprint(source)
	result.ConfigFingerprint = componentFingerprint(item)
	if source.Dirty && item.Policy.Dirty != "allow" {
		result.Status = "manual-only"
		result.Summary = "Dirty Git worktree"
		return result
	}
	if len(item.Check.Command) > 0 {
		result = customCheck(ctx, value, id, item, source, settings)
		return result
	}
	return checkDetectedSource(ctx, item, source, settings)
}

func detectSource(ctx context.Context, item component, value paths) (sourceInfo, error) {
	if item.Target == nil {
		return sourceInfo{Type: "external"}, nil
	}
	target := *item.Target
	info, err := os.Stat(target)
	if err != nil {
		return sourceInfo{}, fmt.Errorf("target %s: %w", target, err)
	}
	if !info.IsDir() {
		return sourceInfo{}, fmt.Errorf("target is not a directory: %s", target)
	}
	roots := []string{target, filepath.Join(target, "source"), filepath.Join(target, "runtime")}
	seen := map[string]bool{}
	for _, root := range roots {
		if seen[root] {
			continue
		}
		seen[root] = true
		if info, err := os.Stat(root); err != nil || !info.IsDir() {
			continue
		}
		if source, ok := gitSource(ctx, root, item); ok {
			return source, nil
		}
		if source, ok := npmSource(root); ok {
			return source, nil
		}
		if source, ok := pypiSource(root); ok {
			return source, nil
		}
	}
	return sourceInfo{Type: "local", Root: target}, nil
}

func gitSource(ctx context.Context, root string, item component) (sourceInfo, bool) {
	if _, err := os.Lstat(filepath.Join(root, ".git")); err != nil {
		return sourceInfo{}, false
	}
	output := runCommand(ctx, []string{"git", "-C", root, "remote", "get-url", "origin"}, "", nil, 5_000, 8_192)
	head := runCommand(ctx, []string{"git", "-C", root, "rev-parse", "HEAD"}, "", nil, 5_000, 8_192)
	if output.Code != 0 || head.Code != 0 {
		return sourceInfo{}, false
	}
	current := strings.TrimSpace(head.Stdout)
	if !commitPattern.MatchString(current) {
		return sourceInfo{}, false
	}
	dirty := runCommand(ctx, []string{"git", "-C", root, "status", "--porcelain"}, "", nil, 5_000, 8_192)
	return sourceInfo{
		Type:    "git",
		URL:     sanitizeRemote(strings.TrimSpace(output.Stdout)),
		Root:    root,
		Current: strings.ToLower(current),
		Dirty:   dirty.Code == 0 && strings.TrimSpace(dirty.Stdout) != "",
	}, true
}

func sanitizeRemote(value string) string {
	return urlCredentialPattern.ReplaceAllString(strings.TrimSuffix(value, "/"), "//[redacted]@")
}

func npmSource(root string) (sourceInfo, bool) {
	contents, err := os.ReadFile(filepath.Join(root, "package.json"))
	if err != nil {
		return sourceInfo{}, false
	}
	var pkg struct {
		Name    string `json:"name"`
		Version string `json:"version"`
		Private bool   `json:"private"`
	}
	if json.Unmarshal(contents, &pkg) != nil || pkg.Private || pkg.Name == "" || !semverPattern.MatchString(pkg.Version) {
		return sourceInfo{}, false
	}
	return sourceInfo{Type: "npm", Name: pkg.Name, Root: root, Current: pkg.Version}, true
}

func pypiSource(root string) (sourceInfo, bool) {
	for _, filename := range []string{"requirements.in", "requirements.txt"} {
		contents, err := os.ReadFile(filepath.Join(root, filename))
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(contents), "\n") {
			line = strings.TrimSpace(strings.SplitN(line, "#", 2)[0])
			parts := strings.SplitN(line, "==", 2)
			if len(parts) == 2 && parts[0] != "" && semverPattern.MatchString(parts[1]) {
				return sourceInfo{Type: "pypi", Name: parts[0], Root: root, Current: parts[1]}, true
			}
		}
	}
	return sourceInfo{}, false
}

func checkDetectedSource(ctx context.Context, item component, source sourceInfo, settings defaults) checkResult {
	result := checkResult{
		CheckedAt:         nowMillis(),
		Source:            &source,
		SourceFingerprint: sourceFingerprint(source),
		ConfigFingerprint: componentFingerprint(item),
		Current:           source.Current,
	}
	switch source.Type {
	case "git":
		output := runCommand(ctx, []string{"git", "-C", source.Root, "ls-remote", "origin", "HEAD"}, "", nil, settings.CheckTimeoutMS, settings.MaxOutputBytes)
		latest := strings.Fields(output.Stdout)
		if output.Code != 0 || len(latest) == 0 || !commitPattern.MatchString(latest[0]) {
			result.Status = "check-error"
			result.Summary = firstOutputLine(output)
			if result.Summary == "" {
				result.Summary = output.Reason
			}
			return result
		}
		result.Latest = strings.ToLower(latest[0])
	case "npm":
		latest, err := npmLatest(ctx, source.Name, settings.CheckTimeoutMS)
		if err != nil {
			result.Status = "check-error"
			result.Summary = sanitizeSummary(err.Error())
			return result
		}
		result.Latest = latest
	case "pypi":
		latest, err := pypiLatest(ctx, source.Name, settings.CheckTimeoutMS)
		if err != nil {
			result.Status = "check-error"
			result.Summary = sanitizeSummary(err.Error())
			return result
		}
		result.Latest = latest
	default:
		result.Status = "manual-only"
		result.Summary = source.Type + " source requires a custom check"
		return result
	}
	if result.Current == result.Latest {
		result.Status = "current"
		result.Summary = result.Current
	} else {
		result.Status = "update-available"
		result.Summary = result.Current + " -> " + result.Latest
	}
	return result
}

func npmLatest(ctx context.Context, name string, timeoutMS int) (string, error) {
	var metadata struct {
		DistTags map[string]string `json:"dist-tags"`
	}
	if err := getJSON(ctx, "https://registry.npmjs.org/"+name, timeoutMS, &metadata); err != nil {
		return "", err
	}
	latest := metadata.DistTags["latest"]
	if !semverPattern.MatchString(latest) {
		return "", errors.New("npm metadata has no exact latest version")
	}
	return latest, nil
}

func pypiLatest(ctx context.Context, name string, timeoutMS int) (string, error) {
	var metadata struct {
		Info struct {
			Version string `json:"version"`
		} `json:"info"`
	}
	if err := getJSON(ctx, "https://pypi.org/pypi/"+name+"/json", timeoutMS, &metadata); err != nil {
		return "", err
	}
	if !semverPattern.MatchString(metadata.Info.Version) {
		return "", errors.New("PyPI metadata has no exact latest version")
	}
	return metadata.Info.Version, nil
}

func getJSON(parent context.Context, url string, timeoutMS int, destination any) error {
	ctx, cancel := context.WithTimeout(parent, time.Duration(timeoutMS)*time.Millisecond)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", response.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(destination)
}

func customCheck(ctx context.Context, value paths, id string, item component, source sourceInfo, settings defaults) checkResult {
	result := checkResult{
		CheckedAt:         nowMillis(),
		Source:            &source,
		SourceFingerprint: sourceFingerprint(source),
		ConfigFingerprint: componentFingerprint(item),
	}
	if err := os.MkdirAll(value.TmpRoot, 0o700); err != nil {
		result.Status = "check-error"
		result.Summary = sanitizeSummary(err.Error())
		return result
	}
	file, err := os.CreateTemp(value.TmpRoot, "check-result-*.json")
	if err != nil {
		result.Status = "check-error"
		result.Summary = sanitizeSummary(err.Error())
		return result
	}
	path := file.Name()
	_ = file.Close()
	defer os.Remove(path)
	cwd := ""
	if item.Target != nil {
		cwd = *item.Target
	}
	output := runCommand(ctx, item.Check.Command, cwd, map[string]string{
		"OPENCODE_UPDATER_COMPONENT_ID": id,
		"OPENCODE_UPDATER_TARGET":       cwd,
		"OPENCODE_UPDATER_CHECK_RESULT": path,
	}, settings.CheckTimeoutMS, settings.MaxOutputBytes)
	if output.Code != 0 || output.Reason != "" {
		result.Status = "check-error"
		result.Summary = firstOutputLine(output)
		if result.Summary == "" {
			result.Summary = output.Reason
		}
		return result
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		result.Status = "check-error"
		result.Summary = "custom check did not write a result"
		return result
	}
	var reported struct {
		SchemaVersion int    `json:"schemaVersion"`
		Status        string `json:"status"`
		Summary       string `json:"summary"`
		Current       string `json:"current"`
		Latest        string `json:"latest"`
		Artifact      *struct {
			URL       string `json:"url"`
			Integrity string `json:"integrity"`
		} `json:"artifact"`
		SourceCommit string `json:"sourceCommit"`
	}
	if err := json.Unmarshal(contents, &reported); err != nil || reported.SchemaVersion != 1 {
		result.Status = "check-error"
		result.Summary = "custom check result is invalid"
		return result
	}
	if reported.Status != "current" && reported.Status != "update-available" && reported.Status != "manual-only" {
		result.Status = "check-error"
		result.Summary = "custom check result has an invalid status"
		return result
	}
	result.Status = reported.Status
	result.Summary = sanitizeSummary(reported.Summary)
	result.Current = reported.Current
	result.Latest = reported.Latest
	if reported.SourceCommit != "" {
		if !commitPattern.MatchString(reported.SourceCommit) {
			result.Status = "check-error"
			result.Summary = "custom check reported an invalid source commit"
			return result
		}
		result.SourceCommit = strings.ToLower(reported.SourceCommit)
	}
	if reported.Artifact != nil {
		artifact := artifactInfo{URL: reported.Artifact.URL, Integrity: reported.Artifact.Integrity}
		if err := validateArtifact(artifact); err != nil {
			result.Status = "check-error"
			result.Summary = sanitizeSummary(err.Error())
			return result
		}
		result.Artifact = &artifact
	}
	if isGoodStatus(result.Status) && (!validExact(result.Current) || !validExact(result.Latest)) {
		result.Status = "check-error"
		result.Summary = "custom check requires exact current and latest values"
	}
	if result.Summary == "" {
		result.Summary = result.Status
	}
	return result
}

// validateArtifact keeps published-release downloads pinned to an https URL with
// a supported subresource integrity digest.
func validateArtifact(artifact artifactInfo) error {
	if artifact.URL == "" || artifact.Integrity == "" {
		return errors.New("artifact requires both a url and an integrity digest")
	}
	parsed, err := url.Parse(artifact.URL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return errors.New("artifact url must be an absolute https url")
	}
	if !integrityPattern.MatchString(artifact.Integrity) {
		return errors.New("artifact integrity must be sha256/sha384/sha512 base64")
	}
	return nil
}
