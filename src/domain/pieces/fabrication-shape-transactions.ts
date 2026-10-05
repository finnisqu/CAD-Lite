import { round3 } from '../../core/numeric';
import type { Layout } from '../project/types';
import { isJsonObject, type JsonObject } from '../types';
import {
  prepareFabricationMerge as prepareLegacyFabricationMerge,
  prepareFabricationSplit as prepareLegacyFabricationSplit,
  type FabricationPreparationResult,
} from './fabrication';
import {
  createPieceFabricationShape,
  pieceFabricationOutline,
  pieceHasCustomFabricationShape,
} from './fabrication-shape';
import { isBacksplashPiece } from './relationships';
import { pieceSeamLocalCoordinate } from './seams';
import { pieceShapeRecipe } from './shape-modifiers';
import type { Piece, PieceFabricationPoint, PieceSide } from './types';

type IdFactory = (kind: string) => string;

const SHAPE_RECIPE_KEY = 'fabricationRecipeV1';
const SPLIT_SHAPE_SOURCE_KEY = 'fabricationSplitShapeSourceV1';
const EPSILON = 1e-7;

type SplitShapeSource = {
  version: 1;
  sourcePieceId: string;
  frameWidth: number;
  frameHeight: number;
  outer: PieceFabricationPoint[];
  recipe: JsonObject | null;
};

function axisValue(point: PieceFabricationPoint, vertical: boolean): number {
  return vertical ? point.x : point.y;
}

function samePoint(
  a: PieceFabricationPoint,
  b: PieceFabricationPoint,
): boolean {
  return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;
}

function uniquePoints(points: readonly PieceFabricationPoint[]): PieceFabricationPoint[] {
  const output: PieceFabricationPoint[] = [];
  points.forEach((point) => {
    if (!output.some((candidate) => samePoint(candidate, point))) {
      output.push({ x: round3(point.x), y: round3(point.y) });
    }
  });
  return output;
}

function seamIntersection(
  start: PieceFabricationPoint,
  end: PieceFabricationPoint,
  vertical: boolean,
  coordinate: number,
): PieceFabricationPoint {
  const startAxis = axisValue(start, vertical);
  const endAxis = axisValue(end, vertical);
  const denominator = endAxis - startAxis;
  if (Math.abs(denominator) <= EPSILON) {
    return vertical
      ? { x: coordinate, y: start.y }
      : { x: start.x, y: coordinate };
  }
  const t = (coordinate - startAxis) / denominator;
  return vertical
    ? {
        x: round3(coordinate),
        y: round3(start.y + (end.y - start.y) * t),
      }
    : {
        x: round3(start.x + (end.x - start.x) * t),
        y: round3(coordinate),
      };
}

function seamBoundaryIntersections(
  outline: readonly PieceFabricationPoint[],
  vertical: boolean,
  coordinate: number,
): PieceFabricationPoint[] {
  const hits: PieceFabricationPoint[] = [];
  outline.forEach((start, index) => {
    const end = outline[(index + 1) % outline.length];
    if (!end) return;
    const a = axisValue(start, vertical) - coordinate;
    const b = axisValue(end, vertical) - coordinate;
    const aOn = Math.abs(a) <= EPSILON;
    const bOn = Math.abs(b) <= EPSILON;

    if (aOn) hits.push(start);
    if (aOn && bOn) {
      hits.push(end);
      return;
    }
    if ((a < -EPSILON && b > EPSILON) || (a > EPSILON && b < -EPSILON)) {
      hits.push(seamIntersection(start, end, vertical, coordinate));
    }
  });
  return uniquePoints(hits);
}

function compactOutline(
  points: readonly PieceFabricationPoint[],
): PieceFabricationPoint[] {
  const output: PieceFabricationPoint[] = [];
  points.forEach((point) => {
    const next = { x: round3(point.x), y: round3(point.y) };
    if (!output.length || !samePoint(output[output.length - 1]!, next)) {
      output.push(next);
    }
  });
  if (output.length > 1 && samePoint(output[0]!, output[output.length - 1]!)) {
    output.pop();
  }
  return output;
}

function clipOutlineToHalfPlane(
  outline: readonly PieceFabricationPoint[],
  vertical: boolean,
  coordinate: number,
  keepLowSide: boolean,
): PieceFabricationPoint[] {
  if (outline.length < 3) return [];
  const inside = (point: PieceFabricationPoint): boolean => {
    const value = axisValue(point, vertical);
    return keepLowSide
      ? value <= coordinate + EPSILON
      : value >= coordinate - EPSILON;
  };

  const output: PieceFabricationPoint[] = [];
  let previous = outline[outline.length - 1]!;
  let previousInside = inside(previous);

  outline.forEach((current) => {
    const currentInside = inside(current);
    if (currentInside) {
      if (!previousInside) {
        output.push(seamIntersection(previous, current, vertical, coordinate));
      }
      output.push({ ...current });
    } else if (previousInside) {
      output.push(seamIntersection(previous, current, vertical, coordinate));
    }
    previous = current;
    previousInside = currentInside;
  });

  return compactOutline(output);
}

