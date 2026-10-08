import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DATE_OPS, NUMBER_FILTER_HELP, compareValues, emptyFilter, isActive, matches, summarizeQty,
  type ColumnType, type DateOp, type FilterValue, type QtyValue,
} from '../lib/grid';
import { formatDate } from '../lib/format';
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
  /** Relative column width. The grid always fits the window; long values are cut short with … and shown on hover. */
  width?: number;
  /** qty columns: the quantity with its unit, for the Kg total (sheets weighed). */
  qty?: (row: T) => QtyValue;
  /** Count each key once in the total, e.g. an item's stock shown on several lines. */
  distinctBy?: (row: T) => string | number;
  /** number columns: add up in the summary. */
  sum?: boolean;
  /** False for action columns: no filter, no sort. */
  filterable?: boolean;
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
  /** Show at most this many rows; the rest scroll inside the grid, under its fixed header and totals. */
  maxRows?: number;
}

type Sort = { id: string; dir: 1 | -1 } | null;

/** Default relative widths by data type. */
const DEFAULT_WIDTH: Record<ColumnType, number> = { text: 7, number: 4, qty: 6.8, date: 6.5 };

/**
 * The table every tab uses. It always fits the window width (fixed column
 * widths, compact rows, long values cut short with … and shown on hover), and
 * its header and filter row stay at the top while the page scrolls. A filter
 * under each header matches its data type, a header click sorts, and the
 * totals row gives the row count and, for quantity columns, the total in Kg
 * (sheets weighed in; Nos, Ltr, Mtr and other units left out). Filters and
 * totals always cover every matching row, not just the page.
 */
export function DataGrid<T>({ rows, columns, rowKey, onRowClick, rowClassName, pageSizes, emptyText, noun = 'row', noSummary, noFilters, maxRows }: Props<T>) {
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

  const widths = useMemo(() => {
    const w = columns.map((c) => c.width ?? DEFAULT_WIDTH[c.type]);
    const total = w.reduce((a, b) => a + b, 0);
    return w.map((x) => `${((x / total) * 100).toFixed(3)}%`);
  }, [columns]);

  // maxRows: the scroll box is as tall as the header, maxRows body rows and the totals.
  const tableRef = useRef<HTMLTableElement>(null);
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!maxRows || !table) return;
    const rowH = table.tBodies[0]?.rows[0]?.offsetHeight || 20;
    setMaxHeight((table.tHead?.offsetHeight ?? 0) + rowH * maxRows + (table.tFoot?.offsetHeight ?? 0) + 1);
  }, [maxRows, shown.length, columns, noSummary, noFilters]);

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
      <div className={maxRows ? 'grid-scroll' : undefined} style={maxRows ? { maxHeight } : undefined}>
        <table ref={tableRef} className={`erp-grid${onRowClick ? ' clickable' : ''}`}>
          <colgroup>
            {columns.map((c, i) => <col key={c.id} style={{ width: widths[i] }} />)}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = c.filterable !== false;
                const dir = sort?.id === c.id ? sort.dir : 0;
                return (
                  <th
                    key={c.id}
                    className={[isNumeric(c.type) ? 'num' : '', sortable ? 'sortable' : ''].join(' ').trim() || undefined}
                    onClick={sortable ? () => toggleSort(c.id) : undefined}
                    aria-sort={dir === 1 ? 'ascending' : dir === -1 ? 'descending' : undefined}
                    title={sortable ? `${c.header}: click to sort` : c.header}
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
                  <th key={c.id}>
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
                    className={[c.className, isNumeric(c.type) ? 'num' : ''].filter(Boolean).join(' ') || undefined}
                    title={hoverText(c, r)}
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
                  <td key={c.id} className={isNumeric(c.type) ? 'num' : undefined}>
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
          <button type="button" className="btn btn-small" disabled={current <= 1} onClick={() => setPage(current - 1)}>← Previous</button>
          <span className="small">Page {current} of {pages}</span>
          <button type="button" className="btn btn-small" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

/** Kg totals to 2 decimals: grams are noise in a total. */
function formatKg(kg: number): string {
  return kg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

/** The full value on hover, since cells are cut short to fit. */
function hoverText<T>(c: Column<T>, r: T): string | undefined {
  if (c.filterable === false) return undefined;
  const v = c.value(r);
  if (v === null || v === undefined || v === '') return undefined;
  if (c.type === 'date') return formatDate(String(v));
  return typeof v === 'number' ? formatQty(v) : String(v);
}

/** Kg only: Kg plus weighed sheets. Other units are left out of the total and listed on hover. */
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
    const notes = [
      s.sheets ? `Includes ${formatQty(s.sheets)} Sheet weighed as ${formatQty(s.sheetKg)} Kg (GSM × size).` : '',
      s.others.length ? `Not in the total: ${s.others.map((o) => `${formatQty(o.total)} ${o.unit}`).join(', ')}.` : '',
    ].filter(Boolean).join(' ');
    return (
      <span className="nowrap" title={notes || undefined}>
        <strong>{formatKg(s.kg)}</strong> Kg{notes ? <span className="muted">*</span> : null}
      </span>
    );
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
        placeholder="🔍"
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
  // Dates need two controls; they open from a compact button so the column can stay narrow.
  const label = value.value ? `${DATE_OPS.find((o) => o.op === value.op)?.label ?? ''} ${formatDate(value.value).slice(0, 6)}` : '📅';
  return (
    <details className="filter-pop" data-type={type}>
      <summary className={value.value ? 'filter-input active' : 'filter-input'} aria-label={`Filter ${header}`}>{label}</summary>
      <div className="filter-pop-body">
        <select aria-label={`${header} comparison`} value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as DateOp })}>
          {DATE_OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
        </select>
        <input type="date" aria-label={`${header} date`} value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} />
        {value.value && <button type="button" className="btn btn-small btn-ghost link" onClick={() => onChange({ ...value, value: '' })}>Clear</button>}
      </div>
    </details>
  );
}
