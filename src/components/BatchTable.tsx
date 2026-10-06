import type { Batch, BatchKey, Item } from '../api';
import { formatDate } from '../lib/format';
import { formatQty, qtyWithUnit } from '../lib/quantity';
import { sameBatch } from '../lib/lines';

interface Props {
  item: Item;
  batches: Batch[];
  selected: BatchKey | null;
  takenFrom: (key: BatchKey) => number;
  onSelect: (batch: Batch) => void;
}

/**
 * Batches oldest GRN first, as the API returns them, with the ERP issue
 * screen's columns. A row is one click target.
 */
export function BatchTable({ item, batches, selected, takenFrom, onSelect }: Props) {
  if (!batches.length) return <p className="notice notice-warn">No batch of this item has stock.</p>;
  const unit = item.stockUnit;
  return (
    <div className="table-wrap">
      <table className="dense clickable erp-grid">
        <thead>
          <tr>
            <th>Item Group</th>
            <th>Item Code</th>
            <th>Quality</th>
            <th className="num">GSM</th>
            <th className="num">Size W</th>
            <th className="num">Size L</th>
            <th>Manufacturer</th>
            <th>Certification Type</th>
            <th>Stock Unit</th>
            <th className="num">Batch Stock</th>
            <th>GRN No</th>
            <th>GRN Date</th>
            <th>Batch No</th>
            <th>Supplier Batch No</th>
            <th>Warehouse</th>
            <th>Bin</th>
            <th className="num">In this issue</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => {
            const taken = takenFrom(b.batchKey);
            const isSelected = selected !== null && sameBatch(selected, b.batchKey);
            return (
              <tr
                key={`${b.batchKey.parentTransactionId}|${b.batchKey.warehouseId}|${b.batchKey.batchNo ?? ''}`}
                className={isSelected ? 'selected' : undefined}
                onClick={() => onSelect(b)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(b);
                  }
                }}
              >
                <td>{item.itemGroupName}</td>
                <td className="mono">{item.itemCode}</td>
                <td>{item.quality}</td>
                <td className="num">{item.gsm ?? ''}</td>
                <td className="num">{item.sizeW ?? ''}</td>
                <td className="num">{item.sizeL ?? ''}</td>
                <td>{item.manufacturer}</td>
                <td>{item.certification}</td>
                <td>{unit}</td>
                <td className="num strong">{formatQty(b.batchStock)}</td>
                <td>{b.grnNo ?? <span className="muted">opening</span>}</td>
                <td className="nowrap">{formatDate(b.grnDate)}</td>
                <td className="mono">{b.batchKey.batchNo ?? <span className="muted">—</span>}</td>
                <td>{b.supplierBatchNo ?? ''}</td>
                <td>{b.warehouseName ?? '—'}</td>
                <td>{b.binName ?? '—'}</td>
                <td className={`num${taken > b.batchStock ? ' text-warn' : ''}`}>{taken ? qtyWithUnit(taken, unit) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
