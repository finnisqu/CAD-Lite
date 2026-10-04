import { clamp, round3 } from '../../core/numeric';
import {
  fabricationAssemblyIds,
  isBacksplashPiece,
  nudgePieceGroup,
  pieceGeometry,
  pieceGroupMembers,
  piecePose,
  piecePoseBounds,
  pieceProjectedSpan,
  pieceRotationFamilyIds,
  pieceTransformGroupCenter,
  pieceWorkspaceCanvasSize,
  rotatePieceGroup,
  resizePieceGeometry,
  type Piece,
  type PieceGeometry,
  type PiecePose,
  type PieceSide,
} from '../../domain/pieces';
import type { Layout } from '../../domain/project';
import { slabUsableBounds } from '../../domain/slabs';
import type { JsonObject, JsonValue } from '../../domain/types';
import {
  pointAngleDegrees,
  resolveSmartSnapAxes,
  rotateVector,
  signedAngleDeltaDegrees,
  SMART_SNAP_PRIORITY,
  SMART_SNAP_TOLERANCE,
  smartSnapAxisPairs,
  smartSnapBetter,
  smartSnapBoxAnchors,
  smartSnapGridAxis,
  snapAngleToIncrement,
  type SmartSnapCandidate,
} from '../../geometry';
import type { Workspace } from '../../persistence';
import {
  transformPieces,
  type PieceTransformPatch,
} from '../commands/pieces';
import {
  replaceInteractionState,
  setSelection,
} from '../commands/session';
import type { CommandDispatcher } from '../commands/dispatcher';
import type {
  ReadonlyApplicationState,
  Selection,
} from '../state';
import type { AppStore } from '../store';
import type {
  InteractionState,
  ToolPointerInput,
} from './types';

export type PieceResizeSide = PieceSide;

export interface PiecePointerSelectionPlan {
  selection: Selection;
  drillInId: string | null;
}

export interface PieceInteractionPreviewItem {
  id: string;
  pose: PiecePose;
  geometry?: PieceGeometry;
}

export interface PieceInteractionPreview {
  kind: 'move' | 'resize' | 'rotate' | 'nudge';
  layoutId: string;
  workspace: Workspace;
  pieces: PieceInteractionPreviewItem[];
  guideX: number | null;
  guideY: number | null;
}

interface MoveSessionItem {
  id: string;
  pose: PiecePose;
  bounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  boundOnly: boolean;
}

interface MoveSession {
  kind: 'move';
  layoutId: string;
  workspace: Workspace;
  pointerId: number;
  start: { x: number; y: number };
  scale: number;
  moved: boolean;
  clickedId: string;
  drillInId: string | null;
  anchorId: string;
  items: MoveSessionItem[];
  limits: {
    dxMin: number;
    dxMax: number;
    dyMin: number;
    dyMax: number;
  };
  preview: PieceInteractionPreview | null;
}

interface ResizeSession {
  kind: 'resize';
  layoutId: string;
  workspace: 'design';
  pointerId: number;
  start: { x: number; y: number };
  scale: number;
  moved: boolean;
  pieceId: string;
  side: PieceResizeSide;
  geometry: PieceGeometry;
  pose: PiecePose;
  center: { x: number; y: number };
  u: { x: number; y: number };
  v: { x: number; y: number };
  preview: PieceInteractionPreview | null;
}

interface RotateSession {
  kind: 'rotate';
  layoutId: string;
  workspace: Workspace;
  pointerId: number;
  start: { x: number; y: number };
  scale: number;
  moved: boolean;
  ids: string[];
  center: { x: number; y: number };
  startPointer: number;
  startPrimaryRotation: number;
  preview: PieceInteractionPreview | null;
}

interface BlankSession {
  kind: 'blank';
  layoutId: string | null;
  workspace: Workspace;
  pointerId: number;
  start: { x: number; y: number };
  scale: number;
  moved: boolean;
}

interface NudgeSession {
  layoutId: string;
  workspace: Workspace;
  key: string;
  ids: string[];
  dx: number;
  dy: number;
  preview: PieceInteractionPreview | null;
}

type PiecePointerSession =
  | MoveSession
  | ResizeSession
  | RotateSession
  | BlankSession;

function activeLayout(
  state: ReadonlyApplicationState,
): Layout | null {
  return (
    state.project.layouts.find(
      (layout) => layout.id === state.session.activeLayoutId,
    ) ?? null
  );
}

function sameIdSet(
  ids: readonly string[],
  pieces: readonly Piece[],
): boolean {
  if (ids.length !== pieces.length) return false;
  const selected = new Set(ids);
  return pieces.every((piece) => selected.has(piece.id));
}

export function resolvePiecePointerSelection(
  layout: Layout,
  current: Selection,
  clickedId: string,
  workspace: Workspace,
  additive = false,
): PiecePointerSelectionPlan {
  const clicked = layout.pieces.find((piece) => piece.id === clickedId);
  if (!clicked) return { selection: { kind: 'none' }, drillInId: null };

  const currentIds =
    current.kind === 'pieces' ? current.ids : [];

  if (workspace === 'design' && !isBacksplashPiece(clicked)) {
    const fabrication = fabricationAssemblyIds(layout.pieces, clicked.id);
    if (fabrication.length > 1) {
      return {
        selection: { kind: 'pieces', ids: fabrication },
        drillInId: null,
      };
    }
  }

  if (additive) {
    const next = currentIds.includes(clicked.id)
      ? currentIds.filter((id) => id !== clicked.id)
      : [...currentIds, clicked.id];
    return {
      selection:
        next.length > 0
          ? { kind: 'pieces', ids: next }
          : { kind: 'none' },
      drillInId: null,
    };
  }

  if (
    workspace === 'design' &&
    !isBacksplashPiece(clicked) &&
    clicked.pieceGroupId
  ) {
    const group = pieceGroupMembers(layout.pieces, clicked.id);
    if (sameIdSet(currentIds, group)) {
      return {
        selection: { kind: 'pieces', ids: [...currentIds] },
        drillInId: clicked.id,
      };
    }

    return {
      selection: {
        kind: 'pieces',
        ids: group.map((piece) => piece.id),
      },
      drillInId: null,
    };
  }

  if (currentIds.includes(clicked.id)) {
    return {
      selection: { kind: 'pieces', ids: [...currentIds] },
      drillInId: null,
    };
  }

  return {
    selection: { kind: 'pieces', ids: [clicked.id] },
    drillInId: null,
  };
}

