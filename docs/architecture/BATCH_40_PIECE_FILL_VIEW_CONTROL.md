# Architecture Batch 40 — Piece Fill View Control

Status: complete  
Starting architecture head: `f3246b8d00964e544d9bc156f3f7e4ce87a4edd1`  
Validated implementation head: `07100d7156f91cac93ce299e6eb27853dd46cbfe`

## Scope

Continue the measured v1.5.99 View acceptance pass with one existing Piece appearance preference that was already present in the typed preference model and already consumed by the Piece canvas projection, but did not yet have a typed browser View binding in the architecture harness:

- Piece fill visibility (`showPieceFills`)

## Existing rendering behavior

The Piece canvas projection already passes `state.preferences.showPieceFills` into its render options. Piece appearance already suppresses fill when either the individual Piece has `noFill` enabled or the global `showPieceFills` preference is false.

This batch therefore does not introduce a new rendering rule. It exposes the existing rule through the browser acceptance surface.

## Implementation

`ViewPreferencesSurface` now maps:

- `lc-show-piece-fills` -> `showPieceFills`

The control uses the existing `updatePreferences` command, follows the same `aria-pressed` / `is-active` state reflection as the other typed View controls, and remains outside CAD Undo history.

The architecture harness now exposes a `Piece Fills` button so the behavior can be exercised directly in browser acceptance testing.

## Tests

The View preference mapping tests now verify that `lc-show-piece-fills` maps to `showPieceFills` while controls owned by other browser surfaces remain unclaimed.

## Validation

Architecture CI run: `36890719275`

Validated successfully:

- TypeScript typecheck
- lint
- automated tests
- production build
- browser-ready artifact verification

## Deliberate boundary

This batch does not change individual Piece `noFill` behavior, Piece colors, per-Piece fill opacity, Layout fill opacity, Seams, Sink Centerlines, Cutout Labels, Slab Material, edge-profile rendering, or label rendering. No production UI redesign or new preference was introduced.

Production `main` / v1.5.99 remains untouched.

## Next batch

Continue the measured acceptance audit. Prefer another behavior whose underlying model/render semantics already exist and only needs a clean browser ownership/parity closure before moving into broader architecture hardening.
