import {
  applyPreparedPieceShapeEdit,
  preparePieceShapeModifierDelete,
  preparePieceShapeModifierUpdate,
  type AppStore,
  type CommandDispatcher,
  type PieceShapeModifierPatch,
} from '../app';
import {
  pieceShapeModifiers,
  type Piece,
  type PieceShapeModifier,
} from '../domain/pieces';
import {
  clientPointToViewportPoint,
  distanceBetween,
  type Point,
} from '../geometry';
import {
  createPieceCanvasProjection,
  type PieceCanvasItem,
  type PieceCanvasProjection,
} from './piece-canvas-model';
import {
  pieceShapeCanvasPoint,
  pieceShapeLocalPoint,
  resolvePieceShapeSnapPoint,
  type PieceShapeSnapTarget,
} from './piece-shape-edit-surface';
import {
  dragPieceShapeModifier,
  nudgePieceShapeModifier,
  type PieceShapeModifierHandle,
  type PieceShapeModifierRect,
} from './piece-shape-modifier-interaction';

export interface PieceShapeInspectorSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
}

interface ShapeInspectorContext {
  layoutId: string;
  piece: Piece;
  modifiers: PieceShapeModifier[];
}

interface ModifierCanvasContext {
  projection: PieceCanvasProjection;
  item: PieceCanvasItem;
  grid: number;
}

interface ModifierDrag {
  pointerId: number;
  pieceId: string;
  modifierId: string;
  handle: PieceShapeModifierHandle;
  startCanvas: Point;
  startLocal: Point;
  source: PieceShapeModifierRect;
  preview: PieceShapeModifierRect;
  currentSnap: PieceShapeSnapTarget | null;
}

const SNAP_RELEASE_PX = 14;
const MODIFIER_NUDGE_INCHES = 0.125;
const MODIFIER_FAST_NUDGE_INCHES = 1;

function modifierHandle(value: string | undefined): PieceShapeModifierHandle | null {
  return value === 'move' ||
    value === 'n' ||
    value === 'ne' ||
    value === 'e' ||
    value === 'se' ||
    value === 's' ||
    value === 'sw' ||
    value === 'w' ||
    value === 'nw'
    ? value
    : null;
}

function editableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
}

function cursorForHandle(handle: PieceShapeModifierHandle): string {
  if (handle === 'move') return 'move';
  if (handle === 'n' || handle === 's') return 'ns-resize';
  if (handle === 'e' || handle === 'w') return 'ew-resize';
  if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
  return 'nwse-resize';
}