function linkedSplashMovesWithParent(
  piece: Piece,
  movingIds: ReadonlySet<string>,
): boolean {
  return Boolean(
    piece.attachment?.kind === 'backsplash' &&
      movingIds.has(piece.attachment.parentPieceId) &&
      piece.attachment.snapped !== false,
  );
}

function moveSessionItems(
  layout: Layout,
  selectionIds: readonly string[],
  workspace: Workspace,
): Array<{ piece: Piece; boundOnly: boolean }> {
  const explicitlySelected = new Set(selectionIds);
  const moving = new Set(selectionIds);

  if (workspace === 'design') {
    [...moving].forEach((id) => {
      fabricationAssemblyIds(layout.pieces, id).forEach((member) =>
        moving.add(member),
      );
    });

    let changed = true;
    while (changed) {
      changed = false;
      layout.pieces.forEach((piece) => {
        if (
          !moving.has(piece.id) &&
          linkedSplashMovesWithParent(piece, moving)
        ) {
          moving.add(piece.id);
          changed = true;
        }
      });
    }
  }

  return layout.pieces
    .filter((piece) => moving.has(piece.id))
    .map((piece) => ({
      piece,
      boundOnly: !explicitlySelected.has(piece.id),
    }));
}

function groupBounds(
  items: readonly MoveSessionItem[],
  includeBoundOnly = true,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const included = includeBoundOnly
    ? items
    : items.filter((item) => !item.boundOnly);
  const source = included.length > 0 ? included : items;

  return {
    minX: Math.min(...source.map((item) => item.bounds.x)),
    minY: Math.min(...source.map((item) => item.bounds.y)),
    maxX: Math.max(...source.map((item) => item.bounds.x + item.bounds.w)),
    maxY: Math.max(...source.map((item) => item.bounds.y + item.bounds.h)),
  };
}

export function createPieceMoveSession(
  state: ReadonlyApplicationState,
  selectionIds: readonly string[],
  clickedId: string,
  drillInId: string | null,
  input: ToolPointerInput,
): MoveSession | null {
  const layout = activeLayout(state);
  if (!layout || selectionIds.length === 0) return null;

  const workspace = state.session.workspace;
  const source = moveSessionItems(layout, selectionIds, workspace);
  if (source.length === 0) return null;

  const items: MoveSessionItem[] = source.map(({ piece, boundOnly }) => ({
    id: piece.id,
    pose: piecePose(piece, workspace),
    bounds: piecePoseBounds(piece, workspace),
    boundOnly,
  }));
  const allBounds = groupBounds(items);
  const canvas = pieceWorkspaceCanvasSize(layout, workspace);

  return {
    kind: 'move',
    layoutId: layout.id,
    workspace,
    pointerId: input.pointerId,
    start: { x: input.x, y: input.y },
    scale: Math.max(0.001, Math.abs(layout.scale || 1)),
    moved: false,
    clickedId,
    drillInId,
    anchorId: clickedId,
    items,
    limits: {
      dxMin: -allBounds.minX,
      dxMax: canvas.w - allBounds.maxX,
      dyMin: -allBounds.minY,
      dyMax: canvas.h - allBounds.maxY,
    },
    preview: null,
  };
}

function assemblyTargetBounds(
  layout: Layout,
  workspace: Workspace,
  piece: Piece,
  movingIds: ReadonlySet<string>,
  seenAssemblies: Set<string>,
): { id: string; x: number; y: number; w: number; h: number } | null {
  if (workspace !== 'design' || isBacksplashPiece(piece)) return null;
  const ids = fabricationAssemblyIds(layout.pieces, piece.id);
  if (ids.length <= 1) return null;
  const key = ids.join('|');
  if (seenAssemblies.has(key) || ids.some((id) => movingIds.has(id))) {
    return null;
  }
  seenAssemblies.add(key);
  const members = layout.pieces.filter((candidate) => ids.includes(candidate.id));
  const bounds = members.map((member) => piecePoseBounds(member, 'design'));
  return {
    id: key,
    x: Math.min(...bounds.map((item) => item.x)),
    y: Math.min(...bounds.map((item) => item.y)),
    w:
      Math.max(...bounds.map((item) => item.x + item.w)) -
      Math.min(...bounds.map((item) => item.x)),
    h:
      Math.max(...bounds.map((item) => item.y + item.h)) -
      Math.min(...bounds.map((item) => item.y)),
  };
}

