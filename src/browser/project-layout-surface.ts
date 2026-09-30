import {
  renameLayout,
  setActiveLayout,
  setLayoutQuantity,
  setProjectMeta,
  type ApplicationEffects,
  type AppStore,
  type CommandDispatcher,
  type ViewInvalidationBatch,
} from '../app';
import { createProjectLayoutViewModel } from './project-layout-model';

export interface ProjectLayoutSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  effects: ApplicationEffects;
  today?: () => string;
}

function localTodayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
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

  private abort: AbortController | null = null;
  private subscriptions: Array<() => void> = [];
  private editingLayoutId: string | null = null;

  private projectInput: HTMLInputElement | null = null;
  private dateInput: HTMLInputElement | null = null;
  private notesInput: HTMLTextAreaElement | HTMLInputElement | null = null;
  private layoutsElement: HTMLElement | null = null;
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
  }

  renderAll(): void {
    this.renderProjectFields();
    this.renderLayouts();
    this.renderInspector();
    this.renderHistory();
    this.renderAutosave();
  }

  private renderInvalidation(batch: ViewInvalidationBatch): void {
    const targets = new Set(batch.targets);

    if (targets.has('navigator')) {
      this.renderProjectFields();
      this.renderLayouts();
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

      const rename = document.createElement('button');
      rename.type = 'button';
      rename.className = 'lc-btn ghost lc-iconbtn lc-rename-btn';
      rename.dataset.action = 'rename-layout';
      rename.dataset.layoutId = layout.id;
      rename.title = 'Rename layout';
      rename.setAttribute('aria-label', 'Rename layout');
      rename.textContent = '✎';

      actions.appendChild(rename);
      row.appendChild(actions);
      fragment.appendChild(row);
    });

    mount.replaceChildren(fragment);

    if (this.editingLayoutId) {
      queueMicrotask(() => {
        const selector = `input[data-cad-layout-rename="${CSS.escape(
          this.editingLayoutId ?? '',
        )}"]`;
        const input = mount.querySelector<HTMLInputElement>(selector);
        input?.focus();
        input?.select();
      });
    }
  }

  private renderInspector(): void {
    const mount = this.inspectorElement;
    if (!mount) return;

    const document = mount.ownerDocument;
    const selected = this.model().selectedLayout;
    mount.replaceChildren();

    if (!selected) return;

    const root = document.createElement('div');
    root.className =
      'lc-item selected lc-annotation-inspector lc-layout-inspector';

    const context = document.createElement('div');
    context.className = 'lc-inspector-context';

    const heading = document.createElement('div');
    heading.className = 'lc-inspector-context-title';
    heading.textContent = selected.name || 'Layout';
    context.appendChild(heading);

    const body = document.createElement('div');
    body.className = 'lc-subcard lc-inspector-collapsible';

    const label = document.createElement('div');
    label.className = 'lc-subcard-label lc-small';
    label.textContent = 'Layout';

    const fields = document.createElement('div');
    fields.className = 'lc-subcard-body';

    fields.append(
      this.inspectorInput(
        document,
        'Name',
        'text',
        selected.name,
        'name',
        selected.id,
      ),
      this.inspectorInput(
        document,
        'Quantity',
        'number',
        String(selected.quantity),
        'quantity',
        selected.id,
      ),
    );

    const summary = document.createElement('div');
    summary.className = 'lc-small lc-layout-architecture-summary';
    summary.textContent =
      `${selected.areaCount} area${selected.areaCount === 1 ? '' : 's'} · ` +
      `${selected.pieceCount} piece${selected.pieceCount === 1 ? '' : 's'}`;
    fields.appendChild(summary);

    body.append(label, fields);
    root.append(context, body);
    mount.appendChild(root);
  }

  private inspectorInput(
    document: Document,
    labelText: string,
    type: 'text' | 'number',
    value: string,
    field: 'name' | 'quantity',
    layoutId: string,
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
    input.dataset.cadLayoutField = field;
    input.dataset.layoutId = layoutId;

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

  private onLayoutsClick(event: Event): void {
    const target = elementTarget(event);
    if (!target) return;

    const rename = target.closest<HTMLElement>(
      '[data-action="rename-layout"]',
    );
    if (rename) {
      event.preventDefault();
      event.stopPropagation();
      const layoutId = rename.dataset.layoutId;
      if (!layoutId) return;
      this.editingLayoutId = layoutId;
      this.renderLayouts();
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
        this.finishInlineRename(renameInput, true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.finishInlineRename(renameInput, false);
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
    if (input) this.finishInlineRename(input, true);
  }

  private finishInlineRename(
    input: HTMLInputElement,
    save: boolean,
  ): void {
    const layoutId = input.dataset.cadLayoutRename;
    if (!layoutId || this.editingLayoutId !== layoutId) return;

    this.editingLayoutId = null;
    if (save) this.commands.execute(renameLayout(layoutId, input.value));
    this.renderLayouts();
  }

  private onInspectorChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const layoutId = target.dataset.layoutId;
    const field = target.dataset.cadLayoutField;
    if (!layoutId || !field) return;

    const layout = this.store
      .getState()
      .project.layouts.find((item) => item.id === layoutId);
    if (!layout) return;

    if (field === 'name') {
      const next = target.value.trim() || layout.name || 'Layout';
      this.commands.execute(renameLayout(layoutId, next));
      return;
    }

    if (field === 'quantity') {
      this.commands.execute(
        setLayoutQuantity(layoutId, Number(target.value)),
      );
    }
  }

  private model() {
    return createProjectLayoutViewModel(
      this.store.getState(),
      this.effects.history.getStatus(),
      this.effects.autosave.getStatus(),
    );
  }
}
