import { describe, expect, it } from 'vitest';

import {
  applicationStateFromLegacyPayload,
  groupPieces,
  renamePieceGroup,
  ungroupPieceGroups,
} from '../src/app';
import {
  createPieceGroupProjection,
  isFabricationAssemblyGroup,
  pieceGroupStats,
  selectedPieceGroupId,
} from '../src/domain/pieces';

function payload() {
  return {
    sinkSideConvention: 'front-bottom-v1',
    project: { name: 'Groups', date: '2026-09-30', notes: '' },
    materials: [],
    layouts: [{
      id: 'layout', name: 'Layout', quantity: 1,
      cw: 200, ch: 120, scale: 8, grid: 1, showGrid: true,
      areas: [{ id: 'a', name: 'A' }], activeAreaId: 'a',
      pieces: [
        {
          id: 'g1', name: 'G1', areaId: 'a', x: 10, y: 10, w: 24, h: 20,
          rotation: 0, layer: 1, color: '#ffffff',
          pieceGroupId: 'ordinary', pieceGroupName: 'Island',
          slabPlacement: { x: 5, y: 5, rotation: 0 },
          sinks: [{ id: 'split-a', name: 'Sink', fabricationSplitSinkId: 'sink-family' }],
        },
        {
          id: 'g2', name: 'G2', areaId: 'a', x: 34, y: 10, w: 30, h: 20,
          rotation: 0, layer: 2, color: '#ffffff',
          pieceGroupId: 'ordinary', pieceGroupName: 'Island',
          slabPlacement: { x: 35, y: 5, rotation: 0 },
          sinks: [{ id: 'split-b', name: 'Sink', fabricationSplitSinkId: 'sink-family' }],
          pieceSeams: [{ id: 'guide', orientation: 'vertical', reference: 'left', offset: 8 }],
        },
        {
          id: 'f1', name: 'Run A', areaId: 'a', x: 70, y: 10, w: 20, h: 24,
          rotation: 0, layer: 3, color: '#ffffff',
          pieceGroupId: 'fabrication', pieceGroupName: 'Run',
          slabPlacement: { x: 70, y: 50, rotation: 90 },
          assemblyLinks: [{ id: 'joint', kind: 'seam', matePieceId: 'f2', sourceSeamId: null, side: 'right' }],
        },
        {
          id: 'f2', name: 'Run B', areaId: 'a', x: 90, y: 10, w: 20, h: 24,
          rotation: 0, layer: 4, color: '#ffffff',
          pieceGroupId: 'fabrication', pieceGroupName: 'Run',
          slabPlacement: { x: 100, y: 50, rotation: 0 },
          assemblyLinks: [{ id: 'joint', kind: 'seam', matePieceId: 'f1', sourceSeamId: null, side: 'left' }],
        },
        {
          id: 'splash', name: 'Splash', areaId: 'a', x: 10, y: 35, w: 24, h: 4,
          rotation: 0, layer: 5, color: '#ffffff', pieceType: 'backsplash',
          slabPlacement: { x: 5, y: 80, rotation: 0 },
          attachment: { kind: 'backsplash', parentPieceId: 'g1', sourceEdge: 'top', linkedLength: true, snapped: true },
        },
      ],
      dims: [], notes: [], lines: [], roomFeatures: [], plan: null, overlays: [],
    }],
    ui: { workspace: 'layout', showGrid: true, showDims: true, dimPrecision: 16, dimFormat: 'fraction' },
    active: 0,
  };
}

describe('Piece Group projection', () => {
  it('distinguishes ordinary groups from fabrication assemblies with stable badges', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const pieces = state.project.layouts[0]!.pieces;
    const groups = createPieceGroupProjection(pieces);
    expect(groups.map(group => [group.id, group.kind, group.badge])).toEqual([
      ['ordinary', 'group', 'G1'],
      ['fabrication', 'fabrication', 'A2'],
    ]);
    expect(isFabricationAssemblyGroup(pieces, 'fabrication')).toBe(true);
    expect(isFabricationAssemblyGroup(pieces, 'ordinary')).toBe(false);
  });

  it('projects production-style group statistics and de-duplicates split sinks', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const pieces = state.project.layouts[0]!.pieces;
    const stats = pieceGroupStats(pieces, 'ordinary');
    expect(stats).toMatchObject({
      pieceCount: 2,
      width: 54,
      height: 20,
      sinkCount: 1,
      seamCount: 1,
      splashCount: 1,
    });
    expect(stats!.totalSf).toBeCloseTo((24 * 20 + 30 * 20) / 144, 10);
  });

  it('recognizes an exact group selection only in DESIGN', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const pieces = state.project.layouts[0]!.pieces;
    expect(selectedPieceGroupId(pieces, ['g1', 'g2'], 'design')).toBe('ordinary');
    expect(selectedPieceGroupId(pieces, ['g1'], 'design')).toBeNull();
    expect(selectedPieceGroupId(pieces, ['g1', 'g2'], 'slab')).toBeNull();
  });
});

describe('Piece Group commands', () => {
  it('groups selected countertop Pieces and clears orphaned old group metadata', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const command = groupPieces('layout', ['g2', 'f1', 'f2'], 'new-group', 'New Group');
    const next = command.reduce(state);
    const pieces = next.project.layouts[0]!.pieces;
    expect(pieces.filter(piece => piece.pieceGroupId === 'new-group').map(piece => piece.id)).toEqual(['g2', 'f1', 'f2']);
    expect(pieces.find(piece => piece.id === 'g1')!.pieceGroupId).toBeNull();
    expect(next.session.selection).toEqual({ kind: 'pieces', ids: ['g2', 'f1', 'f2'] });
  });

  it('renames every member but refuses to ungroup a seam-linked fabrication assembly', () => {
    const state = applicationStateFromLegacyPayload(payload());
    const renamed = renamePieceGroup('layout', 'fabrication', 'Kitchen Run').reduce(state);
    expect(
      renamed.project.layouts[0]!.pieces
        .filter(piece => piece.pieceGroupId === 'fabrication')
        .map(piece => piece.pieceGroupName),
    ).toEqual(['Kitchen Run', 'Kitchen Run']);

    const blocked = ungroupPieceGroups('layout', ['fabrication']).reduce(renamed);
    expect(blocked).toBe(renamed);
  });

  it('ungroups ordinary groups in DESIGN and is inert in SLAB', () => {
    const design = applicationStateFromLegacyPayload(payload());
    const ungrouped = ungroupPieceGroups('layout', ['ordinary']).reduce(design);
    expect(
      ungrouped.project.layouts[0]!.pieces
        .filter(piece => ['g1', 'g2'].includes(piece.id))
        .every(piece => piece.pieceGroupId === null),
    ).toBe(true);

    const slab = applicationStateFromLegacyPayload({ ...payload(), ui: { ...(payload().ui), workspace: 'slab' } });
    expect(ungroupPieceGroups('layout', ['ordinary']).reduce(slab)).toBe(slab);
  });
});