function designMoveSnapCandidates(
  state: ReadonlyApplicationState,
  layout: Layout,
  session: MoveSession,
  dx: number,
  dy: number,
): Array<SmartSnapCandidate | null> {
  const alignmentBounds = groupBounds(session.items, false);
  const movingX = smartSnapBoxAnchors(
    alignmentBounds.minX + dx,
    alignmentBounds.maxX + dx,
  );
  const movingY = smartSnapBoxAnchors(
    alignmentBounds.minY + dy,
    alignmentBounds.maxY + dy,
  );
  const movingIds = new Set(session.items.map((item) => item.id));
  const movingHasCountertop = session.items.some((item) => {
    const piece = layout.pieces.find((candidate) => candidate.id === item.id);
    return piece ? !isBacksplashPiece(piece) : false;
  });
  const candidates: Array<SmartSnapCandidate | null> = [];
  const seenAssemblies = new Set<string>();

  if (state.preferences.pieceSnap) {
    layout.pieces.forEach((other) => {
      if (movingIds.has(other.id)) return;
      if (movingHasCountertop && isBacksplashPiece(other)) return;

      const assembly = assemblyTargetBounds(
        layout,
        session.workspace,
        other,
        movingIds,
        seenAssemblies,
      );
      if (assembly) {
        candidates.push(
          ...smartSnapAxisPairs(
            movingX,
            smartSnapBoxAnchors(assembly.x, assembly.x + assembly.w),
            {
              axis: 'x',
              source: 'assembly',
              targetId: assembly.id,
              priority: SMART_SNAP_PRIORITY.object,
            },
          ),
          ...smartSnapAxisPairs(
            movingY,
            smartSnapBoxAnchors(assembly.y, assembly.y + assembly.h),
            {
              axis: 'y',
              source: 'assembly',
              targetId: assembly.id,
              priority: SMART_SNAP_PRIORITY.object,
            },
          ),
        );
        return;
      }

      const target = piecePoseBounds(other, 'design');
      candidates.push(
        ...smartSnapAxisPairs(
          movingX,
          smartSnapBoxAnchors(target.x, target.x + target.w),
          {
            axis: 'x',
            source: 'piece',
            targetId: other.id,
            priority: SMART_SNAP_PRIORITY.object,
          },
        ),
        ...smartSnapAxisPairs(
          movingY,
          smartSnapBoxAnchors(target.y, target.y + target.h),
          {
            axis: 'y',
            source: 'piece',
            targetId: other.id,
            priority: SMART_SNAP_PRIORITY.object,
          },
        ),
      );
    });
  }

  if (state.preferences.gridSnap) {
    const anchor =
      session.items.find((item) => item.id === session.anchorId) ??
      session.items.find((item) => !item.boundOnly) ??
      session.items[0];
    if (anchor) {
      candidates.push(
        smartSnapGridAxis(anchor.pose.x + dx, 'x', {
          step: layout.grid,
          gridSnap: true,
        }),
        smartSnapGridAxis(anchor.pose.y + dy, 'y', {
          step: layout.grid,
          gridSnap: true,
        }),
      );
    }
  }

  return candidates;
}

function slabMoveSnapCandidates(
  state: ReadonlyApplicationState,
  layout: Layout,
  session: MoveSession,
  dx: number,
  dy: number,
): Array<SmartSnapCandidate | null> {
  const bounds = groupBounds(session.items, false);
  const moving = {
    left: bounds.minX + dx,
    right: bounds.maxX + dx,
    top: bounds.minY + dy,
    bottom: bounds.maxY + dy,
  };
  const movingIds = new Set(session.items.map((item) => item.id));
  const candidates: Array<SmartSnapCandidate | null> = [];
  const clearance = Math.max(0, state.preferences.slabCutClearance);

  if (state.preferences.pieceSnap) {
    const add = (
      axis: 'x' | 'y',
      distance: number,
      guide: number,
      kind: string,
      priority: number,
      targetId: string,
      source = 'piece',
    ): void => {
      const candidate = smartSnapBetter(
        null,
        {
          axis,
          distance,
          guide,
          kind,
          priority,
          source,
          targetId,
        },
        { tolerance: SMART_SNAP_TOLERANCE },
      );
      if (candidate) candidates.push(candidate);
    };

    layout.pieces.forEach((other) => {
      if (movingIds.has(other.id)) return;
      const target = piecePoseBounds(other, 'slab');
      const targetEdges = {
        left: target.x,
        right: target.x + target.w,
        top: target.y,
        bottom: target.y + target.h,
      };

      add(
        'x',
        targetEdges.left - moving.left,
        targetEdges.left,
        'align',
        SMART_SNAP_PRIORITY.slabAlign,
        other.id,
      );
      add(
        'x',
        targetEdges.right - moving.right,
        targetEdges.right,
        'align',
        SMART_SNAP_PRIORITY.slabAlign,
        other.id,
      );
      add(
        'y',
        targetEdges.top - moving.top,
        targetEdges.top,
        'align',
        SMART_SNAP_PRIORITY.slabAlign,
        other.id,
      );
      add(
        'y',
        targetEdges.bottom - moving.bottom,
        targetEdges.bottom,
        'align',
        SMART_SNAP_PRIORITY.slabAlign,
        other.id,
      );

      const yOverlap =
        Math.min(moving.bottom, targetEdges.bottom) -
        Math.max(moving.top, targetEdges.top);
      if (yOverlap >= -SMART_SNAP_TOLERANCE) {
        add(
          'x',
          targetEdges.right + clearance - moving.left,
          targetEdges.right + clearance,
          'clearance',
          SMART_SNAP_PRIORITY.slabClearance,
          other.id,
        );
        add(
          'x',
          targetEdges.left - clearance - moving.right,
          targetEdges.left - clearance,
          'clearance',
          SMART_SNAP_PRIORITY.slabClearance,
          other.id,
        );
      }

      const xOverlap =
        Math.min(moving.right, targetEdges.right) -
        Math.max(moving.left, targetEdges.left);
      if (xOverlap >= -SMART_SNAP_TOLERANCE) {
        add(
          'y',
          targetEdges.bottom + clearance - moving.top,
          targetEdges.bottom + clearance,
          'clearance',
          SMART_SNAP_PRIORITY.slabClearance,
          other.id,
        );
        add(
          'y',
          targetEdges.top - clearance - moving.bottom,
          targetEdges.top - clearance,
          'clearance',
          SMART_SNAP_PRIORITY.slabClearance,
          other.id,
        );
      }
    });

    layout.overlays.forEach((slab) => {
      if (!slab.visible) return;
      const safe = slabUsableBounds(
        slab,
        state.preferences.slabEdgeAllowance,
      );
      const safeEdges = {
        left: safe.x,
        right: safe.x + safe.w,
        top: safe.y,
        bottom: safe.y + safe.h,
      };

      const yOverlap =
        Math.min(moving.bottom, safeEdges.bottom) -
        Math.max(moving.top, safeEdges.top);
      if (yOverlap >= -SMART_SNAP_TOLERANCE) {
        add(
          'x',
          safeEdges.left - moving.left,
          safeEdges.left,
          'slab-edge',
          SMART_SNAP_PRIORITY.reference,
          slab.id,
          'slab',
        );
        add(
          'x',
          safeEdges.right - moving.right,
          safeEdges.right,
          'slab-edge',
          SMART_SNAP_PRIORITY.reference,
          slab.id,
          'slab',
        );
      }

      const xOverlap =
        Math.min(moving.right, safeEdges.right) -
        Math.max(moving.left, safeEdges.left);
      if (xOverlap >= -SMART_SNAP_TOLERANCE) {
        add(
          'y',
          safeEdges.top - moving.top,
          safeEdges.top,
          'slab-edge',
          SMART_SNAP_PRIORITY.reference,
          slab.id,
          'slab',
        );
        add(
          'y',
          safeEdges.bottom - moving.bottom,
          safeEdges.bottom,
          'slab-edge',
          SMART_SNAP_PRIORITY.reference,
          slab.id,
          'slab',
        );
      }
    });
  }

  if (state.preferences.gridSnap) {
    const anchor =
      session.items.find((item) => item.id === session.anchorId) ??
      session.items[0];
    if (anchor) {
      candidates.push(
        smartSnapGridAxis(anchor.pose.x + dx, 'x', {
          step: layout.grid,
          gridSnap: true,
        }),
        smartSnapGridAxis(anchor.pose.y + dy, 'y', {
          step: layout.grid,
          gridSnap: true,
        }),
      );
    }
  }

  return candidates;
}

