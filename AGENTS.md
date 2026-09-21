# Global OpenCode Rules

## Context7-first library workflow

When a task involves an external library, framework, SDK, build tool, ORM, auth system, UI kit, test tool, or any other third-party API surface, immediately load the `context7-library-check` skill with the `skill` tool before making implementation decisions.

This is mandatory when any of the following is true:

- Starting a new project.
- Scaffolding or choosing a stack.
- Adding, replacing, or upgrading dependencies.
- Using a library in this codebase for the first time.
- Editing code that depends on framework-specific or library-specific APIs.

Do not skip the skill just because the API seems familiar from memory. Confirm version-sensitive behavior and recommended patterns with Context7 first.

Skip the skill only when the task is clearly internal-only:

- Internal refactors.
- Formatting, comments, or renames.
- Standard-library-only or language-only work.
- Changes with no meaningful third-party API usage.

When the skill applies, keep the Context7 lookup targeted and concise, then summarize the relevant constraints before coding.

## Karpathy coding guidelines

When writing, reviewing, or refactoring non-trivial code, immediately load the `karpathy-guidelines` skill with the `skill` tool before proceeding.

This is mandatory when any of the following is true:

- Writing new features or modules.
- Refactoring existing code.
- Reviewing or editing diffs.
- Debugging complex bugs.

Skip the skill only when the task is trivial (typos, obvious one-liners, simple renames).

When the skill applies, follow the four principles (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) and state success criteria before implementing.

## Math output (TUI)

TUI render markdown only. No LaTeX/KaTeX engine. KaTeX render lives in web/desktop, not terminal. So math must be unicode/ASCII, readable in monospace.

- Never emit `$...$`, `$$...$$`, `\(...\)`, `\[...\]`. No LaTeX delimiters.
- Superscript: `xⁿ`, `x²`, `x³`. Subscript: `Pᵢ`, `log₂`, `xₙ`.
- Operators: `Σ ∏ √ ∫ ∂ ∇ · × ± ≤ ≥ ≠ ≈ ≡ ∈ ∉ ⊆ ∪ ∩ ∞ → ⇒`.
- Greek: `α β γ δ θ λ μ π ρ σ φ ω`.
- Sum form inline: `Σ (i=1..n) term`. Product: `∏ (i=1..n) term`.
- Fraction inline: `a/b`. Root: `√x`, `ⁿ√x`.
- Big/structured math (matrices, stacked fractions, multi-step derivation) → fenced code block, ASCII layout aligned.
- Literal dollar (money) stay plain `$5`, no escaping needed since no LaTeX.

Example: `Entropy(D) = -Σ (i=1..n) Pᵢ · log₂(Pᵢ)`

<!-- context7 -->
Use Context7 MCP to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service -- even well-known ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot. This includes API syntax, configuration, version migration, library-specific debugging, setup instructions, and CLI tool usage. Use even when you think you know the answer -- your training data may not reflect recent changes. Prefer this over web search for library docs.

Do not use for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

## Steps

1. Always start with `resolve-library-id` using the library name and the user's question, unless the user provides an exact library ID in `/org/project` format
2. Pick the best match (ID format: `/org/project`) by: exact name match, description relevance, code snippet count, source reputation (High/Medium preferred), and benchmark score (higher is better). If results don't look right, try alternate names or queries (e.g., "next.js" not "nextjs", or rephrase the question). Use version-specific IDs when the user mentions a version
3. `query-docs` with the selected library ID and the user's full question (not single words)
4. Answer using the fetched docs
<!-- context7 -->

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->

<!-- caveman-begin -->
Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan-lite|wenyan-full|wenyan-ultra
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
<!-- caveman-end -->
