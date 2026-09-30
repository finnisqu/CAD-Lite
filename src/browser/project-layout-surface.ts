import { addPiece, deletePieces, duplicatePieces, renamePiece, assignPiecesToArea, setSelection } from '../app/commands';
import { preparePieceDuplication, getPieceDeletionPlan } from '../domain/pieces';
import {
  addArea,
  addLayout,
  deleteArea,
  deleteLayout,
  duplicateLayout,
  renameArea,
  renameLayout,
  setActiveArea,
  setActiveLayout,
  setLayoutQuantity,
  setProjectMeta,
  type ApplicationEffects,
  type AppStore,
  type CommandDispatcher,
  type ViewInvalidationBatch,
} from '../app';
import {
  createEmptyLayout,
  getAreaDeletionPlan,
} from '../domain/project';
import { createProjectLayoutViewModel } from './project-layout-model';

export type BrowserEntityIdFactory = (prefix: string) => string;
export type BrowserConfirm = (message: string) => boolean;

export interface ProjectLayoutSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  effects: ApplicationEffects;
  today?: () => string;
  createId?: BrowserEntityIdFactory;
  confirm?: BrowserConfirm;
}

let fallbackIdCounter = 0;

function localTodayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function defaultCreateId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;

  fallbackIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
}

function defaultConfirm(message: string): boolean {
  if (typeof window === 'undefined') return true;
  return window.confirm(message);
}

