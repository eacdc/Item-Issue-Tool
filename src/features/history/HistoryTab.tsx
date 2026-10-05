import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage, type DeleteIssueResponse, type HistoryIssue } from '../../api';
import { useSession } from '../../auth/AuthProvider';
import { Modal } from '../../components/Modal';
import { addDays, formatDate, formatDateTime } from '../../lib/format';
import { qtyWithUnit } from '../../lib/quantity';
import { totalsByUnit } from '../../lib/lines';

export function HistoryTab() {
  const session = useSession();
  const [from, setFrom] = useState(addDays(session.today, -3));
  const [to, setTo] = useState(session.today);
  const [rows, setRows] = useState<HistoryIssue[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<HistoryIssue | null>(null);
  const [search, setSearch] = useState('');
  const shown = useMemo(() => filterIssues(rows ?? [], search), [rows, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.issues(from, to);
      setRows(result.rows);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: number) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <section className="panel">
      <div className="toolbar">
        <label className="inline">From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">To <input type="date" value={to} max={session.today} onChange={(e) => setTo(e.target.value)} /></label>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        <input
          type="search"
          className="search"
          placeholder="Find an issue: voucher no., job, item, user…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="muted">
          {rows ? (search.trim() ? `${shown.length} of ${rows.length} issue(s)` : `${rows.length} issue(s)`) : ''}
        </span>
      </div>
      {error && <p className="notice notice-error">{error}</p>}

      <div className="table-wrap">
        <table className="dense">
          <thead>
            <tr>
              <th aria-label="Expand" />
              <th>Voucher</th>
              <th>Delete</th>
              <th>Date</th>
              <th>Type</th>
              <th>Job content</th>
              <th>Job</th>
              <th>Department</th>
              <th>Slip No.</th>
              <th className="num">Total</th>
              <th>Created by</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <HistoryRow
                key={r.transactionId}
                issue={r}
                open={open.has(r.transactionId)}
                onToggle={() => toggle(r.transactionId)}
                onDelete={() => setDeleting(r)}
                canPost={session.canPost}
              />
            ))}
            {rows && !shown.length && (
              <tr><td colSpan={11} className="empty">{rows.length ? 'No issue matches the search.' : 'No issues in this period.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {deleting && (
        <DeleteDialog
          issue={deleting}
          writesEnabled={session.writesEnabled}
          onClose={(changed) => {
            setDeleting(null);
            if (changed) void load();
          }}
        />
      )}
    </section>
  );
}

