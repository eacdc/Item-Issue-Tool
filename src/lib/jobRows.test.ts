import { describe, expect, it } from 'vitest';
import { asKg, asRunningMeters, asSheets, buildJobRows } from './jobRows';
import type { JobContent, PlannedItem } from '../api/types';

const planned = (partial: Partial<PlannedItem>): PlannedItem => ({
  itemId: 1, itemCode: 'P00307', itemName: null, itemGroupId: 14, itemGroupName: 'PAPER', quality: null, gsm: null, size: null,
  sizeW: null, sizeL: null, manufacturer: null, certification: null, stockUnit: 'Sheet', physicalStock: 0, allocatedStock: 0,
  required: 0, issued: 0, pending: 0, ...partial,
});

const content = (id: number, items: PlannedItem[]): JobContent => ({
  jobContentId: id, jobBookingId: 1, jobCardNo: 'J07553_26_27', jobContentNo: `J07553_26_27[${id}_2]`, jobName: 'Greeting Card',
  contentName: null, clientName: null, suggestedDepartmentId: null, suggestedDepartmentName: null, plannedItems: items, requirementGroups: [],
});

describe('job search rows', () => {
  it('has one row per planned paper, and a row for a content without paper', () => {
    const paper = planned({ itemId: 307, gsm: 300, sizeW: 635, sizeL: 940 });
    const ink = planned({ itemId: 900, itemCode: 'INK1', gsm: null, stockUnit: 'Kg' });
    const rows = buildJobRows([content(1, [paper, ink]), content(2, [ink])]);
    expect(rows.map((r) => [r.content.jobContentId, r.item?.itemId ?? null])).toEqual([[1, 307], [2, null]]);
  });

  it('converts sheets to Kg and reels to running metres', () => {
    const sheet = planned({ gsm: 90, sizeW: 635, sizeL: 940, stockUnit: 'Sheet' });
    expect(asSheets(sheet, 2142)).toBe(2142);
    expect(asKg(sheet, 2142)).toBeCloseTo(115.07, 2);
    expect(asRunningMeters(sheet, 2142)).toBe(0);

    const reel = planned({ gsm: 120, sizeW: 1000, sizeL: 0, stockUnit: 'Kg' });
    expect(asSheets(reel, 152)).toBe(0);
    expect(asKg(reel, 152)).toBe(152);
    expect(asRunningMeters(reel, 152)).toBe(1267);

    const unknown = planned({ gsm: null, stockUnit: 'Sheet' });
    expect(asKg(unknown, 100)).toBe(0);
  });
});
