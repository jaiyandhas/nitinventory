import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    // Only auto-redirect to login on 401 for non-auth-check requests.
    // /auth/me is used to probe login state — never redirect from it.
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !url.includes('/auth/me') && !url.includes('/auth/login')) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  register: (formData: FormData) =>
    api.post('/auth/register', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateProfile: (formData: FormData) =>
    api.post('/auth/profile', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  departments: () => api.get('/auth/departments'),
  roles: () => api.get('/auth/roles'),
};

// Purchase Requests
export const prApi = {
  list: () => api.get('/pr/'),
  get: (id: number) => api.get(`/pr/${id}`),
  create: (data: object) => api.post('/pr/', data),
  createWithFiles: (formData: FormData) =>
    api.post('/pr/', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  advance: (id: number, remarks?: string, status?: string, faculty1_id?: number, faculty2_id?: number, faculty3_id?: number) => api.post(`/pr/${id}/advance`, { remarks, status, faculty1_id, faculty2_id, faculty3_id }),
  reject: (id: number, reason: string) => api.post(`/pr/${id}/reject`, { reason }),
  sendBack: (id: number, to_step: number, reason: string) => api.post(`/pr/${id}/send-back`, { to_step, reason }),
  assignDa: (id: number, da_id: number) => api.post(`/pr/${id}/assign-da`, { da_id }),
  addTechnicalEval: (id: number, vendors: object[]) => api.post(`/pr/${id}/technical-eval`, { vendors }),
  addFinancialBids: (id: number, vendors: object[], remarks?: string) => api.post(`/pr/${id}/financial-bids`, { vendors, remarks }),
  getSendBackCandidates: (id: number) => api.get(`/pr/${id}/send-back-candidates`),
  addTenderDetails: (id: number, data: any) => {
    if (data instanceof FormData) {
      return api.post(`/pr/${id}/tender-details`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }
    return api.post(`/pr/${id}/tender-details`, data);
  },
  getDealingAssistants: () => api.get('/pr/dealing-assistants'),
  getVendors: () => api.get('/pr/vendors'),
  awardBid: (id: number, vendor_id: number, remarks?: string) => api.post(`/pr/${id}/award-bid`, { vendor_id, remarks }),
};

// Budget
export const budgetApi = {
  files: () => api.get('/budget/files'),
  overview: () => api.get('/budget/overview'),
  financialYears: () => api.get('/budget/financial-years'),
  procurementMethods: () => api.get('/budget/procurement-methods'),
  departmentFaculty: () => api.get('/budget/department-faculty'),
};

// Inventory
export const inventoryApi = {
  listDeliveries: () => api.get('/inventory/deliveries'),
  getDelivery: (id: number) => api.get(`/inventory/deliveries/${id}`),
  confirmDelivery: (deliveryId: number, formData: FormData) =>
    api.post(`/inventory/deliveries/${deliveryId}/confirm`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  logDeptReceipt: (deliveryId: number, itemId: number, data: object) =>
    api.post(`/inventory/deliveries/${deliveryId}/items/${itemId}/dept-log`, data),
  logStoresReceipt: (deliveryId: number, itemId: number, data: object) =>
    api.put(`/inventory/deliveries/${deliveryId}/items/${itemId}/stores-log`, data),
  approveStoresLog: (deliveryId: number, itemId: number) =>
    api.post(`/inventory/deliveries/${deliveryId}/items/${itemId}/stores-log/approve`),
  listDiscrepancies: () => api.get('/inventory/discrepancies'),
};

// Assets
export const assetsApi = {
  list: () => api.get('/assets/'),
  get: (id: number) => api.get(`/assets/${id}`),
  create: (data: object) => api.post('/assets/', data),
  importCsv: (formData: FormData) =>
    api.post('/assets/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete: (id: number) => api.delete(`/assets/${id}`),
  publicProfile: (tag: string) => api.get(`/assets/qr/${tag}`),
  updateCondition: (id: number, condition: string) => api.patch(`/assets/${id}/condition`, { condition }),
  move: (id: number, to_building: string, to_room: string, reason?: string) =>
    api.post(`/assets/${id}/move`, { to_building, to_room, reason }),
  flagDisposal: (id: number) => api.post(`/assets/${id}/flag-disposal`),
  confirmDisposal: (id: number) => api.post(`/assets/${id}/confirm-disposal`),
};

// Admin
export const adminApi = {
  users: () => api.get('/admin/users'),
  createUser: (data: object) => api.post('/admin/users', data),
  departments: () => api.get('/admin/departments'),
  roles: () => api.get('/admin/roles'),
  financialYears: () => api.get('/admin/financial-years'),
  createFinancialYear: (data: object) => api.post('/admin/financial-years', data),
  settings: () => api.get('/admin/settings'),
  updateSetting: (key: string, value: string) => api.put(`/admin/settings/${key}`, { value }),
  budget: () => api.get('/admin/budget'),
  createBudget: (data: object) => api.post('/admin/budget', data),
  updateBudget: (id: number, data: object) => api.put(`/admin/budget/${id}`, data),
  workflows: () => api.get('/admin/workflows'),
  createWorkflow: (data: object) => api.post('/admin/workflows', data),
  updateWorkflow: (id: number, data: object) => api.put(`/admin/workflows/${id}`, data),
  reorderWorkflows: (data: object) => api.post('/admin/workflows/reorder', data),
  createRole: (data: object) => api.post('/admin/roles', data),
  deleteWorkflow: (id: number) => api.delete(`/admin/workflows/${id}`),
  phases: () => api.get('/admin/phases'),
  categories: () => api.get('/admin/categories'),
  createCategory: (data: object) => api.post('/admin/categories', data),
  updateCategory: (id: number, data: object) => api.put(`/admin/categories/${id}`, data),
  deleteCategory: (id: number) => api.delete(`/admin/categories/${id}`),
  updateUser: (id: number, data: object) => api.put(`/admin/users/${id}`, data),
  resetPassword: (id: number) => api.post(`/admin/users/${id}/reset-password`, {}),
  procurementMethods: () => api.get('/admin/procurement-methods'),
  createProcurementMethod: (data: object) => api.post('/admin/procurement-methods', data),
  updateProcurementMethod: (id: number, data: object) => api.put(`/admin/procurement-methods/${id}`, data),
  deleteProcurementMethod: (id: number) => api.delete(`/admin/procurement-methods/${id}`),
  resetWorkflow: (data: object) => api.post('/admin/workflows/reset-defaults', data),
  toggleWorkflow: (id: number) => api.patch(`/admin/workflows/${id}/toggle`, {}),
  getPendingUsers: () => api.get('/admin/users/pending'),
  approveUser: (id: number) => api.post(`/admin/users/${id}/approve`),
  rejectUser: (id: number) => api.post(`/admin/users/${id}/reject`),
  importBudget: (formData: FormData) =>
    api.post('/admin/budget/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  clearBudgets: () => api.delete('/admin/budget/clear'),
};
