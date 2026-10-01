# Batch 30 — Startup Recovery / Session Boot

Behavior baseline: v1.5.99  
Branch: architecture/v1.6-foundation  
Starting architecture head: 8fecbd70204414ac87d4ca675d557036a5b20c40

## Scope

Batch 30 makes startup/autosave recovery an explicit application decision instead
of an implicit browser side effect.

The host-provided startup payload remains authoritative until the user explicitly
chooses to recover a divergent autosave.

## Startup recovery states

`StartupRecovery` classifies the stored autosave into four states:

- `none` — no autosave exists
- `current` — autosave project/editor content matches the supplied startup state
- `available` — a valid autosave exists and differs from the supplied startup state
- `corrupt` — autosave exists but cannot be parsed/migrated safely

App/build metadata does not make otherwise-identical project content divergent.
Comparison is based on normalized persisted `project` + `editor` content.

## Recovery safety

Inspection is read-only.

A malformed, unrelated, or unsupported autosave cannot:

- replace the live project
- clear Selection
- cancel tools/interactions
- reset History
- overwrite the bad recovery payload

The bad payload remains isolated until the user explicitly discards it.

## Recover Autosave

For a valid divergent autosave, the browser displays a blocking recovery decision
with project name/date/layout count.

Choosing **Recover Autosave** routes the recovered `CadLiteFile` through the Batch
29 `ProjectLifecycle` replacement path. This means recovery:

- migrates legacy v1.5.99 autosaves when needed
- cancels active interactions through the lifecycle hook
- rebuilds Session state from persisted editor state
- clears transient Selection/tool state
- resets Undo/Redo to one baseline
- immediately rewrites autosave as canonical v1.6 JSON

## Use Current Project

Choosing **Use Current Project** discards the stale recovery payload and immediately
writes the supplied startup project back to autosave canonically.

This prevents an intentionally rejected autosave from being offered again on the
next load.

The same operation is used for **Discard Autosave & Continue** when the stored
autosave is corrupt.

## Silent normal reload

If the stored autosave and supplied startup state contain the same normalized
project/editor data, no recovery UI is shown.

This comparison deliberately ignores `appVersion`, so a routine app build update
does not produce a false recovery prompt for unchanged project content.

## Browser surface

`StartupRecoverySurface` renders a modal overlay only for decision states:

### Divergent valid autosave

- Recover Autosave
- Use Current Project

### Corrupt autosave

- explanatory error
- Discard Autosave & Continue

The modal is mounted before the application effects lifecycle is started, so the
boot decision exists before normal user interaction can create a new autosave.

## Tests

Batch 30 adds startup recovery regression coverage for:

- empty autosave storage
- identical/current autosave detection
- divergent canonical autosave recovery
- legacy v1.5.99 autosave recovery
- corrupt autosave isolation
- explicit discard/use-current behavior
- canonical autosave replacement after discard

## Deliberate boundary

Still outside this batch:

- cloud/account synchronization
- multiple named recovery generations
- autosave timestamp/history browser
- cross-device recovery
- share-link import/export
- PDF/PNG/SVG export

Those concerns should sit above this single-device project boot contract rather
than becoming part of persistence normalization.

## Next batch

The next coherent slice should be a **v1.5.99 → v1.6 acceptance/parity audit** of
the remaining browser surfaces and commands before adding additional export/share
formats. The architecture now has typed ownership for the major drawing domains,
project files, autosave, and boot recovery, so remaining work should be selected by
measured production-parity gaps rather than by adding new abstractions.
