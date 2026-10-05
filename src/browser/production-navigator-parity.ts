const NAVIGATOR_SELECTOR = '.cad-lite-production-shell__navigator';
const NAVIGATOR_TITLE_CLASS = 'cad-lite-production-shell__panel-title';
const NAVIGATOR_TOGGLE_SELECTOR = '[data-cad-lite-section-toggle]';

type DedicatedNavigatorKey =
  | 'notes'
  | 'dimensions'
  | 'lines'
  | 'room-features'
  | 'plan';

interface DedicatedSectionDefinition {
  key: DedicatedNavigatorKey | 'estimate';
  title: string;
  mountId: string;
}

const DEDICATED_SECTIONS: readonly DedicatedSectionDefinition[] = [
  { key: 'notes', title: 'Notes', mountId: 'lc-notes-nav' },
  { key: 'dimensions', title: 'Dimensions', mountId: 'lc-dimensions-nav' },
  { key: 'lines', title: 'Lines', mountId: 'lc-lines-nav' },
  {
    key: 'room-features',
    title: 'Room Features',
    mountId: 'lc-room-features-nav',
  },
  { key: 'plan', title: 'Plan', mountId: 'lc-plan-nav' },
  { key: 'estimate', title: 'Estimate', mountId: 'lc-estimate-nav' },
] as const;

export const PRODUCTION_NAVIGATOR_SECTION_ORDER = [
  'project',
  'layouts',
  'areas-pieces',
  'notes',
  'dimensions',
  'lines',
  'room-features',
  'plan',
  'selections',
  'estimate',
  'slabs',
] as const;

function navigatorToggles(navigator: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    navigator.querySelectorAll<HTMLButtonElement>(NAVIGATOR_TOGGLE_SELECTOR),
  );
}

function navigatorSections(navigator: HTMLElement): HTMLElement[] {
  return Array.from(navigator.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.hasAttribute('data-cad-lite-nav-section'),
  );
}

function sectionByKey(
  navigator: HTMLElement,
  key: string,
): HTMLElement | null {
  return (
    navigatorSections(navigator).find(
      (section) => section.dataset.cadLiteNavSection === key,
    ) ?? null
  );
}

function sectionTitle(section: HTMLElement): HTMLElement | null {
  return section.querySelector<HTMLElement>(
    ':scope > .cad-lite-production-shell__section-head .cad-lite-production-shell__section-title',
  );
}

function setSectionTitle(section: HTMLElement, title: string): void {
  const target = sectionTitle(section);
  if (target) target.textContent = title;
}

function createDisclosureSection(
  document: Document,
  definition: DedicatedSectionDefinition,
): HTMLElement {
  const section = document.createElement('section');
  section.className =
    'cad-lite-production-shell__section cad-lite-production-shell__nav-section cad-lite-production-shell__dedicated-nav-section';
  section.dataset.cadLiteNavSection = definition.key;
  section.dataset.cadLiteV159Section = definition.key;

  const head = document.createElement('div');
  head.className = 'cad-lite-production-shell__section-head';

  const toggle = document.createElement('button');
  toggle.className = 'cad-lite-production-shell__section-toggle';
  toggle.type = 'button';
  toggle.setAttribute('data-cad-lite-section-toggle', '');
  toggle.setAttribute('aria-expanded', 'true');

  const chevron = document.createElement('span');
  chevron.className = 'cad-lite-production-shell__section-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '▾';

  const title = document.createElement('span');
  title.className = 'cad-lite-production-shell__section-title';
  title.textContent = definition.title;
  toggle.append(chevron, title);

  const actions = document.createElement('div');
  actions.className = 'cad-lite-production-shell__section-actions';
  actions.dataset.cadLiteNavigatorActions = definition.key;
  head.append(toggle, actions);

  const body = document.createElement('div');
  body.className =
    'cad-lite-production-shell__section-body cad-lite-production-shell__dedicated-nav-body';
  body.setAttribute('data-cad-lite-section-body', '');

  const mount = document.createElement('div');
  mount.id = definition.mountId;
  mount.className = 'cad-lite-production-shell__dedicated-nav-mount';
  body.appendChild(mount);

  section.append(head, body);
  return section;
}

function ensureDedicatedSections(navigator: HTMLElement): void {
  const document = navigator.ownerDocument;
  for (const definition of DEDICATED_SECTIONS) {
    if (sectionByKey(navigator, definition.key)) continue;
    navigator.appendChild(createDisclosureSection(document, definition));
  }
}

