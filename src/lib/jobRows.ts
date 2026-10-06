/**
 * Rows of the direct tab's job search, as the ERP's "Exist Job Card" list
 * shows them: one row per job content and paper it plans, with required,
 * issued and pending in sheets, Kg and running metres.
 */

import type { ItemSearchRow, JobContent, PlannedItem } from '../api/types';
import { kgPerSheet } from './grid';
import { round3 } from './quantity';

export interface JobRow {
  key: string;
  content: JobContent;
  /** The planned paper (an item with a GSM); null when the content plans none. */
  item: PlannedItem | null;
}

/** Paper first: planned items with a GSM. A content without one still gets a row, so it can be chosen. */
export function buildJobRows(contents: JobContent[]): JobRow[] {
  return contents.flatMap((content): JobRow[] => {
    const papers = content.plannedItems.filter((p) => (p.gsm ?? 0) > 0);
    if (!papers.length) return [{ key: `${content.jobContentId}`, content, item: null }];
    return papers.map((item) => ({ key: `${content.jobContentId}-${item.itemId}`, content, item }));
  });
}

type Unitish = Pick<PlannedItem, 'stockUnit' | 'gsm' | 'sizeW' | 'sizeL'>;

const unit = (u: string | null) => (u ?? '').trim().toUpperCase();
const isSheet = (i: Unitish) => ['SHEET', 'SHEETS'].includes(unit(i.stockUnit));
const isKg = (i: Unitish) => ['KG', 'KGS'].includes(unit(i.stockUnit));

/** A quantity in the item's stock unit, as sheets (0 unless the item is counted in sheets). */
export function asSheets(i: Unitish, q: number): number {
  return isSheet(i) ? round3(q) : 0;
}

/** As Kg: Kg as is, sheets weighed from GSM × size; 0 when it cannot be worked out. */
export function asKg(i: Unitish, q: number): number {
  if (isKg(i)) return round3(q);
  if (isSheet(i)) {
    const per = kgPerSheet(i.gsm, i.sizeW, i.sizeL);
    return per === null ? 0 : Math.round(q * per * 100) / 100;
  }
  return 0;
}

/**
 * As running metres, for a reel (Kg item with a GSM and a width but no
 * length): metres = Kg × 1,000,000 / (GSM × width in mm). 0 otherwise, as the
 * ERP shows for sheets.
 */
export function asRunningMeters(i: Unitish, q: number): number {
  if (!isKg(i) || !i.gsm || !i.sizeW || (i.sizeL ?? 0) > 0) return 0;
  return Math.round((q * 1e6) / (i.gsm * i.sizeW));
}

/** The item picker's row for a planned item, with the job's pending for its group and unit. */
export function plannedAsSearchRow(content: JobContent, p: PlannedItem): ItemSearchRow {
  const group = content.requirementGroups.find((g) => g.itemGroupId === p.itemGroupId && unit(g.stockUnit) === unit(p.stockUnit));
  return { ...p, planned: true, pendingForJob: group?.pending ?? p.pending };
}
