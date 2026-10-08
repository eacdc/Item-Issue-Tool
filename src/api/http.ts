/**
 * The real API client: the only place in the app that calls fetch.
 */

import { ApiError } from './errors';
import { getToken, setToken } from '../auth/token';
import type {
  IssueSlipFile,
  ClosePicklistLineResponse, DeleteIssueResponse, Department, FloorWarehouse, HistoryResponse, IssueToolApi, ItemBatches, ItemSearchRow,
  JobContent, JobSearch, LoginRequest, Machine, Process, LoginResponse, Page, PicklistLine, PicklistQuery, PostIssueRequest, PostIssueResponse,
  RefreshStockResponse, SalesPerson, SessionInfo,
} from './types';

type UnauthorizedListener = () => void;

export class HttpApi implements IssueToolApi {
  readonly isMock = false;
  private readonly base: string;
  private onUnauthorized: UnauthorizedListener = () => {};

  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  setUnauthorizedListener(listener: UnauthorizedListener) {
    this.onUnauthorized = listener;
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown, { auth = true } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (auth && token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, {
        method,
        headers,
        cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new ApiError(0, 'NETWORK_ERROR',
        'Could not reach the server. Check the connection and try again — retrying a save never creates a second voucher.');
    }

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text.slice(0, 300) };
      }
    }

    if (!response.ok) {
      const payload = (data ?? {}) as { error?: string; code?: string; warnings?: never[]; details?: never[] };
      const error = new ApiError(
        response.status,
        payload.code ?? (response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'FORBIDDEN' : `HTTP_${response.status}`),
        payload.error ?? `The server answered ${response.status}.`,
        { warnings: payload.warnings, details: payload.details },
      );
      if (response.status === 401 && auth) this.onUnauthorized();
      throw error;
    }
    return data as T;
  }

  private tool<T>(method: 'GET' | 'POST', path: string, body?: unknown) {
    return this.request<T>(method, `/api/issue-tool${path}`, body);
  }

  async login(request: LoginRequest): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('POST', '/api/issue-tool/auth/login', request, { auth: false });
    setToken(response.token);
    return response;
  }

  /** The session is a signed token; signing out just forgets it. */
  async logout(): Promise<void> {
    setToken(null);
  }

  session() {
    return this.tool<SessionInfo>('GET', '/session');
  }

  picklists(q: PicklistQuery) {
    const params = new URLSearchParams({
      search: q.search,
      page: String(q.page),
      pageSize: String(q.pageSize),
      showFullyIssued: String(q.showFullyIssued),
      showClosed: String(q.showClosed),
    });
    return this.tool<Page<PicklistLine>>('GET', `/picklists?${params}`);
  }

  closePicklistLine(picklistDetailId: number) {
    return this.tool<ClosePicklistLineResponse>('POST', `/picklists/${picklistDetailId}/close`);
  }

  jobContents(f: JobSearch) {
    const params = new URLSearchParams();
    if (f.search.trim()) params.set('search', f.search.trim());
    if (f.clientName.trim()) params.set('clientName', f.clientName.trim());
    if (f.salesPersonId) params.set('salesPersonId', String(f.salesPersonId));
    if (f.fromDate) params.set('fromDate', f.fromDate);
    if (f.toDate) params.set('toDate', f.toDate);
    if (f.jobStatus) params.set('jobStatus', f.jobStatus);
    return this.tool<{ rows: JobContent[]; truncated?: boolean }>('GET', `/job-contents?${params}`);
  }

  clients() {
    return this.tool<{ clients: string[] }>('GET', '/lookups/clients');
  }

  salesPersons() {
    return this.tool<{ salesPersons: SalesPerson[] }>('GET', '/lookups/sales-persons');
  }

  processes(jobContentId?: number) {
    return this.tool<{ processes: Process[] }>('GET', `/lookups/processes${jobContentId ? `?jobContentId=${jobContentId}` : ''}`);
  }

  machines() {
    return this.tool<{ machines: Machine[] }>('GET', '/lookups/machines');
  }

  items(search: string, jobContentId?: number, inStock = false) {
    const params = new URLSearchParams({ search });
    if (jobContentId) params.set('jobContentId', String(jobContentId));
    if (inStock) params.set('inStock', 'true');
    return this.tool<{ rows: ItemSearchRow[]; truncated?: boolean }>('GET', `/items?${params}`);
  }

  batches(itemId: number) {
    return this.tool<ItemBatches>('GET', `/items/${itemId}/batches`);
  }

  floorWarehouses() {
    return this.tool<{ warehouses: FloorWarehouse[] }>('GET', '/lookups/floor-warehouses');
  }

  departments() {
    return this.tool<{ departments: Department[] }>('GET', '/lookups/departments');
  }

  postIssue(request: PostIssueRequest) {
    return this.tool<PostIssueResponse>('POST', '/issues', request);
  }

  issues(from?: string, to?: string) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return this.tool<HistoryResponse>('GET', `/issues${qs ? `?${qs}` : ''}`);
  }

  deleteIssue(transactionId: number) {
    return this.tool<DeleteIssueResponse>('POST', `/issues/${transactionId}/delete`);
  }

  refreshStock(transactionId: number) {
    return this.tool<RefreshStockResponse>('POST', `/issues/${transactionId}/refresh-stock`);
  }

  /** The Item Issue Slip PDF. Fetched (not linked) because it needs the Authorization header. */
  async issueSlip(transactionId: number): Promise<IssueSlipFile> {
    const headers: Record<string, string> = { Accept: 'application/pdf' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let response: Response;
    try {
      response = await fetch(`${this.base}/api/issue-tool/issues/${transactionId}/slip`, { headers, cache: 'no-store' });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check the connection and try again.');
    }
    if (!response.ok) {
      let payload: { error?: string; code?: string } = {};
      try {
        payload = JSON.parse(await response.text());
      } catch {
        /* not JSON */
      }
      if (response.status === 401) this.onUnauthorized();
      throw new ApiError(response.status, payload.code ?? `HTTP_${response.status}`,
        payload.error ?? `The server answered ${response.status}.`);
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const name = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? `issue-${transactionId}.pdf`;
    return { blob: await response.blob(), fileName: name };
  }
}
