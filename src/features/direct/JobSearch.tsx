import { useMemo, useState } from 'react';
import { api, errorMessage, type JobContent, type JobSearch as JobSearchFilters, type JobStatus, type PlannedItem } from '../../api';
import { useSession } from '../../auth/AuthProvider';
import { DataGrid, type Column } from '../../components/DataGrid';
import { dateColumn, numberColumn, textColumn } from '../../components/columns';
import { useClients, useSalesPersons } from '../../hooks/useLookups';
import { addDays } from '../../lib/format';
import { asKg, asRunningMeters, asSheets, buildJobRows, type JobRow } from '../../lib/jobRows';

type DatePreset = 'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'custom';

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'custom', label: 'Custom range…' },
];

const STATUS_LABEL: Record<JobStatus, string> = { pending: 'Pending', closed: 'Closed', cancelled: 'Cancelled' };

interface FormState {
  jobNo: string;
  clientName: string;
  salesPersonId: string;
  datePreset: DatePreset;
  fromDate: string;
  toDate: string;
  jobStatus: '' | JobStatus;
}

const EMPTY: FormState = { jobNo: '', clientName: '', salesPersonId: '', datePreset: 'all', fromDate: '', toDate: '', jobStatus: '' };

/** Kept between visits, so "Change job" comes back to the same search and results. */
let lastForm: FormState = EMPTY;
let lastResult: { rows: JobContent[]; truncated: boolean } | null = null;

