/**
 * The pure parts of the data grid: column filters and quantity summaries.
 * Kept out of the component so they are unit-tested.
 */

import { round3 } from './quantity';

export type ColumnType = 'text' | 'number' | 'date' | 'qty';

export type DateOp = 'on' | 'from' | 'until';

/**
 * Number filters are one box: `5`, `>1000`, `>=5`, `<10`, `<=10`, `<>0`
 * (not equal) or a range `100-200`.
 */
export type FilterValue =
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: string }
  | { kind: 'date'; op: DateOp; value: string };

export const NUMBER_FILTER_HELP = 'Type 5, >1000, >=5, <10, <=10, <>0 (not equal) or a range 100-200';

type NumberTest = { op: '=' | '<>' | '>' | '>=' | '<' | '<='; n: number } | { op: 'range'; lo: number; hi: number };

/** Parse a number filter, or null while it is incomplete ("<", "100-"). */
export function parseNumberFilter(text: string): NumberTest | null {
  const t = text.replace(/[,\s]/g, '').replace('≥', '>=').replace('≤', '<=').replace('≠', '<>').replace('!=', '<>');
  const range = /^(-?\d*\.?\d+)-(-?\d*\.?\d+)$/.exec(t);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return { op: 'range', lo: Math.min(a, b), hi: Math.max(a, b) };
  }
  const m = /^(<>|>=|<=|=|>|<)?(-?\d*\.?\d+)$/.exec(t);
  if (!m) return null;
  return { op: (m[1] as '=' | '<>' | '>' | '>=' | '<' | '<=' | undefined) ?? '=', n: Number(m[2]) };
}

export const DATE_OPS: { op: DateOp; label: string }[] = [
  { op: 'on', label: 'on' },
  { op: 'from', label: 'from' },
  { op: 'until', label: 'until' },
];

/** An empty filter for a column of this type. */
export function emptyFilter(type: ColumnType): FilterValue {
  if (type === 'number' || type === 'qty') return { kind: 'number', value: '' };
  if (type === 'date') return { kind: 'date', op: 'on', value: '' };
  return { kind: 'text', text: '' };
}

export function isActive(f: FilterValue | undefined): boolean {
  if (!f) return false;
  return f.kind === 'text' ? f.text.trim() !== '' : f.value.trim() !== '';
}

/**
 * Does a cell value pass the filter? Text: contains, ignoring case. Number:
 * compared with the operator (3-decimal tolerance). Date: an ISO date
 * ('2026-10-06', or a date-time) on, from or until the chosen day.
 */
export function matches(value: string | number | null | undefined, f: FilterValue): boolean {
  if (!isActive(f)) return true;
  if (f.kind === 'text') {
    return String(value ?? '').toLowerCase().includes(f.text.trim().toLowerCase());
  }
  if (f.kind === 'number') {
    const test = parseNumberFilter(f.value);
    if (!test) return true;
    const n = typeof value === 'number' ? value : Number(value);
    if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return false;
    const near = (a: number, b: number) => Math.abs(a - b) < 0.0005;
    if (test.op === 'range') return (n > test.lo || near(n, test.lo)) && (n < test.hi || near(n, test.hi));
    const eq = near(n, test.n);
    switch (test.op) {
      case '=': return eq;
      case '<>': return !eq;
      case '>': return n > test.n && !eq;
      case '>=': return n > test.n || eq;
      case '<': return n < test.n && !eq;
      case '<=': return n < test.n || eq;
    }
  }
  const day = String(value ?? '').slice(0, 10);
  if (!day) return false;
  if (f.op === 'on') return day === f.value;
  if (f.op === 'from') return day >= f.value;
  return day <= f.value;
}

/** Ascending comparison for sorting; nulls last. */
export function compareValues(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const aNull = a === null || a === undefined || a === '';
  const bNull = b === null || b === undefined || b === '';
  if (aNull || bNull) return aNull === bNull ? 0 : aNull ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

// ── quantity summaries ──────────────────────────────────────────────────────

/** A quantity in its stock unit, with what is needed to weigh a sheet. */
export interface QtyValue {
  value: number;
  unit: string | null;
  gsm?: number | null;
  /** Sheet width and length in mm, as on the item master. */
  sizeW?: number | null;
  sizeL?: number | null;
}

type UnitClass = 'KG' | 'SHEET' | 'NOS' | 'OTHER';

function classify(unit: string | null): { cls: UnitClass; key: string } {
  const key = (unit ?? '').trim().toUpperCase().replace(/\.$/, '');
  if (['KG', 'KGS', 'KILOGRAM', 'KILOGRAMS'].includes(key)) return { cls: 'KG', key: 'KG' };
  if (['SHEET', 'SHEETS', 'SHT', 'SHTS'].includes(key)) return { cls: 'SHEET', key: 'SHEET' };
  if (['NOS', 'NO', 'NUMBERS', 'NUMBER', 'PCS', 'PC'].includes(key)) return { cls: key === 'PCS' || key === 'PC' ? 'OTHER' : 'NOS', key };
  return { cls: 'OTHER', key: key || '(NO UNIT)' };
}

/** Kg per sheet: GSM × width × length (mm), or null when the item lacks one of them. */
export function kgPerSheet(gsm?: number | null, sizeW?: number | null, sizeL?: number | null): number | null {
  if (!gsm || !sizeW || !sizeL || gsm <= 0 || sizeW <= 0 || sizeL <= 0) return null;
  return (gsm * sizeW * sizeL) / 1e9;
}

export interface QtySummary {
  /** Kg, including sheets converted to Kg. */
  kg: number;
  /** How many sheets went into `kg`, and what they weigh. */
  sheets: number;
  sheetKg: number;
  /** Every other unit on its own: Nos first, then the rest; plus sheets that could not be weighed. */
  others: { unit: string; total: number }[];
}

/**
 * Totals for a quantity column: Kg and Sheet together as Kg (sheets weighed
 * from GSM and size), Nos separately, every other unit separately. Spellings
 * of the same unit (KG / Kg, NOS / Nos) are merged.
 */
export function summarizeQty(values: QtyValue[]): QtySummary {
  let kg = 0;
  let sheets = 0;
  let sheetKg = 0;
  const others = new Map<string, { unit: string; total: number; order: number }>();
  const addOther = (key: string, label: string, n: number, order: number) => {
    const e = others.get(key) ?? { unit: label, total: 0, order };
    e.total += n;
    others.set(key, e);
  };

  for (const v of values) {
    if (!Number.isFinite(v.value) || v.value === 0) continue;
    const { cls, key } = classify(v.unit);
    if (cls === 'KG') {
      kg += v.value;
    } else if (cls === 'SHEET') {
      const perSheet = kgPerSheet(v.gsm, v.sizeW, v.sizeL);
      if (perSheet === null) {
        addOther('SHEET', 'Sheet (not weighed)', v.value, 2);
      } else {
        sheets += v.value;
        sheetKg += v.value * perSheet;
        kg += v.value * perSheet;
      }
    } else if (cls === 'NOS') {
      addOther('NOS', 'Nos', v.value, 0);
    } else {
      addOther(key, (v.unit ?? '').trim() || '(no unit)', v.value, 1);
    }
  }

  return {
    kg: round3(kg),
    sheets: round3(sheets),
    sheetKg: round3(sheetKg),
    others: [...others.values()]
      .sort((a, b) => a.order - b.order || a.unit.localeCompare(b.unit))
      .map((e) => ({ unit: e.unit, total: round3(e.total) })),
  };
}
