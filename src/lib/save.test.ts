import { describe, expect, it } from 'vitest';
import { attemptSave } from './save';
import { ApiError } from '../api/errors';
import { MockApi } from '../api/mock';
import type { PostIssueRequest } from '../api/types';

// MockApi checks a token through these; give it a minimal browser-like global.
const store = new Map<string, string>();
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  },
});

async function signedInMock(writes: boolean) {
  const api = new MockApi();
  api.writesEnabled = writes;
  await api.login({ username: 'store1', database: 'KOL' });
  return api;
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const testA: PostIssueRequest = {
  mode: 'ALLOCATED',
  requestId: '3f2b8a52-6c1d-4a8e-9f0b-1d2c3e4f5a6b',
  voucherDate: today,
  picklistDetailId: 109873,
  floorWarehouseId: 16,
  lines: [
    { itemId: 9409, parentTransactionId: 60325, warehouseId: 17, batchNo: '60325_PO02095_26_27_9409_1.00', quantity: 1500 },
    { itemId: 9409, parentTransactionId: 61902, warehouseId: 17, batchNo: '61902_PO02095_26_27_9409_2.00', quantity: 1458 },
  ],
};

const testB: PostIssueRequest = {
  mode: 'DIRECT',
  requestId: '9b1f6c0e-2d7a-4c5b-8e3f-0a1b2c3d4e5f',
  voucherDate: today,
  jobContentId: 23524,
  departmentId: 100,
  slipNo: '',
  floorWarehouseId: 16,
  lines: [{ itemId: 9681, parentTransactionId: 52873, warehouseId: 13, batchNo: '52873_PO01565_26_27_9681_1.00', quantity: 152 }],
};

describe('save flow', () => {
  it('test A: an allocated issue split across two batches saves without warnings', async () => {
    const api = await signedInMock(true);
    const outcome = await attemptSave(api, testA, false);
    expect(outcome.kind).toBe('saved');
    if (outcome.kind !== 'saved' || outcome.result.status !== 'POSTED') throw new Error('expected POSTED');
    expect(outcome.result.voucherNo).toBe('IS17255_26_27');
    expect(outcome.result.lines.map((l) => l.transId)).toEqual([1, 2]);
  });

  it('test B: a substitute over the job requirement needs acknowledging, then saves with the same request id', async () => {
    const api = await signedInMock(true);
    const sent: PostIssueRequest[] = [];
    const spy = { postIssue: (r: PostIssueRequest) => { sent.push(r); return api.postIssue(r); } };

    const first = await attemptSave(spy, testB, false);
    expect(first.kind).toBe('warnings');
    if (first.kind !== 'warnings') throw new Error('expected warnings');
    expect(first.warnings.map((w) => w.code)).toEqual(['OVER_JOB_PENDING']);
    expect(first.warnings[0]!.limit).toBe(68.84);

    const second = await attemptSave(spy, testB, true);
    expect(second.kind).toBe('saved');
    expect(sent.map((r) => [r.requestId, r.acknowledgeWarnings])).toEqual([
      [testB.requestId, false],
      [testB.requestId, true],
    ]);
    if (second.kind === 'saved' && second.result.status === 'POSTED') {
      expect(second.result.warnings).toHaveLength(1);
    }
  });

  it('a retry with the same request id returns the same voucher, marked replayed', async () => {
    const api = await signedInMock(true);
    const a = await attemptSave(api, testA, false);
    const b = await attemptSave(api, testA, false);
    if (a.kind !== 'saved' || b.kind !== 'saved' || a.result.status !== 'POSTED' || b.result.status !== 'POSTED') throw new Error('expected POSTED');
    expect(b.result.voucherNo).toBe(a.result.voucherNo);
    expect(b.result.replayed).toBe(true);
  });

  it('with writes disabled the save is a dry run and carries no voucher number', async () => {
    const api = await signedInMock(false);
    const outcome = await attemptSave(api, testA, false);
    if (outcome.kind !== 'saved') throw new Error('expected a response');
    expect(outcome.result.status).toBe('DRY_RUN');
    expect('voucherNo' in outcome.result).toBe(false);
  });

  it('an expired session is reported separately so the form can be kept', async () => {
    const api = await signedInMock(true);
    api.expireSession();
    const outcome = await attemptSave(api, testA, false);
    expect(outcome.kind).toBe('unauthorized');
  });

  it('other API errors come back as errors', async () => {
    const failing = { postIssue: async () => { throw new ApiError(400, 'BATCH_NOT_OF_ITEM', 'Line 1 uses a batch that does not belong to its item.'); } };
    const outcome = await attemptSave(failing, testA, false);
    expect(outcome.kind).toBe('error');
  });
});

describe('double submit', () => {
  it('two concurrent saves of one request id make one voucher', async () => {
    const api = await signedInMock(true);
    const [a, b] = await Promise.all([attemptSave(api, testA, false), attemptSave(api, testA, false)]);
    if (a.kind !== 'saved' || b.kind !== 'saved' || a.result.status !== 'POSTED' || b.result.status !== 'POSTED') throw new Error('expected POSTED');
    expect(a.result.voucherNo).toBe(b.result.voucherNo);
    expect([a.result.replayed, b.result.replayed].sort()).toEqual([false, true]);
    const history = await api.issues();
    expect(history.rows).toHaveLength(1);
  });
});
