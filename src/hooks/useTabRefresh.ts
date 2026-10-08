import { createContext, useContext } from 'react';

/**
 * Goes up by one each time the user switches to the tab it wraps. Every
 * fetch inside the tab depends on it, so opening a tab always reloads its
 * data from the server; half-filled forms are kept.
 */
export const TabRefreshContext = createContext(0);

export function useTabRefresh(): number {
  return useContext(TabRefreshContext);
}
