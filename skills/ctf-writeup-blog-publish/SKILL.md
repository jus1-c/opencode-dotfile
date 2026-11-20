---
name: ctf-writeup-blog-publish
description: Use when polishing, publishing, or updating CTF/SOC writeups from local writeup.md and image/ to the Astro blog on <blog-host>, including markdown restructuring, pnpm new-post, asset copy, build, Docker recreate, and verification.
license: CC0-1.0
compatibility: opencode
metadata:
  workflow: blog-publish
  target: astro-docker-home-server
---

# CTF Writeup Blog Publish

## What I Do

- Polish a local CTF/SOC `writeup.md` into a friendlier blog-style Markdown structure when needed.
- Publish a local CTF/SOC writeup to the Astro blog on `<blog-host>`.
- Convert `writeup.md` plus local `image/` assets into an Astro content post.
- Update an existing post when the user asks for small additions such as references.
- Build the blog, recreate the Docker container, and verify the served page.

## Defaults

Resolve `<blog-host>`, `<blog-path>`, and `<blog-container>` from the user or private machine-local settings before using the commands. Never commit those values. Use these defaults unless the user overrides them:

- SSH alias: `<blog-host>`
- Blog path: `<blog-path>`
- Local markdown: `writeup.md`
- Local image directory: `image/`
- Remote post directory: `src/content/posts`
- Remote image directory: `src/content/posts/image/<slug>/`
- Remote public files directory: `public/files/<slug>/`
- Docker Compose file: `docker-compose.yaml`
- Docker service: `blog`
- Container name: `<blog-container>`
- Local temp directory: `/tmp/opencode`
- Local post temp file: `/tmp/opencode/<slug>.md`

## When To Use

Use this skill when the user asks to:

- đăng writeup lên blog
- làm đẹp `writeup.md`
- chỉnh cấu trúc Markdown cho writeup
- publish writeup
- tạo post từ `writeup.md`
- copy writeup và image lên home server
- update post trên server
- build lại blog và recreate Docker container

## Inputs To Confirm

Ask at most one short clarification question if missing information materially changes the result.

- `slug`, for example `cyberdefender-day-1`
- post title, unless it should be copied from the first H1 in `writeup.md`
- publish date, unless current date or user-provided date is acceptable
- whether this is a new post or an update to an existing post
- whether the writeup also needs structure cleanup before publishing
- whether to remove the first H1 from body, default yes for blog posts

## Safety Rules

- Never delete unrelated posts, images, public files, containers, or Docker images.
- Never overwrite an existing remote post unless the user explicitly asks to update that slug.
- Preserve existing user edits in the remote post unless regenerating from local `writeup.md` is explicitly intended.
- Prefer sequential SSH commands over parallel SSH when agent auth is flaky.
- Do not use `git reset`, `git checkout --`, or destructive cleanup commands.
- Use `/tmp/opencode` for temporary generated files.
- Clean up only temporary files created by this workflow.

## Preflight Checks

Before changing remote files, verify:

```bash
ssh <blog-host> 'true'
```

Verify blog path:

```bash
ssh <blog-host> 'test -d "<blog-path>"'
```

For a new post, verify the target slug does not exist:

```bash
ssh <blog-host> 'test ! -e "<blog-path>/src/content/posts/<slug>.md" && test ! -e "<blog-path>/src/content/posts/image/<slug>"'
```

For an update, verify the target post exists:

```bash
ssh <blog-host> 'test -f "<blog-path>/src/content/posts/<slug>.md"'
```

If project structure may have changed, inspect these files before proceeding:

- `<blog-path>/scripts/new-post.js`
- `<blog-path>/src/content/config.ts`
- `<blog-path>/docker-compose.yaml`
- `<blog-path>/Dockerfile`

## Frontmatter Template

Use this Astro frontmatter shape for this blog:

```yaml
---
title: '<title>'
published: <YYYY-MM-DD>
description: '<short description>'
image: ''
tags: [Writeup, CyberDefenders, SOC, Network Forensics]
category: 'Writeup'
draft: false
lang: 'vi'
---
```

Adjust `tags`, `category`, `description`, and `lang` only when user asks or the writeup clearly needs it.

## Content Conversion Rules

- Generate post body from local `writeup.md`.
- Keep Markdown content unchanged unless the user asks to edit it.
- Remove first H1 from body when it duplicates frontmatter `title`.
- Convert Markdown image links from `image/<filename>` to `image/<slug>/<filename>`.
- Preserve URL-encoded spaces in image paths.
- Keep code fences and command snippets unchanged.
- Keep external reference links unchanged.
- Preserve Vietnamese tone and terminology.

## Series And Evidence Fidelity

These rules override general polish guidance when local screenshots or earlier writeups exist.

Before drafting or editing a local writeup:

1. Read `writeup.md`, enumerate `image/`, and inspect every relevant supplied image with `read`. Do not claim that screenshot text cannot be read before inspecting the image attachment.
2. Find and read one or more previous writeups in the same local series. Reuse their section order, table labels, question format, caption style, and language conventions.
3. Build an evidence map before writing: `Q -> image(s) -> visible query/filter/command -> visible evidence -> answer`.
4. Treat screenshots and local lab artifacts as primary evidence. When available, use the official challenge page only for challenge metadata, scenario text, and original question wording.
5. Never use a third-party writeup to reconstruct the user's query, filter, command, timeline, evidence value, answer, or attack step. External writeups may provide background only when clearly labeled and never replace local evidence.

### Preserve Series Format

- Preserve the original challenge text inside the `## Scenario` blockquote.
- Preserve original question wording and language in every `### Qx.` heading. Follow the language split established by the local series.
- Translate scenario or question text only when the user explicitly asks.
- Keep Vietnamese for the investigation narrative, captions, conclusions, and `**Đáp án:**` labels unless the established series uses another style.

### Screenshot And Query Rules

- Copy a query, filter, command, or code snippet exactly as visible in the screenshot. Rewrapping for Markdown readability is allowed; changing, adding, or removing tokens is not.
- Include an executable code block only when its full text is visible in the relevant UI or an untruncated browser URL.
- If the input area is scrolled out of view, inspect the browser URL. If it ends in an ellipsis or clips the text, do not infer the missing suffix and do not fabricate a complete code block.
- When needed, create a temporary crop under `/tmp/opencode` to inspect the relevant UI, then remove only that crop after use.
- State only labels, fields, values, and actions visible in the mapped screenshot. Do not substitute a nearby item for the one actually shown.
- Do not claim an outcome, capability, or action when the relevant evidence is collapsed or absent from the screenshot. Describe it as a risk or use only wording confirmed by the original question.
- Map each image to the question it proves. When two images support one question, explain the distinct role of each image. If the user asks to use `image/`, include every clearly relevant evidence screenshot; ask about an ambiguous orphan rather than using it decoratively.

### Evidence Validation

Before saving the writeup, verify:

- Every query, filter, command, or code block matches fully visible evidence in its mapped screenshot.
- Each caption describes the query, output, or artifact actually visible in that image.
- Each conclusion and answer follows from mapped evidence, not from a reference writeup.
- Every Markdown image link points to an existing local image file.

## Markdown Structure For Friendly Writeups

When the user asks to make the writeup prettier, more readable, blog-like, or less report-like before publishing, polish `writeup.md` with this structure.

Use a friendly Vietnamese blog tone:

- Prefer `mình` for narration unless the user prefers another voice.
- Keep technical terms in English when clearer.
- Explain what was inspected and why, not only the final answer.
- Do not add unsupported claims beyond available evidence.
- Add short background only when useful and verifiable.

Recommended structure:

```md
# [Challenge Platform] Lab Title

## Tổng quan

| Thuộc tính | Giá trị |
| --- | --- |
| Category | ... |
| Tactics | ... |
| Tools | ... |
| Difficulty | ... |

## Scenario

> Original scenario text...

Short Vietnamese intro explaining the investigation goal and approach.

## Tóm tắt nhanh

| Câu hỏi | Kết quả |
| --- | --- |
| ... | `...` |

## Attack Chain

1. First attacker action.
2. Next attacker action.
3. Post-exploitation action.

## Phân tích chi tiết

### Q1. Original question

Explain what to find, how to filter/search, and why that method helps.

![Q1 - Evidence caption](image/Screenshot.png)

Short conclusion sentence.

**Đáp án:** `answer`

## Timeline

| Thứ tự | Hành động | Dấu vết chính |
| --- | --- | --- |
| 1 | ... | `...` |

## IOC Summary

| Loại | Giá trị |
| --- | --- |
| ... | `...` |

## MITRE ATT&CK Mapping

| Hành vi | Technique |
| --- | --- |
| ... | `Txxxx - Technique Name` |

## Remediation

1. Practical remediation step.
2. Practical remediation step.

## Kết luận

Short wrap-up that connects the evidence into an attack story.

## References

- [Reference title](https://example.com)
```

Per-question style:

- Use `### Qx. <original question>` headings without translating or paraphrasing the challenge question.
- Lead with the analysis method in 1-2 paragraphs.
- Show the exact verified query, filter, or command when it is fully visible; otherwise explain the visible evidence without inventing one.
- Put evidence image immediately after the method.
- End with a short explanation and `**Đáp án:** \`...\``.
- If two questions use the same screenshot, keep the link but explain why the same evidence supports both answers.

Useful optional sections:

