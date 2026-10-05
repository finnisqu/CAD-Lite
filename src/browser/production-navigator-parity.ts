const NAVIGATOR_SELECTOR = '.cad-lite-production-shell__navigator';
const SECTION_TITLE_CLASS = 'cad-lite-production-shell__section-title';
const SECTION_HEAD_CLASS = 'cad-lite-production-shell__section-head';
const SECTION_BODY_CLASS = 'cad-lite-production-shell__section-body';
const SECTION_TOGGLE_CLASS = 'cad-lite-production-shell__section-toggle';
const SECTION_CHEVRON_CLASS = 'cad-lite-production-shell__section-chevron';

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

export const PIECE_GROUP_ACCENTS = [
  '#5c8fbe',
  '#7b6fae',
  '#5f9d7a',
  '#c47f6a',
  '#9a8c58',
  '#4f9290',
] as const;

export type GeneratedNavigatorBlock =
  | 'notes'
  | 'dimensions'
  | 'lines'
  | 'room-features'
  | 'plan';

interface DedicatedSectionDefinition {
  key: string;
  title: string;
  mountId: string;
}

const DEDICATED_SECTIONS: readonly DedicatedSectionDefinition[] = [
  { key: 'notes', title: 'Notes (0)', mountId: 'lc-notes-nav' },
  { key: 'dimensions', title: 'Dimensions (0)', mountId: 'lc-dimensions-nav' },
  { key: 'lines', title: 'Lines (0)', mountId: 'lc-lines-nav' },
  { key: 'room-features', title: 'Room Features (0)', mountId: 'lc-room-features-nav' },
  { key: 'plan', title: 'Plan', mountId: 'lc-plan-nav' },
  { key: 'estimate', title: 'Estimate', mountId: 'lc-estimate-nav' },
];

const ADD_TOOL_PROXIES: ReadonlyArray<{
  mountId: string;
  label: string;
  target: string;
}> = [
  { mountId: 'lc-notes-nav', label: '+ Add Note', target: '#lc-tool-note' },
  { mountId: 'lc-dimensions-nav', label: '+ Add Dimension', target: '#lc-tool-dimension' },
  { mountId: 'lc-lines-nav', label: '+ Add Line', target: '#lc-tool-line' },
];

export function shouldCollapseProductionNavigator(
  expandedStates: readonly boolean[],
): boolean {
  return expandedStates.some(Boolean);
}

export function classifyGeneratedNavigatorBlock(
  className: string,
  textContent: string,
): GeneratedNavigatorBlock | null {
  const classes = ` ${className} `;
  const title = textContent.trim().toLowerCase();
  if (classes.includes(' lc-floor-plan-nav ')) return 'plan';
  if (classes.includes(' lc-room-feature-nav-section ')) return 'room-features';
  if (!classes.includes(' lc-annotation-nav-section ')) return null;
  if (title.startsWith('notes')) return 'notes';
  if (title.startsWith('dimensions')) return 'dimensions';
  if (title.startsWith('lines')) return 'lines';
  if (title.startsWith('floor plan')) return 'plan';
  return null;
}

function navigator(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(NAVIGATOR_SELECTOR);
}

function sectionByKey(nav: HTMLElement, key: string): HTMLElement | null {
  return nav.querySelector<HTMLElement>(`[data-cad-lite-nav-section="${key}"]`);
}

function setSectionTitle(section: HTMLElement, title: string): void {
  const titleNode = section.querySelector<HTMLElement>(`.${SECTION_TITLE_CLASS}`);
  if (titleNode) titleNode.textContent = title;
}

function sectionHead(section: HTMLElement): HTMLElement | null {
  return section.querySelector<HTMLElement>(`:scope > .${SECTION_HEAD_CLASS}`);
}

function sectionBody(section: HTMLElement): HTMLElement | null {
  return section.querySelector<HTMLElement>(`:scope > .${SECTION_BODY_CLASS}`);
}

