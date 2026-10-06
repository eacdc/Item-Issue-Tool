/**
 * In-browser mock of the API, built from docs/issue-tool-api.md.
 *
 * Seeded with the two issues the backend's acceptance tests rebuild (brief §8):
 *   A. picklist IPIC03454_26_27 line 109873, item P02621 (Sheet), two batches
 *   B. job content J06482_26_27[1_1], planned R01312 (Kg), substitute R01175
 *
 * It behaves like the server where it matters to the UI: warnings and the
 * acknowledgement 409, idempotent request IDs, dry run while writes are off,
 * stock refresh failure, 401 on an expired session. Controls for those live
 * in the header's "Mock" menu.
 */

import { ApiError } from './errors';
import { getToken, setToken } from '../auth/token';
import type {
  Batch, ClosePicklistLineResponse, DeleteIssueResponse, Department, FloorWarehouse, HistoryIssue, HistoryLine, HistoryResponse, IssueToolApi,
  IssueWarning, Item, ItemBatches, ItemSearchRow, JobContent, JobSearch, LoginRequest, Machine, Process, LoginResponse, Page, PicklistLine,
  PicklistQuery, PostIssueRequest, PostIssueResponse, RefreshStockResponse, SalesPerson, SessionInfo,
} from './types';

const WRITES_KEY = 'cdc-issue-tool.mock.writes';
const round = (n: number) => Math.round(n * 1000) / 1000;
const unitKey = (u: string | null) => (u ?? '').trim().toUpperCase();

function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
}

// ── Seed data ───────────────────────────────────────────────────────────────

function item(partial: Partial<Item> & Pick<Item, 'itemId' | 'itemCode' | 'itemGroupId' | 'stockUnit'>): Item {
  return {
    itemName: null, itemGroupName: partial.itemGroupId === 14 ? 'PAPER' : partial.itemGroupId === 2 ? 'REEL' : 'OTHER',
    quality: null, gsm: null, size: null, sizeW: null, sizeL: null, manufacturer: null, certification: 'NONE',
    physicalStock: 0, allocatedStock: 0, ...partial,
  };
}

interface MockBatch extends Batch {
  itemId: number;
}

interface MockContent {
  jobContentId: number;
  jobBookingId: number;
  jobCardNo: string;
  jobContentNo: string;
  jobName: string;
  contentName: string;
  clientName: string;
  departmentId: number;
  planned: { itemId: number; required: number }[];
  /** Mock job card fields for the job search filters. */
  jobBookingDate?: string;
  salesPersonId?: number;
  status?: 'pending' | 'closed' | 'cancelled';
}

interface MockPicklistLine {
  picklistDetailId: number;
  picklistTransactionId: number;
  picklistNo: string;
  picklistDate: string;
  jobContentId: number;
  itemId: number;
  required: number;
  departmentId: number;
  closed?: { date: string; by: string };
}

interface MockIssuedLine {
  transactionId: number;
  itemId: number;
  jobContentId: number;
  picklistTransactionId: number;
  quantity: number;
  batchKey: MockBatch['batchKey'];
}

