# Batch 43 — Cross-Layout Lifecycle Hardening

Status: complete

Starting architecture head: `a3b9747dd27d55955bbbd70b7cf634b2dc7c5731`

Validated implementation head: `f4991f53280a2318cfe740bc0271d5cdf49e701d`

## Goal

Continue the v1.6 foundation hardening phase with a focused cross-layout lifecycle slice rather than adding new CAD behavior.

## Coverage added

Added `tests/layout-lifecycle-hardening.test.ts` to exercise these application-layer invariants together:

1. Switching active layouts does not add a CAD Undo history entry.
2. Layout switching replaces layout-local selection with the active Layout selection and clears active interaction/transient session state.
3. An edit explicitly targeted at one Layout remains isolated to that Layout even after switching elsewhere.
4. Deleting the active selected Layout falls back to the surviving Layout cleanly.
5. Undo restores the deleted project Layout while preserving the current live fallback session rather than rewinding session navigation.

## CI findings during the batch

The first test draft omitted the required autosave storage dependency for `ApplicationEffects`; Architecture CI caught that at typecheck.

After adding an in-memory storage adapter, the lifecycle assertion exposed two existing semantics that the test initially described incorrectly:

- deleting the active selected Layout selects the fallback Layout;
- CAD Undo restores project history while the current live session remains on that fallback Layout.

The test was corrected to document and lock those existing boundaries rather than changing production behavior to satisfy an assumption.

## Validation

Architecture CI run `36896331251` passed:

- typecheck
- lint
- tests
- build
- browser-ready artifact verification

## Deliberate boundary

This batch does not change production code, layout deletion behavior, selection rules, history implementation, persistence behavior, browser UI, or v1.5.99 production files.

The purpose is to harden and document the existing command/store/history/session boundary before v1.6 cutover.

## Next

Continue the architecture-hardening pass with another real lifecycle invariant. Prefer deletion/stale-reference cleanup, mixed-entity Undo/Redo, workspace-view persistence across save/reload, or ID/reference resilience based on the next live audit.
