# Batch 49 — Production Shell Scaffold

Status: complete

## Purpose

Move the v1.6 foundation out of the architecture-only harness and establish a separate production-oriented browser shell without changing the frozen v1.5.99 production branch.

## Starting point

Batch 48 had completed the foundation readiness work on `architecture/v1.6-foundation`. Production `main` remained frozen at v1.5.99.

## Changes

### Separate production-shell development entry

Added `dev/production-shell.html` as a second development entry rather than replacing `dev/index.html`.

This preserves the architecture harness as a focused validation surface while providing a place to assemble the real v1.6 application chrome.

The shell mounts the same typed `mountCadLiteBrowserRuntime()` used by the architecture harness; it is not a disconnected visual mockup.

### Production-oriented application structure

The shell establishes the major application regions needed for the v1.6 cutover:

- top application toolbar and save status
- left Navigator
- central DESIGN / SLAB workspace
- right Inspector
- CAD canvas host
- modal portal root
- floating HUD portal root
- responsive / theater / fullscreen structural hooks
- light/dark theme styling hooks

Existing runtime control IDs are retained where the typed browser surfaces already own behavior, allowing the architecture to run inside the new shell without duplicating command logic.

### Dedicated shell styles

Added `src/styles/production-shell.css` and loaded it through `src/main.ts`.

The production-shell styles are intentionally scoped to `.cad-lite-production-shell` so they do not redefine or destabilize the architecture harness.

## Validation

Implementation head: `181391276e13c2328881afd5373a6ad7a401b36e`

Architecture CI run: `36902333752`

Result: success.

Validated:

- dependency installation
- TypeScript typecheck
- lint
- complete automated test suite
- production build
- browser-ready artifact verification

## Deliberate boundary

This batch establishes the application shell only. It does not attempt to reproduce every v1.5.99 menu, floating HUD, modal, Navigator section, Inspector section, theme preference, or toolbar icon in one pass.

Those surfaces should be moved into the production shell incrementally while continuing to reuse typed v1.6 commands and browser surfaces rather than reintroducing direct DOM/domain mutation.

## Result

CAD Lite v1.6 now has both:

1. the architecture harness for focused validation; and
2. a separate production-oriented shell for cutover work.

Production `main` / v1.5.99 remains untouched.

## Recommended next batch

Batch 50 should begin production-shell parity by auditing the v1.5.99 application chrome against `dev/production-shell.html`, then migrating one coherent high-value shell surface at a time. The first slice should favor core top-level navigation/toolbar behavior and structural parity rather than new CAD features.