function createSection(document: Document, definition: DedicatedSectionDefinition): HTMLElement {
  const section = document.createElement('section');
  section.className = 'cad-lite-production-shell__section cad-lite-production-shell__nav-section';
  section.dataset.cadLiteNavSection = definition.key;

  const head = document.createElement('div');
  head.className = SECTION_HEAD_CLASS;

  const toggle = document.createElement('button');
  toggle.className = SECTION_TOGGLE_CLASS;
  toggle.dataset.cadLiteSectionToggle = '';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'true');

  const chevron = document.createElement('span');
  chevron.className = SECTION_CHEVRON_CLASS;
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '▾';

  const title = document.createElement('span');
  title.className = SECTION_TITLE_CLASS;
  title.textContent = definition.title;
  toggle.append(chevron, title);

  const actions = document.createElement('div');
  actions.className = 'lc-v159-section-actions';
  actions.dataset.cadLiteSectionActions = definition.key;
  head.append(toggle, actions);

  const body = document.createElement('div');
  body.className = `${SECTION_BODY_CLASS} cad-lite-production-shell__dedicated-nav-body`;
  body.dataset.cadLiteSectionBody = '';

  const mount = document.createElement('div');
  mount.id = definition.mountId;
  mount.className = 'cad-lite-production-shell__dedicated-nav-mount';
  body.appendChild(mount);
  section.append(head, body);
  return section;
}

function ensureLayoutsAddRow(nav: HTMLElement): void {
  const section = sectionByKey(nav, 'layouts');
  const body = section ? sectionBody(section) : null;
  const add = nav.querySelector<HTMLButtonElement>('#lc-add-layout');
  const list = nav.querySelector<HTMLElement>('#lc-layouts');
  if (!section || !body || !add || !list) return;

  let row = body.querySelector<HTMLElement>('.lc-v159-add-layout-row');
  if (!row) {
    row = body.ownerDocument.createElement('div');
    row.className = 'lc-v159-add-layout-row';
  }
  add.textContent = '+ Add Layout';
  add.classList.add('lc-v159-add-layout');
  row.appendChild(add);
  if (body.firstChild !== row) body.prepend(row);
  if (list.parentElement !== body) body.appendChild(list);
}

function ensureAreasAndPiecesSection(nav: HTMLElement): void {
  const areas = sectionByKey(nav, 'areas') ?? sectionByKey(nav, 'areas-pieces');
  const pieces = sectionByKey(nav, 'pieces');
  if (!areas) return;

  areas.dataset.cadLiteNavSection = 'areas-pieces';
  setSectionTitle(areas, 'Areas & Pieces');

  const body = sectionBody(areas);
  const areaList = nav.querySelector<HTMLElement>('#lc-list');
  const pieceList = nav.querySelector<HTMLElement>('#lc-pieces');
  const addArea = nav.querySelector<HTMLButtonElement>('#lc-add-area');
  const addPiece = nav.querySelector<HTMLButtonElement>('#lc-add');
  if (!body || !areaList || !pieceList || !addArea || !addPiece) return;

  body.classList.add('cad-lite-production-shell__areas-pieces-body');
  let addRow = body.querySelector<HTMLElement>('.lc-v159-area-piece-add-row');
  if (!addRow) {
    addRow = body.ownerDocument.createElement('div');
    addRow.className = 'lc-v159-area-piece-add-row';
  }
  addPiece.textContent = '+ Add Piece';
  addPiece.classList.add('lc-v159-add-piece');
  addArea.textContent = '+ Add Area';
  addArea.classList.add('lc-v159-add-area');
  addRow.append(addPiece, addArea);

  body.replaceChildren(addRow, areaList, pieceList);
  pieces?.remove();
}

function ensureDedicatedSections(nav: HTMLElement): void {
  const document = nav.ownerDocument;
  const selections = sectionByKey(nav, 'selections');
  DEDICATED_SECTIONS.forEach((definition) => {
    if (sectionByKey(nav, definition.key)) return;
    const section = createSection(document, definition);
    if (definition.key === 'estimate') {
      selections?.insertAdjacentElement('afterend', section);
    } else {
      selections?.insertAdjacentElement('beforebegin', section);
    }
  });
}

function ensureAddToolProxies(nav: HTMLElement): void {
  ADD_TOOL_PROXIES.forEach(({ mountId, label, target }) => {
    const mount = nav.querySelector<HTMLElement>(`#${mountId}`);
    if (!mount) return;
    let button = mount.querySelector<HTMLButtonElement>(':scope > .lc-v159-add-entity');
    if (!button) {
      button = mount.ownerDocument.createElement('button');
      button.type = 'button';
      button.className = 'lc-v159-add-entity';
      button.addEventListener('click', () => {
        mount.ownerDocument.querySelector<HTMLButtonElement>(target)?.click();
      });
      mount.prepend(button);
    }
    button.textContent = label;
  });
}

function reorderSections(nav: HTMLElement): void {
  PRODUCTION_NAVIGATOR_SECTION_ORDER.forEach((key) => {
    const section = sectionByKey(nav, key);
    if (section) nav.appendChild(section);
  });
}

