import {
  pieceResizeLockedSides,
  setWorkspace,
  updatePreferences,
  type ApplicationEffects,
  type PieceInteractionController,
  type AppStore,
  type CommandDispatcher,
  type ToolPointerInput,
  type ViewInvalidationBatch,
} from '../app';
import {
  isBacksplashPiece,
  pieceRotationFamilyIds,
} from '../domain/pieces';
import { rotateVector } from '../geometry';
import {
  createPieceCanvasProjection,
  hitTestPieceCanvas,
  type PieceCanvasProjection,
} from './piece-canvas-model';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface PieceCanvasSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  effects: ApplicationEffects;
  interaction: PieceInteractionController;
}

export class PieceCanvasSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly effects: ApplicationEffects;
  private readonly interaction: PieceInteractionController;

  private abort: AbortController | null = null;
  private subscriptions: Array<() => void> = [];
  private svg: SVGSVGElement | null = null;
  private meta: HTMLElement | null = null;
  private designButton: HTMLButtonElement | null = null;
  private slabButton: HTMLButtonElement | null = null;
  private pieceSnapButton: HTMLButtonElement | null = null;
  private gridSnapButton: HTMLButtonElement | null = null;

  constructor(options: PieceCanvasSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
    this.effects = options.effects;
    this.interaction = options.interaction;
  }

  mount(): void {
    if (this.abort) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    this.meta = this.root.querySelector<HTMLElement>('#lc-canvas-meta');
    this.designButton =
      this.root.querySelector<HTMLButtonElement>('#lc-workspace-design');
    this.slabButton =
      this.root.querySelector<HTMLButtonElement>('#lc-workspace-slab');
    this.pieceSnapButton =
      this.root.querySelector<HTMLButtonElement>('#lc-piece-snap');
    this.gridSnapButton =
      this.root.querySelector<HTMLButtonElement>('#lc-grid-snap');

    this.designButton?.addEventListener(
      'click',
      () => this.commands.execute(setWorkspace('design')),
      { signal },
    );
    this.slabButton?.addEventListener(
      'click',
      () => this.commands.execute(setWorkspace('slab')),
      { signal },
    );
    this.pieceSnapButton?.addEventListener(
      'click',
      () => {
        const current = this.store.getState().preferences.pieceSnap;
        this.commands.execute(updatePreferences({ pieceSnap: !current }));
      },
      { signal },
    );
    this.gridSnapButton?.addEventListener(
      'click',
      () => {
        const current = this.store.getState().preferences.gridSnap;
        this.commands.execute(updatePreferences({ gridSnap: !current }));
      },
      { signal },
    );

    this.svg?.addEventListener(
      'pointerdown',
      (event) => this.onPointerDown(event),
      { signal },
    );
    this.svg?.addEventListener(
      'pointermove',
      (event) => this.onPointerMove(event),
      { signal },
    );
    this.svg?.addEventListener(
      'pointerup',
      (event) => this.onPointerUp(event),
      { signal },
    );
    this.svg?.addEventListener(
      'pointercancel',
      (event) => this.onPointerCancel(event),
      { signal },
    );
    this.svg?.addEventListener(
      'dblclick',
      (event) => this.onDoubleClick(event),
      { signal },
    );

    const view = this.svg?.ownerDocument.defaultView;
    view?.addEventListener(
      'keydown',
      (event) => this.onKeyDown(event),
      { signal },
    );
    view?.addEventListener(
      'keyup',
      (event) => this.onKeyUp(event),
      { signal },
    );

    this.subscriptions.push(
      this.effects.invalidation.subscribe((batch) =>
        this.renderInvalidation(batch),
      ),
    );

    this.render();
  }

  unmount(): void {
    this.interaction.cancel();
    this.abort?.abort();
    this.abort = null;
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions = [];
  }

  render(): void {
    const preview = this.interaction.getPreview();
    const projection = createPieceCanvasProjection(
      this.store.getState(),
      preview?.pieces ?? [],
    );
    this.renderWorkspaceControls(projection);
    this.renderSvg(projection);
  }

  private renderInvalidation(batch: ViewInvalidationBatch): void {
    if (
      batch.targets.includes('canvas') ||
      batch.targets.includes('toolbar')
    ) {
      this.render();
    }
  }

  private currentProjection(): PieceCanvasProjection {
    const preview = this.interaction.getPreview();
    return createPieceCanvasProjection(
      this.store.getState(),
      preview?.pieces ?? [],
    );
  }

  private eventInput(
    event: PointerEvent,
    projection: PieceCanvasProjection,
  ): ToolPointerInput | null {
    const svg = this.svg;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    return {
      pointerId: event.pointerId,
      x:
        ((event.clientX - rect.left) / rect.width) *
        projection.canvas.width,
      y:
        ((event.clientY - rect.top) / rect.height) *
        projection.canvas.height,
      button: event.button,
      buttons: event.buttons,
      modifiers: {
        shift: event.shiftKey,
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
      },
    };
  }

  private onPointerDown(event: PointerEvent): void {
    const projection = this.currentProjection();
    const input = this.eventInput(event, projection);
    if (!input) return;

    const target =
      event.target instanceof Element ? event.target : null;
    const rotate = target?.closest<SVGElement>(
      '[data-piece-rotate-handle]',
    );
    const resize = target?.closest<SVGElement>(
      '[data-piece-resize-side][data-piece-id]',
    );
    const resizeSide = resize?.dataset.pieceResizeSide;
    const resizePieceId = resize?.dataset.pieceId;
    let handled = false;

    if (rotate && event.detail <= 1) {
      handled = this.interaction.beginRotate(input);
    }

    if (
      !handled &&
      resizePieceId &&
      (resizeSide === 'top' ||
        resizeSide === 'right' ||
        resizeSide === 'bottom' ||
        resizeSide === 'left')
    ) {
      handled = this.interaction.beginResize(
        resizePieceId,
        resizeSide,
        input,
      );
    }

    if (!handled && !rotate) {
      const hit = hitTestPieceCanvas(projection, {
        x: input.x,
        y: input.y,
      });
      handled = hit
        ? this.interaction.beginPiece(hit.id, input)
        : this.interaction.beginBlank(input);
    }

    if (!handled) return;
    event.preventDefault();
    this.svg?.setPointerCapture?.(event.pointerId);
    this.render();
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.interaction.hasActivePointer()) return;
    const projection = this.currentProjection();
    const input = this.eventInput(event, projection);
    if (!input) return;

    if (this.interaction.pointerMove(input)) {
      event.preventDefault();
      this.render();
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.interaction.hasActivePointer()) return;
    const projection = this.currentProjection();
    const input = this.eventInput(event, projection);
    if (!input) return;

    if (this.interaction.pointerUp({ ...input, buttons: 0 })) {
      event.preventDefault();
    }
    try {
      this.svg?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
    this.render();
  }

  private onPointerCancel(event: PointerEvent): void {
    if (!this.interaction.hasActivePointer()) return;
    this.interaction.cancel();
    try {
      this.svg?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
    this.render();
  }

  private onDoubleClick(event: MouseEvent): void {
    const target =
      event.target instanceof Element ? event.target : null;
    if (!target?.closest('[data-piece-rotate-handle]')) return;

    event.preventDefault();
    event.stopPropagation();
    if (this.interaction.hasActivePointer()) {
      this.interaction.cancel();
    }
    this.interaction.rotateSelectionBy(90);
    this.render();
  }

  private editableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest('input,textarea,select,[contenteditable="true"]'),
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.editableTarget(event.target)) return;
    if (
      this.interaction.nudgeKeyDown(
        event.key,
        event.shiftKey,
      )
    ) {
      event.preventDefault();
      this.render();
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (this.editableTarget(event.target)) return;
    if (this.interaction.nudgeKeyUp(event.key)) {
      event.preventDefault();
      this.render();
    }
  }

  private renderWorkspaceControls(
    projection: PieceCanvasProjection,
  ): void {
    const state = this.store.getState();
    const design = projection.workspace === 'design';
    this.designButton?.classList.toggle('is-active', design);
    this.slabButton?.classList.toggle('is-active', !design);
    this.designButton?.setAttribute('aria-pressed', String(design));
    this.slabButton?.setAttribute('aria-pressed', String(!design));

    this.pieceSnapButton?.classList.toggle(
      'is-active',
      state.preferences.pieceSnap,
    );
    this.gridSnapButton?.classList.toggle(
      'is-active',
      state.preferences.gridSnap,
    );
    this.pieceSnapButton?.setAttribute(
      'aria-pressed',
      String(state.preferences.pieceSnap),
    );
    this.gridSnapButton?.setAttribute(
      'aria-pressed',
      String(state.preferences.gridSnap),
    );

    if (!this.meta) return;
    if (!projection.layoutId) {
      this.meta.textContent = 'No active Layout';
      return;
    }

    const label = design ? 'DESIGN' : 'SLAB';
    this.meta.textContent =
      label +
      ' · ' +
      String(projection.canvas.width) +
      '" × ' +
      String(projection.canvas.height) +
      '" · ' +
      String(projection.pieces.length) +
      ' Piece' +
      (projection.pieces.length === 1 ? '' : 's') +
      ' · ' +
      String(projection.scale) +
      ' px/in';
  }

  private renderSvg(projection: PieceCanvasProjection): void {
    const svg = this.svg;
    if (!svg) return;

    const scale = Math.max(0.001, Math.abs(projection.scale || 1));
    const width = Math.max(0, projection.canvas.width);
    const height = Math.max(0, projection.canvas.height);

    svg.replaceChildren();
    svg.dataset.workspace = projection.workspace;
    svg.setAttribute('width', String(Math.max(1, width * scale)));
    svg.setAttribute('height', String(Math.max(1, height * scale)));
    svg.setAttribute(
      'viewBox',
      '0 0 ' + String(width) + ' ' + String(height),
    );

    if (!projection.layoutId) return;

    const document = svg.ownerDocument;
    const background = document.createElementNS(SVG_NS, 'rect');
    background.setAttribute('class', 'lc-canvas-background');
    background.setAttribute('x', '0');
    background.setAttribute('y', '0');
    background.setAttribute('width', String(width));
    background.setAttribute('height', String(height));
    background.setAttribute('fill', '#ffffff');
    background.setAttribute('stroke', '#e5e7eb');
    background.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(background);

    projection.pieces.forEach((piece) => {
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', 'lc-piece-render');
      group.setAttribute('data-piece-id', piece.id);
      group.setAttribute('data-piece-layer', String(piece.layer));
      group.setAttribute('pointer-events', 'none');

      if (piece.renderRotation !== 0) {
        group.setAttribute(
          'transform',
          'rotate(' +
            String(piece.renderRotation) +
            ', ' +
            String(piece.center.x) +
            ', ' +
            String(piece.center.y) +
            ')',
        );
      }

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'lc-piece-shape');
      path.setAttribute('d', piece.path);
      path.setAttribute('fill', piece.appearance.fill);
      path.setAttribute('stroke', piece.appearance.stroke);
      path.setAttribute('stroke-width', '1');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      if (piece.appearance.fillOpacity !== null) {
        path.setAttribute(
          'fill-opacity',
          String(piece.appearance.fillOpacity),
        );
      }
      group.appendChild(path);

      if (piece.selected) {
        const outline = document.createElementNS(SVG_NS, 'path');
        outline.setAttribute('class', 'lc-selection-outline');
        outline.setAttribute('d', piece.path);
        outline.setAttribute('fill', 'none');
        outline.setAttribute('stroke', '#0ea5e9');
        outline.setAttribute('stroke-width', '2');
        outline.setAttribute('vector-effect', 'non-scaling-stroke');
        group.appendChild(outline);
      }

      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = piece.name;
      group.appendChild(title);
      svg.appendChild(group);
    });

    this.renderSnapGuides(document, svg, projection);
    this.renderResizeHandles(document, svg, projection);
    this.renderRotateHandle(document, svg, projection);
  }

  private renderSnapGuides(
    document: Document,
    svg: SVGSVGElement,
    projection: PieceCanvasProjection,
  ): void {
    const preview = this.interaction.getPreview();
    if (!preview) return;

    if (preview.guideX !== null) {
      const guide = document.createElementNS(SVG_NS, 'line');
      guide.setAttribute('class', 'lc-smart-guide');
      guide.setAttribute('x1', String(preview.guideX));
      guide.setAttribute('x2', String(preview.guideX));
      guide.setAttribute('y1', '0');
      guide.setAttribute('y2', String(projection.canvas.height));
      guide.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(guide);
    }

    if (preview.guideY !== null) {
      const guide = document.createElementNS(SVG_NS, 'line');
      guide.setAttribute('class', 'lc-smart-guide');
      guide.setAttribute('x1', '0');
      guide.setAttribute('x2', String(projection.canvas.width));
      guide.setAttribute('y1', String(preview.guideY));
      guide.setAttribute('y2', String(preview.guideY));
      guide.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(guide);
    }
  }

  private renderRotateHandle(
    document: Document,
    svg: SVGSVGElement,
    projection: PieceCanvasProjection,
  ): void {
    const state = this.store.getState();
    const selection = state.session.selection;
    if (
      state.session.interaction.activeTool ||
      selection.kind !== 'pieces' ||
      !selection.ids.length
    ) {
      return;
    }

    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    if (!layout) return;

    const ids = pieceRotationFamilyIds(
      layout,
      selection.ids,
      projection.workspace,
    );
    const primaryId = ids[0];
    if (!primaryId) return;

    const piece = projection.pieces.find(
      (item) => item.id === primaryId,
    );
    if (!piece) return;

    const u = rotateVector(1, 0, piece.pose.rotation);
    const v = rotateVector(0, 1, piece.pose.rotation);
    const anchor = {
      x:
        piece.center.x +
        u.x * (piece.geometry.width / 2) -
        v.x * (piece.geometry.height / 2),
      y:
        piece.center.y +
        u.y * (piece.geometry.width / 2) -
        v.y * (piece.geometry.height / 2),
    };
    const diagonal = {
      x: u.x - v.x,
      y: u.y - v.y,
    };
    const diagonalLength =
      Math.hypot(diagonal.x, diagonal.y) || 1;
    const unit = 1 / Math.max(0.001, projection.scale);
    const extension = 18 * unit;
    const handle = {
      x:
        anchor.x +
        diagonal.x / diagonalLength * extension,
      y:
        anchor.y +
        diagonal.y / diagonalLength * extension,
    };

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.setAttribute('class', 'lc-piece-rotate-layer');

    const stem = document.createElementNS(SVG_NS, 'line');
    stem.setAttribute('class', 'lc-piece-rotate-stem');
    stem.setAttribute('x1', String(anchor.x));
    stem.setAttribute('y1', String(anchor.y));
    stem.setAttribute('x2', String(handle.x));
    stem.setAttribute('y2', String(handle.y));
    stem.setAttribute('vector-effect', 'non-scaling-stroke');
    stem.setAttribute('pointer-events', 'none');

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('class', 'lc-piece-rotate-handle');
    circle.setAttribute('data-piece-rotate-handle', '1');
    circle.setAttribute('cx', String(handle.x));
    circle.setAttribute('cy', String(handle.y));
    circle.setAttribute('r', String(7 * unit));
    circle.setAttribute('vector-effect', 'non-scaling-stroke');
    circle.setAttribute('pointer-events', 'all');
    circle.style.cursor = 'grab';

    const glyph = document.createElementNS(SVG_NS, 'text');
    glyph.setAttribute('class', 'lc-piece-rotate-glyph');
    glyph.setAttribute('x', String(handle.x));
    glyph.setAttribute('y', String(handle.y));
    glyph.setAttribute('text-anchor', 'middle');
    glyph.setAttribute('dominant-baseline', 'middle');
    glyph.setAttribute('pointer-events', 'none');
    glyph.setAttribute('font-size', String(10 * unit));
    glyph.textContent = '↻';

    layer.append(stem, circle, glyph);

    const preview = this.interaction.getPreview();
    if (preview?.kind === 'rotate') {
      const rotated = preview.pieces.find(
        (item) => item.id === primaryId,
      );
      if (rotated) {
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('class', 'lc-piece-rotate-angle');
        label.setAttribute('x', String(handle.x + 11 * unit));
        label.setAttribute('y', String(handle.y - 9 * unit));
        label.setAttribute('pointer-events', 'none');
        label.setAttribute('font-size', String(10 * unit));
        label.textContent =
          String(Math.round(rotated.pose.rotation * 10) / 10) + '°';
        layer.appendChild(label);
      }
    }

    svg.appendChild(layer);
  }

  private renderResizeHandles(
    document: Document,
    svg: SVGSVGElement,
    projection: PieceCanvasProjection,
  ): void {
    const state = this.store.getState();
    if (
      projection.workspace !== 'design' ||
      state.session.interaction.activeTool ||
      state.session.selection.kind !== 'pieces' ||
      state.session.selection.ids.length !== 1
    ) {
      return;
    }

    const id = state.session.selection.ids[0];
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    const piece = layout?.pieces.find((item) => item.id === id);
    const projected = projection.pieces.find((item) => item.id === id);
    if (!piece || !projected || isBacksplashPiece(piece)) return;

    const locked = pieceResizeLockedSides(piece);
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'lc-piece-resize-layer');
    group.setAttribute('data-piece-id', piece.id);
    if (projected.renderRotation !== 0) {
      group.setAttribute(
        'transform',
        'rotate(' +
          String(projected.renderRotation) +
          ', ' +
          String(projected.center.x) +
          ', ' +
          String(projected.center.y) +
          ')',
      );
    }

    const unit = 1 / Math.max(0.001, projection.scale);
    const long = 28 * unit;
    const short = 8 * unit;
    const left = projected.localRect.x;
    const top = projected.localRect.y;
    const right = left + projected.localRect.w;
    const bottom = top + projected.localRect.h;
    const cx = projected.center.x;
    const cy = projected.center.y;
    const handles = {
      top: {
        x: cx - long / 2,
        y: top - short / 2,
        w: long,
        h: short,
        cursor: 'ns-resize',
      },
      right: {
        x: right - short / 2,
        y: cy - long / 2,
        w: short,
        h: long,
        cursor: 'ew-resize',
      },
      bottom: {
        x: cx - long / 2,
        y: bottom - short / 2,
        w: long,
        h: short,
        cursor: 'ns-resize',
      },
      left: {
        x: left - short / 2,
        y: cy - long / 2,
        w: short,
        h: long,
        cursor: 'ew-resize',
      },
    } as const;

    (['top', 'right', 'bottom', 'left'] as const).forEach((side) => {
      if (locked.has(side)) return;
      const item = handles[side];
      const handle = document.createElementNS(SVG_NS, 'rect');
      handle.setAttribute('class', 'lc-piece-resize-handle');
      handle.setAttribute('data-piece-id', piece.id);
      handle.setAttribute('data-piece-resize-side', side);
      handle.setAttribute('x', String(item.x));
      handle.setAttribute('y', String(item.y));
      handle.setAttribute('width', String(item.w));
      handle.setAttribute('height', String(item.h));
      handle.setAttribute('rx', String(3 * unit));
      handle.setAttribute('vector-effect', 'non-scaling-stroke');
      handle.setAttribute('pointer-events', 'all');
      handle.style.cursor = item.cursor;
      group.appendChild(handle);
    });

    svg.appendChild(group);
  }
}