function seed() {
  const items: Item[] = [
    item({ itemId: 9409, itemCode: 'P02621', itemName: 'SBS BOARD 300GSM 1020X720', itemGroupId: 14, quality: 'SBS', gsm: 300, size: '1020 x 720', sizeW: 1020, sizeL: 720, manufacturer: 'ITC', stockUnit: 'Sheet' }),
    item({ itemId: 9410, itemCode: 'P02622', itemName: 'SBS BOARD 300GSM 1020X720', itemGroupId: 14, quality: 'SBS', gsm: 300, size: '1020 x 720', sizeW: 1020, sizeL: 720, manufacturer: 'Century', stockUnit: 'Sheet' }),
    item({ itemId: 9101, itemCode: 'R01312', itemName: 'KRAFT REEL 120GSM 1000MM', itemGroupId: 2, quality: 'Kraft', gsm: 120, size: '1000', sizeW: 1000, sizeL: 0, manufacturer: 'Mill A', stockUnit: 'Kg' }),
    item({ itemId: 9681, itemCode: 'R01175', itemName: 'KRAFT REEL 120GSM 1000MM', itemGroupId: 2, quality: 'Kraft', gsm: 120, size: '1000', sizeW: 1000, sizeL: 0, manufacturer: 'Mill B', stockUnit: 'Kg' }),
    item({ itemId: 9500, itemCode: 'P03010', itemName: 'ART PAPER 130GSM 635X940', itemGroupId: 14, quality: 'Gloss Art', gsm: 130, size: '635 x 940', sizeW: 635, sizeL: 940, manufacturer: 'JK', stockUnit: 'KG' }),
  ];

  const b = (itemId: number, parent: number, wh: number, whName: string, bin: string, batchNo: string | null, batchId: number, stock: number, grnNo: string | null, grnDate: string | null): MockBatch => ({
    itemId, batchKey: { parentTransactionId: parent, warehouseId: wh, batchNo }, batchId, supplierBatchNo: null, batchStock: stock,
    grnNo, grnDate, grnVoucherId: grnNo ? -14 : null, warehouseName: whName, binName: bin,
  });

  const batches: MockBatch[] = [
    // Test A: the first batch holds exactly 1500, so the issue has to split.
    b(9409, 60325, 17, 'Panchla', 'Paper Rack 2', '60325_PO02095_26_27_9409_1.00', 101864, 1500, 'REC03101_26_27', '2026-08-14'),
    b(9409, 61902, 17, 'Panchla', 'Paper Rack 2', '61902_PO02095_26_27_9409_2.00', 104789, 39256, 'REC03188_26_27', '2026-09-02'),
    b(9410, 61001, 13, 'Panchla', 'Paper Rack 1', '61001_PO02050_26_27_9410_1.00', 102900, 8000, 'REC03140_26_27', '2026-08-21'),
    // Test B: the substitute's only batch.
    b(9681, 52873, 13, 'Panchla', 'Reel Bay', '52873_PO01565_26_27_9681_1.00', 87880, 1240.5, 'REC02870_26_27', '2026-06-30'),
    b(9101, 50110, 13, 'Panchla', 'Reel Bay', '50110_PO01500_26_27_9101_1.00', 85010, 60, 'REC02790_26_27', '2026-06-12'),
    b(9500, 0, 13, 'Panchla', 'Paper Rack 1', null, 0, 420.75, null, null),
  ];

  const contents: MockContent[] = [
    { jobContentId: 24188, jobBookingId: 16077, jobCardNo: 'J06601_26_27', jobContentNo: 'J06601_26_27[1_1]', jobName: 'ACME BISCUIT CARTON 200G', contentName: 'Carton', clientName: 'ACME FOODS PVT LTD', departmentId: 100, planned: [{ itemId: 9409, required: 2958 }] },
    { jobContentId: 23524, jobBookingId: 15607, jobCardNo: 'J06482_26_27', jobContentNo: 'J06482_26_27[1_1]', jobName: 'BETA TEA 100G CARTON', contentName: 'Outer', clientName: 'BETA TEA CO', departmentId: 100, planned: [{ itemId: 9101, required: 68.84 }] },
    { jobContentId: 23525, jobBookingId: 15607, jobCardNo: 'J06482_26_27', jobContentNo: 'J06482_26_27[2_1]', jobName: 'BETA TEA 100G CARTON', contentName: 'Inner leaflet', clientName: 'BETA TEA CO', departmentId: 101, planned: [{ itemId: 9500, required: 120 }] },
  ];

  const picklist: MockPicklistLine[] = [
    { picklistDetailId: 109873, picklistTransactionId: 64534, picklistNo: 'IPIC03454_26_27', picklistDate: '2026-10-01', jobContentId: 24188, itemId: 9409, required: 2958, departmentId: 100 },
  ];
  picklist.push({
    picklistDetailId: 109000, picklistTransactionId: 64390, picklistNo: 'IPIC03390_26_27', picklistDate: '2026-09-20', jobContentId: 24188,
    itemId: 9409, required: 400, departmentId: 100, closed: { date: '2026-09-25T17:05:00', by: 'Admin' },
  });
  // Filler lines so search and paging have something to do.
  const clients = ['GAMMA PHARMA', 'DELTA FMCG', 'EPSILON BOOKS', 'ZETA COSMETICS'];
  for (let i = 0; i < 64; i++) {
    const contentId = 30000 + i;
    contents.push({
      jobContentId: contentId, jobBookingId: 17000 + i, jobCardNo: `J07${String(100 + i).padStart(3, '0')}_26_27`,
      jobContentNo: `J07${String(100 + i).padStart(3, '0')}_26_27[1_1]`, jobName: `${clients[i % 4]} CARTON ${i + 1}`,
      contentName: 'Carton', clientName: clients[i % 4]!, departmentId: 100, planned: [{ itemId: i % 2 ? 9410 : 9500, required: 500 + i * 10 }],
      jobBookingDate: addDays('2026-10-06', -i), salesPersonId: i % 2 ? 501 : 502, status: i % 9 === 0 ? 'closed' : i % 13 === 0 ? 'cancelled' : 'pending',
    });
    picklist.push({
      picklistDetailId: 110000 + i, picklistTransactionId: 64400 + Math.floor(i / 3), picklistNo: `IPIC${String(3420 + Math.floor(i / 3)).padStart(5, '0')}_26_27`,
      picklistDate: addDays('2026-09-09', Math.floor(i / 3)), jobContentId: contentId, itemId: i % 2 ? 9410 : 9500, required: 500 + i * 10, departmentId: 100,
    });
  }

  const warehouses: FloorWarehouse[] = [
    { warehouseName: 'Floor-Panchla', bins: [{ warehouseId: 16, binName: 'Paper' }, { warehouseId: 18, binName: 'Board' }] },
    { warehouseName: 'Floor-Tangra', bins: [{ warehouseId: 20, binName: 'Paper' }] },
  ];
  const departments: Department[] = [
    { departmentId: 100, departmentName: 'PRINTING' },
    { departmentId: 101, departmentName: 'CUTTING' },
    { departmentId: 102, departmentName: 'LAMINATION' },
  ];

  return { items, batches, contents, picklist, warehouses, departments };
}

/**
 * A few ERP-made issues so History has something to show: Sheet, Kg, Nos and
 * Roll lines, one without a job (packing material).
 */