function shiftedHighSideOutline(
  outline: readonly PieceFabricationPoint[],
  vertical: boolean,
  coordinate: number,
): PieceFabricationPoint[] {
  return outline.map((point) =>
    vertical
      ? { x: round3(point.x - coordinate), y: round3(point.y) }
      : { x: round3(point.x), y: round3(point.y - coordinate) },
  );
}

function splitSourceJson(source: Piece, outline: PieceFabricationPoint[]): JsonObject {
  const rawRecipe = source.legacy[SHAPE_RECIPE_KEY];
  return {
    version: 1,
    sourcePieceId: source.id,
    frameWidth: round3(source.w),
    frameHeight: round3(source.h),
    outer: outline.map((point) => ({ x: round3(point.x), y: round3(point.y) })),
    recipe: isJsonObject(rawRecipe) ? structuredClone(rawRecipe) : null,
  };
}

function parseSplitSource(piece: Piece): SplitShapeSource | null {
  const raw = piece.legacy[SPLIT_SHAPE_SOURCE_KEY];
  if (!isJsonObject(raw) || raw.version !== 1) return null;
  const sourcePieceId = typeof raw.sourcePieceId === 'string' ? raw.sourcePieceId : '';
  const frameWidth = Number(raw.frameWidth);
  const frameHeight = Number(raw.frameHeight);
  const outer = Array.isArray(raw.outer)
    ? raw.outer.flatMap((entry) => {
        if (!isJsonObject(entry)) return [];
        const x = Number(entry.x);
        const y = Number(entry.y);
        return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
      })
    : [];
  if (
    !sourcePieceId ||
    !Number.isFinite(frameWidth) ||
    frameWidth <= 0 ||
    !Number.isFinite(frameHeight) ||
    frameHeight <= 0 ||
    outer.length < 3
  ) {
    return null;
  }
  return {
    version: 1,
    sourcePieceId,
    frameWidth,
    frameHeight,
    outer,
    recipe: isJsonObject(raw.recipe) ? structuredClone(raw.recipe) : null,
  };
}

function seamSide(piece: Piece, seamId: string): PieceSide | null {
  const link = piece.assemblyLinks.find(
    (candidate) => candidate.kind === 'seam' && candidate.sourceSeamId === seamId,
  );
  const side = link?.side;
  return side === 'top' || side === 'right' || side === 'bottom' || side === 'left'
    ? side
    : null;
}

function withSplitShapeMetadata(
  piece: Piece,
  shape: NonNullable<Piece['fabricationShape']>,
  sourceMetadata: JsonObject,
): Piece {
  const legacy = { ...piece.legacy };
  delete legacy[SHAPE_RECIPE_KEY];
  legacy[SPLIT_SHAPE_SOURCE_KEY] = structuredClone(sourceMetadata);
  return {
    ...piece,
    fabricationShape: shape,
    legacy,
  };
}

function shapedSource(piece: Piece): boolean {
  return pieceHasCustomFabricationShape(piece) || pieceShapeRecipe(piece) !== null;
}

/**
 * Geometry-aware fabrication split. The mature fabrication transaction still
 * owns child metadata, semantic sink/cutout splitting, links, splashes, and
 * poses; this wrapper replaces only the rectangle-era assumption about the
 * child stone perimeter.
 */
