import {
  addMaterial,
  deleteMaterial,
  setSelection,
  updateMaterial,
  type ApplicationEffects,
  type AppStore,
  type CommandDispatcher,
  type ViewInvalidationBatch,
} from '../app';
import type { Material } from '../domain/project';
import type {
  BrowserConfirm,
  BrowserEntityIdFactory,
} from './project-layout-surface';

export interface MaterialSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  effects: ApplicationEffects;
  createId: BrowserEntityIdFactory;
  confirm?: BrowserConfirm;
}

function defaultConfirm(message: string): boolean {
  if (typeof window === 'undefined') return true;
  return window.confirm(message);
}

function targetElement(event: Event): HTMLElement | null {
  return event.target instanceof HTMLElement ? event.target : null;
}

export class MaterialSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly effects: ApplicationEffects;
  private readonly createId: BrowserEntityIdFactory;
  private readonly confirm: BrowserConfirm;

  private abort: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private card: HTMLElement | null = null;
  private navigator: HTMLElement | null = null;
  private inspector: HTMLElement | null = null;
  private createdCard = false;

  constructor(options: MaterialSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
    this.effects = options.effects;
    this.createId = options.createId;
    this.confirm = options.confirm ?? defaultConfirm;
  }

  mount(): void {
    if (this.abort) return;
    this.abort = new AbortController();
    const signal = this.abort.signal;

    this.card = this.ensureSelectionsCard();
    this.navigator = this.ensureNavigatorMount(this.card);
    this.inspector = this.root.querySelector<HTMLElement>('#lc-inspector');

    this.navigator?.addEventListener(
      'click',
      () => this.openMaterialsSelection(),
      { signal },
    );
    this.inspector?.addEventListener(
      'click',
      (event) => this.onInspectorClick(event),
      { signal },
    );
    this.inspector?.addEventListener(
      'change',
      (event) => this.onInspectorChange(event),
      { signal },
    );

    this.unsubscribe = this.effects.invalidation.subscribe((batch) =>
      this.renderInvalidation(batch),
    );
    this.renderNavigator();
    this.renderInspector();
  }

  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.abort?.abort();
    this.abort = null;
    if (this.createdCard) this.card?.remove();
    this.card = null;
    this.navigator = null;
    this.inspector = null;
    this.createdCard = false;
  }

  private ensureSelectionsCard(): HTMLElement | null {
    const existing = this.root.querySelector<HTMLElement>('#lc-selections-card');
    if (existing) return existing;

    const document =
      this.root instanceof Document ? this.root : this.root.ownerDocument;
    if (!document) return null;
    const aside = this.root.querySelector<HTMLElement>('aside');
    if (!aside) return null;

    const card = document.createElement('section');
    card.id = 'lc-selections-card';
    card.className = 'lc-card lc-selections-card';
    const title = document.createElement('h2');
    title.textContent = 'Selections';
    card.appendChild(title);

    const layouts = this.root.querySelector('#lc-layouts')?.closest('.lc-card');
    aside.insertBefore(card, layouts ?? null);
    this.createdCard = true;
    return card;
  }

  private ensureNavigatorMount(card: HTMLElement | null): HTMLElement | null {
    if (!card) return null;
    const existing = card.querySelector<HTMLElement>('[data-cad-materials-nav]');
    if (existing) return existing;
    const mount = card.ownerDocument.createElement('div');
    mount.dataset.cadMaterialsNav = '1';
    card.appendChild(mount);
    return mount;
  }

  private renderInvalidation(batch: ViewInvalidationBatch): void {
    const targets = new Set(batch.targets);
    if (targets.has('navigator')) this.renderNavigator();
    if (targets.has('inspector')) this.renderInspector();
  }

  private openMaterialsSelection(): void {
    const state = this.store.getState();
    const current =
      state.session.selection.kind === 'material'
        ? state.project.materials.find(
            (item) => item.id === state.session.selection.id,
          ) ?? null
        : null;
    const material = current ?? state.project.materials[0] ?? null;
    this.commands.execute(
      setSelection(
        material
          ? { kind: 'material', id: material.id }
          : { kind: 'materialCollection' },
      ),
    );
  }

  private renderNavigator(): void {
    const mount = this.navigator;
    if (!mount) return;
    const document = mount.ownerDocument;
    const state = this.store.getState();
    const materials = state.project.materials;
    const selected =
      state.session.selection.kind === 'material' ||
      state.session.selection.kind === 'materialCollection';

    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      'lc-selection-nav-item' + (selected ? ' selected' : '');
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');

    const info = document.createElement('span');
    info.className = 'lc-selection-nav-info';
    const name = document.createElement('span');
    name.className = 'lc-nav-title';
    name.textContent = 'Stone Materials';
    const meta = document.createElement('span');
    meta.className = 'lc-nav-meta lc-selection-nav-meta';
    meta.textContent = materials.length
      ? `${materials.length} configured`
      : 'Not configured';
    info.append(name, meta);

    const chevron = document.createElement('span');
    chevron.className = 'lc-selection-nav-chevron';
    chevron.textContent = '›';
    chevron.setAttribute('aria-hidden', 'true');
    button.append(info, chevron);
    mount.replaceChildren(button);
  }

  private activeMaterial(): Material | null {
    const state = this.store.getState();
    if (state.session.selection.kind !== 'material') return null;
    return (
      state.project.materials.find(
        (item) => item.id === state.session.selection.id,
      ) ?? null
    );
  }

  private renderInspector(): void {
    const inspector = this.inspector;
    if (!inspector) return;
    const state = this.store.getState();
    if (
      state.session.selection.kind !== 'material' &&
      state.session.selection.kind !== 'materialCollection'
    ) {
      return;
    }

    const document = inspector.ownerDocument;
    const materials = state.project.materials;
    const material = this.activeMaterial();

    const root = document.createElement('div');
    root.className =
      'lc-item selected lc-annotation-inspector lc-selection-inspector lc-material-inspector';
    const heading = document.createElement('div');
    heading.className = 'lc-inspector-context-title';
    heading.textContent = 'Selections';
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'lc-selection-inspector-title';
    sectionTitle.textContent = 'Stone Materials';
    root.append(heading, sectionTitle);

    const topRow = document.createElement('div');
    topRow.className = 'lc-selection-material-top-row';
    const pickerWrap = document.createElement('label');
    pickerWrap.className = 'lc-material-picker-wrap';
    const pickerLabel = document.createElement('span');
    pickerLabel.textContent = 'Project Material';
    const picker = document.createElement('select');
    picker.className = 'lc-input';
    picker.dataset.materialPicker = '1';
    if (materials.length) {
      materials.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        picker.appendChild(option);
      });
      picker.value = material?.id ?? materials[0]!.id;
    } else {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No materials configured';
      picker.appendChild(option);
      picker.disabled = true;
    }
    pickerWrap.append(pickerLabel, picker);

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'lc-btn lc-material-add';
    add.dataset.materialAction = 'add';
    add.textContent = '+ Add';
    topRow.append(pickerWrap, add);
    root.appendChild(topRow);

    if (!material) {
      const empty = document.createElement('div');
      empty.className = 'lc-small lc-material-foundation-hint';
      empty.textContent =
        'No Stone Materials yet. Add one to define project material details.';
      root.appendChild(empty);
      inspector.replaceChildren(root);
      return;
    }

    root.append(
      this.textField(document, 'Material / Color', 'name', material.name),
      this.textField(
        document,
        'Category / Stone Type',
        'category',
        material.category,
      ),
      this.textField(
        document,
        'Manufacturer',
        'manufacturer',
        material.manufacturer,
      ),
      this.textField(document, 'Finish', 'finish', material.finish),
      this.numberField(
        document,
        'Thickness (cm)',
        'thicknessCm',
        material.thicknessCm,
        0.5,
        10,
        0.1,
      ),
      this.numberField(
        document,
        'Default Slab Width (in)',
        'defaultSlabW',
        material.defaultSlabW,
        24,
        240,
        0.125,
      ),
      this.numberField(
        document,
        'Default Slab Height (in)',
        'defaultSlabH',
        material.defaultSlabH,
        24,
        120,
        0.125,
      ),
    );

    const hint = document.createElement('div');
    hint.className = 'lc-small lc-material-foundation-hint';
    hint.textContent =
      'Stone Materials are project-level selections. Area/Piece assignment and material-aware slabs come next.';
    root.appendChild(hint);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'lc-btn lc-delete-btn red lc-inspector-full-action';
    remove.dataset.materialAction = 'delete';
    remove.dataset.materialId = material.id;
    remove.textContent = 'Delete Material';
    root.appendChild(remove);
    inspector.replaceChildren(root);
  }

  private textField(
    document: Document,
    labelText: string,
    key: string,
    value: string,
  ): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'lc-material-field';
    const text = document.createElement('span');
    text.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'lc-input';
    input.value = value;
    input.dataset.materialField = key;
    label.append(text, input);
    return label;
  }

  private numberField(
    document: Document,
    labelText: string,
    key: string,
    value: number,
    min: number,
    max: number,
    step: number,
  ): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'lc-material-field';
    const text = document.createElement('span');
    text.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'lc-input';
    input.value = String(value);
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.dataset.materialField = key;
    label.append(text, input);
    return label;
  }

  private onInspectorClick(event: Event): void {
    const target = targetElement(event)?.closest<HTMLElement>(
      '[data-material-action]',
    );
    if (!target) return;
    const action = target.dataset.materialAction;
    if (action === 'add') {
      this.commands.execute(addMaterial(this.createId('material')));
      return;
    }
    if (action !== 'delete') return;
    const id = target.dataset.materialId;
    if (!id) return;
    const material = this.store.getState().project.materials.find(
      (item) => item.id === id,
    );
    if (!material) return;
    if (!this.confirm(`Delete "${material.name}" from this project?`)) return;
    this.commands.execute(deleteMaterial(id));
  }

  private onInspectorChange(event: Event): void {
    const target = targetElement(event);
    if (!target) return;
    if (target instanceof HTMLSelectElement && target.dataset.materialPicker) {
      if (target.value) {
        this.commands.execute(
          setSelection({ kind: 'material', id: target.value }),
        );
      }
      return;
    }
    if (!(target instanceof HTMLInputElement)) return;
    const key = target.dataset.materialField;
    const material = this.activeMaterial();
    if (!key || !material) return;

    if (
      key === 'thicknessCm' ||
      key === 'defaultSlabW' ||
      key === 'defaultSlabH'
    ) {
      this.commands.execute(
        updateMaterial(material.id, { [key]: Number(target.value) }),
      );
      return;
    }

    if (
      key === 'name' ||
      key === 'category' ||
      key === 'manufacturer' ||
      key === 'finish'
    ) {
      this.commands.execute(
        updateMaterial(material.id, { [key]: target.value }),
      );
    }
  }
}
