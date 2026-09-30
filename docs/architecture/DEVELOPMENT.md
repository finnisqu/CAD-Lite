# CAD Lite Architecture Development

This document describes the development toolchain introduced in Architecture Batch 2.

## Baseline

- Product behavior baseline: **v1.5.99**
- Architecture branch: **architecture/v1.6-foundation**
- Architecture package version: **1.6.0-dev.0**
- Production behavior is not being changed in this batch.

## Toolchain

- Node.js 22.13+
- npm 10
- TypeScript 6.0.3
- Vite 8.3.1
- Vitest 5.0.2
- ESLint 10 with typescript-eslint
- Prettier 3

TypeScript 6.0.3 is intentionally pinned instead of TypeScript 7 because the
selected typescript-eslint line currently supports TypeScript versions below 6.1.
Upgrade them together once that compatibility window advances.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
npm run check
```

`npm run check` is the local pre-merge quality gate.

## Build contract

Vite builds the architecture source in library mode as an IIFE so it can be
loaded by a normal browser script tag rather than requiring an application
framework or module loader.

The production build contract is:

```text
dist/
  cad-lite-v1.6.0.js
  cad-lite-v1.6.0.css
```

The files are architecture-development artifacts for now. Do not point the live
CAD Lite site at them until the v1.5.99 runtime has been migrated and acceptance
tested.

## Source policy

New architecture code belongs under `src/`. Historical versioned
`cad-lite-v*.js` and `cad-lite-v*.css` snapshots are reference/release
artifacts, not the new source tree.

Prettier and ESLint intentionally ignore the historical versioned files. We do
not want automated tooling to rewrite the known-good behavioral baseline.

## Current source tree

```text
src/
  app/
    build-info.ts
  styles/
    index.css
  main.ts

tests/
  build-info.test.ts

dev/
  index.html
```

This is intentionally minimal. Domain, geometry, command, rendering, UI, tool,
and persistence folders will be added only when real code is extracted into
them. Empty architecture for its own sake is avoided.

## Principles for upcoming extraction

1. Extract pure functions before stateful features.
2. Add tests before or with each extracted behavior.
3. Do not create a second mutable source of truth.
4. Preserve v1.5.99 interaction semantics.
5. Temporary bridges must be named and removable.
6. Renderers eventually become read-only consumers of state.
7. User-meaningful changes eventually become commands/transactions.
