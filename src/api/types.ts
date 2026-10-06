/**
 * Types for the Stock Issue Tool API. Mirrors docs/issue-tool-api.md, which is
 * the contract; change both together.
 */

export type Site = 'KOL' | 'AHM';
export type IssueMode = 'ALLOCATED' | 'DIRECT';

/** Same sign-in as the production entry tool: ERP username + database, no password. */
export interface LoginRequest {
  username: string;
  database: Site;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: { userId: number; userName: string | null };
  site: Site;
}

export interface SessionInfo {
  user: { userId: number; userName: string | null };
  site: Site;
  companyId: number;
  erpUserId: number | null;
  canPost: boolean;
  writesEnabled: boolean;
  /** Today in India, YYYY-MM-DD. */
  today: string;
}

export interface Item {
  itemId: number;
  itemCode: string | null;
  itemName: string | null;
  itemGroupId: number;
  itemGroupName: string | null;
  quality: string | null;
  gsm: number | null;
  size: string | null;
  sizeW: number | null;
  sizeL: number | null;
  manufacturer: string | null;
  /** ItemMaster.CertificationType, e.g. "NONE", "FSC". */
  certification: string | null;
  stockUnit: string | null;
  physicalStock: number;
  /** ItemMaster.AllocatedStock. */
  allocatedStock: number;
}

export interface PicklistLine {
  picklistDetailId: number;
  picklistTransactionId: number;
  picklistNo: string | null;
  picklistDate: string | null;
  clientName: string | null;
  /** The job's segment, e.g. "Packaging". */
  division: string | null;
  jobBookingId: number;
  jobContentId: number;
  jobCardNo: string | null;
  jobContentNo: string | null;
  jobName: string | null;
  contentName: string | null;
  item: Item;
  required: number;
  issued: number;
  pending: number;
  closed: boolean;
  /** IST wall clock, set on closed lines. */
  closedDate: string | null;
  closedBy: string | null;
}

export interface Page<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number | null;
}

export interface PicklistQuery {
  search: string;
  page: number;
  pageSize: number;
  showFullyIssued: boolean;
  /** Closed lines instead of open ones (the ERP's "Closed Allocation Picklist"). */
  showClosed: boolean;
}

export interface PlannedItem extends Item {
  required: number;
  issued: number;
  pending: number;
}

export interface RequirementGroup {
  itemGroupId: number;
  stockUnit: string | null;
  required: number;
  issued: number;
  pending: number;
}

export interface JobContent {
  jobContentId: number;
  jobBookingId: number;
  jobCardNo: string | null;
  jobContentNo: string | null;
  jobName: string | null;
  contentName: string | null;
  clientName: string | null;
  suggestedDepartmentId: number | null;
  suggestedDepartmentName: string | null;
  plannedItems: PlannedItem[];
  requirementGroups: RequirementGroup[];
}

export interface ItemSearchRow extends Item {
  planned: boolean;
  required?: number;
  issued?: number;
  pending?: number;
  /** Present when searched with jobContentId. */
  pendingForJob?: number;
}

export interface BatchKey {
  parentTransactionId: number;
  warehouseId: number;
  batchNo: string | null;
}

export interface Batch {
  batchKey: BatchKey;
  batchId: number | null;
  supplierBatchNo: string | null;
  batchStock: number;
  grnNo: string | null;
  grnDate: string | null;
  grnVoucherId: number | null;
  warehouseName: string | null;
  binName: string | null;
}

export interface ItemBatches {
  item: Item;
  batches: Batch[];
  batchTotal: number;
  physicalStock: number;
}

export interface FloorWarehouse {
  warehouseName: string;
  bins: { warehouseId: number; binName: string }[];
}

export interface Department {
  departmentId: number;
  departmentName: string | null;
}

export type WarningCode = 'OVER_PICKLIST_PENDING' | 'OVER_JOB_PENDING' | 'OVER_BATCH_STOCK';

export interface IssueWarning {
  code: WarningCode | string;
  lineNo: number | null;
  itemId: number | null;
  quantity: number | null;
  limit: number | null;
  stockUnit: string | null;
  message: string;
}

export interface IssueLineRequest {
  itemId: number;
  parentTransactionId: number;
  warehouseId: number;
  batchNo: string | null;
  quantity: number;
}

export interface PostIssueRequest {
  mode: IssueMode;
  requestId: string;
  voucherDate: string;
  picklistDetailId?: number;
  jobContentId?: number;
  departmentId?: number;
  slipNo?: string | null;
  floorWarehouseId: number;
  remark?: string | null;
  lines: IssueLineRequest[];
  dryRun?: boolean;
  acknowledgeWarnings?: boolean;
}

export type DryRunReason = 'WRITES_DISABLED' | 'REQUESTED';

