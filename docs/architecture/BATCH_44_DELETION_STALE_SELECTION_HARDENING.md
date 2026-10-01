# Batch 44 — Deletion + Stale Selection Hardening

Status: complete

Starting architecture head: `d0bfec36c06d4511a5a501194687f33b234ced54`

Validated implementation head: `486c2c8123ec0bf83699446864f58f6294012dd2`

## Goal

Harden the selection boundary around entity deletion and stale references before the v1.6 foundation moves into final lifecycle/QC work.

## Audit result

The typed architecture already contains the correct cleanup mechanisms:

- Piece deletion routes through the shared Piece replacement path, which normalizes selection against the resulting Layout.
- Annotation and Room Feature deletion explicitly clear their selected entity.
- Area deletion moves a selected deleted Area to the valid fallback Area.
- `SelectionController.sanitize()` and `normalizeSelection()` reject stale single-entity references and remove stale Piece IDs while preserving valid selected Pieces.

No production behavior change was required. This batch locks those invariants down with integration-level tests rather than adding duplicate cleanup logic.

## Coverage added

`tests/deletion-stale-selection-hardening.test.ts` verifies:

1. deleting a selected Piece family clears Piece selection;
2. deleting a selected Dimension clears annotation selection;
3. deleting a selected Room Feature clears Room Feature selection;
4. deleting a selected Area moves selection to its valid fallback Area;
5. stale multi-Piece selection is pruned without losing surviving valid members;
6. stale single-entity selection is sanitized to `none`.

## Validation

Architecture CI run `36897865311` passed:

- typecheck;
- lint;
- 325/325 tests across 44 files;
- production build;
- browser-ready artifact verification.

Build output:

- JS: 352.07 kB / 87.86 kB gzip
- CSS: 25.05 kB / 4.42 kB gzip

## Deliberate boundary

This batch does not alter deletion UX, confirmation behavior, Undo semantics, clipboard behavior, entity creation, rendering, or workspace rules. It only verifies the existing state/selection cleanup contract.

## Next

Continue architecture hardening with a save/reload/continue-editing lifecycle slice, especially workspace-specific view state, active Layout/session recovery, and post-reload command/history behavior. Production `main` remains frozen at v1.5.99.