function countGeneratedTitle(block: HTMLElement): string {
  return block.querySelector('strong')?.textContent?.trim() ?? '';
}

function masterVisibilityButton(block: HTMLElement, key: GeneratedNavigatorBlock): HTMLButtonElement | null {
  if (key === 'plan') {
    return Array.from(block.querySelectorAll<HTMLButtonElement>('.lc-floor-plan-nav-actions button')).find(
      (button) => button.textContent?.trim() === 'Hide' || button.textContent?.trim() === 'Show',
    ) ?? null;
  }
  return block.querySelector<HTMLButtonElement>('.lc-annotation-nav-header button, .lc-room-feature-nav-header button');
}

function installHeaderVisibility(nav: HTMLElement, key: GeneratedNavigatorBlock, block: HTMLElement): void {
  const section = sectionByKey(nav, key);
  const head = section ? sectionHead(section) : null;
  const actions = head?.querySelector<HTMLElement>('[data-cad-lite-section-actions]');
  const control = masterVisibilityButton(block, key);
  if (!section || !actions || !control) return;

  const sourceText = control.textContent?.trim() ?? '';
  const visible = sourceText === 'Hide' || control.getAttribute('aria-pressed') === 'true';
  const label = key === 'room-features'
    ? 'Room Features'
    : key === 'dimensions'
      ? 'Dimensions'
      : key.charAt(0).toUpperCase() + key.slice(1);
  control.className = 'lc-v159-section-eye';
  control.textContent = visible ? '◉' : '○';
  control.title = `${visible ? 'Hide' : 'Show'} ${label}`;
  control.setAttribute('aria-label', control.title);
  control.setAttribute('aria-pressed', String(visible));
  actions.replaceChildren(control);
}

function syncGeneratedNavigatorBlocks(nav: HTMLElement): void {
  const piecesMount = nav.querySelector<HTMLElement>('#lc-pieces');
  const generated = piecesMount
    ? Array.from(piecesMount.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
    : [];

  generated.forEach((block) => {
    const key = classifyGeneratedNavigatorBlock(block.className, block.textContent ?? '');
    if (!key) return;
    const destination = nav.querySelector<HTMLElement>(
      key === 'notes' ? '#lc-notes-nav' :
        key === 'dimensions' ? '#lc-dimensions-nav' :
          key === 'lines' ? '#lc-lines-nav' :
            key === 'room-features' ? '#lc-room-features-nav' : '#lc-plan-nav',
    );
    if (destination && block.parentElement !== destination) destination.appendChild(block);
  });

  const configs: ReadonlyArray<[GeneratedNavigatorBlock, string]> = [
    ['notes', '#lc-notes-nav .lc-annotation-nav-section'],
    ['dimensions', '#lc-dimensions-nav .lc-annotation-nav-section'],
    ['lines', '#lc-lines-nav .lc-annotation-nav-section'],
    ['room-features', '#lc-room-features-nav .lc-room-feature-nav-section'],
    ['plan', '#lc-plan-nav .lc-floor-plan-nav'],
  ];

  configs.forEach(([key, selector]) => {
    const block = nav.querySelector<HTMLElement>(selector);
    if (!block) return;
    const generatedTitle = countGeneratedTitle(block);
    if (key !== 'plan' && generatedTitle) {
      const section = sectionByKey(nav, key);
      if (section) setSectionTitle(section, generatedTitle);
    }
    installHeaderVisibility(nav, key, block);
  });
}

function setAccent(element: HTMLElement, accent: string): void {
  element.style.setProperty('--piece-group-accent', accent);
}

function selectPieceForAction(nav: HTMLElement, pieceId: string): void {
  nav.querySelector<HTMLButtonElement>(`#lc-pieces button[data-piece-id="${pieceId}"]`)?.click();
}

function selectGroupForAction(nav: HTMLElement, groupId: string): void {
  const header = nav.querySelector<HTMLButtonElement>(`#lc-pieces button[data-piece-group-header="${groupId}"]`);
  if (!header) return;
  const wasExpanded = header.getAttribute('aria-expanded');
  header.click();
  const replacement = nav.querySelector<HTMLButtonElement>(`#lc-pieces button[data-piece-group-header="${groupId}"]`);
  if (replacement && replacement.getAttribute('aria-expanded') !== wasExpanded) replacement.click();
}

function inspectorButton(nav: HTMLElement, labels: readonly string[]): HTMLButtonElement | null {
  const inspector = nav.ownerDocument.querySelector<HTMLElement>('#lc-inspector');
  return Array.from(inspector?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) =>
    labels.includes(button.textContent?.trim() ?? ''),
  ) ?? null;
}

