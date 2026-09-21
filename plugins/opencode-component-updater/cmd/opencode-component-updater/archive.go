package main

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type backupMetadata struct {
	SchemaVersion int      `json:"schemaVersion"`
	ComponentID   string   `json:"componentId"`
	Target        string   `json:"target"`
	RunID         string   `json:"runId"`
	CreatedAt     int64    `json:"createdAt"`
	From          string   `json:"from"`
	To            string   `json:"to"`
	ArchiveSHA256 string   `json:"archiveSha256"`
	Paths         []string `json:"paths"`
}

func backupArchivePath(value paths, componentID, runID string) string {
	return filepath.Join(value.BackupRoot, safeName(componentID), runID+".tar.gz")
}

func archiveComponentBackup(value paths, runID string, componentJournal *journalComponent) error {
	archive := backupArchivePath(value, componentJournal.ID, runID)
	if err := os.MkdirAll(filepath.Dir(archive), 0o700); err != nil {
		return err
	}
	metadataPath := strings.TrimSuffix(archive, ".tar.gz") + ".json"
	if _, err := os.Stat(archive); err == nil {
		digest, err := verifyArchive(archive)
		if err != nil {
			return err
		}
		if err := writeBackupMetadata(metadataPath, componentJournal, runID, digest); err != nil {
			return err
		}
		if err := os.RemoveAll(componentJournal.RawBackup); err != nil {
			return err
		}
		return pruneBackups(filepath.Dir(archive), 3)
	} else if !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	temporary := archive + ".tmp"
	_ = os.Remove(temporary)
	defer os.Remove(temporary)
	if err := createArchive(componentJournal.RawBackup, temporary); err != nil {
		return err
	}
	digest, err := verifyArchive(temporary)
	if err != nil {
		return err
	}
	if err := os.Rename(temporary, archive); err != nil {
		return err
	}
	if err := syncDirectory(filepath.Dir(archive)); err != nil {
		return err
	}
	if err := writeBackupMetadata(metadataPath, componentJournal, runID, digest); err != nil {
		return err
	}
	if err := os.RemoveAll(componentJournal.RawBackup); err != nil {
		return err
	}
	return pruneBackups(filepath.Dir(archive), 3)
}

func writeBackupMetadata(path string, componentJournal *journalComponent, runID, digest string) error {
	metadata := backupMetadata{
		SchemaVersion: 1,
		ComponentID:   componentJournal.ID,
		Target:        componentJournal.Target,
		RunID:         runID,
		CreatedAt:     nowMillis(),
		From:          componentJournal.Plan.Current,
		To:            componentJournal.Plan.Latest,
		ArchiveSHA256: digest,
		Paths:         componentJournal.Plan.Manifest.Paths,
	}
	return writeJSONAtomic(path, metadata)
}

func createArchive(root, output string) error {
	file, err := os.OpenFile(output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	gzipWriter := gzip.NewWriter(file)
	tarWriter := tar.NewWriter(gzipWriter)
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == root {
			return nil
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		if _, err := normalizeRelativePath(relative); err != nil {
			return err
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() && !info.Mode().IsRegular() || info.Mode().IsRegular() && hasExternalHardlink(info) {
			return fmt.Errorf("unsafe backup entry: %s", relative)
		}
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = filepath.ToSlash(relative)
		if info.IsDir() {
			header.Name += "/"
		}
		if err := tarWriter.WriteHeader(header); err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		input, err := os.Open(path)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(tarWriter, input)
		closeErr := input.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
	if err != nil {
		tarWriter.Close()
		gzipWriter.Close()
		return err
	}
	if err := tarWriter.Close(); err != nil {
		gzipWriter.Close()
		return err
	}
	if err := gzipWriter.Close(); err != nil {
		return err
	}
	return file.Sync()
}

func verifyArchive(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		file.Close()
		return "", err
	}
	tarReader := tar.NewReader(gzipReader)
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			gzipReader.Close()
			file.Close()
			return "", err
		}
		if _, err := normalizeRelativePath(strings.TrimSuffix(header.Name, "/")); err != nil {
			gzipReader.Close()
			file.Close()
			return "", fmt.Errorf("unsafe archive path: %w", err)
		}
		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeDir {
			gzipReader.Close()
			file.Close()
			return "", fmt.Errorf("unsupported archive entry: %s", header.Name)
		}
		if _, err := io.Copy(io.Discard, tarReader); err != nil {
			gzipReader.Close()
			file.Close()
			return "", err
		}
	}
	if err := gzipReader.Close(); err != nil {
		file.Close()
		return "", err
	}
	if err := file.Close(); err != nil {
		return "", err
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256(contents)
	return "sha256:" + hex.EncodeToString(hash[:]), nil
}

func pruneBackups(root string, keep int) error {
	archives, err := filepath.Glob(filepath.Join(root, "*.tar.gz"))
	if err != nil {
		return err
	}
	sort.Strings(archives)
	for len(archives) > keep {
		archive := archives[0]
		archives = archives[1:]
		if err := os.Remove(archive); err != nil && !errors.Is(err, fs.ErrNotExist) {
			return err
		}
		_ = os.Remove(strings.TrimSuffix(archive, ".tar.gz") + ".json")
	}
	return syncDirectory(root)
}
