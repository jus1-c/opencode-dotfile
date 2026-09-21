package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const manifestFile = ".opencode-component-updater-manifest.json"

func safeName(value string) string {
	var output strings.Builder
	for _, character := range value {
		if character >= 'A' && character <= 'Z' || character >= 'a' && character <= 'z' || character >= '0' && character <= '9' || character == '.' || character == '_' || character == '-' {
			output.WriteRune(character)
		} else {
			output.WriteByte('-')
		}
	}
	return output.String()
}

func validateManifest(item component, componentPlan plannedComponent, stage string) (stageManifest, error) {
	if err := assertSecureDirectory(componentPlan.Target); err != nil {
		return stageManifest{}, err
	}
	if err := assertSecureDirectory(stage); err != nil {
		return stageManifest{}, err
	}
	contents, err := os.ReadFile(filepath.Join(stage, manifestFile))
	if err != nil {
		return stageManifest{}, fmt.Errorf("read stage manifest: %w", err)
	}
	var manifest stageManifest
	if err := json.Unmarshal(contents, &manifest); err != nil {
		return stageManifest{}, fmt.Errorf("parse stage manifest: %w", err)
	}
	if manifest.SchemaVersion != 2 || manifest.PlanSHA256 != componentPlan.PlanSHA256 || len(manifest.Paths) == 0 {
		return stageManifest{}, errors.New("stage manifest is invalid or is not bound to its plan")
	}
	paths, err := normalizeManifestPaths(manifest.Paths)
	if err != nil {
		return stageManifest{}, err
	}
	allowed, err := normalizeManifestPaths(item.Policy.AllowedPaths)
	if err != nil {
		return stageManifest{}, fmt.Errorf("allowed paths: %w", err)
	}
	protected, err := normalizeManifestPaths(item.Policy.ProtectedPaths)
	if err != nil {
		return stageManifest{}, fmt.Errorf("protected paths: %w", err)
	}
	if len(allowed) == 0 {
		return stageManifest{}, errors.New("component has no allowed update paths")
	}
	for _, path := range paths {
		if !withinAny(path, allowed) {
			return stageManifest{}, fmt.Errorf("manifest path is not allowed: %s", path)
		}
		if overlapsAny(path, protected) {
			return stageManifest{}, fmt.Errorf("manifest path is protected: %s", path)
		}
		current, err := resolveChild(componentPlan.Target, path)
		if err != nil {
			return stageManifest{}, err
		}
		if err := assertNoSymlinkParents(componentPlan.Target, current); err != nil {
			return stageManifest{}, fmt.Errorf("target path %s: %w", path, err)
		}
		if info, err := os.Lstat(current); err == nil && info.Mode()&os.ModeSymlink != 0 {
			return stageManifest{}, fmt.Errorf("target path is symbolic: %s", path)
		} else if err == nil {
			if err := assertSafeTree(componentPlan.Target, current); err != nil {
				return stageManifest{}, fmt.Errorf("target path %s: %w", path, err)
			}
		} else if err != nil && !errors.Is(err, fs.ErrNotExist) {
			return stageManifest{}, err
		}
	}
	for _, path := range paths {
		staged, err := resolveChild(stage, path)
		if err != nil {
			return stageManifest{}, err
		}
		if err := assertSafeTree(stage, staged); err != nil {
			return stageManifest{}, fmt.Errorf("staged path %s: %w", path, err)
		}
	}
	manifest.Paths = paths
	return manifest, nil
}

func normalizeManifestPaths(paths []string) ([]string, error) {
	normalized := make([]string, 0, len(paths))
	for _, path := range paths {
		path, err := normalizeRelativePath(path)
		if err != nil {
			return nil, err
		}
		normalized = append(normalized, path)
	}
	sort.Strings(normalized)
	for index := range normalized {
		if index > 0 && normalized[index] == normalized[index-1] {
			return nil, fmt.Errorf("duplicate path: %s", normalized[index])
		}
		if index > 0 && pathsOverlap(normalized[index-1], normalized[index]) {
			return nil, fmt.Errorf("overlapping paths: %s and %s", normalized[index-1], normalized[index])
		}
	}
	return normalized, nil
}

func normalizeRelativePath(value string) (string, error) {
	if value == "" || filepath.IsAbs(value) || strings.Contains(value, "\\") {
		return "", fmt.Errorf("invalid relative path: %q", value)
	}
	clean := filepath.Clean(value)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path escapes component root: %q", value)
	}
	return clean, nil
}

func resolveChild(root, relative string) (string, error) {
	normalized, err := normalizeRelativePath(relative)
	if err != nil {
		return "", err
	}
	path := filepath.Join(root, normalized)
	if !within(root, path) {
		return "", fmt.Errorf("path escapes component root: %q", relative)
	}
	return path, nil
}

func pathsOverlap(left, right string) bool {
	return left == right || strings.HasPrefix(left, right+string(filepath.Separator)) || strings.HasPrefix(right, left+string(filepath.Separator))
}

func withinAny(path string, roots []string) bool {
	for _, root := range roots {
		if path == root || strings.HasPrefix(path, root+string(filepath.Separator)) {
			return true
		}
	}
	return false
}

func overlapsAny(path string, roots []string) bool {
	for _, root := range roots {
		if pathsOverlap(path, root) {
			return true
		}
	}
	return false
}

func assertSecureDirectory(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("must be a non-symbolic directory: %s", path)
	}
	return nil
}

func assertNoSymlinkParents(root, path string) error {
	if !within(root, path) {
		return errors.New("path escapes root")
	}
	relative, err := filepath.Rel(root, path)
	if err != nil {
		return err
	}
	current := root
	for _, part := range strings.Split(relative, string(filepath.Separator)) {
		if part == "" || part == "." {
			continue
		}
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("symbolic path segment: %s", current)
		}
	}
	return nil
}

func assertSafeTree(root, path string) error {
	if err := assertNoSymlinkParents(root, path); err != nil {
		return err
	}
	return filepath.WalkDir(path, func(current string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("symbolic entry: %s", current)
		}
		if !info.IsDir() && !info.Mode().IsRegular() {
			return fmt.Errorf("unsupported entry: %s", current)
		}
		if info.Mode().IsRegular() && hasExternalHardlink(info) {
			return fmt.Errorf("hardlinked file: %s", current)
		}
		return nil
	})
}
