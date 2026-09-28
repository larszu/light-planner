// ── Floor-plan import: load JPG / PNG / PDF into a bitmap ──────────────
//
// The loading itself lives in the shared package `@avplan/floorplan`
// (vendored under `src/avplan/floorplan`, ADR-015 — never edit that copy;
// changes go to av-planner-suite/packages/floorplan). This module keeps
// light's own surface on top of it:
//
//   - the pdf.js worker setup (the package takes pdf.js as a parameter and
//     never imports it, so the worker is still ours to configure),
//   - `LoadedPlan` with a decoded `HTMLImageElement`, which the canvas and
//     the 3D view draw directly,
//   - `renderPdfPage` for page switching in the floor-plan panel.
//
// Behaviour change vs. the old light loader, intended: raster images with a
// long edge over 3000 px are downscaled (JPEG 0.9). A 12-megapixel photo
// otherwise bloated the project file and the browser's recovery copy.

import * as pdfjsLib from 'pdfjs-dist';
import { ladePlanDatei, pdfjsRenderer, type PdfjsModul } from '../avplan/floorplan';

// Vite resolves this to the bundled worker asset in both dev and production
// (and to a same-origin file:// URL inside Electron).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// The package describes only the slice of pdf.js it calls, without importing
// its types. pdf.js' own `render()` wants a `PageViewport` where the slice
// says `unknown` (the renderer passes back exactly the viewport it got from
// `getViewport`), so the structural match needs this one cast.
const pdfRenderer = pdfjsRenderer(pdfjsLib as unknown as PdfjsModul);

/** What is needed to render another page of a loaded PDF. The package
 *  renders from the file's bytes, so the file itself is the handle. */
export interface PdfPlanSource {
  file: File;
}

export interface LoadedPlan {
  src: string;            // PNG / image data-URL
  image: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  kind: 'image' | 'pdf';
  pageCount: number;
  pageIndex: number;
  // Kept around so other pages of a PDF can be rendered.
  pdf?: PdfPlanSource;
}

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be decoded'));
    img.src = src;
  });
}

export async function renderPdfPage(
  pdf: PdfPlanSource,
  pageIndex: number,
): Promise<{ src: string; image: HTMLImageElement; naturalWidth: number; naturalHeight: number }> {
  const plan = await ladePlanDatei(pdf.file, { pdf: pdfRenderer, seite: pageIndex });
  const image = await loadImageEl(plan.src);
  return { src: plan.src, image, naturalWidth: plan.naturalWidth, naturalHeight: plan.naturalHeight };
}

/** Throws `PlanDateiFehler` (from the package) with a `code` the caller can
 *  turn into a message. */
export async function loadFloorPlanFile(file: File): Promise<LoadedPlan> {
  const plan = await ladePlanDatei(file, { pdf: pdfRenderer });
  const image = await loadImageEl(plan.src);
  const isPdf = plan.art === 'pdf';
  return {
    src: plan.src,
    image,
    naturalWidth: plan.naturalWidth,
    naturalHeight: plan.naturalHeight,
    kind: isPdf ? 'pdf' : 'image',
    pageCount: plan.seiten,
    pageIndex: plan.seite,
    pdf: isPdf ? { file } : undefined,
  };
}