function decoratePieceRows(nav: HTMLElement): void {
  const mount = nav.querySelector<HTMLElement>('#lc-pieces');
  if (!mount) return;

  const groupHeaders = Array.from(mount.querySelectorAll<HTMLButtonElement>(':scope > button[data-piece-group-header]'));
  groupHeaders.forEach((header, index) => {
    if (header.parentElement?.classList.contains('lc-v159-group-row')) return;
    const groupId = header.dataset.pieceGroupHeader;
    if (!groupId) return;
    const accent =
      PIECE_GROUP_ACCENTS[index % PIECE_GROUP_ACCENTS.length] ??
      PIECE_GROUP_ACCENTS[0];
    setAccent(header, accent);

    const wrapper = mount.ownerDocument.createElement('div');
    wrapper.className = 'lc-v159-group-row';
    setAccent(wrapper, accent);
    mount.insertBefore(wrapper, header);
    wrapper.appendChild(header);

    const actions = mount.ownerDocument.createElement('div');
    actions.className = 'lc-v159-entity-actions';
    const rename = mount.ownerDocument.createElement('button');
    rename.type = 'button';
    rename.className = 'lc-v159-row-action';
    rename.textContent = '✎';
    rename.title = 'Rename group';
    rename.setAttribute('aria-label', rename.title);
    rename.addEventListener('click', () => {
      selectGroupForAction(nav, groupId);
      queueMicrotask(() => {
        const input = nav.ownerDocument.querySelector<HTMLInputElement>('#lc-inspector .lc-piece-group-name-field input');
        input?.focus();
        input?.select();
      });
    });
    const remove = mount.ownerDocument.createElement('button');
    remove.type = 'button';
    remove.className = 'lc-v159-row-action is-danger';
    remove.textContent = '×';
    remove.title = 'Delete group';
    remove.setAttribute('aria-label', remove.title);
    remove.addEventListener('click', () => {
      selectGroupForAction(nav, groupId);
      queueMicrotask(() => inspectorButton(nav, ['Delete Group', 'Delete Assembly'])?.click());
    });
    actions.append(rename, remove);
    wrapper.appendChild(actions);
  });

  let activeAccent: string | null = null;
  Array.from(mount.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    const groupHeader = child.matches('.lc-v159-group-row')
      ? child.querySelector<HTMLElement>('[data-piece-group-header]')
      : child.matches('[data-piece-group-header]') ? child : null;
    if (groupHeader) {
      activeAccent = groupHeader.style.getPropertyValue('--piece-group-accent') ||
        child.style.getPropertyValue('--piece-group-accent') || null;
      return;
    }
    const pieceButton = child.matches('button[data-piece-id]')
      ? child as HTMLButtonElement
      : null;
    if (!pieceButton) return;
    const grouped = pieceButton.classList.contains('lc-piece-grouped');
    if (!grouped) activeAccent = null;
    if (activeAccent && grouped) setAccent(pieceButton, activeAccent);
  });

  const pieces = Array.from(mount.querySelectorAll<HTMLButtonElement>(':scope > button[data-piece-id]'));
  pieces.forEach((piece) => {
    const pieceId = piece.dataset.pieceId;
    if (!pieceId) return;
    const wrapper = mount.ownerDocument.createElement('div');
    wrapper.className = 'lc-v159-piece-row';
    if (piece.classList.contains('lc-piece-grouped')) wrapper.classList.add('is-grouped');
    if (piece.classList.contains('lc-backsplash-nav-piece')) wrapper.classList.add('is-splash');
    const accent = piece.style.getPropertyValue('--piece-group-accent');
    if (accent) setAccent(wrapper, accent);
    mount.insertBefore(wrapper, piece);
    wrapper.appendChild(piece);

    const actions = mount.ownerDocument.createElement('div');
    actions.className = 'lc-v159-entity-actions';
    const rename = mount.ownerDocument.createElement('button');
    rename.type = 'button';
    rename.className = 'lc-v159-row-action';
    rename.textContent = '✎';
    rename.title = 'Rename piece';
    rename.setAttribute('aria-label', rename.title);
    rename.addEventListener('click', () => {
      selectPieceForAction(nav, pieceId);
      queueMicrotask(() => {
        const input = nav.ownerDocument.querySelector<HTMLInputElement>('#lc-inspector label input');
        input?.focus();
        input?.select();
      });
    });
    const remove = mount.ownerDocument.createElement('button');
    remove.type = 'button';
    remove.className = 'lc-v159-row-action is-danger';
    remove.textContent = '×';
    remove.title = 'Delete piece';
    remove.setAttribute('aria-label', remove.title);
    remove.addEventListener('click', () => {
      selectPieceForAction(nav, pieceId);
      queueMicrotask(() => inspectorButton(nav, ['Delete'])?.click());
    });
    actions.append(rename, remove);
    wrapper.appendChild(actions);
  });
}

