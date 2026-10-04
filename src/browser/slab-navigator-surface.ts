import {
  deleteSlabSurface,
  setSelection,
  updateSlabSurface,
  type ApplicationEffects,
  type AppStore,
  type CommandDispatcher,
  type ViewInvalidationBatch,
} from '../app';

export interface SlabNavigatorSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  effects: ApplicationEffects;
  confirm?: (message: string) => boolean;
}

export interface SlabNavigatorItem {
  id: string;
  name: string;
  dimensions: string;
  visible: boolean;
  selected: boolean;
}

export interface SlabNavigatorProjection {
  visible: boolean;
  count: number;
  items: SlabNavigatorItem[];
}

export function createSlabNavigatorProjection(
  state: ReturnType<AppStore['getState']>,
): SlabNavigatorProjection {
  if (state.session.workspace !== 'slab') {
    return { visible: false, count: 0, items: [] };
  }

  const layout = state.project.layouts.find(
    (item) => item.id === state.session.activeLayoutId,
  );
  if (!layout) return { visible: true, count: 0, items: [] };

  const selection = state.session.selection;
  return {
    visible: true,
    count: layout.overlays.length,
    items: layout.overlays.map((slab) => ({
      id: slab.id,
      name: slab.name,
      dimensions: `${slab.slabW}" × ${slab.slabH}"`,
      visible: slab.visible,
      selected: selection.kind === 'slab' && selection.id === slab.id,
    })),
  };
}

export function isSlabNavigatorActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

function defaultConfirm(message: string): boolean {
  if (typeof window === 'undefined') return true;
  return window.confirm(message);
}

export class SlabNavigatorSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly effects: ApplicationEffects;
  private readonly confirm: (message: string) => boolean;
  private section: HTMLElement | null = null;
  private mountElement: HTMLElement | null = null;
  private countElement: HTMLElement | null = null;
  private abort: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(options: SlabNavigatorSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
    this.effects = options.effects;
    this.confirm = options.confirm ?? defaultConfirm;
  }

  mount(): void {
    if (this.abort) return;
    this.section = this.root.querySelector<HTMLElement>(
      '[data-cad-lite-nav-section="slabs"]',
    );
    this.mountElement = this.root.querySelector<HTMLElement>('#lc-slabs');
    this.countElement = this.root.querySelector<HTMLElement>('#lc-slabs-count');
    if (!this.section || !this.mountElement) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.mountElement.addEventListener(
      'click',
      (event) => this.onClick(event),
      { signal },
    );
    this.mountElement.addEventListener(
      'keydown',
      (event) => this.onKeyDown(event),
      { signal },
    );
    this.unsubscribe = this.effects.invalidation.subscribe((batch) =>
      this.renderInvalidation(batch),
    );
    this.render();
  }

  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.abort?.abort();
    this.abort = null;
    this.section = null;
    this.mountElement = null;
    this.countElement = null;
  }

  render(): void {
    const section = this.section;
    const mount = this.mountElement;
    if (!section || !mount) return;

    const projection = createSlabNavigatorProjection(this.store.getState());
    section.hidden = !projection.visible;
    if (!projection.visible) {
      mount.replaceChildren();
      return;
    }

    if (this.countElement) {
      this.countElement.textContent = `(${projection.count})`;
    }

    const document = mount.ownerDocument;
    const fragment = document.createDocumentFragment();

    if (!projection.items.length) {
      const empty = document.createElement('div');
      empty.className = 'lc-small lc-slab-nav-empty';
      empty.textContent = 'No slabs on this Layout.';
      fragment.appendChild(empty);
    }

    projection.items.forEach((item) => {
      const row = document.createElement('div');
      row.className =
        'lc-item nav lc-slab-nav-row' + (item.selected ? ' selected' : '');
      row.dataset.slabId = item.id;
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', `Select ${item.name || 'slab'}`);
      row.setAttribute('aria-pressed', String(item.selected));

      const text = document.createElement('div');
      text.className = 'lc-slab-nav-text';
      const name = document.createElement('strong');
      name.textContent = item.name;
      name.title = item.name;
      const meta = document.createElement('span');
      meta.className = 'lc-small';
      meta.textContent = item.dimensions;
      text.append(name, meta);

      const eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'lc-btn ghost lc-iconbtn';
      eye.dataset.slabAction = 'visibility';
      eye.title = item.visible ? 'Hide slab' : 'Show slab';
      eye.setAttribute('aria-label', eye.title);
      eye.setAttribute('aria-pressed', String(item.visible));
      eye.textContent = item.visible ? '◉' : '○';

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lc-btn red lc-iconbtn';
      remove.dataset.slabAction = 'delete';
      remove.title = 'Delete slab';
      remove.setAttribute('aria-label', 'Delete slab');
      remove.textContent = '×';

      row.append(text, eye, remove);
      fragment.appendChild(row);
    });

    mount.replaceChildren(fragment);
  }

  private renderInvalidation(batch: ViewInvalidationBatch): void {
    if (
      batch.targets.includes('navigator') ||
      batch.targets.includes('toolbar') ||
      batch.targets.includes('canvas')
    ) {
      this.render();
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const row = target?.closest<HTMLElement>('[data-slab-id]');
    const slabId = row?.dataset.slabId;
    if (
      !row ||
      !slabId ||
      target !== row ||
      !isSlabNavigatorActivationKey(event.key)
    ) {
      return;
    }

    const state = this.store.getState();
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    const slab = layout?.overlays.find((item) => item.id === slabId);
    if (!layout || !slab || state.session.workspace !== 'slab') return;

    event.preventDefault();
    this.commands.execute(setSelection({ kind: 'slab', id: slab.id }));
  }

  private onClick(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
    const row = target?.closest<HTMLElement>('[data-slab-id]');
    const slabId = row?.dataset.slabId;
    if (!row || !slabId) return;

    const state = this.store.getState();
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    const slab = layout?.overlays.find((item) => item.id === slabId);
    if (!layout || !slab || state.session.workspace !== 'slab') return;

    const action = target?.closest<HTMLElement>('[data-slab-action]')?.dataset
      .slabAction;
    if (action === 'visibility') {
      event.stopPropagation();
      this.commands.execute(
        updateSlabSurface(layout.id, slab.id, { visible: !slab.visible }),
      );
      return;
    }
    if (action === 'delete') {
      event.stopPropagation();
      if (this.confirm(`Delete "${slab.name}"?`)) {
        this.commands.execute(deleteSlabSurface(layout.id, slab.id));
      }
      return;
    }

    this.commands.execute(setSelection({ kind: 'slab', id: slab.id }));
  }
}