- `Attack Chain` when the lab has sequential attacker behavior.
- `Timeline` when there are timestamps or clear event order.
- `IOC Summary` for IPs, files, accounts, credentials, hashes, domains, URLs, commands.
- `MITRE ATT&CK Mapping` for technique IDs asked by the lab or useful for SOC context.
- `Remediation` for real-world lessons after the CTF answers.

References:

- Add a `## References` section at the end when the user provides challenge links, advisories, CVE pages, or external docs.
- Prefer human-readable link titles.
- Do not invent references.

## New Post Workflow

Create the post with the blog's own script:

```bash
ssh <blog-host> 'pnpm --dir "<blog-path>" new-post <slug>'
```

Copy images:

```bash
scp -r "image/." <blog-host>:"<blog-path>/src/content/posts/image/<slug>/"
```

Generate the converted post locally, then upload it:

```bash
python3 - <<'PY'
from pathlib import Path

slug = "<slug>"
title = "<title>"
published = "<YYYY-MM-DD>"
description = "<description>"

src = Path("writeup.md")
dst = Path(f"/tmp/opencode/{slug}.md")
body = src.read_text()

lines = body.splitlines()
if lines and lines[0].startswith("# "):
    lines = lines[1:]
while lines and lines[0].strip() == "":
    lines = lines[1:]

body = "\n".join(lines).replace("](image/", f"](image/{slug}/")
frontmatter = f"""---
title: '{title}'
published: {published}
description: '{description}'
image: ''
tags: [Writeup, CyberDefenders, SOC, Network Forensics]
category: 'Writeup'
draft: false
lang: 'vi'
---

"""

dst.write_text(frontmatter + body + "\n")
print(dst)
PY
```

Upload the generated post:

```bash
scp "/tmp/opencode/<slug>.md" <blog-host>:"<blog-path>/src/content/posts/<slug>.md"
```

## Existing Post Update Workflow

When the user asks to update an existing post from local `writeup.md`, regenerate and upload the post using the same content conversion rules.

When the user asks for a small remote-only update, edit the remote source post carefully and preserve frontmatter and unrelated content. Prefer uploading a regenerated local file when local `writeup.md` is canonical.

After updating, verify the relevant tail or snippet:

```bash
ssh <blog-host> 'python3 -c '\''from pathlib import Path; p=Path("<blog-path>/src/content/posts/<slug>.md"); lines=p.read_text().splitlines(); print("\n".join(lines[-20:]))'\'''
```

## Image Verification

Verify Markdown image links resolve to files:

```bash
ssh <blog-host> 'python3 -c '\''import re, urllib.parse; from pathlib import Path; root=Path("<blog-path>"); slug="<slug>"; post=root/"src/content/posts"/f"{slug}.md"; text=post.read_text(); links=re.findall(r"\]\((image/"+re.escape(slug)+r"/[^)]+)\)", text); missing=[]
for link in links:
    name=urllib.parse.unquote(link.split("/")[-1])
    if not (root/"src/content/posts/image"/slug/name).exists(): missing.append(link)
print(f"image_links={len(links)} missing={len(missing)}")
if missing: print("\n".join(missing))'\'''
```

## Build Workflow

Host shell may use an old system Node. This blog has `nvm`; prefer it when needed:

```bash
ssh <blog-host> 'bash -lc "source \"$HOME/.nvm/nvm.sh\" && cd \"<blog-path>\" && pnpm build"'
```

If `pnpm build` warns about unrelated old posts, report the warning but continue only when build exits `0`.

Known non-blocking warning seen in this repo:

- `astro-expressive-code` cannot highlight custom languages `hex`, `sha256`, or `flag` in `writeup-cscv-quals-2025.md` and falls back to `txt`.

## Docker Recreate

Rebuild and recreate the blog container:

```bash
ssh <blog-host> 'docker compose -f "<blog-path>/docker-compose.yaml" --project-directory "<blog-path>" up -d --build --force-recreate blog'
```

## Deployment Verification

Verify container status:

```bash
ssh <blog-host> 'docker ps --filter "name=<blog-container>" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
```

Verify post URL:

```bash
ssh <blog-host> 'curl -fsS -I "http://127.0.0.1:4321/posts/<slug>/"'
```

Verify specific content exists in served HTML when relevant:

```bash
ssh <blog-host> 'curl -fsS "http://127.0.0.1:4321/posts/<slug>/" | python3 -c '\''import sys; text=sys.stdin.read(); print("present=", "<expected text>" in text)'\'''
```

## Cleanup

Remove temporary files created by this workflow only:

```bash
rm "/tmp/opencode/<slug>.md"
ssh <blog-host> 'rm -f "/tmp/<slug>-writeup.md"'
```

## Final Response Checklist

Report these facts concisely:

- local file updated, if applicable
- remote post path
- remote image path
- build status
- container status
- verified URL
- specific content verification, if applicable
- non-blocking warnings

Mention that a newly created skill requires restarting OpenCode only when the task was to create or edit a skill.
