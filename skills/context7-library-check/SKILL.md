---
name: context7-library-check
description: Verify external libraries against Context7 before coding. Use strict mode for new projects or dependency changes, and targeted mode for task-specific library work.
license: CC0-1.0
compatibility: opencode
metadata:
  audience: engineers
  workflow: context7
---

## What I do

- Ground library decisions in current documentation instead of memory.
- Use a hybrid policy:
  - Strict mode for new projects, scaffolding, stack selection, and newly added or changed dependencies.
  - Targeted mode for existing projects where the task only touches a small set of libraries.

## Required workflow

1. Identify the external libraries, frameworks, SDKs, build tools, ORMs, auth systems, UI kits, or test tools that matter to the task.
2. Determine the relevant version before querying docs. Prefer lockfiles first, then manifests, then existing config or imports.
3. If the user already provides a Context7 library ID in `/org/project` or `/org/project/version` format, use it directly.
4. Otherwise call `context7_resolve-library-id` before calling `context7_query-docs`.
5. Query Context7 with task-specific questions, not vague lookups. Ask about the API shape, setup constraints, migration caveats, recommended patterns, and version-sensitive behavior that will affect the code you are about to write.
6. Before implementation, summarize the relevant constraints and decisions that came from docs.
7. If docs are incomplete or ambiguous, state the assumption explicitly before proceeding.

## Strict mode

Use strict mode when any of the following is true:

- You are starting a greenfield project.
- You are bootstrapping or scaffolding an app or package.
- You are choosing a framework or adding, replacing, or upgrading dependencies.
- You are integrating a library into this codebase for the first time.

In strict mode:

- Review the primary libraries that shape the architecture of the work.
- Focus on setup flow, supported versions, recommended folder or module patterns, and any major caveats that could cause rework.
- Keep the scope practical. Do not query every dependency in the manifest if it is irrelevant to the current setup.

## Targeted mode

Use targeted mode when:

- The project already exists.
- The task is scoped to one or a few libraries.
- Only certain framework-specific APIs are being touched.

In targeted mode:

- Query only the libraries directly involved in the change.
- Prefer small, precise doc lookups over broad surveys.
- Re-check docs when the task depends on version-sensitive APIs, config keys, or patterns that are easy to misremember.

## When to skip

Skip Context7 when the task is:

- Purely internal refactoring, renaming, formatting, or comment edits.
- Limited to language syntax or standard library usage.
- About code that does not meaningfully depend on third-party APIs.

## Output expectation

Before writing code, briefly state:

- Which libraries were checked.
- Which version or version source was used.
- Which constraints, patterns, or caveats from docs will influence the implementation.