export function previewPieceMove(
  state: ReadonlyApplicationState,
  session: MoveSession,
  input: ToolPointerInput,
): PieceInteractionPreview | null {
  const layout = activeLayout(state);
  if (
    !layout ||
    layout.id !== session.layoutId ||
    state.session.workspace !== session.workspace
  ) {
    return null;
  }

  const rawDx = input.x - session.start.x;
  const rawDy = input.y - session.start.y;
  let dx = clamp(rawDx, session.limits.dxMin, session.limits.dxMax);
  let dy = clamp(rawDy, session.limits.dyMin, session.limits.dyMax);

  let guideX: number | null = null;
  let guideY: number | null = null;

  if (!input.modifiers.alt) {
    const candidates =
      session.workspace === 'slab'
        ? slabMoveSnapCandidates(state, layout, session, dx, dy)
        : designMoveSnapCandidates(state, layout, session, dx, dy);
    const resolved = resolveSmartSnapAxes(candidates);

    if (resolved.x) {
      dx += resolved.x.d;
      guideX = resolved.x.guide;
    }
    if (resolved.y) {
      dy += resolved.y.d;
      guideY = resolved.y.guide;
    }

    dx = clamp(dx, session.limits.dxMin, session.limits.dxMax);
    dy = clamp(dy, session.limits.dyMin, session.limits.dyMax);
  }

  return {
    kind: 'move',
    layoutId: layout.id,
    workspace: session.workspace,
    pieces: session.items.map((item) => ({
      id: item.id,
      pose: {
        x: item.pose.x + dx,
        y: item.pose.y + dy,
        rotation: item.pose.rotation,
      },
    })),
    guideX,
    guideY,
  };
}

export function pieceResizeLockedSides(piece: Piece): Set<PieceResizeSide> {
  const locked = new Set<PieceResizeSide>();
  piece.assemblyLinks.forEach((link) => {
    if (link.kind !== 'seam') return;
    const side = link.side;
    if (
      side === 'top' ||
      side === 'right' ||
      side === 'bottom' ||
      side === 'left'
    ) {
      locked.add(side);
    }
  });
  return locked;
}

export function createPieceResizeSession(
  state: ReadonlyApplicationState,
  pieceId: string,
  side: PieceResizeSide,
  input: ToolPointerInput,
): ResizeSession | null {
  const layout = activeLayout(state);
  if (!layout || state.session.workspace !== 'design') return null;
  const selection = state.session.selection;
  if (
    selection.kind !== 'pieces' ||
    selection.ids.length !== 1 ||
    selection.ids[0] !== pieceId
  ) {
    return null;
  }

  const piece = layout.pieces.find((candidate) => candidate.id === pieceId);
  if (
    !piece ||
    isBacksplashPiece(piece) ||
    pieceResizeLockedSides(piece).has(side)
  ) {
    return null;
  }

  const geometry = pieceGeometry(piece);
  const pose = piecePose(piece, 'design');
  const bounds = piecePoseBounds(piece, 'design');
  const center = {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + bounds.h / 2,
  };
  const u = rotateVector(1, 0, pose.rotation);
  const v = rotateVector(0, 1, pose.rotation);

  return {
    kind: 'resize',
    layoutId: layout.id,
    workspace: 'design',
    pointerId: input.pointerId,
    start: { x: input.x, y: input.y },
    scale: Math.max(0.001, Math.abs(layout.scale || 1)),
    moved: false,
    pieceId,
    side,
    geometry,
    pose,
    center,
    u,
    v,
    preview: null,
  };
}

