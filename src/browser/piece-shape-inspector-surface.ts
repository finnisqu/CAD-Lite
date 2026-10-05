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
import { createPieceCanvasProjection } from './piece-canvas-model';
import { pieceShapeCanvasPoint } from './piece-shape-edit-surface';

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

export class PieceShapeInspectorSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private inspector: HTMLElement | null = null;
  private svg: SVGSVGElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private observer: MutationObserver | null = null;
  private rendering = false;
  private scheduled = false;
  private selectedModifierId: string | null = null;
  private selectedPieceId: string | null = null;
  private knownModifierIds: string[] = [];
  private busy = false;
  private status = '';

  constructor(options: PieceShapeInspectorSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
  }

  mount(): void {
    if (this.unsubscribe || this.observer) return;
    this.inspector = this.root.querySelector<HTMLElement>('#lc-inspector');
    this.svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    if (!this.inspector || !this.svg) return;

    this.unsubscribe = this.store.subscribe(() => this.scheduleRender());
    const Observer = this.inspector.ownerDocument.defaultView?.MutationObserver;
    if (Observer) {
      this.observer = new Observer(() => this.scheduleRender());
      this.observer.observe(this.inspector, { childList: true, subtree: true });
    }
    this.render();
  }

  unmount(): void {
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
      return;
    }
    const ids = context.modifiers.map((item) => item.id);
    if (this.selectedPieceId !== context.piece.id) {
      this.selectedPieceId = context.piece.id;
      this.selectedModifierId = null;
      this.knownModifierIds = ids;
      return;
    }
    const added = ids.find((id) => !this.knownModifierIds.includes(id));
    if (added) this.selectedModifierId = added;
    if (this.selectedModifierId && !ids.includes(this.selectedModifierId)) {
      this.selectedModifierId = null;
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

  private renderOverlay(context: ShapeInspectorContext | null): void {
    this.removeOverlay();
    if (!context || !this.selectedModifierId || !this.svg) return;
    const modifier = context.modifiers.find((item) => item.id === this.selectedModifierId);
    if (!modifier) return;
    const projection = createPieceCanvasProjection(this.store.getState());
    const item = projection.pieces.find((candidate) => candidate.id === context.piece.id);
    if (!item) return;
    const corners = [
      { x: modifier.x, y: modifier.y },
      { x: modifier.x + modifier.w, y: modifier.y },
      { x: modifier.x + modifier.w, y: modifier.y + modifier.h },
      { x: modifier.x, y: modifier.y + modifier.h },
    ].map((point) => pieceShapeCanvasPoint(item, point));
    const polygon = this.svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.dataset.pieceShapeModifierOverlay = modifier.id;
    polygon.setAttribute('points', corners.map((point) => `${point.x},${point.y}`).join(' '));
    polygon.setAttribute('fill', modifier.operation === 'add' ? 'rgb(37 99 235 / 8%)' : 'rgb(220 38 38 / 8%)');
    polygon.setAttribute('stroke', modifier.operation === 'add' ? '#2563eb' : '#dc2626');
    polygon.setAttribute('stroke-width', '2');
    polygon.setAttribute('stroke-dasharray', '5 4');
    polygon.setAttribute('vector-effect', 'non-scaling-stroke');
    polygon.setAttribute('pointer-events', 'none');
    this.svg.append(polygon);
  }

  private removeOverlay(): void {
    this.svg?.querySelector('[data-piece-shape-modifier-overlay]')?.remove();
  }
}
