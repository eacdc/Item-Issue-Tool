import { useEffect, useState } from 'react';
import { api, errorMessage, type Page, type PicklistLine } from '../../api';
import { useDebounced } from '../../hooks/useDebounced';
import { formatDate } from '../../lib/format';
import { qtyWithUnit } from '../../lib/quantity';
import { PicklistIssueForm } from './PicklistIssueForm';

const PAGE_SIZE = 50;

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

/**
 * Open picklist lines. Each row's actions cell is where a "Close line" action
 * will go when closing is added; it would act on picklistDetailId.
 */
function PicklistList({ onSelect, version }: { onSelect: (line: PicklistLine) => void; version: number }) {
  const [search, setSearch] = useState('');
  const [showFullyIssued, setShowFullyIssued] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<PicklistLine> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebounced(search.trim());

  useEffect(() => setPage(1), [debounced, showFullyIssued]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.picklists({ search: debounced, page, pageSize: PAGE_SIZE, showFullyIssued }).then(
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
  }, [debounced, page, showFullyIssued, version]);

  const pages = data?.total ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <section className="panel">
      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Search picklist, job card, content, job, client or item…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <label className="check">
          <input type="checkbox" checked={showFullyIssued} onChange={(e) => setShowFullyIssued(e.target.checked)} />
          Include fully issued lines
        </label>
        <span className="muted">{loading ? 'Loading…' : data?.total !== null && data ? `${data.total} line(s)` : ''}</span>
      </div>

      {error && <p className="notice notice-error">{error}</p>}

      <div className="table-wrap">
        <table className="dense clickable">
          <thead>
            <tr>
              <th>Picklist</th>
              <th>Date</th>
              <th>Client</th>
              <th>Job card / content</th>
              <th>Job · content</th>
              <th>Item</th>
              <th>Quality / GSM / size</th>
              <th>Mfr.</th>
              <th className="num">Required</th>
              <th className="num">Issued</th>
              <th className="num">Pending</th>
              <th className="num">Phys. stock</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => {
              const unit = r.item.stockUnit;
              return (
                <tr
                  key={r.picklistDetailId}
                  onClick={() => onSelect(r)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSelect(r);
                  }}
                >
                  <td className="mono">{r.picklistNo}</td>
                  <td>{formatDate(r.picklistDate)}</td>
                  <td>{r.clientName}</td>
                  <td className="mono">{r.jobContentNo ?? r.jobCardNo}</td>
                  <td>
                    {r.jobName}
                    {r.contentName && <span className="muted"> · {r.contentName}</span>}
                  </td>
                  <td>
                    <span className="mono">{r.item.itemCode}</span> <span className="muted">{r.item.itemGroupName}</span>
                  </td>
                  <td>{[r.item.quality, r.item.gsm && `${r.item.gsm} gsm`, r.item.size].filter(Boolean).join(' · ')}</td>
                  <td>{r.item.manufacturer}</td>
                  <td className="num">{qtyWithUnit(r.required, unit)}</td>
                  <td className="num">{qtyWithUnit(r.issued, unit)}</td>
                  <td className={`num strong${r.pending <= 0 ? ' muted' : ''}`}>{qtyWithUnit(r.pending, unit)}</td>
                  <td className="num">{qtyWithUnit(r.item.physicalStock, unit)}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-small btn-primary" onClick={(e) => (e.stopPropagation(), onSelect(r))}>
                      Issue
                    </button>
                  </td>
                </tr>
              );
            })}
            {data && !data.rows.length && (
              <tr>
                <td colSpan={13} className="empty">No open picklist lines match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
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
    </section>
  );
}