function sampleHistory(): HistoryIssue[] {
  const today = todayIst();
  const it = (partial: Partial<Item> & Pick<Item, 'itemId' | 'itemCode' | 'itemGroupId' | 'stockUnit'>) => item(partial);
  const issue = (n: number, date: string, dept: string, job: [string, string, string, string] | null, user: string,
    lines: [Item, number, string | null, string | null][]): HistoryIssue => ({
    transactionId: 69000 + n, voucherNo: `IS${17400 + n}_26_27`, voucherDate: date, mode: 'DIRECT',
    jobCardNo: job ? job[0].slice(0, 12) : null, jobContentNo: job?.[0] ?? null, jobName: job?.[1] ?? null, contentName: job?.[2] ?? null,
    clientName: job?.[3] ?? null, departmentId: dept === 'PRINTING' ? 100 : 103, departmentName: dept, slipNo: `IS${17400 + n}_26_27`,
    remark: null, totalQuantity: lines.reduce((s, l) => s + l[1], 0), createdBy: { userId: 30 + n, userName: user },
    createdDate: `${date}T13:${String(10 + n).padStart(2, '0')}:00`, createdByIssueTool: false, canDelete: n % 3 !== 0,
    deleteBlockedReason: n % 3 === 0 ? 'Material from this issue has been consumed or returned.' : null,
    lines: lines.map(([i, q, sub, machine], k) => ({
      transactionDetailId: 119000 + n * 10 + k, transId: k + 1, item: i, stockUnit: i.stockUnit, issueQuantity: q,
      batchNo: `5${n}000_PO0${n}_26_27_${i.itemId}_${k + 1}.00`, warehouseName: 'Panchla', binName: 'Paper Rack 1',
      floorWarehouseId: 16, floorWarehouseName: 'Floor-Panchla', floorBinName: 'Paper', picklistTransactionId: null, picklistNo: null,
      itemSubGroupName: sub, machineId: machine ? 15 : null, machineName: machine, jobContentId: job ? 40000 + n : null,
      jobContentNo: job?.[0] ?? null, jobName: job?.[1] ?? null, contentName: job?.[2] ?? null, clientName: job?.[3] ?? null,
    })),
  });
  const fbb = it({ itemId: 7340, itemCode: 'P00734', itemName: 'FBB, 250 GSM, ITC, NONE, 585x914', itemGroupId: 14, quality: 'FBB', gsm: 250, size: '585 x 914', sizeW: 585, sizeL: 914, manufacturer: 'ITC', stockUnit: 'Sheet' });
  const art = it({ itemId: 7008, itemCode: 'P00008', itemName: 'Gloss Art, 90 GSM, Imported, NONE, 635x940', itemGroupId: 14, quality: 'Gloss Art', gsm: 90, size: '635 x 940', sizeW: 635, sizeL: 940, manufacturer: 'Imported', stockUnit: 'Sheet' });
  const reel = it({ itemId: 7473, itemCode: 'R00473', itemName: 'FBB, 350 GSM, Emami, NONE, 1055', itemGroupId: 2, quality: 'FBB', gsm: 350, size: '1055', sizeW: 1055, sizeL: 0, manufacturer: 'Emami', stockUnit: 'Kg' });
  const varnish = it({ itemId: 7910, itemCode: 'V00010', itemName: 'UV-CRYSTAL VARNISH', itemGroupId: 9, itemGroupName: 'VARNISHES & COATINGS', stockUnit: 'Kg' });
  const ink = it({ itemId: 7911, itemCode: 'V00011', itemName: 'Spot, SONAKOTE GREEN 900 GRM', itemGroupId: 9, itemGroupName: 'VARNISHES & COATINGS', stockUnit: 'NOS' });
  const strap = it({ itemId: 7184, itemCode: 'RM00184', itemName: 'AUTOMATIC STRAPING ROLL', itemGroupId: 11, itemGroupName: 'OTHER MATERIAL', stockUnit: 'Roll' });
  const tape = it({ itemId: 7188, itemCode: 'RM00188', itemName: 'BROWN TAPE 3 INCH X 650 MTR', itemGroupId: 11, itemGroupName: 'OTHER MATERIAL', stockUnit: 'Nos' });
  // Filler so History pages: 40 more ERP issues over the last week.
  const filler = Array.from({ length: 40 }, (_, k) =>
    issue(10 + k, addDays(today, -1 - (k % 6)), 'PRINTING',
      [`J07${300 + k}_26_27[1_1]`, `Job number ${k + 1} with a fairly long name`, k % 2 ? 'Carton' : 'Leaflet', k % 3 ? 'Udyogi Plastics Pvt Ltd' : 'Berger Paints India Ltd'],
      k % 2 ? 'Bikram' : 'Biplab', [[k % 3 ? fbb : art, 100 + k * 37, null, null]]));
  return [
    issue(9, today, 'PRINTING', ['J07385_26_27[1_1]', 'Specialty Reminder Card', 'Card', 'Eskag Pharma Pvt Ltd'], 'Bikram', [[fbb, 1, null, null]]),
    issue(8, today, 'PRINTING', ['J07470_26_27[1_2]', 'Folder with Greeting Card', 'Insert 3 kinds Card', 'Eden Realty Ventures'], 'Bikram', [[fbb, 1144, null, null]]),
    issue(7, today, 'PRINTING', ['J07513_26_27[1_2]', 'GLITZ Magazine - October 2026 Issue', 'Inside', 'The Neptune Glitz'], 'Bikram', [[art, 3000, null, null]]),
    issue(6, today, 'PRINTING', ['J06440_26_27[1_1]', '175ml Single Box Dot & Key', 'Crash Lock With Pasting', 'RSH Global Private Ltd'], 'Biplab', [[reel, 1233, 'Reel', 'CD102 - 6L']]),
    issue(5, addDays(today, -1), 'PACKING', null, 'Saugatap', [
      [varnish, 4, 'VARNISHES & COATINGS', null], [ink, 4, 'VARNISHES & COATINGS', null], [strap, 8, 'Packing Materials', null], [tape, 2, 'Packing Materials', null],
    ]),
    ...filler,
  ];
}

// ── The mock ────────────────────────────────────────────────────────────────

export class MockApi implements IssueToolApi {
  readonly isMock = true;
  private data = seed();
  private issued: MockIssuedLine[] = [];
  private history: HistoryIssue[] = sampleHistory();
  private posted = new Map<string, PostIssueResponse>();
  private inFlight = new Map<string, Promise<PostIssueResponse>>();
  private nextVoucherNo = 17255;
  private nextTransactionId = 70001;
  private nextDetailId = 120001;
  private sessionValid = true;
  private onUnauthorized: () => void = () => {};

  /** Mock controls, shown in the header in mock mode. */
  failNextStockRefresh = false;

  get writesEnabled(): boolean {
    return readFlag(WRITES_KEY, false);
  }

  set writesEnabled(value: boolean) {
    writeFlag(WRITES_KEY, value);
  }

