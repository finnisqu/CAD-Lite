# Architecture Batch 9 — Layout and Area Domain

Status: implementation checkpoint  
Behavior baseline: v1.5.99  
Branch: `architecture/v1.6-foundation`

## Purpose

Batch 9 completes the structural ownership layer immediately above Pieces.

The new architecture now owns commands/services for:

### Layouts

- create
- duplicate
- delete
- reorder
- rename
- quantity
- active Layout navigation

### Areas

- create
- rename
- delete
- reorder
- active Area navigation
- Piece / Piece-family assignment

The browser harness extends the Batch 8 vertical slice to exercise Layout and
Area creation/deletion/selection using current CAD Lite DOM conventions.

Production v1.5.99 remains untouched.

## Layout defaults

New Layout creation is now a pure domain factory.

The v1.5.99 defaults are retained:

- quantity 1
- DESIGN canvas 300 × 200
- scale 6
- grid 1
- grid visible
- Piece fill opacity 1
- one initial Area
- empty Pieces / Dimensions / Notes / Lines / Room Features / overlays

ID generation is deliberately not performed inside reducers.

Browser code generates IDs and passes them into deterministic commands.

## Layout duplication

v1.5.99 duplicates a Layout by deep-cloning it, replacing only the Layout ID,
and appending " Copy" to the name.

Batch 9 retains that behavior.

Nested legacy entity IDs therefore remain scoped to their cloned Layout for now.
They are not blindly regenerated because relationships inside Pieces, Notes,
Lines, Sinks, Cutouts, Seams, Assemblies and overlays are not yet all formally
typed.

When the Piece/domain graphs are migrated, duplication can gain an authoritative
graph-aware ID remapper.

This is a deliberate compatibility boundary, not accidental technical debt.

## Layout deletion

The architecture encodes the current constraints:

- at least one Layout must remain
- deleting the active Layout activates the nearest surviving Layout
- active tool interaction is cancelled when active Layout context disappears
- HUD position/tool memory remain available through the interaction reset
- if the deleted active Layout itself was selected, the fallback Layout becomes
  selected
- deleting an inactive Layout preserves current navigation

Layout reorder operates by explicit ordered IDs and preserves active identity.

## Area ownership

Every Layout must retain at least one Area.

Adding an Area:

- appends it to the Layout
- makes it the Layout's active Area
- selects it when that Layout is currently active
- creates one Undo step
- persists

Selecting/activating an existing Area is navigation:

```text
history: skip
persistence: save
```

This mirrors Layout switching: it changes current editing context but is not a
user-content Undo step.

Area rename/reorder/delete are normal undoable project edits.

## Piece-family Area assignment

Area assignment is now a pure domain service.

The v1.5.99 family rules are retained.

When a requested Piece is a linked backsplash:

1. resolve to the parent Piece first

When the root Piece belongs to a Piece Group:

2. include every non-backsplash member of that Piece Group

For every moved root Piece:

3. include all linked backsplash children

Then the complete family receives the destination Area.

Conceptually:

```text
requested Piece
      ↓
linked splash? → parent
      ↓
Piece Group? → all group roots
      ↓
linked splash children
      ↓
one Area assignment
```

This prevents Assemblies/Groups and their attached splashes from being split
across Areas by different UI entry points.

## Area deletion cascade

Deleting an Area first creates a deletion plan containing:

- deleted Area
- fallback Area
- affected Piece IDs

The fallback defaults to the first other Area, matching v1.5.99.

If Pieces are affected, the browser can ask for confirmation using the exact
plan before dispatching the command.

The command then:

1. moves affected Piece families to the fallback Area
2. removes the Area
3. preserves the previous active Area when it still exists
4. switches active Area to fallback only when the deleted Area was active
5. moves an Area selection to the fallback when necessary

The same family-assignment service is used by ordinary Piece moves and Area
deletion.

## Browser bridge

Batch 9 extends the development browser surface using existing production
selectors where practical:

- `#lc-add-layout`
- `#lc-layouts`
- `#lc-list`
- `.lc-add-area-btn`
- `.lc-area-header`
- `.lc-area-header-main`
- `.lc-area-header-title`
- `.lc-area-header-meta`
- `.lc-area-header-actions`

The harness can now manually exercise:

- Add Layout
- Duplicate Layout
- Delete Layout
- Layout selection
- Layout rename/quantity
- Add Area
- Area selection
- Area rename
- Area delete with Piece reassignment confirmation
- Undo / Redo
- autosave

Layout and Area reorder commands are implemented/tested but the current
production drag adapter is not migrated in this batch.

## Deliberate non-goals

Batch 9 does not yet:

- migrate production drag/reorder DOM handlers
- render Piece rows through the v1.6 browser surface
- type the full Piece entity
- regenerate nested IDs during Layout duplication
- migrate Piece drag geometry
- migrate Piece Inspector edits
- replace production v1.5.99

Those are intentionally deferred to the Piece domain phase.

## Acceptance criteria

Batch 9 is accepted when:

1. Layout create/duplicate/delete/reorder are command-driven
2. one Layout minimum is enforced
3. active Layout fallback is deterministic
4. Area create/rename/delete/reorder are command-driven
5. one Area minimum is enforced
6. active Area navigation remains outside Undo
7. Area deletion preserves unrelated active Area state
8. Area deletion has an inspectable confirmation plan
9. Piece Group members move Areas together
10. linked splashes follow their parent Piece
11. selecting a linked splash for Area movement resolves to the parent family
12. browser harness exercises Layout and Area structural operations
13. ID generation occurs outside reducers
14. architecture CI passes all checks
