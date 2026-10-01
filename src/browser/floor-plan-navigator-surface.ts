import {
  clearFloorPlan,
  updateFloorPlan,
  type ApplicationEffects,
  type AppStore,
  type CommandDispatcher,
} from '../app';

export interface FloorPlanNavigatorSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  effects: ApplicationEffects;
  confirm?: (message: string) => boolean;
  onImport?: () => void;
  onPrepare?: () => void;
  onDistanceCalibration?: () => void;
  onSquareCalibration?: () => void;
}

export class FloorPlanNavigatorSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly effects: ApplicationEffects;
  private readonly confirm: (message: string) => boolean;
  private readonly onImport: (() => void) | null;
  private readonly onPrepare: (() => void) | null;
  private readonly onDistanceCalibration: (() => void) | null;
  private readonly onSquareCalibration: (() => void) | null;
  private mountElement: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private unsubscribe: (() => void) | null = null;
  private decorating = false;

  constructor(options: FloorPlanNavigatorSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
    this.effects = options.effects;
    this.confirm = options.confirm ?? ((message) =>
      typeof window === 'undefined' ? true : window.confirm(message));
    this.onImport = options.onImport ?? null;
    this.onPrepare = options.onPrepare ?? null;
    this.onDistanceCalibration = options.onDistanceCalibration ?? null;
    this.onSquareCalibration = options.onSquareCalibration ?? null;
  }

  mount(): void {
    if (this.mountElement) return;
    const mount = this.root.querySelector<HTMLElement>('#lc-pieces');
    if (!mount) return;
    this.mountElement = mount;
    this.unsubscribe = this.effects.invalidation.subscribe((batch) => {
      if (batch.targets.includes('navigator')) this.decorate();
    });
    this.observer = new MutationObserver(() => {
      if (!this.decorating) queueMicrotask(() => this.decorate());
    });
    this.observer.observe(mount, { childList: true });
    this.decorate();
  }

  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.observer?.disconnect();
    this.observer = null;
    this.mountElement
      ?.querySelector('[data-floor-plan-navigator="1"]')
      ?.remove();
    this.mountElement = null;
  }

  decorate(): void {
    const mount = this.mountElement;
    if (!mount || this.decorating) return;
    this.decorating = true;
    try {
      mount.querySelector('[data-floor-plan-navigator="1"]')?.remove();
      const state = this.store.getState();
      if (state.session.workspace !== 'design') return;
      const layout = state.project.layouts.find(
        (item) => item.id === state.session.activeLayoutId,
      );
      if (!layout) return;

      const document = mount.ownerDocument;
      const root = document.createElement('div');
      root.className = 'lc-floor-plan-nav lc-annotation-nav-section';
      root.dataset.floorPlanNavigator = '1';

      const header = document.createElement('div');
      header.className = 'lc-annotation-nav-header';
      const title = document.createElement('strong');
      title.textContent = 'Floor Plan';
      header.appendChild(title);
      root.appendChild(header);

      const button = (
        label: string,
        titleText: string,
        onClick: () => void,
      ): HTMLButtonElement => {
        const control = document.createElement('button');
        control.type = 'button';
        control.className = 'lc-btn ghost sm';
        control.textContent = label;
        control.title = titleText;
        control.addEventListener('click', onClick);
        return control;
      };

      const plan = layout.plan;
      if (!plan) {
        const empty = document.createElement('div');
        empty.className = 'lc-floor-plan-nav-empty';
        const text = document.createElement('div');
        text.className = 'lc-small';
        text.textContent = 'No floor plan on this Layout.';
        empty.appendChild(text);
        if (this.onImport) {
          const importButton = button(
            'Import Floor Plan',
            'Import PDF, PNG, JPG, or JPEG',
            this.onImport,
          );
          importButton.classList.add('lc-floor-plan-import');
          empty.appendChild(importButton);
        }
        root.appendChild(empty);
        mount.prepend(root);
        return;
      }

      const identity = document.createElement('div');
      identity.className = 'lc-floor-plan-nav-identity';
      const name = document.createElement('strong');
      name.textContent = plan.name;
      name.title = plan.name;
      const meta = document.createElement('span');
      meta.className = 'lc-small';
      meta.textContent =
        `${plan.w}" × ${plan.h}" · ` +
        (plan.calibrated ? 'calibrated' : 'uncalibrated') +
        (plan.locked ? ' · locked' : '');
      identity.append(name, meta);
      root.appendChild(identity);

      const workflow = document.createElement('div');
      workflow.className = 'lc-floor-plan-nav-actions lc-floor-plan-workflow-actions';
      if (this.onImport) {
        workflow.append(
          button('Replace', 'Replace Floor Plan from PDF or image', this.onImport),
        );
      }
      if (this.onPrepare) {
        const prepare = button(
          'Prepare',
          'Crop, level, erase, or rotate the prepared image',
          this.onPrepare,
        );
        prepare.disabled = plan.locked;
        workflow.append(prepare);
      }
      if (this.onDistanceCalibration) {
        const calibrate = button(
          'Calibrate',
          'Calibrate from a known point-to-point distance',
          this.onDistanceCalibration,
        );
        calibrate.disabled = plan.locked;
        workflow.append(calibrate);
      }
      if (this.onSquareCalibration) {
        const square = button(
          '24″ Square',
          'Calibrate from a known 24 × 24 inch square',
          this.onSquareCalibration,
        );
        square.disabled = plan.locked;
        workflow.append(square);
      }
      if (workflow.childElementCount) root.appendChild(workflow);

      const actions = document.createElement('div');
      actions.className = 'lc-floor-plan-nav-actions';
      actions.append(
        button(plan.visible ? 'Hide' : 'Show', 'Toggle Floor Plan visibility', () =>
          this.commands.execute(
            updateFloorPlan(layout.id, { visible: !plan.visible }),
          )),
        button(plan.locked ? 'Unlock' : 'Lock', 'Toggle Floor Plan editing lock', () =>
          this.commands.execute(
            updateFloorPlan(layout.id, { locked: !plan.locked }),
          )),
        button('Flip X', 'Mirror Floor Plan horizontally', () => {
          if (plan.locked) return;
          this.commands.execute(
            updateFloorPlan(layout.id, { flipX: !plan.flipX }),
          );
        }),
        button('Flip Y', 'Mirror Floor Plan vertically', () => {
          if (plan.locked) return;
          this.commands.execute(
            updateFloorPlan(layout.id, { flipY: !plan.flipY }),
          );
        }),
        button('↻ 90°', 'Rotate Floor Plan clockwise 90 degrees', () => {
          if (plan.locked) return;
          this.commands.execute(
            updateFloorPlan(layout.id, { rotation: plan.rotation + 90 }),
          );
        }),
      );
      root.appendChild(actions);

      const options = document.createElement('div');
      options.className = 'lc-floor-plan-nav-options';

      const opacityLabel = document.createElement('label');
      opacityLabel.className = 'lc-field';
      const opacityText = document.createElement('span');
      opacityText.className = 'lc-small';
      opacityText.textContent = `Opacity ${Math.round(plan.opacity * 100)}%`;
      const opacity = document.createElement('input');
      opacity.type = 'range';
      opacity.min = '8';
      opacity.max = '100';
      opacity.step = '1';
      opacity.value = String(Math.round(plan.opacity * 100));
      opacity.addEventListener('input', () => {
        opacityText.textContent = `Opacity ${opacity.value}%`;
      });
      opacity.addEventListener('change', () =>
        this.commands.execute(
          updateFloorPlan(layout.id, { opacity: Number(opacity.value) / 100 }),
        ));
      opacityLabel.append(opacityText, opacity);

      const checkbox = (
        labelText: string,
        checked: boolean,
        onChange: (checked: boolean) => void,
      ): HTMLLabelElement => {
        const label = document.createElement('label');
        label.className = 'lc-check lc-small';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.addEventListener('change', () => onChange(input.checked));
        label.append(input, document.createTextNode(labelText));
        return label;
      };

      options.append(
        opacityLabel,
        checkbox('Grayscale', plan.grayscale, (grayscale) =>
          this.commands.execute(updateFloorPlan(layout.id, { grayscale }))),
        checkbox('Include in export', plan.includeInExport, (includeInExport) =>
          this.commands.execute(updateFloorPlan(layout.id, { includeInExport }))),
      );
      root.appendChild(options);

      if (plan.locked) {
        const note = document.createElement('div');
        note.className = 'lc-small lc-plan-muted';
        note.textContent =
          'Unlock to prepare, recalibrate, mirror, rotate, replace, or delete the plan.';
        root.appendChild(note);
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lc-btn red sm lc-floor-plan-delete';
      remove.textContent = 'Delete Floor Plan';
      remove.disabled = plan.locked;
      remove.addEventListener('click', () => {
        if (plan.locked) return;
        if (
          this.confirm(
            `Delete ${plan.name || 'the Floor Plan'} from this Layout?`,
          )
        ) {
          this.commands.execute(clearFloorPlan(layout.id));
        }
      });
      root.appendChild(remove);

      mount.prepend(root);
    } finally {
      this.decorating = false;
    }
  }
}