function resizeSnap(
  state: ReadonlyApplicationState,
  layout: Layout,
  session: ResizeSession,
  geometry: PieceGeometry,
  center: { x: number; y: number },
  bypass: boolean,
): SmartSnapCandidate | null {
  if (bypass || !state.preferences.pieceSnap) return null;

  const alongWidth =
    session.side === 'left' || session.side === 'right';
  const normal =
    session.side === 'right'
      ? session.u
      : session.side === 'left'
        ? { x: -session.u.x, y: -session.u.y }
        : session.side === 'bottom'
          ? session.v
          : { x: -session.v.x, y: -session.v.y };
  const tangent = alongWidth ? session.v : session.u;
  const dimension = alongWidth ? geometry.width : geometry.height;
  const tangentHalf =
    (alongWidth ? geometry.height : geometry.width) / 2;
  const centerNormal = center.x * normal.x + center.y * normal.y;
  const centerTangent =
    center.x * tangent.x + center.y * tangent.y;
  const movingEdge = centerNormal + dimension / 2;
  const movingTMin = centerTangent - tangentHalf;
  const movingTMax = centerTangent + tangentHalf;
  let best: SmartSnapCandidate | null = null;

  layout.pieces.forEach((other) => {
    if (other.id === session.pieceId || isBacksplashPiece(other)) return;
    const targetN = pieceProjectedSpan(
      pieceGeometry(other),
      piecePose(other, 'design'),
      normal,
    );
    const targetT = pieceProjectedSpan(
      pieceGeometry(other),
      piecePose(other, 'design'),
      tangent,
    );
    const overlap =
      Math.min(movingTMax, targetT.max) -
      Math.max(movingTMin, targetT.min);
    if (overlap < -SMART_SNAP_TOLERANCE) return;

    [targetN.min, targetN.max].forEach((target) => {
      best = smartSnapBetter(best, {
        axis: alongWidth ? 'x' : 'y',
        distance: target - movingEdge,
        guide: target,
        kind: 'edge',
        source: 'piece',
        targetId: other.id,
        priority: SMART_SNAP_PRIORITY.object,
      });
    });
  });

  return best;
}

function resizeCenterAndSize(
  session: ResizeSession,
  input: ToolPointerInput,
): {
  width: number;
  height: number;
  center: { x: number; y: number };
} {
  const dx = input.x - session.start.x;
  const dy = input.y - session.start.y;
  const du = dx * session.u.x + dy * session.u.y;
  const dv = dx * session.v.x + dy * session.v.y;
  let width = session.geometry.width;
  let height = session.geometry.height;

  if (session.side === 'right') width += du;
  if (session.side === 'left') width -= du;
  if (session.side === 'bottom') height += dv;
  if (session.side === 'top') height -= dv;

  width = Math.max(0.25, width);
  height = Math.max(0.25, height);

  if (!input.modifiers.shift && !input.modifiers.alt) {
    width = Math.max(0.25, Math.round(width * 8) / 8);
    height = Math.max(0.25, Math.round(height * 8) / 8);
  }

  let shiftU = 0;
  let shiftV = 0;
  if (session.side === 'right') {
    shiftU = (width - session.geometry.width) / 2;
  }
  if (session.side === 'left') {
    shiftU = -(width - session.geometry.width) / 2;
  }
  if (session.side === 'bottom') {
    shiftV = (height - session.geometry.height) / 2;
  }
  if (session.side === 'top') {
    shiftV = -(height - session.geometry.height) / 2;
  }

  return {
    width,
    height,
    center: {
      x:
        session.center.x +
        session.u.x * shiftU +
        session.v.x * shiftV,
      y:
        session.center.y +
        session.u.y * shiftU +
        session.v.y * shiftV,
    },
  };
}

export function previewPieceResize(
  state: ReadonlyApplicationState,
  session: ResizeSession,
  input: ToolPointerInput,
): PieceInteractionPreview | null {
  const layout = activeLayout(state);
  const piece = layout?.pieces.find(
    (candidate) => candidate.id === session.pieceId,
  );
  if (
    !layout ||
    !piece ||
    layout.id !== session.layoutId ||
    state.session.workspace !== 'design'
  ) {
    return null;
  }

  const next = resizeCenterAndSize(session, input);
  let geometry = resizePieceGeometry(
    piece,
    next.width,
    next.height,
  );
  const snap = resizeSnap(
    state,
    layout,
    session,
    geometry,
    next.center,
    input.modifiers.alt,
  );

  if (snap) {
    if (
      session.side === 'left' ||
      session.side === 'right'
    ) {
      next.width = Math.max(0.25, next.width + snap.d);
    } else {
      next.height = Math.max(0.25, next.height + snap.d);
    }

    geometry = resizePieceGeometry(
      piece,
      next.width,
      next.height,
    );

    let shiftU = 0;
    let shiftV = 0;
    if (session.side === 'right') {
      shiftU = (geometry.width - session.geometry.width) / 2;
    }
    if (session.side === 'left') {
      shiftU = -(geometry.width - session.geometry.width) / 2;
    }
    if (session.side === 'bottom') {
      shiftV = (geometry.height - session.geometry.height) / 2;
    }
    if (session.side === 'top') {
      shiftV = -(geometry.height - session.geometry.height) / 2;
    }
    next.center = {
      x:
        session.center.x +
        session.u.x * shiftU +
        session.v.x * shiftV,
      y:
        session.center.y +
        session.u.y * shiftU +
        session.v.y * shiftV,
    };
  }

  geometry = {
    ...geometry,
    width: round3(geometry.width),
    height: round3(geometry.height),
  };
  const size = piecePoseBounds(
    {
      ...piece,
      w: geometry.width,
      h: geometry.height,
      cornerRadii: { ...geometry.cornerRadii },
    },
    'design',
  );
  const rawPose: PiecePose = {
    x: next.center.x - size.w / 2,
    y: next.center.y - size.h / 2,
    rotation: session.pose.rotation,
  };
  const canvas = pieceWorkspaceCanvasSize(layout, 'design');
  const pose: PiecePose = {
    x: round3(clamp(rawPose.x, 0, Math.max(0, canvas.w - size.w))),
    y: round3(clamp(rawPose.y, 0, Math.max(0, canvas.h - size.h))),
    rotation: session.pose.rotation,
  };

  return {
    kind: 'resize',
    layoutId: layout.id,
    workspace: 'design',
    pieces: [
      {
        id: piece.id,
        pose,
        geometry,
      },
    ],
    guideX:
      snap && (session.side === 'left' || session.side === 'right')
        ? snap.guide
        : null,
    guideY:
      snap && (session.side === 'top' || session.side === 'bottom')
        ? snap.guide
        : null,
  };
}

