package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
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
var integrityPattern = regexp.MustCompile(`^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$`)
var secretPattern = regexp.MustCompile(`(?i)\b(bearer\s+|api[_-]?key|token|password|secret)([:=\s]+)([^\s]+)`)
var urlCredentialPattern = regexp.MustCompile(`//[^\s/@:]+(?::[^\s/@]+)?@`)

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
	jobs := make([]checkJob, 0, len(ids)+1)
	for _, id := range ids {
		jobs = append(jobs, checkJob{id: id, item: loaded.Components[id]})
	}
	jobs = append(jobs, checkJob{id: selfUpdateComponentID})
	safe := newSafeReporter(report, len(jobs))
	for _, job := range jobs {
		safe.emit(progress{Phase: "check", Component: job.id, Detail: "checking"})
	}
	outcomes := make([]checkResult, len(jobs))
	runBounded(ctx, loaded.Defaults.CheckConcurrency, jobs, func(worker context.Context, index int, job checkJob) error {
		var result checkResult
		if job.id == selfUpdateComponentID {
			result = checkSelfUpdate(worker, value, loaded.Defaults)
		} else {
			result = checkComponent(worker, value, job.id, job.item, loaded.Defaults)
		}
		outcomes[index] = result
		safe.done(progress{Phase: "check", Component: job.id, Detail: result.Summary})
		return nil
	})
	for index, job := range jobs {
		result := outcomes[index]
		if result.Status == "" {
			continue
		}
		if job.id == selfUpdateComponentID {
			recordSelfUpdateCheck(&cached, result)
			results[job.id] = result
			continue
		}
		key := componentKey(job.id, job.item)
		entry := cached.Components[key]
		entry.LastAttempt = &result
		if isGoodStatus(result.Status) && validExact(result.Current) && validExact(result.Latest) {
			good := result
			entry.LastGood = &good
		}
		cached.Components[key] = entry
		results[job.id] = result
	}
	if err := saveState(value.StatePath, cached); err != nil {
		return checkSummary{}, err
	}
	if err := ctx.Err(); err != nil {
		return checkSummary{}, err
	}
	if report != nil {
		report(progress{Phase: "complete", Detail: "check complete", Current: len(jobs), Total: len(jobs)})
	}
	return checkSummary{Config: loaded, State: cached, Results: results}, nil
}

