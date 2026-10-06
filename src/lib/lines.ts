/**
 * The batch lines of an issue form. Pure, so the arithmetic that decides what
 * gets issued is unit-tested.
 */

import type { Batch, BatchKey, IssueLineRequest, Item } from '../api/types';
import { round3 } from './quantity';

export interface DraftLine {
  /** Local id for React keys and removal. */
  key: string;
  item: Pick<Item, 'itemId' | 'itemCode' | 'itemName' | 'itemGroupId' | 'stockUnit'> & Partial<Pick<Item, 'itemGroupName' | 'itemSubGroupName' | 'gsm' | 'sizeW' | 'sizeL'>>;
  batch: Batch;
  quantity: number;
  /** Direct issue: the process and machine chosen when the line was added. */
  process?: LineProcess;
}

export interface LineProcess {
  processId: number | null;
  processName: string | null;
  machineId: number | null;
  machineName: string | null;
}

const sameProcess = (a?: LineProcess, b?: LineProcess) =>
  (a?.processId ?? null) === (b?.processId ?? null) && (a?.machineId ?? null) === (b?.machineId ?? null);

export function sameBatch(a: BatchKey, b: BatchKey): boolean {
  return a.parentTransactionId === b.parentTransactionId && a.warehouseId === b.warehouseId && (a.batchNo ?? '') === (b.batchNo ?? '');
}

export function unitKey(unit: string | null | undefined): string {
  return (unit ?? '').trim().toUpperCase();
}

/** Total of the lines in one stock unit (and, optionally, one item group). Never mixes units. */
export function totalFor(lines: DraftLine[], stockUnit: string | null, itemGroupId?: number): number {
  return round3(lines
    .filter((l) => unitKey(l.item.stockUnit) === unitKey(stockUnit) && (itemGroupId === undefined || l.item.itemGroupId === itemGroupId))
    .reduce((sum, l) => sum + l.quantity, 0));
}

/** Totals per stock unit, for a form that may hold Kg and Sheet lines at once. */
export function totalsByUnit(lines: { item: { stockUnit: string | null }; quantity: number }[]): { stockUnit: string | null; total: number }[] {
  const map = new Map<string, { stockUnit: string | null; total: number }>();
  for (const l of lines) {
    const k = unitKey(l.item.stockUnit);
    const e = map.get(k) ?? { stockUnit: l.item.stockUnit, total: 0 };
    e.total = round3(e.total + l.quantity);
    map.set(k, e);
  }
  return [...map.values()];
}

/** What is left to issue, never below zero: the prefill for the next batch. */
export function remaining(pending: number, alreadyAdded: number): number {
  return Math.max(0, round3(pending - alreadyAdded));
}

/** How much of a batch the form's lines already take. */
export function takenFromBatch(lines: DraftLine[], itemId: number, key: BatchKey): number {
  return round3(lines.filter((l) => l.item.itemId === itemId && sameBatch(l.batch.batchKey, key)).reduce((s, l) => s + l.quantity, 0));
}

let counter = 0;

/**
 * Add a line. A second quantity from the same batch (for the same process
 * and machine) is merged into the existing line rather than creating a
 * duplicate, so the voucher keeps one line per batch as the ERP does.
 */
export function addLine(lines: DraftLine[], item: DraftLine['item'], batch: Batch, quantity: number, process?: LineProcess): DraftLine[] {
  const existing = lines.find((l) => l.item.itemId === item.itemId && sameBatch(l.batch.batchKey, batch.batchKey) && sameProcess(l.process, process));
  if (existing) {
    return lines.map((l) => (l === existing ? { ...l, batch, quantity: round3(l.quantity + quantity) } : l));
  }
  counter += 1;
  return [...lines, { key: `line-${counter}`, item, batch, quantity: round3(quantity), ...(process ? { process } : {}) }];
}

export function removeLine(lines: DraftLine[], key: string): DraftLine[] {
  return lines.filter((l) => l.key !== key);
}

/** Lines whose quantity is more than their batch now holds, after a stock reload. */
export function linesOverBatch(lines: DraftLine[], current: Map<number, Batch[]>): DraftLine[] {
  return lines.filter((l) => {
    const batches = current.get(l.item.itemId);
    if (!batches) return false;
    const now = batches.find((b) => sameBatch(b.batchKey, l.batch.batchKey));
    return takenFromBatch(lines, l.item.itemId, l.batch.batchKey) > (now?.batchStock ?? 0);
  });
}

export function toRequestLines(lines: DraftLine[]): IssueLineRequest[] {
  return lines.map((l) => ({
    itemId: l.item.itemId,
    parentTransactionId: l.batch.batchKey.parentTransactionId,
    warehouseId: l.batch.batchKey.warehouseId,
    batchNo: l.batch.batchKey.batchNo,
    quantity: l.quantity,
    ...(l.process ? { processId: l.process.processId, machineId: l.process.machineId } : {}),
  }));
}
