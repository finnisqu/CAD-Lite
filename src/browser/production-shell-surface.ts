export interface ProductionShellSurfaceOptions {
  root: ParentNode;
}

function ownerDocument(root: ParentNode): Document | null {
  if (typeof Document !== 'undefined' && root instanceof Document) return root;
  return (root as Node).ownerDocument ?? null;
}

/**
 * Owns production-shell-only chrome behavior.
 *
 * CAD commands remain owned by the existing typed browser surfaces. This
 * surface only coordinates toolbar dropdown visibility and proxy controls so
 * the production shell can expose the same command from more than one place
 * without duplicating domain/event ownership.
 */
export class ProductionShellSurface {
  private readonly root: ParentNode;
  private abort: AbortController | null = null;

  constructor(options: ProductionShellSurfaceOptions) {
    this.root = options.root;
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

    const setOpen = (menu: HTMLElement, open: boolean): void => {
      const button = menu.querySelector<HTMLButtonElement>(
        '[data-cad-lite-menu-button]',
      );
      const panel = menu.querySelector<HTMLElement>('[data-cad-lite-menu-panel]');
      if (!button || !panel) return;
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
          const open = panel.hidden;
          closeAll(menu);
          setOpen(menu, open);
        },
        { signal },
      );
      panel.addEventListener(
        'click',
        (event) => {
          const target = event.target;
          if (target instanceof Element && target.closest('button')) {
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
