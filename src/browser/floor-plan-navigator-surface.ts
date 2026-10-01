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
}

export class FloorPlanNavigatorSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly effects: ApplicationEffects;
  private readonly confirm: (message: string) => boolean;
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

      const plan = layout.plan;
      if (!plan) {
        const empty = document.createElement('div');
        empty.className = 'lc-small lc-floor-plan-nav-empty';
        empty.textContent = 'No floor plan on this Layout.';
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

      const actions = document.createElement('div');
      actions.className = 'lc-floor-plan-nav-actions';

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

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'lc-btn red sm lc-floor-plan-delete';
      remove.textContent = 'Delete Floor Plan';
      remove.addEventListener('click', () => {
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
