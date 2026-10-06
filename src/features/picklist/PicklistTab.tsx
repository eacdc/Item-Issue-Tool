import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage, type ClosePicklistLineResponse, type Page, type PicklistLine } from '../../api';
import { useSession } from '../../auth/AuthProvider';
import { Modal } from '../../components/Modal';
import { DataGrid, type Column } from '../../components/DataGrid';
import { itemColumns, qtyColumn, textColumn } from '../../components/columns';
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

const PAGE_SIZES = [50, 150, 500, 1000];
/** Lines fetched in one go; the grid filters, sorts, totals and pages them in the browser. */
const FETCH_LIMIT = 5000;

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
  const [data, setData] = useState<Page<PicklistLine> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<PicklistLine | null>(null);
  const [reload, setReload] = useState(0);
  const debounced = useDebounced(search.trim());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.picklists({ search: debounced, page: 1, pageSize: FETCH_LIMIT, showFullyIssued, showClosed }).then(
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
  }, [debounced, showFullyIssued, showClosed, version, reload]);

  const columns = useMemo<Column<PicklistLine>[]>(() => [
    textColumn<PicklistLine>('picklistNo', 'Picklist No', (r) => r.picklistNo, {
      className: 'mono nowrap',
      render: (r) => <span title={`Picklist date ${formatDate(r.picklistDate)}`}>{r.picklistNo}</span>,
    }),
    textColumn<PicklistLine>('client', 'Client', (r) => r.clientName, { className: 'clip' }),
    textColumn<PicklistLine>('pwo', 'PWO No', (r) => r.jobContentNo ?? r.jobCardNo, { className: 'mono nowrap' }),
    textColumn<PicklistLine>('jobName', 'Job Name', (r) => r.jobName, { className: 'clip' }),
    textColumn<PicklistLine>('contentName', 'Content Name', (r) => r.contentName, { className: 'clip' }),
    ...itemColumns<PicklistLine>((r) => r.item, ['code', 'group']),
    textColumn<PicklistLine>('division', 'Division', (r) => r.division),
    ...itemColumns<PicklistLine>((r) => r.item, ['quality', 'gsm', 'sizeW', 'sizeL', 'manufacturer', 'certification', 'unit']),
    // An item's stock repeats on each of its lines: count it once in the total.
    qtyColumn<PicklistLine>('physical', 'Physical Stock', (r) => r.item.physicalStock, (r) => r.item, { distinctBy: (r) => r.item.itemId }),
    qtyColumn<PicklistLine>('allocated', 'Allocated Qty', (r) => r.required, (r) => r.item),
    qtyColumn<PicklistLine>('issued', 'Issued Qty', (r) => r.issued, (r) => r.item),
    qtyColumn<PicklistLine>('pending', 'Pending Qty', (r) => r.pending, (r) => r.item, {
      render: (r) => <span className={`strong${r.pending <= 0 ? ' muted' : ''}`}>{formatQty(r.pending)}</span>,
    }),
    showClosed
      ? {
          id: 'closed', header: 'Closed', type: 'date', value: (r) => r.closedDate, sticky: true, className: 'nowrap small',
          render: (r) => <>{formatDateTime(r.closedDate)}{r.closedBy && <span className="muted"> · {r.closedBy}</span>}</>,
        }
      : {
          id: 'actions', header: 'Actions', type: 'text', value: () => null, filterable: false, sticky: true, className: 'actions',
          render: (r) => (
            <>
              <button type="button" className="btn btn-small btn-issue" onClick={(e) => (e.stopPropagation(), onSelect(r))}>Issue</button>{' '}
              <button
                type="button"
                className="btn btn-small btn-close-line"
                onClick={(e) => (e.stopPropagation(), setClosing(r))}
                disabled={!session.canPost}
                title={session.canPost ? 'Close this picklist line' : 'Your login is not linked to an ERP user'}
              >
                Close
              </button>
            </>
          ),
        },
  ], [showClosed, onSelect, session.canPost]);

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
        <span className="muted">{loading ? 'Loading…' : ''}</span>
      </div>

      {error && <p className="notice notice-error">{error}</p>}
      {data && data.total !== null && data.total > data.rows.length && (
        <p className="notice notice-warn">
          Showing the newest {data.rows.length.toLocaleString('en-IN')} of {data.total.toLocaleString('en-IN')} lines. Type in the search box to narrow them down.
        </p>
      )}

      {data && (
        <DataGrid
          rows={data.rows}
          columns={columns}
          rowKey={(r) => r.picklistDetailId}
          onRowClick={showClosed ? undefined : onSelect}
          pageSizes={PAGE_SIZES}
          noun="line"
          emptyText={showClosed ? 'No closed picklist lines match.' : 'No open picklist lines match.'}
        />
      )}

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