  expireSession() {
    this.sessionValid = false;
  }

  setUnauthorizedListener(listener: () => void) {
    this.onUnauthorized = listener;
  }

  private async wait(ms = 250) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async guard() {
    await this.wait();
    if (!getToken() || !this.sessionValid) {
      this.onUnauthorized();
      throw new ApiError(401, 'UNAUTHORIZED', 'Session has expired. Sign in again.');
    }
  }

  private item(itemId: number): Item {
    const found = this.data.items.find((i) => i.itemId === itemId);
    if (!found) throw new ApiError(404, 'UNKNOWN_ITEM', 'The item does not exist.');
    const physicalStock = round(this.data.batches.filter((b) => b.itemId === itemId).reduce((s, b) => s + b.batchStock, 0));
    return {
      ...found, physicalStock, itemSubGroupName: found.itemGroupId === 2 ? 'Reel' : null,
      freeStock: round(physicalStock - found.allocatedStock), incomingStock: found.itemId === 9410 ? 2000 : 0, unapprovedStock: 0,
    };
  }

  private content(id: number): MockContent {
    // 0 is "Other": an issue to no job.
    if (id === 0) return { jobContentId: 0, jobBookingId: 0, jobCardNo: '', jobContentNo: '', jobName: '', contentName: '', clientName: '', departmentId: 0, planned: [] };
    const c = this.data.contents.find((x) => x.jobContentId === id);
    if (!c) throw new ApiError(400, 'UNKNOWN_JOB_CONTENT', 'The job content does not exist or has been deleted.');
    return c;
  }

  private picklistIssued(line: MockPicklistLine) {
    return round(this.issued
      .filter((i) => i.picklistTransactionId === line.picklistTransactionId && i.itemId === line.itemId && i.jobContentId === line.jobContentId)
      .reduce((s, i) => s + i.quantity, 0));
  }

  private requirement(c: MockContent) {
    const plannedItems = c.planned.map((p) => {
      const it = this.item(p.itemId);
      const issued = round(this.issued.filter((i) => i.jobContentId === c.jobContentId && i.itemId === p.itemId).reduce((s, i) => s + i.quantity, 0));
      return { ...it, required: p.required, issued, pending: round(p.required - issued) };
    });
    const groups = new Map<string, { itemGroupId: number; stockUnit: string | null; required: number; issued: number; pending: number }>();
    for (const p of plannedItems) {
      const key = `${p.itemGroupId}|${unitKey(p.stockUnit)}`;
      const g = groups.get(key) ?? { itemGroupId: p.itemGroupId, stockUnit: p.stockUnit, required: 0, issued: 0, pending: 0 };
      g.required += p.required;
      groups.set(key, g);
    }
    for (const i of this.issued.filter((x) => x.jobContentId === c.jobContentId)) {
      const it = this.item(i.itemId);
      const g = groups.get(`${it.itemGroupId}|${unitKey(it.stockUnit)}`);
      if (g) g.issued += i.quantity;
    }
    const requirementGroups = [...groups.values()].map((g) => ({ ...g, required: round(g.required), issued: round(g.issued), pending: round(g.required - g.issued) }));
    return { plannedItems, requirementGroups };
  }

  // ── auth ──

  private userName = 'STORE1';
  private site: 'KOL' | 'AHM' = 'KOL';

  async login(request: LoginRequest): Promise<LoginResponse> {
    await this.wait(400);
    const name = request.username.trim();
    if (!name || name.toLowerCase() === 'nobody') {
      throw new ApiError(401, 'UNKNOWN_USER', `No active ERP user "${name}" in ${request.database}.`);
    }
    const token = `mock-${Math.random().toString(16).slice(2)}`;
    setToken(token);
    this.sessionValid = true;
    this.userName = name.toUpperCase();
    this.site = request.database;
    return {
      token,
      expiresAt: new Date(Date.now() + 12 * 3600000).toISOString(),
      user: { userId: 24, userName: this.userName },
      site: request.database,
    };
  }

  async logout(): Promise<void> {
    setToken(null);
  }

  async session(): Promise<SessionInfo> {
    await this.guard();
    return {
      user: { userId: 24, userName: `${this.userName} (mock)` },
      site: this.site,
      companyId: 2,
      erpUserId: 24,
      canPost: true,
      writesEnabled: this.writesEnabled,
      today: todayIst(),
    };
  }

  // ── reads ──

  async picklists(q: PicklistQuery): Promise<Page<PicklistLine>> {
    await this.guard();
    const s = q.search.trim().toLowerCase();
    const rows = this.data.picklist
      .map((l): PicklistLine => {
        const c = this.content(l.jobContentId);
        const issued = this.picklistIssued(l);
        return {
          picklistDetailId: l.picklistDetailId, picklistTransactionId: l.picklistTransactionId, picklistNo: l.picklistNo,
          picklistDate: l.picklistDate, clientName: c.clientName, division: 'Packaging', jobBookingId: c.jobBookingId, jobContentId: c.jobContentId,
          jobCardNo: c.jobCardNo, jobContentNo: c.jobContentNo, jobName: c.jobName, contentName: c.contentName,
          item: this.item(l.itemId), required: l.required, issued, pending: round(l.required - issued),
          closed: !!l.closed, closedDate: l.closed?.date ?? null, closedBy: l.closed?.by ?? null,
        };
      })
      .filter((r) => r.closed === q.showClosed)
      .filter((r) => q.showClosed || q.showFullyIssued || r.pending > 0)
      .filter((r) => !s || [r.picklistNo, r.jobCardNo, r.jobContentNo, r.jobName, r.contentName, r.clientName, r.division, r.item.itemCode, r.item.itemName]
        .some((v) => (v ?? '').toLowerCase().includes(s)))
      // Newest picklist first, as the server orders them.
      .sort((a, b) => (b.picklistDate ?? '').localeCompare(a.picklistDate ?? '') || b.picklistTransactionId - a.picklistTransactionId || b.picklistDetailId - a.picklistDetailId);
    const start = (q.page - 1) * q.pageSize;
    return { rows: rows.slice(start, start + q.pageSize), page: q.page, pageSize: q.pageSize, total: rows.length };
  }

