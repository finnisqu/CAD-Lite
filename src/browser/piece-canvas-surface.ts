import {
  pieceResizeLockedSides,
  setSelection,
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
  hitTestSlabCanvas,
  type PieceCanvasProjection,
} from './piece-canvas-model';
import {
  createAnnotationCanvasProjection,
  hitTestAnnotations,
  type AnnotationCanvasProjection,
} from './annotation-canvas-model';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface PieceCanvasSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  effects: ApplicationEffects;
  interaction: PieceInteractionController;
}

function formatCanvasInches(
  value: number,
  format: 'fraction' | 'decimal',
  precision: 1 | 2 | 4 | 8 | 16,
): string {
  const absolute = Math.abs(Number(value) || 0);
  const round3 = Math.round(absolute * 1000) / 1000;

  if (format === 'decimal') {
    const text =
      Math.abs(round3 % 1) < 1e-9
        ? String(Math.round(round3))
        : round3.toFixed(3).replace(/\.?0+$/, '');
    return text + '"';
  }

  let whole = Math.floor(absolute);
  let numerator = Math.round((absolute - whole) * precision);
  if (numerator === precision) {
    whole += 1;
    numerator = 0;
  }
  if (numerator === 0) return String(whole) + '"';

  const gcd = (a: number, b: number): number =>
    b ? gcd(b, a % b) : a;
  const factor = gcd(numerator, precision);
  return (
    (whole ? String(whole) + ' ' : '') +
    String(numerator / factor) +
    '/' +
    String(precision / factor) +
    '"'
  );
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
  private showSeamsButton: HTMLButtonElement | null = null;
  private sinkCenterlineButton: HTMLButtonElement | null = null;
  private cutoutLabelButton: HTMLButtonElement | null = null;
  private slabMaterialButton: HTMLButtonElement | null = null;

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
    this.showSeamsButton =
      this.root.querySelector<HTMLButtonElement>('#lc-show-seams');
    this.sinkCenterlineButton =
      this.root.querySelector<HTMLButtonElement>(
        '#lc-show-sink-centerlines',
      );
    this.cutoutLabelButton =
      this.root.querySelector<HTMLButtonElement>(
        '#lc-show-cutout-labels',
      );
    this.slabMaterialButton =
      this.root.querySelector<HTMLButtonElement>(
        '#lc-show-slab-material',
      );

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
    this.showSeamsButton?.addEventListener(
      'click',
      () => {
        const current = this.store.getState().preferences.showSeams;
        this.commands.execute(updatePreferences({ showSeams: !current }));
      },
      { signal },
    );
    this.sinkCenterlineButton?.addEventListener(
      'click',
      () => {
        const current =
          this.store.getState().preferences.showSinkCenterlines;
        this.commands.execute(
          updatePreferences({ showSinkCenterlines: !current }),
        );
      },
      { signal },
    );
    this.cutoutLabelButton?.addEventListener(
      'click',
      () => {
        const current =
          this.store.getState().preferences.showCutoutLabels;
        this.commands.execute(
          updatePreferences({ showCutoutLabels: !current }),
        );
      },
      { signal },
    );
    this.slabMaterialButton?.addEventListener(
      'click',
      () => {
        const current =
          this.store.getState().preferences.showSlabMaterial;
        this.commands.execute(
          updatePreferences({ showSlabMaterial: !current }),
        );
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
    const state = this.store.getState();
    const projection = createPieceCanvasProjection(
      state,
      preview?.pieces ?? [],
    );
    const annotations = createAnnotationCanvasProjection(state);
    this.renderWorkspaceControls(projection);
    this.renderSvg(projection, annotations);
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
      const point = { x: input.x, y: input.y };
      if (projection.workspace === 'design') {
        const annotation = hitTestAnnotations(
          createAnnotationCanvasProjection(this.store.getState()),
          point,
          projection.scale,
        );
        if (annotation) {
          this.commands.execute(setSelection(annotation));
          event.preventDefault();
          this.render();
          return;
        }
      }
      const hit = hitTestPieceCanvas(projection, point);
      if (hit) {
        handled = this.interaction.beginPiece(hit.id, input);
      } else if (projection.workspace === 'slab') {
        const slab = hitTestSlabCanvas(projection, point);
        if (slab) {
          this.commands.execute(
            setSelection({ kind: 'slab', id: slab.id }),
          );
          event.preventDefault();
          this.render();
          return;
        }
        handled = this.interaction.beginBlank(input);
      } else {
        handled = this.interaction.beginBlank(input);
      }
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
    const addSlabButton =
      this.root.querySelector<HTMLButtonElement>('#lc-add-slab');
    if (addSlabButton) addSlabButton.hidden = design;
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
    this.showSeamsButton?.classList.toggle(
      'is-active',
      state.preferences.showSeams,
    );
    this.showSeamsButton?.setAttribute(
      'aria-pressed',
      String(state.preferences.showSeams),
    );
    this.sinkCenterlineButton?.classList.toggle(
      'is-active',
      state.preferences.showSinkCenterlines,
    );
    this.sinkCenterlineButton?.setAttribute(
      'aria-pressed',
      String(state.preferences.showSinkCenterlines),
    );
    this.cutoutLabelButton?.classList.toggle(
      'is-active',
      state.preferences.showCutoutLabels,
    );
    this.cutoutLabelButton?.setAttribute(
      'aria-pressed',
      String(state.preferences.showCutoutLabels),
    );
    if (this.slabMaterialButton) {
      this.slabMaterialButton.hidden = design;
      this.slabMaterialButton.classList.toggle(
        'is-active',
        state.preferences.showSlabMaterial,
      );
      this.slabMaterialButton.setAttribute(
        'aria-pressed',
        String(state.preferences.showSlabMaterial),
      );
    }

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
      (design
        ? ''
        : ' · ' +
          String(projection.slabs.length) +
          ' Slab' +
          (projection.slabs.length === 1 ? '' : 's')) +
      ' · ' +
      String(projection.scale) +
      ' px/in';
  }

  private renderSvg(
    projection: PieceCanvasProjection,
    annotations: AnnotationCanvasProjection,
  ): void {
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

    if (projection.workspace === 'slab') {
      const unit = 1 / Math.max(0.001, projection.scale);
      projection.slabs.forEach((slab) => {
        if (!slab.visible) return;
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'lc-slab-surface');
        group.setAttribute('data-slab-id', slab.id);
        group.setAttribute('pointer-events', 'none');

        const base = document.createElementNS(SVG_NS, 'rect');
        base.setAttribute('x', String(slab.bounds.x));
        base.setAttribute('y', String(slab.bounds.y));
        base.setAttribute('width', String(slab.bounds.w));
        base.setAttribute('height', String(slab.bounds.h));
        base.setAttribute('fill', '#f5f5f4');
        base.setAttribute('stroke', '#78716c');
        base.setAttribute('stroke-width', '1');
        base.setAttribute('vector-effect', 'non-scaling-stroke');
        group.appendChild(base);

        if (slab.imageSource) {
          const image = document.createElementNS(SVG_NS, 'image');
          image.setAttribute('href', slab.imageSource);
          image.setAttribute('x', String(slab.bounds.x));
          image.setAttribute('y', String(slab.bounds.y));
          image.setAttribute('width', String(slab.bounds.w));
          image.setAttribute('height', String(slab.bounds.h));
          image.setAttribute('preserveAspectRatio', 'none');
          image.setAttribute('opacity', String(slab.opacity));
          group.appendChild(image);
        }

        const usable = slab.usableBounds;
        if (
          usable.x !== slab.bounds.x ||
          usable.y !== slab.bounds.y ||
          usable.w !== slab.bounds.w ||
          usable.h !== slab.bounds.h
        ) {
          const allowance = document.createElementNS(SVG_NS, 'rect');
          allowance.setAttribute('class', 'lc-slab-usable-boundary');
          allowance.setAttribute('x', String(usable.x));
          allowance.setAttribute('y', String(usable.y));
          allowance.setAttribute('width', String(usable.w));
          allowance.setAttribute('height', String(usable.h));
          allowance.setAttribute('fill', 'none');
          allowance.setAttribute('stroke', '#b45309');
          allowance.setAttribute('stroke-width', '1');
          allowance.setAttribute('stroke-dasharray', '5 4');
          allowance.setAttribute('vector-effect', 'non-scaling-stroke');
          group.appendChild(allowance);
        }

        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('class', 'lc-slab-label');
        label.setAttribute('x', String(slab.bounds.x + 4 * unit));
        label.setAttribute('y', String(slab.bounds.y + 13 * unit));
        label.setAttribute('font-size', String(11 * unit));
        label.setAttribute('font-weight', '700');
        label.setAttribute('fill', '#44403c');
        label.textContent = slab.name;
        group.appendChild(label);

        if (slab.selected) {
          const selected = document.createElementNS(SVG_NS, 'rect');
          selected.setAttribute('class', 'lc-slab-selection-outline');
          selected.setAttribute('x', String(slab.bounds.x));
          selected.setAttribute('y', String(slab.bounds.y));
          selected.setAttribute('width', String(slab.bounds.w));
          selected.setAttribute('height', String(slab.bounds.h));
          selected.setAttribute('fill', 'none');
          selected.setAttribute('stroke', '#0ea5e9');
          selected.setAttribute('stroke-width', '2');
          selected.setAttribute('vector-effect', 'non-scaling-stroke');
          group.appendChild(selected);
        }

        const title = document.createElementNS(SVG_NS, 'title');
        title.textContent =
          slab.name +
          ' · ' +
          String(slab.bounds.w) +
          '" × ' +
          String(slab.bounds.h) +
          '"';
        group.appendChild(title);
        svg.appendChild(group);
      });
    }

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

      this.renderPieceSinks(document, group, piece, projection);
      this.renderPieceCutouts(document, group, piece, projection);

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

      piece.seams.forEach((seam) => {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute(
          'class',
          seam.kind === 'fabrication'
            ? 'lc-fabrication-seam'
            : 'lc-piece-seam',
        );
        line.setAttribute('data-seam-id', seam.id);
        line.setAttribute('x1', String(seam.x1));
        line.setAttribute('y1', String(seam.y1));
        line.setAttribute('x2', String(seam.x2));
        line.setAttribute('y2', String(seam.y2));
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', '#111111');
        line.setAttribute(
          'stroke-width',
          seam.kind === 'fabrication'
            ? '2.5'
            : projection.workspace === 'slab'
              ? '1.5'
              : '2',
        );
        line.setAttribute(
          'stroke-dasharray',
          projection.workspace === 'slab' ? '6 4' : '8 4',
        );
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        line.setAttribute('pointer-events', 'none');
        group.appendChild(line);
      });

      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = piece.name;
      group.appendChild(title);
      svg.appendChild(group);
    });

    this.renderAnnotations(document, svg, projection, annotations);
    this.renderSnapGuides(document, svg, projection);
    this.renderResizeHandles(document, svg, projection);
    this.renderRotateHandle(document, svg, projection);
  }

  private renderAnnotations(
    document: Document,
    svg: SVGSVGElement,
    projection: PieceCanvasProjection,
    annotations: AnnotationCanvasProjection,
  ): void {
    if (projection.workspace !== 'design') return;

    const unit = 1 / Math.max(0.001, projection.scale);
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.setAttribute('class', 'lc-annotations-layer');
    layer.setAttribute('pointer-events', 'none');

    annotations.dimensions.forEach((dimension) => {
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute(
        'class',
        'lc-manual-dimension' + (dimension.selected ? ' selected' : ''),
      );
      group.setAttribute('data-dimension-id', dimension.id);

      const witnessA = document.createElementNS(SVG_NS, 'line');
      witnessA.setAttribute('x1', String(dimension.x1));
      witnessA.setAttribute('y1', String(dimension.y1));
      witnessA.setAttribute('x2', String(dimension.displayStart.x));
      witnessA.setAttribute('y2', String(dimension.displayStart.y));

      const witnessB = document.createElementNS(SVG_NS, 'line');
      witnessB.setAttribute('x1', String(dimension.x2));
      witnessB.setAttribute('y1', String(dimension.y2));
      witnessB.setAttribute('x2', String(dimension.displayEnd.x));
      witnessB.setAttribute('y2', String(dimension.displayEnd.y));

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(dimension.displayStart.x));
      line.setAttribute('y1', String(dimension.displayStart.y));
      line.setAttribute('x2', String(dimension.displayEnd.x));
      line.setAttribute('y2', String(dimension.displayEnd.y));

      [witnessA, witnessB, line].forEach((item) => {
        item.setAttribute(
          'stroke',
          dimension.selected ? '#0ea5e9' : '#111111',
        );
        item.setAttribute('stroke-width', dimension.selected ? '2' : '1');
        item.setAttribute('vector-effect', 'non-scaling-stroke');
      });

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute(
        'x',
        String((dimension.displayStart.x + dimension.displayEnd.x) / 2),
      );
      label.setAttribute(
        'y',
        String((dimension.displayStart.y + dimension.displayEnd.y) / 2 - 4 * unit),
      );
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', String(11 * unit));
      label.setAttribute('font-weight', dimension.selected ? '700' : '500');
      label.setAttribute('fill', dimension.selected ? '#0ea5e9' : '#111111');
      label.textContent = formatCanvasInches(
        dimension.length,
        this.store.getState().preferences.dimFormat,
        this.store.getState().preferences.dimPrecision,
      );

      group.append(witnessA, witnessB, line, label);
      layer.appendChild(group);
    });

    annotations.lines.forEach((source) => {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute(
        'class',
        'lc-drawing-line' + (source.selected ? ' selected' : ''),
      );
      line.setAttribute('data-line-id', source.id);
      line.setAttribute('x1', String(source.x1));
      line.setAttribute('y1', String(source.y1));
      line.setAttribute('x2', String(source.x2));
      line.setAttribute('y2', String(source.y2));
      line.setAttribute('stroke', source.selected ? '#0ea5e9' : source.color);
      line.setAttribute(
        'stroke-width',
        String(source.selected ? Math.max(source.thickness, 2) : source.thickness),
      );
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      if (source.style === 'dashed') line.setAttribute('stroke-dasharray', '7 5');
      layer.appendChild(line);

      const capRadius = Math.max(2.5, source.thickness + 1) * unit;
      if (source.startCap === 'dot') {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', String(source.x1));
        dot.setAttribute('cy', String(source.y1));
        dot.setAttribute('r', String(capRadius));
        dot.setAttribute('fill', source.selected ? '#0ea5e9' : source.color);
        layer.appendChild(dot);
      }
      if (source.endCap === 'dot') {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', String(source.x2));
        dot.setAttribute('cy', String(source.y2));
        dot.setAttribute('r', String(capRadius));
        dot.setAttribute('fill', source.selected ? '#0ea5e9' : source.color);
        layer.appendChild(dot);
      }
    });

    annotations.notes.forEach((note) => {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute(
        'class',
        'lc-canvas-note' + (note.selected ? ' selected' : ''),
      );
      text.setAttribute('data-note-id', note.id);
      text.setAttribute('x', String(note.x));
      text.setAttribute('y', String(note.y));
      text.setAttribute('font-size', String(note.fontSize * unit));
      text.setAttribute('font-weight', note.bold ? '700' : '400');
      text.setAttribute('font-style', note.italic ? 'italic' : 'normal');
      text.setAttribute(
        'text-anchor',
        note.align === 'center' ? 'middle' : note.align === 'right' ? 'end' : 'start',
      );
      text.setAttribute('fill', note.selected ? '#0ea5e9' : note.color);
      if (note.rotation) {
        text.setAttribute(
          'transform',
          'rotate(' + String(note.rotation) + ' ' + String(note.x) + ' ' + String(note.y) + ')',
        );
      }
      if (note.halo) {
        text.setAttribute('paint-order', 'stroke fill');
        text.setAttribute('stroke', '#ffffff');
        text.setAttribute('stroke-width', String(3 * unit));
        text.setAttribute('stroke-linejoin', 'round');
      }
      text.textContent = note.text;
      layer.appendChild(text);
    });

    svg.appendChild(layer);
  }

  private renderPieceCutouts(
    document: Document,
    group: SVGGElement,
    piece: PieceCanvasProjection['pieces'][number],
    projection: PieceCanvasProjection,
  ): void {
    if (!piece.cutouts.length) return;

    const scale = Math.max(0.001, projection.scale);
    const unit = 1 / scale;
    const safePieceId = piece.id.replace(/[^a-z0-9_-]/gi, '_');
    const clipId = 'lc-cutout-clip-' + safePieceId;

    const defs = document.createElementNS(SVG_NS, 'defs');
    const clip = document.createElementNS(SVG_NS, 'clipPath');
    clip.setAttribute('id', clipId);
    clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
    const clipPath = document.createElementNS(SVG_NS, 'path');
    clipPath.setAttribute('d', piece.path);
    clip.appendChild(clipPath);
    defs.appendChild(clip);
    group.appendChild(defs);

    const layer = document.createElementNS(SVG_NS, 'g');
    layer.setAttribute('class', 'lc-piece-cutouts');
    layer.setAttribute('pointer-events', 'none');
    layer.setAttribute('clip-path', 'url(#' + clipId + ')');

    piece.cutouts.forEach((cutout) => {
      const cutoutGroup = document.createElementNS(SVG_NS, 'g');
      cutoutGroup.setAttribute('class', 'lc-piece-cutout');
      cutoutGroup.setAttribute('data-cutout-id', cutout.id);
      cutoutGroup.setAttribute(
        'transform',
        'translate(' +
          String(cutout.center.x) +
          ' ' +
          String(cutout.center.y) +
          ') rotate(' +
          String(cutout.localRotation) +
          ')',
      );

      const strokeWidth = cutout.polished ? 2 : 1;

      if (cutout.kind === 'circle') {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', '0');
        circle.setAttribute('cy', '0');
        circle.setAttribute(
          'r',
          String((cutout.diameter ?? cutout.width) / 2),
        );
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', '#333333');
        circle.setAttribute('stroke-width', String(strokeWidth));
        circle.setAttribute('vector-effect', 'non-scaling-stroke');
        cutoutGroup.appendChild(circle);
      } else if (cutout.kind === 'oval') {
        const ellipse = document.createElementNS(SVG_NS, 'ellipse');
        ellipse.setAttribute('cx', '0');
        ellipse.setAttribute('cy', '0');
        ellipse.setAttribute('rx', String(cutout.width / 2));
        ellipse.setAttribute('ry', String(cutout.height / 2));
        ellipse.setAttribute('fill', 'none');
        ellipse.setAttribute('stroke', '#333333');
        ellipse.setAttribute('stroke-width', String(strokeWidth));
        ellipse.setAttribute('vector-effect', 'non-scaling-stroke');
        cutoutGroup.appendChild(ellipse);
      } else if (cutout.path) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', cutout.path);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#333333');
        path.setAttribute('stroke-width', String(strokeWidth));
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        cutoutGroup.appendChild(path);
      }

      if (cutout.showLabel) {
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String(cutout.labelOffset.x));
        label.setAttribute(
          'y',
          String(
            cutout.labelOffset.y +
              (cutout.polished ? -2 * unit : 0),
          ),
        );
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('font-size', String(9 * unit));
        label.setAttribute('font-weight', '650');
        label.setAttribute('fill', '#111111');
        label.textContent = cutout.name;
        cutoutGroup.appendChild(label);

        if (cutout.polished) {
          const polished = document.createElementNS(SVG_NS, 'text');
          polished.setAttribute('x', String(cutout.labelOffset.x));
          polished.setAttribute(
            'y',
            String(cutout.labelOffset.y + 9 * unit),
          );
          polished.setAttribute('text-anchor', 'middle');
          polished.setAttribute('dominant-baseline', 'middle');
          polished.setAttribute('font-size', String(7.5 * unit));
          polished.setAttribute('font-weight', '700');
          polished.setAttribute('fill', '#111111');
          polished.textContent = 'POLISHED';
          cutoutGroup.appendChild(polished);
        }
      }

      layer.appendChild(cutoutGroup);
    });

    group.appendChild(layer);
  }

  private renderPieceSinks(
    document: Document,
    group: SVGGElement,
    piece: PieceCanvasProjection['pieces'][number],
    projection: PieceCanvasProjection,
  ): void {
    if (!piece.sinks.length) return;

    const scale = Math.max(0.001, projection.scale);
    const unit = 1 / scale;
    const sinkLayer = document.createElementNS(SVG_NS, 'g');
    sinkLayer.setAttribute('class', 'lc-piece-sinks');
    sinkLayer.setAttribute('pointer-events', 'none');

    let clipId: string | null = null;
    if (piece.sinks.some((sink) => sink.split)) {
      const safePieceId = piece.id.replace(/[^a-z0-9_-]/gi, '_');
      clipId = 'lc-sink-clip-' + safePieceId;
      const defs = document.createElementNS(SVG_NS, 'defs');
      const clip = document.createElementNS(SVG_NS, 'clipPath');
      clip.setAttribute('id', clipId);
      clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
      const clipPath = document.createElementNS(SVG_NS, 'path');
      clipPath.setAttribute('d', piece.path);
      clip.appendChild(clipPath);
      defs.appendChild(clip);
      group.appendChild(defs);
    }

    const shapes = document.createElementNS(SVG_NS, 'g');
    shapes.setAttribute('class', 'lc-piece-sink-shapes');
    if (clipId) {
      shapes.setAttribute('clip-path', 'url(#' + clipId + ')');
    }
    sinkLayer.appendChild(shapes);

    const preferences = this.store.getState().preferences;
    const sides = piece.sinks.map((sink) => sink.side);

    piece.sinks.forEach((sink, sinkIndex) => {
      const sinkGroup = document.createElementNS(SVG_NS, 'g');
      sinkGroup.setAttribute('class', 'lc-piece-sink');
      sinkGroup.setAttribute('data-sink-id', sink.id);
      sinkGroup.setAttribute(
        'transform',
        'translate(' +
          String(sink.center.x) +
          ' ' +
          String(sink.center.y) +
          ') rotate(' +
          String(sink.localRotation) +
          ')',
      );

      if (sink.shape === 'oval') {
        const ellipse = document.createElementNS(SVG_NS, 'ellipse');
        ellipse.setAttribute('cx', '0');
        ellipse.setAttribute('cy', '0');
        ellipse.setAttribute('rx', String(sink.width / 2));
        ellipse.setAttribute('ry', String(sink.height / 2));
        ellipse.setAttribute('fill', 'none');
        ellipse.setAttribute('stroke', '#333333');
        ellipse.setAttribute('stroke-width', '1');
        ellipse.setAttribute('vector-effect', 'non-scaling-stroke');
        sinkGroup.appendChild(ellipse);
      } else if (sink.path) {
        const sinkPath = document.createElementNS(SVG_NS, 'path');
        sinkPath.setAttribute('d', sink.path);
        sinkPath.setAttribute('fill', 'none');
        sinkPath.setAttribute('stroke', '#333333');
        sinkPath.setAttribute('stroke-width', '1');
        sinkPath.setAttribute('vector-effect', 'non-scaling-stroke');
        sinkGroup.appendChild(sinkPath);
      }

      sink.faucets.forEach((hole) => {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(hole.x));
        circle.setAttribute('cy', String(hole.y));
        circle.setAttribute('r', String(hole.radius));
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', '#333333');
        circle.setAttribute('stroke-width', '1');
        circle.setAttribute('vector-effect', 'non-scaling-stroke');
        sinkGroup.appendChild(circle);
      });

      shapes.appendChild(sinkGroup);

      if (!sink.showCenterline) return;

      const sameSideBefore = sides
        .slice(0, sinkIndex)
        .filter((side) => side === sink.side).length;
      const design = projection.workspace === 'design';
      const pieceDimOffset = (design ? 12 : 10) * unit;
      const laneGap = (design ? 18 : 16) * unit;
      const tick = (design ? 6 : 5) * unit;

      const xL = piece.localRect.x;
      const xR = piece.localRect.x + piece.localRect.w;
      const yT = piece.localRect.y;
      const yB = piece.localRect.y + piece.localRect.h;

      if (sink.side === 'front' || sink.side === 'back') {
        const xCL = sink.center.x;
        const yDim =
          sink.side === 'back'
            ? yT - pieceDimOffset - laneGap * (sameSideBefore + 1)
            : yB + pieceDimOffset + laneGap * sameSideBefore;

        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(xL));
        line.setAttribute('y1', String(yDim));
        line.setAttribute('x2', String(xCL));
        line.setAttribute('y2', String(yDim));
        line.setAttribute('stroke', '#000000');
        line.setAttribute('vector-effect', 'non-scaling-stroke');

        const t1 = document.createElementNS(SVG_NS, 'line');
        t1.setAttribute('x1', String(xL));
        t1.setAttribute('y1', String(yDim - tick));
        t1.setAttribute('x2', String(xL));
        t1.setAttribute('y2', String(yDim + tick));
        t1.setAttribute('stroke', '#000000');
        t1.setAttribute('vector-effect', 'non-scaling-stroke');

        const t2 = document.createElementNS(SVG_NS, 'line');
        t2.setAttribute('x1', String(xCL));
        t2.setAttribute('y1', String(yDim - tick));
        t2.setAttribute('x2', String(xCL));
        t2.setAttribute('y2', String(yDim + tick));
        t2.setAttribute('stroke', '#000000');
        t2.setAttribute('vector-effect', 'non-scaling-stroke');

        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String((xL + xCL) / 2));
        label.setAttribute(
          'y',
          String(
            sink.side === 'back'
              ? yDim - 4 * unit
              : yDim + (design ? 14 : 13) * unit,
          ),
        );
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute(
          'font-size',
          String((design ? 12 : 11) * unit),
        );
        label.setAttribute('fill', '#111111');
        label.textContent =
          formatCanvasInches(
            sink.center.x - xL,
            preferences.dimFormat,
            preferences.dimPrecision,
          ) + ' CL';

        sinkLayer.append(line, t1, t2, label);
      } else {
        const yCL = sink.center.y;
        const xDim =
          sink.side === 'left'
            ? xL - pieceDimOffset - laneGap * (sameSideBefore + 1)
            : xR + pieceDimOffset + laneGap * sameSideBefore;

        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(xDim));
        line.setAttribute('y1', String(yT));
        line.setAttribute('x2', String(xDim));
        line.setAttribute('y2', String(yCL));
        line.setAttribute('stroke', '#000000');
        line.setAttribute('vector-effect', 'non-scaling-stroke');

        const t1 = document.createElementNS(SVG_NS, 'line');
        t1.setAttribute('x1', String(xDim - tick));
        t1.setAttribute('y1', String(yT));
        t1.setAttribute('x2', String(xDim + tick));
        t1.setAttribute('y2', String(yT));
        t1.setAttribute('stroke', '#000000');
        t1.setAttribute('vector-effect', 'non-scaling-stroke');

        const t2 = document.createElementNS(SVG_NS, 'line');
        t2.setAttribute('x1', String(xDim - tick));
        t2.setAttribute('y1', String(yCL));
        t2.setAttribute('x2', String(xDim + tick));
        t2.setAttribute('y2', String(yCL));
        t2.setAttribute('stroke', '#000000');
        t2.setAttribute('vector-effect', 'non-scaling-stroke');

        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute(
          'x',
          String(xDim + (sink.side === 'left' ? -4 : 4) * unit),
        );
        label.setAttribute('y', String((yT + yCL) / 2));
        label.setAttribute(
          'text-anchor',
          sink.side === 'left' ? 'end' : 'start',
        );
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute(
          'font-size',
          String((design ? 12 : 11) * unit),
        );
        label.setAttribute('fill', '#111111');
        label.textContent =
          formatCanvasInches(
            sink.center.y - yT,
            preferences.dimFormat,
            preferences.dimPrecision,
          ) + ' CL';

        sinkLayer.append(line, t1, t2, label);
      }
    });

    group.appendChild(sinkLayer);
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
