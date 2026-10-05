import { api, type Batch } from '../api';
import { linesOverBatch, type DraftLine } from './lines';
import { qtyWithUnit } from './quantity';

/**
 * Reload batch stock for every item in the form right before the confirmation
 * dialog, and describe any line that now takes more than its batch holds.
 * The server re-checks at save time and warns anyway; this tells the user
 * before they press Confirm.
 */
export async function reloadStockAndCheck(lines: DraftLine[], reloadShown: () => Promise<unknown>): Promise<string | null> {
  const itemIds = [...new Set(lines.map((l) => l.item.itemId))];
  const [, ...results] = await Promise.all([reloadShown(), ...itemIds.map((id) => api.batches(id))]);
  const current = new Map<number, Batch[]>(results.map((r) => [r.item.itemId, r.batches]));
  const over = linesOverBatch(lines, current);
  if (!over.length) return null;
  const list = over
    .map((l) => {
      const now = current.get(l.item.itemId)?.find((b) => b.batchKey.parentTransactionId === l.batch.batchKey.parentTransactionId
        && b.batchKey.warehouseId === l.batch.batchKey.warehouseId && (b.batchKey.batchNo ?? '') === (l.batch.batchKey.batchNo ?? ''));
      return `${l.batch.batchKey.batchNo ?? '(no batch no.)'} now holds ${qtyWithUnit(now?.batchStock ?? 0, l.item.stockUnit)}`;
    })
    .join('; ');
  return `Stock was reloaded just now and has changed: ${list}. Saving will drive the batch negative.`;
}
