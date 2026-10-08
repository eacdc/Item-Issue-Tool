import { useEffect, useState } from 'react';
import { useTabRefresh } from './useTabRefresh';
import { api, errorMessage, type Department, type FloorWarehouse, type Machine, type Process, type SalesPerson } from '../api';

/**
 * A lookup list (warehouses, departments, clients, …), loaded from the server
 * when its tab opens and again every time the tab is opened, so it is never
 * stale. The previous list stays shown while the new one loads.
 */
function useLookup<T>(get: () => Promise<T>) {
  const refresh = useTabRefresh();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    get().then(
      (d) => alive && (setData(d), setError(null)),
      (err) => alive && setError(errorMessage(err)),
    );
    return () => {
      alive = false;
    };
  }, [get, refresh]);
  return { data, error };
}

const getWarehouses = () => api.floorWarehouses().then((r) => r.warehouses);
const getDepartments = () => api.departments().then((r) => r.departments);
const getClients = () => api.clients().then((r) => r.clients);
const getSalesPersons = () => api.salesPersons().then((r) => r.salesPersons);
const getMachines = () => api.machines().then((r) => r.machines);

export const useFloorWarehouses = () => useLookup<FloorWarehouse[]>(getWarehouses);
export const useDepartments = () => useLookup<Department[]>(getDepartments);
export const useClients = () => useLookup<string[]>(getClients);
export const useSalesPersons = () => useLookup<SalesPerson[]>(getSalesPersons);
export const useMachines = () => useLookup<Machine[]>(getMachines);

/** Processes of a job content, or every process when there is no job ("Other"). Not cached: they differ per job. */
export function useProcesses(jobContentId: number | null, enabled: boolean) {
  const refresh = useTabRefresh();
  const [data, setData] = useState<Process[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    let alive = true;
    api.processes(jobContentId ?? undefined).then(
      (r) => alive && (setData(r.processes), setLoadedFor(jobContentId), setError(null)),
      (err) => alive && setError(errorMessage(err)),
    );
    return () => {
      alive = false;
    };
  }, [jobContentId, enabled, refresh]);
  // Another job's processes are never shown while this job's load; a tab refresh keeps the list.
  return { data: loadedFor === jobContentId ? data : null, error };
}