export function createPieceRotateSession(
  state: ReadonlyApplicationState,
  input: ToolPointerInput,
): RotateSession | null {
  const layout = activeLayout(state);
  const selection = state.session.selection;
  if (!layout || selection.kind !== 'pieces' || !selection.ids.length) {
    return null;
  }

  const workspace = state.session.workspace;
  const ids = pieceRotationFamilyIds(
    layout,
    selection.ids,
    workspace,
  );
  const center = pieceTransformGroupCenter(layout, ids, workspace);
  const primary = layout.pieces.find((piece) => piece.id === ids[0]);
  if (!center || !primary) return null;

  const primaryPose = piecePose(primary, workspace);
  return {
    kind: 'rotate',
    layoutId: layout.id,
    workspace,
    pointerId: input.pointerId,
    start: { x: input.x, y: input.y },
    scale: Math.max(0.001, Math.abs(layout.scale || 1)),
    moved: false,
    ids,
    center,
    startPointer: pointAngleDegrees(center, { x: input.x, y: input.y }),
    startPrimaryRotation: primaryPose.rotation,
    preview: null,
  };
}

function resolvedRotationDelta(
  session: RotateSession,
  input: ToolPointerInput,
): number {
  const current = pointAngleDegrees(session.center, { x: input.x, y: input.y });
  let delta = signedAngleDeltaDegrees(current - session.startPointer);
  let angle = session.startPrimaryRotation + delta;

  if (input.modifiers.shift) {
    angle = snapAngleToIncrement(angle, 90);
    delta = angle - session.startPrimaryRotation;
  } else if (!input.modifiers.alt) {
    const snapAngle = snapAngleToIncrement(angle, 90);
    if (Math.abs(angle - snapAngle) <= 5) {
      angle = snapAngle;
      delta = angle - session.startPrimaryRotation;
    }
  }

  return delta;
}

export function previewPieceRotation(
  state: ReadonlyApplicationState,
  session: RotateSession,
  input: ToolPointerInput,
): PieceInteractionPreview | null {
  const layout = activeLayout(state);
  if (
    !layout ||
    layout.id !== session.layoutId ||
    state.session.workspace !== session.workspace
  ) {
    return null;
  }

  const delta = resolvedRotationDelta(session, input);
  const updates = rotatePieceGroup(
    layout,
    session.ids,
    session.workspace,
    delta,
  );
  if (!updates.length) return null;

  return {
    kind: 'rotate',
    layoutId: layout.id,
    workspace: session.workspace,
    pieces: updates.map((update) => ({
      id: update.id,
      pose: update.pose,
    })),
    guideX: null,
    guideY: null,
  };
}

export function previewPieceNudge(
  state: ReadonlyApplicationState,
  ids: readonly string[],
  workspace: Workspace,
  dx: number,
  dy: number,
): PieceInteractionPreview | null {
  const layout = activeLayout(state);
  if (!layout || state.session.workspace !== workspace) return null;
  const updates = nudgePieceGroup(layout, ids, workspace, dx, dy);
  if (!updates.length) return null;

  return {
    kind: 'nudge',
    layoutId: layout.id,
    workspace,
    pieces: updates.map((update) => ({
      id: update.id,
      pose: update.pose,
    })),
    guideX: null,
    guideY: null,
  };
}

function previewJson(
  preview: PieceInteractionPreview | null,
): JsonValue {
  if (!preview) return null;

  const pieces: JsonValue[] = preview.pieces.map((item) => {
    const output: JsonObject = {
      id: item.id,
      pose: {
        x: item.pose.x,
        y: item.pose.y,
        rotation: item.pose.rotation,
      },
    };

    if (item.geometry) {
      output.geometry = {
        kind: 'rectangle',
        width: item.geometry.width,
        height: item.geometry.height,
        cornerRadii: {
          tl: item.geometry.cornerRadii.tl,
          tr: item.geometry.cornerRadii.tr,
          br: item.geometry.cornerRadii.br,
          bl: item.geometry.cornerRadii.bl,
        },
      };
    }

    return output;
  });

  return {
    kind: preview.kind,
    layoutId: preview.layoutId,
    workspace: preview.workspace,
    pieces,
    guideX: preview.guideX,
    guideY: preview.guideY,
  };
}

function pointerState(
  interaction: InteractionState,
  session: PiecePointerSession,
  input: ToolPointerInput,
  preview: PieceInteractionPreview | null,
): InteractionState {
  return {
    ...interaction,
    pointer: {
      pointerId: input.pointerId,
      startX: session.start.x,
      startY: session.start.y,
      x: input.x,
      y: input.y,
      buttons: input.buttons,
      modifiers: { ...input.modifiers },
    },
    preview: previewJson(preview),
  };
}

