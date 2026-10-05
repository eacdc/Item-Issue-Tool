/** Quantities: numeric only, positive, at most 3 decimals. */

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Parse what the user typed. Returns null for anything that is not a plain
 * positive number: blank, zero, negative, letters, "1,500" (ambiguous between
 * thousands and decimals), more than 3 decimals.
 */
export function parseQuantity(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(t) && !/^\.\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? round3(n) : null;
}

/** Keystroke filter for quantity inputs: digits and one dot, nothing else. */
export function sanitizeQuantityInput(text: string): string {
  const cleaned = text.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  return firstDot === -1 ? cleaned : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

const formatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

/** 1500 → "1,500", 68.84 → "68.84". Indian grouping, as the store reads numbers. */
export function formatQty(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return formatter.format(round3(n));
}

/** The quantity with its unit, the only way a quantity should ever be shown. */
export function qtyWithUnit(n: number | null | undefined, unit: string | null | undefined): string {
  return `${formatQty(n)} ${unit ?? ''}`.trim();
}
