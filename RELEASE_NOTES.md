# Infinite Studio release notes

Every stable release from v0.51.0 onward must include a version-matched public release-notes file. The update manifest links to that file, and both checkpoint and package scripts stop if it is missing or inconsistent.

## Releases

- [v0.56.10](./public/release-notes/v0.56.10.html) — check for updates during editing and save safely before reload.
- [v0.56.9](./public/release-notes/v0.56.9.html) — optional automatic AI canvas edits per connection.
- [v0.56.8](./public/release-notes/v0.56.8.html) — recover from stalled local agent connections.

- [v0.56.7](./public/release-notes/v0.56.7.html) — local MCP connection for canvas and project files.

- [v0.56.6](./public/release-notes/v0.56.6.html) — update interface naming and preserve shared-file context.

- [v0.56.5](./public/release-notes/v0.56.5.html) — redirect legacy share links while retaining the old local workspace.

- [v0.56.4](./public/release-notes/v0.56.4.html) — copy layers and groups across Studio workspaces and domains.

- [v0.56.3](./public/release-notes/v0.56.3.html) — show cloud save status inside the save button.

- [v0.56.2](./public/release-notes/v0.56.2.html) — more readable account and settings typography.

- [v0.56.1](./public/release-notes/v0.56.1.html) — consolidated header navigation and sidebar width reset.

- [v0.56.0](./public/release-notes/v0.56.0.html) — optional password links, first-save destination, and .studio format identification.

- [v0.55.1](./public/release-notes/v0.55.1.html) — edge controls for both side panels.

- [v0.55.0](./public/release-notes/v0.55.0.html) — Infinite Studio branding, .studio projects, text document import, and session recovery.

- [v0.54.14](./public/release-notes/v0.54.14.html) — rename Moodboards from the library.

- [v0.54.13](./public/release-notes/v0.54.13.html) — correct the shared-view logo size.

- [v0.54.12](./public/release-notes/v0.54.12.html) — clearer long titles and consistent shared-view header.

- [v0.54.11](./public/release-notes/v0.54.11.html) — remove duplicate cloud update animations.

- [v0.54.10](./public/release-notes/v0.54.10.html) — move the save action beside undo and use a recognizable main menu icon.

- [v0.54.9](./public/release-notes/v0.54.9.html) — grouped panel controls and a clearer File menu icon.

- [v0.54.8](./public/release-notes/v0.54.8.html) — automatic device-time-zone language selection with a manual override.

- [v0.54.7](./public/release-notes/v0.54.7.html) — anonymous viewing of link-enabled boards and clearer sharing and edit requests.

- [v0.54.6](./public/release-notes/v0.54.6.html) — safer local version cleanup, protected recovery checkpoints, and reduced duplicate automatic snapshots.

- [v0.54.5](./public/release-notes/v0.54.5.html) — generic recipient access recovery, explicit restricted links, preserved resource keys on reopening, and account-independent acceptance criteria.
- [v0.54.4](./public/release-notes/v0.54.4.html) — dismiss stalled Picker overlays, preserve retry errors, and verify real key acceptance separately from shared-file content.
- [v0.54.3](./public/release-notes/v0.54.3.html) — origin-only referrer policy for restricted Google Picker keys, deployment guard, and real recipient-file acceptance harness.
- [v0.54.2](./public/release-notes/v0.54.2.html) — browser-compatible conditional Drive updates, correct multipart uploads, shared-file resource keys, and clearer storage errors.
- [v0.54.1](./public/release-notes/v0.54.1.html) — explicit cloud-update progress, verified success, and recoverable inline failures.
- [v0.54.0](./public/release-notes/v0.54.0.html) — explicit one-way cloud saves, recoverable cloud loads, independent local copies, and stale-read / cross-tab safeguards.
- [v0.53.0](./public/release-notes/v0.53.0.html) — direct layer-row multi-selection, safer Drive conflict decisions, and verified Google Picker configuration.
- [v0.52.0](./public/release-notes/v0.52.0.html) — large-board Google Drive sync recovery, compact local queue storage, and truthful recovery warnings.
- [v0.51.0](./public/release-notes/v0.51.0.html) — continuous Google Drive onboarding, guide interaction corrections, and mandatory release-note verification.

## Required sections

- Version and release date
- Update contents
- Fixes
- Attention items
- Recovery and backup information

Run `npm run release:verify -- X.Y.Z` before checkpointing or packaging a release.
