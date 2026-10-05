/**
 * The one API client the app uses. VITE_API_BASE_URL picks it:
 *   empty or "mock"        → the in-browser mock (src/api/mock.ts)
 *   https://…              → the real backend
 */

import { HttpApi } from './http';
import { MockApi } from './mock';

const base = (import.meta.env.VITE_API_BASE_URL ?? '').trim();

export const api: HttpApi | MockApi = base === '' || base.toLowerCase() === 'mock' ? new MockApi() : new HttpApi(base);

export const mockApi: MockApi | null = api instanceof MockApi ? api : null;

export { ApiError, errorMessage } from './errors';
export type * from './types';
