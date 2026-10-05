import { clamp, round3 } from '../../core/numeric';
import {
  createPieceFabricationShape,
  createPieceShapeRecipe,
  isBacksplashPiece,
  pieceGeometry,
  piecePose,
  pieceSeamLocalCoordinate,
  pieceShapeRecipe,
  pieceSinkLocalPose,
  shiftedPieceShapeRecipe,
  withPieceShapeRecipe,
  type Piece,
  type PiecePose,
  type PieceSeam,
  type PieceShapeModifier,
  type PieceShapeModifierOperation,
  type PieceShapeRecipe,
} from '../../domain/pieces';
import type { Layout } from '../../domain/project';
import {
  geometryKernel,
  rotateVector,
  rotatedRectBoundingSize,
} from '../../geometry';
import type { ReadonlyApplicationState } from '../state';
import type { AppCommand } from './types';

export type PieceShapeRectangleOperation = PieceShapeModifierOperation;

export interface PieceShapeRectangle {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PieceShapeModifierPatch {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  operation?: PieceShapeModifierOperation;
}

export interface PreparedPieceShapeEdit {
  layoutId: string;
  pieceId: string;
  action: 'add' | 'subtract' | 'update' | 'delete';
  operation: PieceShapeRectangleOperation;
  modifierId: string | null;
  sourceSignature: string;
  piece: Piece;
}

export type PreparePieceShapeEditResult =
  | { ok: true; prepared: PreparedPieceShapeEdit }
  | { ok: false; reason: string };

const MIN_SHAPE_SPAN = 0.125;
const AREA_EPSILON = 0.0001;

function polygonArea(points: readonly { x: number; y: number }[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function normalizedRectangle(
  source: PieceShapeRectangle,
): PieceShapeRectangle | null {
  if (
    !Number.isFinite(source.x) ||
    !Number.isFinite(source.y) ||
    !Number.isFinite(source.w) ||
    !Number.isFinite(source.h)
  ) {
    return null;
  }

  const x = source.w >= 0 ? source.x : source.x + source.w;
  const y = source.h >= 0 ? source.y : source.y + source.h;
  const w = Math.abs(source.w);
  const h = Math.abs(source.h);
  if (w < MIN_SHAPE_SPAN || h < MIN_SHAPE_SPAN) return null;

  return { x: round3(x), y: round3(y), w: round3(w), h: round3(h) };
}

function rectangleOutline(rect: PieceShapeRectangle) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
}

function framePoseAfterShapeEdit(
  piece: Piece,
  pose: PiecePose,
  minX: number,
  minY: number,
  width: number,
  height: number,
): PiecePose {
  const geometry = pieceGeometry(piece);
  const oldBounds = rotatedRectBoundingSize({
    w: geometry.width,
    h: geometry.height,
    rotation: pose.rotation,
  });
  const oldCenter = {
    x: pose.x + oldBounds.w / 2,
    y: pose.y + oldBounds.h / 2,
  };
  const localShift = {
    x: minX + width / 2 - geometry.width / 2,
    y: minY + height / 2 - geometry.height / 2,
  };
  const worldShift = rotateVector(localShift.x, localShift.y, pose.rotation);
  const nextBounds = rotatedRectBoundingSize({
    w: width,
    h: height,
    rotation: pose.rotation,
  });

  return {
    x: round3(oldCenter.x + worldShift.x - nextBounds.w / 2),
    y: round3(oldCenter.y + worldShift.y - nextBounds.h / 2),
    rotation: round3(pose.rotation),
  };
}

function shiftedSeam(
  piece: Piece,
  seam: PieceSeam,
  minX: number,
  minY: number,
  width: number,
  height: number,
): PieceSeam {
  const coordinate = pieceSeamLocalCoordinate(piece, seam);
  if (seam.orientation === 'vertical') {
    const next = clamp(coordinate - minX, 0, width);
    return {
      ...seam,
      offset: round3(seam.reference === 'right' ? width - next : next),
    };
  }

  const next = clamp(coordinate - minY, 0, height);
  return {
    ...seam,
    offset: round3(seam.reference === 'bottom' ? height - next : next),
  };
}

function linkedShapeEditReason(layout: Layout, piece: Piece): string | null {
  if (isBacksplashPiece(piece) || piece.attachment) {
    return 'Linked splashes cannot be shape-edited in this first pass.';
  }
  if (piece.assemblyLinks.length > 0) {
    return 'Shape editing is disabled on seam-linked fabrication Pieces for now.';
  }
  if (
    layout.pieces.some(
      (candidate) => candidate.attachment?.parentPieceId === piece.id,
    )
  ) {
    return 'Remove or detach linked splashes before changing this Piece outline.';
  }
  return null;
}

export function pieceShapeEditEligibility(
  layout: Layout,
  piece: Piece,
): { ok: true } | { ok: false; reason: string } {
  const reason = linkedShapeEditReason(layout, piece);
  return reason ? { ok: false, reason } : { ok: true };
}

function nextModifierId(
  recipe: PieceShapeRecipe,
  operation: PieceShapeModifierOperation,
): string {
  const used = new Set(recipe.modifiers.map((item) => item.id));
  let index = recipe.modifiers.length + 1;
  let id = `shape-${operation}-${index}`;
  while (used.has(id)) {
    index += 1;
    id = `shape-${operation}-${index}`;
  }
  return id;
}

async function replayShapeRecipe(
  recipe: PieceShapeRecipe,
): Promise<{ ok: true; outer: { x: number; y: number }[] } | { ok: false; reason: string }> {
  let outer = recipe.baseOuter.map((point) => ({ ...point }));
  if (outer.length < 3) {
    return { ok: false, reason: 'The Piece shape recipe has an invalid base outline.' };
  }

  for (const modifier of recipe.modifiers) {
    const rectangle = normalizedRectangle(modifier);
    if (!rectangle) {
      return { ok: false, reason: 'A Piece shape modifier is too small or invalid.' };
    }
    const regions = await geometryKernel.polygonBoolean(
      [outer],
      [rectangleOutline(rectangle)],
      modifier.operation === 'add' ? 'union' : 'difference',
    );
    if (regions.length === 0) {
      return {
        ok: false,
        reason: modifier.operation === 'subtract'
          ? 'That subtraction would erase the entire Piece.'
          : 'An ADD modifier must touch or overlap the Piece.',
      };
    }
    if (regions.length > 1) {
      return {
        ok: false,
        reason: modifier.operation === 'add'
          ? 'An ADD modifier must touch or overlap the Piece.'
          : 'That subtraction would split the Piece into separate islands.',
      };
    }
    const region = regions[0];
    if (!region || region.outer.length < 3) {
      return { ok: false, reason: 'The shape modifier produced invalid geometry.' };
    }
    if (region.holes.length > 0) {
      return {
        ok: false,
        reason: 'SUBTRACT must open to the perimeter. Use a Cutout for an interior opening.',
      };
    }
    outer = region.outer.map((point) => ({ x: round3(point.x), y: round3(point.y) }));
  }

  return { ok: true, outer };
}

async function prepareRecipeChange(
  layout: Layout,
  piece: Piece,
  recipe: PieceShapeRecipe,
  action: PreparedPieceShapeEdit['action'],
  operation: PieceShapeRectangleOperation,
  modifierId: string | null,
): Promise<PreparePieceShapeEditResult> {
  const eligibility = pieceShapeEditEligibility(layout, piece);
  if (!eligibility.ok) return eligibility;

  const replayed = await replayShapeRecipe(recipe);
  if (!replayed.ok) return replayed;
  const finalOuter = replayed.outer;
  const minX = Math.min(...finalOuter.map((point) => point.x));
  const minY = Math.min(...finalOuter.map((point) => point.y));
  const maxX = Math.max(...finalOuter.map((point) => point.x));
  const maxY = Math.max(...finalOuter.map((point) => point.y));
  const width = round3(maxX - minX);
  const height = round3(maxY - minY);
  if (width < 0.25 || height < 0.25) {
    return { ok: false, reason: 'The resulting Piece is too small.' };
  }

  const outer = finalOuter.map((point) => ({
    x: round3(point.x - minX),
    y: round3(point.y - minY),
  }));
  const fabricationShape = createPieceFabricationShape(outer, width, height);
  if (!fabricationShape) {
    return { ok: false, reason: 'The resulting Piece outline is invalid.' };
  }

  const normalizedRecipe = shiftedPieceShapeRecipe(
    recipe,
    -minX,
    -minY,
    width,
    height,
  );
  const radiusMaximum = Math.min(width, height) / 2;
  const radius = (value: number) => round3(clamp(value, 0, radiusMaximum));
  const sinks = piece.sinks.map((sink) => {
    const pose = pieceSinkLocalPose(piece, sink);
    return {
      ...sink,
      fabricationPose: {
        cx: round3(pose.cx - minX),
        cy: round3(pose.cy - minY),
      },
    };
  });
  const cutouts = piece.cutouts.map((cutout) => ({
    ...cutout,
    cx: round3(cutout.cx - minX),
    cy: round3(cutout.cy - minY),
  }));
  const pieceSeams = piece.pieceSeams.map((seam) =>
    shiftedSeam(piece, seam, minX, minY, width, height));
  const designPose = framePoseAfterShapeEdit(
    piece,
    piecePose(piece, 'design'),
    minX,
    minY,
    width,
    height,
  );
  const slabPose = framePoseAfterShapeEdit(
    piece,
    piecePose(piece, 'slab'),
    minX,
    minY,
    width,
    height,
  );

  const nextPiece = withPieceShapeRecipe(
    {
      ...piece,
      x: designPose.x,
      y: designPose.y,
      rotation: designPose.rotation,
      w: width,
      h: height,
      slabPlacement: slabPose,
      fabricationShape,
      cornerRadii: {
        tl: radius(piece.cornerRadii.tl),
        tr: radius(piece.cornerRadii.tr),
        br: radius(piece.cornerRadii.br),
        bl: radius(piece.cornerRadii.bl),
      },
      sinks,
      cutouts,
      pieceSeams,
    },
    normalizedRecipe,
  );

  return {
    ok: true,
    prepared: {
      layoutId: layout.id,
      pieceId: piece.id,
      action,
      operation,
      modifierId,
      sourceSignature: JSON.stringify(piece),
      piece: nextPiece,
    },
  };
}

export async function preparePieceRectangleShapeEdit(
  layout: Layout,
  pieceId: string,
  rectangle: PieceShapeRectangle,
  operation: PieceShapeRectangleOperation,
  requestedModifierId?: string,
): Promise<PreparePieceShapeEditResult> {
  const piece = layout.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) return { ok: false, reason: 'The selected Piece no longer exists.' };

  const rect = normalizedRectangle(rectangle);
  if (!rect) {
    return { ok: false, reason: 'Drag a rectangle at least 1/8" wide and tall.' };
  }

  const recipe = createPieceShapeRecipe(piece);
  const currentArea = polygonArea(piece.fabricationShape?.outer ?? recipe.baseOuter);
  const modifierId = requestedModifierId?.trim() || nextModifierId(recipe, operation);
  if (recipe.modifiers.some((item) => item.id === modifierId)) {
    return { ok: false, reason: 'That Piece shape modifier id already exists.' };
  }
  const nextRecipe: PieceShapeRecipe = {
    ...recipe,
    modifiers: [
      ...recipe.modifiers,
      {
        id: modifierId,
        kind: 'rectangle',
        operation,
        ...rect,
      },
    ],
  };
  const prepared = await prepareRecipeChange(
    layout,
    piece,
    nextRecipe,
    operation,
    operation,
    modifierId,
  );
  if (!prepared.ok) return prepared;

  const resultArea = polygonArea(prepared.prepared.piece.fabricationShape?.outer ?? []);
  if (Math.abs(resultArea - currentArea) <= AREA_EPSILON) {
    return {
      ok: false,
      reason: operation === 'add'
        ? 'That rectangle is already inside the Piece.'
        : 'That rectangle does not remove any Piece area.',
    };
  }
  return prepared;
}

export async function preparePieceShapeModifierUpdate(
  layout: Layout,
  pieceId: string,
  modifierId: string,
  patch: PieceShapeModifierPatch,
): Promise<PreparePieceShapeEditResult> {
  const piece = layout.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) return { ok: false, reason: 'The selected Piece no longer exists.' };
  const recipe = pieceShapeRecipe(piece);
  if (!recipe) return { ok: false, reason: 'This Piece has no editable shape modifiers yet.' };
  const current = recipe.modifiers.find((item) => item.id === modifierId);
  if (!current) return { ok: false, reason: 'That shape modifier no longer exists.' };
  const candidate: PieceShapeModifier = {
    ...current,
    ...(patch.operation ? { operation: patch.operation } : {}),
    ...(patch.x !== undefined ? { x: patch.x } : {}),
    ...(patch.y !== undefined ? { y: patch.y } : {}),
    ...(patch.w !== undefined ? { w: patch.w } : {}),
    ...(patch.h !== undefined ? { h: patch.h } : {}),
  };
  const rect = normalizedRectangle(candidate);
  if (!rect) return { ok: false, reason: 'Shape modifiers must be at least 1/8" wide and tall.' };
  const nextModifier: PieceShapeModifier = { ...candidate, ...rect };
  const nextRecipe = {
    ...recipe,
    modifiers: recipe.modifiers.map((item) =>
      item.id === modifierId ? nextModifier : item),
  };
  return prepareRecipeChange(
    layout,
    piece,
    nextRecipe,
    'update',
    nextModifier.operation,
    modifierId,
  );
}

