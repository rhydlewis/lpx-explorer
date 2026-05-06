# UX Review — lpx-explorer (Whimsy / Craft)

Date: 2026-05-06
Reviewer: Whimsy Injector agent (read-only review of code + CSS modules + Python `inspector-mockup.html`)

The skeleton is honest and confident; tokens are tight, copy is mostly neutral-functional. The right places for whimsy are the moments of *waiting*, *verdict*, and *void* — and almost nothing else.

This is a power-user inspector tool. **Whimsy here means craft and care, not balloons and confetti.**

## Must-have polish (looks unfinished today)

- **EmptyState is one of the only screens a brand-new user will see, and it's currently centered text + two buttons.** (`components/EmptyState.tsx`) The "Read-only. We never write to your projects." line is the single best thing on the screen — it's the brand promise. But the heading "LPX Explorer" wastes a hero moment. Consider a serif/italic accent on one word (compare the mockup's Fraunces treatment), and replace the tagline with something more declarative: *"Look inside any Logic project. Without opening Logic."* Also: drop hint here — a dashed border on hover when a file is dragged anywhere over the window. **Risk if overdone:** a marketing landing page. Keep it one screen, no animation on load.
- **Drop-hint toast is ugly.** (`App.css .drop-hint`) Pure rectangle, hard shadow, "Drop one project or folder at a time." reads like a parser error. Soften to ink+phosphor (mockup), shorter copy: *"One project at a time."* / *"That's not a `.logicx`."* **Risk:** cute-but-confusing. Keep it short and specific.
- **Disclosure triangle is a literal `▶` glyph.** (`Library/FolderNode.tsx:93`) Misaligned with macOS conventions and with the lucide icons used elsewhere. Swap for `ChevronRight` from `lucide-react` (already a dep). Trivial fix; immediate craft uplift.
- **InspectorSkeleton announces "Parsing /Users/long/path…"** (`Inspector/InspectorSkeleton.tsx:23`) The full path here is noisy and irrelevant to the wait. Just *"Reading project…"* — the skeleton blocks already imply the location.

## High-leverage delight

- **The verdict pill is the headline moment of the whole app.** (`Inspector/CompatibilityVerdict.tsx`) Right now it's an uppercase tracked rectangle. Three ideas, pick one:
  1. When "Opens cleanly," precede the pill text with a small phosphor `pulse` dot like the mockup — green heartbeat = the project is alive on this Mac.
  2. On `will-not-open`, *don't* shout — flatten to a quieter framed tile with the action ("Show what's missing") more prominent than the verdict. The current red urgency is correct but undifferentiated.
  3. On the registry-not-yet-scanned state, replace "AU registry not yet scanned" with *"Haven't checked your AUs yet."* and make the "Run AU scan" button primary — currently the user reads a non-actionable status before finding the action.
- **Scanning copy across all states.** (`CompatibilityVerdict.tsx:112`, `FolderNode.tsx:31`) Currently: *"Scanning installed AUs… (412)"* and *"Scanning… (3)"*. These are fine but could carry a tiny rotation of musician-flavored progress phrases without going Clippy. *"Sweeping the AU bin… (412)"*, *"Walking your library… (3)"*. **Risk:** cringe on the second read. Mitigation — write *one* good line per state, not a rotation, and never use exclamation marks.
- **Klopfgeist Easter egg.** Klopfgeist is Logic's stock metronome plug-in (Apple's silent in-joke; the German for poltergeist/knocker). When the user's project contains Klopfgeist as an *active* insert (rare; usually disabled), the plug-in row shows a tiny ghost glyph or `tock` indicator next to the name. Place: `Inspector/PluginRail.tsx PluginRow` — keyed off display name match. **Risk:** cute creep. One easter egg, no others, and it must appear only on a real Klopfgeist sighting, not as decoration.
- **Hidden `Cmd-Opt-I` bytes view.** Power-user respect. A keyboard shortcut that flips a project section into raw 4CC + offset hex view — same data the parser found, displayed mono with offsets. Place: gate it on a `useUIStore` `devMode` flag toggled by the shortcut. Doesn't need to be discoverable; the user who finds it will smile. **Risk:** scope creep. Keep it read-only, no formatting tooling.
- **First-launch "what we found" reveal.** When a project loads for the first time after picking, fade in the Inspector sections in source order with ~40ms stagger (header → verdict → info → tracks → plug-ins) and ~120ms ease. Subsequent loads in the same session: instant. Place: a one-shot CSS class on `ProjectInspector` keyed off a "first load" flag. Honor `prefers-reduced-motion` — the shimmer already does. **Risk:** feels slow if longer than ~250ms total. Cap it.
- **Section labels could carry a Logic flavor mark.** (`Inspector.module.css .sectionLabel`) The mockup uses a rotated 6px amber square `::before`. A single accent square per section ties the surface together visually and costs nothing. **Risk:** dotted-everywhere tackiness. One per section, only on the Inspector pane, never in the rails.

## Don't do

- **No confetti, no balloons, no celebratory toasts when a project loads cleanly.** This is a power tool used a hundred times a day. Celebration on a verdict is patronizing. The dignity of `Opens cleanly.` *is* the delight.
- **No emoji in copy.** The mockup's restraint — Fraunces italic, phosphor green dot, amber accents — is the bar. Emoji would break the "musician's tool" feel instantly.
- **No personality in error states beyond crisp copy.** "Couldn't open project" is correct. Don't make it "Whoops!" — a producer with a broken session before a session does not want to be cheered up.
- **Don't animate the verdict pill changing.** Flicker between "scanning" → "Opens cleanly" must be a single hard cut. Spring transitions on status are anxiety-inducing for verdicts.
- **No hover sounds, ever.** The Mac's UI is silent on principle.
- **No "Did you know?" tips, no onboarding tour, no first-run modal.** EmptyState + the copy is the entire onboarding budget.
- **Don't theme the Library rail per folder** (colors, icons-per-folder, etc.). The current Recent/Folders neutrality is correct; producers organize their own way.

## Files referenced

- `src/components/EmptyState.tsx`
- `src/components/EmptyState.module.css`
- `src/App.css` (`.drop-hint`)
- `src/components/Inspector/CompatibilityVerdict.tsx`
- `src/components/Inspector/CompatibilityVerdict.module.css`
- `src/components/Inspector/InspectorSkeleton.tsx`
- `src/components/Inspector/Inspector.module.css` (`.sectionLabel`)
- `src/components/Inspector/PluginRail.tsx` (Klopfgeist row hook)
- `src/components/Inspector/ProjectInspector.tsx` (first-load stagger)
- `src/components/Library/FolderNode.tsx:93` (disclosure glyph)
- `src/styles/tokens.css` (palette to compare with mockup's phosphor/amber/bone)
- `lpx-toolkit/inspector-mockup.html` (visual identity north star)
