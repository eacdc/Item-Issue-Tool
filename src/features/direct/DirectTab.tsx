import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage, type ItemSearchRow, type JobContent, type PostIssueRequest } from '../../api';
import { useSession } from '../../auth/AuthProvider';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IssueDetails, detailsProblems, type IssueDetailsValue } from '../../components/IssueDetails';
import { LinesEditor } from '../../components/LinesEditor';
import { IssueLinesTable, type LinesContext } from '../../components/IssueLinesTable';
import { SuccessPanel } from '../../components/SuccessPanel';
import { useBatches } from '../../hooks/useBatches';
import { useDebounced } from '../../hooks/useDebounced';
import { useIssueSave } from '../../hooks/useIssueSave';
import { useDepartments } from '../../hooks/useLookups';
import { formatDate, itemLabel } from '../../lib/format';
import { removeLine, toRequestLines, totalFor, totalsByUnit, unitKey, type DraftLine } from '../../lib/lines';
import { qtyWithUnit } from '../../lib/quantity';
import { reloadStockAndCheck } from '../../lib/stale';

/** Each new issue remounts the form, which gives it a fresh request ID. */
export function DirectTab() {
  const [formKey, setFormKey] = useState(0);
  return <DirectIssueForm key={formKey} onNewIssue={() => setFormKey((k) => k + 1)} />;
}

