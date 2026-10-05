function menuByLabel(root: ParentNode, label: string): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>('[data-cad-lite-menu]')).find(
      (menu) =>
        menu
          .querySelector<HTMLElement>('[data-cad-lite-menu-button]')
          ?.textContent?.trim()
          .toUpperCase() === label,
    ) ?? null
  );
}

function setPanelMarkup(menu: HTMLElement | null, markup: string): void {
  const panel = menu?.querySelector<HTMLElement>('[data-cad-lite-menu-panel]');
  if (!panel) return;
  panel.classList.add('lc-v159-menu-panel');
  panel.innerHTML = markup;
}

function command(
  icon: string,
  label: string,
  options: {
    id?: string;
    shortcut?: string;
    proxy?: string;
    disabled?: boolean;
    keepOpen?: boolean;
    extra?: string;
  } = {},
): string {
  const id = options.id ? ` id="${options.id}"` : '';
  const proxy = options.proxy ? ` data-cad-lite-proxy="${options.proxy}"` : '';
  const disabled = options.disabled ? ' disabled' : '';
  const keepOpen = options.keepOpen ? ' data-cad-lite-menu-keep-open' : '';
  const extra = options.extra ? ` ${options.extra}` : '';
  const shortcut = options.shortcut
    ? `<span class="lc-v159-menu-shortcut">${options.shortcut}</span>`
    : '<span class="lc-v159-menu-shortcut"></span>';
  return `<button${id}${proxy}${disabled}${keepOpen}${extra} class="lc-v159-menu-command" type="button" role="menuitem"><span class="lc-v159-menu-icon" aria-hidden="true">${icon}</span><span class="lc-v159-menu-label">${label}</span>${shortcut}</button>`;
}

function toggle(id: string, label: string): string {
  return `<button id="${id}" data-cad-lite-menu-keep-open class="lc-v159-menu-command lc-v159-toggle" type="button" role="menuitem" aria-pressed="false"><span class="lc-v159-menu-check" aria-hidden="true"></span><span class="lc-v159-menu-label">${label}</span><span class="lc-v159-menu-shortcut"></span></button>`;
}

function disabledToggle(label: string): string {
  return `<button disabled class="lc-v159-menu-command lc-v159-toggle" type="button" role="menuitem"><span class="lc-v159-menu-check" aria-hidden="true"></span><span class="lc-v159-menu-label">${label}</span><span class="lc-v159-menu-shortcut"></span></button>`;
}

function section(label: string): string {
  return `<div class="lc-v159-menu-section">${label}</div>`;
}

function separator(): string {
  return '<div class="lc-v159-menu-separator" role="separator"></div>';
}

function submenu(icon: string, label: string, contents: string): string {
  return `<div class="lc-v159-submenu-host"><div class="lc-v159-menu-command lc-v159-submenu-trigger" role="menuitem" tabindex="0"><span class="lc-v159-menu-icon" aria-hidden="true">${icon}</span><span class="lc-v159-menu-label">${label}</span><span class="lc-v159-menu-chevron" aria-hidden="true">›</span></div><div class="lc-v159-submenu-panel" role="menu">${contents}</div></div>`;
}

function numberField(
  label: string,
  id: string,
  unit: string,
  min: string,
  step: string,
  max = '',
): string {
  const maxAttribute = max ? ` max="${max}"` : '';
  return `<label class="lc-v159-number-row"><span>${label}</span><input id="${id}" type="number" min="${min}" step="${step}"${maxAttribute} /><span class="lc-v159-number-unit">${unit}</span></label>`;
}

function selectField(label: string, id: string, options: string): string {
  return `<label class="lc-v159-select-row"><span>${label}</span><select id="${id}">${options}</select></label>`;
}

function segmentedTheme(): string {
  return `<div class="lc-v159-segmented lc-v159-segmented-three" role="group" aria-label="Theme"><button data-cad-lite-theme="light" data-cad-lite-menu-keep-open type="button" aria-pressed="false"><span aria-hidden="true">☀</span><small>Light</small></button><button data-cad-lite-theme="dark" data-cad-lite-menu-keep-open type="button" aria-pressed="false"><span aria-hidden="true">☾</span><small>Dark</small></button><button data-cad-lite-theme="system" data-cad-lite-menu-keep-open type="button" aria-pressed="false"><span aria-hidden="true">▣</span><small>System</small></button></div>`;
}

function segmentedWorkspace(): string {
  return `<div class="lc-v159-segmented lc-v159-segmented-two" role="group" aria-label="Workspace"><button data-cad-lite-proxy="#lc-workspace-design" data-cad-lite-menu-keep-open type="button"><span aria-hidden="true">▤</span><small>Design</small></button><button data-cad-lite-proxy="#lc-workspace-slab" data-cad-lite-menu-keep-open type="button"><span aria-hidden="true">▱</span><small>Slab</small></button></div>`;
}

