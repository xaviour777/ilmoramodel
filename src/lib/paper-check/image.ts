/**
 * Image side of the scanner: find the four corner markers in a phone photo, map sheet
 * millimetres to photo pixels with a homography, and measure how dark each bubble is.
 * Works on plain grayscale arrays (no DOM), so it runs in the browser and in tests.
 */
import { BUBBLE_R, MARKER_SIZE, PAGE_H, PAGE_W, SheetLayout, markerCentres } from "./layout";

export interface GrayImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array; // one byte per pixel, 0 = black
}

export interface Point {
  x: number;
  y: number;
}

/** RGBA (canvas ImageData) to grayscale. */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; p < data.length; i += 4, p++) {
    data[p] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return { width, height, data };
}

/** Otsu threshold: the gray level that best separates ink from paper. */
export function otsuThreshold(img: GrayImage): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < img.data.length; i++) hist[img.data[i]]++;
  const total = img.data.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return best;
}

interface Blob {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  cx: number;
  cy: number;
}

/** Dark connected regions (4-connected), skipping tiny specks. */
function darkBlobs(img: GrayImage, threshold: number, minArea: number): Blob[] {
  const { width, height, data } = img;
  const seen = new Uint8Array(width * height);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < data.length; start++) {
    if (seen[start] || data[start] > threshold) continue;
    let minX = width, minY = height, maxX = 0, maxY = 0, area = 0, sx = 0, sy = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      area++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const n = [p - 1, p + 1, p - width, p + width];
      const ok = [x > 0, x < width - 1, y > 0, y < height - 1];
      for (let k = 0; k < 4; k++) {
        const q = n[k];
        if (ok[k] && !seen[q] && data[q] <= threshold) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (area >= minArea) blobs.push({ minX, minY, maxX, maxY, area, cx: sx / area, cy: sy / area });
  }
  return blobs;
}

/**
 * Finds the four corner markers. Returns them as TL, TR, BR, BL, or null when any is missing.
 * A marker is a solid, roughly square dark blob; for each photo corner we take the nearest one.
 */
export function findCornerMarkers(img: GrayImage): Point[] | null {
  const threshold = Math.min(otsuThreshold(img), 140);
  const imgArea = img.width * img.height;
  // A 10mm marker on a sheet that fills 40-100% of the photo.
  const expected = (MARKER_SIZE / PAGE_W) ** 2 * (PAGE_W / PAGE_H) * imgArea;
  const candidates = darkBlobs(img, threshold, Math.max(9, expected * 0.08)).filter((b) => {
    const w = b.maxX - b.minX + 1;
    const h = b.maxY - b.minY + 1;
    const aspect = w / h;
    const fill = b.area / (w * h);
    return aspect > 0.6 && aspect < 1.6 && fill > 0.7 && b.area < expected * 4;
  });
  if (candidates.length < 4) return null;
  // The markers are the largest solid squares on the sheet; filled bubbles and QR modules are much smaller.
  const largest = Math.max(...candidates.map((b) => b.area));
  const markerLike = candidates.filter((b) => b.area >= largest * 0.4);
  if (markerLike.length < 4) return null;

  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: img.width, y: 0 },
    { x: img.width, y: img.height },
    { x: 0, y: img.height },
  ];
  const used = new Set<Blob>();
  const found: Point[] = [];
  for (const corner of corners) {
    let best: Blob | null = null;
    let bestD = Infinity;
    for (const b of markerLike) {
      if (used.has(b)) continue;
      const d = (b.cx - corner.x) ** 2 + (b.cy - corner.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) return null;
    used.add(best);
    found.push({ x: best.cx, y: best.cy });
  }
  // Sanity check: the four points must form a convex shape at least a third of the photo wide.
  const width = Math.min(found[1].x - found[0].x, found[2].x - found[3].x);
  const height = Math.min(found[3].y - found[0].y, found[2].y - found[1].y);
  if (width < img.width / 3 || height < img.height / 3) return null;
  return found;
}

/** 3x3 homography (row-major, h[8] = 1) mapping src points to dst points. */
export function computeHomography(src: Point[], dst: Point[]): number[] {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(a, b);
  return [...h, 1];
}

function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const div = m[col][col];
    if (Math.abs(div) < 1e-12) throw new Error("Corner markers are in a line; retake the photo");
    for (let c = col; c <= n; c++) m[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row) => row[n]);
}

export function applyHomography(h: number[], p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

/** Homography from sheet millimetres to photo pixels, given the markers found in the photo. */
export function sheetToPhoto(markersInPhoto: Point[]): number[] {
  return computeHomography(markerCentres(), markersInPhoto);
}

function pixel(img: GrayImage, x: number, y: number): number {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= img.width || yi >= img.height) return 255;
  return img.data[yi * img.width + xi];
}

/** Share of dark pixels inside each bubble: fills[q-1][o]. */
export function measureBubbleFills(img: GrayImage, h: number[], layout: SheetLayout, threshold?: number): number[][] {
  const t = threshold ?? Math.min(otsuThreshold(img), 150);
  const fills: number[][] = Array.from({ length: layout.mcqCount }, () => new Array(layout.optionsPerMcq).fill(0));
  const r = BUBBLE_R * 0.7; // stay inside the printed ring
  const steps = 7;
  for (const b of layout.bubbles) {
    let dark = 0;
    let total = 0;
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const dx = ((i / (steps - 1)) * 2 - 1) * r;
        const dy = ((j / (steps - 1)) * 2 - 1) * r;
        if (dx * dx + dy * dy > r * r) continue;
        const p = applyHomography(h, { x: b.cx + dx, y: b.cy + dy });
        total++;
        if (pixel(img, p.x, p.y) <= t) dark++;
      }
    }
    fills[b.question - 1][b.option] = total ? dark / total : 0;
  }
  return fills;
}

/**
 * Straightened crop of a sheet region (in mm), as grayscale. `pxPerMm` sets the output
 * resolution; 6 px/mm keeps handwriting readable and the upload small.
 */
export function cropRegion(img: GrayImage, h: number[], region: { x: number; y: number; w: number; h: number }, pxPerMm = 6): GrayImage {
  const width = Math.max(1, Math.round(region.w * pxPerMm));
  const height = Math.max(1, Math.round(region.h * pxPerMm));
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = applyHomography(h, { x: region.x + x / pxPerMm, y: region.y + y / pxPerMm });
      data[y * width + x] = pixel(img, p.x, p.y);
    }
  }
  return { width, height, data };
}

/** Variance of a simple Laplacian; low values mean a blurry photo. */
export function sharpness(img: GrayImage): number {
  const { width, height, data } = img;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const i = y * width + x;
      const lap = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - width] - data[i + width];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export const BLUR_LIMIT = 40;
