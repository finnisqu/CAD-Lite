# Batch 59 — HUD and Modal Production Parity

Status: **complete**

## Branch state

- Architecture branch: `architecture/v1.6-foundation`
- Batch 59 starting head: `ef2970a3c2b3fb8f6d3f5ad4b8bffdc7d00896fe` (Batch 58 completion)
- Validated implementation head: `836b1f8aad4895cc33a154fb582eb910d669a4c2`
- Frozen production baseline: `main` at `77728eed327f144b0b1c5d4b9562747d8d62074e` (`v1.5.99`)
- Production was not modified.

## Audit result

Batch 59 audited the frozen v1.5.99 floating-mode HUD and modal behavior against the typed architecture branch. Several specialized production HUDs were already owned by typed surfaces, especially Splash, Radius, and Edge Painter, so the batch did not duplicate those owners.

The remaining parity work centered on the generic production HUD family, Room Feature / Wall mode controls, Linked Wall edge-brush behavior, and the Room Feature modal lifecycle that v1.5.99 inherited from the shared `planDialogShell` path.

## Confirmed parity gaps closed

### Shared production HUD family

`src/browser/production-mode-hud-surface.ts`

- Restores typed production HUDs for Dimension, Note, and Line with their production titles, shortcut indicators, and help text.
- Restores the Room Features parent HUD with `Add Feature`, `Draw Wall`, and `Linked Walls` actions.
- Restores Wall and Linked Wall HUD controls without replacing the specialized Splash, Radius, or Edge Painter owners.
- Preserves floating HUD position through the typed interaction HUD state.
- Restores the production lock / close behavior for mode HUDs.
- Keeps help copy available through the native title tooltip so truncated help remains readable.

### Room Feature chooser and wall controls

`src/browser/production-mode-hud-surface.ts`

- Restores the v1.5.99 Room Feature preset catalog with 13 production feature types.
- Restores production default dimensions, countertop participation, codes, and auto-generated feature labels.
- Restores Full Wall / Knee Wall selection.
- Restores shared wall Thickness control and persistence through typed tool memory, with browser storage used only as optional remembered UI state.
- Restores the Add Room Feature dialog through typed commands rather than bypassing architecture state ownership.

### Room Feature modal lifecycle

The v1.5.99 `openRoomFeatureDialog()` path used the shared `planDialogShell()`, so its lifecycle behavior was treated as required production parity rather than optional cleanup.

The typed Room Feature modal now:

- mounts inside the active fullscreen element when fullscreen is active;
- otherwise uses the production modal root;
- carries the active dark theme when mounted outside the `.lite-cad` root;
- closes on Escape through capture-phase ownership;
- blocks ordinary canvas shortcuts while the modal is open while leaving editable controls usable;
- closes when the backdrop itself is pressed;
- restores the previously focused element on close;
- removes its temporary document/window listeners on every close and unmount path.

### Room Wall production creation

`src/app/interaction/room-feature-production-tools.ts`

- Restores typed free-wall placement for the Room Wall tool.
- Applies the HUD Wall Type and Thickness options to the created wall.
- Retains the established weak 3° straightening behavior plus strong Shift straightening.
- Keeps wall creation inside the command / transaction architecture path.

### Linked Wall edge brush

`src/app/interaction/linked-wall-brush.ts`
`src/browser/production-linked-wall-target-surface.ts`

- Restores Linked Walls as an eligible-edge brush rather than a generic free-drag wall tool.
- Generates Back / Left / Right wall targets from room-feature runs.
- Supports Add and Erase brush behavior.
- Uses the shared Thickness option.
- Stores linkage metadata on created walls so their owning room-feature group / anchor and edge remain explicit.
- Exposes occupied targets so the brush can avoid duplicate walls and erase the correct linked wall.
- Preserves the production linked-wall target preview through a dedicated browser surface.

## Existing specialized HUDs retained

Batch 59 deliberately does not create second owners for production modes that were already specialized:

- Splash retains Selected Piece / All Pieces scope, Add / Subtract brush behavior, and Help.
- Radius retains its specialized radius placement HUD and options.
- Edge Painter retains its specialized edge-profile brush HUD and options.
- SLAB Move remains outside the generic DESIGN mode HUD family.

## Tests added and corrected

`tests/production-mode-hud-surface.test.ts`

- Verifies production Dimension / Note / Line HUD identities and help contracts.
- Verifies Room Features, Wall, and Linked Wall HUD family descriptors.
- Verifies specialized Splash / Radius / Edge Painter / SLAB Move modes are not duplicated by the generic HUD owner.
- Verifies the complete 13-item Room Feature preset catalog and auto-label behavior.
- Verifies Room Feature modal fullscreen host selection.
- Verifies canvas-key isolation while preserving Escape and editable controls.

`tests/production-room-feature-tools.test.ts`

- Verifies Room Wall creation honors Wall Type and Thickness.
- Verifies Linked Walls use the eligible-edge Add / Erase brush contract.
- Verifies linked-wall Thickness and linkage metadata.

The final test correction also aligned the fixture with the intended active Kitchen layout and removed a stale expectation from the earlier free-drag Linked Wall model. The production edge-brush implementation was retained rather than weakening it to satisfy the stale test.

## Validation

Validated at implementation head `836b1f8aad4895cc33a154fb582eb910d669a4c2` in Architecture CI run `37014865651`:

- TypeScript typecheck: pass
- ESLint: pass
- Vitest: **405 / 405 tests passed across 66 test files**
- Vite production build: pass
- Browser-ready artifact verification: pass
- Generated architecture artifacts:
  - `dist/cad-lite-v1.6.0.js` — 467.12 kB (113.50 kB gzip)
  - `dist/cad-lite-v1.6.0.css` — 93.08 kB (12.53 kB gzip)

Intermediate CI runs exposed three unnecessary type assertions in the partial Batch 59 interaction work, two missing browser-barrel exports for the new lifecycle helpers, two test-only unnecessary assertions, and the stale Room Feature tool fixture expectations described above. Those issues were corrected rather than suppressing lint, typecheck, or parity coverage.

## Deliberate boundaries

- Batch 59 does not modify production `main`.
- Floor Plan modal lifecycle remains owned by Batch 58 and was not reopened except as a useful architecture precedent.
- Broad Navigator / Inspector parity remains Batch 60.
- Output and export flows remain Batch 61.
- Golden migration project / fixture work remains Batch 62.
- Whole-app visual QC remains Batch 63.

## Next recommended slice — Batch 60

Continue with **Navigator / Inspector production parity**:

1. Inventory the frozen v1.5.99 Navigator and Inspector sections against current typed browser owners.
2. Verify entity selection, section visibility, ordering, collapse behavior, context transitions, and edit/delete actions before adding new adapters.
3. Close only confirmed parity gaps while preserving the current typed domain and command ownership.
4. Keep output/export-specific behavior for Batch 61 and whole-app visual polish for Batch 63.
