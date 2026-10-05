/**
 * One save attempt, as the contract defines it (docs/issue-tool-api.md §5.8).
 * The caller keeps the request ID for the life of the form and passes the same
 * one on every attempt; this function never invents one.
 */

import { ApiError } from '../api/errors';
import type { IssueToolApi, IssueWarning, PostIssueRequest, PostIssueResponse } from '../api/types';

export type SaveOutcome =
  | { kind: 'saved'; result: PostIssueResponse }
  | { kind: 'warnings'; warnings: IssueWarning[] }
  | { kind: 'unauthorized'; error: ApiError }
  | { kind: 'error'; error: ApiError | Error };

export async function attemptSave(
  api: Pick<IssueToolApi, 'postIssue'>,
  request: PostIssueRequest,
  acknowledgeWarnings: boolean,
): Promise<SaveOutcome> {
  try {
    const result = await api.postIssue({ ...request, acknowledgeWarnings });
    return { kind: 'saved', result };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.needsAcknowledgement) return { kind: 'warnings', warnings: err.warnings };
      if (err.isUnauthorized) return { kind: 'unauthorized', error: err };
      return { kind: 'error', error: err };
    }
    return { kind: 'error', error: err instanceof Error ? err : new Error(String(err)) };
  }
}
