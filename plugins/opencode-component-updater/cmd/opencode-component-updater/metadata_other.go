//go:build !linux

package main

import "io/fs"

func hasExternalHardlink(info fs.FileInfo) bool {
	return false
}
