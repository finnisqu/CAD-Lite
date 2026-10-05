import { round3 } from '../../core/numeric';
import { isJsonObject, type JsonObject } from '../types';
import { pieceFabricationOutline } from './fabrication-shape';
import type { Piece, PieceFabricationPoint } from './types';

export type PieceShapeModifierOperation = 'add' | 'subtract';

export interface PieceShapeModifier {
  id: string;
  kind: 'rectangle';
  operation: PieceShapeModifierOperation;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PieceShapeRecipe {
  version: 1;
  frameWidth: number;
  frameHeight: number;
  baseOuter: PieceFabricationPoint[];
  modifiers: PieceShapeModifier[];
}

const RECIPE_KEY = 'fabricationRecipeV1';

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positive(value: unknown): number | null {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

function points(raw: unknown): PieceFabricationPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    if (!isJsonObject(value)) return [];
    const x = finite(value.x);
    const y = finite(value.y);
    return x === null || y === null ? [] : [{ x, y }];
  });
}

function modifier(raw: unknown): PieceShapeModifier | null {
  if (!isJsonObject(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const operation = raw.operation === 'subtract' ? 'subtract' : raw.operation === 'add' ? 'add' : null;
  const x = finite(raw.x);
  const y = finite(raw.y);
  const w = positive(raw.w);
  const h = positive(raw.h);
  if (!id || !operation || x === null || y === null || w === null || h === null) {
    return null;
  }
  return {
    id,
    kind: 'rectangle',
    operation,
    x: round3(x),
    y: round3(y),
    w: round3(w),
    h: round3(h),
  };
}

function parseRecipe(piece: Piece): PieceShapeRecipe | null {
  const raw = piece.legacy[RECIPE_KEY];
  if (!isJsonObject(raw) || raw.version !== 1) return null;
  const frameWidth = positive(raw.frameWidth);
  const frameHeight = positive(raw.frameHeight);
  const baseOuter = points(raw.baseOuter);
  const modifiers = Array.isArray(raw.modifiers)
    ? raw.modifiers.map(modifier).filter((value): value is PieceShapeModifier => value !== null)
    : [];
  if (!frameWidth || !frameHeight || baseOuter.length < 3) return null;
  return { version: 1, frameWidth, frameHeight, baseOuter, modifiers };
}

/**
 * Returns the persisted authoring recipe scaled into the Piece's current
 * editing frame. This keeps the mature width/height resize workflow compatible
 * with editable shape modifiers.
 */
export function pieceShapeRecipe(piece: Piece): PieceShapeRecipe | null {
  const recipe = parseRecipe(piece);
  if (!recipe) return null;
  const sx = piece.w / recipe.frameWidth;
  const sy = piece.h / recipe.frameHeight;
  return {
    version: 1,
    frameWidth: piece.w,
    frameHeight: piece.h,
    baseOuter: recipe.baseOuter.map((point) => ({
      x: round3(point.x * sx),
      y: round3(point.y * sy),
    })),
    modifiers: recipe.modifiers.map((item) => ({
      ...item,
      x: round3(item.x * sx),
      y: round3(item.y * sy),
      w: round3(item.w * sx),
      h: round3(item.h * sy),
    })),
  };
}

/**
 * Existing experimental polygon Pieces are promoted safely: their current
 * flattened outline becomes the immutable recipe base, and only edits created
 * from this point forward become individually editable modifiers.
 */
export function createPieceShapeRecipe(piece: Piece): PieceShapeRecipe {
  return pieceShapeRecipe(piece) ?? {
    version: 1,
    frameWidth: piece.w,
    frameHeight: piece.h,
    baseOuter: pieceFabricationOutline(piece).map((point) => ({ ...point })),
    modifiers: [],
  };
}

export function pieceShapeModifiers(piece: Piece): PieceShapeModifier[] {
  return pieceShapeRecipe(piece)?.modifiers ?? [];
}

export function shiftedPieceShapeRecipe(
  recipe: PieceShapeRecipe,
  dx: number,
  dy: number,
  width: number,
  height: number,
): PieceShapeRecipe {
  return {
    version: 1,
    frameWidth: round3(width),
    frameHeight: round3(height),
    baseOuter: recipe.baseOuter.map((point) => ({
      x: round3(point.x + dx),
      y: round3(point.y + dy),
    })),
    modifiers: recipe.modifiers.map((item) => ({
      ...item,
      x: round3(item.x + dx),
      y: round3(item.y + dy),
    })),
  };
}

/** Mirror the persistent construction recipe in the Piece-local frame. */
export function mirrorPieceShapeRecipe(
  piece: Piece,
  axis: 'h' | 'v',
): PieceShapeRecipe | null {
  const recipe = pieceShapeRecipe(piece);
  if (!recipe) return null;
  const width = piece.w;
  const height = piece.h;
  const baseOuter = recipe.baseOuter
    .map((point) =>
      axis === 'h'
        ? { x: round3(width - point.x), y: round3(point.y) }
        : { x: round3(point.x), y: round3(height - point.y) })
    .reverse();
  const modifiers = recipe.modifiers.map((item) => ({
    ...item,
    x: axis === 'h' ? round3(width - item.x - item.w) : item.x,
    y: axis === 'v' ? round3(height - item.y - item.h) : item.y,
  }));
  return {
    version: 1,
    frameWidth: width,
    frameHeight: height,
    baseOuter,
    modifiers,
  };
}

function recipeJson(recipe: PieceShapeRecipe): JsonObject {
  return {
    version: 1,
    frameWidth: round3(recipe.frameWidth),
    frameHeight: round3(recipe.frameHeight),
    baseOuter: recipe.baseOuter.map((point) => ({
      x: round3(point.x),
      y: round3(point.y),
    })),
    modifiers: recipe.modifiers.map((item) => ({
      id: item.id,
      kind: 'rectangle',
      operation: item.operation,
      x: round3(item.x),
      y: round3(item.y),
      w: round3(item.w),
      h: round3(item.h),
    })),
  };
}

export function withPieceShapeRecipe(
  piece: Piece,
  recipe: PieceShapeRecipe,
): Piece {
  return {
    ...piece,
    legacy: {
      ...piece.legacy,
      [RECIPE_KEY]: recipeJson(recipe),
    },
  };
}
