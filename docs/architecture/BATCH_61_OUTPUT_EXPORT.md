# Batch 61 — Output and Export Production Parity

Status: **complete**

## Branch state

- Architecture branch: `architecture/v1.6-foundation`
- Batch 61 starting head: `7075f43f246af98860c415eeb6cb6e7530dde1d9` (Batch 60 completion)
- Validated implementation head: `e4bcbdda8751307723ee964bce85bbcca7b44904`
- Frozen production baseline: `main` at `77728eed327f144b0b1c5d4b9562747d8d62074e` (`v1.5.99`)
- Production was not modified.

## Audit result

Batch 61 separated the production drawing-output family from project-file persistence instead of expanding `ProjectFileSurface` into a second mixed-responsibility owner.

The existing typed `ProjectFileSurface` already owned project JSON export/import/reset through `ProjectLifecycle`, so that path was retained. The confirmed output gap was the production PDF / PNG / SVG family, including the all-layout PDF workflow.

## Ownership boundary

### `ProjectFileSurface`

Remains responsible for:

- CAD Lite project JSON export;
- project JSON import;
- new-project replacement/reset;
- project-file status reporting tied to those lifecycle operations.

### `ProductionOutputSurface`

Now owns production presentation/output concerns for:

- PDF — current Layout;
- PDF — all Layouts;
- PNG — current Layout;
- SVG — current Layout;
- runtime EXPORT-menu controls for those formats;
- output download/status handling.

It does **not** own CAD mutations, saved-schema changes, project replacement, or domain commands.

## Output model

`src/browser/production-output-model.ts`

Adds pure output preparation helpers for:

- production project / date / Layout metadata;
- deterministic production filenames;
- PDF image fitting and page orientation;
- temporary per-Layout output state preparation.

The output-state helper preserves project data and preferences while changing only the temporary active Layout context needed to render another Layout.

## SVG output

`ProductionOutputSurface` serializes the typed live `#lc-svg` drawing rather than rebuilding CAD geometry in a separate export renderer.

This keeps output coupled to the same deterministic typed canvas representation visible in production while avoiding a second geometry/rendering implementation.

## PNG output

PNG export uses the serialized typed SVG as its source, rasterizes it through a browser canvas, and downloads the resulting PNG.

The output therefore follows the same geometry and visibility state as the current typed canvas.

## PDF output

PDF output restores the production current-Layout and all-Layout flows.

The browser loads the same pinned jsPDF 2.5.1 family used by the legacy output lineage only when PDF export is requested; jsPDF is not added to the core application bundle.

Each PDF page includes:

- project name;
- project date;
- Layout name;
- project notes when present;
- a fitted rendering of the typed drawing canvas.

The drawing is rasterized at 2× for the PDF image path, preserving the established browser-compatible raster fallback without introducing a second vector-export dependency during the architecture migration.

## All-Layout PDF state safety

The all-Layout PDF flow renders each Layout through the existing typed canvas rather than copying rendering logic.

For each Layout it temporarily prepares a state with that Layout active, waits for typed view invalidation/rendering to settle, captures the SVG, then proceeds to the next page.

These temporary swaps use `AppStore.replaceState()`, whose system-commit contract is:

- history: `skip`;
- persistence: `skip`.

The exact original project/session/preferences references are restored in a `finally` block after output preparation, including failure paths. Batch 61 therefore does not create undo entries or autosave intermediate output-only Layout switches.

## Production shell integration

The production shell remains structurally thin.

`ProductionOutputSurface` injects the restored output commands into the existing EXPORT menu before `ProductionShellSurface` mounts, so the normal production menu lifecycle continues to own open/close presentation behavior.

The temporary Batch 60 shell note saying PDF / PNG / SVG parity was tracked separately is hidden while the output surface is mounted and restored on unmount.

Project JSON remains a separate EXPORT-menu command owned by `ProjectFileSurface`.

## Tests added

`tests/production-output-surface.test.ts`

Adds focused coverage for:

- production metadata projection from the v1.5.99 migration fixture;
- current-Layout PDF, all-Layout PDF, PNG, and SVG filename contracts;
- filename sanitization and fallback dates;
- non-mutating temporary Layout output-state preparation;
- portrait and landscape PDF fitting constraints.

## Validation

Validated at implementation head `e4bcbdda8751307723ee964bce85bbcca7b44904` in Architecture CI run `37175446440`:

- TypeScript typecheck: pass
- ESLint: pass
- Vitest: **412 / 412 tests passed across 68 test files**
- Vite production build: pass
- Browser-ready artifact verification: pass
- Generated architecture artifacts:
  - `dist/cad-lite-v1.6.0.js` — 476.95 kB (116.84 kB gzip)
  - `dist/cad-lite-v1.6.0.css` — 93.08 kB (12.53 kB gzip)

The first implementation run exposed two strict lint issues in the new output surface: one unnecessary browser-window type assertion and one `async` SVG method with no `await`. Those were corrected directly without weakening lint rules or changing output ownership.

## Deliberate boundaries

- Batch 61 does not modify production `main`.
- Batch 61 does not change the CAD Lite saved-file schema.
- Project JSON remains under `ProjectFileSurface`; drawing outputs remain under `ProductionOutputSurface`.
- PDF output uses the reliable raster page path during migration rather than adding a second vector-rendering stack.
- Broad visual polish and final production styling remain outside this batch.

## Next recommended slice — Batch 62

Continue with the **golden migration project / fixture**:

1. Promote a representative v1.5.99 project into the authoritative migration fixture for end-to-end parity checks.
2. Exercise save/import/reload, DESIGN/SLAB state, materials, areas, piece groups, annotations, sinks/cutouts/seams, room features, floor plans, and output preparation through one integrated project.
3. Identify any remaining schema or lifecycle gaps before whole-app visual QC.
4. Keep broad visual polish for Batch 63.
