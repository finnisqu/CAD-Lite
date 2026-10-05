const DYNAMIC_SECTION_KEYS = ['notes', 'dimensions', 'lines', 'room-features'] as const;

type DynamicSectionKey = (typeof DYNAMIC_SECTION_KEYS)[number];

interface DynamicSectionTarget {
  section: HTMLElement;
  title: HTMLElement;
  actions: HTMLElement;
  body: HTMLElement;
  addButton: HTMLButtonElement | null;
}

function directChild<T extends Element>(
  root: Element,
  selector: string,
): T | null {
  return Array.from(root.children).find(
    (child): child is T => child.matches(selector),
  ) ?? null;
}

function sectionTitle(section: HTMLElement): HTMLElement | null {
  return section.querySelector<HTMLElement>('.cad-lite-production-shell__section-title');
}

function createSection(
  document: Document,
  key: DynamicSectionKey,
  label: string,
  addLabel: string | null,
  addTarget: string | null,
): DynamicSectionTarget {
  const section = document.createElement('section');
  section.className =
    'cad-lite-production-shell__section cad-lite-production-shell__nav-section lc-production-parity-section';
  section.dataset.cadLiteNavSection = key;

  const head = document.createElement('div');
  head.className = 'cad-lite-production-shell__section-head';

  const toggle = document.createElement('button');
  toggle.className = 'cad-lite-production-shell__section-toggle';
  toggle.dataset.cadLiteSectionToggle = '';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'true');

  const chevron = document.createElement('span');
  chevron.className = 'cad-lite-production-shell__section-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '▾';

  const title = document.createElement('span');
  title.className = 'cad-lite-production-shell__section-title';
  title.textContent = `${label} (0)`;
  toggle.append(chevron, title);

  const actions = document.createElement('div');
  actions.className = 'lc-navigator-section-actions';
  head.append(toggle, actions);

  const body = document.createElement('div');
  body.className =
    'cad-lite-production-shell__section-body lc-navigator-parity-body';
  body.dataset.cadLiteSectionBody = '';

  let addButton: HTMLButtonElement | null = null;
  if (addLabel && addTarget) {
    addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'lc-navigator-add-tool';
    addButton.textContent = addLabel;
    addButton.addEventListener('click', () => {
      document.querySelector<HTMLButtonElement>(addTarget)?.click();
    });
    body.append(addButton);
  }

  section.append(head, body);
  return { section, title, actions, body, addButton };
}

function annotationKey(root: HTMLElement): DynamicSectionKey | null {
  const text = root
    .querySelector('.lc-annotation-nav-header strong')
    ?.textContent?.trim()
    .toLowerCase() ?? '';
  if (text.startsWith('notes')) return 'notes';
  if (text.startsWith('dimensions')) return 'dimensions';
  if (text.startsWith('lines')) return 'lines';
  return null;
}

function countFromHeading(root: HTMLElement): number {
  const text = root.querySelector('strong')?.textContent ?? '';
  const match = text.match(/\((\d+)\)/);
  return match ? Number(match[1]) : 0;
}

function syncVisibilityAction(
  sourceHeader: HTMLElement | null,
  target: DynamicSectionTarget,
): void {
  const source = sourceHeader?.querySelector<HTMLButtonElement>('button') ?? null;
  target.actions.replaceChildren();
  if (!source) return;

  const visible = source.getAttribute('aria-pressed') !== 'false';
  source.className = 'lc-navigator-eye';
  source.textContent = visible ? '◉' : '○';
  source.title = visible ? 'Hide' : 'Show';
  source.setAttribute('aria-label', source.title);
  target.actions.append(source);
}

function distributeAnnotationSection(
  source: HTMLElement,
  target: DynamicSectionTarget,
  label: string,
): void {
  const header = directChild<HTMLElement>(source, '.lc-annotation-nav-header');
  const count = countFromHeading(source);
  target.title.textContent = `${label} (${count})`;
  syncVisibilityAction(header, target);

  const rows = Array.from(source.children).filter((child) => child !== header);
  target.body.replaceChildren(
    ...(target.addButton ? [target.addButton] : []),
    ...rows,
  );
  source.remove();
}

function distributeRoomFeatures(
  source: HTMLElement,
  target: DynamicSectionTarget,
): void {
  const header = directChild<HTMLElement>(source, '.lc-room-feature-nav-header');
  const count = countFromHeading(source);
  target.title.textContent = `Room Features (${count})`;
  syncVisibilityAction(header, target);

  const children = Array.from(source.children).filter((child) => child !== header);
  target.body.replaceChildren(...children);
  source.remove();
}

function prepareLayouts(navigator: HTMLElement): void {
  const layouts = navigator.querySelector<HTMLElement>(
    '[data-cad-lite-nav-section="layouts"]',
  );
  const body = layouts?.querySelector<HTMLElement>('[data-cad-lite-section-body]');
  const list = layouts?.querySelector<HTMLElement>('#lc-layouts');
  const add = layouts?.querySelector<HTMLButtonElement>('#lc-add-layout');
  if (!body || !list || !add) return;

  add.textContent = '+ Add Layout';
  add.classList.add('lc-add-layout-row');
  body.insertBefore(add, list);
}

