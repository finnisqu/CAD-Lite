import type { AppStore, ApplicationState } from '../app';
import {
  createProductionOutputMetadata,
  productionOutputFilename,
  productionOutputStateForLayout,
  productionPdfPlacement,
  type ProductionOutputMetadata,
} from './production-output-model';

const JSPDF_SRC =
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ProductionOutputSurfaceOptions {
  root: ParentNode;
  store: AppStore;
  today?: () => string;
}

interface CapturedSvg {
  source: string;
  width: number;
  height: number;
}

interface JsPdfPageSize {
  getWidth(): number;
  getHeight(): number;
}

interface JsPdfDocument {
  internal: { pageSize: JsPdfPageSize };
  addPage(format: string, orientation: 'landscape' | 'portrait'): void;
  addImage(
    imageData: string,
    format: 'PNG' | 'JPEG',
    x: number,
    y: number,
    width: number,
    height: number,
    alias?: string,
    compression?: string,
  ): void;
  save(filename: string): void;
  setFont(fontName: string, fontStyle?: string): void;
  setFontSize(size: number): void;
  splitTextToSize(text: string, maxWidth: number): string[];
  text(text: string | string[], x: number, y: number): void;
}

interface JsPdfConstructor {
  new (options: {
    orientation: 'landscape' | 'portrait';
    unit: 'pt';
    format: 'letter';
    compress: boolean;
    putOnlyUsedFonts?: boolean;
  }): JsPdfDocument;
}

type OutputWindow = Window &
  typeof globalThis & {
    jspdf?: { jsPDF?: JsPdfConstructor };
  };

function defaultToday(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function outputWindow(document: Document): OutputWindow | null {
  return document.defaultView as OutputWindow | null;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function downloadBlob(document: Document, filename: string, blob: Blob): void {
  const view = document.defaultView;
  if (!view) throw new Error('Output download requires a browser window.');

  const url = view.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  view.URL.revokeObjectURL(url);
}

function serializeSvg(svg: SVGSVGElement): CapturedSvg {
  const document = svg.ownerDocument;
  const view = document.defaultView;
  if (!view) throw new Error('SVG export requires a browser window.');

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  const viewBox = svg.viewBox.baseVal;
  const width =
    Number(svg.getAttribute('width')) ||
    viewBox.width ||
    svg.getBoundingClientRect().width ||
    800;
  const height =
    Number(svg.getAttribute('height')) ||
    viewBox.height ||
    svg.getBoundingClientRect().height ||
    400;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const Serializer = view.XMLSerializer;
  const source = new Serializer().serializeToString(clone);
  return { source, width, height };
}

async function rasterizeSvg(
  document: Document,
  frame: CapturedSvg,
  scale = 1,
): Promise<HTMLCanvasElement> {
  const view = outputWindow(document);
  if (!view) throw new Error('Raster output requires a browser window.');

  const blob = new Blob([frame.source], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = view.URL.createObjectURL(blob);

  try {
    const image = new view.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not rasterize the drawing.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(frame.width * scale));
    canvas.height = Math.max(1, Math.round(frame.height * scale));
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('Canvas output is unavailable.');

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    view.URL.revokeObjectURL(url);
  }
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The browser could not encode the output image.'));
      },
      type,
      quality,
    );
  });
}

async function nextRenderedFrame(document: Document): Promise<void> {
  await Promise.resolve();
  const view = document.defaultView;
  if (!view?.requestAnimationFrame) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return;
  }
  await new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()));
  await Promise.resolve();
}

async function ensureJsPdf(document: Document): Promise<JsPdfConstructor> {
  const view = outputWindow(document);
  if (!view) throw new Error('PDF export requires a browser window.');
  const existing = view.jspdf?.jsPDF;
  if (existing) return existing;

  const selector = 'script[data-cad-lite-jspdf]';
  let script = document.querySelector<HTMLScriptElement>(selector);
  if (!script) {
    script = document.createElement('script');
    script.src = JSPDF_SRC;
    script.async = true;
    script.dataset.cadLiteJspdf = 'true';
    document.head.append(script);
  }

  await new Promise<void>((resolve, reject) => {
    const ready = view.jspdf?.jsPDF;
    if (ready) {
      resolve();
      return;
    }

    const onLoad = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new Error('Could not load the PDF export library.'));
    };
    const cleanup = (): void => {
      script?.removeEventListener('load', onLoad);
      script?.removeEventListener('error', onError);
    };
    script?.addEventListener('load', onLoad, { once: true });
    script?.addEventListener('error', onError, { once: true });
  });

  const loaded = view.jspdf?.jsPDF;
  if (!loaded) throw new Error('PDF export library did not initialize.');
  return loaded;
}

