# Architecture Batch 5 — Store and Command Foundation

Status: implementation checkpoint  
Behavior baseline: v1.5.99  
Branch: `architecture/v1.6-foundation`

## Purpose

Batch 5 defines the mutation path for the new architecture.

The goal is to replace scattered:

```text
mutate
render
refresh Inspector
refresh Navigator
autosave
push history
sync toolbar
```

coordination with one observable state commit.

This batch does not wire the production v1.5.99 runtime to the store yet.

## Application state

Runtime state is now separated into three top-level owners:

```text
ApplicationState
  project
  session
  preferences
```

### Project

Persisted job/domain data from the schema established in Batch 4.

### Session

Current interaction context:

- active Layout ID
- DESIGN / SLAB workspace
- unified Selection
- transient scratch state

Transient state is explicitly outside the project file.

### Preferences

Editor/display preferences.

The persisted file can still retain useful editor preferences, but they are not
part of Project domain data.

## Unified selection foundation

The store now has a discriminated Selection type:

- none
- pieces
- dimension
- line
- note
- Room Feature
- Area
- Material
- Layout
- slab
- Piece Group

Batch 6 will build the selection controller and tool lifecycle on top of this
foundation. Batch 5 only establishes the state shape and a simple selection
command.

## Commands

A command declares:

- type
- human-readable label
- reducer
- history policy
- persistence policy

Policies are explicit rather than inferred from the state domain changed.

This is important for preserving v1.5.99 behavior. For example:

- selecting an entity: history skip, persistence skip
- switching Layouts: history skip, persistence save
- switching DESIGN / SLAB: history record, persistence save
- renaming a Layout: history record, persistence save

The current runtime intentionally treats workspace switching as an Undo step, so
the new architecture must be able to record session/editor commands in history.

## Immutable state transitions

Commands use structural sharing:

- unchanged top-level domains preserve object identity
- only edited collections/entities are replaced
- subscribers can determine which domain changed by reference comparison

The store reports:

```text
changed.project
changed.session
changed.preferences
```

This will allow later rendering/autosave subscribers to avoid refreshing
unrelated systems.

## Transactions

Multiple commands can be applied as one logical transaction.

A transaction:

1. starts from one state revision
2. applies commands in memory
3. skips internal no-op commands
4. commits once
5. notifies subscribers once
6. aggregates history/persistence policies unless explicitly overridden

This is the mechanism future drag operations can use so dozens of pointer-move
previews do not become dozens of Undo entries.

## Store subscribers

The store is intentionally UI-agnostic.

Future subscribers can independently handle:

- history
- autosave
- canvas invalidation
- Navigator refresh
- Inspector refresh
- toolbar state

The command does not call any of those systems directly.

## Legacy bridge

A temporary legacy bridge contract now exists so the v1.5.99 runtime can later
be attached incrementally rather than rewritten in one operation.

Batch 5 defines that seam only. Production v1.5.99 remains untouched.

## Initial command set

The first low-risk commands cover:

- Project metadata
- Layout rename
- Layout quantity
- Area rename
- Material rename
- active Layout
- workspace
- Selection
- editor preferences

These commands prove project, session, and preference changes without touching
Piece geometry.

## Small v1.5.99 audit correction

The legacy sink-side convention constant is documented as:

```text
front-bottom-v1
```

matching the actual v1.5.99 runtime.

## Deliberate non-goals

Batch 5 does not yet:

- replace current `state`
- replace Undo/Redo
- replace autosave
- connect Navigator/Inspector to store subscriptions
- implement tool lifecycles
- migrate Piece mutations
- add framework state libraries

The store and command system are purpose-built and dependency-free.

## Acceptance criteria

Batch 5 is accepted when:

1. Project / Session / Preferences are distinct runtime domains
2. commands produce immutable top-level transitions
3. subscribers receive one event per logical commit
4. no-op commands do not increment revision
5. transactions notify once
6. history and persistence policies are explicit
7. workspace switching can remain undoable
8. Selection remains transient
9. canonical persistence excludes transient session state
10. Architecture CI passes all checks
