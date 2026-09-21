---
name: windows-disk-forensics
description: Investigate Windows disk images with a DFIR-first workflow using current MCPs, including browser artifacts and selective directory extraction.
license: CC0-1.0
compatibility: opencode
---

# Windows Disk Forensics

## What I do

- Investigate Windows disk images with the current disk-forensics, windows-forensics, browser-forensics, and utility MCPs.
- Default to a DFIR-first workflow that still works well for CTFs.
- Treat browser artifacts as first-class evidence, not as a late optional branch.
- Prefer minimal extraction first, then broaden to directory extraction only when the artifact family depends on multiple related files.

## When to use me

- The user provides a Windows disk image for triage, investigation, or a CTF challenge.
- The goal is to reconstruct execution, persistence, downloads, browser activity, credentials, sessions, or deleted evidence.
- The case may need both classic Windows artifacts and Chromium or Firefox profile artifacts.

## Defaults

If the user does not specify otherwise, use these defaults:

- Mode: `full`
- Report language: Vietnamese
- Browser triage: enabled when browser profiles are found
- Extraction policy: minimal first, broader collection only when justified
- Decryption: only when the user asks for it or the evidence clearly requires it
- External enrichment such as VirusTotal: only when local analysis is not enough

## Inputs to confirm

Ask at most one short clarification question if a missing input materially changes the workflow. Otherwise infer and proceed.

- `image_path`
- Investigation goal: timeline, execution, browser activity, credential hunting, malware, deleted files, or general triage
- Priority: speed or completeness
- Whether broader directory extraction is acceptable
- Whether credential or session decryption is in scope

## Core rules

1. Prove which partition contains Windows before doing deeper work.
2. Map artifact presence before parsing aggressively.
3. Use `disk-forensics_*` to inspect the image and extract data from it.
4. Use `windows-forensics_*` and browser `forensics-utils_*` on extracted local files or extracted local profile directories.
5. Prefer `disk-forensics_extract_file` for a single known artifact.
6. Prefer `disk-forensics_extract_directory` for artifact sets with important companion files.
7. Browser triage belongs in the main workflow, immediately after the core Windows artifact pass.
8. Separate confirmed facts from hypotheses.
9. Stop expanding the search once the user's question is answered with reasonable confidence.

## End-to-end workflow

### 1. Intake

Goal: understand the image format, size, partition layout, and any immediate blockers.

Use:

- `disk-forensics_analyze_disk_image`
- `disk-forensics_calculate_hash` when hashing matters

Report blockers early:

- encrypted volume
- unsupported layout
- missing or unreadable partition table

### 2. Partition discovery

Goal: identify the Windows partition.

Use:

- `disk-forensics_list_partitions`
- `disk-forensics_get_directory_tree`
- `disk-forensics_list_files`

Choose the partition that shows strong Windows indicators such as:

- `/Windows`
- `/Users`
- `/ProgramData`

### 3. User and browser profile discovery

Goal: identify users and likely browser profiles before deep parsing.

Prioritize these locations:

- Chromium-family profiles under `Users/<user>/AppData/Local/*/User Data`
- Firefox profiles under `Users/<user>/AppData/Roaming/Mozilla/Firefox/Profiles`

Capture:

- usernames
- candidate profile paths
- presence of Chromium `Local State`
- whether multiple profiles exist

### 4. Core Windows artifact pass

Goal: collect the fastest high-confidence evidence for execution, persistence, access, and system activity.

Prioritize:

- EVTX logs
- Registry hives
- Prefetch
- LNK files and Jump Lists
- SRUM
- `Amcache.hve` when present

Extract first with `disk-forensics_extract_file` or `disk-forensics_extract_directory`, then parse locally with:

- `windows-forensics_evtx_*`
- `windows-forensics_registry_*`
- `windows-forensics_prefetch_*`
- `windows-forensics_lnk_*`
- `windows-forensics_jumplist_*`
- `windows-forensics_srum_*`

### 5. Browser triage pass

Goal: quickly understand browser-driven user activity, downloads, sessions, and accounts.

If a browser profile is present, do not postpone this step.

Start with summary tools:

- `forensics-utils_chromium_profile_summary_tool`
- `forensics-utils_firefox_profile_summary_tool`

Then prioritize these parsers:

- history
- downloads
- bookmarks
- sessions
- cookies metadata
- login metadata
- preferences
- extensions

Relevant tools include:

- `forensics-utils_chromium_parse_history_tool`
- `forensics-utils_chromium_parse_downloads_tool`
- `forensics-utils_chromium_parse_bookmarks_tool`
- `forensics-utils_chromium_parse_sessions_tool`
- `forensics-utils_chromium_parse_cookies_tool`
- `forensics-utils_chromium_parse_logins_tool`
- `forensics-utils_chromium_parse_preferences_tool`
- `forensics-utils_chromium_parse_extensions_tool`
- `forensics-utils_firefox_parse_history_tool`
- `forensics-utils_firefox_parse_downloads_tool`
- `forensics-utils_firefox_parse_bookmarks_tool`
- `forensics-utils_firefox_parse_sessions_tool`
- `forensics-utils_firefox_parse_cookies_tool`
- `forensics-utils_firefox_parse_logins_tool`
- `forensics-utils_firefox_parse_preferences_tool`
- `forensics-utils_firefox_parse_extensions_tool`

### 6. Deep browser pass

Only do this when the case points to web apps, cloud services, token hunting, or client-side state.

Prioritize:

- local storage
- session storage
- IndexedDB
- cache
- web data
- favicons

This branch is often high-value for:

- cloud drives
- chat tools
- webmail
- SaaS portals
- browser-stored application state

### 7. Credential and session decryption branch

This is a separate branch, not a default step.

Consider it when:

- the user explicitly asks for credentials or sessions
- encrypted cookies or logins are central to the case
- the image likely contains the prerequisites

Chromium path:

- extract the profile directory
- extract `Local State`
- recover DPAPI material if needed
- use `forensics-utils_chromium_decrypt_cookies_tool`
- use `forensics-utils_chromium_decrypt_logins_tool`

Firefox path:

- use `forensics-utils_firefox_decrypt_logins_tool` if login data is present
- provide a primary password only when it is known or strongly suspected

Windows DPAPI helpers may be needed:

- `windows-forensics_windows_dpapi_recover_masterkeys`
- `windows-forensics_windows_dpapi_recover_chromium_master_key`

### 8. Correlation and timeline

Goal: turn isolated artifacts into a coherent narrative.

Pivot on:

- usernames
- hostnames
- executable names
- file paths
- URLs, domains, and IPs
- timestamps

Important correlations:

- browser downloads with Prefetch
- browser URLs with LNK files and Jump Lists
- browser or network activity with SRUM
- system events with EVTX and Registry findings

### 9. Gap filling

Only use broader or noisier techniques if the primary passes do not answer the question.

Use:

- `disk-forensics_scan_deleted_files`
- `disk-forensics_search_by_timestamp`
- `windows-forensics_mft_*`
- `windows-forensics_usn_*`

### 10. Suspicious file analysis

When a suspicious binary, script, archive, or document is identified, extract it and analyze it locally.

Useful tools:

- `forensics-utils_calculate_hashes_tool`
- `forensics-utils_extract_strings_tool`
- `forensics-utils_extract_exif_tool`
- `forensics-utils_die_analyze_file_tool`
- `forensics-utils_binwalk_scan_tool`
- `forensics-utils_binwalk_extract_tool`

Use VirusTotal only when it adds value and disclosure is acceptable.

## Extraction rules

Use `disk-forensics_extract_file` when:

- you already know the exact artifact file you need
- the artifact is a single EVTX, hive, SQLite DB, `Local State`, or `Amcache.hve`
- the case is CTF-fast and you need a quick pivot

Use `disk-forensics_extract_directory` when:

- the parser expects a local directory, especially browser profile directories
- the artifact family has critical companion files such as `-wal`, `-shm`, LevelDB data, cache entries, or session files
- you need a stable local copy for repeated parsing

Avoid broad extraction by default for:

- entire user directories
- very large cache trees with no clear lead
- generic collection with no investigative hypothesis

## Question-driven shortcuts

If the user asks about execution or persistence, prioritize:

- EVTX
- Registry hives
- Prefetch
- `Amcache.hve`

If the user asks about file access or recent activity, prioritize:

- LNK files
- Jump Lists
- Recent folders
- browser history and downloads

If the user asks about browser behavior, prioritize:

- profile summaries
- history
- downloads
- sessions
- cookies and logins metadata

If the user asks about credentials, tokens, or sessions, prioritize:

- browser cookies and logins
- the DPAPI branch if needed
- Vault or credential directories if present

If the user asks about deleted evidence, prioritize:

- deleted file scanning
- MFT or USN if available
- LNK files and Jump Lists for residual references

## Windows artifact cheat sheet

Common high-value paths after selecting the Windows partition:

- `Windows/System32/winevt/Logs`
- `Windows/System32/config`
- `Windows/AppCompat/Programs/Amcache.hve`
- `Windows/Prefetch`
- `Windows/System32/sru/SRUDB.dat`
- `Users/<user>/NTUSER.DAT`
- `Users/<user>/AppData/Local/Microsoft/Windows/UsrClass.dat`
- `Users/<user>/AppData/Roaming/Microsoft/Windows/Recent`
- `Users/<user>/AppData/Roaming/Microsoft/Windows/Recent/AutomaticDestinations`
- `Users/<user>/AppData/Roaming/Microsoft/Windows/Recent/CustomDestinations`
- `Users/<user>/Desktop`
- `Users/<user>/Downloads`
- `Users/<user>/Documents`
- `Users/<user>/AppData/Local/Temp`
- `Users/<user>/AppData/Roaming/Microsoft/Windows/PowerShell/PSReadLine/ConsoleHost_history.txt`
- `$Recycle.Bin`

## Browser profile cheat sheet

Chromium-family roots usually appear under:

- `Users/<user>/AppData/Local/Google/Chrome/User Data`
- `Users/<user>/AppData/Local/Microsoft/Edge/User Data`
- `Users/<user>/AppData/Local/BraveSoftware/Brave-Browser/User Data`

Important Chromium paths:

- `Local State`
- `Default`
- `Profile 1`, `Profile 2`, and other profile directories

Common Chromium artifacts inside a profile:

- `History`
- `Login Data`
- `Cookies` or `Network/Cookies`
- `Bookmarks`
- `Preferences`
- `Favicons`
- `Sessions`
- `Local Storage`
- `Session Storage`
- `IndexedDB`
- `Cache` or `Cache/Cache_Data`
- `Extensions`
- `Web Data`

Firefox roots usually appear under:

- `Users/<user>/AppData/Roaming/Mozilla/Firefox/Profiles/<profile>`

Common Firefox artifacts inside a profile:

- `places.sqlite`
- `cookies.sqlite`
- `logins.json`
- `key4.db`
- `favicons.sqlite`
- `sessionstore.jsonlz4` and related session files
- `prefs.js`
- `extensions.json`
- `storage/default`
- `storage/default/*/ls`
- `cache2`

Recommended browser parser order:

### First pass

- profile summary
- history
- downloads
- bookmarks
- sessions
- cookies metadata
- login metadata
- preferences
- extensions

### Deep pass

- local storage
- session storage
- IndexedDB
- cache
- web data
- favicons

### Decryption branch

- Chromium decrypted cookies or logins only when the case requires it and prerequisites are present
- Firefox decrypted logins only when login artifacts are present and password recovery matters

## Reporting contract

When reporting findings, keep this structure:

1. Scope and selected partition
2. Artifacts found and artifacts missing
3. Key findings in time order
4. Confirmed facts
5. Hypotheses or lower-confidence interpretations
6. Blockers or gaps
7. Best next pivots if the question is not fully answered

## Limitations and assumptions

- This workflow assumes a Windows-focused image.
- Browser tools expect extracted local profile paths rather than direct parsing from inside the image.
- Some artifact families may be absent, disabled, or intentionally wiped.
- Chromium or DPAPI decryption may require keys or context that are not available.
- Deleted-file recovery is opportunistic.
- Timestamps can conflict; correlate them instead of trusting a single source.
- Encrypted containers or BitLocker volumes should be reported as blockers immediately.