function syncSectionCounts(nav: HTMLElement): void {
  const layouts = sectionByKey(nav, 'layouts');
  if (layouts) setSectionTitle(layouts, `Layouts (${nav.querySelectorAll('#lc-layouts [data-layout-id]').length})`);
  const areasPieces = sectionByKey(nav, 'areas-pieces');
  if (areasPieces) setSectionTitle(areasPieces, `Areas & Pieces (${nav.querySelectorAll('#lc-pieces [data-piece-id]').length})`);
}

function syncNavigator(nav: HTMLElement, observer?: MutationObserver): void {
  observer?.disconnect();
  try {
    ensureLayoutsAddRow(nav);
    ensureAreasAndPiecesSection(nav);
    ensureDedicatedSections(nav);
    ensureAddToolProxies(nav);
    reorderSections(nav);
    syncGeneratedNavigatorBlocks(nav);
    decoratePieceRows(nav);
    syncSectionCounts(nav);
  } finally {
    observer?.observe(nav, { childList: true, subtree: true });
  }
}

function installGeneratedSectionRelocator(nav: HTMLElement): MutationObserver | null {
  if (typeof MutationObserver === 'undefined') return null;
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      syncNavigator(nav, observer);
    });
  });
  observer.observe(nav, { childList: true, subtree: true });
  return observer;
}

function installCollapseAll(nav: HTMLElement): void {
  const title = nav.querySelector<HTMLElement>(`:scope > .cad-lite-production-shell__panel-title`);
  if (!title || title.dataset.cadLiteCollapseAll === '1') return;
  title.dataset.cadLiteCollapseAll = '1';
  title.classList.add('cad-lite-production-shell__navigator-collapse-all');
  title.tabIndex = 0;
  title.setAttribute('role', 'button');
  title.setAttribute('aria-label', 'Collapse or expand all Navigator sections');

  const icon = nav.ownerDocument.createElement('span');
  icon.className = 'cad-lite-production-shell__navigator-collapse-all-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⇅';
  title.appendChild(icon);

  const toggles = (): HTMLButtonElement[] =>
    Array.from(nav.querySelectorAll<HTMLButtonElement>('[data-cad-lite-section-toggle]'));
  const syncHeader = (): void => {
    const states = toggles().map((toggle) => toggle.getAttribute('aria-expanded') === 'true');
    const collapse = shouldCollapseProductionNavigator(states);
    title.classList.toggle('is-collapsed-all', !collapse);
    title.setAttribute('aria-expanded', String(collapse));
  };
  const toggleAll = (): void => {
    const controls = toggles();
    const collapse = shouldCollapseProductionNavigator(
      controls.map((toggle) => toggle.getAttribute('aria-expanded') === 'true'),
    );
    controls.forEach((toggle) => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      if (expanded === collapse) toggle.click();
    });
    queueMicrotask(syncHeader);
  };
  title.addEventListener('click', (event) => {
    if ((event.target as Element | null)?.closest('[data-cad-lite-rail-resize]')) return;
    toggleAll();
  });
  title.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleAll();
  });
  nav.addEventListener('click', (event) => {
    if ((event.target as Element | null)?.closest('[data-cad-lite-section-toggle]')) queueMicrotask(syncHeader);
  });
  syncHeader();
}

export function applyProductionNavigatorParity(root: ParentNode = document): void {
  const nav = navigator(root);
  if (!nav || nav.dataset.cadLiteNavigatorParity === '1') return;
  nav.dataset.cadLiteNavigatorParity = '1';
  ensureLayoutsAddRow(nav);
  ensureAreasAndPiecesSection(nav);
  ensureDedicatedSections(nav);
  ensureAddToolProxies(nav);
  reorderSections(nav);
  installCollapseAll(nav);
  const observer = installGeneratedSectionRelocator(nav);
  syncNavigator(nav, observer ?? undefined);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyProductionNavigatorParity(document), { once: true });
  } else {
    applyProductionNavigatorParity(document);
  }
}