/** The date range a preset stands for, in IST days. */
export function presetRange(preset: DatePreset, today: string, custom: { from: string; to: string }): { from: string | null; to: string | null } {
  const monthStart = `${today.slice(0, 8)}01`;
  switch (preset) {
    case 'all': return { from: null, to: null };
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'last7': return { from: addDays(today, -6), to: today };
    case 'last30': return { from: addDays(today, -29), to: today };
    case 'thisMonth': return { from: monthStart, to: today };
    case 'lastMonth': {
      const lastDay = addDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
    case 'custom': return { from: custom.from || null, to: custom.to || null };
  }
}

/**
 * Find the job content for a direct issue, with the Job Card Generator's
 * filters (job number, client, sales person, job date, job status) and the
 * ERP's "Exist Job Card" columns. A row whose paper has already been issued
 * is shown green. Clicking a row picks the content and its paper.
 */
export function JobSearch({ onSelect }: { onSelect: (content: JobContent, item: PlannedItem | null) => void }) {
  const session = useSession();
  const [form, setFormState] = useState<FormState>(lastForm);
  const [result, setResult] = useState(lastResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: clients } = useClients();
  const { data: salesPersons } = useSalesPersons();

  const setForm = (patch: Partial<FormState>) => setFormState((f) => (lastForm = { ...f, ...patch }));

  async function search() {
    const range = presetRange(form.datePreset, session.today, { from: form.fromDate, to: form.toDate });
    const filters: JobSearchFilters = {
      search: form.jobNo.trim(),
      clientName: form.clientName.trim(),
      salesPersonId: form.salesPersonId ? Number(form.salesPersonId) : null,
      fromDate: range.from,
      toDate: range.to,
      jobStatus: form.jobStatus || null,
    };
    if (!filters.search && !filters.clientName && !filters.salesPersonId && !filters.fromDate && !filters.toDate) {
      setError('Enter a job number, or choose a client, sales person or job date.');
      return;
    }
    if (filters.search && filters.search.length < 3) {
      setError('Type at least 3 characters of the job number.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await api.jobContents(filters);
      lastResult = { rows: r.rows, truncated: !!r.truncated };
      setResult(lastResult);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setFormState((lastForm = EMPTY));
    setResult((lastResult = null));
    setError(null);
  }

  const rows = useMemo(() => buildJobRows(result?.rows ?? []), [result]);

  return (
    <section className="panel">
      <form
        className="job-filters"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label>
          Job Booking No
          <input type="search" placeholder="Job number, e.g. J07553" value={form.jobNo} onChange={(e) => setForm({ jobNo: e.target.value })} autoFocus />
        </label>
        <label>
          Client Name
          <input type="search" list="issue-tool-clients" placeholder={clients ? 'Select…' : 'Loading…'} value={form.clientName} onChange={(e) => setForm({ clientName: e.target.value })} />
          <datalist id="issue-tool-clients">
            {clients?.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
        <label>
          Sales Person
          <select value={form.salesPersonId} onChange={(e) => setForm({ salesPersonId: e.target.value })}>
            <option value="">{salesPersons ? 'All' : 'Loading…'}</option>
            {salesPersons?.map((s) => <option key={s.ledgerId} value={s.ledgerId}>{s.ledgerName}</option>)}
          </select>
        </label>
        <label>
          Job Date
          <select value={form.datePreset} onChange={(e) => setForm({ datePreset: e.target.value as DatePreset })}>
            {DATE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        {form.datePreset === 'custom' && (
          <>
            <label>
              From
              <input type="date" value={form.fromDate} max={form.toDate || session.today} onChange={(e) => setForm({ fromDate: e.target.value })} />
            </label>
            <label>
              To
              <input type="date" value={form.toDate} min={form.fromDate || undefined} max={session.today} onChange={(e) => setForm({ toDate: e.target.value })} />
            </label>
          </>
        )}
        <label>
          Job Status
          <select value={form.jobStatus} onChange={(e) => setForm({ jobStatus: e.target.value as FormState['jobStatus'] })}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <div className="job-filter-buttons">
          <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
          <button type="button" className="btn" onClick={clear} disabled={loading}>Clear filters</button>
        </div>
      </form>

      {error && <p className="notice notice-error">{error}</p>}
      {result?.truncated && <p className="notice notice-warn">Only the newest 500 job contents are shown. Narrow the search to see the rest.</p>}

      {result && (
        <DataGrid
          rows={rows}
          columns={JOB_COLUMNS}
          rowKey={(r) => r.key}
          onRowClick={(r) => onSelect(r.content, r.item)}
          rowClassName={(r) => ((r.item?.issued ?? 0) > 0 ? 'row-started' : undefined)}
          pageSizes={[30, 100, 500]}
          noun="row"
          emptyText="No job content matches."
        />
      )}
    </section>
  );
}

const zeroIfNoItem = (r: JobRow, f: (p: PlannedItem) => number) => (r.item ? f(r.item) : null);

const JOB_COLUMNS: Column<JobRow>[] = [
  dateColumn<JobRow>('released', 'Released Date', (r) => r.content.releasedDate ?? null),
  textColumn<JobRow>('bookingNo', 'Booking No', (r) => r.content.jobCardNo, { className: 'mono', width: 8 }),
  textColumn<JobRow>('jobCardNo', 'Job Card No', (r) => r.content.jobContentNo, { className: 'mono', width: 9 }),
  textColumn<JobRow>('jobName', 'Job Name', (r) => r.content.jobName, { width: 12 }),
  textColumn<JobRow>('contentName', 'Content Name', (r) => r.content.contentName, { width: 8 }),
  textColumn<JobRow>('client', 'Client Name', (r) => r.content.clientName, { width: 9 }),
  textColumn<JobRow>('itemCode', 'Item Code', (r) => r.item?.itemCode ?? null, { className: 'mono', width: 5.5 }),
  numberColumn<JobRow>('reqSheets', 'Required Sheets', (r) => zeroIfNoItem(r, (p) => asSheets(p, p.required)), { sum: true, width: 5 }),
  numberColumn<JobRow>('reqKg', 'Required Kg', (r) => zeroIfNoItem(r, (p) => asKg(p, p.required)), { sum: true, width: 5 }),
  numberColumn<JobRow>('reqRm', 'Required Running Meter', (r) => zeroIfNoItem(r, (p) => asRunningMeters(p, p.required)), { sum: true, width: 5.5 }),
  numberColumn<JobRow>('issQty', 'Issued Qty', (r) => r.item?.issued ?? null, { width: 4.5 }),
  numberColumn<JobRow>('issKg', 'Issued KG', (r) => zeroIfNoItem(r, (p) => asKg(p, p.issued)), { sum: true, width: 5 }),
  numberColumn<JobRow>('issRm', 'Issued Running Meter', (r) => zeroIfNoItem(r, (p) => asRunningMeters(p, p.issued)), { sum: true, width: 5.5 }),
  numberColumn<JobRow>('pendQty', 'Pending Qty', (r) => r.item?.pending ?? null, { width: 4.5 }),
  numberColumn<JobRow>('pendKg', 'Pending KG', (r) => zeroIfNoItem(r, (p) => asKg(p, p.pending)), { sum: true, width: 5 }),
  numberColumn<JobRow>('pendRm', 'Pending Running Meter', (r) => zeroIfNoItem(r, (p) => asRunningMeters(p, p.pending)), { sum: true, width: 5.5 }),
  textColumn<JobRow>('status', 'Job Status', (r) => (r.content.jobStatus ? STATUS_LABEL[r.content.jobStatus] : null), { width: 5 }),
];
