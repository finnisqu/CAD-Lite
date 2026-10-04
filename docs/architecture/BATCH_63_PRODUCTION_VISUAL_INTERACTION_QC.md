# Batch 63 — Production Visual / Interaction QC

Status: **complete**

## Branch state

- Architecture branch: `architecture/v1.6-foundation`
- Batch 63 starting head: `7087c24c723b3ce085e439e1f00faf1cfdcd07b6` (Batch 62 completion)
- Batch 63 validated implementation head: `e17f6fe1066d574520024a2da3ed64c7ed7d8cf5`
- Frozen production baseline: `main` at `77728eed327f144b0b1c5d4b9562747d8d62074e` (`v1.5.99`)
- Production was not modified.

## Goal

Batch 63 performs a focused whole-app production-shell QC pass after the golden migration project was established in Batch 62. The pass concentrates on the shared chrome/workspace boundary where parity regressions are most likely to cross feature ownership: DESIGN/SLAB navigation, Inspector presentation, HUD/viewport state, keyboard focusability, and selected-state feedback.

This is intentionally a **confirmed-regression hardening batch**, not a redesign. Domain data and mutations remain owned by the existing typed application/domain surfaces.

## QC method

The pass reviewed the current architecture implementation and its production shell contracts across:

- `ProductionShellSurface`
- `ProductionInspectorSurface`
- `ProductionModeHudSurface`
- `ProductionViewportSurface`
- `ViewPreferencesSurface`
- `ProjectLayoutSurface`
- `SlabNavigatorSurface`
- `FloorPlanNavigatorSurface`
- the production shell CSS and current focused-surface tests

The automated environment does not provide a rendered browser/screenshot comparison surface, so this batch does **not** claim pixel-level manual visual acceptance. Visual findings are source-backed CSS/DOM-state findings; interaction findings are source-backed and regression-tested where they can be expressed without a browser DOM environment.

## Confirmed defects fixed

### 1. SLAB Navigator advertised keyboard-button semantics but did not implement them

SLAB rows were rendered with `role="button"` and `tabindex="0"`, so they entered the keyboard tab order, but selection was wired only to `click`.

Batch 63 adds delegated `keydown` handling so a focused slab row activates with the standard button keys:

- `Enter`
- `Space`

Space prevents its default browser action when activation is handled, so selecting a slab does not also scroll the surrounding panel/page. Key events originating from the row's real visibility/delete buttons are ignored by the row activation path, preserving the nested controls' native behavior.

### 2. SLAB selection state was visual only

Selected slab rows already received a `.selected` class, but the focusable button-role row did not expose the same state through ARIA.

Rows now receive:

- an `aria-label` describing the selection action
- `aria-pressed="true|false"` synchronized with the typed shared Selection state

This also aligns the SLAB row contract with the production Navigator CSS, which already recognizes `aria-pressed="true"` as selected presentation.

### 3. Production shell had no deliberate keyboard focus-visible treatment

The shell styled hover/selected/active states, but keyboard focus relied on browser defaults. One inline annotation Navigator input explicitly set `outline: none`, making the visual focus contract especially inconsistent.

Batch 63 adds a final `production-focus.css` layer that gives a consistent `:focus-visible` ring to:

- buttons
- inputs
- textareas
- selects
- focusable `[role="button"]` Navigator rows
- the inline annotation Navigator name field

The stylesheet is imported last so the keyboard-only focus treatment is not accidentally erased by feature-specific styles. Mouse interaction is unchanged because the rule uses `:focus-visible`, not unconditional `:focus`.

## Ownership boundaries preserved

- `ProjectLayoutSurface` remains the owner of DESIGN Navigator/Inspector data and mutations.
- `SlabNavigatorSurface` remains the SLAB navigation adapter; this batch only completes its presentation/activation contract.
- `ProductionShellSurface` remains the owner of top-level shell presentation/disclosure.
- `ProductionInspectorSurface` remains a thin Inspector presentation decorator.
- No domain state, selection state, persistence state, or history ownership is duplicated in CSS or shell decorators.
- The Batch 62 golden migration fixture is unchanged.

## Tests

`tests/slab-navigator-surface.test.ts` now explicitly locks the standard keyboard activation-key contract in addition to the existing DESIGN-hidden and SLAB-selection projections.

Validated suite count after this batch: **416 tests across 69 test files**.

## Files changed

- `src/browser/slab-navigator-surface.ts`
- `src/styles/production-focus.css`
- `src/main.ts`
- `tests/slab-navigator-surface.test.ts`
- `docs/architecture/BATCH_63_PRODUCTION_VISUAL_INTERACTION_QC.md`

## Validation

Validated at implementation head `e17f6fe1066d574520024a2da3ed64c7ed7d8cf5` in Architecture CI run `37177039124`:

- TypeScript typecheck: pass
- ESLint: pass
- Vitest: **69 test files / 416 tests passed**
- SLAB Navigator tests: **3 / 3 passed**
- Vite production build: pass
- Browser-ready artifact verification: pass

## Deliberate boundaries

- Batch 63 does not modify production `main`.
- Batch 63 does not claim pixel-level screenshot acceptance because no rendered-browser comparison surface was available in this environment.
- The Batch 62 golden migration fixture remains stable.
- No new domain behavior or ownership layer was introduced.

## Next recommended slice — Batch 64

With production-shell parity now protected by the golden migration project plus focused interaction contracts, begin the next architecture phase at the **core drawing-engine boundary**:

1. inventory geometry, coordinate-conversion, snapping, hit-testing, bounds, and transform logic still owned by browser/feature surfaces;
2. move the highest-confidence shared calculations toward pure/core services without changing behavior;
3. keep rendering dependent on typed projections rather than feature-to-feature DOM knowledge;
4. use the golden migration project and existing interaction suites as regression protection while the drawing engine is untangled.
