/**
 * Item Issue Slip PDF for the mock API, drawn exactly like the server's
 * (CDC-Site src/issue-tool/slip-pdf.js) so mock mode shows the real layout.
 * Keep the two in step. The live app downloads the server's PDF.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';

export interface SlipLine {
  itemCode: string | null;
  itemName: string | null;
  unit: string | null;
  quantity: number;
  batchNo: string | null;
  warehouse: string | null;
  grnNo: string | null;
  bin: string | null;
}

export interface SlipData {
  voucherNo: string | null;
  voucherDate: string | null;
  deleted: boolean;
  departmentName: string | null;
  jobCardNo: string | null;
  jobName: string | null;
  clientName: string | null;
  narration: string | null;
  /** The user who made the issue, printed under "Issued By". */
  issuedBy: string | null;
  lines: SlipLine[];
}

type Fonts = { regular: PDFFont; bold: PDFFont };
type Ctx = { fonts: Fonts; logo: PDFImage | null; slip: SlipData };
type Cells = string[][];

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 28;
const CONTENT_W = PAGE_W - MARGIN * 2;
const PAD = 8;
const TABLE_W = CONTENT_W - PAD * 2;
const HALF_GAP = 10;

const BLACK = rgb(0, 0, 0);
const GREY_HEAD = rgb(0.35, 0.35, 0.35);
const WHITE = rgb(1, 1, 1);
const RED = rgb(0.75, 0.1, 0.1);

type Key = 'itemCode' | 'itemName' | 'unit' | 'quantity' | 'batchNo' | 'warehouse' | 'grnNo' | 'bin';
const COLUMNS: { key: Key; label: string; w: number; align?: 'right' }[] = [
  { key: 'itemCode', label: 'Item Code', w: 52 },
  { key: 'itemName', label: 'ItemName', w: 100 },
  { key: 'unit', label: 'Unit', w: 34 },
  { key: 'quantity', label: 'Quantity', w: 48, align: 'right' },
  { key: 'batchNo', label: 'Batch No', w: 82 },
  { key: 'warehouse', label: 'Warehouse', w: 62 },
  { key: 'grnNo', label: 'GRN No.', w: 80 },
  { key: 'bin', label: 'Bin', w: 52 },
];
const SCALE = TABLE_W / COLUMNS.reduce((s, c) => s + c.w, 0);
const COLS = COLUMNS.map((c) => ({ ...c, w: c.w * SCALE }));

const CELL_SIZE = 8;
const CELL_LINE = 9.5;
const HEAD_H = 18;
const RIGHT_LABEL_X = MARGIN + CONTENT_W * 0.6;
const RIGHT_VALUE_X = RIGHT_LABEL_X + 64;
const RIGHT_VALUE_W = MARGIN + CONTENT_W - PAD - RIGHT_VALUE_X;

