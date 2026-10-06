import type { Item } from '../api';
import type { Column } from './DataGrid';
import { formatDate } from '../lib/format';

/** What a quantity column needs from the row's item to summarise it. */
export type UnitItem = Pick<Item, 'stockUnit'> & Partial<Pick<Item, 'gsm' | 'sizeW' | 'sizeL'>>;

/** A quantity column: number filter, summary in Kg (sheets weighed) with Nos and other units apart. */
export function qtyColumn<T>(
  id: string,
  header: string,
  value: (row: T) => number | null | undefined,
  item: (row: T) => UnitItem,
  extra: Partial<Column<T>> = {},
): Column<T> {
  return {
    id,
    header,
    type: 'qty',
    value,
    qty: (row) => {
      const it = item(row);
      return { value: value(row) ?? 0, unit: it.stockUnit, gsm: it.gsm, sizeW: it.sizeW, sizeL: it.sizeL };
    },
    ...extra,
  };
}

export function textColumn<T>(id: string, header: string, value: (row: T) => string | null | undefined, extra: Partial<Column<T>> = {}): Column<T> {
  return { id, header, type: 'text', value, ...extra };
}

export function numberColumn<T>(id: string, header: string, value: (row: T) => number | null | undefined, extra: Partial<Column<T>> = {}): Column<T> {
  return { id, header, type: 'number', value, ...extra };
}

export function dateColumn<T>(id: string, header: string, value: (row: T) => string | null | undefined, extra: Partial<Column<T>> = {}): Column<T> {
  return { id, header, type: 'date', value, render: (r) => <span className="nowrap">{formatDate(value(r))}</span>, ...extra };
}

type ItemField = 'group' | 'code' | 'name' | 'quality' | 'gsm' | 'sizeW' | 'sizeL' | 'manufacturer' | 'certification' | 'unit';

/** The item master columns the ERP grids repeat, in the order asked for. */
export function itemColumns<T>(item: (row: T) => Partial<Item>, fields: ItemField[], labels: Partial<Record<ItemField, string>> = {}): Column<T>[] {
  const defs: Record<ItemField, Column<T>> = {
    group: textColumn('itemGroup', labels.group ?? 'Item Group', (r) => item(r).itemGroupName, { className: 'clip-sm' }),
    code: textColumn('itemCode', labels.code ?? 'Item Code', (r) => item(r).itemCode, { className: 'mono' }),
    name: textColumn('itemName', labels.name ?? 'Item Name', (r) => item(r).itemName, { className: 'clip-wide' }),
    quality: textColumn('quality', labels.quality ?? 'Quality', (r) => item(r).quality),
    gsm: numberColumn('gsm', labels.gsm ?? 'GSM', (r) => item(r).gsm),
    sizeW: numberColumn('sizeW', labels.sizeW ?? 'SizeW', (r) => item(r).sizeW),
    sizeL: numberColumn('sizeL', labels.sizeL ?? 'SizeL', (r) => item(r).sizeL),
    manufacturer: textColumn('manufacturer', labels.manufacturer ?? 'Manufacturer', (r) => item(r).manufacturer),
    certification: textColumn('certification', labels.certification ?? 'Certification', (r) => item(r).certification),
    unit: textColumn('stockUnit', labels.unit ?? 'Stock Unit', (r) => item(r).stockUnit),
  };
  return fields.map((f) => defs[f]);
}
