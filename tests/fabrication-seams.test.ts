import { describe, expect, it } from 'vitest';

import {
  AppStore,
  CommandDispatcher,
  HistoryManager,
  applyFabricationTransaction,
  applicationStateFromLegacyPayload,
} from '../src/app';
import {
  prepareFabricationMerge,
  prepareFabricationSplit,
  type Piece,
} from '../src/domain/pieces';

function idFactory(prefix = '') {
  let index = 0;
  return (kind: string): string =>
    prefix + kind + '-' + String(++index);
}

function payload(workspace: 'design' | 'slab' = 'slab') {
  return {
    sinkSideConvention: 'front-bottom-v1',
    project: {
      name: 'Fabrication',
      date: '2026-09-30',
      notes: '',
    },
    materials: [],
    layouts: [
      {
        id: 'layout',
        name: 'Kitchen',
        quantity: 1,
        cw: 200,
        ch: 120,
        scale: 8,
        grid: 1,
        showGrid: true,
        pieceFillOpacity: 1,
        slabCW: 200,
        slabCH: 120,
        areas: [{ id: 'a', name: 'A' }],
        activeAreaId: 'a',
        pieces: [
          {
            id: 'p',
            name: 'Countertop',
            areaId: 'a',
            x: 10,
            y: 20,
            w: 60,
            h: 30,
            rotation: 0,
            layer: 2,
            color: '#ffffff',
            cornerRadii: { tl: 2, tr: 3, br: 4, bl: 1 },
            overhangs: { front: 1.5, back: 0.5, left: 0.25, right: 0.75 },
            edgeProfiles: {
              top: 'eased',
              right: 'bullnose',
              bottom: 'miter',
              left: 'flat',
            },
            slabPlacement: { x: 10, y: 20, rotation: 0 },
            sinks: [
              {
                id: 'sink',
                name: 'Kitchen',
                type: 'custom',
                modelId: null,
                shape: 'rect',
                w: 31,
                h: 17,
                cornerR: 4,
                side: 'front',
                centerline: 30,
                setback: 3.125,
                rotation: 0,
                faucets: [4],
                faucetSetback: 2.5,
                faucetHoleDiameter: 1.5,
                faucetHoleSpacing: 2,
                insideFinish: 'polished',
              },
            ],
            cutouts: [
              {
                id: 'cutout',
                name: 'Outlet',
                kind: 'rectangle',
                cx: 30,
                cy: 10,
                w: 10,
                h: 6,
                cornerR: 0,
                rotation: 0,
                insideFinish: 'unpolished',
              },
            ],
            pieceSeams: [
              {
                id: 'cut-seam',
                orientation: 'vertical',
                reference: 'left',
                offset: 30,
              },
              {
                id: 'cross-seam',
                orientation: 'horizontal',
                reference: 'top',
                offset: 10,
              },
            ],
            assemblyLinks: [],
          },
          {
            id: 'splash',
            name: 'Splash',
            areaId: 'a',
            x: 10,
            y: 16,
            w: 60,
            h: 4,
            rotation: 0,
            layer: 3,
            color: '#ffffff',
            pieceType: 'backsplash',
            tags: ['backsplash'],
            attachment: {
              kind: 'backsplash',
              parentPieceId: 'p',
              sourceEdge: 'top',
              linkedLength: true,
              snapped: true,
              offset: 0,
            },
            slabPlacement: { x: 10, y: 16, rotation: 0 },
            cornerRadii: { tl: 0, tr: 0, br: 0, bl: 0 },
            overhangs: { front: 0, back: 0, left: 0, right: 0 },
            edgeProfiles: {
              top: 'none',
              right: 'none',
              bottom: 'none',
              left: 'none',
            },
            sinks: [],
            cutouts: [],
            pieceSeams: [],
          },
        ],
        dims: [],
        notes: [],
        lines: [],
        roomFeatures: [],
        plan: null,
        overlays: [],
      },
    ],
    ui: {
      workspace: workspace === 'slab' ? 'slab' : 'layout',
      gridSnap: true,
      pieceSnap: true,
      showSinkCenterlines: true,
      showCutoutLabels: true,
      showSeams: true,
      showGrid: true,
      showDims: true,
      dimPrecision: 16,
      dimFormat: 'fraction',
    },
    active: 0,
  };
}

