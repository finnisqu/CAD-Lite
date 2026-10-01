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
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const unit = page.getViewport({ scale: 1 });
  const scale = Math.min(
    3,
    Math.max(0.1, maxDimension / Math.max(unit.width, unit.height, 1)),
  );
  const viewport = page.getViewport({ scale });
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

  const preview = options.document.createElement('canvas');
  preview.className = 'lc-plan-pdf-preview';
  preview.width = 900;
  preview.height = 600;
  const status = options.document.createElement('div');
  status.className = 'lc-small lc-plan-muted';
  modal.body.append(top, preview, status);

  let renderToken = 0;
  const renderPreview = async (): Promise<void> => {
    const token = ++renderToken;
    status.textContent = 'Rendering page…';
    const pageCanvas = await renderPdfPage(
      options.document,
      pdf,
      Number(select.value),
      1200,
    );
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
  select.addEventListener('change', () => {
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
        status.textContent = 'Preparing full-resolution page…';
        try {
          const pageCanvas = await renderPdfPage(
            options.document,
            pdf,
            Number(select.value),
            3200,
          );
          const dataURL = pageCanvas.toDataURL('image/jpeg', 0.94);
          modal.close();
          await options.onPrepared(dataURL, options.file.name);
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
