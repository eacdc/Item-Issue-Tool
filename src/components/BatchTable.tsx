import { useMemo } from 'react';
import type { Batch, BatchKey, Item } from '../api';
import { DataGrid, type Column } from './DataGrid';
import { dateColumn, itemColumns, qtyColumn, textColumn } from './columns';
import { qtyWithUnit } from '../lib/quantity';
import { sameBatch } from '../lib/lines';

interface Props {
  item: Item;
  batches: Batch[];
  selected: BatchKey | null;
  takenFrom: (key: BatchKey) => number;
  onSelect: (batch: Batch) => void;
  /** Direct issue: the ERP direct screen's "Stock Batch Wise" columns. */
  direct?: boolean;
}

const batchKeyString = (b: Batch) => `${b.batchKey.parentTransactionId}|${b.batchKey.warehouseId}|${b.batchKey.batchNo ?? ''}`;

/**
 * Batches oldest GRN first, as the API returns them, with the ERP issue
 * screen's columns. A row is one click target.
 */
export function BatchTable({ item, batches, selected, takenFrom, onSelect, direct }: Props) {
  const columns = useMemo<Column<Batch>[]>(() => direct ? [
    ...itemColumns<Batch>(() => item, ['code', 'group']),
    textColumn<Batch>('subGroup', 'Sub Group', () => item.itemSubGroupName ?? null, { width: 6 }),
    ...itemColumns<Batch>(() => item, ['name', 'unit'], { unit: 'Unit' }),
    qtyColumn<Batch>('batchStock', 'Batch Stock', (b) => b.batchStock, () => item, { className: 'strong' }),
    textColumn<Batch>('batchNo', 'Batch No', (b) => b.batchKey.batchNo, { className: 'mono', width: 12 }),
    textColumn<Batch>('supplierBatchNo', 'Supplier Batch No', (b) => b.supplierBatchNo),
    textColumn<Batch>('warehouse', 'Warehouse', (b) => b.warehouseName),
    textColumn<Batch>('bin', 'Bin', (b) => b.binName),
    qtyColumn<Batch>('taken', 'In this issue', (b) => takenFrom(b.batchKey), () => item, {
      render: (b) => {
        const taken = takenFrom(b.batchKey);
        return taken ? <span className={taken > b.batchStock ? 'text-warn' : undefined}>{qtyWithUnit(taken, item.stockUnit)}</span> : '';
      },
    }),
  ] : [
    ...itemColumns<Batch>(() => item, ['group', 'code', 'quality', 'gsm', 'sizeW', 'sizeL', 'manufacturer', 'certification', 'unit'], {
      sizeW: 'Size W', sizeL: 'Size L', certification: 'Certification Type',
    }),
    qtyColumn<Batch>('batchStock', 'Batch Stock', (b) => b.batchStock, () => item, { className: 'strong' }),
    textColumn<Batch>('grnNo', 'GRN No', (b) => b.grnNo, { render: (b) => b.grnNo ?? <span className="muted">opening</span> }),
    dateColumn<Batch>('grnDate', 'GRN Date', (b) => b.grnDate),
    textColumn<Batch>('batchNo', 'Batch No', (b) => b.batchKey.batchNo, { className: 'mono' }),
    textColumn<Batch>('supplierBatchNo', 'Supplier Batch No', (b) => b.supplierBatchNo),
    textColumn<Batch>('warehouse', 'Warehouse', (b) => b.warehouseName),
    textColumn<Batch>('bin', 'Bin', (b) => b.binName),
    qtyColumn<Batch>('taken', 'In this issue', (b) => takenFrom(b.batchKey), () => item, {
      render: (b) => {
        const taken = takenFrom(b.batchKey);
        return taken ? <span className={taken > b.batchStock ? 'text-warn' : undefined}>{qtyWithUnit(taken, item.stockUnit)}</span> : '';
      },
    }),
  ], [item, takenFrom, direct]);

  if (!batches.length) return <p className="notice notice-warn">No batch of this item has stock.</p>;
  return (
    <DataGrid
      rows={batches}
      columns={columns}
      rowKey={batchKeyString}
      onRowClick={onSelect}
      rowClassName={(b) => (selected !== null && sameBatch(selected, b.batchKey) ? 'selected' : undefined)}
      noun="batch"
    />
  );
}