export function prepareFabricationSplit(
  layout: Layout,
  pieceId: string,
  seamId: string,
  createId: IdFactory,
): FabricationPreparationResult {
  const source = layout.pieces.find((piece) => piece.id === pieceId);
  if (!source || !shapedSource(source)) {
    return prepareLegacyFabricationSplit(layout, pieceId, seamId, createId);
  }
  const seam = source.pieceSeams.find((candidate) => candidate.id === seamId);
  if (!seam) return prepareLegacyFabricationSplit(layout, pieceId, seamId, createId);

  const outline = pieceFabricationOutline(source);
  const vertical = seam.orientation === 'vertical';
  const coordinate = pieceSeamLocalCoordinate(source, seam);
  const intersections = seamBoundaryIntersections(outline, vertical, coordinate);
  if (intersections.length !== 2) {
    return {
      ok: false,
      reason:
        intersections.length < 2
          ? 'This seam does not cross the shaped Piece in two places.'
          : 'This seam crosses the shaped Piece perimeter more than twice. Use a simpler fabrication cut for now.',
    };
  }

  const lowOutline = clipOutlineToHalfPlane(outline, vertical, coordinate, true);
  const highOutline = shiftedHighSideOutline(
    clipOutlineToHalfPlane(outline, vertical, coordinate, false),
    vertical,
    coordinate,
  );

  const legacy = prepareLegacyFabricationSplit(layout, pieceId, seamId, createId);
  if (!legacy.ok) return legacy;

  const originalIds = new Set(layout.pieces.map((piece) => piece.id));
  const splitChildren = legacy.plan.pieces.filter(
    (piece) =>
      !originalIds.has(piece.id) &&
      !isBacksplashPiece(piece) &&
      seamSide(piece, seamId) !== null,
  );
  if (splitChildren.length !== 2) {
    return {
      ok: false,
      reason: 'CAD Lite could not identify both shaped fabrication children.',
    };
  }

  const lowSide: PieceSide = vertical ? 'right' : 'bottom';
  const highSide: PieceSide = vertical ? 'left' : 'top';
  const lowChild = splitChildren.find((piece) => seamSide(piece, seamId) === lowSide);
  const highChild = splitChildren.find((piece) => seamSide(piece, seamId) === highSide);
  if (!lowChild || !highChild) {
    return {
      ok: false,
      reason: 'CAD Lite could not orient the shaped fabrication children.',
    };
  }

  const lowShape = createPieceFabricationShape(lowOutline, lowChild.w, lowChild.h);
  const highShape = createPieceFabricationShape(highOutline, highChild.w, highChild.h);
  if (!lowShape || !highShape) {
    return {
      ok: false,
      reason: 'This seam would create invalid shaped fabrication geometry.',
    };
  }

  const sourceMetadata = splitSourceJson(source, outline);
  const replacements = new Map<string, Piece>([
    [lowChild.id, withSplitShapeMetadata(lowChild, lowShape, sourceMetadata)],
    [highChild.id, withSplitShapeMetadata(highChild, highShape, sourceMetadata)],
  ]);

  return {
    ok: true,
    plan: {
      ...legacy.plan,
      pieces: legacy.plan.pieces.map((piece) => replacements.get(piece.id) ?? piece),
    },
  };
}

/**
 * Restore the exact pre-split authoring perimeter/recipe when two shaped
 * fabrication children are merged back across the seam that created them.
 */
export function prepareFabricationMerge(
  layout: Layout,
  linkId: string,
  createId: IdFactory,
): FabricationPreparationResult {
  const pair = layout.pieces.filter((piece) =>
    piece.assemblyLinks.some(
      (link) => link.kind === 'seam' && link.id === linkId,
    ),
  );
  const firstSource = pair[0] ? parseSplitSource(pair[0]) : null;
  const secondSource = pair[1] ? parseSplitSource(pair[1]) : null;
  const restorable =
    pair.length === 2 &&
    firstSource !== null &&
    secondSource !== null &&
    firstSource.sourcePieceId === secondSource.sourcePieceId &&
    JSON.stringify(firstSource.outer) === JSON.stringify(secondSource.outer);

  const legacy = prepareLegacyFabricationMerge(layout, linkId, createId);
  if (!legacy.ok || !restorable || !firstSource) return legacy;

  const originalIds = new Set(layout.pieces.map((piece) => piece.id));
  const merged = legacy.plan.pieces.find(
    (piece) => !originalIds.has(piece.id) && !isBacksplashPiece(piece),
  );
  if (!merged) return legacy;

  const sx = merged.w / firstSource.frameWidth;
  const sy = merged.h / firstSource.frameHeight;
  const restoredOuter = firstSource.outer.map((point) => ({
    x: round3(point.x * sx),
    y: round3(point.y * sy),
  }));
  const restoredShape = createPieceFabricationShape(restoredOuter, merged.w, merged.h);
  if (!restoredShape) return legacy;

  const restoredLegacy = { ...merged.legacy };
  delete restoredLegacy[SPLIT_SHAPE_SOURCE_KEY];
  if (firstSource.recipe) {
    restoredLegacy[SHAPE_RECIPE_KEY] = structuredClone(firstSource.recipe);
  } else {
    delete restoredLegacy[SHAPE_RECIPE_KEY];
  }
  const restoredMerged: Piece = {
    ...merged,
    fabricationShape: restoredShape,
    legacy: restoredLegacy,
  };

  return {
    ok: true,
    plan: {
      ...legacy.plan,
      pieces: legacy.plan.pieces.map((piece) =>
        piece.id === merged.id ? restoredMerged : piece,
      ),
    },
  };
}
