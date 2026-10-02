import {
  createFloorPlanButton,
  createFloorPlanModal,
  type FloorPlanModal,
} from './floor-plan-modal';

const PDFJS_SRC =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER_SRC =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

interface PdfViewport {
  width: number;
  height: number;
}

interface PdfPage {
  getViewport(options: { scale: number; rotation?: number }): PdfViewport;
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

export interface FloorPlanPdfImportOptions {
  document: Document;
  file: File;
  onPrepared(dataURL: string, name: string): void | Promise<void>;
  onModal?(modal: FloorPlanModal | null): void;
}

function pdfJsFromWindow(view: Window): PdfJsLib | null {
  return (view as Window & { pdfjsLib?: PdfJsLib }).pdfjsLib ?? null;
}

async function ensurePdfJs(document: Document): Promise<PdfJsLib> {
  const view = document.defaultView;
  if (!view) throw new Error('PDF import requires a browser Window.');
  const ready = pdfJsFromWindow(view);
  if (ready) return ready;

  const existing = document.querySelector<HTMLScriptElement>(
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
      const script = document.createElement('script');
      script.dataset.cadlitePdfjs = '1';
      script.src = PDFJS_SRC;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('PDF.js failed to load.'));
      document.head.appendChild(script);
    });
  }

  const loaded = pdfJsFromWindow(view);
  if (!loaded) throw new Error('PDF.js unavailable.');
  loaded.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  return loaded;
}

async function renderPdfPage(
  document: Document,
  pdf: PdfDocument,
  pageNumber: number,
  maxDimension: number,
  rotation = 0,
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const normalizedRotation = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  const unit = page.getViewport({ scale: 1, rotation: normalizedRotation });
  const scale = Math.min(
    6,
    Math.max(0.25, maxDimension / Math.max(unit.width, unit.height, 1)),
  );
  const viewport = page.getViewport({ scale, rotation: normalizedRotation });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

export async function openFloorPlanPdfImport(
  options: FloorPlanPdfImportOptions,
): Promise<void> {
  const pdfjs = await ensurePdfJs(options.document);
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(await options.file.arrayBuffer()),
  }).promise;

  const modal = createFloorPlanModal(
    options.document,
    'Choose PDF Page',
    'lc-plan-pdf-dialog',
    () => options.onModal?.(null),
  );
  options.onModal?.(modal);

  const top = options.document.createElement('div');
  top.className = 'lc-plan-pdf-top';
  const select = options.document.createElement('select');
  select.className = 'lc-input';
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const option = options.document.createElement('option');
    option.value = String(index);
    option.textContent = `Page ${index}`;
    select.appendChild(option);
  }
  const count = options.document.createElement('span');
  count.className = 'lc-small lc-plan-muted';
  count.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}`;
  top.append(select, count);

  const controls = options.document.createElement('div');
  controls.className = 'lc-plan-preview-controls';
  let previewZoom = 1;
  let rotation = 0;
  const zoomRead = options.document.createElement('span');
  zoomRead.className = 'lc-small lc-plan-muted lc-plan-zoom-read';

  const previewWrap = options.document.createElement('div');
  previewWrap.className = 'lc-plan-pdf-preview lc-plan-scroll-preview';
  const preview = options.document.createElement('canvas');
  preview.className = 'lc-plan-pdf-canvas';
  const status = options.document.createElement('div');
  status.className = 'lc-small lc-plan-muted lc-plan-pdf-status';
  previewWrap.append(preview, status);

  modal.body.append(top, controls, previewWrap);

  let renderToken = 0;
  const renderPreview = async (): Promise<void> => {
    const token = ++renderToken;
    status.hidden = false;
    status.textContent = 'Rendering page…';
    zoomRead.textContent = `${Math.round(previewZoom * 100)}% · ${rotation}°`;
    try {
      const pageCanvas = await renderPdfPage(
        options.document,
        pdf,
        Number(select.value),
        Math.round(900 * previewZoom),
        rotation,
      );
      if (token !== renderToken) return;
      preview.width = pageCanvas.width;
      preview.height = pageCanvas.height;
      preview.getContext('2d')?.drawImage(pageCanvas, 0, 0);
      previewWrap.scrollTo?.({ left: 0, top: 0 });
      status.hidden = true;
    } catch (error) {
      console.error(error);
      if (token === renderToken) status.textContent = 'Could not render this page.';
    }
  };

  const zoomOut = createFloorPlanButton(options.document, 'Zoom −', () => {
    previewZoom = Math.max(0.5, previewZoom - 0.25);
    void renderPreview();
  });
  const zoomIn = createFloorPlanButton(options.document, 'Zoom +', () => {
    previewZoom = Math.min(4, previewZoom + 0.25);
    void renderPreview();
  });
  const zoomFit = createFloorPlanButton(options.document, 'Fit', () => {
    previewZoom = 1;
    void renderPreview();
  });
  const rotate = createFloorPlanButton(options.document, 'Rotate 90°', () => {
    rotation = (rotation + 90) % 360;
    void renderPreview();
  });
  controls.append(zoomOut, zoomIn, zoomFit, rotate, zoomRead);

  select.addEventListener('change', () => {
    previewZoom = 1;
    void renderPreview();
  });
  void renderPreview();

  const cancel = createFloorPlanButton(options.document, 'Cancel', () =>
    modal.close(),
  );
  const prepare = createFloorPlanButton(
    options.document,
    'Prepare Page',
    () => {
      void (async () => {
        prepare.disabled = true;
        status.hidden = false;
        status.textContent = 'Preparing full-resolution page…';
        try {
          const pageNumber = Number(select.value);
          const pageCanvas = await renderPdfPage(
            options.document,
            pdf,
            pageNumber,
            3000,
            rotation,
          );
          const dataURL = pageCanvas.toDataURL('image/png');
          modal.close();
          await options.onPrepared(
            dataURL,
            `${options.file.name} · Page ${pageNumber}`,
          );
        } catch (error) {
          console.error(error);
          prepare.disabled = false;
          status.textContent = 'Could not render this page.';
        }
      })();
    },
    true,
  );
  modal.foot.append(cancel, prepare);
}