  async closePicklistLine(picklistDetailId: number): Promise<ClosePicklistLineResponse> {
    await this.guard();
    await this.wait(300);
    const line = this.data.picklist.find((p) => p.picklistDetailId === picklistDetailId);
    if (!line) throw new ApiError(400, 'UNKNOWN_PICKLIST_LINE', 'The picklist line does not exist.');
    if (line.closed) throw new ApiError(409, 'PICKLIST_LINE_CLOSED', 'The picklist line is already closed.');
    const now = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 19);
    if (!this.writesEnabled) {
      return {
        status: 'DRY_RUN', dryRun: true, dryRunReason: 'WRITES_DISABLED', picklistDetailId, picklistNo: line.picklistNo,
        wouldWrite: { line: { TransactionDetailID: picklistDetailId, IsCompleted: true, CompletedBy: 24, CompletedDate: now } },
      };
    }
    line.closed = { date: now, by: 'Admin' };
    return { status: 'CLOSED', dryRun: false, picklistDetailId, picklistNo: line.picklistNo };
  }

  async jobContents(f: JobSearch): Promise<{ rows: JobContent[]; truncated?: boolean }> {
    await this.guard();
    const s = f.search.trim().toLowerCase();
    if (s && s.length < 3) throw new ApiError(400, 'VALIDATION_FAILED', 'search: Type at least 3 characters of the job number.');
    if (!s && !f.clientName.trim() && !f.salesPersonId && !f.fromDate && !f.toDate) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'search: Enter a job number, or choose a client, sales person or job date.');
    }
    const client = f.clientName.trim().toLowerCase();
    const rows = this.data.contents
      .filter((c) => !s || c.jobCardNo.toLowerCase().includes(s) || c.jobContentNo.toLowerCase().includes(s))
      .filter((c) => !client || c.clientName.toLowerCase().includes(client))
      .filter((c) => !f.salesPersonId || (c.salesPersonId ?? 501) === f.salesPersonId)
      .filter((c) => !f.fromDate || (c.jobBookingDate ?? '2026-10-01') >= f.fromDate)
      .filter((c) => !f.toDate || (c.jobBookingDate ?? '2026-10-01') <= f.toDate)
      .filter((c) => !f.jobStatus || (c.status ?? 'pending') === f.jobStatus)
      .slice(0, 500)
      .map((c) => {
        const dept = this.data.departments.find((d) => d.departmentId === c.departmentId);
        return {
          jobContentId: c.jobContentId, jobBookingId: c.jobBookingId, jobCardNo: c.jobCardNo, jobContentNo: c.jobContentNo,
          jobName: c.jobName, contentName: c.contentName, clientName: c.clientName,
          salesPersonName: (c.salesPersonId ?? 501) === 501 ? 'AMIT SHARMA' : 'PRIYA DAS',
          jobBookingDate: c.jobBookingDate ?? '2026-10-01', releasedDate: c.jobBookingDate ?? '2026-10-01', jobStatus: c.status ?? 'pending',
          suggestedDepartmentId: dept?.departmentId ?? null, suggestedDepartmentName: dept?.departmentName ?? null,
          ...this.requirement(c),
        };
      });
    return { rows };
  }

  async clients(): Promise<{ clients: string[] }> {
    await this.guard();
    return { clients: [...new Set(this.data.contents.map((c) => c.clientName))].sort() };
  }

  async salesPersons(): Promise<{ salesPersons: SalesPerson[] }> {
    await this.guard();
    return { salesPersons: [{ ledgerId: 501, ledgerName: 'AMIT SHARMA' }, { ledgerId: 502, ledgerName: 'PRIYA DAS' }] };
  }

  async processes(jobContentId?: number): Promise<{ processes: Process[] }> {
    await this.guard();
    const all: Process[] = [
      { processId: 10337, processName: 'Printing Front Side', departmentId: 100, plannedMachineId: 14 },
      { processId: 10401, processName: 'Lamination', departmentId: 102, plannedMachineId: null },
      { processId: 10510, processName: 'Die Cutting', departmentId: 101, plannedMachineId: 16 },
      { processId: 10620, processName: 'Packing', departmentId: 103, plannedMachineId: null },
    ];
    return { processes: jobContentId ? all.slice(0, 3) : all };
  }

  async machines(): Promise<{ machines: Machine[] }> {
    await this.guard();
    return {
      machines: [
        { machineId: 14, machineName: 'CD102 - 6L', departmentId: 100 },
        { machineId: 15, machineName: 'SM74 - 4C', departmentId: 100 },
        { machineId: 16, machineName: 'Bobst Die Cutter', departmentId: 101 },
        { machineId: 17, machineName: 'Thermal Laminator', departmentId: 102 },
      ],
    };
  }

  async items(search: string, jobContentId?: number): Promise<{ rows: ItemSearchRow[] }> {
    await this.guard();
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!jobContentId && search.trim().length < 2) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'search: Type at least 2 characters, or pass jobContentId.');
    }
    const found = tokens.length
      ? this.data.items
        .filter((it) => tokens.every((t) => [it.itemCode, it.itemName, it.itemGroupName, it.quality, it.manufacturer, it.gsm, it.size]
          .some((v) => String(v ?? '').toLowerCase().includes(t))))
        .map((it) => this.item(it.itemId))
      : [];
    const extras = (it: Item) => ({ supplierReference: null, unitDecimalPlace: unitKey(it.stockUnit) === 'KG' ? 3 : 0 });
    if (!jobContentId) return { rows: found.map((it) => ({ ...it, ...extras(it), planned: false })) };

    const req = this.requirement(this.content(jobContentId));
    const pendingFor = (it: Item) => req.requirementGroups.find((g) => g.itemGroupId === it.itemGroupId && unitKey(g.stockUnit) === unitKey(it.stockUnit))?.pending ?? 0;
    const planned = req.plannedItems.map((p) => ({ ...p, ...extras(p), processId: 10337, processName: 'Printing Front Side', planned: true, pendingForJob: pendingFor(p) }));
    const seen = new Set(planned.map((p) => p.itemId));
    return { rows: [...planned, ...found.filter((f) => !seen.has(f.itemId)).map((f) => ({ ...f, ...extras(f), planned: false, pendingForJob: pendingFor(f) }))] };
  }

  async batches(itemId: number): Promise<ItemBatches> {
    await this.guard();
    const it = this.item(itemId);
    const batches = this.data.batches
      .filter((b) => b.itemId === itemId && b.batchStock > 0)
      .map(({ itemId: _ignored, ...b }) => ({ ...b, batchStock: round(b.batchStock) }));
    return { item: it, batches, batchTotal: round(batches.reduce((s, b) => s + b.batchStock, 0)), physicalStock: it.physicalStock };
  }

  async floorWarehouses() {
    await this.guard();
    return { warehouses: this.data.warehouses };
  }

  async departments() {
    await this.guard();
    return { departments: this.data.departments };
  }

  // ── writes ──

  /** Like the server's applock + log check: concurrent saves of one request ID make one voucher. */
  async postIssue(request: PostIssueRequest): Promise<PostIssueResponse> {
    const running = this.inFlight.get(request.requestId);
    if (running) {
      const first = await running.catch(() => null);
      if (first?.status === 'POSTED') return { ...first, replayed: true };
    }
    const attempt = this.postIssueOnce(request);
    this.inFlight.set(request.requestId, attempt);
    try {
      return await attempt;
    } finally {
      if (this.inFlight.get(request.requestId) === attempt) this.inFlight.delete(request.requestId);
    }
  }

  private async postIssueOnce(request: PostIssueRequest): Promise<PostIssueResponse> {
    await this.guard();
    await this.wait(400);

    const previous = this.posted.get(request.requestId);
    if (previous && previous.status === 'POSTED') return { ...previous, replayed: true };

    if (!request.lines.length) throw new ApiError(400, 'NO_LINES', 'Add at least one batch line.');
    if (request.lines.some((l) => !(l.quantity > 0))) throw new ApiError(400, 'INVALID_QUANTITY', 'Every quantity must be greater than zero.');
    if (!this.data.warehouses.some((w) => w.bins.some((b) => b.warehouseId === request.floorWarehouseId))) {
      throw new ApiError(400, 'UNKNOWN_FLOOR_WAREHOUSE', 'The floor warehouse does not exist or is not a floor warehouse.');
    }
    if (request.voucherDate > todayIst()) throw new ApiError(400, 'VOUCHER_DATE_IN_FUTURE', 'The voucher date cannot be later than today.');

    const batchOf = (l: PostIssueRequest['lines'][number]) => this.data.batches.find((b) => b.itemId === l.itemId
      && b.batchKey.parentTransactionId === l.parentTransactionId && b.batchKey.warehouseId === l.warehouseId
      && (b.batchKey.batchNo ?? '') === (l.batchNo ?? ''));
    request.lines.forEach((l, i) => {
      this.item(l.itemId);
      if (!batchOf(l)) throw new ApiError(400, 'BATCH_NOT_OF_ITEM', `Line ${i + 1} uses a batch that does not belong to its item.`);
    });

    const total = round(request.lines.reduce((s, l) => s + l.quantity, 0));
    const warnings: IssueWarning[] = [];
    let contentId: number;
    let pickLine: MockPicklistLine | undefined;

    if (request.mode === 'ALLOCATED') {
      pickLine = this.data.picklist.find((p) => p.picklistDetailId === request.picklistDetailId);
      if (!pickLine) throw new ApiError(400, 'UNKNOWN_PICKLIST_LINE', 'The picklist line does not exist or has been deleted.');
      if (pickLine.closed) throw new ApiError(409, 'PICKLIST_LINE_CLOSED', 'The picklist line is closed.');
      const line = pickLine;
      if (request.lines.some((l) => l.itemId !== line.itemId)) {
        throw new ApiError(400, 'ITEM_NOT_ON_PICKLIST', "An allocated issue can only issue the picklist line's item. Use Direct issue for a substitute.");
      }
      contentId = line.jobContentId;
      const pending = round(line.required - this.picklistIssued(line));
      const unit = this.item(line.itemId).stockUnit;
      if (total > pending) {
        warnings.push({ code: 'OVER_PICKLIST_PENDING', lineNo: null, itemId: line.itemId, quantity: total, limit: pending, stockUnit: unit,
          message: `Total ${total} ${unit} is more than the picklist's pending ${pending} ${unit}.` });
      }
    } else {
      const c = this.content(request.noJob ? 0 : request.jobContentId ?? -1);
      contentId = c.jobContentId;
      if (!this.data.departments.some((d) => d.departmentId === request.departmentId)) {
        throw new ApiError(400, 'UNKNOWN_DEPARTMENT', 'The department does not exist.');
      }
      if (request.noJob) {
        // No job: nothing to measure an over-issue against.
      } else {
      const req = this.requirement(c);
      const byGroup = new Map<string, { itemGroupId: number; unit: string | null; qty: number }>();
      for (const l of request.lines) {
        const it = this.item(l.itemId);
        const key = `${it.itemGroupId}|${unitKey(it.stockUnit)}`;
        const g = byGroup.get(key) ?? { itemGroupId: it.itemGroupId, unit: it.stockUnit, qty: 0 };
        g.qty = round(g.qty + l.quantity);
        byGroup.set(key, g);
      }
      for (const g of byGroup.values()) {
        const r = req.requirementGroups.find((x) => x.itemGroupId === g.itemGroupId && unitKey(x.stockUnit) === unitKey(g.unit));
        const pending = r ? r.pending : 0;
        if (g.qty > pending) {
          warnings.push({ code: 'OVER_JOB_PENDING', lineNo: null, itemId: null, quantity: g.qty, limit: pending, stockUnit: g.unit,
            message: r
              ? `Total ${g.qty} ${g.unit} is more than the job's pending requirement of ${pending} ${g.unit}.`
              : `The job content has no planned requirement for this item group in ${g.unit}. Issuing ${g.qty} ${g.unit} is all over-issue.` });
        }
        }
      }
    }

    const perBatch = new Map<MockBatch, { first: number; qty: number }>();
    request.lines.forEach((l, i) => {
      const b = batchOf(l)!;
      const e = perBatch.get(b) ?? { first: i + 1, qty: 0 };
      e.qty = round(e.qty + l.quantity);
      perBatch.set(b, e);
    });
    for (const [b, e] of perBatch) {
      if (e.qty > b.batchStock) {
        const unit = this.item(b.itemId).stockUnit;
        warnings.push({ code: 'OVER_BATCH_STOCK', lineNo: e.first, itemId: b.itemId, quantity: e.qty, limit: round(b.batchStock), stockUnit: unit,
          message: `Line ${e.first} takes ${e.qty} ${unit} from batch ${b.batchKey.batchNo ?? '(no batch no.)'}, which holds only ${round(b.batchStock)} ${unit}. This drives the batch negative, and a negative batch silently drops out of physical stock. Check the batch and the quantity before you continue.` });
      }
    }

    if (warnings.length && !request.acknowledgeWarnings) {
      throw new ApiError(409, 'WARNINGS_NOT_ACKNOWLEDGED',
        'This issue has warnings. Read them, tick to acknowledge, and save again with the same request ID.', { warnings });
    }

    const [year, month] = request.voucherDate.split('-').map(Number) as [number, number];
    const start = month >= 4 ? year : year - 1;
    const fYear = `${start}-${start + 1}`;
    const suffix = `_${String(start).slice(-2)}_${String(start + 1).slice(-2)}`;
    const voucherNo = `IS${String(this.nextVoucherNo).padStart(5, '0')}${suffix}`;
    const c = this.content(contentId);
    const header = {
      TransactionID: this.nextTransactionId, VoucherID: -19, VoucherPrefix: 'IS', MaxVoucherNo: this.nextVoucherNo, VoucherNo: voucherNo,
      VoucherDate: `${request.voucherDate}T00:00:00`, DepartmentID: request.mode === 'ALLOCATED' ? pickLine!.departmentId : request.departmentId,
      JobBookingID: request.mode === 'DIRECT' ? 0 : c.jobBookingId, JobBookingJobCardContentsID: contentId, TotalQuantity: total,
      DeliveryNoteNo: request.mode === 'DIRECT' ? (request.slipNo?.trim() || voucherNo) : '', Narration: request.remark ?? '',
      CompanyID: 2, FYear: fYear, UserID: 24, CreatedBy: 24, ModifiedBy: 24, IsDeletedTransaction: 0,
    };
    const rows = request.lines.map((l, i) => {
      const b = batchOf(l)!;
      const it = this.item(l.itemId);
      return {
        TransactionDetailID: this.nextDetailId + i, TransactionID: this.nextTransactionId, TransID: i + 1, ItemGroupID: it.itemGroupId,
        ItemID: l.itemId, StockUnit: it.stockUnit, IssueQuantity: l.quantity, ParentTransactionID: l.parentTransactionId,
        BatchID: b.batchId, BatchNo: l.batchNo, WarehouseID: l.warehouseId, FloorWarehouseID: request.floorWarehouseId,
        JobBookingID: c.jobBookingId, JobBookingJobCardContentsID: contentId,
        PicklistTransactionID: pickLine?.picklistTransactionId ?? 0, MachineID: pickLine ? 14 : l.machineId ?? 0,
        DepartmentID: pickLine?.departmentId ?? 0, ProcessID: pickLine ? 10337 : l.processId ?? 0, PicklistReleaseTransactionID: 0,
      };
    });

    const writes = this.writesEnabled && !request.dryRun;
    if (!writes) {
      const response: PostIssueResponse = {
        status: 'DRY_RUN', dryRun: true, dryRunReason: this.writesEnabled ? 'REQUESTED' : 'WRITES_DISABLED',
        voucherDate: request.voucherDate, fYear, warnings,
        wouldWrite: {
          header,
          lines: rows,
          floorReceipt: {
            header: {
              ConsumptionTransactionID: 36600, VoucherID: -53, VoucherPrefix: 'RFS', MaxVoucherNo: this.nextVoucherNo + 100,
              VoucherNo: `RFS${String(this.nextVoucherNo + 100).padStart(5, '0')}${suffix}`, VoucherDate: header.VoucherDate,
              DepartmentID: header.DepartmentID, JobBookingID: 0, JobBookingJobCardContentsID: contentId,
              ReturnTransactionID: header.TransactionID, TotalQuantity: total, Particular: null, Narration: '',
            },
            lines: rows.map((r) => ({
              ConsumptionTransactionDetailID: 56600 + r.TransID, ConsumptionTransactionID: 36600, TransID: r.TransID,
              ParentTransactionID: r.ParentTransactionID, IssueTransactionID: r.TransactionID, DepartmentID: header.DepartmentID,
              ItemID: r.ItemID, ItemGroupID: r.ItemGroupID, JobBookingID: r.JobBookingID, JobBookingJobCardContentsID: contentId,
              MachineID: r.MachineID, ProcessID: r.ProcessID, ConsumeQuantity: 0, ReturnQuantity: 0, IssueQuantity: 0,
              ReceivedQuantity: r.IssueQuantity, WasteQuantity: 0, StockUnit: r.StockUnit, BatchNo: r.BatchNo, BatchID: r.BatchID,
              WarehouseID: r.WarehouseID, FloorWarehouseID: r.FloorWarehouseID,
            })),
          },
        },
      };
      this.posted.set(request.requestId, response);
      return response;
    }

    const transactionId = this.nextTransactionId++;
    this.nextVoucherNo += 1;
    this.nextDetailId += rows.length;
    request.lines.forEach((l) => {
      const b = batchOf(l)!;
      b.batchStock = round(b.batchStock - l.quantity);
      this.issued.push({ transactionId, itemId: l.itemId, jobContentId: contentId, picklistTransactionId: pickLine?.picklistTransactionId ?? 0, quantity: l.quantity, batchKey: b.batchKey });
    });

    const floor = this.data.warehouses.flatMap((w) => w.bins.map((bin) => ({ ...bin, warehouseName: w.warehouseName })))
      .find((x) => x.warehouseId === request.floorWarehouseId);
    const dept = this.data.departments.find((d) => d.departmentId === header.DepartmentID);
    this.history.unshift({
      transactionId, voucherNo, voucherDate: request.voucherDate, mode: request.mode, jobCardNo: c.jobCardNo,
      jobContentNo: c.jobContentNo, jobName: c.jobName, contentName: c.contentName, clientName: c.clientName, departmentId: dept?.departmentId ?? null,
      departmentName: dept?.departmentName ?? null, slipNo: header.DeliveryNoteNo || null, remark: request.remark || null,
      totalQuantity: total, createdBy: { userId: 24, userName: 'STORE1' }, createdDate: new Date().toISOString().slice(0, 19),
      createdByIssueTool: true, canDelete: true, deleteBlockedReason: null,
      lines: rows.map((r): HistoryLine => {
        const b = batchOf(request.lines[r.TransID - 1]!)!;
        return {
          transactionDetailId: r.TransactionDetailID, transId: r.TransID, item: this.item(r.ItemID), stockUnit: r.StockUnit,
          issueQuantity: r.IssueQuantity, batchNo: r.BatchNo, warehouseName: b.warehouseName, binName: b.binName,
          floorWarehouseId: request.floorWarehouseId, floorWarehouseName: floor?.warehouseName ?? null, floorBinName: floor?.binName ?? null,
          picklistTransactionId: pickLine?.picklistTransactionId ?? null, picklistNo: pickLine?.picklistNo ?? null,
          itemSubGroupName: null, machineId: pickLine ? 14 : null, machineName: pickLine ? 'CD102 - 6L' : null,
          jobContentId: c.jobContentId, jobContentNo: c.jobContentNo, jobName: c.jobName, contentName: c.contentName, clientName: c.clientName,
        };
      }),
    });

    const failRefresh = this.failNextStockRefresh;
    this.failNextStockRefresh = false;
    const response: PostIssueResponse = {
      status: 'POSTED', dryRun: false, replayed: false, transactionId, voucherNo,
      floorReceiptVoucherNo: `RFS${String(this.nextVoucherNo + 99).padStart(5, '0')}${suffix}`,
      voucherDate: request.voucherDate, fYear,
      lines: rows.map((r) => ({ transId: r.TransID, transactionDetailId: r.TransactionDetailID })), warnings,
      stockRefreshFailed: failRefresh,
      ...(failRefresh ? { stockRefreshError: 'Execution Timeout Expired. (mock)' } : {}),
    };
    this.posted.set(request.requestId, response);
    return response;
  }

  async issues(from?: string, to?: string): Promise<HistoryResponse> {
    await this.guard();
    const end = to ?? todayIst();
    const start = from ?? addDays(end, -7);
    return {
      from: start,
      to: end,
      rows: this.history.filter((h) => (h.voucherDate ?? '') >= start && (h.voucherDate ?? '') <= end),
    };
  }

  async deleteIssue(transactionId: number): Promise<DeleteIssueResponse> {
    await this.guard();
    const index = this.history.findIndex((h) => h.transactionId === transactionId);
    const found = this.history[index];
    if (!found) throw new ApiError(404, 'UNKNOWN_ISSUE', 'The issue voucher does not exist.');
    const itemIds = [...new Set(found.lines.map((l) => l.item.itemId))];
    if (!this.writesEnabled) {
      return {
        status: 'DRY_RUN', dryRun: true, dryRunReason: 'WRITES_DISABLED', transactionId, voucherNo: found.voucherNo, itemIds,
        wouldWrite: { header: { TransactionID: transactionId, VoucherNo: found.voucherNo, IsDeletedTransaction: 1, DeletedBy: 24 }, lines: [] },
      };
    }
    for (const line of this.issued.filter((i) => i.transactionId === transactionId)) {
      const b = this.data.batches.find((x) => x.itemId === line.itemId && x.batchKey === line.batchKey);
      if (b) b.batchStock = round(b.batchStock + line.quantity);
    }
    this.issued = this.issued.filter((i) => i.transactionId !== transactionId);
    this.history.splice(index, 1);
    return { status: 'DELETED', dryRun: false, transactionId, voucherNo: found.voucherNo, itemIds, stockRefreshFailed: false };
  }

  async refreshStock(transactionId: number): Promise<RefreshStockResponse> {
    await this.guard();
    await this.wait(600);
    return { ok: true, transactionId, mode: 'TRANSACTION', itemIds: [] };
  }
}
