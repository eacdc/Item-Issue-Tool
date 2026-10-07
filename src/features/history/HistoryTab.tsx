import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage, type DeleteIssueResponse, type HistoryIssue, type HistoryLine } from '../../api';
import { useSession } from '../../auth/AuthProvider';
import { Modal } from '../../components/Modal';
import { DataGrid, type Column } from '../../components/DataGrid';
import { dateColumn, itemColumns, qtyColumn, textColumn } from '../../components/columns';
import { addDays, formatDate, formatDateTime } from '../../lib/format';

const PAGE_SIZES = [30, 100, 500, 1000];

/** One row of the issue register: an issue line with its voucher. */
export interface RegisterRow {
  key: string;
  issue: HistoryIssue;
  line: HistoryLine;
  /** The picklist for an allocated line; otherwise the voucher number, as the ERP's register shows. */
  picklistNo: string | null;
}

/** Pure: one row per line, in the order the issues come. */
export function registerRows(issues: HistoryIssue[]): RegisterRow[] {
  return issues.flatMap((issue) =>
    issue.lines.map((line) => ({
      key: `${issue.transactionId}-${line.transId}`,
      issue,
      line,
      picklistNo: line.picklistNo ?? issue.voucherNo,
    })),
  );
}

/**
 * Issue register, laid out like the ERP's: one row per issue line, a filter
 * on every column, totals at the foot (Kg with sheets weighed, Nos and other
 * units apart). Delete acts on the whole voucher.
 */
export function HistoryTab() {
  const session = useSession();
  const [from, setFrom] = useState(addDays(session.today, -7));
  const [to, setTo] = useState(session.today);
  const [rows, setRows] = useState<HistoryIssue[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<HistoryIssue | null>(null);
  const [search, setSearch] = useState('');
  const [slipBusy, setSlipBusy] = useState<number | null>(null);
  const register = useMemo(() => registerRows(filterIssues(rows ?? [], search)), [rows, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.issues(from, to);
      setRows(result.rows);
      setTruncated(!!result.truncated);
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

  const downloadSlip = useCallback(async (issue: HistoryIssue) => {
    setSlipBusy(issue.transactionId);
    try {
      const { blob, fileName } = await api.issueSlip(issue.transactionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setError(null);
    } catch (err) {
      setError(`Could not download the slip for ${issue.voucherNo}: ${errorMessage(err)}`);
    } finally {
      setSlipBusy(null);
    }
  }, []);

  const columns = useMemo<Column<RegisterRow>[]>(() => [
    ...itemColumns<RegisterRow>((r) => r.line.item, ['group']),
    textColumn<RegisterRow>('subGroup', 'Sub Group', (r) => r.line.itemSubGroupName, { width: 6 }),
    textColumn<RegisterRow>('issueNo', 'Issue No.', (r) => r.issue.voucherNo, { className: 'mono', width: 9.5 }),
    {
      id: 'actions', header: 'Actions', type: 'text', value: () => null, filterable: false, width: 4.4,
      render: (r) => (
        <span className="row-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              void downloadSlip(r.issue);
            }}
            disabled={slipBusy === r.issue.transactionId}
            title={`Download the Item Issue Slip of ${r.issue.voucherNo} (PDF)`}
            aria-label={`Download slip ${r.issue.voucherNo}`}
          >
            {slipBusy === r.issue.transactionId ? <span className="icon-spin" /> : <DownloadIcon />}
          </button>
          {r.issue.canDelete ? (
            <button
              type="button"
              className="icon-btn icon-btn-danger"
              onClick={(e) => {
                e.stopPropagation();
                setDeleting(r.issue);
              }}
              disabled={!session.canPost}
              title={`Delete ${r.issue.voucherNo} (every line)`}
              aria-label={`Delete ${r.issue.voucherNo}`}
            >
              <TrashIcon />
            </button>
          ) : (
            <span className="icon-btn icon-btn-locked" title={`Can't delete: ${r.issue.deleteBlockedReason ?? 'already consumed on the floor'}`} aria-label="Consumed, can't delete">
              <LockIcon />
            </span>
          )}
        </span>
      ),
    },
    dateColumn<RegisterRow>('issueDate', 'Issue Date', (r) => r.issue.voucherDate),
    ...itemColumns<RegisterRow>((r) => r.line.item, ['code', 'name']),
    textColumn<RegisterRow>('picklistNo', 'Picklist No.', (r) => r.picklistNo, { className: 'mono', width: 8 }),
    textColumn<RegisterRow>('department', 'Department', (r) => r.issue.departmentName, { width: 6.8 }),
    textColumn<RegisterRow>('jcNo', 'J.C. No.', (r) => r.line.jobContentNo ?? r.issue.jobContentNo, { className: 'mono', width: 8.5 }),
    textColumn<RegisterRow>('jobName', 'Job Name', (r) => r.line.jobName ?? r.issue.jobName, { width: 10 }),
    textColumn<RegisterRow>('contentName', 'Content Name', (r) => r.line.contentName ?? r.issue.contentName, { width: 8 }),
    textColumn<RegisterRow>('machine', 'Machine Name', (r) => r.line.machineName, { width: 6 }),
    qtyColumn<RegisterRow>('issueQty', 'Issue Qty', (r) => r.line.issueQuantity, (r) => ({ ...r.line.item, stockUnit: r.line.stockUnit }), { width: 6.5 }),
    textColumn<RegisterRow>('stockUnit', 'Stock Unit', (r) => r.line.stockUnit, { width: 3.8 }),
    textColumn<RegisterRow>('client', 'Client Name', (r) => r.line.clientName ?? r.issue.clientName, { width: 9 }),
    textColumn<RegisterRow>('createdBy', 'Created By', (r) => r.issue.createdBy.userName ?? String(r.issue.createdBy.userId ?? ''), {
      render: (r) => <span title={formatDateTime(r.issue.createdDate)}>{r.issue.createdBy.userName ?? r.issue.createdBy.userId}</span>,
    }),
    textColumn<RegisterRow>('remark', 'Remark', (r) => r.issue.remark, { width: 6 }),
    textColumn<RegisterRow>('slipNo', 'Slip No.', (r) => r.issue.slipNo, { className: 'mono', width: 8 }),
    textColumn<RegisterRow>('batchNo', 'Batch No', (r) => r.line.batchNo, { className: 'mono', width: 8.5 }),
  ], [session.canPost, downloadSlip, slipBusy]);

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
        <span className="muted">{rows ? `${rows.length.toLocaleString('en-IN')} issue(s) from ${formatDate(from)} to ${formatDate(to)}` : ''}</span>
      </div>
      {error && <p className="notice notice-error">{error}</p>}
      {truncated && <p className="notice notice-warn">Only the newest issues of this period are shown. Pick a shorter period to see them all.</p>}

      {rows && (
        <DataGrid
          rows={register}
          columns={columns}
          rowKey={(r) => r.key}
          pageSizes={PAGE_SIZES}
          noun="line"
          emptyText={rows.length ? 'No issue matches the search.' : 'No issues in this period.'}
        />
      )}

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
            Delete issue <strong className="mono">{issue.voucherNo}</strong> of {formatDate(issue.voucherDate)}
            {issue.jobContentNo && <> for <span className="mono">{issue.jobContentNo}</span></>}, with all its {issue.lines.length} line(s)? The stock goes back to the batches.
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

const iconProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

function DownloadIcon() {
  return (
    <svg {...iconProps}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M12 12v6M9 15l3 3 3-3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg {...iconProps}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
