# Architecture Batch 38 — View Harness Parity

Status: complete  
Starting architecture head: `053c4c0e7f72fb1594de45f41d68ae519a604981`  
Validated implementation head: `a48d311960033488f273e5ebb8984df55d4f7155`

## Scope

Continue the v1.5.99 acceptance pass through the View layer by making the typed controls introduced in Batches 36–37 actually exercisable in the browser architecture harness.

The typed `ViewPreferencesSurface` already owned number formatting plus Manual Dimensions, Notes, and Lines visibility, but the harness did not contain those browser controls. That left the boundary covered by unit tests without an equivalent browser acceptance path.

## Restored browser acceptance path

The architecture harness now exposes:

- Number Format: Fraction / Decimal
- Fraction Precision: whole, 1/2, 1/4, 1/8, 1/16
- Manual Dimensions visibility
- Notes visibility
- Lines visibility

The controls use the existing IDs consumed by `ViewPreferencesSurface`; no new preference state or duplicate event wiring was introduced.

The harness explanatory copy was also updated so it no longer describes the browser harness as Batch 28-specific.

## Ownership check

During this batch the remaining Seams, Sink Centerlines, Cutout Labels, and Slab Material buttons were reviewed as possible `ViewPreferencesSurface` candidates. They are still actively owned by `PieceCanvasSurface`, so moving only the second listener would have produced duplicate toggles. That partial migration was rejected and the existing ownership was preserved.

Object Snap and Grid Snap likewise remain interaction/canvas controls rather than being folded into this View batch.

## Validation

Architecture CI run: `36888798032`

Validated successfully:

- TypeScript typecheck
- lint
- automated tests
- production build
- browser-ready artifact verification

## Deliberate boundary

This batch does not redesign the production View menu, migrate canvas-owned controls, change preference semantics, alter annotation rendering, or add new CAD behavior. It closes the browser-harness gap for the typed View controls already established in Batches 36–37.

## Next batch

Continue the measured acceptance audit. The next batch should select an explicit remaining interaction/View/Edit parity gap and preserve existing surface ownership unless the migration can be completed atomically.
