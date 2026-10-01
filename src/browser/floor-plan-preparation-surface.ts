import {
  calibrateFloorPlanDistance,
  calibrateFloorPlanSquare,
  setFloorPlan,
  setWorkspace,
  type ApplicationEffects,
  type AppStore,
  type CommandDispatcher,
} from '../app';
import { createFloorPlan } from '../domain/floor-plans';
import type { BrowserEntityIdFactory } from './project-layout-surface';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PDFJS_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER_SRC =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

type Point = { x: number; y: number };
type Crop = { x: number; y: number; w: number; h: number };
type Square = { x: number; y: number; size: number };
type EditorMode = 'crop' | 'level' | 'erase';

interface PdfViewport {
  width: number;
  height: number;
}

interface PdfPage {
  getViewport(options: { scale: number }): PdfViewport;
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }): { promise: Promise<void> };
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
}

interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(options: { data: Uint8Array }): {
    promise: Promise<PdfDocument>;
  };
}

interface ModalShell {
  overlay: HTMLDivElement;
  body: HTMLDivElement;
  foot: HTMLDivElement;
  close(): void;
}

interface EditorSnapshot {
  canvas: HTMLCanvasElement;
  crop: Crop;
  cropFocused: boolean;
  transformed: boolean;
}

interface DistanceCalibration {
  mode: 'distance';
  layoutId: string;
  first: Point | null;
  hover: Point | null;
}

interface SquareDrag {
  kind: 'create' | 'move' | 'resize';
  start: Point;
  original: Square | null;
  anchor: Point | null;
  signX: number;
  signY: number;
}

interface SquareCalibration {
  mode: 'square24';
  layoutId: string;
  square: Square | null;
  drag: SquareDrag | null;
}

type CalibrationState = DistanceCalibration | SquareCalibration | null;

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

function pdfJsFromWindow(view: Window): PdfJsLib | null {
  return (view as Window & { pdfjsLib?: PdfJsLib }).pdfjsLib ?? null;
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = source.ownerDocument.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  const context = copy.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.drawImage(source, 0, 0);
  return copy;
}

function fullCrop(canvas: HTMLCanvasElement): Crop {
  return { x: 0, y: 0, w: canvas.width, h: canvas.height };
}

function clampCrop(crop: Crop, canvas: HTMLCanvasElement): Crop {
  const x = Math.max(0, Math.min(canvas.width - 1, crop.x));
  const y = Math.max(0, Math.min(canvas.height - 1, crop.y));
  return {
    x,
    y,
    w: Math.max(1, Math.min(canvas.width - x, crop.w)),
    h: Math.max(1, Math.min(canvas.height - y, crop.h)),
  };
}