function piecesView(): string {
  return (
    section('DISPLAY') +
    toggle('lc-show-piece-fills', 'Color / Piece Fill') +
    toggle('lc-show-slab-material', 'Slab Material') +
    section('LABELS') +
    disabledToggle('Piece Labels') +
    disabledToggle('Piece Label Dims') +
    toggle('lc-show-dims', 'Piece Dims') +
    disabledToggle('Auto Contrast on Dark Slabs') +
    section('SPLASHES') +
    disabledToggle('Splash Labels') +
    disabledToggle('Splash Label Dims') +
    disabledToggle('Splash Dims') +
    section('DETAILS') +
    toggle('lc-show-sink-centerlines', 'Sink Centerlines') +
    toggle('lc-show-cutout-labels', 'Cutout Labels') +
    toggle('lc-show-seams', 'Seams') +
    disabledToggle('Radius Labels') +
    disabledToggle('Edge Legend') +
    section('EDGE LABELS') +
    '<div class="lc-v159-segmented lc-v159-segmented-three is-disabled" aria-disabled="true"><button disabled type="button"><span>◩</span><small>Off</small></button><button disabled type="button"><span>≡</span><small>Text</small></button><button disabled type="button"><span>×</span><small>Symbols</small></button></div>'
  );
}

function roomFeatureView(): string {
  return (
    section('DISPLAY') +
    toggle('lc-show-room-features', 'Show Room Features') +
    toggle('lc-show-room-feature-labels', 'Labels') +
    section('CABINETS') +
    toggle('lc-show-room-cabinets', 'Blocks') +
    disabledToggle('Labels') +
    section('FILLERS & PANELS') +
    toggle('lc-show-room-fillers-panels', 'Blocks') +
    disabledToggle('Labels') +
    section('APPLIANCES') +
    toggle('lc-show-room-appliances', 'Blocks') +
    disabledToggle('Labels') +
    section('WALLS') +
    toggle('lc-show-room-walls', 'Walls') +
    disabledToggle('Labels') +
    section('EXPORT') +
    '<div class="lc-v159-disabled-note">Export opacity will return with the remaining Room Feature view preferences.</div>'
  );
}

function annotationsView(): string {
  return (
    toggle('lc-show-manual-dims', 'Manual Dims') +
    toggle('lc-show-lines', 'Lines') +
    toggle('lc-show-notes', 'Notes')
  );
}

function canvasView(): string {
  return (
    numberField('Width', 'lc-view-canvas-width', 'in', '12', '1') +
    numberField('Height', 'lc-view-canvas-height', 'in', '12', '1') +
    numberField('Grid Size', 'lc-view-canvas-grid', 'in', '0.25', '0.25') +
    numberField('Zoom', 'lc-view-canvas-zoom', 'px/in', '1', '0.5', '24') +
    toggle('lc-show-grid', 'Grid')
  );
}

function planView(): string {
  return (
    disabledToggle('Show Plan') +
    disabledToggle('Grayscale') +
    '<div class="lc-v159-disabled-note">Plan opacity remains controlled from the Plan navigator while its View-menu binding is migrated.</div>'
  );
}

function numberFormats(): string {
  return (
    selectField(
      'Format',
      'lc-dim-format',
      '<option value="fraction">Fraction</option><option value="decimal">Decimal</option>',
    ) +
    selectField(
      'Precision',
      'lc-dim-precision',
      '<option value="1">1</option><option value="2">1/2</option><option value="4">1/4</option><option value="8">1/8</option><option value="16">1/16</option>',
    )
  );
}

function quickLayouts(): string {
  return (
    command('▤', 'Galley Kitchen', { disabled: true }) +
    separator() +
    command('⌜', 'L-Kitchen', { disabled: true }) +
    command('⊔', 'U-Kitchen', { disabled: true }) +
    command('▭', 'Kitchen Island', { disabled: true }) +
    separator() +
    command('▣', 'Single Vanity', { disabled: true }) +
    command('▣', 'Double Vanity', { disabled: true })
  );
}

function roomFeatureInsert(): string {
  return (
    command('□', 'Add Feature', { disabled: true }) +
    command('╱', 'Add Wall', { disabled: true })
  );
}

function addHelpMenu(root: ParentNode, after: HTMLElement | null): void {
  if (!after || menuByLabel(root, 'HELP')) return;
  const document = after.ownerDocument;
  const menu = document.createElement('div');
  menu.className = 'cad-lite-production-shell__menu';
  menu.setAttribute('data-cad-lite-menu', '');
  menu.innerHTML = `<button class="cad-lite-production-shell__menu-trigger" data-cad-lite-menu-button type="button" aria-haspopup="menu" aria-expanded="false">HELP</button><div class="cad-lite-production-shell__menu-panel lc-v159-menu-panel" data-cad-lite-menu-panel role="menu" hidden>${command('⌨', 'Keyboard Shortcuts…', { disabled: true })}${separator()}${command('▤', 'Start Guided Workflow', { disabled: true })}</div>`;
  after.insertAdjacentElement('afterend', menu);
}