function ensureAreasAndPiecesSection(navigator: HTMLElement): void {
  const areas =
    sectionByKey(navigator, 'areas-pieces') ?? sectionByKey(navigator, 'areas');
  const pieces = sectionByKey(navigator, 'pieces');
  if (!areas) return;

  areas.dataset.cadLiteNavSection = 'areas-pieces';
  areas.dataset.cadLiteV159Section = 'areas-pieces';
  setSectionTitle(areas, 'Areas & Pieces');

  const body = areas.querySelector<HTMLElement>(
    ':scope > [data-cad-lite-section-body]',
  );
  const head = areas.querySelector<HTMLElement>(
    ':scope > .cad-lite-production-shell__section-head',
  );
  const areaMount = navigator.querySelector<HTMLElement>('#lc-list');
  const pieceMount = navigator.querySelector<HTMLElement>('#lc-pieces');
  const addPiece = navigator.querySelector<HTMLButtonElement>('#lc-add');

  if (body) {
    body.classList.add('cad-lite-production-shell__areas-pieces-body');

    if (areaMount && !body.querySelector('[data-cad-lite-v159-area-zone]')) {
      const zone = body.ownerDocument.createElement('div');
      zone.className = 'cad-lite-production-shell__entity-zone';
      zone.dataset.cadLiteV159AreaZone = 'true';
      const label = body.ownerDocument.createElement('div');
      label.className = 'cad-lite-production-shell__entity-zone-label';
      label.textContent = 'Areas';
      areaMount.before(zone);
      zone.append(label, areaMount);
    }

    if (pieceMount && !body.querySelector('[data-cad-lite-v159-piece-zone]')) {
      const zone = body.ownerDocument.createElement('div');
      zone.className = 'cad-lite-production-shell__entity-zone';
      zone.dataset.cadLiteV159PieceZone = 'true';
      const label = body.ownerDocument.createElement('div');
      label.className = 'cad-lite-production-shell__entity-zone-label';
      label.textContent = 'Pieces';
      zone.append(label, pieceMount);
      body.appendChild(zone);
    }
  }

  if (head && addPiece && addPiece.parentElement !== head) {
    addPiece.textContent = '+ Piece';
    head.appendChild(addPiece);
  }

  if (pieces && pieces !== areas) pieces.remove();
}

function reorderNavigatorSections(navigator: HTMLElement): void {
  const byKey = new Map(
    navigatorSections(navigator).map((section) => [
      section.dataset.cadLiteNavSection ?? '',
      section,
    ]),
  );

  PRODUCTION_NAVIGATOR_SECTION_ORDER.forEach((key) => {
    const section = byKey.get(key);
    if (section) navigator.appendChild(section);
  });
}

export function classifyGeneratedNavigatorBlock(
  className: string,
  titleText: string,
): DedicatedNavigatorKey | null {
  if (className.includes('lc-floor-plan-nav')) return 'plan';
  if (className.includes('lc-room-feature-nav-section')) return 'room-features';
  if (!className.includes('lc-annotation-nav-section')) return null;

  const title = titleText.trim().toLowerCase();
  if (title.startsWith('notes')) return 'notes';
  if (title.startsWith('dimensions')) return 'dimensions';
  if (title.startsWith('lines')) return 'lines';
  if (title.startsWith('floor plan')) return 'plan';
  return null;
}

function dedicatedDefinition(
  key: DedicatedNavigatorKey,
): DedicatedSectionDefinition | undefined {
  return DEDICATED_SECTIONS.find(
    (definition): definition is DedicatedSectionDefinition => definition.key === key,
  );
}

function syncGeneratedNavigatorBlocks(navigator: HTMLElement): void {
  const pieceMount = navigator.querySelector<HTMLElement>('#lc-pieces');
  if (!pieceMount) return;

  const seen = new Set<DedicatedNavigatorKey>();
  const children = Array.from(pieceMount.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );

  children.forEach((child) => {
    const nestedTitle =
      child.querySelector<HTMLElement>(
        '.lc-annotation-nav-header strong, .lc-room-feature-nav-header strong',
      )?.textContent ?? '';
    const key = classifyGeneratedNavigatorBlock(child.className, nestedTitle);
    if (!key || key === 'plan') return;

    const definition = dedicatedDefinition(key);
    const section = sectionByKey(navigator, key);
    const destination = definition
      ? navigator.querySelector<HTMLElement>(`#${definition.mountId}`)
      : null;
    if (!section || !destination) return;

    destination.replaceChildren(child);
    if (nestedTitle) setSectionTitle(section, nestedTitle);
    seen.add(key);
  });

  (['notes', 'dimensions', 'lines', 'room-features'] as const).forEach((key) => {
    if (seen.has(key)) return;
    const definition = dedicatedDefinition(key);
    const destination = definition
      ? navigator.querySelector<HTMLElement>(`#${definition.mountId}`)
      : null;
    destination?.replaceChildren();
  });
}

