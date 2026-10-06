import { formatDate } from '../lib/format';
import { formatQty } from '../lib/quantity';
import type { DraftLine } from '../lib/lines';

/** The job (and picklist) the lines go to, shown on every line as the ERP does. */
export interface LinesContext {
  /** Omit on a direct issue: the column is left out. */
  picklistNo?: string | null;
  jobCardNo: string | null;
  jobName: string | null;
  contentName: string | null;
}

interface Props {
  lines: DraftLine[];
  context: LinesContext;
  onRemove?: (key: string) => void;
  disabled?: boolean;
}

/** The lines of the issue being built, with the ERP issue screen's columns. */
export function IssueLinesTable({ lines, context, onRemove, disabled }: Props) {
  const withPicklist = context.picklistNo !== undefined;
  return (
    <div className="table-wrap">
      <table className="dense erp-grid">
        <thead>
          <tr>
            {withPicklist && <th>Picklist No.</th>}
            <th>Job Card No.</th>
            <th>Job Name</th>
            <th>Content Name</th>
            <th>Item Code</th>
            <th>Item Group</th>
            <th>Item Name</th>
            <th>Unit</th>
            <th className="num">Issue Qty</th>
            <th>Batch No</th>
            <th>Supplier Batch No</th>
            <th>GRN No</th>
            <th>GRN Date</th>
            <th>Warehouse</th>
            <th>Bin</th>
            {onRemove && <th aria-label="Delete" />}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key}>
              {withPicklist && <td className="mono">{context.picklistNo}</td>}
              <td className="mono">{context.jobCardNo}</td>
              <td>{context.jobName}</td>
              <td>{context.contentName}</td>
              <td className="mono">{l.item.itemCode}</td>
              <td>{l.item.itemGroupName}</td>
              <td>{l.item.itemName}</td>
              <td>{l.item.stockUnit}</td>
              <td className="num strong">{formatQty(l.quantity)}</td>
              <td className="mono">{l.batch.batchKey.batchNo ?? '—'}</td>
              <td>{l.batch.supplierBatchNo ?? ''}</td>
              <td>{l.batch.grnNo ?? <span className="muted">opening</span>}</td>
              <td className="nowrap">{formatDate(l.batch.grnDate)}</td>
              <td>{l.batch.warehouseName ?? '—'}</td>
              <td>{l.batch.binName ?? '—'}</td>
              {onRemove && (
                <td>
                  <button type="button" className="btn btn-small btn-ghost link-danger" onClick={() => onRemove(l.key)} disabled={disabled}>
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