async function addPdfPage(
  document: Document,
  pdf: JsPdfDocument,
  frame: CapturedSvg,
  metadata: ProductionOutputMetadata,
): Promise<void> {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const notes = metadata.projectNotes;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(metadata.projectName, margin, margin);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(`Date: ${metadata.projectDate}`, margin, margin + 16);
  pdf.text(`Layout: ${metadata.layoutName}`, margin, margin + 32);

  let headerHeight = 40;
  if (notes) {
    pdf.setFontSize(9);
    const noteLines = pdf.splitTextToSize(`Notes: ${notes}`, pageWidth - margin * 2);
    pdf.text(noteLines, margin, margin + 48);
    headerHeight = 52 + noteLines.length * 11;
  }

  const placement = productionPdfPlacement(
    frame.width,
    frame.height,
    pageWidth,
    pageHeight,
    headerHeight,
    margin,
  );
  const canvas = await rasterizeSvg(document, frame, 2);
  const dataUrl = canvas.toDataURL('image/png');
  pdf.addImage(
    dataUrl,
    'PNG',
    placement.imageX,
    placement.imageY,
    placement.imageWidth,
    placement.imageHeight,
    undefined,
    'FAST',
  );
}

/**
 * Restores the v1.5.99 production output family without owning CAD state.
 * Project JSON remains owned by ProjectFileSurface. This surface prepares
 * deterministic output from the typed canvas and uses temporary system-state
 * swaps only for the legacy multi-layout PDF flow; those swaps explicitly skip
 * history and persistence through AppStore.replaceState().
 */
export class ProductionOutputSurface {
  private readonly root: ParentNode;
  private readonly store: AppStore;
  private readonly today: () => string;
  private abort: AbortController | null = null;
  private status: HTMLElement | null = null;
  private generatedControls: HTMLElement[] = [];
  private legacyNote: HTMLElement | null = null;

  constructor(options: ProductionOutputSurfaceOptions) {
    this.root = options.root;
    this.store = options.store;
    this.today = options.today ?? defaultToday;
  }

  mount(): void {
    if (this.abort) return;
    if (!this.root.querySelector('[data-cad-lite-production-shell]')) return;

    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.status = this.root.querySelector<HTMLElement>('#lc-file-status');
    this.ensureControls();

    this.bind('#lc-export-svg', () => this.exportSvg(), signal);
    this.bind('#lc-export-png', () => this.exportPng(), signal);
    this.bind('#lc-export-pdf', () => this.exportCurrentPdf(), signal);
    this.bind('#lc-export-pdf-all', () => this.exportAllPdf(), signal);
  }

  unmount(): void {
    this.abort?.abort();
    this.abort = null;
    this.status = null;
    this.generatedControls.forEach((control) => control.remove());
    this.generatedControls = [];
    if (this.legacyNote) this.legacyNote.hidden = false;
    this.legacyNote = null;
  }

  private ensureControls(): void {
    if (this.root.querySelector('#lc-export-pdf')) return;
    const project = this.root.querySelector<HTMLButtonElement>(
      '#lc-export-project',
    );
    const panel = project?.parentElement;
    if (!project || !panel) return;

    const document = project.ownerDocument;
    const controls: Array<[string, string]> = [
      ['lc-export-pdf-all', 'PDF (All Layouts)'],
      ['lc-export-pdf', 'PDF (Current Layout)'],
      ['lc-export-png', 'PNG (Current Layout)'],
      ['lc-export-svg', 'SVG (Current Layout)'],
    ];

    controls.forEach(([id, label]) => {
      const button = document.createElement('button');
      button.id = id;
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.textContent = label;
      panel.insertBefore(button, project);
      this.generatedControls.push(button);
    });

    const separator = document.createElement('div');
    separator.className = 'cad-lite-production-shell__menu-separator';
    panel.insertBefore(separator, project);
    this.generatedControls.push(separator);

    this.legacyNote = panel.querySelector<HTMLElement>(
      '.cad-lite-production-shell__menu-note',
    );
    if (this.legacyNote) this.legacyNote.hidden = true;
  }

