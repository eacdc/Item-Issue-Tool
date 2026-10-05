import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage, type ItemBatches } from '../api';

/**
 * Batch stock for one item. Reloads when the window regains focus (another
 * storekeeper, or the ERP, may have issued from the same batch meanwhile) and
 * on demand, e.g. right before the confirmation dialog.
 */
export function useBatches(itemId: number | null) {
  const [data, setData] = useState<ItemBatches | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(itemId);
  current.current = itemId;

  const reload = useCallback(async (): Promise<ItemBatches | null> => {
    const id = current.current;
    if (id === null) return null;
    setLoading(true);
    try {
      const result = await api.batches(id);
      if (current.current === id) {
        setData(result);
        setError(null);
      }
      return result;
    } catch (err) {
      if (current.current === id) setError(errorMessage(err));
      return null;
    } finally {
      if (current.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setData(null);
    setError(null);
    if (itemId !== null) void reload();
  }, [itemId, reload]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [reload]);

  return { data, loading, error, reload };
}
