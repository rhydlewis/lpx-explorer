# Changelog

All notable changes to LPX Explorer are documented here. The CI release pipeline extracts each `## v<version>` section into the `<description>` field of the appcast, which Sparkle renders in the update dialog.

Format: standard Markdown — `-` bullets and free-form paragraphs. Headings within a section (`###`) are not currently extracted.

## v0.0.9

- See which Logic version last saved a project — shown in the Metadata panel as "Last saved with" and in the exported README
- Export a plain-text project README for collaborators or archives (File → Export README…, ⌘⇧E) — covers tempo / sample rate / frame rate, project alternatives, the current alternative, and 3rd-party plug-ins
- Project Alternatives are now clearly labelled — a "Project Alternatives" header, a "Current" badge on the active variant, and a hover tooltip explaining what they are
- "Open Image in New Window" on the project window image now works (previously did nothing)
- Projects missing their ProjectInformation.plist now show a warning banner instead of silently reading as fine

## v0.0.8

- Open active project in Logic Pro via the "Open in Logic Pro" button in the project header (next to Reveal in Finder) or File menu (shortcut Cmd+Shift+L)
- Sort projects by in the library pane
- Sort projects in the tile grid (independent of the library sort)

## v0.0.7

- Preview audio snippets from the `.logicx` bundle. LPX Explorer will attempt to select the best available file
- Audio files include file size & playback duration
- Browse all available audio files in your project with a collapsible panel showing file type, size, and per-file playback controls.

## v0.0.6

- Anonymous install tracking via GoatCounter counting installs and upgrades only (no personal data, IP, sessions, or usage patterns collected)

## v0.0.5

- More instrument tracks now show their edited names
- Some renamed tracks now display their channel-strip default where possible e.g. "Piano (Inst 1)" so you can still see which strip the rename belongs to
- Folder and Summing Stack tracks now appear in the Tracks list (albeit separated from their child tracks)

## v0.0.4

- Added saved window images of the Logic UI for a project into single project view
- Saved images now act as alternative switcher
- Improved test coverage for parsing metadata, alternatives and tracks

## v0.0.3

- First Sparkle-auto-updated release.

## v0.0.1

- Initial release.
