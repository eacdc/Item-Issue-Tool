import { describe, expect, it } from 'vitest';
import { compareValues, kgPerSheet, matches, parseNumberFilter, summarizeQty } from './grid';

describe('column filters', () => {
  it('text filters match by contains, ignoring case', () => {
    expect(matches('IS17489_26_27', { kind: 'text', text: '17489' })).toBe(true);
    expect(matches('Gloss Art', { kind: 'text', text: 'gloss' })).toBe(true);
    expect(matches(null, { kind: 'text', text: 'x' })).toBe(false);
    expect(matches(null, { kind: 'text', text: '  ' })).toBe(true);
  });

  it('number filters compare with the chosen operator', () => {
    const n = (value: string) => ({ kind: 'number' as const, value });
    expect(matches(1144, n('>1000'))).toBe(true);
    expect(matches(1000, n('>1000'))).toBe(false);
    expect(matches(1000, n('>= 1,000'))).toBe(true);
    expect(matches(0.69, n('0.69'))).toBe(true);
    expect(matches(5, n('<>5'))).toBe(false);
    expect(matches(4, n('!=5'))).toBe(true);
    expect(matches(null, n('<5'))).toBe(false);
    expect(matches(150, n('100-200'))).toBe(true);
    expect(matches(250, n('100-200'))).toBe(false);
    expect(matches(250, n('>'))).toBe(true); // incomplete: no filtering yet
    expect(parseNumberFilter('100-')).toBeNull();
  });

  it('date filters work on the day, also for date-times', () => {
    expect(matches('2026-10-06', { kind: 'date', op: 'on', value: '2026-10-06' })).toBe(true);
    expect(matches('2026-10-06T13:59:00', { kind: 'date', op: 'on', value: '2026-10-06' })).toBe(true);
    expect(matches('2026-10-05', { kind: 'date', op: 'from', value: '2026-10-06' })).toBe(false);
    expect(matches('2026-10-05', { kind: 'date', op: 'until', value: '2026-10-06' })).toBe(true);
  });

  it('sorting puts blanks last and numbers in numeric order', () => {
    expect([10, 2, null, 33].sort(compareValues)).toEqual([2, 10, 33, null]);
    expect(['IS10', 'IS9'].sort(compareValues)).toEqual(['IS9', 'IS10']);
  });
});

describe('quantity summaries', () => {
  it('weighs a sheet from GSM and size in mm', () => {
    expect(kgPerSheet(250, 585, 914)).toBeCloseTo(0.13367, 5);
    expect(kgPerSheet(300, 1020, 0)).toBeNull();
  });

  it('adds Kg and weighed sheets together, keeps Nos and other units apart', () => {
    const s = summarizeQty([
      { value: 152, unit: 'Kg' },
      { value: 1233, unit: 'KG' },
      { value: 1000, unit: 'Sheet', gsm: 250, sizeW: 585, sizeL: 914 },
      { value: 4, unit: 'NOS' },
      { value: 15, unit: 'Nos' },
      { value: 8, unit: 'Roll' },
      { value: 50, unit: 'Sheet', gsm: null, sizeW: 585, sizeL: 914 },
    ]);
    expect(s.sheets).toBe(1000);
    expect(s.sheetKg).toBeCloseTo(133.67, 2);
    expect(s.kg).toBeCloseTo(152 + 1233 + 133.67, 2);
    expect(s.others).toEqual([
      { unit: 'Nos', total: 19 },
      { unit: 'Roll', total: 8 },
      { unit: 'Sheet (not weighed)', total: 50 },
    ]);
  });
});
