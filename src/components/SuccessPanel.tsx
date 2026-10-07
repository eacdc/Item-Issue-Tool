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
          Saving is switched off on the server, so this issue was only checked. No voucher was created.
        </p>
        {result.warnings.length > 0 && <p className="muted">{result.warnings.length} warning(s) were acknowledged.</p>}
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
        {result.floorReceiptVoucherNo && <> · floor receipt <span className="mono">{result.floorReceiptVoucherNo}</span></>}
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