export interface WouldWrite {
  header: Record<string, unknown> | null;
  lines: Record<string, unknown>[];
  /** The "received on floor" voucher (RFS, VoucherID -53) written with every issue. */
  floorReceipt?: { header?: Record<string, unknown> | null; headers?: Record<string, unknown>[]; lines: Record<string, unknown>[] };
}

export interface PostedIssue {
  status: 'POSTED';
  dryRun: false;
  replayed: boolean;
  transactionId: number;
  voucherNo: string;
  /** The RFS floor-receipt voucher written with the issue. */
  floorReceiptVoucherNo?: string | null;
  voucherDate: string;
  fYear: string;
  lines: { transId: number; transactionDetailId: number }[];
  warnings: IssueWarning[];
  stockRefreshFailed: boolean;
  stockRefreshError?: string;
}

export interface DryRunIssue {
  status: 'DRY_RUN';
  dryRun: true;
  dryRunReason: DryRunReason;
  voucherDate: string;
  fYear: string;
  warnings: IssueWarning[];
  wouldWrite: WouldWrite;
}

export type PostIssueResponse = PostedIssue | DryRunIssue;

export interface HistoryLine {
  transactionDetailId: number;
  transId: number;
  item: Item;
  stockUnit: string | null;
  issueQuantity: number;
  batchNo: string | null;
  warehouseName: string | null;
  binName: string | null;
  floorWarehouseId: number | null;
  floorWarehouseName: string | null;
  floorBinName: string | null;
  picklistTransactionId: number | null;
  picklistNo: string | null;
  itemSubGroupName: string | null;
  machineId: number | null;
  machineName: string | null;
  /** The line's own job content (a line can differ from its header). */
  jobContentId: number | null;
  jobContentNo: string | null;
  jobName: string | null;
  contentName: string | null;
  clientName: string | null;
}

export interface HistoryIssue {
  transactionId: number;
  voucherNo: string | null;
  voucherDate: string | null;
  mode: IssueMode;
  jobCardNo: string | null;
  jobContentNo: string | null;
  jobName: string | null;
  contentName: string | null;
  clientName: string | null;
  departmentId: number | null;
  departmentName: string | null;
  slipNo: string | null;
  remark: string | null;
  totalQuantity: number;
  createdBy: { userId: number | null; userName: string | null };
  createdDate: string | null;
  createdByIssueTool: boolean;
  canDelete: boolean;
  deleteBlockedReason: string | null;
  lines: HistoryLine[];
}

export interface HistoryResponse {
  from: string;
  to: string;
  rows: HistoryIssue[];
  /** More issues matched than one response carries; narrow the dates. */
  truncated?: boolean;
}

export type DeleteIssueResponse =
  | {
      status: 'DELETED';
      dryRun: false;
      transactionId: number;
      voucherNo: string | null;
      itemIds: number[];
      stockRefreshFailed: boolean;
      stockRefreshError?: string;
    }
  | {
      status: 'DRY_RUN';
      dryRun: true;
      dryRunReason: DryRunReason;
      transactionId: number;
      voucherNo: string | null;
      itemIds: number[];
      wouldWrite: WouldWrite;
    };

export type ClosePicklistLineResponse =
  | { status: 'CLOSED'; dryRun: false; picklistDetailId: number; picklistNo: string | null }
  | {
      status: 'DRY_RUN';
      dryRun: true;
      dryRunReason: DryRunReason;
      picklistDetailId: number;
      picklistNo: string | null;
      wouldWrite: { line: Record<string, unknown> | null };
    };

export interface RefreshStockResponse {
  ok: true;
  transactionId: number;
  mode: 'TRANSACTION' | 'ITEMS';
  itemIds: number[];
}

/** Every call the app makes. One implementation talks HTTP, the other is the mock. */
export interface IssueToolApi {
  readonly isMock: boolean;
  login(request: LoginRequest): Promise<LoginResponse>;
  logout(): Promise<void>;
  session(): Promise<SessionInfo>;
  picklists(query: PicklistQuery): Promise<Page<PicklistLine>>;
  closePicklistLine(picklistDetailId: number): Promise<ClosePicklistLineResponse>;
  jobContents(search: string): Promise<{ rows: JobContent[] }>;
  items(search: string, jobContentId?: number): Promise<{ rows: ItemSearchRow[] }>;
  batches(itemId: number): Promise<ItemBatches>;
  floorWarehouses(): Promise<{ warehouses: FloorWarehouse[] }>;
  departments(): Promise<{ departments: Department[] }>;
  postIssue(request: PostIssueRequest): Promise<PostIssueResponse>;
  issues(from?: string, to?: string): Promise<HistoryResponse>;
  deleteIssue(transactionId: number): Promise<DeleteIssueResponse>;
  refreshStock(transactionId: number): Promise<RefreshStockResponse>;
}
