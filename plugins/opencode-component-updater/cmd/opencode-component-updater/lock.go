package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

var errOperationRunning = errors.New("another component-updater operation is already running")

type lockRecord struct {
	Token     string `json:"token"`
	PID       int    `json:"pid"`
	Operation string `json:"operation"`
	StartedAt int64  `json:"startedAt"`
}

type operationLock struct {
	path  string
	token string
}

func acquireOperationLock(value paths, operation string) (*operationLock, error) {
	if err := os.MkdirAll(filepath.Dir(value.LockPath), 0o700); err != nil {
		return nil, err
	}
	for attempt := 0; attempt < 2; attempt++ {
		token, err := randomToken()
		if err != nil {
			return nil, err
		}
		file, err := os.OpenFile(value.LockPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err == nil {
			record := lockRecord{Token: token, PID: os.Getpid(), Operation: operation, StartedAt: nowMillis()}
			if err := json.NewEncoder(file).Encode(record); err != nil {
				file.Close()
				os.Remove(value.LockPath)
				return nil, err
			}
			if err := file.Sync(); err != nil {
				file.Close()
				os.Remove(value.LockPath)
				return nil, err
			}
			if err := file.Close(); err != nil {
				return nil, err
			}
			if err := syncDirectory(filepath.Dir(value.LockPath)); err != nil {
				return nil, err
			}
			return &operationLock{path: value.LockPath, token: token}, nil
		}
		if !errors.Is(err, fs.ErrExist) {
			return nil, err
		}
		contents, readErr := os.ReadFile(value.LockPath)
		var holder lockRecord
		if errors.Is(readErr, fs.ErrNotExist) {
			continue
		}
		if readErr != nil {
			return nil, fmt.Errorf("cannot read updater lock: %w", readErr)
		}
		if err := json.Unmarshal(contents, &holder); err != nil || holder.PID <= 0 || holder.Token == "" {
			return nil, fmt.Errorf("cannot verify updater lock: malformed or incomplete lock file")
		}
		alive, processErr := processExists(holder.PID)
		if processErr != nil {
			return nil, fmt.Errorf("cannot verify updater lock owner: %w", processErr)
		}
		if !alive {
			return nil, fmt.Errorf("stale updater lock remains; verify pid %d is stopped and remove %s manually", holder.PID, value.LockPath)
		}
		return nil, fmt.Errorf("%w: pid %d (%s)", errOperationRunning, holder.PID, holder.Operation)
	}
	return nil, errOperationRunning
}

func (lock *operationLock) release() {
	contents, err := os.ReadFile(lock.path)
	if err != nil {
		return
	}
	var holder lockRecord
	if json.Unmarshal(contents, &holder) != nil || holder.Token != lock.token {
		return
	}
	_ = os.Remove(lock.path)
	_ = syncDirectory(filepath.Dir(lock.path))
}

func randomToken() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
