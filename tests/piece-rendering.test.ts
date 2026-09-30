import { describe, expect, it } from 'vitest';

import {
  applicationStateFromCadLiteFile,
  applicationStateFromLegacyPayload,
  cadLiteFileFromApplicationState,
} from '../src/app';
import {
  createPieceCanvasProjection,
  projectPieceForCanvas,
} from '../src/browser';
import {
  roundedRectPathCorners,
  rotatedRectBoundingSize,
} from '../src/geometry';
import {
  deserializeCadLiteFile,
  serializeCadLiteFile,
} from '../src/persistence';

function legacyPayload(workspace: 'design' | 'slab' = 'design') {
  return {
    sinkSideConvention: 'front-bottom-v1',
    project: {
      name: 'Rendering Test',
      date: '2026-09-30',
      notes: '',
    },
    materials: [],
    layouts: [
      {
        id: 'layout-render',
        name: 'Rendering',
        quantity: 1,
        cw: 240.5,
        ch: 140.25,
        scale: 6,
        grid: 1,
        showGrid: true,
        pieceFillOpacity: 0.55,
        slabCW: 180.125,
        slabCH: 95.75,
        areas: [{ id: 'area-main', name: 'Main' }],
        activeAreaId: 'area-main',
        pieces: [
          {
            id: 'high',
            name: 'Precise Counter',
            areaId: 'area-main',
            w: 81.997123,
            h: 25.5007,
            x: 12.3456789,
            y: 9.87654321,
            rotation: 33.333333,
            layer: 7,
            color: '#abcdef',
            fillOpacity: 0.37,
            cornerRadii: {
              tl: 3.12555,
              tr: 1.0625,
              br: 0.33333,
              bl: 0.125,
            },
            slabPlacement: {
              x: 4.1234567,
              y: 44.7654321,
              rotation: 91.234567,
            },
          },
          {
            id: 'low',
            name: 'Lower Layer',
            areaId: 'area-main',
            w: 30.25,
            h: 18.75,
            x: 80.125,
            y: 15.5,
            rotation: -12.75,
            layer: -2,
            color: '#fedcba',
            noFill: true,
            slabPlacement: {
              x: 90.625,
              y: 6.875,
              rotation: 0,
            },
          },
          {
            id: 'tie',
            name: 'Layer Tie',
            areaId: 'area-main',
            w: 20,
            h: 10,
            x: 4,
            y: 100,
            rotation: 0,
            layer: 7,
            color: '#eeeeee',
            slabPlacement: {
              x: 120,
              y: 70,
              rotation: 15,
            },
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
      showPieceFills: true,
      pieceFillOpacity: 0.55,
      showGrid: true,
      showDims: true,
      dimPrecision: 16,
      dimFormat: 'fraction',
    },
    active: 0,
  };
}

describe('Piece canvas projection', () => {
  it('projects exact rectangle geometry into the v1.5.99 rounded-corner path', () => {
    const state = applicationStateFromLegacyPayload(legacyPayload());
    const piece = state.project.layouts[0]?.pieces[0];
    if (!piece) throw new Error('Missing Piece fixture');

    const projected = projectPieceForCanvas(piece, 'design', {
      showPieceFills: true,
      pieceFillOpacity: 0.55,
      showSeams: true,
      showSinkCenterlines: true,
    });

    expect(projected.geometry).toEqual({
      kind: 'rectangle',
      width: 81.997123,
      height: 25.5007,
      cornerRadii: {
        tl: 3.12555,
        tr: 1.0625,
        br: 0.33333,
        bl: 0.125,
      },
    });
    expect(projected.path).toBe(
      roundedRectPathCorners(
        projected.localRect,
        projected.geometry.cornerRadii,
      ),
    );
  });

  it('uses the rotated bounding box as the pose origin without rounding', () => {
    const state = applicationStateFromLegacyPayload(legacyPayload());
    const piece = state.project.layouts[0]?.pieces[0];
    if (!piece) throw new Error('Missing Piece fixture');

    const projected = projectPieceForCanvas(piece, 'design', {
      showPieceFills: true,
      pieceFillOpacity: 1,
      showSeams: true,
      showSinkCenterlines: true,
    });
    const size = rotatedRectBoundingSize({
      w: 81.997123,
      h: 25.5007,
      rotation: 33.333333,
    });

    expect(projected.pose).toEqual({
      x: 12.3456789,
      y: 9.87654321,
      rotation: 33.333333,
    });
    expect(projected.bounds.x).toBe(12.3456789);
    expect(projected.bounds.y).toBe(9.87654321);
    expect(projected.bounds.w).toBeCloseTo(size.w, 12);
    expect(projected.bounds.h).toBeCloseTo(size.h, 12);
    expect(projected.center.x).toBeCloseTo(12.3456789 + size.w / 2, 12);
    expect(projected.center.y).toBeCloseTo(9.87654321 + size.h / 2, 12);
    expect(projected.renderRotation).toBe(33.333333);
  });

  it('keeps corner radii independent and exact in the path service', () => {
    expect(
      roundedRectPathCorners(
        { x: 0, y: 0, w: 10, h: 5 },
        { tl: 1.125, tr: 0.75, br: 0.5, bl: 0.25 },
      ),
    ).toBe(
      'M1.125,0 H9.25 Q10,0 10,0.75 V4.5 Q10,5 9.5,5 H0.25 Q0,5 0,4.75 V1.125 Q0,0 1.125,0 Z',
    );
  });

  it('sorts render order by layer while preserving source order for ties', () => {
    const state = applicationStateFromLegacyPayload(legacyPayload());
    const projection = createPieceCanvasProjection(state);

    expect(projection.pieces.map((piece) => piece.id)).toEqual([
      'low',
      'high',
      'tie',
    ]);
    expect(state.project.layouts[0]?.pieces.map((piece) => piece.id)).toEqual([
      'high',
      'low',
      'tie',
    ]);
  });

  it('projects DESIGN and SLAB from the same Piece with independent poses', () => {
    const state = applicationStateFromLegacyPayload(legacyPayload());
    const design = createPieceCanvasProjection(state);
    state.session.workspace = 'slab';
    const slab = createPieceCanvasProjection(state);

    const designPiece = design.pieces.find((piece) => piece.id === 'high');
    const slabPiece = slab.pieces.find((piece) => piece.id === 'high');

    expect(designPiece?.geometry).toEqual(slabPiece?.geometry);
    expect(designPiece?.pose).toEqual({
      x: 12.3456789,
      y: 9.87654321,
      rotation: 33.333333,
    });
    expect(slabPiece?.pose).toEqual({
      x: 4.1234567,
      y: 44.7654321,
      rotation: 91.234567,
    });
    expect(design.canvas).toEqual({ width: 240.5, height: 140.25 });
    expect(slab.canvas.width).toBeGreaterThanOrEqual(180.125);
    expect(slab.canvas.height).toBeGreaterThanOrEqual(95.75);
    slab.pieces.forEach((piece) => {
      expect(piece.bounds.x + piece.bounds.w).toBeLessThanOrEqual(
        slab.canvas.width,
      );
      expect(piece.bounds.y + piece.bounds.h).toBeLessThanOrEqual(
        slab.canvas.height,
      );
    });
  });

  it('preserves Piece fill semantics without mutating presentation state', () => {
    const state = applicationStateFromLegacyPayload(legacyPayload());
    const before = JSON.stringify(state.project.layouts[0]?.pieces);
    const projection = createPieceCanvasProjection(state);
    const high = projection.pieces.find((piece) => piece.id === 'high');
    const low = projection.pieces.find((piece) => piece.id === 'low');

    expect(high?.appearance.fill).toBe('#abcdef');
    expect(high?.appearance.fillOpacity).toBeCloseTo(0.37 * 0.55, 12);
    expect(low?.appearance).toMatchObject({
      fill: 'none',
      fillOpacity: null,
    });
    expect(JSON.stringify(state.project.layouts[0]?.pieces)).toBe(before);

    state.preferences.showPieceFills = false;
    const hidden = createPieceCanvasProjection(state);
    expect(
      hidden.pieces.every(
        (piece) =>
          piece.appearance.fill === 'none' &&
          piece.appearance.fillOpacity === null,
      ),
    ).toBe(true);
  });

  it('round-trips precise geometry and both poses before rendering', () => {
    const state = applicationStateFromLegacyPayload(legacyPayload('slab'));
    const before = createPieceCanvasProjection(state);
    const file = cadLiteFileFromApplicationState(state);
    const restored = applicationStateFromCadLiteFile(
      deserializeCadLiteFile(serializeCadLiteFile(file)),
    );
    const after = createPieceCanvasProjection(restored);

    expect(after).toEqual(before);
    const piece = after.pieces.find((item) => item.id === 'high');
    expect(piece?.geometry.width).toBe(81.997123);
    expect(piece?.geometry.cornerRadii.tl).toBe(3.12555);
    expect(piece?.pose.x).toBe(4.1234567);
    expect(piece?.pose.rotation).toBe(91.234567);
  });

  it('grows a fresh SLAB projection for rotated Piece bounds without changing the Layout', () => {
    const state = applicationStateFromLegacyPayload(legacyPayload('slab'));
    const layout = state.project.layouts[0];
    if (!layout) throw new Error('Missing Layout fixture');
    delete layout.extra.slabCW;
    delete layout.extra.slabCH;
    const high = layout.pieces.find((piece) => piece.id === 'high');
    if (!high) throw new Error('Missing Piece fixture');
    high.slabPlacement = { x: 149.75, y: 89.5, rotation: 45.125 };

    const before = JSON.stringify(layout);
    const projection = createPieceCanvasProjection(state);
    const rendered = projection.pieces.find((piece) => piece.id === 'high');
    if (!rendered) throw new Error('Missing projected Piece');

    expect(projection.canvas.width).toBeCloseTo(
      rendered.bounds.x + rendered.bounds.w + 2,
      12,
    );
    expect(projection.canvas.height).toBeCloseTo(
      rendered.bounds.y + rendered.bounds.h + 2,
      12,
    );
    expect(JSON.stringify(layout)).toBe(before);
  });
});
