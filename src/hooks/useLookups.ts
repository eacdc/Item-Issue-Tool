import { useEffect, useState } from 'react';
import { api, errorMessage, type Department, type FloorWarehouse, type SalesPerson } from '../api';

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

let clientsPromise: Promise<string[]> | null = null;
let salesPersonsPromise: Promise<SalesPerson[]> | null = null;
const getClients = () => (clientsPromise ??= api.clients().then((r) => r.clients));
const resetClients = () => {
  clientsPromise = null;
};
const getSalesPersons = () => (salesPersonsPromise ??= api.salesPersons().then((r) => r.salesPersons));
const resetSalesPersons = () => {
  salesPersonsPromise = null;
};

export const useClients = () => useCached(getClients, resetClients);
export const useSalesPersons = () => useCached(getSalesPersons, resetSalesPersons);
