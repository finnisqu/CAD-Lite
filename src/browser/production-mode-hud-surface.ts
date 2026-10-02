import {
  addRoomFeature,
  getToolDefinition,
  type AppStore,
  type CommandDispatcher,
  type ToolController,
  type ToolId,
} from '../app';
import { createRoomFeature } from '../domain/room-features';
import type { BrowserEntityIdFactory } from './project-layout-surface';

export interface ProductionModeHudSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  tools: ToolController;
  createId: BrowserEntityIdFactory;
}

export interface ProductionModeHudDescriptor {
  toolId: ToolId;
  title: string;
  help: string;
  shortcut: string | null;
  kind: 'annotation' | 'room-parent' | 'room-wall' | 'linked-wall';
}

export interface RoomFeaturePreset {
  value: string;
  label: string;
  code: string;
  length: number;
  depth: number;
  receivesCountertop: boolean;
}

export const ROOM_FEATURE_PRESETS: readonly RoomFeaturePreset[] = [
  { value: 'base', label: 'Standard Base', code: 'B', length: 36, depth: 24, receivesCountertop: true },
  { value: 'sinkBase', label: 'Sink Base', code: 'SB', length: 36, depth: 24, receivesCountertop: true },
  { value: 'vanityBase', label: 'Vanity Base', code: 'VB', length: 30, depth: 21, receivesCountertop: true },
  { value: 'vanitySink', label: 'Vanity Sink Base', code: 'VSB', length: 30, depth: 21, receivesCountertop: true },
  { value: 'customBase', label: 'Custom Depth Base', code: 'B', length: 36, depth: 18, receivesCountertop: true },
  { value: 'filler', label: 'Filler', code: 'F', length: 3, depth: 24, receivesCountertop: true },
  { value: 'panel', label: 'End Panel', code: 'EP', length: 0.75, depth: 24, receivesCountertop: true },
  { value: 'dwEndPanel', label: 'Dishwasher End Panel', code: 'DWEP', length: 3.5, depth: 24, receivesCountertop: true },
  { value: 'dishwasher', label: 'Dishwasher', code: 'DW', length: 24, depth: 24, receivesCountertop: true },
  { value: 'undercounterFridge', label: 'Undercounter Fridge', code: 'UCR', length: 24, depth: 24, receivesCountertop: true },
  { value: 'cooktop', label: 'Cooktop', code: 'CT', length: 30, depth: 24, receivesCountertop: true },
  { value: 'range', label: 'Range', code: 'RANGE', length: 30, depth: 25, receivesCountertop: false },
  { value: 'refrigerator', label: 'Refrigerator', code: 'FRIDGE', length: 36, depth: 30, receivesCountertop: false },
] as const;

const GENERIC_HUD_TOOLS = new Set<ToolId>([
  'dimension',
  'note',
  'line',
  'roomFeatures',
  'roomWall',
  'linkedWall',
]);

const ROOM_WALL_THICKNESS_KEY = 'litecad:roomWallThickness';
const ROOM_WALL_TYPE_KEY = 'litecad:roomWallType';

function roomNumberCode(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const element = target as HTMLElement;
  const tag = element.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    element.isContentEditable
  );
}

export function productionRoomFeatureModalHost(
  document: Pick<Document, 'fullscreenElement'>,
  modalRoot: HTMLElement,
): Element {
  return document.fullscreenElement ?? modalRoot;
}

export function shouldBlockProductionRoomModalKey(
  key: string,
  editableTarget: boolean,
): boolean {
  return key !== 'Escape' && !editableTarget;
}

export function defaultRoomFeatureLabel(
  preset: RoomFeaturePreset,
  length: number,
): string {
  return preset.code + roomNumberCode(length);
}

export function productionModeHudDescriptor(
  toolId: ToolId,
): ProductionModeHudDescriptor | null {
  const definition = getToolDefinition(toolId);
  switch (toolId) {
    case 'dimension':
      return { toolId, title: definition.title, help: 'Click two points to place a dimension', shortcut: 'D', kind: 'annotation' };
    case 'note':
      return { toolId, title: definition.title, help: 'Click canvas to place a note', shortcut: 'N', kind: 'annotation' };
    case 'line':
      return { toolId, title: definition.title, help: 'Click two points to place a line', shortcut: 'L', kind: 'annotation' };
    case 'roomFeatures':
      return { toolId, title: definition.title, help: 'Add room features or choose a wall tool', shortcut: 'Q', kind: 'room-parent' };
    case 'roomWall':
      return { toolId, title: definition.title, help: 'Drag to draw a wall · Shift constrains the angle', shortcut: null, kind: 'room-wall' };
    case 'linkedWall':
      return { toolId, title: definition.title, help: 'Draw a linked wall · Shift constrains the angle', shortcut: 'W', kind: 'linked-wall' };
    default:
      return null;
  }
}

