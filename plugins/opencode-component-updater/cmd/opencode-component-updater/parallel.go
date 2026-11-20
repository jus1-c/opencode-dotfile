package main

import (
	"context"
	"sync"
)

// runBounded runs fn for every index with at most limit goroutines active and
// returns each item's error, indexed like items. A context cancellation stops
// dispatching new work; items already running still finish.
func runBounded[T any](ctx context.Context, limit int, items []T, fn func(context.Context, int, T) error) []error {
	if limit < 1 {
		limit = 1
	}
	errs := make([]error, len(items))
	semaphore := make(chan struct{}, limit)
	var wait sync.WaitGroup
	for index := range items {
		if err := ctx.Err(); err != nil {
			errs[index] = err
			continue
		}
		select {
		case semaphore <- struct{}{}:
		case <-ctx.Done():
			errs[index] = ctx.Err()
			continue
		}
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			defer func() { <-semaphore }()
			errs[index] = fn(ctx, index, items[index])
		}(index)
	}
	wait.Wait()
	return errs
}

// safeReporter serializes progress events so concurrent phases never interleave
// output, and reports progress by finished task count.
type safeReporter struct {
	report  reporter
	total   int
	mutex   sync.Mutex
	current int
}

func newSafeReporter(report reporter, total int) *safeReporter {
	if report == nil {
		return nil
	}
	return &safeReporter{report: report, total: total}
}

func (safe *safeReporter) emit(event progress) {
	if safe == nil {
		return
	}
	safe.mutex.Lock()
	defer safe.mutex.Unlock()
	if event.Total == 0 {
		event.Total = safe.total
	}
	safe.report(event)
}

func (safe *safeReporter) done(event progress) {
	if safe == nil {
		return
	}
	safe.mutex.Lock()
	defer safe.mutex.Unlock()
	safe.current++
	event.Current = safe.current
	event.Total = safe.total
	safe.report(event)
}
