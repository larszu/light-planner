// ── Floor-plan import: load JPG / PNG / PDF into a bitmap ──────────────
//
// Images are read straight into an <img>. PDFs are rendered to a canvas with
// pdf.js and turned into a PNG data-URL so the rest of the app only ever deals
// with a single bitmap, regardless of the original file type.

import * as pdfjsLib from 'pdfjs-dist';

// Vite resolves this to the bundled worker asset in both dev and production
// (and to a same-origin file:// URL inside Electron).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export interface LoadedPlan {
  src: string;            // PNG / image data-URL
  image: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  kind: 'image' | 'pdf';
  pageCount: number;
  pageIndex: number;
  // Kept around so other pages of a PDF can be rendered without re-parsing.
  pdf?: pdfjsLib.PDFDocumentProxy;
}

// Render a PDF at a target resolution that stays crisp when zoomed in but does
// not explode memory. We aim for ~2000 px on the long edge.
const PDF_TARGET_LONG_EDGE = 2000;

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.src = src;
  });
}

export async function renderPdfPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageIndex: number,
): Promise<{ src: string; image: HTMLImageElement; naturalWidth: number; naturalHeight: number }> {
  const page = await pdf.getPage(pageIndex + 1); // pdf.js pages are 1-based
  const base = page.getViewport({ scale: 1 });
  const longEdge = Math.max(base.width, base.height);
  const scale = PDF_TARGET_LONG_EDGE / longEdge;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d')!;
  // White backing so transparent PDFs are legible on the dark canvas.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const src = canvas.toDataURL('image/png');
  const image = await loadImageEl(src);
  return { src, image, naturalWidth: canvas.width, naturalHeight: canvas.height };
}

export async function loadFloorPlanFile(file: File): Promise<LoadedPlan> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const rendered = await renderPdfPage(pdf, 0);
    return {
      ...rendered,
      kind: 'pdf',
      pageCount: pdf.numPages,
      pageIndex: 0,
      pdf,
    };
  }

  // Raster image (JPG / PNG / etc.)
  const src: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
  const image = await loadImageEl(src);
  return {
    src,
    image,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    kind: 'image',
    pageCount: 1,
    pageIndex: 0,
  };
}
