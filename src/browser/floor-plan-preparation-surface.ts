import {
  setFloorPlan,
  setWorkspace,
  type ApplicationEffects,
  type AppStore,
  type CommandDispatcher,
} from '../app';
import { FloorPlanCalibrationSurface } from './floor-plan-calibration-surface';
import { openFloorPlanImageEditor } from './floor-plan-image-editor';
import type { FloorPlanModal } from './floor-plan-modal';
import { openFloorPlanPdfImport } from './floor-plan-pdf-import';
import type { BrowserEntityIdFactory } from './project-layout-surface';

export interface FloorPlanPreparationSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  commands: CommandDispatcher;
  effects: ApplicationEffects;
  createId: BrowserEntityIdFactory;
  confirm?: (message: string) => boolean;
  alert?: (message: string) => void;
}

function ownerDocument(root: ParentNode): Document {
  if (root instanceof Document) return root;
  const document = (root as Node).ownerDocument;
  if (!document) throw new Error('Floor Plan preparation requires a Document.');
  return document;
}

export class FloorPlanPreparationSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly createId: BrowserEntityIdFactory;
  private readonly confirm: (message: string) => boolean;
  private readonly alert: (message: string) => void;
  private readonly document: Document;
  private readonly calibration: FloorPlanCalibrationSurface;

  private abort: AbortController | null = null;
  private fileInput: HTMLInputElement | null = null;
  private activeModal: FloorPlanModal | null = null;

  constructor(options: FloorPlanPreparationSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
    this.createId = options.createId;
    this.confirm =
      options.confirm ??
      ((message) =>
        typeof window === 'undefined' ? true : window.confirm(message));
    this.alert =
      options.alert ??
      ((message) => {
        if (typeof window !== 'undefined') window.alert(message);
      });
    this.document = ownerDocument(options.root);
    this.calibration = new FloorPlanCalibrationSurface({
      root: options.root,
      store: options.store,
      commands: options.commands,
      effects: options.effects,
      alert: this.alert,
      onModal: (modal) => this.setActiveModal(modal),
    });
  }

  mount(): void {
    if (this.abort) return;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.ensureFileInput();
    this.root
      .querySelector<HTMLButtonElement>('#lc-import-floor-plan')
      ?.addEventListener('click', () => this.openFilePicker(), { signal });
    this.calibration.mount();
  }

  unmount(): void {
    this.calibration.unmount();
    this.activeModal?.close();
    this.activeModal = null;
    this.abort?.abort();
    this.abort = null;
    this.fileInput?.remove();
    this.fileInput = null;
  }

  openFilePicker(): void {
    if (this.store.getState().session.workspace !== 'design') {
      this.commands.execute(setWorkspace('design'));
    }
    this.ensureFileInput().click();
  }

  prepareCurrentPlan(): void {
    const state = this.store.getState();
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    const plan = layout?.plan;
    if (!layout || !plan || state.session.workspace !== 'design') return;
    if (plan.locked) {
      this.alert('Unlock the floor plan before preparing it.');
      return;
    }
    if (
      plan.calibrated &&
      !this.confirm(
        'Preparing this calibrated plan will reset calibration. Continue?',
      )
    ) {
      return;
    }
    void this.openImageEditor(plan.dataURL, plan.name, layout.id);
  }

  startDistanceCalibration(): void {
    this.calibration.startDistance();
  }

  startSquareCalibration(): void {
    this.calibration.startSquare24();
  }

  cancelCalibration(): void {
    this.calibration.cancel();
  }

  private setActiveModal(modal: FloorPlanModal | null): void {
    if (modal && this.activeModal && this.activeModal !== modal) {
      this.activeModal.close();
    }
    this.activeModal = modal;
  }

  private ensureFileInput(): HTMLInputElement {
    if (this.fileInput) return this.fileInput;
    const input = this.document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    input.id = 'lc-plan-file-input';
    input.accept =
      '.pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf';
    input.setAttribute('aria-hidden', 'true');
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      input.value = '';
      if (file) void this.handleFile(file);
    });
    this.document.body.appendChild(input);
    this.fileInput = input;
    return input;
  }

  private async handleFile(file: File): Promise<void> {
    const state = this.store.getState();
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    if (!layout || state.session.workspace !== 'design') return;
    if (layout.plan && !this.confirm('Replace the floor plan on this Layout?')) {
      return;
    }

    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        await openFloorPlanPdfImport({
          document: this.document,
          file,
          onModal: (modal) => this.setActiveModal(modal),
          onPrepared: async (dataURL, name) =>
            this.openImageEditor(dataURL, name, layout.id),
        });
      } else {
        await this.openImageEditor(
          await this.readFileAsDataURL(file),
          file.name,
          layout.id,
        );
      }
    } catch (error) {
      console.error(error);
      this.alert('Could not import this floor plan.');
    }
  }

  private readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') resolve(result);
        else reject(new Error('Floor Plan file did not produce an image URL.'));
      };
      reader.onerror = () =>
        reject(reader.error ?? new Error('Floor Plan file read failed.'));
      reader.readAsDataURL(file);
    });
  }

  private async openImageEditor(
    dataURL: string,
    name: string,
    layoutId: string,
  ): Promise<void> {
    await openFloorPlanImageEditor({
      document: this.document,
      dataURL,
      name,
      createId: this.createId,
      onModal: (modal) => this.setActiveModal(modal),
      onCommit: (plan) => {
        this.commands.execute(setFloorPlan(layoutId, plan));
      },
    });
  }
}