export async function preparePieceShapeModifierDelete(
  layout: Layout,
  pieceId: string,
  modifierId: string,
): Promise<PreparePieceShapeEditResult> {
  const piece = layout.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) return { ok: false, reason: 'The selected Piece no longer exists.' };
  const recipe = pieceShapeRecipe(piece);
  if (!recipe) return { ok: false, reason: 'This Piece has no editable shape modifiers yet.' };
  const current = recipe.modifiers.find((item) => item.id === modifierId);
  if (!current) return { ok: false, reason: 'That shape modifier no longer exists.' };
  const nextRecipe = {
    ...recipe,
    modifiers: recipe.modifiers.filter((item) => item.id !== modifierId),
  };
  return prepareRecipeChange(
    layout,
    piece,
    nextRecipe,
    'delete',
    current.operation,
    modifierId,
  );
}

export function applyPreparedPieceShapeEdit(
  prepared: PreparedPieceShapeEdit,
): AppCommand {
  const snapshot: PreparedPieceShapeEdit = JSON.parse(
    JSON.stringify(prepared),
  ) as PreparedPieceShapeEdit;
  const labels: Record<PreparedPieceShapeEdit['action'], string> = {
    add: 'Add Piece shape',
    subtract: 'Subtract Piece shape',
    update: 'Edit Piece shape',
    delete: 'Delete Piece shape modifier',
  };

  return {
    type: 'piece.shape-edit',
    label: labels[snapshot.action],
    history: 'record',
    persistence: 'save',
    reduce(state: ReadonlyApplicationState) {
      const layout = state.project.layouts.find(
        (candidate) => candidate.id === snapshot.layoutId,
      );
      const current = layout?.pieces.find(
        (candidate) => candidate.id === snapshot.pieceId,
      );
      if (!layout || !current) return state;
      if (JSON.stringify(current) !== snapshot.sourceSignature) return state;

      const nextLayout = {
        ...layout,
        pieces: layout.pieces.map((piece) =>
          piece.id === snapshot.pieceId ? snapshot.piece : piece),
      };
      return {
        ...state,
        project: {
          ...state.project,
          layouts: state.project.layouts.map((candidate) =>
            candidate.id === nextLayout.id ? nextLayout : candidate),
        },
      };
    },
  };
}
