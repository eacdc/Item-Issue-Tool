import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DATE_OPS, NUMBER_FILTER_HELP, compareValues, emptyFilter, isActive, matches, summarizeQty,
  type ColumnType, type DateOp, type FilterValue, type QtyValue,
} from '../lib/grid';
import { formatQty } from '../lib/quantity';

export interface Column<T> {
  id: string;
  header: string;
  /** Decides the filter: text contains, number / qty compare, date on / from / until. */
  type: ColumnType;
  /** The value filtered and sorted on. Dates as ISO strings. */
  value: (row: T) => string | number | null | undefined;
  /** What the cell shows; defaults to the value. */
  render?: (row: T) => ReactNode;
  className?: string;
  /** qty columns: the quantity with its unit, for the summary (Sheet → Kg, Nos apart). */
  qty?: (row: T) => QtyValue;
  /** Count each key once in the summary, e.g. an item's stock shown on several lines. */
  distinctBy?: (row: T) => string | number;
  /** number columns: add up in the summary. */
  sum?: boolean;
  /** False for action columns: no filter, no sort. */
  filterable?: boolean;
  /** Header and cells stay in view when the grid scrolls sideways. */
  sticky?: boolean;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  /** Client-side paging with these page sizes; none = every row. */
  pageSizes?: number[];
  emptyText?: string;
  /** What a row is called in the count, e.g. "line". */
  noun?: string;
  /** Hide the summary row (it is on by default). */
  noSummary?: boolean;
  /** Hide the filter row, for one-row grids. */
  noFilters?: boolean;
}

type Sort = { id: string; dir: 1 | -1 } | null;

/**
 * The table every tab uses: a filter under each header matching its data
 * type, click a header to sort, a summary row (row count, and quantity totals
 * with sheets weighed into Kg and Nos kept apart), and optional paging.
 * Filters and the summary always cover every matching row, not just the page.
 */
