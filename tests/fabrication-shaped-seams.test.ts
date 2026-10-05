import { describe, expect, it } from 'vitest';

import type { Layout } from '../src/domain/project';
import {
  createPiece,
  createPieceFabricationShape,
  pieceFabricationOutline,
  pieceShapeModifiers,
  prepareFabricationMerge,
  prepareFabricationSplit,
} from '../src/domain/pieces';
import type { PieceFabricationPoint } from '../src/domain/pieces';

function layout(): Layout {
  return {
    id: 'layout',
    name: 'Kitchen',
    quantity: 1,
    cw: 180,
    ch: 100,
    scale: 8,
    grid: 1,
    showGrid: true,
    pieceFillOpacity: 1,
    areas: [{ id: 'area', name: 'Kitchen' }],
    activeAreaId: 'area',
    pieces: [],
    dims: [],
    notes: [],
    lines: [],
    roomFeatures: [],
    plan: null,
    overlays: [],
    extra: {},
  };
}

function ids(prefix = 'shape') {
  let index = 0;
  return (kind: string): string => `${prefix}-${kind}-${++index}`;
}

function polygonArea(points: readonly PieceFabricationPoint[]): number {
  let sum = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    if (next) sum += point.x * next.y - next.x * point.y;
  });
  return Math.abs(sum) / 2;
}

function hasPoint(
  points: readonly PieceFabricationPoint[],
  x: number,
  y: number,
): boolean {
  return points.some(
    (point) => Math.abs(point.x - x) < 0.001 && Math.abs(point.y - y) < 0.001,
  );
}

function shapedLayout(): Layout {
  const next = layout();
  const piece = createPiece(next, 'piece', { name: 'Countertop', areaId: 'area' });
  piece.x = 10;
  piece.y = 10;
  piece.w = 60;
  piece.h = 30;
  piece.slabPlacement = { x: 10, y: 10, rotation: 0 };

  const outer: PieceFabricationPoint[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 6 },
    { x: 50, y: 6 },
    { x: 50, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 30 },
    { x: 0, y: 30 },
  ];
  piece.fabricationShape = createPieceFabricationShape(outer, piece.w, piece.h);
  piece.pieceSeams = [
    { id: 'cut', orientation: 'vertical', reference: 'left', offset: 30 },
  ];
  piece.legacy.fabricationRecipeV1 = {
    version: 1,
    frameWidth: 60,
    frameHeight: 30,
    baseOuter: [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 30 },
      { x: 0, y: 30 },
    ],
    modifiers: [
      {
        id: 'notch',
        kind: 'rectangle',
        operation: 'subtract',
        x: 10,
        y: 0,
        w: 40,
        h: 6,
      },
    ],
  };
  next.pieces = [piece];
  return next;
}

describe('shaped fabrication seams', () => {
  it('clips the true Piece perimeter instead of scaling the whole outline into each child', () => {
    const sourceLayout = shapedLayout();
    const source = sourceLayout.pieces[0]!;
    const sourceArea = polygonArea(pieceFabricationOutline(source));

    const result = prepareFabricationSplit(sourceLayout, 'piece', 'cut', ids());
    if (!result.ok) throw new Error(result.reason);

    const children = result.plan.pieces.filter((piece) => piece.id !== source.id);
    expect(children).toHaveLength(2);
    const left = children.find((piece) => piece.x < 30);
    const right = children.find((piece) => piece.x >= 30);
    if (!left || !right) throw new Error('Missing shaped seam children');

    const leftOutline = pieceFabricationOutline(left);
    const rightOutline = pieceFabricationOutline(right);

    expect(hasPoint(leftOutline, 30, 6)).toBe(true);
    expect(hasPoint(leftOutline, 30, 0)).toBe(false);
    expect(hasPoint(rightOutline, 0, 6)).toBe(true);
    expect(hasPoint(rightOutline, 0, 0)).toBe(false);
    expect(polygonArea(leftOutline) + polygonArea(rightOutline)).toBeCloseTo(sourceArea, 4);

    // A physical fabrication cut flattens each child to its actual stone shape;
    // the pre-cut authoring recipe is retained only as merge recovery metadata.
    expect(pieceShapeModifiers(left)).toEqual([]);
    expect(pieceShapeModifiers(right)).toEqual([]);
  });

  it('restores the original shaped perimeter and modifier recipe when the seam is merged back', () => {
    const sourceLayout = shapedLayout();
    const sourceOutline = pieceFabricationOutline(sourceLayout.pieces[0]!);
    const split = prepareFabricationSplit(sourceLayout, 'piece', 'cut', ids('split'));
    if (!split.ok) throw new Error(split.reason);

    const splitLayout: Layout = { ...sourceLayout, pieces: split.plan.pieces };
    const first = split.plan.pieces.find((piece) =>
      piece.assemblyLinks.some(
        (link) => link.kind === 'seam' && link.sourceSeamId === 'cut',
      ),
    );
    const linkId = first?.assemblyLinks.find(
      (link) => link.kind === 'seam' && link.sourceSeamId === 'cut',
    )?.id;
    if (!linkId) throw new Error('Missing fabrication seam link');

    const merged = prepareFabricationMerge(splitLayout, linkId, ids('merge'));
    if (!merged.ok) throw new Error(merged.reason);
    const countertop = merged.plan.pieces.find((piece) => piece.pieceType !== 'backsplash');
    if (!countertop) throw new Error('Missing merged countertop');

    expect(polygonArea(pieceFabricationOutline(countertop))).toBeCloseTo(
      polygonArea(sourceOutline),
      4,
    );
    expect(hasPoint(pieceFabricationOutline(countertop), 10, 6)).toBe(true);
    expect(hasPoint(pieceFabricationOutline(countertop), 50, 6)).toBe(true);
    expect(pieceShapeModifiers(countertop)).toMatchObject([
      { id: 'notch', operation: 'subtract', x: 10, y: 0, w: 40, h: 6 },
    ]);
  });
});
