import type { ReactNode } from 'react';
import { Modal } from './Modal';
import type { ConfirmState } from '../hooks/useIssueSave';

interface Props {
  state: ConfirmState;
  busy: boolean;
  writesEnabled: boolean;
  onAcknowledge: (value: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}

/** Last look before saving. Warnings from the server appear here and must be ticked. */
export function ConfirmDialog({ state, busy, writesEnabled, onAcknowledge, onConfirm, onCancel, children }: Props) {
  const hasWarnings = state.warnings.length > 0;
  const blocked = busy || (hasWarnings && !state.acknowledged);
  return (
    <Modal
      title={hasWarnings ? 'Check the warnings' : 'Confirm issue'}
      onClose={busy ? undefined : onCancel}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Back to form
          </button>
          <button type="button" className={`btn ${hasWarnings ? 'btn-warn' : 'btn-primary'}`} onClick={onConfirm} disabled={blocked} autoFocus>
            {busy ? 'Saving…' : hasWarnings ? 'Issue anyway' : writesEnabled ? 'Confirm and save' : 'Confirm (dry run)'}
          </button>
        </>
      }
    >
      {!writesEnabled && <p className="notice notice-dry">Dry run: the server will test this issue and roll it back. Nothing is saved.</p>}
      {state.staleNotice && <p className="notice notice-warn">{state.staleNotice}</p>}
      {children}
      {hasWarnings && (
        <div className="warnings">
          <h3>Warnings</h3>
          <ul>
            {state.warnings.map((w, i) => (
              <li key={i} className={w.code === 'OVER_BATCH_STOCK' ? 'warning-strong' : undefined}>
                <span className="warning-code">{w.code.replace(/_/g, ' ').toLowerCase()}</span> {w.message}
              </li>
            ))}
          </ul>
          <label className="ack">
            <input type="checkbox" checked={state.acknowledged} onChange={(e) => onAcknowledge(e.target.checked)} disabled={busy} />
            I have read these warnings and want to issue anyway.
          </label>
        </div>
      )}
      {state.error && <p className="notice notice-error" role="alert">{state.error}</p>}
    </Modal>
  );
}