/** Helvetica is WinAnsi: anything else would throw, so it becomes "?". */
export function safe(text: unknown): string {
  return String(text ?? '').replace(/[^\x20-\x7E\xA0-\xFF–—‘’“”•]/g, '?');
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d}-${months[Number(m) - 1] ?? m}-${y}`;
}

function formatQty(n: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(n ?? 0);
}

/** Words to lines within a width; a word longer than the width (a batch no.) is broken by characters. */
export function wrap(text: unknown, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      line = '';
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

function cellText(line: SlipLine, key: Key): string {
  return key === 'quantity' ? formatQty(line.quantity) : String(line[key] ?? '');
}

function rowHeight(cells: Cells): number {
  return Math.max(...cells.map((l) => l.length)) * CELL_LINE + 6;
}

/** "2,958", or "1,500 Sheet + 2 Kg" when the slip mixes units. */
export function totalText(lines: Pick<SlipLine, 'unit' | 'quantity'>[]): string {
  const byUnit = new Map<string, { unit: string; total: number }>();
  for (const l of lines) {
    const key = String(l.unit ?? '').trim().toUpperCase();
    const e = byUnit.get(key) ?? { unit: l.unit ?? '', total: 0 };
    e.total += l.quantity;
    byUnit.set(key, e);
  }
  const totals = [...byUnit.values()];
  if (totals.length <= 1) return formatQty(totals[0]?.total ?? 0);
  return totals.map((t) => `${formatQty(t.total)} ${t.unit}`.trim()).join(' + ');
}

function drawTop(page: PDFPage, ctx: Ctx, topY: number): number {
  const { fonts, logo, slip } = ctx;
  const logoW = 52;
  if (logo) {
    const h = (logo.height / logo.width) * logoW;
    page.drawImage(logo, { x: MARGIN, y: topY - h - 4, width: logoW, height: h });
  }
  const x = MARGIN + logoW + 18;
  const valueX = x + 62;
  page.drawText('CDC Printers (P) Ltd.', { x, y: topY - 12, size: 12, font: fonts.bold, color: BLACK });
  page.drawText('Regd Off -', { x, y: topY - 26, size: 9, font: fonts.bold });
  page.drawText('Tangra Industrial Estate - II ,45. Radhanath Chowdhury Road', { x: x + 48, y: topY - 26, size: 9, font: fonts.regular });
  page.drawText('Kolkata - 700015, India', { x: valueX + 30, y: topY - 37, size: 9, font: fonts.regular });
  page.drawText('Unit II -', { x, y: topY - 54, size: 9, font: fonts.bold });
  page.drawText('Village - Kulai, P.O.: Bikihakola, P.S.: Panchla, Dist: Howrah,', { x: valueX, y: topY - 54, size: 9, font: fonts.regular });
  page.drawText('Pin: 711322 , India', { x: valueX + 4, y: topY - 65, size: 9, font: fonts.regular });

  const boxTop = topY - 74;
  const title = 'Item Issue Slip';
  const titleW = fonts.bold.widthOfTextAtSize(title, 11);
  page.drawText(title, { x: MARGIN + (CONTENT_W - titleW) / 2, y: boxTop - 14, size: 11, font: fonts.bold });
  if (slip.deleted) {
    page.drawText('DELETED', { x: MARGIN + (CONTENT_W + titleW) / 2 + 12, y: boxTop - 14, size: 11, font: fonts.bold, color: RED });
  }
  page.drawLine({ start: { x: MARGIN, y: boxTop - 20 }, end: { x: MARGIN + CONTENT_W, y: boxTop - 20 }, thickness: 0.8 });

  const leftLabelX = MARGIN + PAD + 4;
  const leftValueX = leftLabelX + 92;
  const rowY = (i: number) => boxTop - 34 - i * 14;
  const field = (label: string, value: string | null, lx: number, vx: number, y: number, bold = false) => {
    page.drawText(label, { x: lx, y, size: 8.5, font: fonts.bold });
    page.drawText(safe(value), { x: vx, y, size: 8.5, font: bold ? fonts.bold : fonts.regular });
  };
  field('Job Card No:', slip.jobCardNo, leftLabelX, leftValueX, rowY(0), true);
  field('Department Name:', slip.departmentName, leftLabelX, leftValueX, rowY(1));
  field('Client Name:', slip.clientName, leftLabelX, leftValueX, rowY(2));
  field('Issue No:', slip.voucherNo, RIGHT_LABEL_X, RIGHT_VALUE_X, rowY(0));
  field('Issue Date:', formatDate(slip.voucherDate), RIGHT_LABEL_X, RIGHT_VALUE_X, rowY(1));

  page.drawText('Job Name :', { x: RIGHT_LABEL_X, y: rowY(2), size: 8.5, font: fonts.bold });
  const jobLines = wrap(slip.jobName, fonts.regular, 8.5, RIGHT_VALUE_W);
  jobLines.forEach((l, i) => page.drawText(l, { x: RIGHT_VALUE_X, y: rowY(2) - i * 10.5, size: 8.5, font: fonts.regular }));
  return rowY(2) - (jobLines.length - 1) * 10.5 - 12;
}

function drawTableHeader(page: PDFPage, fonts: Fonts, y: number): number {
  let x = MARGIN + PAD;
  page.drawRectangle({ x, y: y - HEAD_H, width: TABLE_W, height: HEAD_H, color: GREY_HEAD, borderColor: BLACK, borderWidth: 0.6 });
  for (const c of COLS) {
    const w = fonts.bold.widthOfTextAtSize(c.label, 8.5);
    page.drawText(c.label, { x: x + (c.w - w) / 2, y: y - 12, size: 8.5, font: fonts.bold, color: WHITE });
    if (x > MARGIN + PAD) page.drawLine({ start: { x, y }, end: { x, y: y - HEAD_H }, thickness: 0.6, color: WHITE });
    x += c.w;
  }
  return y - HEAD_H;
}

function drawRow(page: PDFPage, fonts: Fonts, y: number, cells: Cells): number {
  const h = rowHeight(cells);
  let x = MARGIN + PAD;
  page.drawRectangle({ x, y: y - h, width: TABLE_W, height: h, borderColor: BLACK, borderWidth: 0.6 });
  COLS.forEach((c, i) => {
    if (i > 0) page.drawLine({ start: { x, y }, end: { x, y: y - h }, thickness: 0.6 });
    (cells[i] ?? []).forEach((text, k) => {
      const w = fonts.regular.widthOfTextAtSize(text, CELL_SIZE);
      const tx = c.align === 'right' ? x + c.w - 4 - w : x + (c.w - w) / 2;
      page.drawText(text, { x: tx, y: y - 10 - k * CELL_LINE, size: CELL_SIZE, font: fonts.regular });
    });
    x += c.w;
  });
  return y - h;
}

function drawBottom(page: PDFPage, ctx: Ctx, y: number): number {
  const { fonts, slip } = ctx;
  const qtyCol = COLS.findIndex((c) => c.key === 'quantity');
  const qtyX = MARGIN + PAD + COLS.slice(0, qtyCol).reduce((s, c) => s + c.w, 0);
  const label = 'Total :';
  page.drawText(label, { x: qtyX - 6 - fonts.bold.widthOfTextAtSize(label, 8.5), y: y - 12, size: 8.5, font: fonts.bold });
  const total = safe(totalText(slip.lines));
  const totalW = fonts.bold.widthOfTextAtSize(total, 8.5);
  const qtyW = COLS[qtyCol]?.w ?? 0;
  const totalX = totalW <= qtyW - 4 ? qtyX + qtyW - 4 - totalW : qtyX + 2;
  page.drawText(total, { x: totalX, y: y - 12, size: 8.5, font: fonts.bold });

  let cy = y - 22;
  page.drawLine({ start: { x: MARGIN, y: cy }, end: { x: MARGIN + CONTENT_W, y: cy }, thickness: 0.8 });
  page.drawText('Narration', { x: MARGIN + PAD + 4, y: cy - 13, size: 8.5, font: fonts.bold });
  const narr = wrap(slip.narration, fonts.regular, 8.5, CONTENT_W - 80);
  narr.forEach((l, i) => page.drawText(l, { x: MARGIN + 70, y: cy - 13 - i * 10.5, size: 8.5, font: fonts.regular }));
  cy = cy - 13 - Math.max(1, narr.length) * 10.5 - 14;

  page.drawText('Checked By', { x: MARGIN + PAD + 4, y: cy, size: 8.5, font: fonts.bold });
  const rec = 'Received By';
  page.drawText(rec, { x: MARGIN + (CONTENT_W - fonts.bold.widthOfTextAtSize(rec, 8.5)) / 2, y: cy, size: 8.5, font: fonts.bold });
  const iss = 'Issued By';
  page.drawText(iss, { x: MARGIN + CONTENT_W - PAD - 4 - fonts.bold.widthOfTextAtSize(iss, 8.5), y: cy, size: 8.5, font: fonts.bold });
  const issuer = safe(slip.issuedBy ?? '');
  if (issuer) {
    const nameW = fonts.regular.widthOfTextAtSize(issuer, 8.5);
    page.drawText(issuer, { x: MARGIN + CONTENT_W - PAD - 4 - nameW, y: cy - 11, size: 8.5, font: fonts.regular });
  }
  return cy - 21;
}

function boxOutline(page: PDFPage, top: number, bottom: number) {
  page.drawRectangle({ x: MARGIN, y: bottom, width: CONTENT_W, height: top - bottom, borderColor: BLACK, borderWidth: 0.8 });
}

function copyHeight(ctx: Ctx, rows: Cells[]): number {
  const { fonts, slip } = ctx;
  const jobExtra = (wrap(slip.jobName, fonts.regular, 8.5, RIGHT_VALUE_W).length - 1) * 10.5;
  const narrLines = Math.max(1, wrap(slip.narration, fonts.regular, 8.5, CONTENT_W - 80).length);
  const tableH = HEAD_H + rows.reduce((s, r) => s + rowHeight(r), 0);
  return 74 + 74 + jobExtra + 12 + tableH + 22 + 13 + narrLines * 10.5 + 14 + 29;
}

function drawCopy(page: PDFPage, ctx: Ctx, rows: Cells[], topY: number) {
  let y = drawTableHeader(page, ctx.fonts, drawTop(page, ctx, topY));
  for (const r of rows) y = drawRow(page, ctx.fonts, y, r);
  boxOutline(page, topY - 74, drawBottom(page, ctx, y));
}

function drawCopyPaged(pdfDoc: PDFDocument, ctx: Ctx, rows: Cells[]) {
  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const topY = PAGE_H - MARGIN;
  let boxTop = topY - 74;
  let y = drawTableHeader(page, ctx.fonts, drawTop(page, ctx, topY));
  for (const r of rows) {
    if (y - rowHeight(r) < MARGIN + 10) {
      boxOutline(page, boxTop, y - 6);
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      boxTop = PAGE_H - MARGIN;
      page.drawText(safe(`${ctx.slip.voucherNo ?? ''} (continued)`), { x: MARGIN + PAD, y: boxTop - 14, size: 9, font: ctx.fonts.bold });
      y = drawTableHeader(page, ctx.fonts, boxTop - 22);
    }
    y = drawRow(page, ctx.fonts, y, r);
  }
  if (y - 100 < MARGIN) {
    boxOutline(page, boxTop, y - 6);
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    boxTop = PAGE_H - MARGIN;
    y = boxTop - 4;
  }
  boxOutline(page, boxTop, drawBottom(page, ctx, y));
}

function drawCutLine(page: PDFPage, y: number) {
  page.drawLine({ start: { x: MARGIN + 26, y }, end: { x: PAGE_W - MARGIN - 26, y }, thickness: 0.8, dashArray: [6, 4] });
  for (const [cx, dir] of [[MARGIN + 10, 1], [PAGE_W - MARGIN - 10, -1]] as const) {
    page.drawCircle({ x: cx - dir * 6, y: y + 4, size: 3, borderColor: BLACK, borderWidth: 0.9 });
    page.drawCircle({ x: cx - dir * 6, y: y - 4, size: 3, borderColor: BLACK, borderWidth: 0.9 });
    page.drawLine({ start: { x: cx - dir * 3.5, y: y + 2.5 }, end: { x: cx + dir * 12, y: y - 3 }, thickness: 1 });
    page.drawLine({ start: { x: cx - dir * 3.5, y: y - 2.5 }, end: { x: cx + dir * 12, y: y + 3 }, thickness: 1 });
  }
}

/** logoJpeg: the CDC logo's bytes, or null to leave it out. */
export async function issueSlipPdf(slip: SlipData, logoJpeg: Uint8Array | ArrayBuffer | null): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Item Issue Slip ${slip.voucherNo ?? ''}`.trim());
  const fonts: Fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
  let logo: PDFImage | null = null;
  if (logoJpeg) {
    try {
      logo = await pdfDoc.embedJpg(logoJpeg);
    } catch {
      logo = null;
    }
  }
  const ctx: Ctx = { fonts, logo, slip };
  const rows = slip.lines.map((l) => COLS.map((c) => wrap(cellText(l, c.key), fonts.regular, CELL_SIZE, c.w - 6)));

  if (copyHeight(ctx, rows) <= PAGE_H / 2 - MARGIN - HALF_GAP) {
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    drawCopy(page, ctx, rows, PAGE_H - MARGIN);
    drawCutLine(page, PAGE_H / 2);
    drawCopy(page, ctx, rows, PAGE_H / 2 - HALF_GAP);
  } else {
    drawCopyPaged(pdfDoc, ctx, rows);
    drawCopyPaged(pdfDoc, ctx, rows);
  }
  return pdfDoc.save();
}