function installGeneratedSectionRelocator(navigator: HTMLElement): void {
  if (navigator.dataset.v159NavigatorRelocator === 'true') return;
  const pieceMount = navigator.querySelector<HTMLElement>('#lc-pieces');
  if (!pieceMount || typeof MutationObserver === 'undefined') return;

  navigator.dataset.v159NavigatorRelocator = 'true';
  let relocating = false;
  const observer = new MutationObserver(() => {
    if (relocating) return;
    observer.disconnect();
    relocating = true;
    try {
      syncGeneratedNavigatorBlocks(navigator);
    } finally {
      relocating = false;
      observer.observe(pieceMount, { childList: true });
    }
  });

  observer.observe(pieceMount, { childList: true });
  queueMicrotask(() => syncGeneratedNavigatorBlocks(navigator));
}

function ensureNavigatorStructure(navigator: HTMLElement): void {
  ensureAreasAndPiecesSection(navigator);
  ensureDedicatedSections(navigator);
  reorderNavigatorSections(navigator);
  installGeneratedSectionRelocator(navigator);
}

export function shouldCollapseProductionNavigator(
  expandedStates: readonly boolean[],
): boolean {
  return expandedStates.some(Boolean);
}

/**
 * Restores the v1.5.99 Navigator hierarchy and title behavior without taking
 * ownership of durable CAD state. ProjectLayoutSurface and the feature-specific
 * browser surfaces still own their content; this adapter only supplies the
 * legacy section structure and routes their rendered blocks into it.
 */
export function applyProductionNavigatorParity(root: ParentNode): void {
  const navigator = root.querySelector<HTMLElement>(NAVIGATOR_SELECTOR);
  if (!navigator || navigator.dataset.v159NavigatorParity === 'true') return;

  ensureNavigatorStructure(navigator);

  const title = Array.from(navigator.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.classList.contains(NAVIGATOR_TITLE_CLASS),
  );
  if (!title) return;

  navigator.dataset.v159NavigatorParity = 'true';
  title.classList.add('cad-lite-production-shell__navigator-collapse-all');
  title.setAttribute('role', 'button');
  title.tabIndex = 0;

  const icon = title.ownerDocument.createElement('span');
  icon.className = 'cad-lite-production-shell__navigator-collapse-all-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '▾';
  title.appendChild(icon);

  const syncHeader = (): void => {
    const toggles = navigatorToggles(navigator);
    const expandedStates = toggles.map(
      (toggle) => toggle.getAttribute('aria-expanded') === 'true',
    );
    const collapseNext = shouldCollapseProductionNavigator(expandedStates);
    const allCollapsed = toggles.length > 0 && !collapseNext;

    title.classList.toggle('is-collapsed-all', allCollapsed);
    title.setAttribute('aria-expanded', String(!allCollapsed));
    title.setAttribute(
      'aria-label',
      collapseNext
        ? 'Collapse all Navigator sections'
        : 'Expand all Navigator sections',
    );
    title.title = collapseNext
      ? 'Collapse all Navigator sections'
      : 'Expand all Navigator sections';
  };

  const toggleAll = (): void => {
    const toggles = navigatorToggles(navigator);
    const expandedStates = toggles.map(
      (toggle) => toggle.getAttribute('aria-expanded') === 'true',
    );
    const collapse = shouldCollapseProductionNavigator(expandedStates);

    toggles.forEach((toggle, index) => {
      const expanded = expandedStates[index] ?? false;
      if ((collapse && expanded) || (!collapse && !expanded)) toggle.click();
    });
    queueMicrotask(syncHeader);
  };

  title.addEventListener('click', toggleAll);
  title.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleAll();
  });

  navigatorToggles(navigator).forEach((toggle) => {
    toggle.addEventListener('click', () => queueMicrotask(syncHeader));
  });

  syncHeader();
}

if (typeof document !== 'undefined') {
  applyProductionNavigatorParity(document);
}