function clearPointerState(
  interaction: InteractionState,
): InteractionState {
  if (!interaction.pointer && interaction.preview === null) {
    return interaction;
  }

  return {
    ...interaction,
    pointer: null,
    preview: null,
  };
}

function transformPatches(
  preview: PieceInteractionPreview,
): PieceTransformPatch[] {
  return preview.pieces.map((item) => ({
    id: item.id,
    ...(item.geometry ? { geometry: item.geometry } : {}),
    ...(preview.workspace === 'slab'
      ? { slabPose: item.pose }
      : { designPose: item.pose }),
  }));
}

export class PieceInteractionController {
  private session: PiecePointerSession | null = null;
  private nudge: NudgeSession | null = null;

  constructor(
    private readonly store: AppStore,
    private readonly commands: CommandDispatcher,
  ) {}

  hasActivePointer(): boolean {
    return this.session !== null;
  }

  getPreview(): PieceInteractionPreview | null {
    const state = this.store.getState();
    const session = this.session;
    if (session && session.kind !== 'blank') {
      if (
        state.session.activeLayoutId !== session.layoutId ||
        state.session.workspace !== session.workspace
      ) {
        this.session = null;
        return null;
      }
      return session.preview;
    }

    if (this.nudge) {
      if (
        state.session.activeLayoutId !== this.nudge.layoutId ||
        state.session.workspace !== this.nudge.workspace
      ) {
        this.nudge = null;
        return null;
      }
      return this.nudge.preview;
    }

    return null;
  }

  beginPiece(
    pieceId: string,
    input: ToolPointerInput,
  ): boolean {
    const state = this.store.getState();
    if (
      state.session.interaction.activeTool ||
      input.button !== 0 ||
      this.nudge
    ) {
      return false;
    }
    const layout = activeLayout(state);
    if (!layout) return false;

    const plan = resolvePiecePointerSelection(
      layout,
      state.session.selection,
      pieceId,
      state.session.workspace,
      input.modifiers.ctrl || input.modifiers.meta,
    );

    this.commands.execute(setSelection(plan.selection));
    const selected = this.store.getState().session.selection;
    const ids = selected.kind === 'pieces' ? selected.ids : [];
    const session = createPieceMoveSession(
      this.store.getState(),
      ids,
      pieceId,
      plan.drillInId,
      input,
    );

    if (!session) {
      this.session = null;
      return true;
    }

    this.session = session;
    const interaction = this.store.getState().session.interaction;
    this.commands.execute(
      replaceInteractionState(
        pointerState(interaction, session, input, null),
      ),
    );
    return true;
  }

  beginResize(
    pieceId: string,
    side: PieceResizeSide,
    input: ToolPointerInput,
  ): boolean {
    const state = this.store.getState();
    if (
      state.session.interaction.activeTool ||
      input.button !== 0 ||
      this.nudge
    ) {
      return false;
    }

    const session = createPieceResizeSession(
      state,
      pieceId,
      side,
      input,
    );
    if (!session) return false;

    this.session = session;
    const interaction = state.session.interaction;
    this.commands.execute(
      replaceInteractionState(
        pointerState(interaction, session, input, null),
      ),
    );
    return true;
  }

  beginRotate(input: ToolPointerInput): boolean {
    const state = this.store.getState();
    if (
      state.session.interaction.activeTool ||
      input.button !== 0 ||
      this.nudge
    ) {
      return false;
    }

    const session = createPieceRotateSession(state, input);
    if (!session) return false;
    this.session = session;
    this.commands.execute(
      replaceInteractionState(
        pointerState(
          state.session.interaction,
          session,
          input,
          null,
        ),
      ),
    );
    return true;
  }

  rotateSelectionBy(deltaDegrees: number): boolean {
    if (!Number.isFinite(deltaDegrees) || this.session || this.nudge) {
      return false;
    }
    const state = this.store.getState();
    if (state.session.interaction.activeTool) return false;
    const layout = activeLayout(state);
    const selection = state.session.selection;
    if (!layout || selection.kind !== 'pieces') return false;

    const updates = rotatePieceGroup(
      layout,
      selection.ids,
      state.session.workspace,
      deltaDegrees,
    );
    if (!updates.length) return false;

    return (
      this.commands.execute(
        transformPieces(
          layout.id,
          updates.map((update) => ({
            id: update.id,
            ...(state.session.workspace === 'slab'
              ? { slabPose: update.pose }
              : { designPose: update.pose }),
          })),
          { label: 'Rotate pieces' },
        ),
      ) !== null
    );
  }

  beginBlank(input: ToolPointerInput): boolean {
    const state = this.store.getState();
    if (
      state.session.interaction.activeTool ||
      input.button !== 0 ||
      this.nudge
    ) {
      return false;
    }
    const layout = activeLayout(state);
    const session: BlankSession = {
      kind: 'blank',
      layoutId: layout?.id ?? null,
      workspace: state.session.workspace,
      pointerId: input.pointerId,
      start: { x: input.x, y: input.y },
      scale: Math.max(0.001, Math.abs(layout?.scale || 1)),
      moved: false,
    };
    this.session = session;
    this.commands.execute(
      replaceInteractionState(
        pointerState(
          state.session.interaction,
          session,
          input,
          null,
        ),
      ),
    );
    return true;
  }

