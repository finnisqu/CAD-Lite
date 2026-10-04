# Batch 78 — Dependency Direction / Renderer Ownership

Status: complete pending final squash CI

Starting architecture head: `f8001db5946edf1a56fe894a9935aad24c57e5e7`

## Goal

Turn the post-Batch-77 dependency-direction and renderer-ownership audit into enforceable architecture rather than a one-time review. Remove dead migration seams, repair proven upward dependencies, move temporary whole-state mutation behind the app boundary, and add regression coverage so the same ownership drift cannot silently return.

## Changes

### Removed the dead Batch-5 runtime bridge

`createLegacyRuntimeBridge()` and `LegacyRuntimeBridge` were temporary migration scaffolding from the early architecture foundation. Their own comment stated that no production runtime was wired to the bridge, and the current bridge tests exercise only the canonical persistence/application adapters.

Batch 78 removes that unused shim and its app-barrel exports. The valid conversion boundary remains:

- `applicationStateFromCadLiteFile()`;
- `applicationStateFromLegacyPayload()`;
- `cadLiteFileFromApplicationState()`.

This does not remove v1.5.99 compatibility. Legacy import/migration remains an intentional persistence responsibility.

### Added executable dependency-direction guards

`tests/architecture-boundaries.test.ts` scans the TypeScript source graph during the normal Vitest gate. It enforces the current layer direction:

- `core` may depend only on `core`;
- `geometry` may depend on `core` / `geometry`;
- `domain` may depend on `core` / `geometry` / `domain`;
- `persistence` may depend on `core` / `geometry` / `domain` / `persistence`;
- `app` may depend on lower layers plus `app`;
- `browser` is the composition/UI edge and may depend on all lower layers plus `browser`.

The same regression also rejects direct `store.commit()` or `store.replaceState()` calls from browser modules. Durable browser mutations should continue through commands/controllers/services; exceptional whole-state replacement belongs behind an app-owned service.

The first run of this guard exposed real violations and Batch 78 fixed them rather than allowlisting them.

### Moved piece workspace ownership into the domain

Three piece-domain modules imported persistence solely to obtain the `Workspace` type. That inverted dependency direction even though the actual concept — whether a piece pose is interpreted in DESIGN or SLAB space — belongs to piece-domain geometry.

Batch 78 adds the domain-owned `PieceWorkspace = 'design' | 'slab'` type and uses it consistently in piece factory, geometry, grouping, and transforms. The behavior is unchanged; only ownership and dependency direction move to the correct layer.

### Moved multi-layout output state swaps behind the app boundary

The v1.5.99-compatible all-layout PDF flow needs the normal renderer to draw each layout before capture. `ProductionOutputSurface` previously achieved that by calling `AppStore.replaceState()` directly, then restoring the original state in a `finally` block.

Batch 78 introduces `ApplicationStatePreview` in the app layer. It owns those temporary system-state replacements and always restores the exact baseline project, session, and preferences after the async preview operation, including when rendering/output throws.

`ProductionOutputSurface` now requests preview states through that app service. It still owns browser-specific SVG/raster/PDF work, but no longer owns whole-application mutation.

Focused regressions cover both successful and failed preview operations so the user returns to the exact pre-export state.

## Architecture boundary after Batch 78

The working dependency direction is now guarded in CI rather than documented only by convention:

`core -> geometry/domain -> persistence/app -> browser`

That shorthand is not a claim that persistence and app are interchangeable. Persistence continues to own serialization/schema/migration contracts, while app owns runtime mutation, commands, history/effects orchestration, lifecycle, and temporary application-state preview. The test encodes the precise allowed edges.

Browser modules may read application state and invoke app/domain APIs, but must not commit or replace store state directly.

## Compatibility decisions

The v1.5.99 persistence importer remains intentional and tested. Batch 78 removes only the unused runtime bridge that had no production consumer.

The app still consumes persisted editor-contract types such as workspace/preferences through the schema boundary where appropriate. Batch 78 does not manufacture a parallel schema merely to erase every app-to-persistence type reference; the enforced rule is that lower domain/geometry/core layers do not depend upward.

## Validation

The final Batch 78 commit must pass the normal Architecture CI gate with:

- TypeScript;
- ESLint;
- the full Vitest suite, including architecture-boundary and state-preview regressions;
- production Vite build;
- browser-ready artifact verification.

## Handoff

Batch 79 should move from structural migration into cutover-readiness / browser parity hardening. Use the now-enforced dependency graph as a constraint rather than continuing broad ownership refactors.

High-value work is final production acceptance across DESIGN and SLAB: selection/edit flows, output/import/reload continuity, Floor Plan workflows, production HUD/tool cancellation, Navigator/Inspector behavior, and dark/light/focus modes. Fix source-proven regressions, but avoid reopening architecture areas that are already guarded and green.
