# Architecture Batch 36 — Number Format Controls

Status: complete  
Starting architecture head: `d6ab2e76aec57789604944742c489be5a6348bef`  
Validated implementation head: `a1131ce9818ba97f345b94b1591a87c3c4fb4d72`

## Scope

Continue the v1.5.99 acceptance audit through the shared View / Number Format layer without expanding feature scope.

Batch 32 already established that dimension number format and precision are shared editor preferences rather than workspace-specific visibility state. Batch 36 restores a browser binding for those typed preferences so the UI shell can change them without directly mutating drawing state.

## Production behavior preserved

- Dimension display format can switch between Fraction and Decimal.
- Fraction precision remains constrained to the supported denominators: 1, 2, 4, 8, and 16.
- Precision is a shared preference across DESIGN and SLAB rather than a workspace-view bucket.
- Decimal mode does not destroy the stored fractional precision; the precision control is simply inactive while Decimal is selected.
- Number-format changes use the existing preference command and persistence path and do not consume CAD Undo history.

## Architecture changes

Added `ViewPreferencesSurface` in `src/browser/view-preferences-surface.ts`.

The surface:

- binds `#lc-dim-format` and `#lc-dim-precision` when those controls are present in the browser shell;
- dispatches the existing typed `updatePreferences(...)` command;
- mirrors store preference changes back into the controls;
- contains no direct project/entity mutation;
- keeps the format/precision parsing boundary explicit and testable.

The browser runtime now owns and mounts/unmounts the surface alongside the other browser adapters. The public browser barrel exports the surface and its pure control parsers.

## Regression caught during the batch

The first runtime edit accidentally replaced the existing teardown semantics for tool-handler unregister arrays and effect shutdown. Architecture CI caught the TypeScript error before the batch was accepted.

The runtime teardown was restored to the pre-batch behavior, including interaction cancellation, unregister-array iteration, and `effects.stop(false)`, while retaining the new View Preferences surface lifecycle.

This is exactly the kind of regression the architecture CI gate is intended to catch during the migration.

## Tests

Added `tests/view-preferences-surface.test.ts` covering:

- Fraction / Decimal control parsing;
- rejection of unsupported format values;
- all supported fractional precision values;
- rejection of unsupported precision values.

## Validation

Architecture CI run: `36886012977`

Validated successfully:

- TypeScript typecheck
- lint
- automated tests
- production build
- browser-ready artifact verification

## Deliberate boundary

This batch does not redesign the production View menu, change number-format rendering rules, add new precision choices, or change workspace-specific visibility behavior. It only restores the typed browser control boundary needed for existing number-format behavior.

## Next batch

Continue the acceptance audit with the next explicit View/Edit/canvas parity gap. Prefer a measured v1.5.99 behavior over speculative UI or feature work.