  pointerMove(input: ToolPointerInput): boolean {
    const session = this.session;
    if (!session || session.pointerId !== input.pointerId) return false;

    const threshold =
      (session.kind === 'move' && session.workspace === 'slab'
        ? 2
        : 4) / session.scale;
    const distance = Math.hypot(
      input.x - session.start.x,
      input.y - session.start.y,
    );

    if (session.kind === 'blank') {
      session.moved = session.moved || distance > threshold;
      return true;
    }

    if (
      session.kind === 'move' &&
      !session.moved &&
      distance <= threshold
    ) {
      return true;
    }

    const state = this.store.getState();
    const preview =
      session.kind === 'move'
        ? previewPieceMove(state, session, input)
        : session.kind === 'resize'
          ? previewPieceResize(state, session, input)
          : previewPieceRotation(state, session, input);
    if (!preview) {
      this.cancel();
      return false;
    }

    session.preview = preview;
    if (session.kind === 'move') {
      session.moved = true;
    } else if (session.kind === 'resize') {
      const item = preview.pieces[0];
      session.moved = Boolean(
        item?.geometry &&
          (Math.abs(
            item.geometry.width - session.geometry.width,
          ) > 0.001 ||
            Math.abs(
              item.geometry.height - session.geometry.height,
            ) > 0.001),
      );
    } else {
      session.moved =
        Math.abs(resolvedRotationDelta(session, input)) > 0.001;
    }

    const interaction = state.session.interaction;
    this.commands.execute(
      replaceInteractionState(
        pointerState(interaction, session, input, preview),
      ),
    );
    return true;
  }

  pointerUp(input: ToolPointerInput): boolean {
    const session = this.session;
    if (!session || session.pointerId !== input.pointerId) return false;
    this.session = null;

    const state = this.store.getState();
    const cleanup = replaceInteractionState(
      clearPointerState(state.session.interaction),
    );

    if (session.kind === 'blank') {
      const threshold = 4 / session.scale;
      const moved =
        session.moved ||
        Math.hypot(
          input.x - session.start.x,
          input.y - session.start.y,
        ) > threshold;
      if (!moved) {
        return (
          this.commands.executeTransaction(
            'Clear selection',
            [setSelection({ kind: 'none' }), cleanup],
            { history: 'skip', persistence: 'skip' },
          ) !== null
        );
      }
      return this.commands.execute(cleanup) !== null;
    }

    if (!session.moved || !session.preview) {
      if (session.kind === 'move' && session.drillInId) {
        return (
          this.commands.executeTransaction(
            'Select piece',
            [
              setSelection({
                kind: 'pieces',
                ids: [session.drillInId],
              }),
              cleanup,
            ],
            { history: 'skip', persistence: 'skip' },
          ) !== null
        );
      }
      return this.commands.execute(cleanup) !== null;
    }

    const label =
      session.kind === 'resize'
        ? 'Resize piece'
        : session.kind === 'rotate'
          ? 'Rotate pieces'
          : 'Move pieces';
    return (
      this.commands.executeTransaction(
        label,
        [
          transformPieces(
            session.layoutId,
            transformPatches(session.preview),
            { label },
          ),
          cleanup,
        ],
      ) !== null
    );
  }

  nudgeKeyDown(key: string, shiftKey = false): boolean {
    if (this.session) return false;
    const state = this.store.getState();
    if (state.session.interaction.activeTool) return false;
    const selection = state.session.selection;
    const layout = activeLayout(state);
    if (!layout || selection.kind !== 'pieces' || !selection.ids.length) {
      return false;
    }

    let direction: { x: number; y: number };
    if (key === 'ArrowLeft') direction = { x: -1, y: 0 };
    else if (key === 'ArrowRight') direction = { x: 1, y: 0 };
    else if (key === 'ArrowUp') direction = { x: 0, y: -1 };
    else if (key === 'ArrowDown') direction = { x: 0, y: 1 };
    else return false;

    if (this.nudge && this.nudge.key !== key) {
      this.commitNudge();
    }

    const current = this.store.getState();
    const currentLayout = activeLayout(current);
    const currentSelection = current.session.selection;
    if (
      !currentLayout ||
      currentSelection.kind !== 'pieces' ||
      !currentSelection.ids.length
    ) {
      return false;
    }

    if (!this.nudge) {
      this.nudge = {
        layoutId: currentLayout.id,
        workspace: current.session.workspace,
        key,
        ids: [...currentSelection.ids],
        dx: 0,
        dy: 0,
        preview: null,
      };
    }

    const step = (shiftKey ? 4 : 1) * currentLayout.grid;
    this.nudge.dx += direction.x * step;
    this.nudge.dy += direction.y * step;
    const preview = previewPieceNudge(
      current,
      this.nudge.ids,
      this.nudge.workspace,
      this.nudge.dx,
      this.nudge.dy,
    );
    if (!preview) return false;
    this.nudge.preview = preview;

    this.commands.execute(
      replaceInteractionState({
        ...current.session.interaction,
        pointer: null,
        preview: previewJson(preview),
      }),
    );
    return true;
  }

  nudgeKeyUp(key: string): boolean {
    if (!this.nudge || this.nudge.key !== key) return false;
    return this.commitNudge();
  }

  private commitNudge(): boolean {
    const session = this.nudge;
    if (!session) return false;
    this.nudge = null;

    const state = this.store.getState();
    const cleanup = replaceInteractionState(
      clearPointerState(state.session.interaction),
    );
    if (!session.preview) {
      return this.commands.execute(cleanup) !== null;
    }

    return (
      this.commands.executeTransaction(
        'Nudge pieces',
        [
          transformPieces(
            session.layoutId,
            transformPatches(session.preview),
            { label: 'Nudge pieces' },
          ),
          cleanup,
        ],
      ) !== null
    );
  }

  cancel(): boolean {
    if (!this.session && !this.nudge) return false;
    this.session = null;
    this.nudge = null;
    const interaction = this.store.getState().session.interaction;
    return (
      this.commands.execute(
        replaceInteractionState(
          clearPointerState(interaction),
        ),
      ) !== null
    );
  }
}
