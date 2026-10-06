import { describe, expect, it } from 'vitest';
import { filterIssues, registerRows } from './HistoryTab';
import type { HistoryIssue } from '../../api';

const issue = (voucherNo: string, itemCode: string, userName: string): HistoryIssue => ({
  transactionId: Number(voucherNo.slice(2, 7)), voucherNo, voucherDate: '2026-10-05', mode: 'ALLOCATED',
  jobCardNo: 'J04699_26_27', jobContentNo: 'J04699_26_27[1_1]', jobName: 'TEA CARTON', contentName: null, clientName: 'TEA CO',
  departmentId: 100, departmentName: 'PRINTING', slipNo: null, remark: null, totalQuantity: 887,
  createdBy: { userId: 71, userName }, createdDate: null, createdByIssueTool: true, canDelete: true, deleteBlockedReason: null,
  lines: [{
    transactionDetailId: 1, transId: 1, stockUnit: 'Kg', issueQuantity: 887, batchNo: '64703_PO02536_26_27_8044_2.00',
    warehouseName: 'Panchla', binName: 'Paper warehouse', floorWarehouseId: 16, floorWarehouseName: 'Floor-Panchla', floorBinName: 'Paper',
    picklistTransactionId: 15684, picklistNo: 'IPIC01234_26_27',
    itemSubGroupName: 'Reel', machineId: null, machineName: null, jobContentId: 1, jobContentNo: 'J04699_26_27[1_1]',
    jobName: 'TEA CARTON', contentName: null, clientName: 'TEA CO',
    item: { itemId: 8044, itemCode, itemName: 'KRAFT REEL', itemGroupId: 2, itemGroupName: 'REEL', quality: null, gsm: null, size: null, sizeW: null, sizeL: null, manufacturer: null, certification: null, allocatedStock: 0, stockUnit: 'Kg', physicalStock: 0 },
  }],
});

describe('history search', () => {
  const rows = [issue('IS17320_26_27', 'R01400', 'RAJU'), issue('IS17321_26_27', 'P02621', 'MANU')];
  it('finds by voucher, item, user and batch, every word must match', () => {
    expect(filterIssues(rows, '')).toHaveLength(2);
    expect(filterIssues(rows, '17321').map((r) => r.voucherNo)).toEqual(['IS17321_26_27']);
    expect(filterIssues(rows, 'r01400').map((r) => r.voucherNo)).toEqual(['IS17320_26_27']);
    expect(filterIssues(rows, 'manu p02621')).toHaveLength(1);
    expect(filterIssues(rows, 'manu r01400')).toHaveLength(0);
    expect(filterIssues(rows, '64703')).toHaveLength(2);
  });
});

describe('history register', () => {
  it('has one row per issue line, picklist no. falling back to the voucher no.', () => {
    const allocated = issue('IS17320_26_27', 'R01400', 'RAJU');
    const direct = { ...issue('IS17321_26_27', 'P02621', 'MANU'), mode: 'DIRECT' as const };
    direct.lines = [{ ...direct.lines[0]!, picklistTransactionId: null, picklistNo: null }, { ...direct.lines[0]!, transactionDetailId: 2, transId: 2 }];
    const rows = registerRows([allocated, direct]);
    expect(rows).toHaveLength(3);
    expect(rows[0]!.picklistNo).toBe('IPIC01234_26_27');
    expect(rows[1]!.picklistNo).toBe('IS17321_26_27');
    expect(rows.map((r) => r.key)).toEqual(['17320-1', '17321-1', '17321-2']);
  });
});
