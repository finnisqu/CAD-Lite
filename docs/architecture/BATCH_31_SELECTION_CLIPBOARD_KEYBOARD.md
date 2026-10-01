# Batch 31 — Selection / Clipboard / Keyboard Parity

Behavior baseline: v1.5.99  
Branch: architecture/v1.6-foundation  
Starting architecture head: `f20e1f9c26ef10097302133aaf1e2918ca1a163b`

## Scope

Batch 31 is the first measured v1.5.99 → v1.6 acceptance/parity slice after the major architecture foundation work.

The production bundle was treated as the source of truth for canvas keyboard behavior rather than inventing new shortcuts or broadening clipboard ownership.

## Restored production behavior

### Select all Pieces

`Ctrl/Cmd+A` selects all Pieces in the active Layout.

This remains Piece-scoped, matching v1.5.99 rather than becoming a generic "select every canvas entity" command.

### Duplicate

`Ctrl/Cmd+D` now duplicates the selected supported canvas entity:

- Pieces
- Dimension
- Line
- Note
- Slab

Piece duplication reuses the existing deterministic prepare → commit graph pipeline, preserving linked/fabrication topology and allocating all IDs outside reducers.

### Copy / Paste

`Ctrl/Cmd+C` and `Ctrl/Cmd+V` now support the production clipboard entity set:

- Pieces
- Dimension
- Line
- Note

Room Features and Slabs are deliberately not added to clipboard because v1.5.99 did not copy/paste them.

Clipboard state is session/runtime state rather than persisted project data.

### Cross-Layout Piece paste

Piece clipboard preparation is separate from same-Layout duplication.

Cross-Layout paste:

- remaps Piece IDs
- remaps Piece Group IDs when the whole group is copied
- remaps Piece seam IDs
- remaps sink/cutout IDs
- remaps fabrication split IDs
- remaps Assembly-link IDs and mate references
- remaps linked backsplash parent references
- reassigns copied Pieces to a valid Area in the destination Layout when the source Area does not exist there
- preserves the Piece graph as one transaction

This keeps ID allocation and graph preparation outside reducers and avoids attaching stale foreign identifiers to the destination Layout.

### Annotation clipboard behavior

Dimension, Line, and Note copies preserve their typed properties and receive new IDs.

Note paste also preserves its leader relationship by copying/remapping attached leader Lines with the Note.

### Canvas keyboard surface

Production-level shortcuts that are not tool-specific pointer interactions now live in a dedicated `CanvasKeyboardSurface` instead of accumulating inside the Piece renderer.

The surface owns:

- Ctrl/Cmd+A
- Ctrl/Cmd+C
- Ctrl/Cmd+V
- Ctrl/Cmd+D
- Shift+Q workspace toggle
- Escape selection clear
- Delete/Backspace for Piece, Room Feature, and Slab selections

Annotation deletion remains owned by the existing annotation/canvas interaction path.

### Room Feature keyboard nudging

Room Features now match the production arrow-key movement model:

- Arrow key = 1 grid increment
- Shift+Arrow = 4 grid increments
- repeated keydown updates a transient preview
- keyup commits one undoable transaction
- cancellation clears the preview without committing

Legacy Room Feature `groupId` members move rigidly together, matching the production grouped-feature behavior.

## Tests

Batch 31 adds regression coverage for:

- select-all Piece behavior
- Dimension duplicate
- Line duplicate
- Note duplicate + leader preservation
- Slab duplicate
- Piece copy/paste across Layouts
- Piece graph ID/reference remapping
- destination Area normalization
- Room Feature 1× grid nudge
- Room Feature Shift 4× grid nudge
- grouped Room Feature nudge

Final Batch 31 CI at architecture head `1592c6705c785b59e369dc9e2cacb81109d28ba3`:

- Architecture CI run: `36875569759`
- TypeScript: pass
- ESLint: pass
- Tests: **298/298** across **37 files**
- Build: pass
- Browser artifact verification: pass
- JS: **346.43 kB / 86.42 kB gzip**
- CSS: **25.05 kB / 4.42 kB gzip**

Production `main` remains frozen at `77728eed327f144b0b1c5d4b9562747d8d62074e`.

## Deliberate boundary

Batch 31 does not broaden production behavior merely because the new architecture could support it.

Still outside this slice:

- Room Feature clipboard copy/paste
- Slab clipboard copy/paste
- generic mixed-entity clipboard payloads
- multi-type simultaneous Selection
- browser/system clipboard serialization
- cross-project clipboard persistence

## Next batch

Continue the acceptance audit with the next high-confidence v1.5.99 parity gap. Prefer a behavior that can be specified from production, expressed through typed commands/interactions, and regression-tested without reintroducing renderer-owned mutation logic.
