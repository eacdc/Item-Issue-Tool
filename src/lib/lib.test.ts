import { describe, expect, it } from 'vitest';
import { formatQty, parseQuantity, qtyWithUnit, sanitizeQuantityInput } from './quantity';
import { addLine, linesOverBatch, remaining, removeLine, toRequestLines, totalFor, totalsByUnit, type DraftLine } from './lines';
import { newRequestId } from './uuid';
import type { Batch } from '../api/types';

const sheet = { itemId: 9409, itemCode: 'P02621', itemName: 'SBS', itemGroupId: 14, stockUnit: 'Sheet' };
const kg = { itemId: 9681, itemCode: 'R01175', itemName: 'Reel', itemGroupId: 2, stockUnit: 'Kg' };
const batch = (parent: number, stock: number, batchNo: string | null = `B${parent}`): Batch => ({
  batchKey: { parentTransactionId: parent, warehouseId: 17, batchNo }, batchId: parent, supplierBatchNo: null, batchStock: stock,
  grnNo: null, grnDate: null, grnVoucherId: null, warehouseName: 'Panchla', binName: 'Rack',
});

describe('quantities', () => {
  it('accepts plain positive numbers only', () => {
    expect(parseQuantity('1500')).toBe(1500);
    expect(parseQuantity('68.84')).toBe(68.84);
    expect(parseQuantity('.5')).toBe(0.5);
    for (const bad of ['', '0', '0.000', '-5', '1,500', '12a', '1.2345', '1e3', ' ']) {
      expect(parseQuantity(bad), bad).toBeNull();
    }
  });

  it('filters keystrokes to digits and one dot', () => {
    expect(sanitizeQuantityInput('-1,5a00.5.5')).toBe('1500.55');
  });

  it('always shows the unit', () => {
    expect(formatQty(1458)).toBe('1,458');
    expect(qtyWithUnit(68.84, 'Kg')).toBe('68.84 Kg');
    expect(qtyWithUnit(null, 'Sheet')).toBe('— Sheet');
  });
});

describe('lines', () => {
  it('splits an allocated issue across two batches (test A)', () => {
    let lines: DraftLine[] = [];
    const pending = 2958;
    expect(remaining(pending, totalFor(lines, 'Sheet'))).toBe(2958);
    lines = addLine(lines, sheet, batch(60325, 1500), 1500);
    expect(remaining(pending, totalFor(lines, 'Sheet'))).toBe(1458);
    lines = addLine(lines, sheet, batch(61902, 39256), 1458);
    expect(totalFor(lines, 'Sheet')).toBe(2958);
    expect(remaining(pending, totalFor(lines, 'Sheet'))).toBe(0);
    expect(toRequestLines(lines)).toEqual([
      { itemId: 9409, parentTransactionId: 60325, warehouseId: 17, batchNo: 'B60325', quantity: 1500 },
      { itemId: 9409, parentTransactionId: 61902, warehouseId: 17, batchNo: 'B61902', quantity: 1458 },
    ]);
  });

  it('merges a second quantity from the same batch into one line', () => {
    let lines = addLine([], sheet, batch(1, 100), 10);
    lines = addLine(lines, sheet, batch(1, 100), 5.5);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(15.5);
    expect(removeLine(lines, lines[0]!.key)).toEqual([]);
  });

  it('never adds Kg to Sheet', () => {
    let lines = addLine([], sheet, batch(1, 100), 10);
    lines = addLine(lines, kg, batch(2, 100), 2.5);
    expect(totalFor(lines, 'Sheet')).toBe(10);
    expect(totalFor(lines, 'KG')).toBe(2.5);
    expect(totalsByUnit(lines)).toEqual([{ stockUnit: 'Sheet', total: 10 }, { stockUnit: 'Kg', total: 2.5 }]);
  });

  it('flags lines that now exceed their batch after a stock reload', () => {
    const lines = addLine([], kg, batch(52873, 200), 152);
    expect(linesOverBatch(lines, new Map([[9681, [batch(52873, 200)]]]))).toHaveLength(0);
    expect(linesOverBatch(lines, new Map([[9681, [batch(52873, 100)]]]))).toHaveLength(1);
    expect(linesOverBatch(lines, new Map([[9681, []]]))).toHaveLength(1);   // batch emptied
  });
});

describe('request id', () => {
  it('is a v4 uuid and unique', () => {
    const a = newRequestId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newRequestId()).not.toBe(a);
  });
});

describe('lines with a process and machine (direct issue)', () => {
  it('keeps one line per batch per process and sends the process and machine', () => {
    const b = batch(60325, 100);
    const printing = { processId: 10337, processName: 'Printing', machineId: 14, machineName: 'CD102' };
    let lines = addLine([], sheet, b, 10, printing);
    lines = addLine(lines, sheet, b, 5, printing);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(15);
    lines = addLine(lines, sheet, b, 3, { ...printing, processId: 10401, processName: 'Lamination' });
    expect(lines).toHaveLength(2);
    const req = toRequestLines(lines);
    expect(req[0]).toMatchObject({ processId: 10337, machineId: 14, quantity: 15 });
    expect(req[1]).toMatchObject({ processId: 10401, machineId: 14, quantity: 3 });
    expect(toRequestLines(addLine([], sheet, b, 1))[0]).not.toHaveProperty('processId');
  });
});
