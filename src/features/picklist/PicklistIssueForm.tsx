import { useCallback, useState } from 'react';
import type { PicklistLine, PostIssueRequest } from '../../api';
import { useSession } from '../../auth/AuthProvider';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IssueDetails, VoucherDateInput, detailsProblems, type IssueDetailsValue } from '../../components/IssueDetails';
import { LinesEditor } from '../../components/LinesEditor';
import { SuccessPanel } from '../../components/SuccessPanel';
import { useBatches } from '../../hooks/useBatches';
import { useIssueSave } from '../../hooks/useIssueSave';
import { formatDate, itemLabel } from '../../lib/format';
import { toRequestLines, totalFor, type DraftLine } from '../../lib/lines';
import { formatQty, qtyWithUnit } from '../../lib/quantity';
import { reloadStockAndCheck } from '../../lib/stale';

interface Props {
  line: PicklistLine;
  onBack: () => void;
  onDone: () => void;
}

export function PicklistIssueForm({ line, onBack, onDone }: Props) {
  const session = useSession();
  const item = line.item;
  const unit = item.stockUnit;
  const batches = useBatches(item.itemId);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [details, setDetails] = useState<IssueDetailsValue>({ floorWarehouseId: null, voucherDate: session.today, remark: '' });
  const [problems, setProblems] = useState<string[]>([]);

  const buildRequest = useCallback((requestId: string): PostIssueRequest => ({
    mode: 'ALLOCATED',
    requestId,
    voucherDate: details.voucherDate,
    picklistDetailId: line.picklistDetailId,
    floorWarehouseId: details.floorWarehouseId!,
    remark: details.remark.trim() || null,
    lines: toRequestLines(lines),
  }), [details, line.picklistDetailId, lines]);

  const prepare = useCallback(() => reloadStockAndCheck(lines, batches.reload), [lines, batches.reload]);
  const save = useIssueSave(buildRequest, prepare);
  const total = totalFor(lines, unit);
  const locked = save.busy || !!save.confirm;

  function onSave() {
    const found = [...(lines.length ? [] : ['Add at least one batch line.']), ...detailsProblems(details, session.today)];
    setProblems(found);
    if (!found.length) void save.open();
  }

  if (save.result) {
    return <SuccessPanel result={save.result} onNewIssue={onDone} />;
  }

  return (
    <div className="issue-form">
      <div className="form-top">
        <button type="button" className="btn" onClick={onBack} disabled={locked}>
          ← Back to list
        </button>
        <span className="muted">Request {save.requestId.slice(0, 8)}</span>
      </div>

      <section className="panel">
        <div className="voucher-row">
          <label>
            Voucher No.
            <input type="text" value="" placeholder="Given on save" readOnly tabIndex={-1} />
          </label>
          <VoucherDateInput value={details} onChange={setDetails} today={session.today} disabled={locked} />
        </div>
        <PicklistLineGrid line={line} />
      </section>

      <LinesEditor
        item={item}
        batches={batches}
        lines={lines}
        onLinesChange={setLines}
        pendingLabel="Pending"
        pending={line.pending}
        addedTowardPending={total}
        context={{ picklistNo: line.picklistNo, jobCardNo: line.jobContentNo ?? line.jobCardNo, jobName: line.jobName, contentName: line.contentName }}
        alreadyIssued={line.issued}
        disabled={locked}
      />

      <section className="panel">
        <IssueDetails value={details} onChange={setDetails} today={session.today} disabled={locked} showDate={false} />
        {problems.length > 0 && (
          <ul className="notice notice-error">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        )}
        <div className="save-row">
          <button type="button" className="btn btn-primary btn-large" onClick={onSave} disabled={locked || !session.canPost}>
            {save.busy && !save.confirm ? 'Checking stock…' : 'Save'}
          </button>
        </div>
      </section>

      {save.confirm && (
        <ConfirmDialog
          state={save.confirm}
          busy={save.busy}
          writesEnabled={session.writesEnabled}
          onAcknowledge={save.setAcknowledged}
          onConfirm={() => void save.save()}
          onCancel={save.cancel}
        >
          <ConfirmSummary line={line} lines={lines} details={details} />
        </ConfirmDialog>
      )}
    </div>
  );
}

/** The picklist line being issued, with the ERP issue screen's columns. */
function PicklistLineGrid({ line }: { line: PicklistLine }) {
  const item = line.item;
  return (
    <div className="table-wrap">
      <table className="dense erp-grid">
        <thead>
          <tr>
            <th>Picklist No</th>
            <th>Client</th>
            <th>PWO No</th>
            <th>Division</th>
            <th>Job Name</th>
            <th>Content Name</th>
            <th>Item Code</th>
            <th>Item Group</th>
            <th>Quality</th>
            <th className="num">GSM</th>
            <th className="num">SizeW</th>
            <th className="num">SizeL</th>
            <th>Manufacturer</th>
            <th>Certification</th>
            <th>Stock Unit</th>
            <th className="num">Physical Stock</th>
            <th className="num">Allocated Stock</th>
            <th className="num">Required Qty</th>
            <th className="num">Issued Qty</th>
            <th className="num">Pending Qty</th>
          </tr>
        </thead>
        <tbody>
          <tr className="selected">
            <td className="mono">{line.picklistNo}</td>
            <td>{line.clientName}</td>
            <td className="mono">{line.jobContentNo ?? line.jobCardNo}</td>
            <td>{line.division}</td>
            <td>{line.jobName}</td>
            <td>{line.contentName}</td>
            <td className="mono">{item.itemCode}</td>
            <td>{item.itemGroupName}</td>
            <td>{item.quality}</td>
            <td className="num">{item.gsm ?? ''}</td>
            <td className="num">{item.sizeW ?? ''}</td>
            <td className="num">{item.sizeL ?? ''}</td>
            <td>{item.manufacturer}</td>
            <td>{item.certification}</td>
            <td>{item.stockUnit}</td>
            <td className="num">{formatQty(item.physicalStock)}</td>
            <td className="num">{formatQty(item.allocatedStock)}</td>
            <td className="num">{formatQty(line.required)}</td>
            <td className="num">{formatQty(line.issued)}</td>
            <td className="num strong">{formatQty(line.pending)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ConfirmSummary({ line, lines, details }: { line: PicklistLine; lines: DraftLine[]; details: IssueDetailsValue }) {
  const unit = line.item.stockUnit;
  const total = totalFor(lines, unit);
  return (
    <div className="confirm-summary">
      <p>
        Allocated issue against <span className="mono">{line.picklistNo}</span> for <span className="mono">{line.jobContentNo}</span> · {line.jobName}
      </p>
      <p><strong>{itemLabel(line.item)}</strong></p>
      <table className="dense">
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.key}>
              <td>{i + 1}</td>
              <td className="mono">{l.batch.batchKey.batchNo ?? '(no batch no.)'}</td>
              <td>{[l.batch.warehouseName, l.batch.binName].filter(Boolean).join(' / ')}</td>
              <td className="num strong">{qtyWithUnit(l.quantity, l.item.stockUnit)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td colSpan={3}>Total (pending {qtyWithUnit(line.pending, unit)})</td>
            <td className="num strong">{qtyWithUnit(total, unit)}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted">Voucher date {formatDate(details.voucherDate)}{details.remark.trim() && ` · Remark: ${details.remark.trim()}`}</p>
    </div>
  );
}
