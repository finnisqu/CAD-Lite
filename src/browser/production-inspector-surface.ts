export type ProductionPieceInspectorSection =
  | 'pieceInfo'
  | 'appearance'
  | 'overhangs'
  | 'splashes'
  | 'edgeOptions'
  | 'sinks'
  | 'cutouts'
  | 'seams'
  | 'fabricationSeams';

export type ProductionInspectorDisclosureKind = 'piece' | 'context';

export interface ProductionInspectorSurfaceOptions {
  root: ParentNode;
}

interface PieceSectionConfig {
  key: Exclude<ProductionPieceInspectorSection, 'pieceInfo'>;
  sectionSelector: string;
  headerSelector: string;
}

const PIECE_SECTION_CONFIGS: readonly PieceSectionConfig[] = [
  {
    key: 'appearance',
    sectionSelector: '.lc-production-piece-appearance',
    headerSelector: ':scope > .lc-production-piece-properties__header',
  },
  {
    key: 'overhangs',
    sectionSelector: '.lc-production-piece-overhangs',
    headerSelector: ':scope > .lc-production-piece-properties__header',
  },
  {
    key: 'splashes',
    sectionSelector: '.lc-production-piece-splashes',
    headerSelector: ':scope > .lc-production-piece-splashes__header',
  },
  {
    key: 'edgeOptions',
    sectionSelector: '.lc-production-piece-edge-options',
    headerSelector: ':scope > .lc-production-piece-properties__header',
  },
  {
    key: 'sinks',
    sectionSelector: '.lc-piece-sinks-inspector',
    headerSelector: ':scope > .lc-piece-sinks-inspector__header',
  },
  {
    key: 'cutouts',
    sectionSelector: '.lc-piece-cutouts-inspector',
    headerSelector: ':scope > .lc-piece-cutouts-inspector__header',
  },
  {
    key: 'seams',
    sectionSelector: '.lc-piece-seams-inspector',
    headerSelector: ':scope > .lc-piece-seams-inspector__header',
  },
  {
    key: 'fabricationSeams',
    sectionSelector: '.lc-fabrication-seams-inspector',
    headerSelector: ':scope > strong:first-child',
  },
];

function disclosureIdToken(value: string): string {
  return (
    value
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'section'
  );
}

export function productionInspectorPanelId(
  kind: ProductionInspectorDisclosureKind,
  key: string,
  index = 0,
): string {
  const suffix = index > 0 ? `-${String(index + 1)}` : '';
  return (
    `cad-lite-production-inspector-${kind}-${disclosureIdToken(key)}` +
    `-panel${suffix}`
  );
}

export function nextProductionInspectorSection(
  current: ProductionPieceInspectorSection | null,
  requested: ProductionPieceInspectorSection,
): ProductionPieceInspectorSection | null {
  return current === requested ? null : requested;
}

function contextKey(root: HTMLElement): string {
  if (root.classList.contains('lc-layout-inspector')) return 'layout';
  if (root.classList.contains('lc-area-inspector')) return 'area';
  if (root.classList.contains('lc-selection-inspector')) return 'selection';
  if (root.classList.contains('lc-piece-group-inspector')) return 'pieceGroup';
  if (root.classList.contains('lc-room-feature-inspector')) return 'roomFeature';
  if (root.classList.contains('lc-slab-inspector')) return 'slab';
  return 'annotation';
}

function directChildrenAfter(
  parent: HTMLElement,
  child: Element,
): HTMLElement[] {
  const children = Array.from(parent.children);
  const index = children.indexOf(child);
  if (index < 0) return [];
  return children.slice(index + 1).filter(
    (candidate): candidate is HTMLElement => candidate instanceof HTMLElement,
  );
}

function linkDisclosure(
  toggle: HTMLElement,
  bodies: readonly HTMLElement[],
  kind: ProductionInspectorDisclosureKind,
  key: string,
): void {
  const ids = bodies.map((body, index) => {
    if (!body.id) body.id = productionInspectorPanelId(kind, key, index);
    return body.id;
  });

  if (ids.length > 0) {
    toggle.setAttribute('aria-controls', ids.join(' '));
  } else {
    toggle.removeAttribute('aria-controls');
  }
}