function elementTarget(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

export class ProjectLayoutSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly effects: ApplicationEffects;
  private readonly today: () => string;
  private readonly createId: BrowserEntityIdFactory;
  private readonly confirm: BrowserConfirm;

  private abort: AbortController | null = null;
  private subscriptions: Array<() => void> = [];
  private editingLayoutId: string | null = null;
  private editingAreaId: string | null = null;

  private projectInput: HTMLInputElement | null = null;
  private dateInput: HTMLInputElement | null = null;
  private notesInput: HTMLTextAreaElement | HTMLInputElement | null = null;
  private layoutsElement: HTMLElement | null = null;
  private addLayoutButton: HTMLButtonElement | null = null;
  private areasElement: HTMLElement | null = null;
  private addAreaButton: HTMLButtonElement | null = null;
  private inspectorElement: HTMLElement | null = null;
  private undoButton: HTMLButtonElement | null = null;
  private redoButton: HTMLButtonElement | null = null;
  private saveStatusElement: HTMLElement | null = null;

  constructor(options: ProjectLayoutSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
    this.effects = options.effects;
    this.today = options.today ?? localTodayIso;
    this.createId = options.createId ?? defaultCreateId;
    this.confirm = options.confirm ?? defaultConfirm;
  }

  mount(): void {
    if (this.abort) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;

    this.projectInput =
      this.root.querySelector<HTMLInputElement>('#lc-project');
    this.dateInput =
      this.root.querySelector<HTMLInputElement>('#lc-date');
    this.notesInput =
      this.root.querySelector<HTMLTextAreaElement | HTMLInputElement>(
        '#lc-notes',
      );
    this.layoutsElement =
      this.root.querySelector<HTMLElement>('#lc-layouts');
    this.addLayoutButton =
      this.root.querySelector<HTMLButtonElement>('#lc-add-layout');
    this.areasElement =
      this.root.querySelector<HTMLElement>('#lc-list');
    this.addAreaButton =
      this.root.querySelector<HTMLButtonElement>(
        '#lc-add-area, .lc-add-area-btn',
      );
    this.inspectorElement =
      this.root.querySelector<HTMLElement>('#lc-inspector');
    this.undoButton =
      this.root.querySelector<HTMLButtonElement>('#lc-undo');
    this.redoButton =
      this.root.querySelector<HTMLButtonElement>('#lc-redo');
    this.saveStatusElement =
      this.root.querySelector<HTMLElement>('#lc-save-status');

    this.projectInput?.addEventListener(
      'input',
      () => {
        this.commands.execute(
          setProjectMeta({ name: this.projectInput?.value ?? '' }),
        );
      },
      { signal },
    );

    this.dateInput?.addEventListener(
      'change',
      () => {
        if (!this.dateInput) return;
        const next = this.dateInput.value || this.today();
        this.dateInput.value = next;
        this.commands.execute(setProjectMeta({ date: next }));
      },
      { signal },
    );

    this.notesInput?.addEventListener(
      'input',
      () => {
        this.commands.execute(
          setProjectMeta({ notes: this.notesInput?.value ?? '' }),
        );
      },
      { signal },
    );

    this.layoutsElement?.addEventListener(
      'click',
      (event) => this.onLayoutsClick(event),
      { signal },
    );
    this.layoutsElement?.addEventListener(
      'keydown',
      (event) => this.onLayoutsKeyDown(event),
      { signal },
    );
    this.layoutsElement?.addEventListener(
      'focusout',
      (event) => this.onLayoutsFocusOut(event),
      { signal },
    );

    this.addLayoutButton?.addEventListener(
      'click',
      () => this.addNewLayout(),
      { signal },
    );

    this.areasElement?.addEventListener(
      'click',
      (event) => this.onAreasClick(event),
      { signal },
    );
    this.areasElement?.addEventListener(
      'keydown',
      (event) => this.onAreasKeyDown(event),
      { signal },
    );
    this.areasElement?.addEventListener(
      'focusout',
      (event) => this.onAreasFocusOut(event),
      { signal },
    );

    this.root.querySelector('#lc-add')?.addEventListener('click', () => {
      const id = this.store.getState().session.activeLayoutId;
      if (id) this.commands.execute(addPiece(id, this.createId('piece')));
    }, { signal });

    this.addAreaButton?.addEventListener(
      'click',
      () => this.addNewArea(),
      { signal },
    );

    this.inspectorElement?.addEventListener(
      'change',
      (event) => this.onInspectorChange(event),
      { signal },
    );

    this.undoButton?.addEventListener(
      'click',
      () => this.effects.history.undo(),
      { signal },
    );
    this.redoButton?.addEventListener(
      'click',
      () => this.effects.history.redo(),
      { signal },
    );

    this.subscriptions.push(
      this.effects.invalidation.subscribe((batch) =>
        this.renderInvalidation(batch),
      ),
      this.effects.history.subscribe(() => this.renderHistory()),
      this.effects.autosave.subscribe(() => this.renderAutosave()),
    );

    this.renderAll();
  }

  unmount(): void {
    this.abort?.abort();
    this.abort = null;
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions = [];
    this.editingLayoutId = null;
    this.editingAreaId = null;
  }

  renderAll(): void {
    this.renderProjectFields();
    this.renderLayouts();
    this.renderAreas();
    this.renderPieces();
    this.renderInspector();
    this.renderHistory();
    this.renderAutosave();
  }

  private renderInvalidation(batch: ViewInvalidationBatch): void {
    const targets = new Set(batch.targets);

    if (targets.has('navigator')) {
      this.renderProjectFields();
      this.renderLayouts();
      this.renderAreas();
      this.renderPieces();
    }

    if (targets.has('inspector')) {
      this.renderInspector();
    }

    if (targets.has('toolbar')) {
      this.renderHistory();
    }
  }

  private renderProjectFields(): void {
    const model = this.model();
    this.syncTextControl(this.projectInput, model.project.name);
    this.syncTextControl(this.dateInput, model.project.date);
    this.syncTextControl(this.notesInput, model.project.notes);
  }

  private syncTextControl(
    control: HTMLInputElement | HTMLTextAreaElement | null,
    value: string,
  ): void {
    if (!control) return;
    if (control.ownerDocument.activeElement === control) return;
    if (control.value !== value) control.value = value;
  }

  private renderLayouts(): void {
    const mount = this.layoutsElement;
    if (!mount) return;

    const document = mount.ownerDocument;
    const model = this.model();
    const fragment = document.createDocumentFragment();

    model.layouts.forEach((layout, index) => {
      const row = document.createElement('div');
      row.className =
        'lc-item nav lc-layout-item' +
        (layout.active ? ' is-active' : '') +
        (layout.selected ? ' selected' : '');
      row.dataset.layoutId = layout.id;
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute(
        'aria-label',
        `Select ${layout.name || `Layout ${index + 1}`}`,
      );

      const titleRow = document.createElement('div');
      titleRow.className = 'lc-layout-title-row';

      const title = document.createElement('div');
      title.className = 'lc-nav-title lc-layout-title';

      if (this.editingLayoutId === layout.id) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'lc-input';
        input.value = layout.name;
        input.dataset.cadLayoutRename = layout.id;
        input.setAttribute('aria-label', 'Rename layout');
        title.appendChild(input);
      } else {
        title.textContent =
          layout.name.trim() || `Layout ${index + 1}`;
        title.title = title.textContent;
      }

      const quantity = document.createElement('span');
      quantity.className = 'lc-layout-qty-text';
      quantity.textContent = `Qty ×${layout.quantity}`;
      quantity.title = 'Layout quantity';

      titleRow.append(title, quantity);
      row.appendChild(titleRow);

      const actions = document.createElement('div');
      actions.className = 'lc-layout-actions';

      const duplicate = this.actionButton(
        document,
        'Duplicate',
        'duplicate-layout',
        layout.id,
      );
      duplicate.classList.add('lc-layout-duplicate');

      const rename = this.actionButton(
        document,
        'Rename layout',
        'rename-layout',
        layout.id,
      );
      rename.classList.add('lc-rename-btn');
      rename.textContent = '✎';

      const remove = this.actionButton(
        document,
        'Delete layout',
        'delete-layout',
        layout.id,
      );
      remove.classList.add('lc-delete-btn', 'red');
      remove.textContent = '×';
      remove.disabled = model.layouts.length <= 1;

      actions.append(duplicate, rename, remove);
      row.appendChild(actions);
      fragment.appendChild(row);
    });

    mount.replaceChildren(fragment);
    this.focusRenameInput(
      mount,
      'cadLayoutRename',
      this.editingLayoutId,
    );
  }

  private renderAreas(): void {
    const mount = this.areasElement;
    if (!mount) return;

    const document = mount.ownerDocument;
    const model = this.model();
    const fragment = document.createDocumentFragment();

    model.areas.forEach((area) => {
      const row = document.createElement('div');
      row.className =
        'lc-area-header' +
        (area.active ? ' is-active' : '') +
        (area.selected ? ' is-selected' : '');
      row.dataset.areaId = area.id;
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', `Select ${area.name}`);

      const main = document.createElement('div');
      main.className = 'lc-area-header-main';

      const text = document.createElement('div');
      text.className = 'lc-area-header-text';

      const title = document.createElement('div');
      title.className = 'lc-area-header-title';

      if (this.editingAreaId === area.id) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'lc-input';
        input.value = area.name;
        input.dataset.cadAreaRename = area.id;
        input.setAttribute('aria-label', 'Rename area');
        title.appendChild(input);
      } else {
        title.textContent = area.name;
        title.title = area.name;
      }

      const meta = document.createElement('div');
      meta.className = 'lc-area-header-meta';
      meta.textContent =
        `${area.pieceCount} piece${area.pieceCount === 1 ? '' : 's'}`;

      text.append(title, meta);
      main.appendChild(text);

      const actions = document.createElement('div');
      actions.className = 'lc-area-header-actions';

      const rename = this.actionButton(
        document,
        'Rename area',
        'rename-area',
        area.id,
      );
      rename.classList.add('lc-rename-btn');
      rename.textContent = '✎';

      const remove = this.actionButton(
        document,
        'Delete area',
        'delete-area',
        area.id,
      );
      remove.classList.add('lc-delete-btn', 'red');
      remove.textContent = '×';
      remove.disabled = model.areas.length <= 1;

      actions.append(rename, remove);
      row.append(main, actions);
      fragment.appendChild(row);
    });

    mount.replaceChildren(fragment);
    this.focusRenameInput(
      mount,
      'cadAreaRename',
      this.editingAreaId,
    );
  }

  private actionButton(
    document: Document,
    title: string,
    action: string,
    id: string,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lc-btn ghost lc-iconbtn';
    button.dataset.action = action;
    button.dataset.entityId = id;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.textContent = title;
    return button;
  }

  private focusRenameInput(
    mount: HTMLElement,
    datasetKey: 'cadLayoutRename' | 'cadAreaRename',
    id: string | null,
  ): void {
    if (!id) return;

    queueMicrotask(() => {
      const input = Array.from(
        mount.querySelectorAll<HTMLInputElement>('input'),
      ).find((candidate) => candidate.dataset[datasetKey] === id);
      input?.focus();
      input?.select();
    });
  }

  private renderInspector(): void {
    const mount = this.inspectorElement;
    if (!mount) return;

    const model = this.model();
    mount.replaceChildren();

    if (model.selectedLayout) {
      this.renderLayoutInspector(model.selectedLayout);
      return;
    }

    if (model.selectedArea) {
      this.renderAreaInspector(model.selectedArea);
      return;
    }
    this.renderPieceInspector();
  }

  private renderLayoutInspector(
    selected: NonNullable<
      ReturnType<ProjectLayoutSurface['model']>['selectedLayout']
    >,
  ): void {
    const mount = this.inspectorElement;
    if (!mount) return;
    const document = mount.ownerDocument;

    const root = document.createElement('div');
    root.className =
      'lc-item selected lc-annotation-inspector lc-layout-inspector';

    const heading = document.createElement('div');
    heading.className = 'lc-inspector-context-title';
    heading.textContent = selected.name || 'Layout';

    const fields = document.createElement('div');
    fields.className = 'lc-subcard-body';
    fields.append(
      this.inspectorInput(
        document,
        'Name',
        'text',
        selected.name,
        'layout-name',
        selected.id,
      ),
      this.inspectorInput(
        document,
        'Quantity',
        'number',
        String(selected.quantity),
        'layout-quantity',
        selected.id,
      ),
    );

    const summary = document.createElement('div');
    summary.className = 'lc-small lc-layout-architecture-summary';
    summary.textContent =
      `${selected.areaCount} area${selected.areaCount === 1 ? '' : 's'} · ` +
      `${selected.pieceCount} piece${selected.pieceCount === 1 ? '' : 's'}`;
    fields.appendChild(summary);

    root.append(heading, fields);
    mount.appendChild(root);
  }

  private renderAreaInspector(
    selected: NonNullable<
      ReturnType<ProjectLayoutSurface['model']>['selectedArea']
    >,
  ): void {
    const mount = this.inspectorElement;
    if (!mount) return;
    const document = mount.ownerDocument;

    const root = document.createElement('div');
    root.className =
      'lc-item selected lc-annotation-inspector lc-area-inspector';

    const heading = document.createElement('div');
    heading.className = 'lc-inspector-context-title';
    heading.textContent = selected.name || 'Area';

    const fields = document.createElement('div');
    fields.className = 'lc-subcard-body';
    fields.append(
      this.inspectorInput(
        document,
        'Name',
        'text',
        selected.name,
        'area-name',
        selected.id,
      ),
    );

    const summary = document.createElement('div');
    summary.className = 'lc-small';
    summary.textContent =
      `${selected.pieceCount} piece${selected.pieceCount === 1 ? '' : 's'}`;
    fields.appendChild(summary);

    root.append(heading, fields);
    mount.appendChild(root);
  }

  private inspectorInput(
    document: Document,
    labelText: string,
    type: 'text' | 'number',
    value: string,
    field:
      | 'layout-name'
      | 'layout-quantity'
      | 'area-name',
    id: string,
  ): HTMLElement {
    const label = document.createElement('label');
    label.className = 'lc-field';

    const text = document.createElement('span');
    text.className = 'lc-small';
    text.textContent = labelText;

    const input = document.createElement('input');
    input.type = type;
    input.className = 'lc-input';
    input.value = value;
    input.dataset.cadInspectorField = field;
    input.dataset.entityId = id;

    if (type === 'number') {
      input.min = '1';
      input.max = '9999';
      input.step = '1';
    }

    label.append(text, input);
    return label;
  }

  private renderHistory(): void {
    const status = this.effects.history.getStatus();

    if (this.undoButton) {
      this.undoButton.disabled = !status.canUndo;
      this.undoButton.title = status.undoLabel
        ? `Undo: ${status.undoLabel}`
        : 'Undo';
    }

    if (this.redoButton) {
      this.redoButton.disabled = !status.canRedo;
      this.redoButton.title = status.redoLabel
        ? `Redo: ${status.redoLabel}`
        : 'Redo';
    }
  }

  private renderAutosave(): void {
    if (!this.saveStatusElement) return;

    const status = this.effects.autosave.getStatus();
    const text =
      status.phase === 'pending'
        ? 'Saving…'
        : status.phase === 'saved'
          ? 'Saved'
          : status.phase === 'error'
            ? 'Save failed'
            : '';

    this.saveStatusElement.textContent = text;
    this.saveStatusElement.dataset.saveState = status.phase;
    this.saveStatusElement.title =
      status.error?.message ?? text;
  }

  private addNewLayout(): void {
    const count = this.store.getState().project.layouts.length;
    const layout = createEmptyLayout({
      id: this.createId('layout'),
      firstAreaId: this.createId('area'),
      name: `Layout ${count + 1}`,
    });
    this.commands.execute(addLayout(layout));
  }

  private duplicateExistingLayout(layoutId: string): void {
    this.commands.execute(
      duplicateLayout(layoutId, {
        id: this.createId('layout'),
      }),
    );
  }

  private deleteExistingLayout(layoutId: string): void {
    if (this.store.getState().project.layouts.length <= 1) return;
    if (!this.confirm('Are you sure you want to delete this layout?')) {
      return;
    }
    this.commands.execute(deleteLayout(layoutId));
  }

  private addNewArea(): void {
    const state = this.store.getState();
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    if (!layout) return;

    this.commands.execute(
      addArea(layout.id, {
        id: this.createId('area'),
        name: `Area ${layout.areas.length + 1}`,
      }),
    );
  }

  private deleteExistingArea(areaId: string): void {
    const state = this.store.getState();
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    if (!layout) return;

    const plan = getAreaDeletionPlan(layout, areaId);
    if (!plan) return;

    if (plan.affectedPieceIds.length > 0) {
      const count = plan.affectedPieceIds.length;
      const message =
        `Move ${count} piece${count === 1 ? '' : 's'} from "` +
        `${plan.areaName}" to "${plan.fallbackAreaName}" and delete this Area?`;

      if (!this.confirm(message)) return;
    }

    this.commands.execute(deleteArea(layout.id, areaId));
  }

  private onLayoutsClick(event: Event): void {
    const target = elementTarget(event);
    if (!target) return;

    const action = target.closest<HTMLElement>('[data-action]');
    const actionName = action?.dataset.action;
    const entityId = action?.dataset.entityId;

    if (actionName && entityId) {
      event.preventDefault();
      event.stopPropagation();

      if (actionName === 'rename-layout') {
        this.editingLayoutId = entityId;
        this.renderLayouts();
      } else if (actionName === 'duplicate-layout') {
        this.duplicateExistingLayout(entityId);
      } else if (actionName === 'delete-layout') {
        this.deleteExistingLayout(entityId);
      }
      return;
    }

    if (target.closest('button,input,textarea,select')) return;

    const row = target.closest<HTMLElement>('[data-layout-id]');
    const layoutId = row?.dataset.layoutId;
    if (layoutId) this.commands.execute(setActiveLayout(layoutId));
  }

  private onLayoutsKeyDown(event: KeyboardEvent): void {
    const target = elementTarget(event);
    if (!target) return;

    const renameInput = target.closest<HTMLInputElement>(
      'input[data-cad-layout-rename]',
    );
    if (renameInput) {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.finishInlineLayoutRename(renameInput, true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.finishInlineLayoutRename(renameInput, false);
      }
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (target.closest('button,input,textarea,select')) return;

    const row = target.closest<HTMLElement>('[data-layout-id]');
    const layoutId = row?.dataset.layoutId;
    if (!layoutId) return;

    event.preventDefault();
    this.commands.execute(setActiveLayout(layoutId));
  }

  private onLayoutsFocusOut(event: FocusEvent): void {
    const target = elementTarget(event);
    const input = target?.closest<HTMLInputElement>(
      'input[data-cad-layout-rename]',
    );
    if (input) this.finishInlineLayoutRename(input, true);
  }

  private finishInlineLayoutRename(
    input: HTMLInputElement,
    save: boolean,
  ): void {
    const layoutId = input.dataset.cadLayoutRename;
    if (!layoutId || this.editingLayoutId !== layoutId) return;

    this.editingLayoutId = null;
    if (save) this.commands.execute(renameLayout(layoutId, input.value));
    this.renderLayouts();
  }

  private onAreasClick(event: Event): void {
    const target = elementTarget(event);
    if (!target) return;

    const action = target.closest<HTMLElement>('[data-action]');
    const actionName = action?.dataset.action;
    const entityId = action?.dataset.entityId;

    if (actionName && entityId) {
      event.preventDefault();
      event.stopPropagation();

      if (actionName === 'rename-area') {
        this.editingAreaId = entityId;
        this.renderAreas();
      } else if (actionName === 'delete-area') {
        this.deleteExistingArea(entityId);
      }
      return;
    }

    if (target.closest('button,input,textarea,select')) return;

    const row = target.closest<HTMLElement>('[data-area-id]');
    const areaId = row?.dataset.areaId;
    const layoutId = this.store.getState().session.activeLayoutId;

    if (layoutId && areaId) {
      this.commands.execute(
        setActiveArea(layoutId, areaId, { select: true }),
      );
    }
  }

  private onAreasKeyDown(event: KeyboardEvent): void {
    const target = elementTarget(event);
    if (!target) return;

    const renameInput = target.closest<HTMLInputElement>(
      'input[data-cad-area-rename]',
    );
    if (renameInput) {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.finishInlineAreaRename(renameInput, true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.finishInlineAreaRename(renameInput, false);
      }
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (target.closest('button,input,textarea,select')) return;

    const row = target.closest<HTMLElement>('[data-area-id]');
    const areaId = row?.dataset.areaId;
    const layoutId = this.store.getState().session.activeLayoutId;

    if (!layoutId || !areaId) return;

    event.preventDefault();
    this.commands.execute(
      setActiveArea(layoutId, areaId, { select: true }),
    );
  }

  private onAreasFocusOut(event: FocusEvent): void {
    const target = elementTarget(event);
    const input = target?.closest<HTMLInputElement>(
      'input[data-cad-area-rename]',
    );
    if (input) this.finishInlineAreaRename(input, true);
  }

  private finishInlineAreaRename(
    input: HTMLInputElement,
    save: boolean,
  ): void {
    const areaId = input.dataset.cadAreaRename;
    const layoutId = this.store.getState().session.activeLayoutId;
    if (
      !layoutId ||
      !areaId ||
      this.editingAreaId !== areaId
    ) {
      return;
    }

    this.editingAreaId = null;
    if (save) {
      this.commands.execute(
        renameArea(layoutId, areaId, input.value),
      );
    }
    this.renderAreas();
  }

  private onInspectorChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const entityId = target.dataset.entityId;
    const field = target.dataset.cadInspectorField;
    if (!entityId || !field) return;

    if (field === 'layout-name') {
      const layout = this.store
        .getState()
        .project.layouts.find((item) => item.id === entityId);
      if (!layout) return;

      const next = target.value.trim() || layout.name || 'Layout';
      this.commands.execute(renameLayout(entityId, next));
      return;
    }

    if (field === 'layout-quantity') {
      this.commands.execute(
        setLayoutQuantity(entityId, Number(target.value)),
      );
      return;
    }

    if (field === 'area-name') {
      const layoutId = this.store.getState().session.activeLayoutId;
      if (!layoutId) return;

      const layout = this.store
        .getState()
        .project.layouts.find((item) => item.id === layoutId);
      const area = layout?.areas.find((item) => item.id === entityId);
      if (!area) return;

      const next = target.value.trim() || area.name || 'Area';
      this.commands.execute(
        renameArea(layoutId, entityId, next),
      );
    }
  }


  private renderPieces(): void {
    const mount = this.root.querySelector<HTMLElement>('#lc-pieces');
    if (!mount) return;
    const state = this.store.getState();
    const layout = state.project.layouts.find(item => item.id === state.session.activeLayoutId);
    mount.replaceChildren();
    if (!layout) return;
    layout.pieces.forEach(piece => {
      const button = mount.ownerDocument.createElement('button');
      button.type = 'button';
      button.className = 'lc-item nav lc-nav-entity-row';
      button.textContent = piece.name;
      button.dataset.pieceId = piece.id;
      const selection = state.session.selection;
      button.setAttribute('aria-pressed', String(selection.kind === 'pieces' && selection.ids.includes(piece.id)));
      button.addEventListener('click', event => {
        const current = this.store.getState().session.selection;
        let ids = [piece.id];
        if ((event.ctrlKey || event.metaKey) && current.kind === 'pieces') {
          ids = current.ids.includes(piece.id) ? current.ids.filter(id => id !== piece.id) : [...current.ids, piece.id];
        }
        this.commands.execute(setSelection(ids.length ? { kind: 'pieces', ids } : { kind: 'none' }));
      });
      mount.append(button);
    });
  }

  private renderPieceInspector(): void {
    const mount = this.inspectorElement;
    if (!mount) return;
    const state = this.store.getState();
    const selection = state.session.selection;
    if (selection.kind !== 'pieces') return;
    const layout = state.project.layouts.find(item => item.id === state.session.activeLayoutId);
    if (!layout) return;
    const pieces = layout.pieces.filter(piece => selection.ids.includes(piece.id));
    if (!pieces.length) return;
    const document = mount.ownerDocument;
    const heading = document.createElement('h3');
    heading.textContent = pieces.length === 1 ? 'Piece' : pieces.length + ' Pieces';
    mount.append(heading);
    const first = pieces[0];
    if (first && pieces.length === 1) {
      const label = document.createElement('label');
      label.textContent = 'Name';
      const input = document.createElement('input');
      input.value = first.name;
      input.addEventListener('change', () => this.commands.execute(renamePiece(layout.id, first.id, input.value)));
      label.append(input); mount.append(label);
    }
    const areaLabel = document.createElement('label');
    areaLabel.textContent = 'Area';
    const select = document.createElement('select');
    const mixed = pieces.some(piece => piece.areaId !== first?.areaId);
    if (mixed) {
      const option = document.createElement('option');
      option.value = ''; option.textContent = 'Multiple Areas'; option.disabled = true;
      select.append(option);
    }
    layout.areas.forEach(area => {
      const option = document.createElement('option');
      option.value = area.id; option.textContent = area.name;
      select.append(option);
    });
    select.value = mixed ? '' : first?.areaId ?? '';
    select.addEventListener('change', () => this.commands.execute(assignPiecesToArea(layout.id, selection.ids, select.value)));
    areaLabel.append(select); mount.append(areaLabel);
    const duplicate = document.createElement('button');
    duplicate.type = 'button'; duplicate.textContent = 'Duplicate';
    duplicate.addEventListener('click', () => {
      const latest = this.store.getState();
      const source = latest.project.layouts.find(item => item.id === layout.id);
      if (!source) return;
      const plan = preparePieceDuplication(source, selection.ids, latest.session.workspace, this.createId);
      this.commands.execute(duplicatePieces(layout.id, plan));
    });
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'Delete'; remove.className = 'lc-btn red';
    remove.addEventListener('click', () => this.commands.execute(deletePieces(layout.id, selection.ids)));
    const cascade = getPieceDeletionPlan(layout, selection.ids, state.session.workspace);
    remove.title = 'Delete ' + cascade.pieceIds.length + ' piece(s), including linked family members';
    mount.append(duplicate, remove);
  }

  private model() {
    return createProjectLayoutViewModel(
      this.store.getState(),
      this.effects.history.getStatus(),
      this.effects.autosave.getStatus(),
    );
  }
}
