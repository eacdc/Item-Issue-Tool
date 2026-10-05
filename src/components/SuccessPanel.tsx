import { useState } from 'react';
import { api, errorMessage, type PostIssueResponse } from '../api';
import { formatDate } from '../lib/format';

interface Props {
  result: PostIssueResponse;
  onNewIssue: () => void;
}

/** What happened after Save. The voucher number appears here and nowhere earlier. */
export function SuccessPanel({ result, onNewIssue }: Props) {
  const [refresh, setRefresh] = useState<{ busy: boolean; ok: boolean; error: string | null }>({ busy: false, ok: false, error: null });

  async function retryRefresh(transactionId: number) {
    setRefresh({ busy: true, ok: false, error: null });
    try {
      await api.refreshStock(transactionId);
      setRefresh({ busy: false, ok: true, error: null });
    } catch (err) {
      setRefresh({ busy: false, ok: false, error: errorMessage(err) });
    }
  }

  if (result.status === 'DRY_RUN') {
    return (
      <section className="result result-dry">
        <h2>Dry run — nothing was saved</h2>
        <p>
          The server checked this issue, wrote it inside a transaction and rolled it back
          {result.dryRunReason === 'WRITES_DISABLED' ? ', because saving is not switched on yet' : ''}. No voucher was created and no number was used.
        </p>
        {result.warnings.length > 0 && <p className="muted">{result.warnings.length} warning(s) were acknowledged.</p>}
        <details>
          <summary>Rows the server would have written</summary>
          <RowsTable title="Header (ItemTransactionMain)" rows={result.wouldWrite.header ? [result.wouldWrite.header] : []} voucherNo={result.wouldWrite.header?.VoucherNo} />
          <RowsTable title="Lines (ItemTransactionDetail)" rows={result.wouldWrite.lines} voucherNo={result.wouldWrite.header?.VoucherNo} />
        </details>
        <button type="button" className="btn btn-primary btn-large" onClick={onNewIssue} autoFocus>
          New issue
        </button>
      </section>
    );
  }

  return (
    <section className={`result ${result.stockRefreshFailed && !refresh.ok ? 'result-warn' : 'result-ok'}`}>
      <p className="result-label">Issue saved</p>
      <p className="voucher-no">{result.voucherNo}</p>
      <p className="muted">
        Voucher date {formatDate(result.voucherDate)} · {result.lines.length} line(s)
      </p>
      {result.replayed && (
        <p className="notice notice-info">This form had already been saved. This is the same voucher; nothing new was written.</p>
      )}
      {result.warnings.length > 0 && <p className="muted">Saved with {result.warnings.length} acknowledged warning(s).</p>}
      {result.stockRefreshFailed && !refresh.ok && (
        <div className="notice notice-warn">
          <p>
            <strong>The issue is saved, but the stock summary was not updated.</strong> Physical and floor stock on the item master
            are out of date until the refresh succeeds. Batch stock is correct.
          </p>
          {result.stockRefreshError && <p className="muted">Server said: {result.stockRefreshError}</p>}
          {refresh.error && <p className="text-error">{refresh.error}</p>}
          <button type="button" className="btn" onClick={() => void retryRefresh(result.transactionId)} disabled={refresh.busy}>
            {refresh.busy ? 'Refreshing…' : 'Retry stock refresh'}
          </button>
        </div>
      )}
      {refresh.ok && <p className="notice notice-info">Stock refreshed.</p>}
      <button type="button" className="btn btn-primary btn-large" onClick={onNewIssue} autoFocus>
        New issue
      </button>
    </section>
  );
}

/**
 * A dry run's IDs and voucher number were rolled back and will be handed to
 * the next real save, so they are masked rather than shown as if allocated.
 */
const ROLLED_BACK = new Set(['TransactionID', 'TransactionDetailID', 'MaxVoucherNo', 'VoucherNo']);

function cell(column: string, value: unknown, voucherNo: unknown): string {
  if (ROLLED_BACK.has(column) || (column === 'DeliveryNoteNo' && value && value === voucherNo)) return '(rolled back)';
  return value === null || value === undefined ? 'NULL' : JSON.stringify(value);
}

function RowsTable({ title, rows, voucherNo }: { title: string; rows: Record<string, unknown>[]; voucherNo: unknown }) {
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]!);
  return (
    <div className="table-wrap">
      <h4>{title}</h4>
      <table className="dense rows-dump">
        <thead>
          <tr>
            <th>Column</th>
            {rows.map((_, i) => (
              <th key={i}>{rows.length > 1 ? `Line ${i + 1}` : 'Value'}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((c) => (
            <tr key={c}>
              <td className="mono">{c}</td>
              {rows.map((r, i) => (
                <td key={i} className="mono">{cell(c, r[c], voucherNo)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
