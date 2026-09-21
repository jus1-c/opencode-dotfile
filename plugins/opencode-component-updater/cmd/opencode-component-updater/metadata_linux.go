//go:build linux

package main

import (
	"io/fs"
	"syscall"
)

func hasExternalHardlink(info fs.FileInfo) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && stat.Nlink > 1
}
