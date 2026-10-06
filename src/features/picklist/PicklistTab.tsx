import { useEffect, useState } from 'react';
import { api, errorMessage, type ClosePicklistLineResponse, type Page, type PicklistLine } from '../../api';
import { useSession } from '../../auth/AuthProvider';
import { Modal } from '../../components/Modal';
import { useDebounced } from '../../hooks/useDebounced';
import { formatDate, formatDateTime } from '../../lib/format';
import { formatQty, qtyWithUnit } from '../../lib/quantity';
import { PicklistIssueForm } from './PicklistIssueForm';


export function PicklistTab() {
  const [selected, setSelected] = useState<PicklistLine | null>(null);
  const [listVersion, setListVersion] = useState(0);

  if (selected) {
    return (
      <PicklistIssueForm
        line={selected}
        onBack={() => setSelected(null)}
        onDone={() => {
          setSelected(null);
          setListVersion((v) => v + 1);
        }}
      />
    );
  }
  return <PicklistList onSelect={setSelected} version={listVersion} />;
}

const PAGE_SIZES = [50, 150, 500];

/**
 * Picklist lines, newest picklist first, with the ERP picklist screen's
 * columns and its Issue / Close actions. "Closed allocation picklist" shows
 * the closed lines instead (read-only).
 */
function PicklistList({ onSelect, version }: { onSelect: (line: PicklistLine) => void; version: number }) {
  const session = useSession();
  const [search, setSearch] = useState('');
  const [showFullyIssued, setShowFullyIssued] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]!);
  const [data, setData] = useState<Page<PicklistLine> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<PicklistLine | null>(null);
  const [reload, setReload] = useState(0);
  const debounced = useDebounced(search.trim());

  useEffect(() => setPage(1), [debounced, showFullyIssued, showClosed, pageSize]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.picklists({ search: debounced, page, pageSize, showFullyIssued, showClosed }).then(
      (result) => {
        if (!alive) return;
        setData(result);
        setError(null);
        setLoading(false);
      },
      (err) => {
        if (!alive) return;
        setError(errorMessage(err));
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [debounced, page, pageSize, showFullyIssued, showClosed, version, reload]);

  const pages = data?.total ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const columns = 20;

  return (
    <section className="panel">
      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Search picklist, PWO, job, content, client, division or item…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <label className="check">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Closed allocation picklist
        </label>
        {!showClosed && (
          <label className="check">
            <input type="checkbox" checked={showFullyIssued} onChange={(e) => setShowFullyIssued(e.target.checked)} />
            Include fully issued lines
          </label>
        )}
        <span className="muted">{loading ? 'Loading…' : data?.total !== null && data ? `${data.total} line(s)` : ''}</span>
      </div>

      {error && <p className="notice notice-error">{error}</p>}

      <div className="table-wrap">
        <table className={`dense erp-grid${showClosed ? '' : ' clickable'}`}>
          <thead>
            <tr>
              <th>Picklist No</th>
              <th>Client</th>
              <th>PWO No</th>
              <th>Job Name</th>
              <th>Content Name</th>
              <th>Item Code</th>
              <th>Item Group</th>
              <th>Division</th>
              <th>Quality</th>
              <th className="num">GSM</th>
              <th className="num">SizeW</th>
              <th className="num">SizeL</th>
              <th>Manufacturer</th>
              <th>Certification</th>
              <th>Stock Unit</th>
              <th className="num">Physical Stock</th>
              <th className="num">Allocated Qty</th>
              <th className="num">Issued Qty</th>
              <th className="num">Pending Qty</th>
              <th className="sticky-right">{showClosed ? 'Closed' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => {
              const open = () => !showClosed && onSelect(r);
              return (
                <tr
                  key={r.picklistDetailId}
                  onClick={open}
                  tabIndex={showClosed ? undefined : 0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') open();
                  }}
                >
                  <td className="mono nowrap" title={formatDate(r.picklistDate)}>{r.picklistNo}</td>
                  <td className="clip" title={r.clientName ?? undefined}>{r.clientName}</td>
                  <td className="mono nowrap">{r.jobContentNo ?? r.jobCardNo}</td>
                  <td className="clip" title={r.jobName ?? undefined}>{r.jobName}</td>
                  <td className="clip" title={r.contentName ?? undefined}>{r.contentName}</td>
                  <td className="mono">{r.item.itemCode}</td>
                  <td>{r.item.itemGroupName}</td>
                  <td>{r.division}</td>
                  <td>{r.item.quality}</td>
                  <td className="num">{r.item.gsm ?? ''}</td>
                  <td className="num">{r.item.sizeW ?? ''}</td>
                  <td className="num">{r.item.sizeL ?? ''}</td>
                  <td>{r.item.manufacturer}</td>
                  <td>{r.item.certification}</td>
                  <td>{r.item.stockUnit}</td>
                  <td className="num">{formatQty(r.item.physicalStock)}</td>
                  <td className="num">{formatQty(r.required)}</td>
                  <td className="num">{formatQty(r.issued)}</td>
                  <td className={`num strong${r.pending <= 0 ? ' muted' : ''}`}>{formatQty(r.pending)}</td>
                  {showClosed ? (
                    <td className="nowrap small sticky-right">{formatDateTime(r.closedDate)}{r.closedBy && <span className="muted"> · {r.closedBy}</span>}</td>
                  ) : (
                    <td className="actions sticky-right">
                      <button type="button" className="btn btn-small btn-issue" onClick={(e) => (e.stopPropagation(), onSelect(r))}>
                        Issue
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-small btn-close-line"
                        onClick={(e) => (e.stopPropagation(), setClosing(r))}
                        disabled={!session.canPost}
                        title={session.canPost ? 'Close this picklist line' : 'Your login is not linked to an ERP user'}
                      >
                        Close
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {data && !data.rows.length && (
              <tr>
                <td colSpan={columns} className="empty">{showClosed ? 'No closed picklist lines match.' : 'No open picklist lines match.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <span className="page-sizes">
          {PAGE_SIZES.map((n) => (
            <button key={n} type="button" className={`btn btn-small${n === pageSize ? ' active' : ''}`} onClick={() => setPageSize(n)} aria-pressed={n === pageSize}>
              {n}
            </button>
          ))}
        </span>
        <button type="button" className="btn" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
          ← Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button type="button" className="btn" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>
          Next →
        </button>
      </div>

      {closing && (
        <CloseLineDialog
          line={closing}
          writesEnabled={session.writesEnabled}
          onClose={(changed) => {
            setClosing(null);
            if (changed) setReload((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}

function CloseLineDialog({ line, writesEnabled, onClose }: { line: PicklistLine; writesEnabled: boolean; onClose: (changed: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClosePicklistLineResponse | null>(null);
  const unit = line.item.stockUnit;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.closePicklistLine(line.picklistDetailId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const changed = result?.status === 'CLOSED';
  return (
    <Modal
      title={`Close ${line.picklistNo ?? 'picklist line'}`}
      onClose={busy ? undefined : () => onClose(changed)}
      footer={
        result ? (
          <button type="button" className="btn btn-primary" onClick={() => onClose(changed)} autoFocus>OK</button>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => onClose(false)} disabled={busy}>Keep open</button>
            <button type="button" className="btn btn-danger" onClick={() => void confirm()} disabled={busy}>
              {busy ? 'Closing…' : writesEnabled ? 'Close line' : 'Close (dry run)'}
            </button>
          </>
        )
      }
    >
      {!result && (
        <>
          <p>
            Close picklist <strong className="mono">{line.picklistNo}</strong> for <span className="mono">{line.jobContentNo ?? line.jobCardNo}</span>,{' '}
            item <span className="mono">{line.item.itemCode}</span>?
          </p>
          <p>
            Allocated {qtyWithUnit(line.required, unit)}, issued {qtyWithUnit(line.issued, unit)}.{' '}
            {line.pending > 0 ? (
              <strong>The pending {qtyWithUnit(line.pending, unit)} will not be issued against this picklist.</strong>
            ) : (
              'Nothing is pending.'
            )}{' '}
            The line moves to "Closed allocation picklist", as when it is closed in the ERP.
          </p>
          {!writesEnabled && <p className="notice notice-dry">Dry run: the close will be tested and rolled back. Nothing changes.</p>}
        </>
      )}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {result?.status === 'DRY_RUN' && <p className="notice notice-dry">Dry run: the close was tested and rolled back. The line is still open.</p>}
      {result?.status === 'CLOSED' && <p className="notice notice-info">{result.picklistNo} line is closed.</p>}
    </Modal>
  );
}