/**
 * Adds production-only Inspector accordion presentation around the existing
 * typed Inspector DOM. It deliberately does not own CAD data or commands.
 *
 * v1.5.99 used an exclusive Piece Inspector accordion. Typed v1.6 sections
 * are restored here only when real controls exist behind them; no empty legacy
 * sections are created for capabilities that have not been migrated yet.
 * Other typed Inspector contexts receive a simple collapsible heading.
 */
export class ProductionInspectorSurface {
  private readonly root: ParentNode;
  private inspector: HTMLElement | null = null;
  private abort: AbortController | null = null;
  private observer: MutationObserver | null = null;
  private decorating = false;
  private pieceSection: ProductionPieceInspectorSection | null = 'pieceInfo';
  private readonly contextOpen = new Map<string, boolean>();

  constructor(options: ProductionInspectorSurfaceOptions) {
    this.root = options.root;
  }

  mount(): void {
    if (this.abort) return;
    if (!this.root.querySelector('[data-cad-lite-production-shell]')) return;

    const inspector = this.root.querySelector<HTMLElement>('#lc-inspector');
    if (!inspector) return;

    this.inspector = inspector;
    this.abort = new AbortController();
    const signal = this.abort.signal;

    inspector.addEventListener('click', (event) => this.onActivate(event), {
      signal,
    });
    inspector.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (this.onActivate(event)) event.preventDefault();
      },
      { signal },
    );

    const Observer = inspector.ownerDocument.defaultView?.MutationObserver;
    if (Observer) {
      this.observer = new Observer(() => {
        if (this.decorating) return;
        queueMicrotask(() => this.decorate());
      });
      this.observer.observe(inspector, { childList: true, subtree: true });
    }

    this.decorate();
  }

  unmount(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.abort?.abort();
    this.abort = null;
    this.inspector = null;
    this.decorating = false;
  }

  private onActivate(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    const toggle = target.closest<HTMLElement>(
      '[data-production-inspector-toggle]',
    );
    const inspector = this.inspector;
    if (!toggle || !inspector?.contains(toggle)) return false;

    const nestedInteractive = target.closest(
      'button,input,select,textarea,a,[contenteditable="true"]',
    );
    if (nestedInteractive && nestedInteractive !== toggle) return false;

    const kind = toggle.dataset.productionInspectorToggle;
    const key = toggle.dataset.productionInspectorKey;
    if (!key) return false;

    if (kind === 'piece') {
      this.pieceSection = nextProductionInspectorSection(
        this.pieceSection,
        key as ProductionPieceInspectorSection,
      );
      this.decorate();
      return true;
    }

    if (kind === 'context') {
      const open = this.contextOpen.get(key) ?? true;
      this.contextOpen.set(key, !open);
      this.decorate();
      return true;
    }

    return false;
  }

  private decorate(): void {
    const inspector = this.inspector;
    if (!inspector || this.decorating) return;
    this.decorating = true;
    try {
      this.decorateContextInspectors(inspector);
      this.decoratePieceInfo(inspector);
      this.decoratePieceSections(inspector);
    } finally {
      this.decorating = false;
    }
  }

  private decorateContextInspectors(inspector: HTMLElement): void {
    inspector
      .querySelectorAll<HTMLElement>(':scope > .lc-item')
      .forEach((root) => {
        const heading = root.querySelector<HTMLElement>(
          ':scope > .lc-inspector-context-title',
        );
        if (!heading) return;
        const key = contextKey(root);
        const open = this.contextOpen.get(key) ?? true;
        const controlled = directChildrenAfter(root, heading);

        root.classList.add('lc-production-inspector-context');
        root.classList.toggle('is-production-collapsed', !open);
        heading.classList.add('lc-production-inspector-toggle');
        heading.dataset.productionInspectorToggle = 'context';
        heading.dataset.productionInspectorKey = key;
        heading.setAttribute('role', 'button');
        heading.setAttribute('tabindex', '0');
        heading.setAttribute('aria-expanded', String(open));
        heading.title = open ? 'Collapse section' : 'Expand section';
        linkDisclosure(heading, controlled, 'context', key);

        controlled.forEach((child) => {
          child.hidden = !open;
        });
      });
  }

  private decoratePieceInfo(inspector: HTMLElement): void {
    let section = inspector.querySelector<HTMLElement>(
      ':scope > [data-production-piece-info]',
    );

    if (!section) {
      const heading = Array.from(inspector.children).find(
        (child): child is HTMLHeadingElement =>
          child instanceof HTMLHeadingElement && child.tagName === 'H3',
      );
      if (!heading) return;

      const stopSelector = [
        '.lc-production-piece-appearance',
        '.lc-production-piece-overhangs',
        '.lc-production-piece-splashes',
        '.lc-production-piece-edge-options',
        '.lc-piece-sinks-inspector',
        '.lc-piece-cutouts-inspector',
        '.lc-piece-seams-inspector',
        '.lc-fabrication-seams-inspector',
        '.lc-piece-mirror-actions',
      ].join(',');
      const bodyChildren: HTMLElement[] = [];
      let cursor = heading.nextElementSibling;
      while (cursor && !cursor.matches(stopSelector)) {
        if (cursor instanceof HTMLElement) bodyChildren.push(cursor);
        cursor = cursor.nextElementSibling;
      }

      section = inspector.ownerDocument.createElement('section');
      section.className =
        'lc-production-inspector-section lc-production-piece-info';
      section.dataset.productionPieceInfo = '1';
      inspector.insertBefore(section, heading);

      const body = inspector.ownerDocument.createElement('div');
      body.className = 'lc-production-piece-info-body';
      section.append(heading, body);
      bodyChildren.forEach((child) => body.append(child));
    }

    const heading = section.querySelector<HTMLElement>(':scope > h3');
    const body = section.querySelector<HTMLElement>(
      ':scope > .lc-production-piece-info-body',
    );
    if (!heading || !body) return;

    const open = this.pieceSection === 'pieceInfo';
    section.classList.toggle('is-open', open);
    section.classList.toggle('is-collapsed', !open);
    heading.classList.add(
      'lc-production-inspector-toggle',
      'lc-production-inspector-section-toggle',
    );
    heading.dataset.productionInspectorToggle = 'piece';
    heading.dataset.productionInspectorKey = 'pieceInfo';
    heading.setAttribute('role', 'button');
    heading.setAttribute('tabindex', '0');
    heading.setAttribute('aria-expanded', String(open));
    heading.title = open ? 'Collapse Piece Info' : 'Expand Piece Info';
    linkDisclosure(heading, [body], 'piece', 'pieceInfo');
    body.hidden = !open;
  }

  private decoratePieceSections(inspector: HTMLElement): void {
    PIECE_SECTION_CONFIGS.forEach((config) => {
      const sections = inspector.querySelectorAll<HTMLElement>(
        `:scope > ${config.sectionSelector}`,
      );
      sections.forEach((section) => {
        const header = section.querySelector<HTMLElement>(config.headerSelector);
        if (!header) return;
        const open = this.pieceSection === config.key;
        const controlled = directChildrenAfter(section, header);

        section.classList.add('lc-production-inspector-section');
        section.classList.toggle('is-open', open);
        section.classList.toggle('is-collapsed', !open);
        section.dataset.productionInspectorSection = config.key;

        header.classList.add(
          'lc-production-inspector-toggle',
          'lc-production-inspector-section-toggle',
        );
        header.dataset.productionInspectorToggle = 'piece';
        header.dataset.productionInspectorKey = config.key;
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');
        header.setAttribute('aria-expanded', String(open));
        header.title = open ? 'Collapse section' : 'Expand section';
        linkDisclosure(header, controlled, 'piece', config.key);

        controlled.forEach((child) => {
          child.hidden = !open;
        });
      });
    });
  }
}
