import { apiJson } from './client.js';

/** Accounts and saved runs. The session lives in an HttpOnly cookie, so nothing here ever sees a token. */

export const getAuthConfig = () => apiJson('/auth/config', { method: 'GET' });
export const getMe = () => apiJson('/auth/me', { method: 'GET' });
export const register = (username, password, shareStats) => apiJson('/auth/register', { body: { username, password, shareStats } });
export const login = (username, password) => apiJson('/auth/login', { body: { username, password } });
export const logout = () => apiJson('/auth/logout', { body: {} });
export const setShareStats = (shareStats) => apiJson('/auth/me', { method: 'PATCH', body: { shareStats } });
export const deleteAccount = (password) => apiJson('/auth/me', { method: 'DELETE', body: { password } });

/** One call after a run: stores the run and its code (once per distinct code). Returns { runId, solutionId }. */
export const saveRun = (run) => apiJson('/me/runs', { body: run });
export const listSolutions = () => apiJson('/me/solutions', { method: 'GET' });
export const getSolution = (id) => apiJson(`/me/solutions/${id}`, { method: 'GET' });
export const deleteSolution = (id) => apiJson(`/me/solutions/${id}`, { method: 'DELETE' });
export const getApproaches = (slug) => apiJson(`/me/problems/${encodeURIComponent(slug)}/approaches`, { method: 'GET' });
