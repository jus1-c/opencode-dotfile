package main

import (
	"context"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

func stageBuiltInSource(ctx context.Context, item component, plan plannedComponent, stage, manifestPath string, settings defaults) error {
	var paths []string
	var err error
	switch item.Source.Type {
	case "git":
		paths, err = stageGit(ctx, item, plan, stage, settings)
	case "npm":
		paths, err = stageNPM(ctx, item, plan, stage, settings)
	case "pypi":
		paths, err = stagePyPI(ctx, item, plan, stage, settings)
	default:
		err = fmt.Errorf("unsupported built-in source: %s", item.Source.Type)
	}
	if err != nil {
		return err
	}
	manifest := stageManifest{SchemaVersion: 2, PlanSHA256: plan.PlanSHA256, Paths: paths}
	contents, _ := json.MarshalIndent(manifest, "", "  ")
	return os.WriteFile(manifestPath, append(contents, '\n'), 0o600)
}

func stageGit(ctx context.Context, item component, plan plannedComponent, stage string, settings defaults) ([]string, error) {
	path := item.Source.Path
	destination := filepath.Join(stage, path)
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(destination, 0o700); err != nil {
		return nil, err
	}
	for _, command := range [][]string{
		{"git", "init", "--quiet", destination},
		{"git", "-C", destination, "remote", "add", "origin", item.Source.URL},
		{"git", "-C", destination, "fetch", "--quiet", "--depth", "1", "origin", plan.Latest},
		{"git", "-C", destination, "checkout", "--quiet", "--detach", "FETCH_HEAD"},
	} {
		output := runCommand(ctx, command, "", nil, settings.UpdateTimeoutMS, settings.MaxOutputBytes)
		if output.Code != 0 || output.Reason != "" {
			return nil, fmt.Errorf("stage Git source: %s", commandFailure(command[0], output))
		}
	}
	head := runCommand(ctx, []string{"git", "-C", destination, "rev-parse", "HEAD"}, "", nil, 5_000, 8_192)
	if strings.ToLower(strings.TrimSpace(head.Stdout)) != plan.Latest {
		return nil, errors.New("staged Git commit does not match plan")
	}
	return []string{path}, nil
}

func stageNPM(ctx context.Context, item component, plan plannedComponent, stage string, settings defaults) ([]string, error) {
	if plan.Artifact == nil {
		return nil, errors.New("npm update has no verified artifact")
	}
	root := stage
	if item.Source.Path != "" {
		root = filepath.Join(stage, item.Source.Path)
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, err
	}
	sourceManifest := filepath.Join(plan.Target, item.Source.Path, "package.json")
	contents, err := os.ReadFile(sourceManifest)
	if err != nil {
		return nil, err
	}
	var manifest map[string]any
	if json.Unmarshal(contents, &manifest) != nil {
		return nil, errors.New("invalid package.json")
	}
	updated := false
	for _, section := range []string{"dependencies", "devDependencies", "optionalDependencies"} {
		dependencies, ok := manifest[section].(map[string]any)
		if ok && dependencies[item.Source.Name] != nil {
			dependencies[item.Source.Name] = plan.Latest
			updated = true
		}
	}
	if !updated {
		return nil, fmt.Errorf("package.json does not declare %s", item.Source.Name)
	}
	contents, _ = json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(filepath.Join(root, "package.json"), append(contents, '\n'), 0o600); err != nil {
		return nil, err
	}
	if _, err := downloadVerified(ctx, *plan.Artifact); err != nil {
		return nil, err
	}
	output := runCommand(ctx, []string{"npm", "install", "--ignore-scripts", "--no-bin-links", "--no-audit", "--no-fund", "--save-exact", item.Source.Name + "@" + plan.Latest}, root, nil, settings.UpdateTimeoutMS, settings.MaxOutputBytes)
	if output.Code != 0 || output.Reason != "" {
		return nil, fmt.Errorf("stage npm source: %s", commandFailure("npm", output))
	}
	lockContents, err := os.ReadFile(filepath.Join(root, "package-lock.json"))
	if err != nil {
		return nil, err
	}
	var lock struct {
		Packages map[string]struct {
			Version   string `json:"version"`
			Integrity string `json:"integrity"`
		} `json:"packages"`
	}
	if json.Unmarshal(lockContents, &lock) != nil {
		return nil, errors.New("invalid package-lock.json")
	}
	installed := lock.Packages["node_modules/"+item.Source.Name]
	if installed.Version != plan.Latest || installed.Integrity != plan.Artifact.Integrity {
		return nil, errors.New("npm lock does not match planned artifact")
	}
	base := item.Source.Path
	return prefixedPaths(base, "package.json", "package-lock.json", "node_modules"), nil
}

func stagePyPI(ctx context.Context, item component, plan plannedComponent, stage string, settings defaults) ([]string, error) {
	if plan.Artifact == nil {
		return nil, errors.New("PyPI update has no verified artifact")
	}
	root := stage
	if item.Source.Path != "" {
		root = filepath.Join(stage, item.Source.Path)
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, err
	}
	requirementFile := plan.Source.Install
	if requirementFile == "" {
		requirementFile = "requirements.in"
	}
	requirements := filepath.Join(root, requirementFile)
	if existing := filepath.Join(plan.Target, item.Source.Path, plan.Source.Install); plan.Source.Install != "" {
		if contents, err := os.ReadFile(existing); err == nil {
			lines := strings.Split(string(contents), "\n")
			for index, line := range lines {
				if strings.HasPrefix(strings.ToLower(strings.TrimSpace(line)), strings.ToLower(item.Source.Name)+"==") {
					lines[index] = item.Source.Name + "==" + plan.Latest
				}
			}
			if err := os.WriteFile(requirements, []byte(strings.Join(lines, "\n")), 0o600); err != nil {
				return nil, err
			}
		}
	}
	if !fileExists(requirements) {
		if err := os.WriteFile(requirements, []byte(item.Source.Name+"=="+plan.Latest+"\n"), 0o600); err != nil {
			return nil, err
		}
	}
	dependencies := filepath.Join(root, ".component-updater-dependencies.txt")
	if contents, err := os.ReadFile(requirements); err == nil {
		lines := []string{}
		for _, line := range strings.Split(string(contents), "\n") {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(strings.ToLower(trimmed), strings.ToLower(item.Source.Name)+"==") {
				continue
			}
			lines = append(lines, line)
		}
		if err := os.WriteFile(dependencies, []byte(strings.Join(lines, "\n")), 0o600); err != nil {
			return nil, err
		}
	}
	artifact, err := downloadVerified(ctx, *plan.Artifact)
	if err != nil {
		return nil, err
	}
	parsed, _ := url.Parse(plan.Artifact.URL)
	filename := filepath.Base(parsed.Path)
	if filename == "." || filename == "/" || filename == "" {
		filename = "release-artifact"
	}
	artifactPath := filepath.Join(root, ".component-updater-"+filename)
	if err := os.WriteFile(artifactPath, artifact, 0o600); err != nil {
		return nil, err
	}
	python := "python3"
	if candidate := filepath.Join(plan.Target, item.Source.Path, ".venv", "bin", "python"); fileExists(candidate) {
		python = candidate
	}
	venv := filepath.Join(root, ".venv")
	for _, command := range [][]string{
		{python, "-m", "venv", "--copies", venv},
		{filepath.Join(venv, "bin", "python"), "-m", "pip", "install", "--no-cache-dir", "-r", dependencies},
		{filepath.Join(venv, "bin", "python"), "-m", "pip", "install", "--force-reinstall", "--no-deps", artifactPath},
	} {
		output := runCommand(ctx, command, root, nil, settings.UpdateTimeoutMS, settings.MaxOutputBytes)
		if output.Code != 0 || output.Reason != "" {
			return nil, fmt.Errorf("stage PyPI source: %s", commandFailure(command[0], output))
		}
	}
	_ = os.Remove(artifactPath)
	_ = os.Remove(dependencies)
	base := item.Source.Path
	return prefixedPaths(base, requirementFile, ".venv"), nil
}

func downloadVerified(ctx context.Context, artifact artifactInfo) ([]byte, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, artifact.URL, nil)
	if err != nil {
		return nil, err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("artifact returned HTTP %d", response.StatusCode)
	}
	contents, err := io.ReadAll(io.LimitReader(response.Body, 512<<20))
	if err != nil {
		return nil, err
	}
	algorithm, expected, found := strings.Cut(artifact.Integrity, "-")
	if !found {
		return nil, errors.New("invalid artifact integrity")
	}
	var actual string
	switch algorithm {
	case "sha256":
		digest := sha256.Sum256(contents)
		actual = base64.StdEncoding.EncodeToString(digest[:])
	case "sha384":
		digest := sha512.Sum384(contents)
		actual = base64.StdEncoding.EncodeToString(digest[:])
	case "sha512":
		digest := sha512.Sum512(contents)
		actual = base64.StdEncoding.EncodeToString(digest[:])
	default:
		return nil, errors.New("unsupported artifact integrity")
	}
	if actual != expected {
		return nil, errors.New("artifact integrity mismatch")
	}
	return contents, nil
}

func prefixedPaths(prefix string, paths ...string) []string {
	if prefix == "" {
		return paths
	}
	for index := range paths {
		paths[index] = filepath.Join(prefix, paths[index])
	}
	return paths
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}
