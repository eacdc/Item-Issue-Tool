/**
 * The one API client the app uses: always the real backend.
 *
 * VITE_API_BASE_URL overrides the server (e.g. http://localhost:3001 for a
 * backend running on this machine). Empty, unset, or the old "mock" value all
 * mean the production server. The in-browser mock (src/api/mock.ts) is only
 * used by the unit tests.
 */

import { HttpApi } from './http';

export const DEFAULT_API_BASE_URL = 'https://cdcapi.onrender.com';

const configured = (import.meta.env.VITE_API_BASE_URL ?? '').trim();

export const apiBaseUrl = configured === '' || configured.toLowerCase() === 'mock' ? DEFAULT_API_BASE_URL : configured;

export const api = new HttpApi(apiBaseUrl);

export { ApiError, errorMessage } from './errors';
export type * from './types';