export class PieceShapeInspectorSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private inspector: HTMLElement | null = null;
  private svg: SVGSVGElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private observer: MutationObserver | null = null;
  private abort: AbortController | null = null;
  private rendering = false;
  private scheduled = false;
  private selectedModifierId: string | null = null;
  private selectedPieceId: string | null = null;
  private knownModifierIds: string[] = [];
  private drag: ModifierDrag | null = null;
  private busy = false;
  private status = '';

  constructor(options: PieceShapeInspectorSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
  }

  mount(): void {
    if (this.unsubscribe || this.observer || this.abort) return;
    this.inspector = this.root.querySelector<HTMLElement>('#lc-inspector');
    this.svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    if (!this.inspector || !this.svg) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.svg.addEventListener('pointerdown', (event) => this.onPointerDown(event), {
      signal,
      capture: true,
    });
    this.svg.addEventListener('pointermove', (event) => this.onPointerMove(event), {
      signal,
      capture: true,
    });
    this.svg.addEventListener('pointerup', (event) => this.onPointerUp(event), {
      signal,
      capture: true,
    });
    this.svg.addEventListener('pointercancel', (event) => this.onPointerCancel(event), {
      signal,
      capture: true,
    });
    this.svg.ownerDocument.defaultView?.addEventListener(
      'keydown',
      (event) => this.onKeyDown(event),
      { signal, capture: true },
    );

    this.unsubscribe = this.store.subscribe(() => this.scheduleRender());
    const Observer = this.inspector.ownerDocument.defaultView?.MutationObserver;
    if (Observer) {
      this.observer = new Observer(() => this.scheduleRender());
      this.observer.observe(this.inspector, { childList: true, subtree: true });
    }
    this.render();
  }

  unmount(): void {
    this.cancelDrag();
    this.abort?.abort();
    this.abort = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.observer?.disconnect();
    this.observer = null;
    this.removeOverlay();
    this.inspector?.querySelector('[data-piece-shape-inspector]')?.remove();
    this.inspector = null;
    this.svg = null;
  }

  private context(): ShapeInspectorContext | null {
    const state = this.store.getState();
    if (state.session.workspace !== 'design') return null;
    const selection = state.session.selection;
    if (selection.kind !== 'pieces' || selection.ids.length !== 1) return null;
    const layout = state.project.layouts.find(
      (candidate) => candidate.id === state.session.activeLayoutId,
    );
    const piece = layout?.pieces.find((candidate) => candidate.id === selection.ids[0]);
    if (!layout || !piece) return null;
    return {
      layoutId: layout.id,
      piece,
      modifiers: pieceShapeModifiers(piece),
    };
  }

  private canvasContext(context: ShapeInspectorContext): ModifierCanvasContext | null {
    const state = this.store.getState();
    const layout = state.project.layouts.find((candidate) => candidate.id === context.layoutId);
    if (!layout) return null;
    const projection = createPieceCanvasProjection(state);
    const item = projection.pieces.find((candidate) => candidate.id === context.piece.id);
    return item ? { projection, item, grid: layout.grid } : null;
  }

  private eventCanvasPoint(
    event: PointerEvent,
    projection: PieceCanvasProjection,
  ): Point | null {
    const svg = this.svg;
    if (!svg) return null;
    return clientPointToViewportPoint(
      { x: event.clientX, y: event.clientY },
      svg.getBoundingClientRect(),
      {
        x: 0,
        y: 0,
        w: projection.canvas.width,
        h: projection.canvas.height,
      },
    );
  }

  private scheduleRender(): void {
    if (this.rendering || this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.render();
    });
  }

  private syncSelection(context: ShapeInspectorContext | null): void {
    if (!context) {
      this.selectedPieceId = null;
      this.selectedModifierId = null;
      this.knownModifierIds = [];
      this.drag = null;
      return;
    }
    const ids = context.modifiers.map((item) => item.id);
    if (this.selectedPieceId !== context.piece.id) {
      this.selectedPieceId = context.piece.id;
      this.selectedModifierId = null;
      this.knownModifierIds = ids;
      this.drag = null;
      return;
    }
    const added = ids.find((id) => !this.knownModifierIds.includes(id));
    if (added) this.selectedModifierId = added;
    if (this.selectedModifierId && !ids.includes(this.selectedModifierId)) {
      this.selectedModifierId = null;
      this.drag = null;
    }
    this.knownModifierIds = ids;
  }

  private render(): void {
    const inspector = this.inspector;
    if (!inspector || this.rendering) return;
    const context = this.context();
    this.syncSelection(context);
    const signature = JSON.stringify({
      pieceId: context?.piece.id ?? null,
      modifiers: context?.modifiers ?? [],
      selected: this.selectedModifierId,
      busy: this.busy,
      status: this.status,
    });
    const existing = inspector.querySelector<HTMLElement>('[data-piece-shape-inspector]');
    if (existing?.dataset.signature === signature) {
      this.renderOverlay(context);
      return;
    }

    this.rendering = true;
    try {
      existing?.remove();
      this.removeOverlay();
      if (!context) return;

      const document = inspector.ownerDocument;
      const section = document.createElement('section');
      section.className = 'lc-production-piece-properties lc-piece-shape-inspector';
      section.dataset.pieceShapeInspector = '1';
      section.dataset.signature = signature;

      const header = document.createElement('div');
      header.className = 'lc-production-piece-properties__header';
      const title = document.createElement('strong');
      title.textContent = 'Shape';
      const count = document.createElement('span');
      count.className = 'lc-piece-shape-inspector__count';
      count.textContent = `${context.modifiers.length} modifier${context.modifiers.length === 1 ? '' : 's'}`;
      header.append(title, count);

      const body = document.createElement('div');
      body.className = 'lc-production-piece-properties__body lc-piece-shape-inspector__body';
      const toolbar = document.createElement('div');
      toolbar.className = 'lc-piece-shape-inspector__toolbar';
      const add = document.createElement('button');
      add.type = 'button';
      add.textContent = '+ Add';
      add.disabled = this.busy;
      add.addEventListener('click', () =>
        this.root.querySelector<HTMLButtonElement>('#lc-tool-piece-shape-add')?.click());
      const subtract = document.createElement('button');
      subtract.type = 'button';
      subtract.textContent = '− Subtract';
      subtract.disabled = this.busy;
      subtract.addEventListener('click', () =>
        this.root.querySelector<HTMLButtonElement>('#lc-tool-piece-shape-subtract')?.click());
      toolbar.append(add, subtract);
      body.append(toolbar);

      if (context.modifiers.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'lc-piece-shape-inspector__empty';
        empty.textContent = 'No editable modifiers yet. New ADD/SUBTRACT shapes will appear here.';
        body.append(empty);
      } else {
        const list = document.createElement('div');
        list.className = 'lc-piece-shape-inspector__list';
        context.modifiers.forEach((modifier, index) => {
          list.append(this.renderModifierRow(document, context, modifier, index));
        });
        body.append(list);
      }

      if (this.status) {
        const status = document.createElement('div');
        status.className = 'lc-piece-shape-inspector__status';
        status.textContent = this.status;
        body.append(status);
      }

      section.append(header, body);
      const anchor = inspector.querySelector(
        ':scope > .lc-piece-sinks-inspector, :scope > .lc-piece-cutouts-inspector, :scope > .lc-piece-seams-inspector, :scope > .lc-piece-mirror-actions',
      );
      inspector.insertBefore(section, anchor);
      this.renderOverlay(context);
    } finally {
      this.rendering = false;
    }
  }

  private renderModifierRow(
    document: Document,
    context: ShapeInspectorContext,
    modifier: PieceShapeModifier,
    index: number,
  ): HTMLElement {
    const selected = modifier.id === this.selectedModifierId;
    const row = document.createElement('div');
    row.className = 'lc-piece-shape-inspector__row';
    row.classList.toggle('is-selected', selected);
    row.dataset.shapeModifierId = modifier.id;

    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'lc-piece-shape-inspector__summary';
    const badge = document.createElement('span');
    badge.className = `lc-piece-shape-inspector__badge is-${modifier.operation}`;
    badge.textContent = modifier.operation === 'add' ? 'ADD' : 'SUB';
    const label = document.createElement('span');
    label.textContent = `${modifier.operation === 'add' ? 'Addition' : 'Subtraction'} ${index + 1}`;
    const size = document.createElement('span');
    size.className = 'lc-piece-shape-inspector__size';
    size.textContent = `${modifier.w}" × ${modifier.h}"`;
    summary.append(badge, label, size);
    summary.addEventListener('click', () => {
      this.cancelDrag();
      this.selectedModifierId = selected ? null : modifier.id;
      this.status = '';
      this.render();
    });
    row.append(summary);

    if (selected) {
      const fields = document.createElement('div');
      fields.className = 'lc-piece-shape-inspector__fields';
      const values: Array<[keyof PieceShapeModifierPatch, string, number]> = [
        ['x', 'X', modifier.x],
        ['y', 'Y', modifier.y],
        ['w', 'Width', modifier.w],
        ['h', 'Height', modifier.h],
      ];
      values.forEach(([key, labelText, value]) => {
        const field = document.createElement('label');
        field.className = 'lc-production-piece-properties__field';
        const label = document.createElement('span');
        label.textContent = labelText;
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.125';
        input.value = String(value);
        input.disabled = this.busy;
        input.addEventListener('change', () => {
          const next = Number(input.value);
          if (Number.isFinite(next)) void this.updateModifier(context, modifier.id, { [key]: next });
        });
        field.append(label, input);
        fields.append(field);
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lc-piece-shape-inspector__delete';
      remove.textContent = 'Delete Modifier';
      remove.disabled = this.busy;
      remove.addEventListener('click', () => void this.deleteModifier(context, modifier.id));
      fields.append(remove);
      row.append(fields);
    }

    return row;
  }

  private async updateModifier(
    context: ShapeInspectorContext,
    modifierId: string,
    patch: PieceShapeModifierPatch,
  ): Promise<void> {
    if (this.busy) return;
    const latest = this.context();
    if (!latest || latest.layoutId !== context.layoutId || latest.piece.id !== context.piece.id) return;
    const layout = this.store.getState().project.layouts.find((item) => item.id === latest.layoutId);
    if (!layout) return;
    this.busy = true;
    this.status = 'Updating shape…';
    this.render();
    try {
      const result = await preparePieceShapeModifierUpdate(layout, latest.piece.id, modifierId, patch);
      if (!result.ok) {
        this.status = result.reason;
        return;
      }
      this.status = this.commands.execute(applyPreparedPieceShapeEdit(result.prepared))
        ? 'Modifier updated.'
        : 'The Piece changed before the edit could be applied.';
    } catch (error) {
      this.status = error instanceof Error ? error.message : 'Unable to update the modifier.';
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async deleteModifier(
    context: ShapeInspectorContext,
    modifierId: string,
  ): Promise<void> {
    if (this.busy) return;
    const layout = this.store.getState().project.layouts.find((item) => item.id === context.layoutId);
    if (!layout) return;
    this.busy = true;
    this.status = 'Removing modifier…';
    this.render();
    try {
      const result = await preparePieceShapeModifierDelete(layout, context.piece.id, modifierId);
      if (!result.ok) {
        this.status = result.reason;
        return;
      }
      const applied = this.commands.execute(applyPreparedPieceShapeEdit(result.prepared));
      if (applied) this.selectedModifierId = null;
      this.status = applied ? 'Modifier removed.' : 'The Piece changed before the edit could be applied.';
    } catch (error) {
      this.status = error instanceof Error ? error.message : 'Unable to remove the modifier.';
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private intercept(event: Event): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private snappedCanvasPoint(
    raw: Point,
    context: ModifierCanvasContext,
    drag: ModifierDrag,
    altKey: boolean,
  ): Point {
    if (altKey) {
      drag.currentSnap = null;
      return raw;
    }

    const scale = Math.max(0.001, Math.abs(context.projection.scale || 1));
    if (
      drag.currentSnap &&
      drag.currentSnap.kind !== 'edge' &&
      distanceBetween(raw, drag.currentSnap.point) <= SNAP_RELEASE_PX / scale
    ) {
      return { ...drag.currentSnap.point };
    }
    drag.currentSnap = null;

    const preferences = this.store.getState().preferences;
    let resolved = resolvePieceShapeSnapPoint(
      context.projection,
      context.item.id,
      raw,
      {
        scale,
        pieceSnap: preferences.pieceSnap,
        gridSnap: preferences.gridSnap,
        gridStep: context.grid,
      },
    );

    // Do not let an edited handle glue itself to the exact old edge/point that
    // produced it. Other vertices/midpoints on the same Piece remain valid.
    if (
      resolved.target?.pieceId === context.item.id &&
      (resolved.target.kind === 'edge' ||
        distanceBetween(resolved.target.point, drag.startCanvas) <= 0.01)
    ) {
      const withoutActivePiece: PieceCanvasProjection = {
        ...context.projection,
        pieces: context.projection.pieces.filter((piece) => piece.id !== context.item.id),
      };
      resolved = resolvePieceShapeSnapPoint(
        withoutActivePiece,
        '',
        raw,
        {
          scale,
          pieceSnap: preferences.pieceSnap,
          gridSnap: preferences.gridSnap,
          gridStep: context.grid,
        },
      );
    }

    drag.currentSnap = resolved.target;
    return resolved.point;
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.busy || this.drag || event.button !== 0 || !this.selectedModifierId) return;
    if (this.root.querySelector('[data-piece-shape-hud]')) return;
    const target = event.target instanceof Element ? event.target : null;
    const handleElement = target?.closest<SVGElement>('[data-piece-shape-modifier-handle]');
    const bodyElement = target?.closest<SVGElement>('[data-piece-shape-modifier-body]');
    if (!handleElement && !bodyElement) return;

    const modifierId = handleElement?.dataset.pieceShapeModifierId ?? bodyElement?.dataset.pieceShapeModifierId;
    if (!modifierId || modifierId !== this.selectedModifierId) return;
    const handle = handleElement
      ? modifierHandle(handleElement.dataset.pieceShapeModifierHandle)
      : 'move';
    if (!handle) return;

    const context = this.context();
    if (!context) return;
    const modifier = context.modifiers.find((item) => item.id === modifierId);
    const canvas = this.canvasContext(context);
    if (!modifier || !canvas) return;
    const raw = this.eventCanvasPoint(event, canvas.projection);
    if (!raw) return;

    this.intercept(event);
    const local = pieceShapeLocalPoint(canvas.item, raw);
    this.drag = {
      pointerId: event.pointerId,
      pieceId: context.piece.id,
      modifierId,
      handle,
      startCanvas: { ...raw },
      startLocal: local,
      source: { x: modifier.x, y: modifier.y, w: modifier.w, h: modifier.h },
      preview: { x: modifier.x, y: modifier.y, w: modifier.w, h: modifier.h },
      currentSnap: null,
    };
    this.status = '';
    this.svg?.setPointerCapture?.(event.pointerId);
    this.renderOverlay(context);
  }

  private onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const context = this.context();
    if (!context || context.piece.id !== drag.pieceId) {
      this.cancelDrag();
      return;
    }
    const canvas = this.canvasContext(context);
    if (!canvas) return;
    const raw = this.eventCanvasPoint(event, canvas.projection);
    if (!raw) return;

    this.intercept(event);
    const snapped = this.snappedCanvasPoint(raw, canvas, drag, event.altKey);
    const local = pieceShapeLocalPoint(canvas.item, snapped);
    drag.preview = dragPieceShapeModifier(
      drag.source,
      drag.handle,
      local.x - drag.startLocal.x,
      local.y - drag.startLocal.y,
    );
    this.renderOverlay(context);
  }

  private onPointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const context = this.context();
    this.intercept(event);
    try {
      this.svg?.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may already have released pointer capture.
    }
    this.drag = null;
    if (!context || context.piece.id !== drag.pieceId) {
      this.renderOverlay(context);
      return;
    }
    this.renderOverlay(context);
    void this.updateModifier(context, drag.modifierId, drag.preview);
  }

  private onPointerCancel(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    this.intercept(event);
    this.cancelDrag();
    this.renderOverlay(this.context());
  }

  private cancelDrag(): void {
    const pointerId = this.drag?.pointerId;
    this.drag = null;
    if (pointerId !== undefined) {
      try {
        this.svg?.releasePointerCapture?.(pointerId);
      } catch {
        // The browser may already have released pointer capture.
      }
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || editableTarget(event.target) || !this.selectedModifierId) return;
    const context = this.context();
    if (!context) return;

    if (event.key === 'Escape') {
      this.intercept(event);
      if (this.drag) {
        this.cancelDrag();
      } else {
        this.selectedModifierId = null;
      }
      this.status = '';
      this.render();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      this.intercept(event);
      if (!this.drag) void this.deleteModifier(context, this.selectedModifierId);
      return;
    }

    if (!event.key.startsWith('Arrow') || this.busy || this.drag) return;
    const modifier = context.modifiers.find((item) => item.id === this.selectedModifierId);
    if (!modifier) return;
    const amount = event.shiftKey ? MODIFIER_FAST_NUDGE_INCHES : MODIFIER_NUDGE_INCHES;
    let dx = 0;
    let dy = 0;
    if (event.key === 'ArrowLeft') dx = -amount;
    if (event.key === 'ArrowRight') dx = amount;
    if (event.key === 'ArrowUp') dy = -amount;
    if (event.key === 'ArrowDown') dy = amount;
    if (!dx && !dy) return;
    this.intercept(event);
    const next = nudgePieceShapeModifier(modifier, dx, dy);
    void this.updateModifier(context, modifier.id, next);
  }

  private renderOverlay(context: ShapeInspectorContext | null): void {
    this.removeOverlay();
    if (!context || !this.selectedModifierId || !this.svg) return;
    const stored = context.modifiers.find((item) => item.id === this.selectedModifierId);
    if (!stored) return;
    const modifier =
      this.drag?.modifierId === stored.id ? this.drag.preview : stored;
    const canvas = this.canvasContext(context);
    if (!canvas) return;

    const color = stored.operation === 'add' ? '#2563eb' : '#dc2626';
    const fill = stored.operation === 'add' ? 'rgb(37 99 235 / 8%)' : 'rgb(220 38 38 / 8%)';
    const localCorners = [
      { x: modifier.x, y: modifier.y },
      { x: modifier.x + modifier.w, y: modifier.y },
      { x: modifier.x + modifier.w, y: modifier.y + modifier.h },
      { x: modifier.x, y: modifier.y + modifier.h },
    ];
    const corners = localCorners.map((point) => pieceShapeCanvasPoint(canvas.item, point));
    const document = this.svg.ownerDocument;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.dataset.pieceShapeModifierOverlay = stored.id;

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.dataset.pieceShapeModifierBody = '1';
    polygon.dataset.pieceShapeModifierId = stored.id;
    polygon.setAttribute('points', corners.map((point) => `${point.x},${point.y}`).join(' '));
    polygon.setAttribute('fill', fill);
    polygon.setAttribute('stroke', color);
    polygon.setAttribute('stroke-width', '2');
    polygon.setAttribute('stroke-dasharray', '5 4');
    polygon.setAttribute('vector-effect', 'non-scaling-stroke');
    polygon.setAttribute('pointer-events', 'all');
    polygon.style.cursor = cursorForHandle('move');
    group.append(polygon);

    const handlePoints: Array<[PieceShapeModifierHandle, Point]> = [
      ['nw', localCorners[0]!],
      ['n', { x: modifier.x + modifier.w / 2, y: modifier.y }],
      ['ne', localCorners[1]!],
      ['e', { x: modifier.x + modifier.w, y: modifier.y + modifier.h / 2 }],
      ['se', localCorners[2]!],
      ['s', { x: modifier.x + modifier.w / 2, y: modifier.y + modifier.h }],
      ['sw', localCorners[3]!],
      ['w', { x: modifier.x, y: modifier.y + modifier.h / 2 }],
    ];
    const scale = Math.max(0.001, Math.abs(canvas.projection.scale || 1));
    const radius = Math.max(0.08, 5 / scale);
    handlePoints.forEach(([handle, local]) => {
      const point = pieceShapeCanvasPoint(canvas.item, local);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.dataset.pieceShapeModifierHandle = handle;
      circle.dataset.pieceShapeModifierId = stored.id;
      circle.setAttribute('cx', String(point.x));
      circle.setAttribute('cy', String(point.y));
      circle.setAttribute('r', String(radius));
      circle.setAttribute('fill', '#ffffff');
      circle.setAttribute('stroke', color);
      circle.setAttribute('stroke-width', '1.5');
      circle.setAttribute('vector-effect', 'non-scaling-stroke');
      circle.setAttribute('pointer-events', 'all');
      circle.style.cursor = cursorForHandle(handle);
      group.append(circle);
    });

    if (this.drag?.currentSnap) {
      const snap = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      snap.setAttribute('cx', String(this.drag.currentSnap.point.x));
      snap.setAttribute('cy', String(this.drag.currentSnap.point.y));
      snap.setAttribute('r', String(radius * 1.7));
      snap.setAttribute('fill', 'none');
      snap.setAttribute('stroke', '#f59e0b');
      snap.setAttribute('stroke-width', '2');
      snap.setAttribute('vector-effect', 'non-scaling-stroke');
      snap.setAttribute('pointer-events', 'none');
      group.append(snap);
    }

    this.svg.append(group);
  }

  private removeOverlay(): void {
    this.svg?.querySelector('[data-piece-shape-modifier-overlay]')?.remove();
  }
}
