import { useEffect, useState } from 'react';
import { api, errorMessage, type Department, type FloorWarehouse } from '../api';

/** Lookups change rarely; load each once per page load, and retry after a failure. */
let warehousesPromise: Promise<FloorWarehouse[]> | null = null;
let departmentsPromise: Promise<Department[]> | null = null;

function useCached<T>(get: () => Promise<T>, reset: () => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    get().then(
      (d) => alive && setData(d),
      (err) => {
        reset();
        if (alive) setError(errorMessage(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [get, reset]);
  return { data, error };
}

const getWarehouses = () => (warehousesPromise ??= api.floorWarehouses().then((r) => r.warehouses));
const resetWarehouses = () => {
  warehousesPromise = null;
};
const getDepartments = () => (departmentsPromise ??= api.departments().then((r) => r.departments));
const resetDepartments = () => {
  departmentsPromise = null;
};

export const useFloorWarehouses = () => useCached(getWarehouses, resetWarehouses);
export const useDepartments = () => useCached(getDepartments, resetDepartments);
