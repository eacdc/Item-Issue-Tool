import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage, type ItemSearchRow, type JobContent, type PlannedItem, type PostIssueRequest } from '../../api';
import { useSession } from '../../auth/AuthProvider';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IssueDetails, detailsProblems, type IssueDetailsValue } from '../../components/IssueDetails';
import { LinesEditor } from '../../components/LinesEditor';
import { Modal } from '../../components/Modal';
import { DataGrid, type Column } from '../../components/DataGrid';
import { itemColumns, numberColumn, qtyColumn, textColumn } from '../../components/columns';
import { IssueLinesTable, type LinesContext } from '../../components/IssueLinesTable';
import { SuccessPanel } from '../../components/SuccessPanel';
import { useBatches } from '../../hooks/useBatches';
import { useIssueSave } from '../../hooks/useIssueSave';
import { useDepartments, useMachines, useProcesses } from '../../hooks/useLookups';
import { formatDate, itemLabel } from '../../lib/format';
import { plannedAsSearchRow } from '../../lib/jobRows';
import { removeLine, toRequestLines, totalFor, totalsByUnit, unitKey, type DraftLine, type LineProcess } from '../../lib/lines';
import { qtyWithUnit } from '../../lib/quantity';
import { reloadStockAndCheck } from '../../lib/stale';
import { JobSearch } from './JobSearch';

/** Each new issue remounts the form, which gives it a fresh request ID. */
export function DirectTab() {
  const [formKey, setFormKey] = useState(0);
  return <DirectIssueForm key={formKey} onNewIssue={() => setFormKey((k) => k + 1)} />;
}

/** "Job Consumables" issues to a job content; "Other" issues to no job, as in the ERP. */
type Consumption = 'JOB' | 'OTHER';
/** The ERP's Picklist Type: the job's planned items only, or any item. */
type ItemScope = 'ALLOCATED' | 'ALL';

/**
 * Direct issue, laid out like the ERP's Item Issue (direct) screen: issue
 * no. and date, picklist type, job consumables / other, job card, process,
 * department, machine, required qty; the item grid; stock batch wise; the
 * lines (each with its process and machine); slip no. and date, floor
 * warehouse and bin, remark.
 */
