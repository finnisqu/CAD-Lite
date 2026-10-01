import type {
  CanvasSelectionActions,
  SelectionController,
} from '../app';

export interface ProductionShellSurfaceOptions {
  root: ParentNode;
  actions: CanvasSelectionActions;
  selection: SelectionController;
  deleteSelection: () => boolean;
}

const NAV_SECTION_STORAGE_KEY = 'cadlite:v1.6-production-shell:nav-sections';

function ownerDocument(root: ParentNode): Document | null {
  if (typeof Document !== 'undefined' && root instanceof Document) return root;
  return (root as Node).ownerDocument ?? null;
}

function loadCollapsedSections(document: Document | null): Set<string> {
  try {
    const raw = document?.defaultView?.localStorage.getItem(NAV_SECTION_STORAGE_KEY);
    if (!raw) return new Set();
    const parseJson = JSON.parse as (text: string) => unknown;
    const parsed = parseJson(raw);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}

function saveCollapsedSections(
  document: Document | null,
  collapsed: ReadonlySet<string>,
): void {
  try {
    document?.defaultView?.localStorage.setItem(
      NAV_SECTION_STORAGE_KEY,
      JSON.stringify([...collapsed]),
    );
  } catch {
    // Shell collapse state is a convenience preference; storage failure should
    // never block CAD interaction.
  }
}

/**
 * Owns production-shell-only chrome behavior.
 *
 * CAD mutations remain owned by typed controllers/actions. This surface only
 * coordinates toolbar menus, Navigator section chrome, proxy controls, and
 * explicit delegation into those existing command paths.
 */
export class ProductionShellSurface {
  private readonly root: ParentNode;
  private readonly actions: CanvasSelectionActions;
  private readonly selection: SelectionController;
  private readonly deleteSelection: () => boolean;
  private abort: AbortController | null = null;

  constructor(options: ProductionShellSurfaceOptions) {
    this.root = options.root;
    this.actions = options.actions;
    this.selection = options.selection;
    this.deleteSelection = options.deleteSelection;
  }

  mount(): void {
    if (this.abort) return;

    const shell = this.root.querySelector<HTMLElement>(
      '[data-cad-lite-production-shell]',
    );
    if (!shell) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    const document = ownerDocument(this.root);
    const menus = Array.from(
      shell.querySelectorAll<HTMLElement>('[data-cad-lite-menu]'),
    );

    const syncProxyStates = (menu: HTMLElement): void => {
      menu
        .querySelectorAll<HTMLButtonElement>('[data-cad-lite-proxy]')
        .forEach((proxy) => {
          const selector = proxy.dataset.cadLiteProxy;
          const target = selector
            ? this.root.querySelector<HTMLButtonElement>(selector)
            : null;
          proxy.disabled = !target || target === proxy || target.disabled;
        });

      const paste = menu.querySelector<HTMLButtonElement>('#lc-edit-paste');
      if (paste) paste.disabled = this.actions.getClipboardKind() === null;

      const selected = this.selection.getSelection().kind !== 'none';
      const copy = menu.querySelector<HTMLButtonElement>('#lc-edit-copy');
      const duplicate = menu.querySelector<HTMLButtonElement>('#lc-edit-duplicate');
      const remove = menu.querySelector<HTMLButtonElement>('#lc-edit-delete');
      const deselect = menu.querySelector<HTMLButtonElement>('#lc-edit-deselect');
      if (copy) copy.disabled = !selected;
      if (duplicate) duplicate.disabled = !selected;
      if (remove) remove.disabled = !selected;
      if (deselect) deselect.disabled = !selected;
    };

    const setOpen = (menu: HTMLElement, open: boolean): void => {
      const button = menu.querySelector<HTMLButtonElement>(
        '[data-cad-lite-menu-button]',
      );
      const panel = menu.querySelector<HTMLElement>('[data-cad-lite-menu-panel]');
      if (!button || !panel) return;
      if (open) syncProxyStates(menu);
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
    };

    const closeAll = (except: HTMLElement | null = null): void => {
      menus.forEach((menu) => {
        if (menu !== except) setOpen(menu, false);
      });
    };

    menus.forEach((menu) => {
      const button = menu.querySelector<HTMLButtonElement>(
        '[data-cad-lite-menu-button]',
      );
      const panel = menu.querySelector<HTMLElement>('[data-cad-lite-menu-panel]');
      if (!button || !panel) return;

      setOpen(menu, false);
      button.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          const open = panel.hidden !== false;
          closeAll(menu);
          setOpen(menu, open);
        },
        { signal },
      );
      panel.addEventListener(
        'click',
        (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const control = target.closest<HTMLButtonElement>('button');
          if (control && !control.hasAttribute('data-cad-lite-menu-keep-open')) {
            setOpen(menu, false);
          }
        },
        { signal },
      );
    });

    shell
      .querySelectorAll<HTMLButtonElement>('[data-cad-lite-proxy]')
      .forEach((proxy) => {
        proxy.addEventListener(
          'click',
          () => {
            const selector = proxy.dataset.cadLiteProxy;
            if (!selector) return;
            const target = this.root.querySelector<HTMLButtonElement>(selector);
            if (!target || target === proxy || target.disabled) return;
            target.click();
          },
          { signal },
        );
      });

    const bindEdit = (selector: string, action: () => boolean): void => {
      shell.querySelector<HTMLButtonElement>(selector)?.addEventListener(
        'click',
        () => action(),
        { signal },
      );
    };
    bindEdit('#lc-edit-copy', () => this.actions.copy());
    bindEdit('#lc-edit-paste', () => this.actions.paste());
    bindEdit('#lc-edit-duplicate', () => this.actions.duplicate());
    bindEdit('#lc-edit-delete', () => this.deleteSelection());
    bindEdit('#lc-edit-select-all', () => this.actions.selectAllPieces());
    bindEdit('#lc-edit-deselect', () => this.selection.clear());

    const collapsedSections = loadCollapsedSections(document);
    const navSections = Array.from(
      shell.querySelectorAll<HTMLElement>('[data-cad-lite-nav-section]'),
    );
    const setSectionCollapsed = (
      section: HTMLElement,
      collapsed: boolean,
    ): void => {
      const toggle = section.querySelector<HTMLButtonElement>(
        '[data-cad-lite-section-toggle]',
      );
      const body = section.querySelector<HTMLElement>(
        '[data-cad-lite-section-body]',
      );
      if (!toggle || !body) return;
      body.hidden = collapsed;
      toggle.setAttribute('aria-expanded', String(!collapsed));
      section.classList.toggle('is-collapsed', collapsed);
    };

    navSections.forEach((section) => {
      const key = section.dataset.cadLiteNavSection;
      const toggle = section.querySelector<HTMLButtonElement>(
        '[data-cad-lite-section-toggle]',
      );
      if (!key || !toggle) return;
      setSectionCollapsed(section, collapsedSections.has(key));
      toggle.addEventListener(
        'click',
        () => {
          const collapsed = !section.classList.contains('is-collapsed');
          if (collapsed) collapsedSections.add(key);
          else collapsedSections.delete(key);
          setSectionCollapsed(section, collapsed);
          saveCollapsedSections(document, collapsedSections);
        },
        { signal },
      );
    });

    document?.addEventListener(
      'pointerdown',
      (event) => {
        const target = event.target as Node | null;
        if (!target || menus.some((menu) => menu.contains(target))) return;
        closeAll();
      },
      { signal },
    );
    document?.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') closeAll();
      },
      { signal },
    );
  }

  unmount(): void {
    this.abort?.abort();
    this.abort = null;
  }
}