function button(
  document: Document,
  text: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.className = className;
  control.textContent = text;
  control.addEventListener('click', onClick);
  return control;
}

function numberValue(value: string, fallback: number, min: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
}

export class ProductionModeHudSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly tools: ToolController;
  private readonly createId: BrowserEntityIdFactory;
  private hudRoot: HTMLElement | null = null;
  private modalRoot: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private abort: AbortController | null = null;
  private modalOverlay: HTMLElement | null = null;
  private modalCleanup: (() => void) | null = null;
  private scheduled = false;
  private rendering = false;

  constructor(options: ProductionModeHudSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
    this.tools = options.tools;
    this.createId = options.createId;
  }

  mount(): void {
    if (this.unsubscribe || this.abort) return;
    if (!this.root.querySelector('[data-cad-lite-production-shell]')) return;
    this.hudRoot = this.root.querySelector<HTMLElement>('#lc-hud-root');
    this.modalRoot = this.root.querySelector<HTMLElement>('#lc-modal-root');
    if (!this.hudRoot || !this.modalRoot) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    const launch = (selector: string, toolId: 'dimension' | 'note' | 'line'): void => {
      this.root.querySelector<HTMLButtonElement>(selector)?.addEventListener(
        'click',
        () => this.tools.activateLocked(toolId),
        { signal },
      );
    };
    launch('#lc-tool-dimension', 'dimension');
    launch('#lc-tool-note', 'note');
    launch('#lc-tool-line', 'line');

    this.unsubscribe = this.store.subscribe(() => this.scheduleRender());
    this.render();
  }

  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.abort?.abort();
    this.abort = null;
    this.closeRoomFeatureDialog();
    this.hudRoot?.querySelector('[data-production-mode-hud]')?.remove();
    this.hudRoot = null;
    this.modalRoot = null;
    this.scheduled = false;
    this.rendering = false;
  }

  private scheduleRender(): void {
    if (this.scheduled || this.rendering) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.render();
    });
  }

  private render(): void {
    if (this.rendering) return;
    this.rendering = true;
    try {
      this.renderHud();
    } finally {
      this.rendering = false;
    }
  }

  private renderHud(): void {
    const mount = this.hudRoot;
    if (!mount) return;
    const state = this.store.getState();
    const active = state.session.interaction.activeTool;
    const existing = mount.querySelector<HTMLElement>('[data-production-mode-hud]');
    if (!active || !GENERIC_HUD_TOOLS.has(active.id)) {
      existing?.remove();
      return;
    }

    const descriptor = productionModeHudDescriptor(active.id);
    if (!descriptor) {
      existing?.remove();
      return;
    }

    const signature = JSON.stringify({ id: active.id, activation: active.activation, options: active.options, hud: state.session.interaction.hud });
    if (existing?.dataset.productionModeSignature === signature) return;
    existing?.remove();

    const document = mount.ownerDocument;
    const hud = document.createElement('section');
    hud.className = 'lc-production-mode-hud';
    hud.dataset.productionModeHud = '1';
    hud.dataset.productionModeSignature = signature;
    if (state.session.interaction.hud.userMoved) {
      hud.classList.add('is-user-moved');
      if (state.session.interaction.hud.left !== null) hud.style.left = `${state.session.interaction.hud.left}px`;
      if (state.session.interaction.hud.top !== null) hud.style.top = `${state.session.interaction.hud.top}px`;
    }

    const header = document.createElement('div');
    header.className = 'lc-production-mode-hud__header';
    const identity = document.createElement('div');
    identity.className = 'lc-production-mode-hud__identity';
    const title = document.createElement('strong');
    title.textContent = descriptor.title;
    identity.append(title);
    if (descriptor.shortcut) {
      const shortcut = document.createElement('kbd');
      shortcut.textContent = descriptor.shortcut;
      shortcut.title = `Hold ${descriptor.shortcut} for momentary mode · Shift+${descriptor.shortcut} locks`;
      identity.append(shortcut);
    }

    const headerActions = document.createElement('div');
    headerActions.className = 'lc-production-mode-hud__header-actions';
    if (active.id !== 'roomFeatures') {
      const lock = button(
        document,
        active.activation === 'locked' ? 'Locked' : 'Lock',
        'lc-production-mode-hud__icon-btn' + (active.activation === 'locked' ? ' is-active' : ''),
        () => {
          if (active.activation === 'momentary') this.tools.promoteHeldToLocked();
          else this.tools.cancel();
        },
      );
      lock.title = active.activation === 'locked'
        ? active.id === 'roomWall' || active.id === 'linkedWall'
          ? 'Return to Room Features'
          : `Unlock and close ${descriptor.title} mode`
        : `Lock ${descriptor.title} mode`;
      headerActions.append(lock);
    }
    const close = button(document, '×', 'lc-production-mode-hud__icon-btn', () => this.tools.cancel());
    close.title = active.id === 'roomWall' || active.id === 'linkedWall'
      ? 'Return to Room Features'
      : `Exit ${descriptor.title} mode`;
    close.setAttribute('aria-label', close.title);
    headerActions.append(close);
    header.append(identity, headerActions);
    hud.append(header);

    if (descriptor.kind === 'room-parent') {
      hud.append(this.roomParentControls(document));
    } else if (descriptor.kind === 'room-wall' || descriptor.kind === 'linked-wall') {
      hud.append(this.roomWallControls(document, descriptor.kind === 'room-wall'));
    }

    const help = document.createElement('div');
    help.className = 'lc-production-mode-hud__help';
    help.textContent = `HELP · ${descriptor.help}`;
    help.title = descriptor.help;
    hud.append(help);

    this.attachHudDrag(hud, header, mount);
    mount.append(hud);
  }

  private roomParentControls(document: Document): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'lc-production-mode-hud__room-actions';
    controls.append(
      button(document, '+ Add Feature', '', () => this.openRoomFeatureDialog()),
      button(document, 'Draw Wall', '', () => this.tools.activateLocked('roomWall')),
      button(document, 'Linked Walls', '', () => this.tools.activateLocked('linkedWall')),
    );
    return controls;
  }

  private roomWallControls(document: Document, showType: boolean): HTMLElement {
    const active = this.tools.getActiveTool();
    const controls = document.createElement('div');
    controls.className = 'lc-production-mode-hud__wall-controls';

    if (showType) {
      const typeLabel = document.createElement('label');
      const typeText = document.createElement('span');
      typeText.textContent = 'Wall Type';
      const type = document.createElement('select');
      type.innerHTML = '<option value="full">Full Wall</option><option value="knee">Knee Wall</option>';
      const saved = this.savedWallType(document.defaultView);
      const current = active?.options.wallType;
      type.value = current === 'knee' || current === 'full' ? current : saved;
      if (current !== 'knee' && current !== 'full') {
        queueMicrotask(() => {
          if (this.tools.getActiveTool()?.id === 'roomWall') this.tools.setToolOption('wallType', type.value);
        });
      }
      type.addEventListener('change', () => {
        const next = type.value === 'knee' ? 'knee' : 'full';
        try {
          document.defaultView?.localStorage.setItem(ROOM_WALL_TYPE_KEY, next);
        } catch {
          // Browser storage is optional; typed tool memory remains authoritative.
        }
        this.tools.setToolOption('wallType', next);
      });
      typeLabel.append(typeText, type);
      controls.append(typeLabel);
    }

    const thicknessLabel = document.createElement('label');
    const thicknessText = document.createElement('span');
    thicknessText.textContent = 'Thickness';
    const thickness = document.createElement('input');
    thickness.type = 'number';
    thickness.min = '0.25';
    thickness.max = '24';
    thickness.step = '0.125';
    const remembered = Number(active?.options.thickness);
    const initial = Number.isFinite(remembered)
      ? Math.max(0.25, Math.min(24, remembered))
      : this.savedWallThickness(document.defaultView);
    thickness.value = String(initial);
    if (!Number.isFinite(remembered)) {
      queueMicrotask(() => {
        const current = this.tools.getActiveTool();
        if (current?.id === 'roomWall' || current?.id === 'linkedWall') this.tools.setToolOption('thickness', initial);
      });
    }
    thickness.addEventListener('change', () => {
      const next = Math.max(0.25, Math.min(24, Number(thickness.value) || 4.5));
      thickness.value = String(next);
      try {
        document.defaultView?.localStorage.setItem(ROOM_WALL_THICKNESS_KEY, String(next));
      } catch {
        // Browser storage is optional.
      }
      this.tools.setToolOption('thickness', next);
    });
    thicknessLabel.append(thicknessText, thickness);
    controls.append(thicknessLabel);
    return controls;
  }

  private savedWallThickness(view: Window | null): number {
    try {
      const stored = Number(view?.localStorage.getItem(ROOM_WALL_THICKNESS_KEY));
      if (Number.isFinite(stored) && stored >= 0.25 && stored <= 24) return stored;
    } catch {
      // Use the production default.
    }
    return 4.5;
  }

  private savedWallType(view: Window | null): 'full' | 'knee' {
    try {
      return view?.localStorage.getItem(ROOM_WALL_TYPE_KEY) === 'knee' ? 'knee' : 'full';
    } catch {
      return 'full';
    }
  }

  private attachHudDrag(hud: HTMLElement, header: HTMLElement, mount: HTMLElement): void {
    let drag: { pointerId: number; startX: number; startY: number; left: number; top: number } | null = null;

    header.addEventListener('pointerdown', (event) => {
      if (!(event instanceof PointerEvent) || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('button,input,select')) return;
      const hudRect = hud.getBoundingClientRect();
      const mountRect = mount.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: hudRect.left - mountRect.left,
        top: hudRect.top - mountRect.top,
      };
      header.setPointerCapture?.(event.pointerId);
      hud.classList.add('is-user-moved', 'is-dragging');
      hud.style.transform = 'none';
      event.preventDefault();
    });

    header.addEventListener('pointermove', (event) => {
      if (!(event instanceof PointerEvent) || !drag || event.pointerId !== drag.pointerId) return;
      const mountRect = mount.getBoundingClientRect();
      const hudRect = hud.getBoundingClientRect();
      const left = Math.max(0, Math.min(Math.max(0, mountRect.width - hudRect.width), drag.left + event.clientX - drag.startX));
      const top = Math.max(0, Math.min(Math.max(0, mountRect.height - hudRect.height), drag.top + event.clientY - drag.startY));
      hud.style.left = `${left}px`;
      hud.style.top = `${top}px`;
      event.preventDefault();
    });

    const finish = (event: PointerEvent): void => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const left = Number.parseFloat(hud.style.left || '0');
      const top = Number.parseFloat(hud.style.top || '0');
      drag = null;
      hud.classList.remove('is-dragging');
      if (Number.isFinite(left) && Number.isFinite(top)) this.tools.setHudPosition(left, top);
      try {
        header.releasePointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture may already have been released.
      }
    };
    header.addEventListener('pointerup', finish);
    header.addEventListener('pointercancel', finish);
  }

  private openRoomFeatureDialog(): void {
    const mount = this.modalRoot;
    if (!mount) return;
    this.closeRoomFeatureDialog();

    const state = this.store.getState();
    const layout = state.project.layouts.find((item) => item.id === state.session.activeLayoutId);
    if (!layout || state.session.workspace !== 'design') return;

    const document = mount.ownerDocument;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = document.createElement('div');
    overlay.className = 'lc-production-room-modal-overlay';
    overlay.dataset.productionRoomFeatureModal = '1';
    const appRoot = document.querySelector<HTMLElement>('.lite-cad');
    if (appRoot?.classList.contains('lc-theme-dark')) {
      overlay.classList.add('lc-theme-dark');
    }
    const dialog = document.createElement('section');
    dialog.className = 'lc-production-room-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Add Room Feature');

    const head = document.createElement('div');
    head.className = 'lc-production-room-modal__head';
    const title = document.createElement('strong');
    title.textContent = 'Add Room Feature';
    const close = button(document, '×', 'lc-production-room-modal__close', () => {
      this.closeRoomFeatureDialog();
    });
    close.setAttribute('aria-label', 'Close Add Room Feature dialog');
    head.append(title, close);

    const body = document.createElement('div');
    body.className = 'lc-production-room-modal__body';
    const form = document.createElement('div');
    form.className = 'lc-production-room-feature-form';
    const field = (labelText: string, control: HTMLElement, wide = false): HTMLLabelElement => {
      const label = document.createElement('label');
      label.className = wide ? 'is-wide' : '';
      const caption = document.createElement('span');
      caption.textContent = labelText;
      label.append(caption, control);
      return label;
    };

    const type = document.createElement('select');
    ROOM_FEATURE_PRESETS.forEach((preset) => {
      const option = document.createElement('option');
      option.value = preset.value;
      option.textContent = preset.label;
      type.append(option);
    });
    const length = document.createElement('input');
    length.type = 'number';
    length.min = '0.25';
    length.step = '0.25';
    const depth = document.createElement('input');
    depth.type = 'number';
    depth.min = '0.25';
    depth.step = '0.25';
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    const countertop = document.createElement('input');
    countertop.type = 'checkbox';
    const countertopRow = document.createElement('label');
    countertopRow.className = 'lc-production-room-feature-form__check is-wide';
    const countertopText = document.createElement('span');
    countertopText.textContent = 'Receives countertop';
    countertopRow.append(countertop, countertopText);

    let labelEdited = false;
    const selectedPreset = (): RoomFeaturePreset => ROOM_FEATURE_PRESETS.find((preset) => preset.value === type.value) ?? ROOM_FEATURE_PRESETS[0]!;
    const syncPreset = (): void => {
      const preset = selectedPreset();
      length.value = String(preset.length);
      depth.value = String(preset.depth);
      countertop.checked = preset.receivesCountertop;
      labelInput.value = defaultRoomFeatureLabel(preset, preset.length);
      labelEdited = false;
    };
    type.addEventListener('change', syncPreset);
    length.addEventListener('input', () => {
      if (!labelEdited) {
        const preset = selectedPreset();
        labelInput.value = defaultRoomFeatureLabel(preset, numberValue(length.value, preset.length, 0.25));
      }
    });
    labelInput.addEventListener('input', () => {
      labelEdited = true;
    });

    form.append(
      field('Type', type),
      field('Length', length),
      field('Depth', depth),
      field('Label', labelInput, true),
      countertopRow,
    );
    body.append(form);

    const foot = document.createElement('div');
    foot.className = 'lc-production-room-modal__foot';
    const cancel = button(document, 'Cancel', '', () => {
      this.closeRoomFeatureDialog();
    });
    const add = button(document, 'Add Feature', 'is-primary', () => {
      const preset = selectedPreset();
      const nextLength = numberValue(length.value, preset.length, 0.25);
      const nextDepth = numberValue(depth.value, preset.depth, 0.25);
      const current = this.store.getState();
      const activeLayout = current.project.layouts.find((item) => item.id === current.session.activeLayoutId);
      if (!activeLayout || current.session.workspace !== 'design') return;
      const pointer = current.session.interaction.pointer;
      const feature = createRoomFeature(this.createId('room-feature'), preset.value, {
        name: labelInput.value.trim() || defaultRoomFeatureLabel(preset, nextLength),
        x: pointer?.x ?? activeLayout.cw / 2,
        y: pointer?.y ?? activeLayout.ch / 2,
        length: nextLength,
        depth: nextDepth,
        receivesCountertop: countertop.checked,
        groupId: this.createId('room-group'),
      });
      this.commands.execute(addRoomFeature(activeLayout.id, feature));
      this.closeRoomFeatureDialog();
    });
    foot.append(cancel, add);
    dialog.append(head, body, foot);
    overlay.append(dialog);
    productionRoomFeatureModalHost(document, mount).append(overlay);
    this.modalOverlay = overlay;

    const view = document.defaultView;
    const blockCanvasKeys = (event: KeyboardEvent): void => {
      if (!shouldBlockProductionRoomModalKey(event.key, isEditableTarget(event.target))) return;
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      this.closeRoomFeatureDialog();
    };
    view?.addEventListener('keydown', blockCanvasKeys, true);
    document.addEventListener('keydown', onEscape, true);
    this.modalCleanup = () => {
      view?.removeEventListener('keydown', blockCanvasKeys, true);
      document.removeEventListener('keydown', onEscape, true);
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };

    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) {
        this.closeRoomFeatureDialog();
      }
    });

    syncPreset();
    type.focus();
  }

  private closeRoomFeatureDialog(): void {
    this.modalOverlay?.remove();
    this.modalOverlay = null;
    const cleanup = this.modalCleanup;
    this.modalCleanup = null;
    cleanup?.();
  }
}