type checkJob struct {
	id   string
	item component
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
	if item.Source.Type == "script" {
		result = scriptCheck(ctx, value, id, item, source, settings)
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
	if item.Source.Type != "" {
		return configuredSource(ctx, item, target)
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

func configuredSource(ctx context.Context, item component, target string) (sourceInfo, error) {
	root := target
	if item.Source.Path != "" {
		root = filepath.Join(target, item.Source.Path)
	}
	source := sourceInfo{Type: item.Source.Type, Name: item.Source.Name, URL: sanitizeRemote(item.Source.URL), Root: root, Path: item.Source.Path, Track: item.Source.Track}
	switch item.Source.Type {
	case "git":
		remote := runCommand(ctx, []string{"git", "-C", root, "remote", "get-url", "origin"}, "", nil, 5_000, 8_192)
		if remote.Code != 0 || normalizedRemote(strings.TrimSpace(remote.Stdout)) != normalizedRemote(item.Source.URL) {
			return sourceInfo{}, fmt.Errorf("%s origin does not match configured Git url", root)
		}
		head := runCommand(ctx, []string{"git", "-C", root, "rev-parse", "HEAD"}, "", nil, 5_000, 8_192)
		if head.Code != 0 || !commitPattern.MatchString(strings.TrimSpace(head.Stdout)) {
			return sourceInfo{}, fmt.Errorf("%s is not an exact Git checkout", root)
		}
		source.Current = strings.ToLower(strings.TrimSpace(head.Stdout))
		dirty := runCommand(ctx, []string{"git", "-C", root, "status", "--porcelain"}, "", nil, 5_000, 8_192)
		if dirty.Code != 0 || dirty.Reason != "" {
			return sourceInfo{}, fmt.Errorf("cannot determine Git worktree status: %s", commandFailure("git", dirty))
		}
		source.Dirty = dirty.Code == 0 && strings.TrimSpace(dirty.Stdout) != ""
	case "npm":
		current, install, err := packageVersion(root, item.Source.Name)
		if err != nil {
			return sourceInfo{}, err
		}
		if install == "self" {
			return sourceInfo{}, errors.New("npm package-root installs require a component script")
		}
		source.Current, source.Install = current, install
	case "pypi":
		current, install, err := requirementVersion(root, item.Source.Name)
		if err != nil {
			return sourceInfo{}, err
		}
		source.Current, source.Install = current, install
	case "script":
		script := componentScript(target)
		info, err := os.Lstat(script)
		if err != nil || !info.Mode().IsRegular() || info.Mode()&0o111 == 0 {
			return sourceInfo{}, fmt.Errorf("component script must be an executable regular file: %s", script)
		}
		source.Root = target
	default:
		return sourceInfo{}, fmt.Errorf("unsupported source type: %s", item.Source.Type)
	}
	return source, nil
}

func packageVersion(root, name string) (string, string, error) {
	contents, err := os.ReadFile(filepath.Join(root, "package.json"))
	if err != nil {
		return "", "", err
	}
	var pkg struct {
		Name                 string            `json:"name"`
		Version              string            `json:"version"`
		Dependencies         map[string]string `json:"dependencies"`
		DevDependencies      map[string]string `json:"devDependencies"`
		OptionalDependencies map[string]string `json:"optionalDependencies"`
	}
	if json.Unmarshal(contents, &pkg) != nil {
		return "", "", errors.New("invalid package.json")
	}
	if pkg.Name == name && semverPattern.MatchString(pkg.Version) {
		return pkg.Version, "self", nil
	}
	for _, dependencies := range []map[string]string{pkg.Dependencies, pkg.DevDependencies, pkg.OptionalDependencies} {
		if version := dependencies[name]; semverPattern.MatchString(version) {
			return strings.TrimPrefix(version, "v"), "dependency", nil
		}
	}
	return "", "", fmt.Errorf("package.json has no exact %s version", name)
}

func requirementVersion(root, name string) (string, string, error) {
	for _, filename := range []string{"requirements.in", "requirements.txt"} {
		contents, err := os.ReadFile(filepath.Join(root, filename))
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(contents), "\n") {
			line = strings.TrimSpace(strings.SplitN(line, "#", 2)[0])
			parts := strings.SplitN(line, "==", 2)
			if len(parts) == 2 && strings.EqualFold(parts[0], name) && semverPattern.MatchString(parts[1]) {
				return parts[1], filename, nil
			}
		}
	}
	return "", "", fmt.Errorf("requirements have no exact %s version", name)
}

func componentScript(target string) string {
	return filepath.Join(target, "component-updater")
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

func normalizedRemote(value string) string {
	return strings.TrimSuffix(sanitizeRemote(value), ".git")
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
		latest, label, err := gitLatest(ctx, source.URL, source.Track, settings)
		if err != nil {
			result.Status = "check-error"
			result.Summary = sanitizeSummary(err.Error())
			return result
		}
		result.Latest = latest
		result.Summary = label
	case "npm":
		latest, artifact, err := npmLatest(ctx, source.Name, settings.CheckTimeoutMS)
		if err != nil {
			result.Status = "check-error"
			result.Summary = sanitizeSummary(err.Error())
			return result
		}
		result.Latest = latest
		result.Artifact = artifact
	case "pypi":
		latest, artifact, err := pypiLatest(ctx, source.Name, settings.CheckTimeoutMS)
		if err != nil {
			result.Status = "check-error"
			result.Summary = sanitizeSummary(err.Error())
			return result
		}
		result.Latest = latest
		result.Artifact = artifact
	default:
		result.Status = "manual-only"
		result.Summary = source.Type + " source requires a custom check"
		return result
	}
	if result.Current == result.Latest {
		result.Status = "current"
		if result.Summary == "" {
			result.Summary = result.Current
		}
	} else {
		result.Status = "update-available"
		if result.Summary == "" {
			result.Summary = result.Current + " -> " + result.Latest
		} else {
			result.Summary = result.Current + " -> " + result.Summary
		}
	}
	return result
}

func gitLatest(ctx context.Context, remote, track string, settings defaults) (string, string, error) {
	if track != "head" {
		output := runCommand(ctx, []string{"git", "ls-remote", "--tags", remote}, "", nil, settings.CheckTimeoutMS, max(settings.MaxOutputBytes, 8<<20))
		if output.Code != 0 || output.Reason != "" {
			return "", "", fmt.Errorf("resolve Git releases: %s", commandFailure("git", output))
		}
		if output.Code == 0 && output.Reason == "" {
			tags := map[string]string{}
			for _, line := range strings.Split(output.Stdout, "\n") {
				parts := strings.Fields(line)
				if len(parts) != 2 || !commitPattern.MatchString(parts[0]) || !strings.HasPrefix(parts[1], "refs/tags/") {
					continue
				}
				ref := strings.TrimPrefix(parts[1], "refs/tags/")
				deref := strings.HasSuffix(ref, "^{}")
				tag := strings.TrimSuffix(ref, "^{}")
				if !semverPattern.MatchString(tag) || strings.Contains(strings.TrimPrefix(tag, "v"), "-") {
					continue
				}
				if deref || tags[tag] == "" {
					tags[tag] = strings.ToLower(parts[0])
				}
			}
			latestTag := ""
			for tag := range tags {
				if latestTag == "" || semverCompare(tag, latestTag) > 0 || semverCompare(tag, latestTag) == 0 && tag > latestTag {
					latestTag = tag
				}
			}
			if latestTag != "" {
				return tags[latestTag], latestTag + " (" + tags[latestTag] + ")", nil
			}
		}
	}
	output := runCommand(ctx, []string{"git", "ls-remote", remote, "HEAD"}, "", nil, settings.CheckTimeoutMS, settings.MaxOutputBytes)
	parts := strings.Fields(output.Stdout)
	if output.Code != 0 || output.Reason != "" || len(parts) == 0 || !commitPattern.MatchString(parts[0]) {
		return "", "", fmt.Errorf("resolve Git HEAD: %s", commandFailure("git", output))
	}
	commit := strings.ToLower(parts[0])
	return commit, "HEAD (" + commit + ")", nil
}

func semverCompare(left, right string) int {
	parse := func(value string) [3]int {
		var output [3]int
		_, _ = fmt.Sscanf(strings.TrimPrefix(value, "v"), "%d.%d.%d", &output[0], &output[1], &output[2])
		return output
	}
	l, r := parse(left), parse(right)
	for index := range l {
		if l[index] < r[index] {
			return -1
		}
		if l[index] > r[index] {
			return 1
		}
	}
	return 0
}

func npmLatest(ctx context.Context, name string, timeoutMS int) (string, *artifactInfo, error) {
	var metadata struct {
		DistTags map[string]string `json:"dist-tags"`
		Versions map[string]struct {
			Dist struct {
				Tarball   string `json:"tarball"`
				Integrity string `json:"integrity"`
			} `json:"dist"`
		} `json:"versions"`
	}
	if err := getJSON(ctx, "https://registry.npmjs.org/"+name, timeoutMS, &metadata); err != nil {
		return "", nil, err
	}
	latest := metadata.DistTags["latest"]
	if !semverPattern.MatchString(latest) {
		return "", nil, errors.New("npm metadata has no exact latest version")
	}
	release := metadata.Versions[latest].Dist
	if !strings.HasPrefix(release.Tarball, "https://") || !integrityPattern.MatchString(release.Integrity) {
		return "", nil, errors.New("npm release has no verifiable artifact")
	}
	return latest, &artifactInfo{URL: release.Tarball, Integrity: release.Integrity}, nil
}

func pypiLatest(ctx context.Context, name string, timeoutMS int) (string, *artifactInfo, error) {
	var metadata struct {
		Info struct {
			Version string `json:"version"`
		} `json:"info"`
		Releases map[string][]struct {
			URL         string `json:"url"`
			PackageType string `json:"packagetype"`
			Digests     struct {
				SHA256 string `json:"sha256"`
			} `json:"digests"`
		} `json:"releases"`
	}
	if err := getJSON(ctx, "https://pypi.org/pypi/"+name+"/json", timeoutMS, &metadata); err != nil {
		return "", nil, err
	}
	if !semverPattern.MatchString(metadata.Info.Version) {
		return "", nil, errors.New("PyPI metadata has no exact latest version")
	}
	for _, file := range metadata.Releases[metadata.Info.Version] {
		if file.PackageType == "sdist" && strings.HasPrefix(file.URL, "https://") && len(file.Digests.SHA256) == 64 {
			digest, err := hexDigest(file.Digests.SHA256)
			if err == nil {
				return metadata.Info.Version, &artifactInfo{URL: file.URL, Integrity: "sha256-" + digest}, nil
			}
		}
	}
	return "", nil, errors.New("PyPI release has no verifiable artifact")
}

func hexDigest(value string) (string, error) {
	decoded := make([]byte, sha256.Size)
	for index := range decoded {
		var part uint8
		if _, err := fmt.Sscanf(value[index*2:index*2+2], "%02x", &part); err != nil {
			return "", err
		}
		decoded[index] = part
	}
	return base64.StdEncoding.EncodeToString(decoded), nil
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
	return json.NewDecoder(io.LimitReader(response.Body, 16<<20)).Decode(destination)
}

func customCheck(ctx context.Context, value paths, id string, item component, source sourceInfo, settings defaults) checkResult {
	return runCustomCheck(ctx, value, id, item, source, settings, item.Check.Command)
}

func runCustomCheck(ctx context.Context, value paths, id string, item component, source sourceInfo, settings defaults, command []string) checkResult {
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
	output := runCommand(ctx, command, cwd, map[string]string{
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
		SchemaVersion int           `json:"schemaVersion"`
		Status        string        `json:"status"`
		Summary       string        `json:"summary"`
		Current       string        `json:"current"`
		Latest        string        `json:"latest"`
		Artifact      *artifactInfo `json:"artifact"`
		SourceCommit  string        `json:"sourceCommit"`
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
	if reported.Artifact != nil {
		if err := validateArtifact(*reported.Artifact); err != nil {
			result.Status = "check-error"
			result.Summary = sanitizeSummary(err.Error())
			return result
		}
		result.Artifact = reported.Artifact
	}
	if reported.SourceCommit != "" {
		if !commitPattern.MatchString(reported.SourceCommit) {
			result.Status = "check-error"
			result.Summary = "custom check reported an invalid source commit"
			return result
		}
		result.SourceCommit = strings.ToLower(reported.SourceCommit)
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

func validateArtifact(artifact artifactInfo) error {
	parsed, err := url.Parse(artifact.URL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return errors.New("artifact url must be absolute HTTPS")
	}
	if !integrityPattern.MatchString(artifact.Integrity) {
		return errors.New("artifact requires sha256/sha384/sha512 integrity")
	}
	return nil
}

func scriptCheck(ctx context.Context, value paths, id string, item component, source sourceInfo, settings defaults) checkResult {
	return runCustomCheck(ctx, value, id, item, source, settings, []string{componentScript(*item.Target), "check"})
}
