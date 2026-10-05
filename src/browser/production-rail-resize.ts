export type ProductionRail = 'navigator' | 'inspector';

export const PRODUCTION_RAIL_LIMITS: Readonly<Record<ProductionRail, { min: number; max: number }>> = {
  navigator: { min: 190, max: 420 },
  inspector: { min: 220, max: 480 },
};

export function clampProductionRailWidth(rail: ProductionRail, width: number): number {
  const { min, max } = PRODUCTION_RAIL_LIMITS[rail];
  return Math.min(max, Math.max(min, width));
}

function createHitbox(
  title: HTMLElement,
  rail: ProductionRail,
): HTMLElement {
  const document = title.ownerDocument;
  const hitbox = document.createElement('span');
  hitbox.className = 'cad-lite-production-shell__rail-resize-hitbox';
  hitbox.dataset.cadLiteRailResize = rail;
  hitbox.setAttribute('role', 'separator');
  hitbox.setAttribute('aria-orientation', 'vertical');
  hitbox.setAttribute(
    'aria-label',
    `Resize ${rail === 'navigator' ? 'Navigator' : 'Inspector'}`,
  );
  title.appendChild(hitbox);
  return hitbox;
}

export function mountProductionRailResize(root: ParentNode = document): () => void {
  const shell = root.querySelector<HTMLElement>('.cad-lite-production-shell');
  if (!shell || shell.dataset.cadLiteRailResizeMounted === '1') return () => undefined;
  shell.dataset.cadLiteRailResizeMounted = '1';

  const body = shell.querySelector<HTMLElement>('.cad-lite-production-shell__body');
  const navigator = shell.querySelector<HTMLElement>('.cad-lite-production-shell__navigator');
  const inspector = shell.querySelector<HTMLElement>('.cad-lite-production-shell__inspector');
  if (!body || !navigator || !inspector) return () => undefined;

  const controllers: AbortController[] = [];
  const mounts: ReadonlyArray<[ProductionRail, HTMLElement]> = [
    ['navigator', navigator],
    ['inspector', inspector],
  ];

  mounts.forEach(([rail, panel]) => {
    const title = panel.querySelector<HTMLElement>(
      ':scope > .cad-lite-production-shell__panel-title',
    );
    if (!title) return;
    const existing = title.querySelector<HTMLElement>(
      `[data-cad-lite-rail-resize="${rail}"]`,
    );
    const hitbox = existing ?? createHitbox(title, rail);
    const controller = new AbortController();
    controllers.push(controller);
    const { signal } = controller;

    hitbox.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      { signal },
    );

    hitbox.addEventListener(
      'keydown',
      (event) => event.stopPropagation(),
      { signal },
    );

    hitbox.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 0 || shell.ownerDocument.defaultView?.innerWidth && shell.ownerDocument.defaultView.innerWidth <= 980) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = panel.getBoundingClientRect().width;
        shell.classList.add('is-rail-resizing');
        hitbox.setPointerCapture?.(event.pointerId);

        const move = (moveEvent: PointerEvent): void => {
          const delta = moveEvent.clientX - startX;
          const candidate = rail === 'navigator'
            ? startWidth + delta
            : startWidth - delta;
          const width = clampProductionRailWidth(rail, candidate);
          shell.style.setProperty(
            rail === 'navigator' ? '--lc-navigator-width' : '--lc-inspector-width',
            `${Math.round(width)}px`,
          );
          hitbox.setAttribute('aria-valuenow', String(Math.round(width)));
        };

        const finish = (): void => {
          shell.classList.remove('is-rail-resizing');
          hitbox.removeEventListener('pointermove', move);
          hitbox.removeEventListener('pointerup', finish);
          hitbox.removeEventListener('pointercancel', finish);
        };

        hitbox.addEventListener('pointermove', move);
        hitbox.addEventListener('pointerup', finish);
        hitbox.addEventListener('pointercancel', finish);
      },
      { signal },
    );
  });

  return () => {
    controllers.forEach((controller) => controller.abort());
    shell.querySelectorAll('[data-cad-lite-rail-resize]').forEach((node) => node.remove());
    shell.classList.remove('is-rail-resizing');
    delete shell.dataset.cadLiteRailResizeMounted;
  };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountProductionRailResize(document), { once: true });
  } else {
    mountProductionRailResize(document);
  }
}
