import type { IssueWarning } from './types';

/** Every failed API call becomes one of these. `code` follows docs/issue-tool-api.md §2. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly warnings: IssueWarning[];
  readonly details: { path: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    extra: { warnings?: IssueWarning[]; details?: { path: string; message: string }[] } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.warnings = extra.warnings ?? [];
    this.details = extra.details ?? [];
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get needsAcknowledgement(): boolean {
    return this.code === 'WARNINGS_NOT_ACKNOWLEDGED';
  }

  /** The request may not have reached the server, or failed after it: safe to retry with the same request ID. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.code === 'VOUCHER_NUMBER_CONFLICT';
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
