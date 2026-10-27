/**
 * Geometry of the printable answer sheet, in millimetres on an A4 page (210 x 297).
 * The print page and the phone scanner both read positions from here, so a sheet
 * printed today is always readable by the scanner. Pure data: safe on client and server.
 */

export const PAGE_W = 210;
export const PAGE_H = 297;

/** Solid black squares in the four corners. The scanner finds these to straighten the photo. */
export const MARKER_SIZE = 10;
export const MARKERS = {
  topLeft: { x: 8, y: 8 },
  topRight: { x: PAGE_W - 8 - MARKER_SIZE, y: 8 },
  bottomLeft: { x: 8, y: PAGE_H - 8 - MARKER_SIZE },
  bottomRight: { x: PAGE_W - 8 - MARKER_SIZE, y: PAGE_H - 8 - MARKER_SIZE },
} as const;

/** Marker centres, in the order the scanner reports corners: TL, TR, BR, BL. */
export function markerCentres(): Array<{ x: number; y: number }> {
  const c = (p: { x: number; y: number }) => ({ x: p.x + MARKER_SIZE / 2, y: p.y + MARKER_SIZE / 2 });
  return [c(MARKERS.topLeft), c(MARKERS.topRight), c(MARKERS.bottomRight), c(MARKERS.bottomLeft)];
}

export const QR_BOX = { x: 150, y: 22, size: 36 };

export const MAX_MCQ = 40;
export const MAX_WRITTEN = 6;
export const OPTION_LETTERS = ["A", "B", "C", "D", "E"] as const;

const MCQ_TOP = 66;
const MCQ_ROW_H = 7.5;
const MCQ_ROWS_PER_BLOCK = 10;
const MCQ_BLOCK_W = 45;
const MCQ_LEFT = 20;
const BUBBLE_GAP = 7;
export const BUBBLE_R = 2.4;

export interface BubblePos {
  question: number; // 1-based
  option: number; // 0-based
  cx: number;
  cy: number;
}

export interface AnswerBox {
  no: number; // written question number, 1-based
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetLayout {
  mcqCount: number;
  optionsPerMcq: number;
  bubbles: BubblePos[];
  /** Where question numbers are printed next to each bubble row. */
  rowLabels: Array<{ question: number; x: number; y: number }>;
  answerBoxes: AnswerBox[];
}

export function buildSheetLayout(mcqCount: number, optionsPerMcq: number, writtenCount: number): SheetLayout {
  const count = Math.max(0, Math.min(MAX_MCQ, Math.floor(mcqCount)));
  const opts = Math.max(2, Math.min(OPTION_LETTERS.length, Math.floor(optionsPerMcq)));
  const written = Math.max(0, Math.min(MAX_WRITTEN, Math.floor(writtenCount)));

  const bubbles: BubblePos[] = [];
  const rowLabels: SheetLayout["rowLabels"] = [];
  for (let q = 1; q <= count; q++) {
    const block = Math.floor((q - 1) / MCQ_ROWS_PER_BLOCK);
    const row = (q - 1) % MCQ_ROWS_PER_BLOCK;
    const blockX = MCQ_LEFT + block * MCQ_BLOCK_W;
    const cy = MCQ_TOP + row * MCQ_ROW_H;
    rowLabels.push({ question: q, x: blockX, y: cy });
    for (let o = 0; o < opts; o++) {
      bubbles.push({ question: q, option: o, cx: blockX + 10 + o * BUBBLE_GAP, cy });
    }
  }

  // Written answer boxes fill the space under the MCQ grid.
  const mcqRows = count === 0 ? 0 : Math.min(count, MCQ_ROWS_PER_BLOCK);
  const boxesTop = count === 0 ? MCQ_TOP - 6 : MCQ_TOP + mcqRows * MCQ_ROW_H + 4;
  const boxesBottom = PAGE_H - 22;
  const answerBoxes: AnswerBox[] = [];
  if (written > 0) {
    const gap = 3;
    const h = (boxesBottom - boxesTop - gap * (written - 1)) / written;
    for (let i = 0; i < written; i++) {
      answerBoxes.push({ no: i + 1, x: 20, y: boxesTop + i * (h + gap), w: PAGE_W - 40, h });
    }
  }

  return { mcqCount: count, optionsPerMcq: opts, bubbles, rowLabels, answerBoxes };
}

/** QR payload printed on every sheet. Short so the code stays easy to read from a phone photo. */
export function sheetQrPayload(testId: string, studentId: string): string {
  return `ILM1|${testId}|${studentId}`;
}

export function parseSheetQr(text: string | null | undefined): { testId: string; studentId: string } | null {
  if (!text) return null;
  const parts = text.trim().split("|");
  if (parts.length !== 3 || parts[0] !== "ILM1" || !parts[1] || !parts[2]) return null;
  return { testId: parts[1], studentId: parts[2] };
}