export function DataGrid<T>({ rows, columns, rowKey, onRowClick, rowClassName, pageSizes, emptyText, noun = 'row', noSummary, noFilters }: Props<T>) {
  const [filters, setFilters] = useState<Record<string, FilterValue>>({});
  const [sort, setSort] = useState<Sort>(null);
  const [pageSize, setPageSize] = useState(pageSizes?.[0] ?? Infinity);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const active = columns.filter((c) => isActive(filters[c.id]));
    let out = active.length ? rows.filter((r) => active.every((c) => matches(c.value(r), filters[c.id]!))) : rows;
    if (sort) {
      const col = columns.find((c) => c.id === sort.id);
      if (col) out = [...out].sort((a, b) => sort.dir * compareValues(col.value(a), col.value(b)));
    }
    return out;
  }, [rows, columns, filters, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => setPage(1), [filters, pageSize, rows]);
  const current = Math.min(page, pages);
  const shown = Number.isFinite(pageSize) ? filtered.slice((current - 1) * pageSize, current * pageSize) : filtered;
  const anyFilter = columns.some((c) => isActive(filters[c.id]));

  const setFilter = (id: string, f: FilterValue) => setFilters((s) => ({ ...s, [id]: f }));
  const toggleSort = (id: string) =>
    setSort((s) => (s?.id !== id ? { id, dir: 1 } : s.dir === 1 ? { id, dir: -1 } : null));

  return (
    <div className="data-grid">
      {anyFilter && (
        <div className="filter-note">
          {columns.filter((c) => isActive(filters[c.id])).map((c) => c.header).join(', ')} filtered.{' '}
          <button type="button" className="btn btn-small btn-ghost link" onClick={() => setFilters({})}>Clear filters</button>
        </div>
      )}
      <div className="table-wrap">
        <table className={`dense erp-grid${onRowClick ? ' clickable' : ''}`}>
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = c.filterable !== false;
                const dir = sort?.id === c.id ? sort.dir : 0;
                return (
                  <th
                    key={c.id}
                    className={[isNumeric(c.type) ? 'num' : '', c.sticky ? 'sticky-right' : '', sortable ? 'sortable' : ''].join(' ').trim() || undefined}
                    onClick={sortable ? () => toggleSort(c.id) : undefined}
                    aria-sort={dir === 1 ? 'ascending' : dir === -1 ? 'descending' : undefined}
                    title={sortable ? 'Click to sort' : undefined}
                  >
                    {c.header}
                    {dir !== 0 && <span className="sort-mark">{dir === 1 ? ' ▲' : ' ▼'}</span>}
                  </th>
                );
              })}
            </tr>
            {!noFilters && (
              <tr className="filter-row">
                {columns.map((c) => (
                  <th key={c.id} className={c.sticky ? 'sticky-right' : undefined}>
                    {c.filterable !== false && (
                      <FilterInput type={c.type} header={c.header} value={filters[c.id] ?? emptyFilter(c.type)} onChange={(f) => setFilter(c.id, f)} />
                    )}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={rowKey(r)}
                className={rowClassName?.(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                          e.preventDefault();
                          onRowClick(r);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={[c.className, isNumeric(c.type) ? 'num' : '', c.sticky ? 'sticky-right' : ''].filter(Boolean).join(' ') || undefined}
                    title={c.className?.includes('clip') ? String(c.value(r) ?? '') : undefined}
                  >
                    {c.render ? c.render(r) : defaultCell(c, r)}
                  </td>
                ))}
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={columns.length} className="empty">
                  {rows.length && anyFilter ? 'No row matches the filters.' : emptyText ?? 'Nothing to show.'}
                </td>
              </tr>
            )}
          </tbody>
          {!noSummary && filtered.length > 0 && (
            <tfoot>
              <tr className="summary-row">
                {columns.map((c, i) => (
                  <td key={c.id} className={[isNumeric(c.type) ? 'num' : '', c.sticky ? 'sticky-right' : ''].filter(Boolean).join(' ') || undefined}>
                    {i === 0 ? (
                      <span className="summary-count">
                        {filtered.length.toLocaleString('en-IN')} {filtered.length === 1 ? noun : plural(noun)}
                        {anyFilter && <span className="muted"> of {rows.length.toLocaleString('en-IN')}</span>}
                      </span>
                    ) : (
                      <ColumnSummary column={c} rows={filtered} />
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {pageSizes && (
        <div className="pager">
          <span className="page-sizes">
            {pageSizes.map((n) => (
              <button key={n} type="button" className={`btn btn-small${n === pageSize ? ' active' : ''}`} onClick={() => setPageSize(n)} aria-pressed={n === pageSize}>
                {n}
              </button>
            ))}
          </span>
          <button type="button" className="btn" disabled={current <= 1} onClick={() => setPage(current - 1)}>← Previous</button>
          <span>Page {current} of {pages}</span>
          <button type="button" className="btn" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

function plural(noun: string) {
  return /(s|x|ch|sh)$/.test(noun) ? `${noun}es` : `${noun}s`;
}

function isNumeric(type: ColumnType) {
  return type === 'number' || type === 'qty';
}

function defaultCell<T>(c: Column<T>, r: T): ReactNode {
  const v = c.value(r);
  if (v === null || v === undefined) return '';
  return isNumeric(c.type) && typeof v === 'number' ? formatQty(v) : String(v);
}

function ColumnSummary<T>({ column, rows }: { column: Column<T>; rows: T[] }) {
  const unique = useMemo(() => {
    if (!column.distinctBy) return rows;
    const seen = new Set<string | number>();
    return rows.filter((r) => {
      const k = column.distinctBy!(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [rows, column]);

  if (column.qty) {
    const s = summarizeQty(unique.map(column.qty));
    const parts: ReactNode[] = [];
    if (s.kg || !s.others.length) {
      parts.push(
        <div key="kg" title={s.sheets ? `Includes ${formatQty(s.sheets)} Sheet weighed as ${formatQty(s.sheetKg)} Kg (GSM × size)` : undefined}>
          <strong>{formatQty(s.kg)}</strong> Kg{s.sheets ? <span className="muted">*</span> : null}
        </div>,
      );
    }
    for (const o of s.others) {
      parts.push(<div key={o.unit}><strong>{formatQty(o.total)}</strong> {o.unit}</div>);
    }
    return <>{parts}</>;
  }
  if (column.sum && column.type === 'number') {
    const total = unique.reduce((acc, r) => acc + (Number(column.value(r)) || 0), 0);
    return <strong>{formatQty(total)}</strong>;
  }
  return null;
}

function FilterInput({ type, header, value, onChange }: { type: ColumnType; header: string; value: FilterValue; onChange: (f: FilterValue) => void }) {
  if (value.kind === 'text') {
    return (
      <input
        type="search"
        className="filter-input"
        placeholder="Contains…"
        aria-label={`Filter ${header}`}
        value={value.text}
        onChange={(e) => onChange({ kind: 'text', text: e.target.value })}
      />
    );
  }
  if (value.kind === 'number') {
    return (
      <input
        type="text"
        className="filter-input filter-number"
        placeholder="= > <"
        title={NUMBER_FILTER_HELP}
        aria-label={`Filter ${header}`}
        value={value.value}
        onChange={(e) => onChange({ kind: 'number', value: e.target.value.replace(/[^0-9.,<>=!\-≥≤≠ ]/g, '') })}
      />
    );
  }
  return (
    <span className="filter-pair" data-type={type}>
      <select aria-label={`${header} comparison`} value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as DateOp })}>
        {DATE_OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
      </select>
      <input type="date" className="filter-input" aria-label={`Filter ${header}`} value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} />
    </span>
  );
}
