import {
  addPiece,
  addSlabSurface,
  applyFabricationTransaction,
  addPieceCutout,
  addPieceSeam,
  addPieceSink,
  assignPiecesToArea,
  copyPieceCutout,
  copyPieceSink,
  deletePieces,
  deleteSlabSurface,
  duplicatePieces,
  editPieceCutout,
  editPieceSeam,
  editPieceSink,
  groupPieces,
  mirrorPieces,
  removePieceCutout,
  removePieceSeam,
  removePieceSink,
  renamePiece,
  renamePieceGroup,
  resizePieceDimension,
  setSelection,
  transformPieces,
  ungroupPieceGroups,
  updateSlabSurface,
} from '../app/commands';
import {
  clampPiecePoseToWorkspace,
  createPieceGroupProjection,
  cutoutEffectivePerimeterInches,
  cutoutPerimeterInches,
  getPieceDeletionPlan,
  isBacksplashPiece,
  MAX_SINKS_PER_PIECE,
  nextPieceGroupName,
  pieceGeometry,
  piecePose,
  selectedPieceGroupId,
  pieceSeamLocalCoordinate,
  prepareFabricationMerge,
  prepareFabricationSplit,
  preparePieceDuplication,
  SINK_MODELS,
} from '../domain/pieces';
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
  updatePreferences,
  type ApplicationEffects,
  type AppStore,
  type CommandDispatcher,
  type ViewInvalidationBatch,
} from '../app';
import {
  createEmptyLayout,
  getAreaDeletionPlan,
} from '../domain/project';
import { createBlankSlabSurface } from '../domain/slabs';
import { normalizeDegrees } from '../core/numeric';
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
  private readonly collapsedPieceGroups = new Set<string>();

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

    this.root.querySelector('#lc-add-slab')?.addEventListener(
      'click',
      () => this.addBlankSlab(),
      { signal },
    );

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

    if (this.store.getState().session.selection.kind === 'slab') {
      this.renderSlabInspector();
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

  private addBlankSlab(): void {
    const state = this.store.getState();
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    if (!layout || state.session.workspace !== 'slab') return;

    const offset = 2 + layout.overlays.length * 4;
    const slab = createBlankSlabSurface(
      this.createId('slab'),
      `Slab ${layout.overlays.length + 1}`,
      state.preferences.defaultSlabW,
      state.preferences.defaultSlabH,
      offset,
      offset,
    );
    this.commands.execute(addSlabSurface(layout.id, slab));
  }

  private renderSlabInspector(): void {
    const mount = this.inspectorElement;
    if (!mount) return;
    const state = this.store.getState();
    const selection = state.session.selection;
    if (selection.kind !== 'slab' || state.session.workspace !== 'slab') {
      return;
    }
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    const slab = layout?.overlays.find(
      (item) => item.id === selection.id,
    );
    if (!layout || !slab) return;

    const document = mount.ownerDocument;
    const root = document.createElement('div');
    root.className =
      'lc-item selected lc-annotation-inspector lc-slab-inspector';

    const heading = document.createElement('div');
    heading.className = 'lc-inspector-context-title';
    heading.textContent = slab.name || 'Slab';

    const fields = document.createElement('div');
    fields.className = 'lc-slab-inspector-fields';

    const textField = (
      labelText: string,
      value: string,
      onChange: (value: string) => void,
    ): HTMLLabelElement => {
      const label = document.createElement('label');
      const text = document.createElement('span');
      text.textContent = labelText;
      const input = document.createElement('input');
      input.className = 'lc-input';
      input.type = 'text';
      input.value = value;
      input.addEventListener('change', () => onChange(input.value));
      label.append(text, input);
      return label;
    };

    const numberField = (
      labelText: string,
      value: number,
      step: string,
      onChange: (value: number) => void,
    ): HTMLLabelElement => {
      const label = document.createElement('label');
      const text = document.createElement('span');
      text.textContent = labelText;
      const input = document.createElement('input');
      input.className = 'lc-input';
      input.type = 'number';
      input.step = step;
      input.value = String(value);
      input.addEventListener('change', () => {
        const next = Number(input.value);
        if (Number.isFinite(next)) onChange(next);
      });
      label.append(text, input);
      return label;
    };

    fields.append(
      textField('Name', slab.name, (name) => {
        this.commands.execute(
          updateSlabSurface(layout.id, slab.id, { name }),
        );
      }),
      numberField('Width', slab.slabW, '0.25', (slabW) => {
        this.commands.execute(
          updateSlabSurface(layout.id, slab.id, { slabW }),
        );
      }),
      numberField('Height', slab.slabH, '0.25', (slabH) => {
        this.commands.execute(
          updateSlabSurface(layout.id, slab.id, { slabH }),
        );
      }),
      numberField('X', slab.x, '0.125', (x) => {
        this.commands.execute(
          updateSlabSurface(layout.id, slab.id, { x }),
        );
      }),
      numberField('Y', slab.y, '0.125', (y) => {
        this.commands.execute(
          updateSlabSurface(layout.id, slab.id, { y }),
        );
      }),
      numberField('Opacity', slab.opacity, '0.05', (opacity) => {
        this.commands.execute(
          updateSlabSurface(layout.id, slab.id, { opacity }),
        );
      }),
    );

    const visible = document.createElement('label');
    visible.className = 'lc-slab-visible-field';
    const visibleInput = document.createElement('input');
    visibleInput.type = 'checkbox';
    visibleInput.checked = slab.visible;
    visibleInput.addEventListener('change', () => {
      this.commands.execute(
        updateSlabSurface(layout.id, slab.id, {
          visible: visibleInput.checked,
        }),
      );
    });
    const visibleText = document.createElement('span');
    visibleText.textContent = 'Visible';
    visible.append(visibleInput, visibleText);
    fields.append(visible);

    const note = document.createElement('div');
    note.className = 'lc-small lc-slab-inspector-note';
    note.textContent =
      'Usable cut boundary is inset by ' +
      String(state.preferences.slabEdgeAllowance) +
      '" from each slab edge.';
    fields.append(note);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'lc-btn red sm';
    remove.textContent = 'Delete Slab';
    remove.addEventListener('click', () => {
      if (this.confirm(`Delete "${slab.name}"?`)) {
        this.commands.execute(
          deleteSlabSurface(layout.id, slab.id),
        );
      }
    });
    fields.append(remove);

    root.append(heading, fields);
    mount.append(root);
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
    const layout = state.project.layouts.find(
      item => item.id === state.session.activeLayoutId,
    );
    mount.replaceChildren();
    if (!layout) return;

    const document = mount.ownerDocument;
    const groups = createPieceGroupProjection(layout.pieces);
    const groupById = new Map(groups.map(group => [group.id, group]));
    const renderedGroups = new Set<string>();
    const selection = state.session.selection;
    const selectedGroup =
      selection.kind === 'pieces'
        ? selectedPieceGroupId(
            layout.pieces,
            selection.ids,
            state.session.workspace,
          )
        : null;

    layout.pieces.forEach(piece => {
      const parentGroupId =
        isBacksplashPiece(piece) && piece.attachment?.parentPieceId
          ? layout.pieces.find(
              parent => parent.id === piece.attachment?.parentPieceId,
            )?.pieceGroupId ?? null
          : null;
      const groupId = isBacksplashPiece(piece)
        ? parentGroupId
        : piece.pieceGroupId;
      const group = groupId ? groupById.get(groupId) : undefined;

      if (group && !renderedGroups.has(group.id)) {
        renderedGroups.add(group.id);
        const header = document.createElement('button');
        header.type = 'button';
        header.className =
          'lc-piece-group-header' +
          (selectedGroup === group.id ? ' selected' : '') +
          (this.collapsedPieceGroups.has(group.id)
            ? ' is-collapsed'
            : '');
        header.dataset.pieceGroupHeader = group.id;
        header.setAttribute(
          'aria-expanded',
          String(!this.collapsedPieceGroups.has(group.id)),
        );

        const badge = document.createElement('span');
        badge.className = 'lc-piece-group-header-badge';
        badge.textContent = group.badge;
        badge.title =
          group.kind === 'fabrication'
            ? 'Fabrication Assembly'
            : 'Countertop Group';

        const text = document.createElement('span');
        text.className = 'lc-piece-group-header-text';
        const title = document.createElement('strong');
        title.textContent = group.name;
        const meta = document.createElement('span');
        meta.className = 'lc-piece-group-header-meta';
        meta.textContent =
          group.kind === 'fabrication'
            ? `${group.stats.pieceCount} pieces · ${group.stats.seamCount} fabrication seam${group.stats.seamCount === 1 ? '' : 's'}`
            : `${group.stats.pieceCount} pieces`;
        text.append(title, meta);
        header.append(badge, text);
        header.addEventListener('click', () => {
          const collapsed = this.collapsedPieceGroups.has(group.id);
          if (collapsed) this.collapsedPieceGroups.delete(group.id);
          else this.collapsedPieceGroups.add(group.id);
          this.commands.execute(
            setSelection({
              kind: 'pieces',
              ids: [...group.memberIds],
            }),
          );
          this.renderPieces();
        });
        mount.append(header);
      }

      if (group && this.collapsedPieceGroups.has(group.id)) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        'lc-item nav lc-nav-entity-row' +
        (group ? ' lc-piece-grouped' : '') +
        (isBacksplashPiece(piece)
          ? ' lc-backsplash-nav-piece'
          : '');
      button.dataset.pieceId = piece.id;
      const title = document.createElement('span');
      title.className = 'lc-nav-title';
      title.textContent = piece.name;
      button.append(title);
      if (group && !isBacksplashPiece(piece)) {
        const badge = document.createElement('span');
        badge.className = 'lc-piece-group-badge';
        badge.textContent = group.badge;
        badge.title = group.name;
        button.append(badge);
      }
      button.setAttribute(
        'aria-pressed',
        String(
          selection.kind === 'pieces' &&
            selection.ids.includes(piece.id),
        ),
      );
      button.addEventListener('click', event => {
        const current = this.store.getState().session.selection;
        let ids = [piece.id];
        if (
          (event.ctrlKey || event.metaKey) &&
          current.kind === 'pieces'
        ) {
          ids = current.ids.includes(piece.id)
            ? current.ids.filter(id => id !== piece.id)
            : [...current.ids, piece.id];
        }
        this.commands.execute(
          setSelection(
            ids.length
              ? { kind: 'pieces', ids }
              : { kind: 'none' },
          ),
        );
      });
      mount.append(button);
    });
  }

  private renderSelectedPieceGroup(
    layoutId: string,
    groupId: string,
  ): 'ordinary' | 'fabrication' | null {
    const mount = this.inspectorElement;
    if (!mount) return null;
    const state = this.store.getState();
    const layout = state.project.layouts.find(
      item => item.id === layoutId,
    );
    if (!layout) return null;
    const group = createPieceGroupProjection(layout.pieces).find(
      item => item.id === groupId,
    );
    if (!group) return null;

    const document = mount.ownerDocument;
    const root = document.createElement('div');
    root.className =
      'lc-item selected lc-annotation-inspector lc-piece-group-inspector';

    const heading = document.createElement('div');
    heading.className = 'lc-inspector-context-title';
    heading.textContent = group.name;

    const body = document.createElement('div');
    body.className = 'lc-subcard-body';

    const nameLabel = document.createElement('label');
    nameLabel.className = 'lc-piece-group-name-field';
    const nameText = document.createElement('span');
    nameText.textContent = 'Name';
    const name = document.createElement('input');
    name.className = 'lc-input';
    name.type = 'text';
    name.value = group.name;
    name.addEventListener('change', () => {
      this.commands.execute(
        renamePieceGroup(layout.id, group.id, name.value),
      );
    });
    nameLabel.append(nameText, name);
    body.append(nameLabel);

    const summary = document.createElement('div');
    summary.className = 'lc-piece-group-summary';
    const summaryItems: Array<[string, string]> = [
      ['Pieces', String(group.stats.pieceCount)],
      ['Total SF', group.stats.totalSf.toFixed(2)],
      [
        'Overall',
        `${group.stats.width.toFixed(3)} × ${group.stats.height.toFixed(3)}`,
      ],
      ['Sinks', String(group.stats.sinkCount)],
      ['Seams', String(group.stats.seamCount)],
      ['Splashes', String(group.stats.splashCount)],
    ];
    summaryItems.forEach(([label, value]) => {
      const item = document.createElement('div');
      item.className = 'lc-piece-group-summary__item';
      const key = document.createElement('span');
      key.textContent = label;
      const data = document.createElement('strong');
      data.textContent = value;
      item.append(key, data);
      summary.append(item);
    });
    body.append(summary);

    const hint = document.createElement('div');
    hint.className = 'lc-small lc-piece-group-hierarchy-hint';
    hint.textContent =
      group.kind === 'fabrication'
        ? 'Fabrication Assembly · physical seam links keep these Pieces together in DESIGN while SLAB placements stay independent.'
        : 'Countertop Group · select the Group header to move the members together, or expand it to select an individual Piece.';
    body.append(hint);

    const actions = document.createElement('div');
    actions.className = 'lc-piece-group-actions';
    if (group.kind === 'group') {
      const ungroup = document.createElement('button');
      ungroup.type = 'button';
      ungroup.className = 'lc-btn ghost sm';
      ungroup.textContent = 'Ungroup';
      ungroup.addEventListener('click', () => {
        this.commands.execute(
          ungroupPieceGroups(layout.id, [group.id]),
        );
      });
      actions.append(ungroup);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'lc-btn red sm';
    remove.textContent =
      group.kind === 'fabrication'
        ? 'Delete Assembly'
        : 'Delete Group';
    remove.addEventListener('click', () => {
      if (
        this.confirm(
          `Delete ${group.stats.pieceCount} piece${group.stats.pieceCount === 1 ? '' : 's'} in "${group.name}"?`,
        )
      ) {
        this.commands.execute(
          deletePieces(layout.id, group.memberIds),
        );
      }
    });
    actions.append(remove);
    body.append(actions);

    root.append(heading, body);
    mount.append(root);
    return group.kind === 'fabrication'
      ? 'fabrication'
      : 'ordinary';
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
    const groupId = selectedPieceGroupId(
      layout.pieces,
      selection.ids,
      state.session.workspace,
    );
    const groupKind = groupId
      ? this.renderSelectedPieceGroup(layout.id, groupId)
      : null;

    if (groupKind === 'ordinary') return;

    if (
      !groupId &&
      state.session.workspace === 'design' &&
      pieces.filter(piece => !isBacksplashPiece(piece)).length >= 2
    ) {
      const groupAction = document.createElement('button');
      groupAction.type = 'button';
      groupAction.className = 'lc-btn ghost sm lc-group-selected-action';
      groupAction.textContent = 'Group Selected Pieces';
      groupAction.addEventListener('click', () => {
        const ids = pieces
          .filter(piece => !isBacksplashPiece(piece))
          .map(piece => piece.id);
        this.commands.execute(
          groupPieces(
            layout.id,
            ids,
            this.createId('group'),
            nextPieceGroupName(layout.pieces),
          ),
        );
      });
      mount.append(groupAction);
    }

    if (!groupId) {
      const heading = document.createElement('h3');
      heading.textContent =
        pieces.length === 1
          ? 'Piece'
          : pieces.length + ' Pieces';
      mount.append(heading);
    }
    const first = pieces[0];
    if (first && pieces.length === 1) {
      const label = document.createElement('label');
      label.textContent = 'Name';
      const input = document.createElement('input');
      input.value = first.name;
      input.addEventListener('change', () => this.commands.execute(renamePiece(layout.id, first.id, input.value)));
      label.append(input); mount.append(label);

      const numberField = (
        labelText: string,
        value: number,
        step: string,
        onChange: (value: number) => void,
      ): HTMLLabelElement => {
        const field = document.createElement('label');
        field.className = 'lc-piece-geometry-field';
        const text = document.createElement('span');
        text.textContent = labelText;
        const control = document.createElement('input');
        control.type = 'number';
        control.step = step;
        control.value = String(value);
        control.addEventListener('change', () => {
          const next = Number(control.value);
          if (Number.isFinite(next)) onChange(next);
        });
        field.append(text, control);
        return field;
      };

      const editSize = (dimension: 'width' | 'height', value: number): void => {
        this.commands.execute(
          resizePieceDimension(layout.id, first.id, dimension, value),
        );
      };

      const editRotation = (value: number): void => {
        const latest = this.store.getState();
        const latestLayout = latest.project.layouts.find(item => item.id === layout.id);
        const latestPiece = latestLayout?.pieces.find(item => item.id === first.id);
        if (!latestLayout || !latestPiece) return;
        const workspace = latest.session.workspace;
        const geometry = pieceGeometry(latestPiece);
        const current = piecePose(latestPiece, workspace);
        const rotation =
          value >= 0 && value < 360 ? value : normalizeDegrees(value);
        const pose = clampPiecePoseToWorkspace(
          latestLayout,
          workspace,
          geometry,
          { ...current, rotation },
        );
        this.commands.execute(
          transformPieces(
            latestLayout.id,
            [
              {
                id: latestPiece.id,
                ...(workspace === 'slab'
                  ? { slabPose: pose }
                  : { designPose: pose }),
              },
            ],
            { label: 'Rotate piece' },
          ),
        );
      };

      const geometryFields = document.createElement('div');
      geometryFields.className = 'lc-piece-geometry-fields';
      geometryFields.append(
        numberField('Width', first.w, '0.25', value => editSize('width', value)),
        numberField('Height', first.h, '0.25', value => editSize('height', value)),
        numberField(
          state.session.workspace === 'slab' ? 'SLAB Rotation' : 'DESIGN Rotation',
          piecePose(first, state.session.workspace).rotation,
          '1',
          editRotation,
        ),
      );
      mount.append(geometryFields);

      const sinkSection = document.createElement('div');
      sinkSection.className = 'lc-piece-sinks-inspector';

      const sinkHeader = document.createElement('div');
      sinkHeader.className = 'lc-piece-sinks-inspector__header';
      const sinkTitle = document.createElement('strong');
      sinkTitle.textContent = `Sinks (${first.sinks.length})`;

      const centerlineVisibility = document.createElement('button');
      centerlineVisibility.type = 'button';
      centerlineVisibility.className = 'lc-btn ghost sm';
      centerlineVisibility.textContent =
        state.preferences.showSinkCenterlines
          ? 'Hide CL'
          : 'Show CL';
      centerlineVisibility.setAttribute(
        'aria-pressed',
        String(state.preferences.showSinkCenterlines),
      );
      centerlineVisibility.addEventListener('click', () => {
        const current =
          this.store.getState().preferences.showSinkCenterlines;
        this.commands.execute(
          updatePreferences({ showSinkCenterlines: !current }),
        );
      });

      sinkHeader.append(sinkTitle, centerlineVisibility);
      sinkSection.append(sinkHeader);

      const addSink = document.createElement('button');
      addSink.type = 'button';
      addSink.className = 'lc-btn ghost sm lc-add-inspector-item';
      addSink.textContent = '+ Add Sink';
      addSink.disabled = first.sinks.length >= MAX_SINKS_PER_PIECE;
      addSink.addEventListener('click', () => {
        this.commands.execute(
          addPieceSink(
            layout.id,
            first.id,
            this.createId('sink'),
          ),
        );
      });
      sinkSection.append(addSink);

      const sinkRows = document.createElement('div');
      sinkRows.className = 'lc-piece-sink-list';

      first.sinks.forEach((sink, sinkIndex) => {
        const row = document.createElement('div');
        row.className = 'lc-piece-sink-row';

        const rowHeader = document.createElement('div');
        rowHeader.className = 'lc-piece-sink-row__header';

        const rowTitle = document.createElement('span');
        const sinkName = sink.name.trim();
        rowTitle.textContent =
          `Sink ${sinkIndex + 1}` +
          (sinkName ? ' — ' + sinkName : '');

        const rowActions = document.createElement('div');
        rowActions.className = 'lc-piece-sink-row__actions';

        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'lc-btn ghost sm';
        copy.textContent = 'Duplicate';
        copy.disabled = first.sinks.length >= MAX_SINKS_PER_PIECE;
        copy.addEventListener('click', () => {
          this.commands.execute(
            copyPieceSink(
              layout.id,
              first.id,
              sink.id,
              this.createId('sink'),
            ),
          );
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'lc-btn red sm';
        remove.textContent = 'Delete';
        remove.addEventListener('click', () => {
          this.commands.execute(
            removePieceSink(layout.id, first.id, sink.id),
          );
        });

        rowActions.append(copy, remove);
        rowHeader.append(rowTitle, rowActions);
        row.append(rowHeader);

        const fields = document.createElement('div');
        fields.className = 'lc-piece-sink-fields';

        const makeText = (
          labelText: string,
          value: string,
          onChange: (value: string) => void,
        ): HTMLLabelElement => {
          const field = document.createElement('label');
          field.textContent = labelText;
          const control = document.createElement('input');
          control.type = 'text';
          control.value = value;
          control.addEventListener('change', () => onChange(control.value));
          field.append(control);
          return field;
        };

        const makeNumber = (
          labelText: string,
          value: number,
          step: number,
          min: number,
          onChange: (value: number) => void,
          disabled = false,
        ): HTMLLabelElement => {
          const field = document.createElement('label');
          field.textContent = labelText;
          const control = document.createElement('input');
          control.type = 'number';
          control.value = String(value);
          control.step = String(step);
          control.min = String(min);
          control.disabled = disabled;
          control.addEventListener('change', () => {
            const value = Number(control.value);
            if (Number.isFinite(value)) onChange(value);
          });
          field.append(control);
          return field;
        };

        fields.append(
          makeText('Name', sink.name, (value) => {
            this.commands.execute(
              editPieceSink(layout.id, first.id, sink.id, {
                name: value,
              }),
            );
          }),
        );

        const typeLabel = document.createElement('label');
        typeLabel.textContent = 'Type';
        const type = document.createElement('select');
        [
          ['model', 'Model'],
          ['custom', 'Custom'],
        ].forEach(([value, labelText]) => {
          const option = document.createElement('option');
          option.value = value ?? '';
          option.textContent = labelText ?? '';
          type.append(option);
        });
        type.value = sink.type;
        type.addEventListener('change', () => {
          this.commands.execute(
            editPieceSink(layout.id, first.id, sink.id, {
              type: type.value === 'custom' ? 'custom' : 'model',
            }),
          );
        });
        typeLabel.append(type);
        fields.append(typeLabel);

        const modelLabel = document.createElement('label');
        modelLabel.textContent = 'Model';
        const model = document.createElement('select');
        SINK_MODELS.forEach((item) => {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = item.label;
          model.append(option);
        });
        model.value = sink.modelId ?? SINK_MODELS[0]?.id ?? '';
        model.disabled = sink.type !== 'model';
        model.addEventListener('change', () => {
          this.commands.execute(
            editPieceSink(layout.id, first.id, sink.id, {
              modelId: model.value,
            }),
          );
        });
        modelLabel.append(model);
        fields.append(modelLabel);

        fields.append(
          makeNumber(
            'Length (in)',
            sink.w,
            0.125,
            0,
            (value) => {
              this.commands.execute(
                editPieceSink(layout.id, first.id, sink.id, { w: value }),
              );
            },
            sink.type !== 'custom',
          ),
          makeNumber(
            'Width (in)',
            sink.h,
            0.125,
            0,
            (value) => {
              this.commands.execute(
                editPieceSink(layout.id, first.id, sink.id, { h: value }),
              );
            },
            sink.type !== 'custom',
          ),
          makeNumber('Rotation (°)', sink.rotation, 1, 0, (value) => {
            this.commands.execute(
              editPieceSink(layout.id, first.id, sink.id, {
                rotation: value,
              }),
            );
          }),
          makeNumber('Corner R (in)', sink.cornerR, 0.125, 0, (value) => {
            this.commands.execute(
              editPieceSink(layout.id, first.id, sink.id, {
                cornerR: value,
              }),
            );
          }),
        );

        const finishLabel = document.createElement('label');
        finishLabel.textContent = 'Inside Edge';
        const finish = document.createElement('select');
        [
          ['polished', 'Polished'],
          ['unpolished', 'Unpolished'],
        ].forEach(([value, labelText]) => {
          const option = document.createElement('option');
          option.value = value ?? '';
          option.textContent = labelText ?? '';
          finish.append(option);
        });
        finish.value = sink.insideFinish;
        finish.addEventListener('change', () => {
          this.commands.execute(
            editPieceSink(layout.id, first.id, sink.id, {
              insideFinish:
                finish.value === 'unpolished'
                  ? 'unpolished'
                  : 'polished',
            }),
          );
        });
        finishLabel.append(finish);
        fields.append(finishLabel);

        const sideLabel = document.createElement('label');
        sideLabel.textContent = 'Reference Side';
        const side = document.createElement('select');
        [
          ['front', 'Front'],
          ['back', 'Back'],
          ['left', 'Left'],
          ['right', 'Right'],
        ].forEach(([value, labelText]) => {
          const option = document.createElement('option');
          option.value = value ?? '';
          option.textContent = labelText ?? '';
          side.append(option);
        });
        side.value = sink.side;
        side.addEventListener('change', () => {
          const value = side.value;
          if (
            value !== 'front' &&
            value !== 'back' &&
            value !== 'left' &&
            value !== 'right'
          ) {
            return;
          }
          this.commands.execute(
            editPieceSink(layout.id, first.id, sink.id, { side: value }),
          );
        });
        sideLabel.append(side);
        fields.append(sideLabel);

        fields.append(
          makeNumber(
            'Centerline (in)',
            sink.centerline,
            0.25,
            0,
            (value) => {
              this.commands.execute(
                editPieceSink(layout.id, first.id, sink.id, {
                  centerline: value,
                }),
              );
            },
          ),
          makeNumber(
            'Sink Setback (in)',
            sink.setback,
            0.25,
            0,
            (value) => {
              this.commands.execute(
                editPieceSink(layout.id, first.id, sink.id, {
                  setback: value,
                }),
              );
            },
          ),
        );

        const faucetGroup = document.createElement('fieldset');
        faucetGroup.className = 'lc-piece-sink-faucets';
        const faucetLegend = document.createElement('legend');
        faucetLegend.textContent = 'Faucet Holes';
        faucetGroup.append(faucetLegend);

        const faucetPattern = document.createElement('div');
        faucetPattern.className = 'lc-piece-sink-faucet-pattern';
        for (let index = 0; index < 9; index += 1) {
          const faucetLabel = document.createElement('label');
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = sink.faucets.includes(index);
          checkbox.setAttribute(
            'aria-label',
            'Faucet hole ' + String(index + 1),
          );
          checkbox.addEventListener('change', () => {
            const selected = new Set(sink.faucets);
            if (checkbox.checked) selected.add(index);
            else selected.delete(index);
            this.commands.execute(
              editPieceSink(layout.id, first.id, sink.id, {
                faucets: [...selected].sort((a, b) => a - b),
              }),
            );
          });
          const marker = document.createElement('span');
          marker.textContent = index === 4 ? 'CL' : String(index + 1);
          faucetLabel.append(checkbox, marker);
          faucetPattern.append(faucetLabel);
        }
        faucetGroup.append(faucetPattern);

        const faucetSettings = document.createElement('div');
        faucetSettings.className = 'lc-piece-sink-faucet-settings';
        faucetSettings.append(
          makeNumber(
            'Setback (in)',
            sink.faucetSetback,
            0.25,
            0,
            (value) => {
              this.commands.execute(
                editPieceSink(layout.id, first.id, sink.id, {
                  faucetSetback: value,
                }),
              );
            },
          ),
          makeNumber(
            'Diameter (in)',
            sink.faucetHoleDiameter,
            0.125,
            0.001,
            (value) => {
              this.commands.execute(
                editPieceSink(layout.id, first.id, sink.id, {
                  faucetHoleDiameter: value,
                }),
              );
            },
          ),
          makeNumber(
            'Spacing (in)',
            sink.faucetHoleSpacing,
            0.25,
            0.001,
            (value) => {
              this.commands.execute(
                editPieceSink(layout.id, first.id, sink.id, {
                  faucetHoleSpacing: value,
                }),
              );
            },
          ),
        );
        faucetGroup.append(faucetSettings);

        row.append(fields, faucetGroup);
        sinkRows.append(row);
      });

      if (!first.sinks.length) {
        const empty = document.createElement('div');
        empty.className = 'lc-small lc-inspector-empty';
        empty.textContent = 'This piece has no sinks.';
        sinkRows.append(empty);
      }

      sinkSection.append(sinkRows);
      mount.append(sinkSection);

      if (!isBacksplashPiece(first)) {
        const cutoutSection = document.createElement('div');
        cutoutSection.className = 'lc-piece-cutouts-inspector';

        const cutoutHeader = document.createElement('div');
        cutoutHeader.className = 'lc-piece-cutouts-inspector__header';
        const cutoutTitle = document.createElement('strong');
        cutoutTitle.textContent = `Cutouts (${first.cutouts.length})`;

        const cutoutVisibility = document.createElement('button');
        cutoutVisibility.type = 'button';
        cutoutVisibility.className = 'lc-btn ghost sm';
        cutoutVisibility.textContent =
          state.preferences.showCutoutLabels
            ? 'Hide Labels'
            : 'Show Labels';
        cutoutVisibility.setAttribute(
          'aria-pressed',
          String(state.preferences.showCutoutLabels),
        );
        cutoutVisibility.addEventListener('click', () => {
          const current =
            this.store.getState().preferences.showCutoutLabels;
          this.commands.execute(
            updatePreferences({ showCutoutLabels: !current }),
          );
        });

        cutoutHeader.append(cutoutTitle, cutoutVisibility);
        cutoutSection.append(cutoutHeader);

        const addCutouts = document.createElement('div');
        addCutouts.className = 'lc-piece-cutout-add-actions';
        ([
          ['rectangle', 'Rectangle'],
          ['circle', 'Circle'],
          ['oval', 'Oval'],
        ] as const).forEach(([kind, labelText]) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'lc-btn ghost sm';
          button.textContent = '+ ' + labelText;
          button.addEventListener('click', () => {
            this.commands.execute(
              addPieceCutout(
                layout.id,
                first.id,
                kind,
                this.createId('cutout'),
              ),
            );
          });
          addCutouts.append(button);
        });
        cutoutSection.append(addCutouts);

        const cutoutRows = document.createElement('div');
        cutoutRows.className = 'lc-piece-cutout-list';

        first.cutouts.forEach((cutout, cutoutIndex) => {
          const row = document.createElement('div');
          row.className = 'lc-piece-cutout-row';

          const rowHeader = document.createElement('div');
          rowHeader.className = 'lc-piece-cutout-row__header';
          const rowTitle = document.createElement('span');
          rowTitle.textContent =
            cutout.name.trim() || `Cutout ${cutoutIndex + 1}`;

          const rowActions = document.createElement('div');
          rowActions.className = 'lc-piece-cutout-row__actions';

          const copy = document.createElement('button');
          copy.type = 'button';
          copy.className = 'lc-btn ghost sm';
          copy.textContent = 'Duplicate';
          copy.addEventListener('click', () => {
            this.commands.execute(
              copyPieceCutout(
                layout.id,
                first.id,
                cutout.id,
                this.createId('cutout'),
              ),
            );
          });

          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'lc-btn red sm';
          remove.textContent = 'Delete';
          remove.addEventListener('click', () => {
            this.commands.execute(
              removePieceCutout(layout.id, first.id, cutout.id),
            );
          });

          rowActions.append(copy, remove);
          rowHeader.append(rowTitle, rowActions);
          row.append(rowHeader);

          const fields = document.createElement('div');
          fields.className = 'lc-piece-cutout-fields';

          const textField = document.createElement('label');
          textField.textContent = 'Name';
          const name = document.createElement('input');
          name.type = 'text';
          name.value = cutout.name;
          name.addEventListener('change', () => {
            this.commands.execute(
              editPieceCutout(layout.id, first.id, cutout.id, {
                name: name.value,
              }),
            );
          });
          textField.append(name);
          fields.append(textField);

          const kindLabel = document.createElement('label');
          kindLabel.textContent = 'Type';
          const kind = document.createElement('select');
          ([
            ['rectangle', 'Rectangle'],
            ['circle', 'Circle'],
            ['oval', 'Oval'],
          ] as const).forEach(([value, labelText]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = labelText;
            kind.append(option);
          });
          kind.value = cutout.kind;
          kind.addEventListener('change', () => {
            const value =
              kind.value === 'circle'
                ? 'circle'
                : kind.value === 'oval'
                  ? 'oval'
                  : 'rectangle';
            this.commands.execute(
              editPieceCutout(layout.id, first.id, cutout.id, {
                kind: value,
              }),
            );
          });
          kindLabel.append(kind);
          fields.append(kindLabel);

          const finishLabel = document.createElement('label');
          finishLabel.textContent = 'Inside Edge';
          const finish = document.createElement('select');
          ([
            ['unpolished', 'Unpolished'],
            ['polished', 'Polished'],
          ] as const).forEach(([value, labelText]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = labelText;
            finish.append(option);
          });
          finish.value = cutout.insideFinish;
          finish.addEventListener('change', () => {
            this.commands.execute(
              editPieceCutout(layout.id, first.id, cutout.id, {
                insideFinish:
                  finish.value === 'polished'
                    ? 'polished'
                    : 'unpolished',
              }),
            );
          });
          finishLabel.append(finish);
          fields.append(finishLabel);

          const makeNumber = (
            labelText: string,
            value: number,
            step: number,
            min: number,
            onChange: (value: number) => void,
          ): HTMLLabelElement => {
            const field = document.createElement('label');
            field.textContent = labelText;
            const control = document.createElement('input');
            control.type = 'number';
            control.value = String(value);
            control.step = String(step);
            control.min = String(min);
            control.addEventListener('change', () => {
              const next = Number(control.value);
              if (Number.isFinite(next)) onChange(next);
            });
            field.append(control);
            return field;
          };

          if (cutout.kind === 'circle') {
            fields.append(
              makeNumber(
                'Diameter (in)',
                cutout.diameter ?? cutout.w,
                0.125,
                0.125,
                (value) => {
                  this.commands.execute(
                    editPieceCutout(layout.id, first.id, cutout.id, {
                      diameter: value,
                    }),
                  );
                },
              ),
            );
          } else {
            fields.append(
              makeNumber('Width (in)', cutout.w, 0.125, 0.125, (value) => {
                this.commands.execute(
                  editPieceCutout(layout.id, first.id, cutout.id, {
                    w: value,
                  }),
                );
              }),
              makeNumber('Height (in)', cutout.h, 0.125, 0.125, (value) => {
                this.commands.execute(
                  editPieceCutout(layout.id, first.id, cutout.id, {
                    h: value,
                  }),
                );
              }),
            );
          }

          fields.append(
            makeNumber('CL from Left', cutout.cx, 0.125, 0, (value) => {
              this.commands.execute(
                editPieceCutout(layout.id, first.id, cutout.id, {
                  cx: value,
                }),
              );
            }),
            makeNumber('CL from Back', cutout.cy, 0.125, 0, (value) => {
              this.commands.execute(
                editPieceCutout(layout.id, first.id, cutout.id, {
                  cy: value,
                }),
              );
            }),
          );

          if (cutout.kind !== 'circle') {
            fields.append(
              makeNumber(
                'Rotation (°)',
                cutout.rotation,
                1,
                -3600,
                (value) => {
                  this.commands.execute(
                    editPieceCutout(layout.id, first.id, cutout.id, {
                      rotation: value,
                    }),
                  );
                },
              ),
            );
            if (cutout.kind === 'rectangle') {
              fields.append(
                makeNumber(
                  'Corner R (in)',
                  cutout.cornerR,
                  0.125,
                  0,
                  (value) => {
                    this.commands.execute(
                      editPieceCutout(layout.id, first.id, cutout.id, {
                        cornerR: value,
                      }),
                    );
                  },
                ),
              );
            }
          }

          const perimeter = document.createElement('div');
          perimeter.className = 'lc-small lc-piece-cutout-perimeter';
          const actual =
            cutoutEffectivePerimeterInches(cutout, first);
          const full = cutoutPerimeterInches(cutout);
          perimeter.textContent =
            (cutout.insideFinish === 'polished'
              ? 'Polished'
              : 'Unpolished') +
            ' cut edge · ' +
            (actual / 12).toFixed(2) +
            ' LF' +
            (actual < full - 0.03 ? ' · clipped by piece edge' : '');

          row.append(fields, perimeter);
          cutoutRows.append(row);
        });

        if (!first.cutouts.length) {
          const empty = document.createElement('div');
          empty.className = 'lc-small lc-inspector-empty';
          empty.textContent = 'This piece has no general cutouts.';
          cutoutRows.append(empty);
        }

        const note = document.createElement('div');
        note.className = 'lc-small lc-piece-cutout-note';
        note.textContent =
          'General cutouts default to unpolished. LF counts only the cut edge that actually passes through stone.';

        cutoutSection.append(cutoutRows, note);
        mount.append(cutoutSection);
      }

      const seamSection = document.createElement('div');
      seamSection.className = 'lc-piece-seams-inspector';

      const seamHeader = document.createElement('div');
      seamHeader.className = 'lc-piece-seams-inspector__header';
      const seamTitle = document.createElement('strong');
      seamTitle.textContent = `Seams (${first.pieceSeams.length})`;
      const seamVisibility = document.createElement('button');
      seamVisibility.type = 'button';
      seamVisibility.className = 'lc-btn ghost sm';
      seamVisibility.textContent = state.preferences.showSeams
        ? 'Hide Seams'
        : 'Show Seams';
      seamVisibility.setAttribute(
        'aria-pressed',
        String(state.preferences.showSeams),
      );
      seamVisibility.addEventListener('click', () => {
        const current = this.store.getState().preferences.showSeams;
        this.commands.execute(
          updatePreferences({ showSeams: !current }),
        );
      });
      seamHeader.append(seamTitle, seamVisibility);
      seamSection.append(seamHeader);

      const seamRows = document.createElement('div');
      seamRows.className = 'lc-piece-seam-list';

      first.pieceSeams.forEach((seam, index) => {
        const row = document.createElement('div');
        row.className = 'lc-piece-seam-row';

        const rowHeader = document.createElement('div');
        rowHeader.className = 'lc-piece-seam-row__header';
        const rowTitle = document.createElement('span');
        rowTitle.textContent = `Seam ${index + 1}`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'lc-btn red sm';
        remove.textContent = 'Delete';
        remove.addEventListener('click', () => {
          this.commands.execute(
            removePieceSeam(layout.id, first.id, seam.id),
          );
        });
        rowHeader.append(rowTitle, remove);

        const fields = document.createElement('div');
        fields.className = 'lc-piece-seam-fields';

        const orientationLabel = document.createElement('label');
        orientationLabel.textContent = 'Direction';
        const orientation = document.createElement('select');
        [
          ['vertical', 'Vertical'],
          ['horizontal', 'Horizontal'],
        ].forEach(([value, labelText]) => {
          const option = document.createElement('option');
          option.value = value ?? '';
          option.textContent = labelText ?? '';
          orientation.append(option);
        });
        orientation.value = seam.orientation;
        orientation.addEventListener('change', () => {
          this.commands.execute(
            editPieceSeam(layout.id, first.id, seam.id, {
              orientation:
                orientation.value === 'horizontal'
                  ? 'horizontal'
                  : 'vertical',
            }),
          );
        });
        orientationLabel.append(orientation);

        const referenceLabel = document.createElement('label');
        referenceLabel.textContent = 'From';
        const reference = document.createElement('select');
        const references =
          seam.orientation === 'horizontal'
            ? [['top', 'Top'], ['bottom', 'Bottom']]
            : [['left', 'Left'], ['right', 'Right']];
        references.forEach(([value, labelText]) => {
          const option = document.createElement('option');
          option.value = value ?? '';
          option.textContent = labelText ?? '';
          reference.append(option);
        });
        reference.value = seam.reference;
        reference.addEventListener('change', () => {
          const value = reference.value;
          if (
            value !== 'top' &&
            value !== 'right' &&
            value !== 'bottom' &&
            value !== 'left'
          ) {
            return;
          }
          this.commands.execute(
            editPieceSeam(layout.id, first.id, seam.id, {
              reference: value,
            }),
          );
        });
        referenceLabel.append(reference);

        const offsetLabel = document.createElement('label');
        offsetLabel.textContent = 'Offset (in)';
        const offset = document.createElement('input');
        offset.type = 'number';
        offset.min = '0';
        offset.step = '0.25';
        offset.max = String(
          seam.orientation === 'horizontal' ? first.h : first.w,
        );
        offset.value = String(seam.offset);
        offset.addEventListener('change', () => {
          const value = Number(offset.value);
          if (!Number.isFinite(value)) return;
          this.commands.execute(
            editPieceSeam(layout.id, first.id, seam.id, {
              offset: value,
            }),
          );
        });
        offsetLabel.append(offset);

        fields.append(orientationLabel, referenceLabel, offsetLabel);
        row.append(rowHeader, fields);

        if (state.session.workspace === 'slab') {
          const cut = document.createElement('button');
          cut.type = 'button';
          cut.className = 'lc-btn ghost sm lc-seam-cut-action';
          cut.textContent = 'Cut into Pieces';
          const coordinate = pieceSeamLocalCoordinate(first, seam);
          const maximum =
            seam.orientation === 'horizontal' ? first.h : first.w;
          const invalid =
            coordinate <= 0.25 || coordinate >= maximum - 0.25;
          cut.disabled = invalid;
          cut.title = invalid
            ? 'Move the seam at least 1/4" away from the piece edge'
            : 'Convert this planning seam into two real fabrication pieces';
          cut.addEventListener('click', () => {
            const latest = this.store.getState();
            const latestLayout = latest.project.layouts.find(
              (item) => item.id === layout.id,
            );
            if (!latestLayout) return;
            const result = prepareFabricationSplit(
              latestLayout,
              first.id,
              seam.id,
              this.createId,
            );
            if (!result.ok) {
              document.defaultView?.alert(result.reason);
              return;
            }
            this.commands.execute(
              applyFabricationTransaction(layout.id, result.plan),
            );
          });
          row.append(cut);
        }

        seamRows.append(row);
      });

      if (!first.pieceSeams.length) {
        const empty = document.createElement('div');
        empty.className = 'lc-small lc-inspector-empty';
        empty.textContent = 'No seams on this piece.';
        seamRows.append(empty);
      }

      const addSeam = document.createElement('button');
      addSeam.type = 'button';
      addSeam.className = 'lc-btn ghost sm lc-add-inspector-item';
      addSeam.textContent = '+ Add Seam';
      addSeam.addEventListener('click', () => {
        this.commands.execute(
          addPieceSeam(
            layout.id,
            first.id,
            this.createId('seam'),
          ),
        );
      });

      seamSection.append(addSeam, seamRows);
      mount.append(seamSection);
    }

    const selectedSet = new Set(selection.ids);
    const fabricationLinks = new Map<
      string,
      { a: string; b: string; label: string }
    >();
    pieces.forEach((piece) => {
      piece.assemblyLinks.forEach((link) => {
        if (
          link.kind !== 'seam' ||
          !link.id ||
          !selectedSet.has(link.matePieceId) ||
          fabricationLinks.has(link.id)
        ) {
          return;
        }
        const mate = layout.pieces.find(
          (candidate) => candidate.id === link.matePieceId,
        );
        if (!mate) return;
        fabricationLinks.set(link.id, {
          a: piece.id,
          b: mate.id,
          label: piece.name + ' ↔ ' + mate.name,
        });
      });
    });

    if (fabricationLinks.size) {
      const section = document.createElement('div');
      section.className = 'lc-fabrication-seams-inspector';
      const title = document.createElement('strong');
      title.textContent = 'Fabrication Seams';
      section.append(title);

      fabricationLinks.forEach((info, linkId) => {
        const row = document.createElement('div');
        row.className = 'lc-fabrication-seam-row';
        const text = document.createElement('span');
        text.textContent = info.label;
        const merge = document.createElement('button');
        merge.type = 'button';
        merge.className = 'lc-btn ghost sm';
        merge.textContent = 'Merge';
        merge.title =
          'Merge these known mating seam edges back into one piece';
        merge.addEventListener('click', () => {
          const latest = this.store.getState();
          const latestLayout = latest.project.layouts.find(
            (item) => item.id === layout.id,
          );
          if (!latestLayout) return;
          const result = prepareFabricationMerge(
            latestLayout,
            linkId,
            this.createId,
          );
          if (!result.ok) {
            document.defaultView?.alert(result.reason);
            return;
          }
          this.commands.execute(
            applyFabricationTransaction(layout.id, result.plan),
          );
        });
        row.append(text, merge);
        section.append(row);
      });

      mount.append(section);
    }

    if (state.session.workspace === 'design') {
      const mirrorActions = document.createElement('div');
      mirrorActions.className = 'lc-piece-mirror-actions';
      const mirrorH = document.createElement('button');
      mirrorH.type = 'button';
      mirrorH.textContent = 'Mirror H';
      mirrorH.title = 'Mirror selected piece(s) left ↔ right';
      mirrorH.addEventListener('click', () => {
        this.commands.execute(mirrorPieces(layout.id, selection.ids, 'h'));
      });
      const mirrorV = document.createElement('button');
      mirrorV.type = 'button';
      mirrorV.textContent = 'Mirror V';
      mirrorV.title = 'Mirror selected piece(s) top ↔ bottom';
      mirrorV.addEventListener('click', () => {
        this.commands.execute(mirrorPieces(layout.id, selection.ids, 'v'));
      });
      mirrorActions.append(mirrorH, mirrorV);
      mount.append(mirrorActions);
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