function layoutFrom(workspace: 'design' | 'slab' = 'slab') {
  return applicationStateFromLegacyPayload(payload(workspace))
    .project.layouts[0]!;
}

describe('fabrication split preparation', () => {
  it('splits Piece geometry, both poses, edges, corners, overhangs, and creates a paired assembly link', () => {
    const layout = layoutFrom();
    const result = prepareFabricationSplit(
      layout,
      'p',
      'cut-seam',
      idFactory(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const countertops = result.plan.pieces.filter(
      (piece) => piece.pieceType !== 'backsplash',
    );
    expect(countertops).toHaveLength(2);

    const a = countertops.find((piece) => piece.name === 'Countertop A');
    const b = countertops.find((piece) => piece.name === 'Countertop B');
    if (!a || !b) throw new Error('Missing split children');

    expect(a).toMatchObject({
      w: 30,
      h: 30,
      x: 10,
      y: 20,
      slabPlacement: { x: 10, y: 20, rotation: 0 },
      cornerRadii: { tl: 2, tr: 0, br: 0, bl: 1 },
      overhangs: { right: 0 },
    });
    expect(b).toMatchObject({
      w: 30,
      h: 30,
      x: 40,
      y: 20,
      slabPlacement: { x: 40, y: 20, rotation: 0 },
      cornerRadii: { tl: 0, tr: 3, br: 4, bl: 0 },
      overhangs: { left: 0 },
    });
    expect(a.edgeProfiles.right).toBe('seam');
    expect(b.edgeProfiles.left).toBe('seam');
    expect(a.pieceGroupId).toBeTruthy();
    expect(b.pieceGroupId).toBe(a.pieceGroupId);

    const link = a.assemblyLinks.find(
      (item) => item.matePieceId === b.id,
    );
    const mate = b.assemblyLinks.find(
      (item) => item.matePieceId === a.id,
    );
    expect(link).toMatchObject({
      kind: 'seam',
      side: 'right',
      mateSide: 'left',
      orientation: 'vertical',
      sourceName: 'Countertop',
      sourceSeamId: 'cut-seam',
      cutCoordinate: 30,
    });
    expect(mate).toMatchObject({
      id: link?.id,
      side: 'left',
      mateSide: 'right',
    });
    expect(result.plan.selectionIds).toEqual([a.id]);
  });

  it('splits crossing sinks/cutouts and duplicates perpendicular planning seams', () => {
    const result = prepareFabricationSplit(
      layoutFrom(),
      'p',
      'cut-seam',
      idFactory('x-'),
    );
    if (!result.ok) throw new Error(result.reason);

    const [a, b] = result.plan.pieces.filter(
      (piece) => piece.pieceType !== 'backsplash',
    );
    if (!a || !b) throw new Error('Missing split pieces');

    expect(a.sinks).toHaveLength(1);
    expect(b.sinks).toHaveLength(1);
    expect(a.sinks[0]?.id).not.toBe(b.sinks[0]?.id);
    expect(a.sinks[0]?.fabricationSplitSinkId).toBeTruthy();
    expect(b.sinks[0]?.fabricationSplitSinkId).toBe(
      a.sinks[0]?.fabricationSplitSinkId,
    );
    expect(a.sinks[0]?.fabricationPose).toEqual({ cx: 30, cy: 18.375 });
    expect(b.sinks[0]?.fabricationPose).toEqual({ cx: 0, cy: 18.375 });

    expect(a.cutouts).toHaveLength(1);
    expect(b.cutouts).toHaveLength(1);
    expect(a.cutouts[0]?.fabricationSplitCutoutId).toBeTruthy();
    expect(b.cutouts[0]?.fabricationSplitCutoutId).toBe(
      a.cutouts[0]?.fabricationSplitCutoutId,
    );
    expect(a.cutouts[0]?.cx).toBe(30);
    expect(b.cutouts[0]?.cx).toBe(0);

    expect(a.pieceSeams).toHaveLength(1);
    expect(b.pieceSeams).toHaveLength(1);
    expect(a.pieceSeams[0]).toMatchObject({
      orientation: 'horizontal',
      reference: 'top',
      offset: 10,
    });
    expect(b.pieceSeams[0]).toMatchObject({
      orientation: 'horizontal',
      reference: 'top',
      offset: 10,
    });
    expect(a.pieceSeams[0]?.id).not.toBe(b.pieceSeams[0]?.id);
  });

  it('splits a linked splash that spans the cut and resizes each linked child', () => {
    const result = prepareFabricationSplit(
      layoutFrom(),
      'p',
      'cut-seam',
      idFactory('s-'),
    );
    if (!result.ok) throw new Error(result.reason);

    const countertops = result.plan.pieces.filter(
      (piece) => piece.pieceType !== 'backsplash',
    );
    const splashes = result.plan.pieces.filter(
      (piece) => piece.pieceType === 'backsplash',
    );
    expect(splashes).toHaveLength(2);
    expect(splashes.map((piece) => piece.w)).toEqual([30, 30]);
    expect(
      new Set(splashes.map((piece) => piece.attachment?.parentPieceId)),
    ).toEqual(new Set(countertops.map((piece) => piece.id)));
    expect(
      splashes.every((piece) => piece.attachment?.snapped === true),
    ).toBe(true);
  });

  it('rejects edge cuts and cuts that would divide an existing perpendicular fabrication seam', () => {
    const edge = layoutFrom();
    edge.pieces[0]!.pieceSeams[0]!.offset = 0.25;
    expect(
      prepareFabricationSplit(
        edge,
        'p',
        'cut-seam',
        idFactory(),
      ),
    ).toMatchObject({ ok: false });

    const linked = layoutFrom();
    const source = linked.pieces.find((piece) => piece.id === 'p')!;
    const mate: Piece = {
      ...structuredClone(source),
      id: 'mate',
      name: 'Mate',
      x: 10,
      y: 0,
      h: 20,
      pieceSeams: [],
      sinks: [],
      cutouts: [],
      assemblyLinks: [
        {
          id: 'existing',
          kind: 'seam',
          side: 'bottom',
          mateSide: 'top',
          matePieceId: 'p',
          sourceSeamId: 'old',
        },
      ],
    };
    source.assemblyLinks = [
      {
        id: 'existing',
        kind: 'seam',
        side: 'top',
        mateSide: 'bottom',
        matePieceId: 'mate',
        sourceSeamId: 'old',
      },
    ];
    linked.pieces.push(mate);
    const blocked = prepareFabricationSplit(
      linked,
      'p',
      'cut-seam',
      idFactory(),
    );
    expect(blocked).toMatchObject({ ok: false });
    if (!blocked.ok) {
      expect(blocked.reason).toContain('divide an existing fabrication seam');
    }
  });

  it('rewires an existing parallel external fabrication link when splitting an assembly member', () => {
    const layout = layoutFrom();
    const source = layout.pieces.find((piece) => piece.id === 'p')!;
    source.x = 40;
    source.slabPlacement.x = 40;
    source.pieceGroupId = 'g';
    source.pieceGroupName = 'Countertop';

    const left: Piece = {
      ...structuredClone(source),
      id: 'left',
      name: 'Left',
      x: 10,
      slabPlacement: { x: 10, y: 20, rotation: 0 },
      w: 30,
      sinks: [],
      cutouts: [],
      pieceSeams: [],
      attachment: null,
      assemblyLinks: [
        {
          id: 'external',
          kind: 'seam',
          side: 'right',
          mateSide: 'left',
          matePieceId: 'p',
          sourceSeamId: 'old',
        },
      ],
    };
    left.pieceGroupId = 'g';
    left.pieceGroupName = 'Countertop';
    source.assemblyLinks = [
      {
        id: 'external',
        kind: 'seam',
        side: 'left',
        mateSide: 'right',
        matePieceId: 'left',
        sourceSeamId: 'old',
      },
    ];
    layout.pieces.unshift(left);

    const result = prepareFabricationSplit(
      layout,
      'p',
      'cut-seam',
      idFactory('r-'),
    );
    if (!result.ok) throw new Error(result.reason);

    const nextLeft = result.plan.pieces.find((piece) => piece.id === 'left')!;
    const childA = result.plan.pieces.find(
      (piece) => piece.name === 'Countertop A',
    )!;
    expect(
      nextLeft.assemblyLinks.find((link) => link.id === 'external')
        ?.matePieceId,
    ).toBe(childA.id);
    expect(
      childA.assemblyLinks.find((link) => link.id === 'external')
        ?.matePieceId,
    ).toBe('left');
    expect(childA.pieceGroupId).toBe('g');
  });
});

describe('fabrication merge preparation', () => {
  it('reconstructs the countertop and collapses split sink/cutout fragments', () => {
    const original = layoutFrom();
    const split = prepareFabricationSplit(
      original,
      'p',
      'cut-seam',
      idFactory('split-'),
    );
    if (!split.ok) throw new Error(split.reason);

    const splitLayout = { ...original, pieces: split.plan.pieces };
    const a = split.plan.pieces.find(
      (piece) => piece.name === 'Countertop A',
    )!;
    const link = a.assemblyLinks.find((item) => item.kind === 'seam')!;

    const merged = prepareFabricationMerge(
      splitLayout,
      link.id,
      idFactory('merge-'),
    );
    if (!merged.ok) throw new Error(merged.reason);

    const countertops = merged.plan.pieces.filter(
      (piece) => piece.pieceType !== 'backsplash',
    );
    expect(countertops).toHaveLength(1);
    const piece = countertops[0]!;
    expect(piece).toMatchObject({
      name: 'Countertop',
      w: 60,
      h: 30,
      x: 10,
      y: 20,
      slabPlacement: { x: 10, y: 20, rotation: 0 },
      cornerRadii: { tl: 2, tr: 3, br: 4, bl: 1 },
      overhangs: { front: 1.5, back: 0.5, left: 0.25, right: 0.75 },
      pieceGroupId: null,
    });
    expect(piece.assemblyLinks).toEqual([]);
    expect(piece.sinks).toHaveLength(1);
    expect(piece.sinks[0]?.fabricationSplitSinkId).toBeNull();
    expect(piece.sinks[0]?.fabricationPose).toBeNull();
    expect(piece.cutouts).toHaveLength(1);
    expect(piece.cutouts[0]?.fabricationSplitCutoutId).toBeNull();
    expect(piece.pieceSeams).toHaveLength(1);
    expect(piece.pieceSeams[0]).toMatchObject({
      orientation: 'horizontal',
      reference: 'top',
      offset: 10,
    });

    const splashes = merged.plan.pieces.filter(
      (candidate) => candidate.pieceType === 'backsplash',
    );
    expect(splashes).toHaveLength(1);
    expect(splashes[0]?.w).toBe(60);
    expect(splashes[0]?.attachment?.parentPieceId).toBe(piece.id);
    expect(merged.plan.selectionIds).toEqual([piece.id]);
  });

  it('allows SLAB pieces to be independently nested but requires DESIGN seam adjacency', () => {
    const original = layoutFrom();
    const split = prepareFabricationSplit(
      original,
      'p',
      'cut-seam',
      idFactory('n-'),
    );
    if (!split.ok) throw new Error(split.reason);
    const layout = { ...original, pieces: split.plan.pieces };
    const a = layout.pieces.find((piece) => piece.name === 'Countertop A')!;
    const b = layout.pieces.find((piece) => piece.name === 'Countertop B')!;
    const linkId = a.assemblyLinks.find((link) => link.kind === 'seam')!.id;

    b.slabPlacement.x = 150;
    expect(
      prepareFabricationMerge(layout, linkId, idFactory('m-')).ok,
    ).toBe(true);

    b.x += 1;
    const blocked = prepareFabricationMerge(
      layout,
      linkId,
      idFactory('bad-'),
    );
    expect(blocked).toMatchObject({ ok: false });
    if (!blocked.ok) expect(blocked.reason).toContain('back together');
  });

  it('preserves and rewires external assembly links in a multi-piece run', () => {
    const original = layoutFrom();
    const source = original.pieces.find((piece) => piece.id === 'p')!;
    source.x = 40;
    source.slabPlacement.x = 40;
    source.pieceGroupId = 'g';
    source.pieceGroupName = 'Run';
    const left: Piece = {
      ...structuredClone(source),
      id: 'left',
      name: 'Left',
      x: 10,
      slabPlacement: { x: 10, y: 20, rotation: 0 },
      w: 30,
      sinks: [],
      cutouts: [],
      pieceSeams: [],
      attachment: null,
      assemblyLinks: [
        {
          id: 'external',
          kind: 'seam',
          side: 'right',
          mateSide: 'left',
          matePieceId: 'p',
          sourceSeamId: 'old',
          sourceName: 'Run',
        },
      ],
    };
    left.pieceGroupId = 'g';
    left.pieceGroupName = 'Run';
    source.assemblyLinks = [
      {
        id: 'external',
        kind: 'seam',
        side: 'left',
        mateSide: 'right',
        matePieceId: 'left',
        sourceSeamId: 'old',
        sourceName: 'Run',
      },
    ];
    original.pieces.unshift(left);

    const split = prepareFabricationSplit(
      original,
      'p',
      'cut-seam',
      idFactory('s-'),
    );
    if (!split.ok) throw new Error(split.reason);
    const splitLayout = { ...original, pieces: split.plan.pieces };
    const a = split.plan.pieces.find(
      (piece) => piece.name === 'Countertop A',
    )!;
    const internal = a.assemblyLinks.find(
      (link) => link.id !== 'external',
    )!;

    const merge = prepareFabricationMerge(
      splitLayout,
      internal.id,
      idFactory('z-'),
    );
    if (!merge.ok) throw new Error(merge.reason);

    const merged = merge.plan.pieces.find(
      (piece) => piece.name === 'Countertop',
    )!;
    const nextLeft = merge.plan.pieces.find((piece) => piece.id === 'left')!;
    expect(merged.pieceGroupId).toBe('g');
    expect(
      merged.assemblyLinks.find((link) => link.id === 'external')
        ?.matePieceId,
    ).toBe('left');
    expect(
      nextLeft.assemblyLinks.find((link) => link.id === 'external')
        ?.matePieceId,
    ).toBe(merged.id);
    expect(new Set(merge.plan.selectionIds)).toEqual(
      new Set(['left', merged.id]),
    );
  });
});

describe('fabrication transaction command', () => {
  it('commits a split as one history step only in SLAB', () => {
    const state = applicationStateFromLegacyPayload(payload('slab'));
    const store = new AppStore(state);
    const commands = new CommandDispatcher(store);
    const history = new HistoryManager(store);
    history.start();

    const layout = store.getState().project.layouts[0]!;
    const prepared = prepareFabricationSplit(
      layout,
      'p',
      'cut-seam',
      idFactory('cmd-'),
    );
    if (!prepared.ok) throw new Error(prepared.reason);

    expect(
      commands.execute(
        applyFabricationTransaction('layout', prepared.plan),
      ),
    ).not.toBeNull();
    expect(history.getStatus()).toMatchObject({
      size: 2,
      undoLabel: 'Cut piece at seam',
    });
    expect(
      store.getState().project.layouts[0]?.pieces.some(
        (piece) => piece.id === 'p',
      ),
    ).toBe(false);

    history.undo();
    expect(
      store.getState().project.layouts[0]?.pieces.some(
        (piece) => piece.id === 'p',
      ),
    ).toBe(true);
    history.stop();

    const designState = applicationStateFromLegacyPayload(payload('design'));
    const designStore = new AppStore(designState);
    const designCommands = new CommandDispatcher(designStore);
    const designPlan = prepareFabricationSplit(
      designStore.getState().project.layouts[0]!,
      'p',
      'cut-seam',
      idFactory('design-'),
    );
    if (!designPlan.ok) throw new Error(designPlan.reason);
    expect(
      designCommands.execute(
        applyFabricationTransaction('layout', designPlan.plan),
      ),
    ).toBeNull();
  });

  it('rejects a stale prepared transaction after the Layout changes', () => {
    const state = applicationStateFromLegacyPayload(payload('slab'));
    const store = new AppStore(state);
    const commands = new CommandDispatcher(store);
    const layout = store.getState().project.layouts[0]!;
    const prepared = prepareFabricationSplit(
      layout,
      'p',
      'cut-seam',
      idFactory('stale-'),
    );
    if (!prepared.ok) throw new Error(prepared.reason);

    layout.pieces[0]!.w = 61;
    expect(
      commands.execute(
        applyFabricationTransaction('layout', prepared.plan),
      ),
    ).toBeNull();
  });
});