function prepareAreasAndPieces(
  navigator: HTMLElement,
  document: Document,
): { section: HTMLElement; pieceMount: HTMLElement } | null {
  const areas = navigator.querySelector<HTMLElement>(
    '[data-cad-lite-nav-section="areas"]',
  );
  const pieces = navigator.querySelector<HTMLElement>(
    '[data-cad-lite-nav-section="pieces"]',
  );
  const areaBody = areas?.querySelector<HTMLElement>('[data-cad-lite-section-body]');
  const pieceMount = pieces?.querySelector<HTMLElement>('#lc-pieces');
  const addArea = areas?.querySelector<HTMLButtonElement>('#lc-add-area');
  const addPiece = pieces?.querySelector<HTMLButtonElement>('#lc-add');
  const selections = navigator.querySelector<HTMLElement>(
    '[data-cad-lite-nav-section="selections"]',
  );

  if (!areas || !pieces || !areaBody || !pieceMount) return null;

  areas.dataset.cadLiteNavSection = 'areas-pieces';
  const title = sectionTitle(areas);
  if (title) title.textContent = 'Areas & Pieces (0)';

  const controls = document.createElement('div');
  controls.className = 'lc-areas-pieces-add-row';
  if (addPiece) {
    addPiece.textContent = '+ Add Piece';
    addPiece.classList.add('lc-add-piece-primary');
    controls.append(addPiece);
  }
  if (addArea) {
    addArea.textContent = '+ Add Area';
    controls.append(addArea);
  }
  areaBody.prepend(controls);
  areaBody.append(pieceMount);

  pieces.remove();
  if (selections) navigator.insertBefore(areas, selections);

  return { section: areas, pieceMount };
}

function updateStaticCounts(
  navigator: HTMLElement,
  combined: HTMLElement,
  pieceMount: HTMLElement,
): void {
  const layouts = navigator.querySelector<HTMLElement>(
    '[data-cad-lite-nav-section="layouts"]',
  );
  const layoutsTitle = layouts ? sectionTitle(layouts) : null;
  if (layoutsTitle) {
    const count = navigator.querySelectorAll('#lc-layouts [data-layout-id]').length;
    layoutsTitle.textContent = `Layouts (${count})`;
  }

  const combinedTitle = sectionTitle(combined);
  if (combinedTitle) {
    const pieceCount = pieceMount.querySelectorAll(
      '[data-piece-id]:not(.lc-backsplash-nav-piece)',
    ).length;
    combinedTitle.textContent = `Areas & Pieces (${pieceCount})`;
  }
}

/**
 * Reassembles the typed v1.6 Navigator into the mature v1.5.99 information
 * architecture without duplicating CAD commands. ProjectLayoutSurface keeps
 * creating the live rows; this decorator moves those same DOM nodes into the
 * production sections so their existing listeners remain authoritative.
 */
export function mountProductionNavigatorParity(
  shell: HTMLElement,
  signal: AbortSignal,
): void {
  const navigator = shell.querySelector<HTMLElement>(
    '.cad-lite-production-shell__navigator',
  );
  const document = navigator?.ownerDocument;
  if (!navigator || !document) return;

  prepareLayouts(navigator);
  const prepared = prepareAreasAndPieces(navigator, document);
  if (!prepared) return;

  const selections = navigator.querySelector<HTMLElement>(
    '[data-cad-lite-nav-section="selections"]',
  );
  const targets = new Map<DynamicSectionKey, DynamicSectionTarget>();
  const definitions: Array<
    [DynamicSectionKey, string, string | null, string | null]
  > = [
    ['notes', 'Notes', '+ Add Note', '#lc-tool-note'],
    ['dimensions', 'Dimensions', '+ Add Dimension', '#lc-tool-dimension'],
    ['lines', 'Lines', '+ Add Line', '#lc-tool-line'],
    ['room-features', 'Room Features', null, null],
  ];

  definitions.forEach(([key, label, addLabel, addTarget]) => {
    const target = createSection(document, key, label, addLabel, addTarget);
    targets.set(key, target);
    if (selections) navigator.insertBefore(target.section, selections);
    else navigator.append(target.section);
  });

  const decorate = (): void => {
    const annotationRoots = Array.from(
      prepared.pieceMount.querySelectorAll<HTMLElement>(
        ':scope > .lc-annotation-nav-section:not(.lc-floor-plan-nav)',
      ),
    );
    annotationRoots.forEach((source) => {
      const key = annotationKey(source);
      if (!key) return;
      const target = targets.get(key);
      if (!target) return;
      const label =
        key === 'notes' ? 'Notes' : key === 'dimensions' ? 'Dimensions' : 'Lines';
      distributeAnnotationSection(source, target, label);
    });

    const room = directChild<HTMLElement>(
      prepared.pieceMount,
      '.lc-room-feature-nav-section',
    );
    const roomTarget = targets.get('room-features');
    if (room && roomTarget) distributeRoomFeatures(room, roomTarget);

    updateStaticCounts(navigator, prepared.section, prepared.pieceMount);
  };

  decorate();

  if (typeof MutationObserver === 'undefined') return;
  const observer = new MutationObserver(() => {
    const hasDynamicContent = Boolean(
      prepared.pieceMount.querySelector(
        ':scope > .lc-annotation-nav-section:not(.lc-floor-plan-nav), :scope > .lc-room-feature-nav-section',
      ),
    );
    if (hasDynamicContent) decorate();
    else updateStaticCounts(navigator, prepared.section, prepared.pieceMount);
  });
  observer.observe(prepared.pieceMount, { childList: true });

  signal.addEventListener('abort', () => observer.disconnect(), { once: true });
}