function imageToCanvas(
  image: HTMLImageElement,
  maxDimension = 3200,
): HTMLCanvasElement {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, maxDimension / Math.max(width, height, 1));
  const canvas = image.ownerDocument.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cropCanvas(
  source: HTMLCanvasElement,
  crop: Crop,
  maxDimension = 3000,
): HTMLCanvasElement {
  const bounded = clampCrop(crop, source);
  const sx = Math.floor(bounded.x);
  const sy = Math.floor(bounded.y);
  const sw = Math.max(1, Math.round(bounded.w));
  const sh = Math.max(1, Math.round(bounded.h));
  const scale = Math.min(1, maxDimension / Math.max(sw, sh, 1));
  const canvas = source.ownerDocument.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    sx,
    sy,
    Math.min(sw, source.width - sx),
    Math.min(sh, source.height - sy),
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

function rotateCanvas(
  source: HTMLCanvasElement,
  degrees: number,
): HTMLCanvasElement {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const width = Math.max(
    1,
    Math.ceil(source.width * cosine + source.height * sine),
  );
  const height = Math.max(
    1,
    Math.ceil(source.width * sine + source.height * cosine),
  );
  const canvas = source.ownerDocument.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.translate(width / 2, height / 2);
  context.rotate(radians);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function preparedDataUrl(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL('image/webp', 0.92);
  return webp.startsWith('data:image/webp')
    ? webp
    : canvas.toDataURL('image/jpeg', 0.94);
}

export class FloorPlanPreparationSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly commands: CommandDispatcher;
  private readonly effects: ApplicationEffects;
  private readonly createId: BrowserEntityIdFactory;
  private readonly confirm: (message: string) => boolean;
  private readonly alert: (message: string) => void;
  private readonly document: Document;

  private abort: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private fileInput: HTMLInputElement | null = null;
  private modalShell: ModalShell | null = null;
  private svg: SVGSVGElement | null = null;
  private calibration: CalibrationState = null;
  private calibrationControls: HTMLElement | null = null;

  constructor(options: FloorPlanPreparationSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.commands = options.commands;
    this.effects = options.effects;
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
  }

  mount(): void {
    if (this.abort) return;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    this.ensureFileInput();
    this.root
      .querySelector<HTMLButtonElement>('#lc-import-floor-plan')
      ?.addEventListener('click', () => this.openFilePicker(), { signal });

    this.svg?.addEventListener(
      'pointerdown',
      (event) => this.onCalibrationPointerDown(event),
      { signal, capture: true },
    );
    this.svg?.addEventListener(
      'pointermove',
      (event) => this.onCalibrationPointerMove(event),
      { signal, capture: true },
    );
    this.svg?.addEventListener(
      'pointerup',
      (event) => this.onCalibrationPointerUp(event),
      { signal, capture: true },
    );
    this.svg?.addEventListener(
      'pointercancel',
      (event) => this.onCalibrationPointerUp(event),
      { signal, capture: true },
    );

    this.unsubscribe = this.effects.invalidation.subscribe((batch) => {
      if (batch.targets.includes('canvas') || batch.targets.includes('navigator')) {
        queueMicrotask(() => this.decorateCalibration());
      }
    });
  }

  unmount(): void {
    this.cancelCalibration();
    this.modalShell?.close();
    this.modalShell = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.abort?.abort();
    this.abort = null;
    this.fileInput?.remove();
    this.fileInput = null;
    this.svg = null;
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
      !this.confirm('Preparing this calibrated plan will reset calibration. Continue?')
    ) {
      return;
    }
    void this.openImageEditor(plan.dataURL, plan.name, layout.id);
  }

  startDistanceCalibration(): void {
    const layoutId = this.unlockedPlanLayoutId();
    if (!layoutId) return;
    this.cancelCalibration();
    this.calibration = {
      mode: 'distance',
      layoutId,
      first: null,
      hover: null,
    };
    this.decorateCalibration();
  }

  startSquareCalibration(): void {
    const layoutId = this.unlockedPlanLayoutId();
    if (!layoutId) return;
    this.cancelCalibration();
    this.calibration = {
      mode: 'square24',
      layoutId,
      square: null,
      drag: null,
    };
    this.decorateCalibration();
  }

  cancelCalibration(): void {
    this.calibration = null;
    this.svg?.querySelector('[data-plan-calibration="1"]')?.remove();
    this.calibrationControls?.remove();
    this.calibrationControls = null;
  }

  private unlockedPlanLayoutId(): string | null {
    const state = this.store.getState();
    if (state.session.workspace !== 'design') return null;
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    if (!layout?.plan) return null;
    if (layout.plan.locked) {
      this.alert('Unlock the floor plan before calibrating it.');
      return null;
    }
    return layout.id;
  }

  private ensureFileInput(): HTMLInputElement {
    if (this.fileInput) return this.fileInput;
    const input = this.document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    input.id = 'lc-plan-file-input';
    input.accept = '.pdf,.png,.jpg,.jpeg,image/png,image/jpeg,application/pdf';
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
        await this.openPdfPicker(file, layout.id);
      } else {
        const dataURL = await this.readFile(file);
        await this.openImageEditor(dataURL, file.name, layout.id);
      }
    } catch (error) {
      console.error(error);
      this.alert('Could not import this floor plan.');
    }
  }

  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('File read failed.'));
      reader.readAsDataURL(file);
    });
  }

  private loadImage(dataURL: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = this.document.createElement('img');
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Plan image failed to load.'));
      image.src = dataURL;
    });
  }

  private async ensurePdfJs(): Promise<PdfJsLib> {
    const view = this.document.defaultView;
    if (!view) throw new Error('PDF import requires a browser Window.');
    const ready = pdfJsFromWindow(view);
    if (ready) return ready;

    const existing = this.document.querySelector<HTMLScriptElement>(
      'script[data-cadlite-pdfjs="1"]',
    );
    if (existing) {
      await new Promise<void>((resolve, reject) => {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error('PDF.js failed to load.')),
          { once: true },
        );
      });
    } else {
      await new Promise<void>((resolve, reject) => {
        const script = this.document.createElement('script');
        script.dataset.cadlitePdfjs = '1';
        script.src = PDFJS_SRC;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('PDF.js failed to load.'));
        this.document.head.appendChild(script);
      });
    }

    const loaded = pdfJsFromWindow(view);
    if (!loaded) throw new Error('PDF.js unavailable.');
    loaded.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
    return loaded;
  }

  private async renderPdfPage(
    pdf: PdfDocument,
    pageNumber: number,
    maxDimension: number,
  ): Promise<HTMLCanvasElement> {
    const page = await pdf.getPage(pageNumber);
    const unit = page.getViewport({ scale: 1 });
    const scale = Math.min(
      3,
      Math.max(0.1, maxDimension / Math.max(unit.width, unit.height, 1)),
    );
    const viewport = page.getViewport({ scale });
    const canvas = this.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas;
  }

  private async openPdfPicker(file: File, layoutId: string): Promise<void> {
    const pdfjs = await this.ensurePdfJs();
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise;
    const modal = this.modal('Choose PDF Page', 'lc-plan-pdf-dialog');

    const top = this.document.createElement('div');
    top.className = 'lc-plan-pdf-top';
    const select = this.document.createElement('select');
    select.className = 'lc-input';
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const option = this.document.createElement('option');
      option.value = String(index);
      option.textContent = `Page ${index}`;
      select.appendChild(option);
    }
    const count = this.document.createElement('span');
    count.className = 'lc-small lc-plan-muted';
    count.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}`;
    top.append(select, count);

    const preview = this.document.createElement('canvas');
    preview.className = 'lc-plan-pdf-preview';
    preview.width = 900;
    preview.height = 600;
    const status = this.document.createElement('div');
    status.className = 'lc-small lc-plan-muted';
    modal.body.append(top, preview, status);

    let renderToken = 0;
    const renderPreview = async (): Promise<void> => {
      const token = ++renderToken;
      status.textContent = 'Rendering page…';
      const pageCanvas = await this.renderPdfPage(pdf, Number(select.value), 1200);
      if (token !== renderToken) return;
      const context = preview.getContext('2d');
      if (!context) return;
      context.fillStyle = '#f8fafc';
      context.fillRect(0, 0, preview.width, preview.height);
      const scale = Math.min(
        preview.width / pageCanvas.width,
        preview.height / pageCanvas.height,
      );
      const width = pageCanvas.width * scale;
      const height = pageCanvas.height * scale;
      context.drawImage(
        pageCanvas,
        (preview.width - width) / 2,
        (preview.height - height) / 2,
        width,
        height,
      );
      status.textContent = `${pageCanvas.width} × ${pageCanvas.height} px preview`;
    };
    select.addEventListener('change', () => void renderPreview());
    void renderPreview();

    const cancel = this.button('Cancel', () => modal.close());
    const use = this.button('Prepare Page', () => {
      void (async () => {
        use.disabled = true;
        try {
          const page = await this.renderPdfPage(pdf, Number(select.value), 3200);
          modal.close();
          await this.openImageEditor(
            page.toDataURL('image/jpeg', 0.94),
            file.name,
            layoutId,
          );
        } catch (error) {
          console.error(error);
          use.disabled = false;
          status.textContent = 'Could not render this page.';
        }
      })();
    }, true);
    modal.foot.append(cancel, use);
  }

  private async openImageEditor(
    dataURL: string,
    name: string,
    layoutId: string,
  ): Promise<void> {
    const image = await this.loadImage(dataURL);
    let work = imageToCanvas(image);
    const initial = cloneCanvas(work);
    let crop = fullCrop(work);
    let cropFocused = false;
    let transformed = false;
    let mode: EditorMode = 'crop';
    let brushSize = 48;
    let previewZoom = 1;
    let levelLine: { start: Point; end: Point } | null = null;
    let eraseHover: Point | null = null;
    let pointer:
      | { id: number; start: Point; current: Point; last: Point }
      | null = null;

    const history: EditorSnapshot[] = [];
    let historyIndex = -1;
    const modal = this.modal('Prepare Floor Plan', 'lc-plan-import-dialog');
    const toolbar = this.document.createElement('div');
    toolbar.className = 'lc-plan-editor-toolbar';
    const preview = this.document.createElement('canvas');
    preview.className = 'lc-plan-editor-preview';
    preview.width = 1100;
    preview.height = 700;
    const secondary = this.document.createElement('div');
    secondary.className = 'lc-plan-preview-controls';
    const meta = this.document.createElement('div');
    meta.className = 'lc-small lc-plan-muted';
    modal.body.append(toolbar, secondary, preview, meta);

    let map = { source: fullCrop(work), scale: 1, ox: 0, oy: 0 };

    const restore = (snapshot: EditorSnapshot): void => {
      work = cloneCanvas(snapshot.canvas);
      crop = clampCrop(snapshot.crop, work);
      cropFocused = snapshot.cropFocused;
      transformed = snapshot.transformed;
      pointer = null;
      levelLine = null;
    };
    const push = (): void => {
      history.splice(historyIndex + 1);
      history.push({
        canvas: cloneCanvas(work),
        crop: { ...crop },
        cropFocused,
        transformed,
      });
      historyIndex = history.length - 1;
      syncHistory();
    };
    const commitCrop = (): void => {
      const bounded = clampCrop(crop, work);
      if (
        bounded.x < 0.5 &&
        bounded.y < 0.5 &&
        Math.abs(bounded.w - work.width) < 1 &&
        Math.abs(bounded.h - work.height) < 1
      ) {
        crop = fullCrop(work);
        cropFocused = false;
        return;
      }
      work = cropCanvas(work, bounded, 3200);
      crop = fullCrop(work);
      cropFocused = false;
      transformed = true;
    };

    const render = (): void => {
      const context = preview.getContext('2d');
      if (!context) return;
      context.fillStyle = '#f1f5f9';
      context.fillRect(0, 0, preview.width, preview.height);
      const source = cropFocused ? clampCrop(crop, work) : fullCrop(work);
      const fit = Math.min(
        preview.width / source.w,
        preview.height / source.h,
      );
      const scale = Math.max(0.05, fit * previewZoom);
      const width = source.w * scale;
      const height = source.h * scale;
      const ox = (preview.width - width) / 2;
      const oy = (preview.height - height) / 2;
      map = { source, scale, ox, oy };
      context.drawImage(
        work,
        source.x,
        source.y,
        source.w,
        source.h,
        ox,
        oy,
        width,
        height,
      );

      if (mode === 'crop') {
        const bounded = clampCrop(crop, work);
        context.strokeStyle = '#2563eb';
        context.lineWidth = 2;
        context.setLineDash([8, 5]);
        context.strokeRect(
          ox + (bounded.x - source.x) * scale,
          oy + (bounded.y - source.y) * scale,
          bounded.w * scale,
          bounded.h * scale,
        );
        context.setLineDash([]);
      }
      if (mode === 'level' && levelLine) {
        context.strokeStyle = '#dc2626';
        context.lineWidth = 2;
        context.setLineDash([6, 4]);
        context.beginPath();
        context.moveTo(
          ox + (levelLine.start.x - source.x) * scale,
          oy + (levelLine.start.y - source.y) * scale,
        );
        context.lineTo(
          ox + (levelLine.end.x - source.x) * scale,
          oy + (levelLine.end.y - source.y) * scale,
        );
        context.stroke();
        context.setLineDash([]);
      }
      if (mode === 'erase' && eraseHover) {
        context.strokeStyle = 'rgba(37,99,235,.8)';
        context.setLineDash([4, 3]);
        context.beginPath();
        context.arc(
          ox + (eraseHover.x - source.x) * scale,
          oy + (eraseHover.y - source.y) * scale,
          Math.max(3, (brushSize * scale) / 2),
          0,
          Math.PI * 2,
        );
        context.stroke();
        context.setLineDash([]);
      }
      meta.textContent =
        `${Math.round(crop.w)} × ${Math.round(crop.h)} px selected` +
        (transformed ? ' · image adjusted' : '') +
        ` · preview ${Math.round(previewZoom * 100)}%`;
      focus.textContent = cropFocused ? 'Show Full' : 'Focus Crop';
    };

    const localPoint = (event: PointerEvent): Point => {
      const rect = preview.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * preview.width;
      const py = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * preview.height;
      return {
        x: Math.max(
          map.source.x,
          Math.min(
            map.source.x + map.source.w,
            map.source.x + (px - map.ox) / map.scale,
          ),
        ),
        y: Math.max(
          map.source.y,
          Math.min(
            map.source.y + map.source.h,
            map.source.y + (py - map.oy) / map.scale,
          ),
        ),
      };
    };

    const erase = (from: Point, to: Point): void => {
      const context = work.getContext('2d');
      if (!context) return;
      context.save();
      context.strokeStyle = '#ffffff';
      context.fillStyle = '#ffffff';
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = brushSize;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      if (from.x === to.x && from.y === to.y) {
        context.beginPath();
        context.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    };

    const setMode = (next: EditorMode): void => {
      mode = next;
      cropButton.classList.toggle('is-active', next === 'crop');
      levelButton.classList.toggle('is-active', next === 'level');
      eraseButton.classList.toggle('is-active', next === 'erase');
      brushWrap.hidden = next !== 'erase';
      levelLine = null;
      pointer = null;
      render();
    };

    const cropButton = this.button('Crop', () => setMode('crop'));
    const levelButton = this.button('Level', () => setMode('level'));
    const eraseButton = this.button('Erase', () => setMode('erase'));
    const left = this.button('↶ 90°', () => {
      commitCrop();
      work = rotateCanvas(work, -90);
      crop = fullCrop(work);
      transformed = true;
      push();
      render();
    });
    const right = this.button('↷ 90°', () => {
      commitCrop();
      work = rotateCanvas(work, 90);
      crop = fullCrop(work);
      transformed = true;
      push();
      render();
    });
    const undo = this.button('Undo', () => {
      if (historyIndex <= 0) return;
      historyIndex -= 1;
      restore(history[historyIndex]!);
      syncHistory();
      render();
    });
    const redo = this.button('Redo', () => {
      if (historyIndex >= history.length - 1) return;
      historyIndex += 1;
      restore(history[historyIndex]!);
      syncHistory();
      render();
    });
    const reset = this.button('Reset', () => {
      work = cloneCanvas(initial);
      crop = fullCrop(work);
      cropFocused = false;
      transformed = false;
      push();
      render();
    });
    const syncHistory = (): void => {
      undo.disabled = historyIndex <= 0;
      redo.disabled = historyIndex >= history.length - 1;
    };
    toolbar.append(
      cropButton,
      levelButton,
      eraseButton,
      left,
      right,
      undo,
      redo,
      reset,
    );

    const zoomOut = this.button('−', () => {
      previewZoom = Math.max(0.5, previewZoom - 0.25);
      render();
    });
    const zoomIn = this.button('+', () => {
      previewZoom = Math.min(3, previewZoom + 0.25);
      render();
    });
    const focus = this.button('Focus Crop', () => {
      cropFocused = !cropFocused;
      previewZoom = 1;
      render();
    });
    const brushWrap = this.document.createElement('label');
    brushWrap.className = 'lc-plan-brush-control lc-small';
    brushWrap.textContent = 'Brush';
    const brush = this.document.createElement('input');
    brush.type = 'range';
    brush.min = '12';
    brush.max = '180';
    brush.step = '4';
    brush.value = String(brushSize);
    const brushValue = this.document.createElement('span');
    brushValue.textContent = `${brushSize}px`;
    brush.addEventListener('input', () => {
      brushSize = Number(brush.value) || 48;
      brushValue.textContent = `${brushSize}px`;
      render();
    });
    brushWrap.append(brush, brushValue);
    secondary.append(zoomOut, zoomIn, focus, brushWrap);

    preview.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const point = localPoint(event);
      pointer = {
        id: event.pointerId,
        start: point,
        current: point,
        last: point,
      };
      preview.setPointerCapture?.(event.pointerId);
      if (mode === 'level') levelLine = { start: point, end: point };
      if (mode === 'erase') erase(point, point);
      render();
    });
    preview.addEventListener('pointermove', (event) => {
      const point = localPoint(event);
      eraseHover = point;
      if (!pointer || pointer.id !== event.pointerId) {
        if (mode === 'erase') render();
        return;
      }
      pointer.current = point;
      if (mode === 'crop') {
        crop = clampCrop(
          {
            x: Math.min(pointer.start.x, point.x),
            y: Math.min(pointer.start.y, point.y),
            w: Math.max(1, Math.abs(point.x - pointer.start.x)),
            h: Math.max(1, Math.abs(point.y - pointer.start.y)),
          },
          work,
        );
      } else if (mode === 'level') {
        levelLine = { start: pointer.start, end: point };
      } else {
        erase(pointer.last, point);
        pointer.last = point;
      }
      render();
    });
    preview.addEventListener('pointerleave', () => {
      eraseHover = null;
      if (!pointer && mode === 'erase') render();
    });

    const finish = (event: PointerEvent): void => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const completed = pointer;
      pointer = null;
      try {
        preview.releasePointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture may already be released.
      }
      if (mode === 'crop') {
        if (crop.w < 8 || crop.h < 8) {
          crop = fullCrop(work);
          cropFocused = false;
        } else {
          cropFocused = true;
          previewZoom = 1;
        }
        push();
        render();
        return;
      }
      if (mode === 'erase') {
        transformed = true;
        push();
        render();
        return;
      }
      levelLine = null;
      const dx = completed.current.x - completed.start.x;
      const dy = completed.current.y - completed.start.y;
      if (Math.hypot(dx, dy) < 12) {
        render();
        return;
      }
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const target = Math.round(angle / 90) * 90;
      commitCrop();
      work = rotateCanvas(work, target - angle);
      crop = fullCrop(work);
      cropFocused = false;
      transformed = true;
      push();
      render();
    };
    preview.addEventListener('pointerup', finish);
    preview.addEventListener('pointercancel', finish);

    push();
    setMode('crop');
    const cancel = this.button('Cancel', () => modal.close());
    const use = this.button('Import Plan', () => {
      const output = cropCanvas(work, crop);
      this.commands.execute(
        setFloorPlan(
          layoutId,
          createFloorPlan({
            id: this.createId('plan'),
            name: name || 'Floor Plan',
            dataURL: preparedDataUrl(output),
            natW: output.width,
            natH: output.height,
          }),
        ),
      );
      modal.close();
    }, true);
    modal.foot.append(cancel, use);
  }

  private modal(titleText: string, className: string): ModalShell {
    this.modalShell?.close();
    const overlay = this.document.createElement('div');
    overlay.className = 'lc-plan-modal-overlay';
    const dialog = this.document.createElement('div');
    dialog.className = `lc-plan-dialog ${className}`;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', titleText);
    const head = this.document.createElement('div');
    head.className = 'lc-plan-dialog-head';
    const title = this.document.createElement('strong');
    title.textContent = titleText;
    const close = this.document.createElement('button');
    close.type = 'button';
    close.className = 'lc-btn ghost lc-iconbtn';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close');
    head.append(title, close);
    const body = this.document.createElement('div');
    body.className = 'lc-plan-dialog-body';
    const foot = this.document.createElement('div');
    foot.className = 'lc-plan-dialog-foot';
    dialog.append(head, body, foot);
    overlay.appendChild(dialog);
    this.document.body.appendChild(overlay);

    const shell: ModalShell = {
      overlay,
      body,
      foot,
      close: () => {
        overlay.remove();
        if (this.modalShell === shell) this.modalShell = null;
      },
    };
    close.addEventListener('click', shell.close);
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) shell.close();
    });
    this.modalShell = shell;
    return shell;
  }

  private button(
    text: string,
    onClick: () => void,
    primary = false,
  ): HTMLButtonElement {
    const button = this.document.createElement('button');
    button.type = 'button';
    button.className = `lc-btn ${primary ? 'alt' : 'ghost'}`;
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
  }

  private canvasPoint(event: PointerEvent): Point | null {
    const svg = this.svg;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * viewBox.width + viewBox.x,
      y: ((event.clientY - rect.top) / rect.height) * viewBox.height + viewBox.y,
    };
  }

  private ownPointer(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  private onCalibrationPointerDown(event: PointerEvent): void {
    const calibration = this.calibration;
    const point = this.canvasPoint(event);
    if (!calibration || !point || event.button !== 0) return;
    this.ownPointer(event);

    if (calibration.mode === 'distance') {
      if (!calibration.first) {
        calibration.first = point;
        calibration.hover = point;
      } else {
        const measured = Math.hypot(
          point.x - calibration.first.x,
          point.y - calibration.first.y,
        );
        if (measured > 0.0001) {
          this.requestKnownDistance(calibration.layoutId, measured);
        }
      }
      this.decorateCalibration();
      return;
    }

    const square = calibration.square;
    if (!square) {
      calibration.square = { x: point.x, y: point.y, size: 0.125 };
      calibration.drag = {
        kind: 'create',
        start: point,
        original: null,
        anchor: point,
        signX: 1,
        signY: 1,
      };
    } else {
      const tolerance = Math.max(0.25, 10 / this.activeScale());
      const corners = [
        {
          point: { x: square.x, y: square.y },
          anchor: { x: square.x + square.size, y: square.y + square.size },
          signX: -1,
          signY: -1,
        },
        {
          point: { x: square.x + square.size, y: square.y },
          anchor: { x: square.x, y: square.y + square.size },
          signX: 1,
          signY: -1,
        },
        {
          point: { x: square.x + square.size, y: square.y + square.size },
          anchor: { x: square.x, y: square.y },
          signX: 1,
          signY: 1,
        },
        {
          point: { x: square.x, y: square.y + square.size },
          anchor: { x: square.x + square.size, y: square.y },
          signX: -1,
          signY: 1,
        },
      ];
      const corner = corners.find(
        (candidate) =>
          Math.hypot(
            point.x - candidate.point.x,
            point.y - candidate.point.y,
          ) <= tolerance,
      );
      const inside =
        point.x >= square.x &&
        point.x <= square.x + square.size &&
        point.y >= square.y &&
        point.y <= square.y + square.size;
      if (corner) {
        calibration.drag = {
          kind: 'resize',
          start: point,
          original: { ...square },
          anchor: corner.anchor,
          signX: corner.signX,
          signY: corner.signY,
        };
      } else if (inside) {
        calibration.drag = {
          kind: 'move',
          start: point,
          original: { ...square },
          anchor: null,
          signX: 1,
          signY: 1,
        };
      } else {
        calibration.square = { x: point.x, y: point.y, size: 0.125 };
        calibration.drag = {
          kind: 'create',
          start: point,
          original: null,
          anchor: point,
          signX: 1,
          signY: 1,
        };
      }
    }
    this.svg?.setPointerCapture?.(event.pointerId);
    this.decorateCalibration();
  }

  private onCalibrationPointerMove(event: PointerEvent): void {
    const calibration = this.calibration;
    const point = this.canvasPoint(event);
    if (!calibration || !point) return;
    if (calibration.mode === 'distance') {
      if (!calibration.first) return;
      this.ownPointer(event);
      calibration.hover = point;
      this.decorateCalibration();
      return;
    }
    if (!calibration.drag) return;
    this.ownPointer(event);
    const drag = calibration.drag;
    if (drag.kind === 'move' && drag.original) {
      calibration.square = {
        ...drag.original,
        x: drag.original.x + point.x - drag.start.x,
        y: drag.original.y + point.y - drag.start.y,
      };
    } else if (drag.anchor) {
      const size = Math.max(
        0.125,
        Math.max(
          Math.abs(point.x - drag.anchor.x),
          Math.abs(point.y - drag.anchor.y),
        ),
      );
      calibration.square = {
        x: drag.signX > 0 ? drag.anchor.x : drag.anchor.x - size,
        y: drag.signY > 0 ? drag.anchor.y : drag.anchor.y - size,
        size,
      };
    }
    this.decorateCalibration();
  }

  private onCalibrationPointerUp(event: PointerEvent): void {
    const calibration = this.calibration;
    if (!calibration || calibration.mode !== 'square24' || !calibration.drag) {
      return;
    }
    this.ownPointer(event);
    calibration.drag = null;
    try {
      this.svg?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
    this.decorateCalibration();
  }

  private activeScale(): number {
    const state = this.store.getState();
    const layout = state.project.layouts.find(
      (item) => item.id === state.session.activeLayoutId,
    );
    return Math.max(0.001, Math.abs(layout?.scale ?? 1));
  }

  private requestKnownDistance(layoutId: string, measured: number): void {
    const modal = this.modal('Calibrate Floor Plan', 'lc-plan-calibrate-dialog');
    const help = this.document.createElement('p');
    help.className = 'lc-plan-help';
    help.textContent =
      'Enter the real-world distance between the two selected points. Scaling is uniform.';
    const input = this.document.createElement('input');
    input.type = 'number';
    input.className = 'lc-input';
    input.min = '0.001';
    input.step = '0.001';
    input.value = '24';
    const measuredText = this.document.createElement('div');
    measuredText.className = 'lc-small lc-plan-muted';
    measuredText.textContent = `Measured on canvas: ${measured.toFixed(3)} in`;
    modal.body.append(help, input, measuredText);
    modal.foot.append(
      this.button('Cancel', () => modal.close()),
      this.button('Calibrate', () => {
        const known = Number(input.value);
        if (!(known > 0)) return;
        this.commands.execute(
          calibrateFloorPlanDistance(layoutId, measured, known),
        );
        modal.close();
        this.cancelCalibration();
      }, true),
    );
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
  }

  private confirmSquareCalibration(): void {
    const calibration = this.calibration;
    if (
      !calibration ||
      calibration.mode !== 'square24' ||
      !calibration.square ||
      calibration.square.size <= 0.125
    ) {
      return;
    }
    this.commands.execute(
      calibrateFloorPlanSquare(calibration.layoutId, calibration.square.size),
    );
    this.cancelCalibration();
  }

  private decorateCalibration(): void {
    const svg = this.svg;
    const calibration = this.calibration;
    svg?.querySelector('[data-plan-calibration="1"]')?.remove();
    this.calibrationControls?.remove();
    this.calibrationControls = null;
    if (!svg || !calibration) return;

    const state = this.store.getState();
    if (
      state.session.workspace !== 'design' ||
      state.session.activeLayoutId !== calibration.layoutId
    ) {
      this.cancelCalibration();
      return;
    }

    const group = this.document.createElementNS(SVG_NS, 'g');
    group.setAttribute('data-plan-calibration', '1');
    group.setAttribute('pointer-events', 'none');
    const unit = 1 / this.activeScale();

    if (calibration.mode === 'distance') {
      if (calibration.first && calibration.hover) {
        const line = this.document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(calibration.first.x));
        line.setAttribute('y1', String(calibration.first.y));
        line.setAttribute('x2', String(calibration.hover.x));
        line.setAttribute('y2', String(calibration.hover.y));
        line.setAttribute('stroke', '#2563eb');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '6 4');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        group.appendChild(line);
      }
      if (calibration.first) {
        const point = this.document.createElementNS(SVG_NS, 'circle');
        point.setAttribute('cx', String(calibration.first.x));
        point.setAttribute('cy', String(calibration.first.y));
        point.setAttribute('r', String(4 * unit));
        point.setAttribute('fill', '#2563eb');
        group.appendChild(point);
      }
    } else if (calibration.square) {
      const square = calibration.square;
      const rect = this.document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(square.x));
      rect.setAttribute('y', String(square.y));
      rect.setAttribute('width', String(square.size));
      rect.setAttribute('height', String(square.size));
      rect.setAttribute('fill', 'rgba(37,99,235,.08)');
      rect.setAttribute('stroke', '#2563eb');
      rect.setAttribute('stroke-width', '2');
      rect.setAttribute('stroke-dasharray', '6 4');
      rect.setAttribute('vector-effect', 'non-scaling-stroke');
      group.appendChild(rect);
      const label = this.document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(square.x + square.size / 2));
      label.setAttribute('y', String(square.y - 7 * unit));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', String(12 * unit));
      label.setAttribute('font-weight', '700');
      label.setAttribute('fill', '#1d4ed8');
      label.textContent = '24″ × 24″ calibration square';
      group.appendChild(label);
    }
    svg.appendChild(group);

    const controls = this.document.createElement('div');
    controls.className = 'lc-floor-plan-calibration-controls';
    const message = this.document.createElement('span');
    message.className = 'lc-small';
    if (calibration.mode === 'distance') {
      message.textContent = calibration.first
        ? 'Choose the second point for a known distance.'
        : 'Choose the first point of a known distance.';
      controls.append(
        message,
        this.button('Cancel', () => this.cancelCalibration()),
      );
    } else {
      message.textContent = calibration.square
        ? `Square side on canvas: ${calibration.square.size.toFixed(3)} in`
        : 'Drag a square over a known 24″ × 24″ feature.';
      const confirm = this.button(
        'Confirm 24″ Square',
        () => this.confirmSquareCalibration(),
        true,
      );
      confirm.disabled = !calibration.square || calibration.square.size <= 0.125;
      controls.append(
        message,
        confirm,
        this.button('Cancel', () => this.cancelCalibration()),
      );
    }
    svg.parentElement?.prepend(controls);
    this.calibrationControls = controls;
  }
}