  private bind(
    selector: string,
    action: () => Promise<void>,
    signal: AbortSignal,
  ): void {
    this.root.querySelector<HTMLButtonElement>(selector)?.addEventListener(
      'click',
      () => void this.run(action),
      { signal },
    );
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try {
      this.setStatus('Preparing output…');
      await action();
    } catch (value) {
      this.setStatus(`Output failed: ${asError(value).message}`, true);
    }
  }

  private document(): Document {
    if (typeof Document !== 'undefined' && this.root instanceof Document) {
      return this.root;
    }
    const document = (this.root as Node).ownerDocument;
    if (!document) throw new Error('Output requires a browser document.');
    return document;
  }

  private currentSvg(): SVGSVGElement {
    const svg = this.root.querySelector<SVGSVGElement>('#lc-svg');
    if (!svg) throw new Error('Drawing canvas is unavailable.');
    return svg;
  }

  private currentMetadata(): ProductionOutputMetadata {
    const metadata = createProductionOutputMetadata(
      this.store.getState(),
      undefined,
      this.today(),
    );
    if (!metadata) throw new Error('No active layout is available to export.');
    return metadata;
  }

  private async exportSvg(): Promise<void> {
    const document = this.document();
    const metadata = this.currentMetadata();
    const frame = serializeSvg(this.currentSvg());
    downloadBlob(
      document,
      productionOutputFilename(metadata, 'svg'),
      new Blob([frame.source], { type: 'image/svg+xml;charset=utf-8' }),
    );
    this.setStatus('SVG exported.');
  }

  private async exportPng(): Promise<void> {
    const document = this.document();
    const metadata = this.currentMetadata();
    const frame = serializeSvg(this.currentSvg());
    const canvas = await rasterizeSvg(document, frame);
    const blob = await canvasBlob(canvas, 'image/png');
    downloadBlob(document, productionOutputFilename(metadata, 'png'), blob);
    this.setStatus('PNG exported.');
  }

  private async exportCurrentPdf(): Promise<void> {
    const document = this.document();
    const metadata = this.currentMetadata();
    const frame = serializeSvg(this.currentSvg());
    const JsPdf = await ensureJsPdf(document);
    const orientation = frame.width > frame.height ? 'landscape' : 'portrait';
    const pdf = new JsPdf({
      orientation,
      unit: 'pt',
      format: 'letter',
      compress: true,
      putOnlyUsedFonts: true,
    });
    await addPdfPage(document, pdf, frame, metadata);
    pdf.save(productionOutputFilename(metadata, 'pdf-current'));
    this.setStatus('PDF exported.');
  }

  private async exportAllPdf(): Promise<void> {
    const document = this.document();
    const initial = this.store.getState();
    const layouts = [...initial.project.layouts];
    if (layouts.length === 0) throw new Error('There are no layouts to export.');

    const firstMetadata = createProductionOutputMetadata(
      initial,
      layouts[0]?.id ?? null,
      this.today(),
    );
    if (!firstMetadata) throw new Error('There are no layouts to export.');

    const JsPdf = await ensureJsPdf(document);
    let pdf: JsPdfDocument | null = null;
    const restoreState: ApplicationState = {
      project: initial.project,
      session: initial.session,
      preferences: initial.preferences,
    };

    try {
      for (const layout of layouts) {
        const outputState = productionOutputStateForLayout(initial, layout.id);
        this.store.replaceState(outputState, 'Prepare layout for output');
        await nextRenderedFrame(document);

        const metadata = createProductionOutputMetadata(
          initial,
          layout.id,
          this.today(),
        );
        if (!metadata) continue;
        const frame = serializeSvg(this.currentSvg());
        const orientation = frame.width > frame.height ? 'landscape' : 'portrait';

        if (!pdf) {
          pdf = new JsPdf({
            orientation,
            unit: 'pt',
            format: 'letter',
            compress: true,
            putOnlyUsedFonts: true,
          });
        } else {
          pdf.addPage('letter', orientation);
        }
        await addPdfPage(document, pdf, frame, metadata);
      }
    } finally {
      this.store.replaceState(restoreState, 'Restore view after output');
      await nextRenderedFrame(document);
    }

    if (!pdf) throw new Error('No layouts could be exported.');
    pdf.save(productionOutputFilename(firstMetadata, 'pdf-all'));
    this.setStatus('All-layout PDF exported.');
  }

  private setStatus(message: string, isError = false): void {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.dataset.state = isError ? 'error' : 'ok';
  }
}
