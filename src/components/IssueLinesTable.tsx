import { useMemo } from 'react';
import type { DraftLine } from '../lib/lines';
import { DataGrid, type Column } from './DataGrid';
import { dateColumn, itemColumns, qtyColumn, textColumn } from './columns';

/** The job (and picklist) the lines go to, shown on every line as the ERP does. */
export interface LinesContext {
  /** Omit on a direct issue: the column is left out. */
  picklistNo?: string | null;
  jobCardNo: string | null;
  jobName: string | null;
  contentName: string | null;
  /** Direct issue: the voucher's department, shown on every line with the line's process and machine. */
  departmentName?: string | null;
  direct?: boolean;
}

interface Props {
  lines: DraftLine[];
  context: LinesContext;
  onRemove?: (key: string) => void;
  disabled?: boolean;
}

/** The lines of the issue being built, with the ERP issue screen's columns. */
export function IssueLinesTable({ lines, context, onRemove, disabled }: Props) {
  const columns = useMemo<Column<DraftLine>[]>(() => [
    ...(context.picklistNo !== undefined ? [textColumn<DraftLine>('picklistNo', 'Picklist No.', () => context.picklistNo, { className: 'mono' })] : []),
    textColumn<DraftLine>('jobCardNo', 'Job Card No.', () => context.jobCardNo, { className: 'mono' }),
    textColumn<DraftLine>('jobName', 'Job Name', () => context.jobName),
    textColumn<DraftLine>('contentName', 'Content Name', () => context.contentName),
    ...(context.direct
      ? [
          textColumn<DraftLine>('process', 'Process', (l) => l.process?.processName ?? null),
          textColumn<DraftLine>('machine', 'Machine', (l) => l.process?.machineName ?? null),
          textColumn<DraftLine>('department', 'Department', () => context.departmentName ?? null),
          ...itemColumns<DraftLine>((l) => l.item, ['code', 'group'], {}),
          textColumn<DraftLine>('subGroup', 'Sub Group', (l) => l.item.itemSubGroupName ?? null, { width: 6 }),
          ...itemColumns<DraftLine>((l) => l.item, ['name', 'unit'], { unit: 'Unit' }),
        ]
      : itemColumns<DraftLine>((l) => l.item, ['code', 'group', 'name', 'unit'], { unit: 'Unit' })),
    qtyColumn<DraftLine>('issueQty', 'Issue Qty', (l) => l.quantity, (l) => l.item, { className: 'strong' }),
    textColumn<DraftLine>('batchNo', 'Batch No', (l) => l.batch.batchKey.batchNo, { className: 'mono' }),
    textColumn<DraftLine>('supplierBatchNo', 'Supplier Batch No', (l) => l.batch.supplierBatchNo),
    ...(context.direct
      ? []
      : [
          textColumn<DraftLine>('grnNo', 'GRN No', (l) => l.batch.grnNo, { render: (l) => l.batch.grnNo ?? <span className="muted">opening</span> }),
          dateColumn<DraftLine>('grnDate', 'GRN Date', (l) => l.batch.grnDate),
        ]),
    textColumn<DraftLine>('warehouse', 'Warehouse', (l) => l.batch.warehouseName),
    textColumn<DraftLine>('bin', 'Bin', (l) => l.batch.binName),
    ...(onRemove
      ? [{
          id: 'delete', header: '', type: 'text' as const, value: () => null, filterable: false,
          render: (l: DraftLine) => (
            <button type="button" className="btn btn-small btn-ghost link-danger" onClick={() => onRemove(l.key)} disabled={disabled}>Delete</button>
          ),
        }]
      : []),
  ], [context, onRemove, disabled]);

  return <DataGrid rows={lines} columns={columns} rowKey={(l) => l.key} noun="line" />;
}
