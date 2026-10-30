import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env?.VITE_API_URL || 'http://localhost:8000',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default api;

export async function loginWithGoogle(idToken) {
  const response = await api.post('/api/auth/google', { id_token: idToken });
  return response.data;
}

export async function getTeams() {
  const response = await api.get('/api/teams');
  return response.data;
}

export async function getBudgetSummary(period) {
  const response = await api.get('/api/summary', { params: { period } });
  return response.data;
}

export async function getCurrentUser() {
  const response = await api.get('/api/me');
  return response.data;
}

export async function getTeamBudget(teamId, period) {
  const response = await api.get(`/api/teams/${encodeURIComponent(teamId)}/budgets/${encodeURIComponent(period)}`);
  return response.data;
}

export async function createBudget(teamId, period, lineItems = []) {
  const response = await api.post(`/api/teams/${encodeURIComponent(teamId)}/budgets`, { period, ...(lineItems.length ? { line_items: lineItems } : {}) });
  return response.data;
}

export async function updateLineItem(id, data) {
  const response = await api.patch(`/api/line-items/${encodeURIComponent(id)}`, data);
  return response.data;
}

export async function getLineItems(budgetId, search) {
  const response = await api.get('/api/line-items', {
    params: { budget_id: budgetId, search: search || '' },
  });
  return response.data;
}

export async function createLineItem(data) {
  const { budget_id, ...fields } = data;
  const response = await api.post(`/api/budgets/${encodeURIComponent(budget_id)}/line-items`, fields);
  return response.data;
}

export async function deleteLineItem(id) {
  const response = await api.delete(`/api/line-items/${id}`);
  return response.data;
}

export async function importLineItems(budgetId, file, dryRun = true) {
  const form = new FormData();
  form.append('file', file);
  const response = await api.post(`/api/budgets/${encodeURIComponent(budgetId)}/line-items/import`, form, {
    params: { dry_run: dryRun },
  });
  return response.data;
}

export async function getCurrencies() {
  const response = await api.get('/api/currencies');
  return response.data;
}

export async function deleteBudget(id) {
  const response = await api.delete(`/api/budgets/${encodeURIComponent(id)}`);
  return response.data;
}

export async function getUsers(unmapped = false) {
  const response = await api.get('/api/users', { params: { unmapped } });
  return response.data;
}

export async function updateUser(id, changes) {
  const response = await api.patch(`/api/users/${encodeURIComponent(id)}`, changes);
  return response.data;
}

export async function createTeam(name) {
  const response = await api.post('/api/teams', { name });
  return response.data;
}

export async function renameTeam(id, name) {
  const response = await api.patch(`/api/teams/${encodeURIComponent(id)}`, { name });
  return response.data;
}

export async function deleteTeam(id) {
  const response = await api.delete(`/api/teams/${encodeURIComponent(id)}`);
  return response.data;
}
