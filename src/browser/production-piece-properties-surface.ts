import {
  updatePieceEdgeProperties,
  updatePieceProperties,
  type AppStore,
  type CommandDispatcher,
  type ReadonlyApplicationState,
} from '../app';
import type { CornerRadii, Piece, PieceSide } from '../domain/pieces';

export interface ProductionPiecePropertiesSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
}

export interface ProductionPiecePropertiesProjection {
  layoutId: string;
  pieceId: string;
  name: string;
  width: number;
  height: number;
  color: string;
  noFill: boolean;
  fillOpacity: number;
  overhangs: Piece['overhangs'];
  edgeProfiles: Piece['edgeProfiles'];
  cornerRadii: CornerRadii;
}

const EDGE_SIDES: readonly PieceSide[] = [
  'top',
  'right',
  'bottom',
  'left',
];

const CORNER_LABELS: readonly [keyof CornerRadii, string][] = [
  ['tl', 'Top Left'],
  ['tr', 'Top Right'],
  ['br', 'Bottom Right'],
  ['bl', 'Bottom Left'],
];

export function createProductionPiecePropertiesProjection(
  state: ReadonlyApplicationState,
): ProductionPiecePropertiesProjection | null {
  if (state.session.workspace !== 'design') return null;
  const selection = state.session.selection;
  if (selection.kind !== 'pieces' || selection.ids.length !== 1) return null;
  const layout = state.project.layouts.find(
    (item) => item.id === state.session.activeLayoutId,
  );
  const piece = layout?.pieces.find((item) => item.id === selection.ids[0]);
  if (!layout || !piece) return null;

  return {
    layoutId: layout.id,
    pieceId: piece.id,
    name: piece.name,
    width: piece.w,
    height: piece.h,
    color: piece.color,
    noFill: piece.noFill,
    fillOpacity: piece.fillOpacity ?? 1,
    overhangs: { ...piece.overhangs },
    edgeProfiles: { ...piece.edgeProfiles },
    cornerRadii: { ...piece.cornerRadii },
  };
}

function labelText(document: Document, text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

function sectionShell(
  document: Document,
  className: string,
  title: string,
): { section: HTMLElement; body: HTMLElement } {
  const section = document.createElement('section');
  section.className = `lc-production-piece-properties ${className}`;
  section.dataset.productionPieceProperties = '1';

  const header = document.createElement('div');
  header.className = 'lc-production-piece-properties__header';
  const strong = document.createElement('strong');
  strong.textContent = title;
  header.append(strong);

  const body = document.createElement('div');
  body.className = 'lc-production-piece-properties__body';
  section.append(header, body);
  return { section, body };
}

function numberField(
  document: Document,
  label: string,
  value: number,
  options: {
    min?: number;
    max?: number;
    step?: number;
    onChange: (value: number) => void;
  },
): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'lc-production-piece-properties__field';
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  if (options.step !== undefined) input.step = String(options.step);
  input.addEventListener('change', () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) options.onChange(next);
  });
  field.append(labelText(document, label), input);
  return field;
}

/**
 * Adds the production-only Piece property sections whose data model and typed
 * commands already exist. Linked Splash workflows are deliberately excluded.
 */
export class ProductionPiecePropertiesSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private inspector: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private observer: MutationObserver | null = null;
  private rendering = false;
  private scheduled = false;

  constructor(options: ProductionPiecePropertiesSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
  }

  mount(): void {
    if (this.unsubscribe || this.observer) return;
    if (!this.root.querySelector('[data-cad-lite-production-shell]')) return;
    const inspector = this.root.querySelector<HTMLElement>('#lc-inspector');
    if (!inspector) return;
    this.inspector = inspector;

    this.unsubscribe = this.store.subscribe(() => this.scheduleRender());
    const Observer = inspector.ownerDocument.defaultView?.MutationObserver;
    if (Observer) {
      this.observer = new Observer(() => this.scheduleRender());
      this.observer.observe(inspector, { childList: true, subtree: true });
    }
    this.render();
  }

  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.observer?.disconnect();
    this.observer = null;
    this.inspector = null;
    this.rendering = false;
    this.scheduled = false;
  }

  private scheduleRender(): void {
    if (this.rendering || this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.render();
    });
  }

  private render(): void {
    const inspector = this.inspector;
    if (!inspector || this.rendering) return;
    const projection = createProductionPiecePropertiesProjection(
      this.store.getState(),
    );
    const signature = projection ? JSON.stringify(projection) : '';
    const existing = inspector.querySelector<HTMLElement>(
      '[data-production-piece-properties-signature]',
    );
    const complete =
      inspector.querySelectorAll(':scope > [data-production-piece-properties]')
        .length === 3;
    if (
      existing?.dataset.productionPiecePropertiesSignature === signature &&
      complete
    ) {
      return;
    }

    this.rendering = true;
    try {
      inspector
        .querySelectorAll(':scope > [data-production-piece-properties]')
        .forEach((node) => node.remove());
      if (!projection) return;

      const document = inspector.ownerDocument;
      const appearance = this.renderAppearance(document, projection);
      appearance.section.dataset.productionPiecePropertiesSignature = signature;
      const overhangs = this.renderOverhangs(document, projection);
      const edges = this.renderEdgesAndCorners(document, projection);

      const anchor = inspector.querySelector(
        ':scope > .lc-piece-sinks-inspector, :scope > .lc-piece-cutouts-inspector, :scope > .lc-piece-seams-inspector, :scope > .lc-piece-mirror-actions',
      );
      [appearance.section, overhangs.section, edges.section].forEach(
        (section) => inspector.insertBefore(section, anchor),
      );
    } finally {
      this.rendering = false;
    }
  }

  private renderAppearance(
    document: Document,
    projection: ProductionPiecePropertiesProjection,
  ): { section: HTMLElement; body: HTMLElement } {
    const shell = sectionShell(
      document,
      'lc-production-piece-appearance',
      'Appearance',
    );
    shell.body.classList.add('lc-production-piece-appearance__body');

    const colorField = document.createElement('label');
    colorField.className = 'lc-production-piece-properties__field';
    const color = document.createElement('input');
    color.type = 'color';
    color.value = /^#[0-9a-f]{6}$/i.test(projection.color)
      ? projection.color
      : '#999999';
    color.addEventListener('change', () => {
      this.commands.execute(
        updatePieceProperties(projection.layoutId, projection.pieceId, {
          color: color.value,
        }),
      );
    });
    colorField.append(labelText(document, 'Color'), color);

    const noFill = document.createElement('label');
    noFill.className = 'lc-production-piece-properties__check';
    const noFillInput = document.createElement('input');
    noFillInput.type = 'checkbox';
    noFillInput.checked = projection.noFill;
    noFillInput.addEventListener('change', () => {
      this.commands.execute(
        updatePieceProperties(projection.layoutId, projection.pieceId, {
          noFill: noFillInput.checked,
        }),
      );
    });
    noFill.append(noFillInput, document.createTextNode('No Fill'));

    const opacity = numberField(
      document,
      'Fill Opacity',
      projection.fillOpacity,
      {
        min: 0,
        max: 1,
        step: 0.05,
        onChange: (fillOpacity) => {
          this.commands.execute(
            updatePieceProperties(projection.layoutId, projection.pieceId, {
              fillOpacity,
            }),
          );
        },
      },
    );

    shell.body.append(colorField, opacity, noFill);
    return shell;
  }

  private renderOverhangs(
    document: Document,
    projection: ProductionPiecePropertiesProjection,
  ): { section: HTMLElement; body: HTMLElement } {
    const shell = sectionShell(
      document,
      'lc-production-piece-overhangs',
      'Overhangs',
    );
    shell.body.classList.add('lc-production-piece-overhangs__grid');
    (
      [
        ['front', 'Front'],
        ['back', 'Back'],
        ['left', 'Left'],
        ['right', 'Right'],
      ] as const
    ).forEach(([side, label]) => {
      shell.body.append(
        numberField(document, label, projection.overhangs[side], {
          min: 0,
          step: 0.125,
          onChange: (value) => {
            this.commands.execute(
              updatePieceEdgeProperties(projection.layoutId, projection.pieceId, {
                overhangs: { [side]: value },
              }),
            );
          },
        }),
      );
    });
    return shell;
  }

  private renderEdgesAndCorners(
    document: Document,
    projection: ProductionPiecePropertiesProjection,
  ): { section: HTMLElement; body: HTMLElement } {
    const shell = sectionShell(
      document,
      'lc-production-piece-edge-options',
      'Edges & Corners',
    );

    const profiles = document.createElement('div');
    profiles.className = 'lc-production-piece-edge-profiles';
    EDGE_SIDES.forEach((side) => {
      const field = document.createElement('label');
      field.className =
        `lc-production-piece-edge-profile lc-production-piece-edge-profile--${side}`;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = projection.edgeProfiles[side];
      input.placeholder = 'None';
      input.setAttribute('aria-label', `${side} edge profile`);
      input.addEventListener('change', () => {
        this.commands.execute(
          updatePieceEdgeProperties(projection.layoutId, projection.pieceId, {
            edgeProfiles: { [side]: input.value },
          }),
        );
      });
      field.append(labelText(document, side[0]?.toUpperCase() + side.slice(1)), input);
      profiles.append(field);
    });

    const pieceBox = document.createElement('div');
    pieceBox.className = 'lc-production-piece-edge-diagram';
    const pieceLabel = document.createElement('span');
    pieceLabel.textContent = projection.name || 'Piece';
    pieceBox.append(pieceLabel);
    profiles.append(pieceBox);

    const corners = document.createElement('div');
    corners.className = 'lc-production-piece-corners';
    const maximumRadius = Math.min(projection.width, projection.height) / 2;
    CORNER_LABELS.forEach(([corner, label]) => {
      corners.append(
        numberField(document, label, projection.cornerRadii[corner], {
          min: 0,
          max: maximumRadius,
          step: 0.125,
          onChange: (value) => {
            this.commands.execute(
              updatePieceEdgeProperties(projection.layoutId, projection.pieceId, {
                cornerRadii: { [corner]: value },
              }),
            );
          },
        }),
      );
    });

    shell.body.append(profiles, corners);
    return shell;
  }
}