function DirectIssueForm({ onNewIssue }: { onNewIssue: () => void }) {
  const session = useSession();
  const [content, setContent] = useState<JobContent | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [item, setItem] = useState<ItemSearchRow | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [slipNo, setSlipNo] = useState('');
  const [details, setDetails] = useState<IssueDetailsValue>({ floorWarehouseId: null, voucherDate: session.today, remark: '' });
  const [problems, setProblems] = useState<string[]>([]);
  const batches = useBatches(item?.itemId ?? null);

  const buildRequest = useCallback((requestId: string): PostIssueRequest => ({
    mode: 'DIRECT',
    requestId,
    voucherDate: details.voucherDate,
    jobContentId: content!.jobContentId,
    departmentId: departmentId!,
    slipNo: slipNo.trim() || null,
    floorWarehouseId: details.floorWarehouseId!,
    remark: details.remark.trim() || null,
    lines: toRequestLines(lines),
  }), [content, departmentId, slipNo, details, lines]);

  const prepare = useCallback(() => reloadStockAndCheck(lines, batches.reload), [lines, batches.reload]);
  const save = useIssueSave(buildRequest, prepare);
  const locked = save.busy || !!save.confirm;

  function chooseContent(c: JobContent) {
    setContent(c);
    setDepartmentId(c.suggestedDepartmentId);
    setItem(null);
  }

  function changeContent() {
    if (lines.length && !window.confirm('Change the job? The lines added so far will be removed.')) return;
    setContent(null);
    setItem(null);
    setLines([]);
  }

  function onSave() {
    const found = [
      ...(content ? [] : ['Choose the job content.']),
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

  return (
    <div className="issue-form">
      <div className="form-top">
        <span className="muted">Request {save.requestId.slice(0, 8)}</span>
      </div>

      {!content ? (
        <JobContentSearch onSelect={chooseContent} />
      ) : (
        <>
          <ContentSummary content={content} onChange={changeContent} disabled={locked} />
          <DepartmentPicker value={departmentId} onChange={setDepartmentId} suggested={content.suggestedDepartmentId} disabled={locked} />
          <ItemPicker content={content} selected={item} onSelect={setItem} disabled={locked} />
          {item && (
            <LinesEditor
              item={item}
              batches={batches}
              lines={lines}
              onLinesChange={setLines}
              pendingLabel={item.planned ? 'Job pending' : 'Job pending (same group & unit)'}
              pending={pending}
              addedTowardPending={added}
              context={directContext(content)}
              disabled={locked}
            />
          )}
          {!item && lines.length > 0 && <LinesOnly lines={lines} content={content} onLinesChange={setLines} disabled={locked} />}

          <section className="panel">
            <div className="details-grid">
              <label>
                Slip No.
                <input type="text" maxLength={100} value={slipNo} onChange={(e) => setSlipNo(e.target.value)} disabled={locked} placeholder="Blank: the voucher number is used" />
              </label>
            </div>
            <IssueDetails value={details} onChange={setDetails} today={session.today} disabled={locked} />
            {problems.length > 0 && <ul className="notice notice-error">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
            <div className="save-row">
              <button type="button" className="btn btn-primary btn-large" onClick={onSave} disabled={locked || !session.canPost}>
                {save.busy && !save.confirm ? 'Checking stock…' : 'Save'}
              </button>
            </div>
          </section>
        </>
      )}

      {save.confirm && content && (
        <ConfirmDialog
          state={save.confirm}
          busy={save.busy}
          writesEnabled={session.writesEnabled}
          onAcknowledge={save.setAcknowledged}
          onConfirm={() => void save.save()}
          onCancel={save.cancel}
        >
          <DirectConfirmSummary content={content} departmentId={departmentId} lines={lines} slipNo={slipNo} details={details} />
        </ConfirmDialog>
      )}
    </div>
  );
}

function JobContentSearch({ onSelect }: { onSelect: (c: JobContent) => void }) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const [rows, setRows] = useState<JobContent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (debounced.length < 3) {
      setRows(null);
      return;
    }
    let alive = true;
    setLoading(true);
    api.jobContents(debounced).then(
      (r) => alive && (setRows(r.rows), setError(null), setLoading(false)),
      (err) => alive && (setError(errorMessage(err)), setLoading(false)),
    );
    return () => {
      alive = false;
    };
  }, [debounced]);

  return (
    <section className="panel">
      <h3>Job content</h3>
      <div className="toolbar">
        <input
          type="search"
          className="search"
          placeholder="Job card number, e.g. J06482"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <span className="muted">{loading ? 'Searching…' : debounced.length < 3 ? 'Type at least 3 characters' : rows ? `${rows.length} found` : ''}</span>
      </div>
      {error && <p className="notice notice-error">{error}</p>}
      {rows && (
        <div className="table-wrap">
          <table className="dense clickable">
            <thead>
              <tr>
                <th>Content no.</th>
                <th>Job</th>
                <th>Content</th>
                <th>Client</th>
                <th>Planned items</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.jobContentId} onClick={() => onSelect(c)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(c)}>
                  <td className="mono">{c.jobContentNo}</td>
                  <td>{c.jobName}</td>
                  <td>{c.contentName}</td>
                  <td>{c.clientName}</td>
                  <td>{c.plannedItems.map((p) => p.itemCode).join(', ') || <span className="muted">none</span>}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="empty">No job content matches.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ContentSummary({ content, onChange, disabled }: { content: JobContent; onChange: () => void; disabled: boolean }) {
  return (
    <section className="panel summary">
      <div className="panel-title">
        <h3>
          <span className="mono">{content.jobContentNo}</span> · {content.jobName}
          {content.contentName && <span className="muted"> · {content.contentName}</span>}
        </h3>
        <span className="muted">{content.clientName}</span>
        <button type="button" className="btn btn-small" onClick={onChange} disabled={disabled}>Change job</button>
      </div>
      <table className="dense">
        <thead>
          <tr>
            <th>Planned item</th>
            <th>Quality / GSM / size</th>
            <th className="num">Required</th>
            <th className="num">Issued</th>
            <th className="num">Pending</th>
          </tr>
        </thead>
        <tbody>
          {content.plannedItems.map((p) => (
            <tr key={p.itemId}>
              <td><span className="mono">{p.itemCode}</span> <span className="muted">{p.itemName}</span></td>
              <td>{[p.quality, p.gsm && `${p.gsm} gsm`, p.size, p.manufacturer].filter(Boolean).join(' · ')}</td>
              <td className="num">{qtyWithUnit(p.required, p.stockUnit)}</td>
              <td className="num">{qtyWithUnit(p.issued, p.stockUnit)}</td>
              <td className="num strong">{qtyWithUnit(p.pending, p.stockUnit)}</td>
            </tr>
          ))}
          {!content.plannedItems.length && (
            <tr><td colSpan={5} className="empty">No planned material on this content.</td></tr>
          )}
        </tbody>
      </table>
      {content.requirementGroups.some((g) => content.plannedItems.find((p) => p.itemGroupId === g.itemGroupId && unitKey(p.stockUnit) === unitKey(g.stockUnit))?.issued !== g.issued) && (
        <p className="muted">
          Including substitutes already issued, pending is{' '}
          {content.requirementGroups.map((g) => qtyWithUnit(g.pending, g.stockUnit)).join(', ')}.
        </p>
      )}
    </section>
  );
}

function DepartmentPicker({ value, onChange, suggested, disabled }: { value: number | null; onChange: (id: number | null) => void; suggested: number | null; disabled: boolean }) {
  const { data, error } = useDepartments();
  return (
    <section className="panel">
      <div className="details-grid">
        <label>
          <span>Department <span className="req">*</span></span>
          <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} disabled={disabled || !data}>
            <option value="">{data ? 'Choose…' : 'Loading…'}</option>
            {data?.map((d) => (
              <option key={d.departmentId} value={d.departmentId}>
                {d.departmentName}{d.departmentId === suggested ? ' (suggested)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="notice notice-error">Departments could not be loaded: {error}</p>}
    </section>
  );
}

function ItemPicker({ content, selected, onSelect, disabled }: { content: JobContent; selected: ItemSearchRow | null; onSelect: (i: ItemSearchRow) => void; disabled: boolean }) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const [rows, setRows] = useState<ItemSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = debounced.length >= 2 ? debounced : '';
    let alive = true;
    setLoading(true);
    api.items(term, content.jobContentId).then(
      (r) => alive && (setRows(r.rows), setError(null), setLoading(false)),
      (err) => alive && (setError(errorMessage(err)), setLoading(false)),
    );
    return () => {
      alive = false;
    };
  }, [debounced, content.jobContentId]);

  return (
    <section className="panel">
      <div className="panel-title">
        <h3>Item</h3>
        <input
          type="search"
          className="search"
          placeholder="Search for a substitute: code, name, quality, GSM, size…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled}
        />
        <span className="muted">{loading ? 'Searching…' : ''}</span>
      </div>
      {error && <p className="notice notice-error">{error}</p>}
      <div className="table-wrap">
        <table className="dense clickable">
          <thead>
            <tr>
              <th />
              <th>Code</th>
              <th>Name</th>
              <th>Group</th>
              <th>Quality / GSM / size</th>
              <th>Mfr.</th>
              <th className="num">Phys. stock</th>
              <th className="num">Job pending</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.itemId}
                className={selected?.itemId === r.itemId ? 'selected' : undefined}
                onClick={() => !disabled && onSelect(r)}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && !disabled && onSelect(r)}
              >
                <td>{r.planned ? <span className="badge">planned</span> : <span className="badge badge-sub">substitute</span>}</td>
                <td className="mono">{r.itemCode}</td>
                <td>{r.itemName}</td>
                <td>{r.itemGroupName}</td>
                <td>{[r.quality, r.gsm && `${r.gsm} gsm`, r.size].filter(Boolean).join(' · ')}</td>
                <td>{r.manufacturer}</td>
                <td className="num">{qtyWithUnit(r.physicalStock, r.stockUnit)}</td>
                <td className="num">{qtyWithUnit(r.pendingForJob ?? 0, r.stockUnit)}</td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={8} className="empty">{debounced.length >= 2 ? 'No item matches.' : 'No planned items. Search for the item to issue.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function directContext(content: JobContent): LinesContext {
  return { jobCardNo: content.jobContentNo ?? content.jobCardNo, jobName: content.jobName, contentName: content.contentName };
}

function LinesOnly({ lines, content, onLinesChange, disabled }: { lines: DraftLine[]; content: JobContent; onLinesChange: (lines: DraftLine[]) => void; disabled: boolean }) {
  return (
    <section className="panel">
      <h3>Lines</h3>
      <IssueLinesTable lines={lines} context={directContext(content)} onRemove={(key) => onLinesChange(removeLine(lines, key))} disabled={disabled} />
      <p className="muted">{lines.length} line(s): {totalsByUnit(lines).map((t) => qtyWithUnit(t.total, t.stockUnit)).join(' + ')}. Pick an item to add more.</p>
    </section>
  );
}

function DirectConfirmSummary({ content, departmentId, lines, slipNo, details }: { content: JobContent; departmentId: number | null; lines: DraftLine[]; slipNo: string; details: IssueDetailsValue }) {
  const { data: departments } = useDepartments();
  const dept = departments?.find((d) => d.departmentId === departmentId);
  return (
    <div className="confirm-summary">
      <p>
        Direct issue to <span className="mono">{content.jobContentNo}</span> · {content.jobName} · department <strong>{dept?.departmentName ?? departmentId}</strong>
      </p>
      <table className="dense">
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.key}>
              <td>{i + 1}</td>
              <td>{itemLabel(l.item)}</td>
              <td className="mono">{l.batch.batchKey.batchNo ?? '(no batch no.)'}</td>
              <td className="num strong">{qtyWithUnit(l.quantity, l.item.stockUnit)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td colSpan={3}>Total</td>
            <td className="num strong">{totalsByUnit(lines).map((t) => qtyWithUnit(t.total, t.stockUnit)).join(' + ')}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted">
        Voucher date {formatDate(details.voucherDate)} · Slip No. {slipNo.trim() || '(the voucher number)'}
        {details.remark.trim() && ` · Remark: ${details.remark.trim()}`}
      </p>
    </div>
  );
}