function HistoryRow({ issue, open, onToggle, onDelete, canPost }: { issue: HistoryIssue; open: boolean; onToggle: () => void; onDelete: () => void; canPost: boolean }) {
  const totals = totalsByUnit(issue.lines.map((l) => ({ item: { stockUnit: l.stockUnit }, quantity: l.issueQuantity })));
  return (
    <>
      <tr className={open ? 'expanded' : undefined}>
        <td>
          <button type="button" className="btn btn-small btn-ghost" onClick={onToggle} aria-expanded={open} aria-label={open ? 'Hide lines' : 'Show lines'}>
            {open ? '▾' : '▸'}
          </button>
        </td>
        <td className="mono strong">
          {issue.voucherNo}
          {issue.createdByIssueTool && <span className="badge" title="Created by this tool">tool</span>}
        </td>
        <td>
          {issue.canDelete ? (
            <button type="button" className="btn btn-small btn-danger" onClick={onDelete} disabled={!canPost}>
              Delete
            </button>
          ) : (
            <span className="chip-muted" title={`Can't delete: ${issue.deleteBlockedReason ?? 'consumed'}`}>Consumed</span>
          )}
        </td>
        <td className="nowrap">{formatDate(issue.voucherDate)}</td>
        <td>{issue.mode === 'ALLOCATED' ? 'Picklist' : 'Direct'}</td>
        <td className="mono">{issue.jobContentNo}</td>
        <td>{issue.jobName}</td>
        <td>{issue.departmentName}</td>
        <td className="mono">{issue.slipNo}</td>
        <td className="num">{totals.map((t) => qtyWithUnit(t.total, t.stockUnit)).join(' + ')}</td>
        <td>
          {issue.createdBy.userName ?? issue.createdBy.userId}
          <div className="muted small">{formatDateTime(issue.createdDate)}</div>
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td />
          <td colSpan={10}>
            <table className="dense inner">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th>Batch no.</th>
                  <th>From</th>
                  <th>To floor</th>
                  <th>Picklist</th>
                  <th className="num">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {issue.lines.map((l) => (
                  <tr key={l.transactionDetailId}>
                    <td>{l.transId}</td>
                    <td><span className="mono">{l.item.itemCode}</span> <span className="muted">{l.item.itemName}</span></td>
                    <td className="mono">{l.batchNo}</td>
                    <td>{[l.warehouseName, l.binName].filter(Boolean).join(' / ')}</td>
                    <td>{[l.floorWarehouseName, l.floorBinName].filter(Boolean).join(' / ')}</td>
                    <td className="mono">{l.picklistNo}</td>
                    <td className="num strong">{qtyWithUnit(l.issueQuantity, l.stockUnit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {issue.remark && <p className="muted">Remark: {issue.remark}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

function DeleteDialog({ issue, writesEnabled, onClose }: { issue: HistoryIssue; writesEnabled: boolean; onClose: (changed: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeleteIssueResponse | null>(null);
  const [refresh, setRefresh] = useState<{ busy: boolean; ok: boolean; error: string | null }>({ busy: false, ok: false, error: null });

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.deleteIssue(issue.transactionId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function retryRefresh() {
    setRefresh({ busy: true, ok: false, error: null });
    try {
      await api.refreshStock(issue.transactionId);
      setRefresh({ busy: false, ok: true, error: null });
    } catch (err) {
      setRefresh({ busy: false, ok: false, error: errorMessage(err) });
    }
  }

  const changed = result?.status === 'DELETED';
  return (
    <Modal
      title={`Delete ${issue.voucherNo}`}
      onClose={busy ? undefined : () => onClose(changed)}
      footer={
        result ? (
          <button type="button" className="btn btn-primary" onClick={() => onClose(changed)} autoFocus>Close</button>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => onClose(false)} disabled={busy}>Keep it</button>
            <button type="button" className="btn btn-danger" onClick={() => void confirm()} disabled={busy}>
              {busy ? 'Deleting…' : writesEnabled ? 'Delete issue' : 'Delete (dry run)'}
            </button>
          </>
        )
      }
    >
      {!result && (
        <>
          <p>
            Delete issue <strong className="mono">{issue.voucherNo}</strong> of {formatDate(issue.voucherDate)} for{' '}
            <span className="mono">{issue.jobContentNo}</span>? It is marked deleted in the ERP, exactly as the ERP's own delete does,
            and the stock goes back to the batches.
          </p>
          {!writesEnabled && <p className="notice notice-dry">Dry run: the delete will be tested and rolled back. Nothing changes.</p>}
        </>
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {result?.status === 'DRY_RUN' && <p className="notice notice-dry">Dry run: the delete was tested and rolled back. {issue.voucherNo} is unchanged.</p>}
      {result?.status === 'DELETED' && (
        <>
          <p className="notice notice-info">{result.voucherNo} is deleted.</p>
          {result.stockRefreshFailed && !refresh.ok && (
            <div className="notice notice-warn">
              <p><strong>Deleted, but the stock summary was not updated.</strong> Retry the refresh.</p>
              {refresh.error && <p className="text-error">{refresh.error}</p>}
              <button type="button" className="btn" onClick={() => void retryRefresh()} disabled={refresh.busy}>
                {refresh.busy ? 'Refreshing…' : 'Retry stock refresh'}
              </button>
            </div>
          )}
          {refresh.ok && <p className="notice notice-info">Stock refreshed.</p>}
        </>
      )}
    </Modal>
  );
}

/** Pure: every word must appear in the voucher, job, department, slip, user or a line's item / batch / picklist. */
export function filterIssues(rows: HistoryIssue[], search: string): HistoryIssue[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;
  return rows.filter((r) => {
    const haystack = [
      r.voucherNo, r.jobCardNo, r.jobContentNo, r.jobName, r.contentName, r.departmentName, r.slipNo,
      r.createdBy.userName, String(r.createdBy.userId ?? ''),
      ...r.lines.flatMap((l) => [l.item.itemCode, l.item.itemName, l.batchNo, l.picklistNo]),
    ].filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}
