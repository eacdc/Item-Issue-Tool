import type { Batch, BatchKey } from '../api';
import { formatDate } from '../lib/format';
import { qtyWithUnit } from '../lib/quantity';
import { sameBatch } from '../lib/lines';

interface Props {
  batches: Batch[];
  unit: string | null;
  selected: BatchKey | null;
  takenFrom: (key: BatchKey) => number;
  onSelect: (batch: Batch) => void;
}

/** Batches oldest GRN first, as the API returns them. A row is one click target. */
export function BatchTable({ batches, unit, selected, takenFrom, onSelect }: Props) {
  if (!batches.length) return <p className="notice notice-warn">No batch of this item has stock.</p>;
  return (
    <div className="table-wrap">
      <table className="dense clickable">
        <thead>
          <tr>
            <th>GRN no.</th>
            <th>GRN date</th>
            <th>Batch no.</th>
            <th>Warehouse</th>
            <th>Bin</th>
            <th className="num">Batch stock</th>
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
                <td>{b.grnNo ?? <span className="muted">opening</span>}</td>
                <td>{formatDate(b.grnDate)}</td>
                <td className="mono">{b.batchKey.batchNo ?? <span className="muted">—</span>}</td>
                <td>{b.warehouseName ?? '—'}</td>
                <td>{b.binName ?? '—'}</td>
                <td className="num strong">{qtyWithUnit(b.batchStock, unit)}</td>
                <td className={`num${taken > b.batchStock ? ' text-warn' : ''}`}>{taken ? qtyWithUnit(taken, unit) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
