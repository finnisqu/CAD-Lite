# Batch 28 — Project Scratchpad

## Goal

Restore the v1.5.99 Project Scratchpad as an explicit persisted project concept with an isolated browser surface, while keeping Scratchpad editing out of CAD drawing History and redraw work.

The Scratchpad is a project note surface, not a drawing entity and not a normal Inspector selection.

## v1.5.99 behavioral source

The frozen production implementation at `main` / v1.5.99 remains the behavior baseline.

Production behavior confirmed during this batch:

- one Scratchpad belongs to the project
- Scratchpad content is persisted as HTML
- the Scratchpad can be docked beneath the Inspector or floated over the app
- dragging the grab handle undocks and moves it
- floating width/height and left/top position persist
- docked height persists
- floating width is constrained to `280–720 px`
- floating height is constrained to `190–560 px`
- docked height is constrained to `150–420 px`
- default geometry is `360 × 300 px` floating and `220 px` docked height
- Ctrl/Cmd+B, I, and U apply rich-text formatting
- text input autosaves after roughly 120 ms
- resize persistence is debounced at roughly 140 ms
- Scratchpad edits do not create normal CAD Undo steps

## Typed domain

`src/domain/scratchpad/index.ts` now owns the persisted Scratchpad shape:

```ts
interface ProjectScratchpad {
  html: string;
  floating: boolean;
  dockHeight: number;
  width: number;
  height: number;
  left: number | null;
  top: number | null;
}
```

`ProjectMeta.scratchpad` is no longer an opaque `JsonValue`.

The domain module owns:

- defaults
- persistence normalization
- geometry clamping
- patches
- equality

### Canonical null position stabilization

v1.5.99 used `Number(raw.left)` / `Number(raw.top)`, which incidentally converted an explicit JSON `null` into `0` during normalization.

v1.6 keeps `null` as the canonical representation of an unset floating position. This does not change visible placement behavior: an unset position still uses the same lower-right fallback when the Scratchpad floats. It does make canonical v1.6 serialization stable across save/load round trips.

## Command boundary

Batch 28 adds:

- `updateProjectScratchpad(patch)`

The command:

- updates only `ProjectState.meta.scratchpad`
- normalizes every patch through the Scratchpad domain
- persists through Autosave
- deliberately uses `history: 'skip'`

This matches production behavior: ordinary Scratchpad note-taking and positioning should not consume CAD Undo depth.

## Scratchpad-specific invalidation

The view invalidation layer now has a dedicated `scratchpad` target.

A project change is treated as Scratchpad-only when:

- Layout references are unchanged
- Material references are unchanged
- project name/date/notes are unchanged
- only the Scratchpad object changed

That event invalidates only the Scratchpad surface.

This prevents each debounced keystroke from unnecessarily refreshing:

- canvas
- Navigator
- Inspector
- toolbar

Other project changes still include Scratchpad invalidation so project load/reset-style operations can synchronize the surface.

## Browser surface

`ScratchpadSurface` is a dedicated browser adapter mounted by the shared runtime.

It owns:

- docked Scratchpad DOM
- contenteditable HTML editor
- placeholder behavior
- 120 ms content persistence debounce
- rich-text B/I/U shortcuts
- undock/move grab handle
- floating bounds clamping
- floating resize persistence
- docked height persistence
- Return-to-Inspector button
- home indicator/button while the Scratchpad is away
- window-resize repositioning

Transient pointer movement is handled directly by the surface and commits persisted left/top only when the drag ends.

This keeps high-frequency pointer movement out of ProjectState while retaining production persistence behavior.

## Harness

The architecture harness now gives the right rail an explicit `.lc-inspector-col` host and seeds example Scratchpad content so dock/float/resize behavior can be exercised manually.

## Regression coverage

`tests/scratchpad.test.ts` covers:

- production defaults
- geometry limits
- HTML and floating normalization
- zero-value dimension fallbacks
- patch normalization
- no CAD Undo entry for Scratchpad edits
- Scratchpad-only view invalidation

The existing canonical persistence round-trip test also protects the typed Scratchpad representation.

## Deliberate boundary after Batch 28

Not added in this batch:

- collaborative/multi-user notes
- markdown conversion
- attachment support
- Scratchpad search/indexing
- turning Scratchpad text into CAD Notes
- formatting toolbar beyond existing v1.5.99 keyboard shortcuts
- moving Scratchpad geometry into a new preference store, because v1.5.99 persists it inside project data

Batch 28 is therefore a behavior-preserving extraction of the existing project note surface, with a cleaner persistence and invalidation boundary.
