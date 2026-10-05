import { useCallback, useRef, useState } from 'react';
import { api, errorMessage, type IssueWarning, type PostIssueRequest, type PostIssueResponse } from '../api';
import { attemptSave } from '../lib/save';
import { newRequestId } from '../lib/uuid';

export interface ConfirmState {
  warnings: IssueWarning[];
  acknowledged: boolean;
  error: string | null;
  /** Set when the stock reload just before the dialog found lines above their batch. */
  staleNotice: string | null;
}

/**
 * The save flow of one issue form.
 *
 * - The request ID is created when the form opens and kept for every attempt,
 *   including the resend after acknowledging warnings and any retry after an
 *   error. Only "New issue" makes a new one.
 * - `prepare` runs first (reload batch stock) and may return a notice for the
 *   confirmation dialog.
 * - The first attempt never acknowledges. If the server answers with
 *   warnings, the dialog shows them and the next attempt acknowledges.
 */
export function useIssueSave(buildRequest: (requestId: string) => PostIssueRequest, prepare: () => Promise<string | null>) {
  const [requestId, setRequestId] = useState(newRequestId);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PostIssueResponse | null>(null);
  // Guards a double click that lands before React has re-rendered the button
  // as disabled. The server would answer the duplicate with the same voucher
  // anyway; this just avoids sending it.
  const inFlight = useRef(false);

  const open = useCallback(async () => {
    setBusy(true);
    try {
      const staleNotice = await prepare();
      setConfirm({ warnings: [], acknowledged: false, error: null, staleNotice });
    } catch (err) {
      setConfirm({ warnings: [], acknowledged: false, error: errorMessage(err), staleNotice: null });
    } finally {
      setBusy(false);
    }
  }, [prepare]);

  const save = useCallback(async () => {
    if (!confirm || inFlight.current) return;
    inFlight.current = true;
    const acknowledge = confirm.warnings.length > 0 && confirm.acknowledged;
    setBusy(true);
    setConfirm({ ...confirm, error: null });
    const outcome = await attemptSave(api, buildRequest(requestId), acknowledge);
    inFlight.current = false;
    setBusy(false);
    switch (outcome.kind) {
      case 'saved':
        setResult(outcome.result);
        setConfirm(null);
        break;
      case 'warnings':
        setConfirm({ ...confirm, warnings: outcome.warnings, acknowledged: false, error: null });
        break;
      case 'unauthorized':
        setConfirm({ ...confirm, error: 'Your session expired. Sign in again, then press Confirm again — nothing has been saved twice.' });
        break;
      case 'error':
        setConfirm({ ...confirm, error: errorMessage(outcome.error) });
        break;
    }
  }, [confirm, buildRequest, requestId]);

  const setAcknowledged = useCallback((acknowledged: boolean) => {
    setConfirm((c) => (c ? { ...c, acknowledged } : c));
  }, []);

  const cancel = useCallback(() => {
    if (!busy) setConfirm(null);
  }, [busy]);

  const reset = useCallback(() => {
    setResult(null);
    setConfirm(null);
    setRequestId(newRequestId());
  }, []);

  return { requestId, confirm, busy, result, open, save, setAcknowledged, cancel, reset };
}
