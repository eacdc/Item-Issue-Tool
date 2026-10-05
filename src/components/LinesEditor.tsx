import { useEffect, useRef, useState } from 'react';
import type { Batch, Item, ItemBatches } from '../api';
import { BatchTable } from './BatchTable';
import { QtyInput } from './QtyInput';
import { addLine, remaining, removeLine, takenFromBatch, totalsByUnit, type DraftLine } from '../lib/lines';
import { formatQty, parseQuantity, qtyWithUnit } from '../lib/quantity';

interface Props {
  item: Item;
  batches: { data: ItemBatches | null; loading: boolean; error: string | null; reload: () => Promise<unknown> };
  lines: DraftLine[];
  onLinesChange: (lines: DraftLine[]) => void;
  /** What the quantity is measured against: the picklist's or the job's pending figure. */
  pendingLabel: string;
  pending: number;
  /** How much of the lines already counts toward `pending`. */
  addedTowardPending: number;
  disabled?: boolean;
}

/**
 * Pick a batch, type a quantity, Add. Several batches make several lines; the
 * running total is shown against the pending quantity, always with its unit.
 */
export function LinesEditor({ item, batches, lines, onLinesChange, pendingLabel, pending, addedTowardPending, disabled }: Props) {
  const [selected, setSelected] = useState<Batch | null>(null);
  const [qtyText, setQtyText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const unit = item.stockUnit;

  // A different item starts a fresh selection.
  useEffect(() => {
    setSelected(null);
    setQtyText('');
    setError(null);
  }, [item.itemId]);

  function choose(batch: Batch) {
    setSelected(batch);
    const left = remaining(pending, addedTowardPending);
    setQtyText(left > 0 ? String(left) : '');
    setError(null);
    requestAnimationFrame(() => qtyRef.current?.focus());
  }

  function add() {
    if (!selected) {
      setError('Click a batch first.');
      return;
    }
    const quantity = parseQuantity(qtyText);
    if (quantity === null) {
      setError(`Enter a quantity greater than zero, in ${unit ?? 'the stock unit'}, with at most 3 decimals.`);
      qtyRef.current?.focus();
      return;
    }
    onLinesChange(addLine(lines, item, selected, quantity));
    setSelected(null);
    setQtyText('');
    setError(null);
  }

  const over = addedTowardPending > pending;
  const totals = totalsByUnit(lines);

  return (
    <section className="panel">
      <div className="panel-title">
        <h3>Batches of {item.itemCode}</h3>
        <span className="muted">
          {batches.data && (
            <>
              Batch total {qtyWithUnit(batches.data.batchTotal, unit)}
              {Math.abs(batches.data.batchTotal - batches.data.physicalStock) > 0.001 && (
                <span className="text-warn"> · item master says {qtyWithUnit(batches.data.physicalStock, unit)}</span>
              )}
            </>
          )}
        </span>
        <button type="button" className="btn btn-small" onClick={() => void batches.reload()} disabled={batches.loading}>
          {batches.loading ? 'Loading…' : 'Reload stock'}
        </button>
      </div>

      {batches.error && <p className="notice notice-error">{batches.error}</p>}
      {batches.data ? (
        <BatchTable
          batches={batches.data.batches}
          unit={unit}
          selected={selected?.batchKey ?? null}
          takenFrom={(key) => takenFromBatch(lines, item.itemId, key)}
          onSelect={choose}
        />
      ) : (
        !batches.error && <p className="muted">Loading batches…</p>
      )}

      <div className="add-row">
        <div className="add-row-batch">
          {selected ? (
            <>
              <span className="label">Batch</span> <span className="mono">{selected.batchKey.batchNo ?? '(no batch no.)'}</span>{' '}
              <span className="muted">holds {qtyWithUnit(selected.batchStock, unit)}</span>
            </>
          ) : (
            <span className="muted">Click a batch above to issue from it.</span>
          )}
        </div>
        <QtyInput ref={qtyRef} value={qtyText} onChange={setQtyText} unit={unit} onEnter={add} invalid={!!error} disabled={disabled || !selected} />
        <button type="button" className="btn btn-primary" onClick={add} disabled={disabled || !selected}>
          Add
        </button>
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}

      {lines.length > 0 && (
        <div className="table-wrap">
          <table className="dense">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Batch no.</th>
                <th>Warehouse / bin</th>
                <th className="num">Quantity</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.key}>
                  <td>{i + 1}</td>
                  <td>{l.item.itemCode}</td>
                  <td className="mono">{l.batch.batchKey.batchNo ?? '—'}</td>
                  <td>{[l.batch.warehouseName, l.batch.binName].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="num strong">{qtyWithUnit(l.quantity, l.item.stockUnit)}</td>
                  <td>
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => onLinesChange(removeLine(lines, l.key))} disabled={disabled}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={`running-total${over ? ' is-over' : addedTowardPending === pending && pending > 0 ? ' is-exact' : ''}`}>
        <span>
          Total{' '}
          <strong>{totals.length ? totals.map((t) => qtyWithUnit(t.total, t.stockUnit)).join(' + ') : qtyWithUnit(0, unit)}</strong>
        </span>
        <span>
          {pendingLabel} <strong>{qtyWithUnit(pending, unit)}</strong>
        </span>
        <span>
          {over ? (
            <>Over by <strong>{qtyWithUnit(addedTowardPending - pending, unit)}</strong></>
          ) : (
            <>Left <strong>{formatQty(remaining(pending, addedTowardPending))} {unit}</strong></>
          )}
        </span>
      </div>
    </section>
  );
}