function DirectIssueForm({ onNewIssue }: { onNewIssue: () => void }) {
  const session = useSession();
  const [consumption, setConsumption] = useState<Consumption>('JOB');
  const [scope, setScope] = useState<ItemScope>('ALLOCATED');
  const [jobNoText, setJobNoText] = useState('');
  const [siblings, setSiblings] = useState<JobContent[]>([]);
  const [content, setContent] = useState<JobContent | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [jobLookup, setJobLookup] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  const [processId, setProcessId] = useState<number | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [machineId, setMachineId] = useState<number | null>(null);
  const [item, setItem] = useState<ItemSearchRow | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [slipNo, setSlipNo] = useState('');
  const [slipDate, setSlipDate] = useState(session.today);
  const [details, setDetails] = useState<IssueDetailsValue>({ floorWarehouseId: null, voucherDate: session.today, remark: '' });
  const [problems, setProblems] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const batches = useBatches(item?.itemId ?? null);

  const noJob = consumption === 'OTHER';
  const processes = useProcesses(content?.jobContentId ?? null, noJob || !!content);
  const { data: machines } = useMachines();
  const { data: departments } = useDepartments();

  const process = processes.data?.find((p) => p.processId === processId) ?? null;
  const machine = machines?.find((m) => m.machineId === machineId) ?? null;
  const department = departments?.find((d) => d.departmentId === departmentId) ?? null;
  const lineProcess: LineProcess = {
    processId,
    processName: process?.processName ?? null,
    machineId,
    machineName: machine?.machineName ?? null,
  };

  const buildRequest = useCallback((requestId: string): PostIssueRequest => ({
    mode: 'DIRECT',
    requestId,
    voucherDate: details.voucherDate,
    ...(noJob ? { noJob: true } : { jobContentId: content!.jobContentId }),
    departmentId: departmentId!,
    slipNo: slipNo.trim() || null,
    floorWarehouseId: details.floorWarehouseId!,
    remark: details.remark.trim() || null,
    lines: toRequestLines(lines),
  }), [noJob, content, departmentId, slipNo, details, lines]);

  const prepare = useCallback(() => reloadStockAndCheck(lines, batches.reload), [lines, batches.reload]);
  const save = useIssueSave(buildRequest, prepare);
  const locked = save.busy || !!save.confirm;

  /** Changing the job (or to "Other") drops lines added for the old one, after asking. */
  function okToChangeJob(): boolean {
    if (!lines.length) return true;
    if (!window.confirm('Change the job? The lines added so far will be removed.')) return false;
    setLines([]);
    return true;
  }

  function chooseContent(c: JobContent, paper: PlannedItem | null = null) {
    if (content?.jobContentId !== c.jobContentId && !okToChangeJob()) return;
    setContent(c);
    setJobNoText(c.jobContentNo ?? c.jobCardNo ?? '');
    setDepartmentId(c.suggestedDepartmentId);
    setProcessId(null);
    setMachineId(null);
    setItem(paper ? plannedAsSearchRow(c, paper) : null);
    setJobLookup({ busy: false, message: null });
    // The Job Card list: every content of the same job.
    if (c.jobCardNo && !siblings.some((s) => s.jobContentId === c.jobContentId && s.jobCardNo === c.jobCardNo)) {
      api.jobContents({ search: c.jobCardNo, clientName: '', salesPersonId: null, fromDate: null, toDate: null, jobStatus: null }).then(
        (r) => setSiblings(r.rows.filter((x) => x.jobCardNo === c.jobCardNo)),
        () => setSiblings([c]),
      );
    }
  }

  /** "Click": look up the job number typed. One match opens it; several fill the Job Card list. */
  async function lookUpJobNo() {
    const text = jobNoText.trim();
    if (text.length < 3) {
      setJobLookup({ busy: false, message: 'Type at least 3 characters of the job card number.' });
      return;
    }
    setJobLookup({ busy: true, message: null });
    try {
      const r = await api.jobContents({ search: text, clientName: '', salesPersonId: null, fromDate: null, toDate: null, jobStatus: null });
      const exact = r.rows.find((c) => (c.jobContentNo ?? '').toLowerCase() === text.toLowerCase());
      if (exact || r.rows.length === 1) {
        chooseContent(exact ?? r.rows[0]!);
      } else if (r.rows.length) {
        setSiblings(r.rows);
        setJobLookup({ busy: false, message: `${r.rows.length} job cards match. Choose one in the Job Card list.` });
      } else {
        setJobLookup({ busy: false, message: 'No job card matches.' });
      }
    } catch (err) {
      setJobLookup({ busy: false, message: errorMessage(err) });
    }
  }

  function changeConsumption(next: Consumption) {
    if (next === consumption || !okToChangeJob()) return;
    setConsumption(next);
    setContent(null);
    setSiblings([]);
    setJobNoText('');
    setItem(null);
    setProcessId(null);
    setMachineId(null);
    setScope(next === 'OTHER' ? 'ALL' : 'ALLOCATED');
  }

  function chooseProcess(id: number | null) {
    setProcessId(id);
    const p = processes.data?.find((x) => x.processId === id);
    if (p?.plannedMachineId) setMachineId(p.plannedMachineId);
    if (p?.departmentId && !departmentId) setDepartmentId(p.departmentId);
  }

  function chooseItem(r: ItemSearchRow) {
    setItem(r);
    // An item planned for a process brings that process (and its machine) along, unless one is chosen.
    if (r.processId && !processId) chooseProcess(r.processId);
  }

  // Machines of the chosen department, or all when it has none.
  const machineOptions = useMemo(() => {
    const all = machines ?? [];
    const ofDept = departmentId ? all.filter((m) => m.departmentId === departmentId) : [];
    return ofDept.length ? ofDept : all;
  }, [machines, departmentId]);

  function onSave() {
    const found = [
      ...(noJob || content ? [] : ['Choose the job card.']),
      ...(departmentId ? [] : ['Choose the department.']),
      ...(lines.length ? [] : ['Add at least one batch line.']),
      ...detailsProblems(details, session.today),
    ];
    setProblems(found);
    if (!found.length) void save.open();
  }

  if (save.result) return <SuccessPanel result={save.result} onNewIssue={onNewIssue} />;

  // Pending for the chosen item: its group + unit's pending on the job, less
  // what the form already holds in that group and unit.
  const pending = item?.pendingForJob ?? 0;
  const added = item ? totalFor(lines, item.stockUnit, item.itemGroupId) : 0;
  const required = content && item ? requiredFor(content, item) : null;
  const context: LinesContext = {
    jobCardNo: content ? content.jobContentNo ?? content.jobCardNo : null,
    jobName: content?.jobName ?? null,
    contentName: content?.contentName ?? null,
    departmentName: department?.departmentName ?? null,
    direct: true,
  };

  return (
    <div className="issue-form">
      <section className="panel">
        <div className="direct-header">
          <label>
            Issue No.
            <input type="text" value="" placeholder="Given on save" readOnly tabIndex={-1} />
          </label>
          <label>
            Issue Date
            <input type="date" value={details.voucherDate} max={session.today} disabled={locked} onChange={(e) => setDetails({ ...details, voucherDate: e.target.value })} />
          </label>
          <fieldset className="radio-group" disabled={locked}>
            <legend>Picklist Type</legend>
            <label className="inline">
              <input type="radio" name="scope" checked={scope === 'ALLOCATED'} disabled={noJob} onChange={() => setScope('ALLOCATED')} title="The job's planned items" /> Job Allocated
            </label>
            <label className="inline">
              <input type="radio" name="scope" checked={scope === 'ALL'} onChange={() => setScope('ALL')} title="Every item in stock, filterable by column" /> All
            </label>
          </fieldset>
          <fieldset className="radio-group" disabled={locked}>
            <legend>Issue For</legend>
            <label className="inline">
              <input type="radio" name="consumption" checked={!noJob} onChange={() => changeConsumption('JOB')} /> Job Consumables
            </label>
            <label className="inline">
              <input type="radio" name="consumption" checked={noJob} onChange={() => changeConsumption('OTHER')} /> Other
            </label>
          </fieldset>
          <div className="direct-refresh">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setRefreshKey((k) => k + 1);
                void batches.reload();
              }}
              disabled={locked}
            >
              ⟳ Refresh
            </button>
          </div>

          <label className="job-no">
            Job Card No.
            <span className="job-no-row">
              <input
                type="text"
                value={jobNoText}
                placeholder={noJob ? 'No job: issuing to Other' : 'e.g. J07553_26_27[1_2]'}
                disabled={locked || noJob}
                onChange={(e) => setJobNoText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void lookUpJobNo();
                  }
                }}
              />
              <button type="button" className="btn btn-primary" onClick={() => void lookUpJobNo()} disabled={locked || noJob || jobLookup.busy}>
                {jobLookup.busy ? '…' : 'Click'}
              </button>
              <button type="button" className="btn" onClick={() => setSearchOpen(true)} disabled={locked || noJob} title="Find a job card (Exist Job Card list)">
                ⊞
              </button>
            </span>
          </label>
          <label>
            Process Name
            <select value={processId ?? ''} disabled={locked || !processes.data} onChange={(e) => chooseProcess(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{processes.data ? 'Select--' : !noJob && !content ? 'Choose a job card first' : 'Loading…'}</option>
              {processes.data?.map((p) => <option key={p.processId} value={p.processId}>{p.processName}</option>)}
            </select>
          </label>
          <label>
            <span>Department <span className="req">*</span></span>
            <select value={departmentId ?? ''} disabled={locked || !departments} onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{departments ? 'Select--' : 'Loading…'}</option>
              {departments?.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.departmentName}{content && d.departmentId === content.suggestedDepartmentId ? ' (suggested)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Machine
            <select value={machineId ?? ''} disabled={locked || !machines} onChange={(e) => setMachineId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{machines ? 'Select--' : 'Loading…'}</option>
              {machineOptions.map((m) => <option key={m.machineId} value={m.machineId}>{m.machineName}</option>)}
            </select>
          </label>
          <label>
            Required Qty In (SU)
            <input type="text" readOnly tabIndex={-1} value={required === null ? '' : qtyWithUnit(required, item?.stockUnit)} placeholder={item && content ? 'Not planned' : ''} />
          </label>

          <label className="job-card-select">
            Job Card
            <select
              value={content?.jobContentId ?? ''}
              disabled={locked || noJob || !siblings.length}
              onChange={(e) => {
                const c = siblings.find((s) => s.jobContentId === Number(e.target.value));
                if (c) chooseContent(c);
              }}
            >
              <option value="">Select JobCard--</option>
              {siblings.map((s) => (
                <option key={s.jobContentId} value={s.jobContentId}>
                  {s.jobContentNo} · {s.contentName ?? s.jobName}
                </option>
              ))}
            </select>
          </label>
          {content && (
            <p className="direct-job-summary">
              <strong>{content.jobName}</strong>
              {content.contentName && <span className="muted"> · {content.contentName}</span>}
              {content.clientName && <span className="muted"> · {content.clientName}</span>}
            </p>
          )}
        </div>
        {jobLookup.message && <p className="notice notice-info">{jobLookup.message}</p>}
        {processes.error && <p className="notice notice-error">Processes could not be loaded: {processes.error}</p>}
      </section>

      <DirectItemGrid
        content={content}
        noJob={noJob}
        scope={scope}
        selected={item}
        onSelect={chooseItem}
        refreshKey={refreshKey}
        inThisIssue={(itemId) => lines.filter((l) => l.item.itemId === itemId).reduce((s, l) => s + l.quantity, 0)}
        disabled={locked}
      />

      {item && (
        <LinesEditor
          item={item}
          batches={batches}
          lines={lines}
          onLinesChange={setLines}
          pendingLabel={item.planned ? 'Job pending' : 'Job pending (same group & unit)'}
          pending={pending}
          addedTowardPending={added}
          context={context}
          alreadyIssued={noJob ? undefined : item.issued ?? 0}
          lineProcess={lineProcess}
          direct
          noPending={noJob}
          disabled={locked}
        />
      )}
      {!item && lines.length > 0 && (
        <section className="panel">
          <h3>Lines</h3>
          <IssueLinesTable lines={lines} context={context} onRemove={(key) => setLines(removeLine(lines, key))} disabled={locked} />
          <p className="muted">Pick an item above to add more.</p>
        </section>
      )}

      <section className="panel">
        <div className="details-grid">
          <label>
            Slip No.
            <input type="text" maxLength={100} value={slipNo} onChange={(e) => setSlipNo(e.target.value)} disabled={locked} placeholder="Blank: the issue number is used" />
          </label>
          <label>
            Slip Date
            <input type="date" value={slipDate} max={session.today} onChange={(e) => setSlipDate(e.target.value)} disabled={locked} />
          </label>
        </div>
        <IssueDetails value={details} onChange={setDetails} today={session.today} disabled={locked} showDate={false} />
        {problems.length > 0 && <ul className="notice notice-error">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <div className="save-row">
          <button type="button" className="btn btn-primary btn-large" onClick={onSave} disabled={locked || !session.canPost}>
            {save.busy && !save.confirm ? 'Checking stock…' : 'Save'}
          </button>
        </div>
      </section>

      {searchOpen && (
        <Modal title="Exist Job Card" onClose={() => setSearchOpen(false)} full>
          <JobSearch
            onSelect={(c, paper) => {
              setSearchOpen(false);
              chooseContent(c, paper);
            }}
          />
        </Modal>
      )}

      {save.confirm && (
        <ConfirmDialog
          state={save.confirm}
          busy={save.busy}
          writesEnabled={session.writesEnabled}
          onAcknowledge={save.setAcknowledged}
          onConfirm={() => void save.save()}
          onCancel={save.cancel}
        >
          <DirectConfirmSummary content={noJob ? null : content} departmentName={department?.departmentName ?? null} lines={lines} slipNo={slipNo} details={details} />
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Required for the item on the job: the planned item's own figure, else its group and unit's. */
function requiredFor(content: JobContent, item: ItemSearchRow): number | null {
  const planned = content.plannedItems.find((p) => p.itemId === item.itemId);
  if (planned) return planned.required;
  const group = content.requirementGroups.find((g) => g.itemGroupId === item.itemGroupId && unitKey(g.stockUnit) === unitKey(item.stockUnit));
  return group ? group.required : null;
}

/**
 * The item grid, with the ERP direct screen's columns, searched by the filter
 * box under each column header (no separate search field), as in the ERP.
 * "Job Allocated" lists the job's planned items; "All" (and "Other") lists
 * every item in stock, the job's planned items first, so any item can be
 * found with the column filters and issued.
 */
function DirectItemGrid({ content, noJob, scope, selected, onSelect, refreshKey, inThisIssue, disabled }: {
  content: JobContent | null;
  noJob: boolean;
  scope: ItemScope;
  selected: ItemSearchRow | null;
  onSelect: (i: ItemSearchRow) => void;
  refreshKey: number;
  inThisIssue: (itemId: number) => number;
  disabled: boolean;
}) {
  const [rows, setRows] = useState<ItemSearchRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobContentId = content?.jobContentId;
  const waitingForJob = !noJob && !content;
  const allInStock = scope === 'ALL' || noJob;

  useEffect(() => {
    if (waitingForJob || (!jobContentId && !allInStock)) {
      setRows([]);
      return;
    }
    let alive = true;
    setLoading(true);
    api.items('', jobContentId, allInStock).then(
      (r) => {
        if (!alive) return;
        setRows(r.rows);
        setTruncated(!!r.truncated);
        setError(null);
        setLoading(false);
      },
      (err) => alive && (setError(errorMessage(err)), setLoading(false)),
    );
    return () => {
      alive = false;
    };
  }, [jobContentId, allInStock, waitingForJob, refreshKey]);

  const columns = useMemo<Column<ItemSearchRow>[]>(() => [
    textColumn<ItemSearchRow>('type', 'Type', (r) => (r.planned ? 'Planned' : 'Other'), {
      width: 4.5,
      render: (r) => (r.planned ? <span className="badge">Planned</span> : <span className="muted">Other</span>),
    }),
    textColumn<ItemSearchRow>('process', 'Process Name', (r) => r.processName ?? null, { width: 7 }),
    ...itemColumns<ItemSearchRow>((r) => r, ['code', 'group']),
    textColumn<ItemSearchRow>('subGroup', 'Sub Group', (r) => r.itemSubGroupName ?? null, { width: 6 }),
    ...itemColumns<ItemSearchRow>((r) => r, ['name', 'gsm', 'sizeW', 'sizeL', 'manufacturer'], { sizeW: 'Size W', sizeL: 'Size L' }),
    textColumn<ItemSearchRow>('supplierRef', 'Supplier Reference', (r) => r.supplierReference ?? null, { width: 6 }),
    ...itemColumns<ItemSearchRow>((r) => r, ['unit']),
    qtyColumn<ItemSearchRow>('physical', 'Physical Stock', (r) => r.physicalStock, (r) => r),
    qtyColumn<ItemSearchRow>('allocated', 'Allocated Stock', (r) => r.allocatedStock, (r) => r),
    qtyColumn<ItemSearchRow>('free', 'Free Stock', (r) => r.freeStock ?? r.physicalStock - r.allocatedStock, (r) => r),
    qtyColumn<ItemSearchRow>('incoming', 'Incoming Stock', (r) => r.incomingStock ?? 0, (r) => r),
    qtyColumn<ItemSearchRow>('unapproved', 'Unapproved Stock', (r) => r.unapprovedStock ?? 0, (r) => r),
    numberColumn<ItemSearchRow>('decimals', 'Unit Decimal Place', (r) => r.unitDecimalPlace ?? null, { width: 4.5 }),
    qtyColumn<ItemSearchRow>('issueQty', 'Issue Quantity', (r) => inThisIssue(r.itemId), (r) => r, {
      render: (r) => {
        const q = inThisIssue(r.itemId);
        return q ? <strong>{qtyWithUnit(q, r.stockUnit)}</strong> : '';
      },
    }),
  ], [inThisIssue]);

  const hint = waitingForJob
    ? 'Choose a job card first: type it and press Click, or use ⊞ to find it.'
    : loading
      ? 'Loading…'
      : allInStock
        ? 'No item in stock.'
        : 'No planned items on this job card. Choose "All" in Picklist Type to issue any item in stock.';

  return (
    <section className="panel">
      {!waitingForJob && !allInStock && rows.length > 0 && (
        <p className="muted small grid-note">Planned items of the job. Choose "All" in Picklist Type to issue any other item in stock (substitute or extra).</p>
      )}
      {error && <p className="notice notice-error">{error}</p>}
      {truncated && <p className="notice notice-warn">More items are in stock than can be listed; some are missing from this list.</p>}
      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(r) => r.itemId}
        onRowClick={(r) => !disabled && onSelect(r)}
        rowClassName={(r) => [selected?.itemId === r.itemId ? 'selected' : '', r.planned ? 'row-planned' : ''].filter(Boolean).join(' ') || undefined}
        pageSizes={rows.length > 30 ? [30, 100, 500] : undefined}
        noun="item"
        emptyText={hint}
      />
    </section>
  );
}

function DirectConfirmSummary({ content, departmentName, lines, slipNo, details }: { content: JobContent | null; departmentName: string | null; lines: DraftLine[]; slipNo: string; details: IssueDetailsValue }) {
  return (
    <div className="confirm-summary">
      <p>
        {content ? (
          <>Direct issue to <span className="mono">{content.jobContentNo}</span> · {content.jobName}</>
        ) : (
          <>Issue to <strong>Other</strong> (no job)</>
        )}{' '}
        · department <strong>{departmentName}</strong>
      </p>
      <table className="dense">
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.key}>
              <td>{i + 1}</td>
              <td>{itemLabel(l.item)}</td>
              <td className="mono">{l.batch.batchKey.batchNo ?? '(no batch no.)'}</td>
              <td>{[l.process?.processName, l.process?.machineName].filter(Boolean).join(' · ')}</td>
              <td className="num strong">{qtyWithUnit(l.quantity, l.item.stockUnit)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td colSpan={4}>Total</td>
            <td className="num strong">{totalsByUnit(lines).map((t) => qtyWithUnit(t.total, t.stockUnit)).join(' + ')}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted">
        Issue date {formatDate(details.voucherDate)} · Slip No. {slipNo.trim() || '(the issue number)'}
        {details.remark.trim() && ` · Remark: ${details.remark.trim()}`}
      </p>
    </div>
  );
}
