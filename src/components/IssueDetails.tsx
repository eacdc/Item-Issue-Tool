import { useEffect, useMemo, useState } from 'react';
import { useFloorWarehouses } from '../hooks/useLookups';

export interface IssueDetailsValue {
  floorWarehouseId: number | null;
  voucherDate: string;
  remark: string;
}

interface Props {
  value: IssueDetailsValue;
  onChange: (value: IssueDetailsValue) => void;
  today: string;
  disabled?: boolean;
}

/** Floor warehouse + bin (required), voucher date (default today), remark. */
export function IssueDetails({ value, onChange, today, disabled }: Props) {
  const { data: warehouses, error } = useFloorWarehouses();

  const selectedWarehouse = useMemo(
    () => warehouses?.find((w) => w.bins.some((b) => b.warehouseId === value.floorWarehouseId))?.warehouseName ?? '',
    [warehouses, value.floorWarehouseId],
  );
  const [warehouseName, setWarehouseName] = useWarehouseName(selectedWarehouse);
  const bins = warehouses?.find((w) => w.warehouseName === warehouseName)?.bins ?? [];

  return (
    <div className="details-grid">
      <label>
        <span>Floor warehouse <span className="req">*</span></span>
        <select
          value={warehouseName}
          disabled={disabled || !warehouses}
          onChange={(e) => {
            const name = e.target.value;
            setWarehouseName(name);
            const onlyBin = warehouses?.find((w) => w.warehouseName === name)?.bins;
            onChange({ ...value, floorWarehouseId: onlyBin?.length === 1 ? onlyBin[0]!.warehouseId : null });
          }}
        >
          <option value="">{warehouses ? 'Choose…' : 'Loading…'}</option>
          {warehouses?.map((w) => (
            <option key={w.warehouseName} value={w.warehouseName}>{w.warehouseName}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Bin <span className="req">*</span></span>
        <select
          value={value.floorWarehouseId ?? ''}
          disabled={disabled || !bins.length}
          onChange={(e) => onChange({ ...value, floorWarehouseId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Choose…</option>
          {bins.map((b) => (
            <option key={b.warehouseId} value={b.warehouseId}>{b.binName}</option>
          ))}
        </select>
      </label>
      <label>
        Voucher date
        <input
          type="date"
          value={value.voucherDate}
          max={today}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, voucherDate: e.target.value })}
        />
      </label>
      <label className="span-2">
        Remark
        <input type="text" maxLength={500} value={value.remark} disabled={disabled} onChange={(e) => onChange({ ...value, remark: e.target.value })} />
      </label>
      {error && <p className="notice notice-error span-all">Floor warehouses could not be loaded: {error}</p>}
    </div>
  );
}

/** The warehouse dropdown follows the chosen bin, but can be changed on its own. */
function useWarehouseName(fromBin: string): [string, (name: string) => void] {
  const [name, setName] = useState(fromBin);
  useEffect(() => {
    if (fromBin) setName(fromBin);
  }, [fromBin]);
  return [name, setName];
}

/** Problems that stop the confirmation dialog from opening. */
export function detailsProblems(value: IssueDetailsValue, today: string): string[] {
  const problems: string[] = [];
  if (!value.floorWarehouseId) problems.push('Choose the floor warehouse and bin.');
  if (!value.voucherDate) problems.push('Enter the voucher date.');
  else if (value.voucherDate > today) problems.push('The voucher date cannot be later than today.');
  return problems;
}