/**
 * Restores the v1.5.99 desktop menu hierarchy around the typed v1.6 controls.
 * Existing IDs remain authoritative so browser surfaces continue to own state
 * and mutations. Controls that do not yet have a typed v1.6 owner are rendered
 * disabled instead of pretending to work.
 */
export function applyProductionMenuParity(root: ParentNode): void {
  const shell = root.querySelector<HTMLElement>('[data-cad-lite-production-shell]');
  if (!shell || shell.dataset.v159MenuParity === 'true') return;
  shell.dataset.v159MenuParity = 'true';

  const edit = menuByLabel(root, 'EDIT');
  setPanelMarkup(
    edit,
    command('↶', 'Undo', { proxy: '#lc-undo', shortcut: 'Ctrl+Z' }) +
      command('↷', 'Redo', { proxy: '#lc-redo', shortcut: 'Ctrl+Y' }) +
      separator() +
      command('⧉', 'Copy', { id: 'lc-edit-copy', shortcut: 'Ctrl+C' }) +
      command('▣', 'Paste', { id: 'lc-edit-paste', shortcut: 'Ctrl+V' }) +
      command('▢', 'Duplicate', { id: 'lc-edit-duplicate', shortcut: 'Ctrl+D' }) +
      command('⌫', 'Delete', { id: 'lc-edit-delete', shortcut: 'Del' }) +
      separator() +
      command('▧', 'Group Selected Pieces', { disabled: true, shortcut: 'Ctrl+G' }) +
      command('▧', 'Ungroup Selected Pieces', { disabled: true, shortcut: 'Ctrl+Shift+G' }) +
      separator() +
      command('⌗', 'Select All Pieces', { id: 'lc-edit-select-all', shortcut: 'Ctrl+A' }) +
      command('↖', 'Deselect', { id: 'lc-edit-deselect', shortcut: 'Esc' }) +
      separator() +
      command('↖', 'Move Selection to 0,0', { disabled: true }) +
      command('⌗', 'Snap All Pieces to Grid', { disabled: true }) +
      separator() +
      submenu('≡', 'Numbers & Formats', numberFormats()),
  );

  const view = menuByLabel(root, 'VIEW');
  setPanelMarkup(
    view,
    submenu('▣', 'Pieces', piecesView()) +
      submenu('▥', 'Room Features', roomFeatureView()) +
      submenu('◩', 'Annotations', annotationsView()) +
      submenu('▥', 'Canvas', canvasView()) +
      submenu('▣', 'Plan', planView()) +
      submenu('☾', 'Theme', segmentedTheme()) +
      submenu('▤', 'Workspace', segmentedWorkspace()),
  );

  const insert = menuByLabel(root, 'INSERT');
  setPanelMarkup(
    insert,
    command('□', 'Piece', { proxy: '#lc-add', shortcut: 'P' }) +
      submenu('▤', 'Quick Layouts', quickLayouts()) +
      submenu('□', 'Room Features', roomFeatureInsert()) +
      separator() +
      command('▱', 'Note', { id: 'lc-tool-note', shortcut: 'N' }) +
      command('↔', 'Dimension', { id: 'lc-tool-dimension', shortcut: 'D' }) +
      command('╱', 'Line', { id: 'lc-tool-line', shortcut: 'L' }) +
      separator() +
      command('↑', 'Add Slab Image', { disabled: true }) +
      command('▧', 'Choose Slab From Library', { disabled: true }) +
      '<button id="lc-add-slab" type="button" hidden aria-hidden="true"></button>',
  );

  const importMenu = menuByLabel(root, 'IMPORT');
  setPanelMarkup(
    importMenu,
    command('▧', 'Floor Plan (PDF / PNG / JPG)', { id: 'lc-import-floor-plan' }) +
      separator() +
      command('↓', 'Import Project JSON', { id: 'lc-import-project' }),
  );

  const exportMenu = menuByLabel(root, 'EXPORT');
  setPanelMarkup(
    exportMenu,
    command('□', 'PDF - Current Layout', { id: 'lc-export-pdf' }) +
      command('□', 'PDF - All Layouts', { id: 'lc-export-pdf-all' }) +
      separator() +
      command('‹›', 'Project JSON', { id: 'lc-export-project' }) +
      command('▧', 'PNG', { id: 'lc-export-png' }) +
      command('‹›', 'SVG', { id: 'lc-export-svg' }) +
      separator() +
      command('⌁', 'Copy Share Link', { disabled: true }),
  );

  addHelpMenu(root, exportMenu);
}

if (typeof document !== 'undefined') {
  applyProductionMenuParity(document);
}
