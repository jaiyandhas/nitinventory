import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Filter, Upload, Download, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/format';
import { toast } from 'react-hot-toast';

export const BudgetPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [fyFilter, setFyFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<any>(null);

  // CSV upload states
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvFyId, setCsvFyId] = useState<string>('');
  const [uploadResult, setUploadResult] = useState<any>(null);

  const { data: budgets = [], isLoading: loadingBudgets } = useQuery({ 
    queryKey: ['admin_budgets'], 
    queryFn: () => adminApi.budget().then(res => res.data) 
  });
  const { data: depts = [] } = useQuery({ 
    queryKey: ['admin_departments'], 
    queryFn: () => adminApi.departments().then(res => res.data) 
  });
  const { data: fys = [] } = useQuery({ 
    queryKey: ['admin_financial_years'], 
    queryFn: () => adminApi.financialYears().then(res => res.data) 
  });

  const isWriteAllowed = user && ['admin', 'dean_approver'].includes(user.role?.group_key || '');

  const saveMutation = useMutation({
    mutationFn: (data: any) => editingBudget ? adminApi.updateBudget(editingBudget.id, data) : adminApi.createBudget(data),
    onSuccess: () => {
      toast.success(editingBudget ? 'Budget updated' : 'Budget created');
      setIsModalOpen(false);
      setEditingBudget(null);
      queryClient.invalidateQueries({ queryKey: ['admin_budgets'] });
    },
    onError: () => toast.error('Failed to save budget'),
  });

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => adminApi.importBudget(formData),
    onSuccess: (res) => {
      toast.success('Budget CSV imported successfully!');
      setUploadResult(res.data);
      queryClient.invalidateQueries({ queryKey: ['admin_budgets'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'CSV upload failed');
    }
  });

  const filteredBudgets = budgets.filter((b: any) => {
    if (deptFilter !== 'all' && b.department_id !== parseInt(deptFilter)) return false;
    if (fyFilter !== 'all' && b.financial_year_id !== parseInt(fyFilter)) return false;
    return true;
  });

  const handleEdit = (budget: any) => {
    setEditingBudget(budget);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    saveMutation.mutate(data);
  };

  const handleCsvSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      toast.error('Please select a CSV file');
      return;
    }
    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('financial_year_id', csvFyId);

    uploadMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="page-header">Budget Management</h1>
          <p className="page-subtitle">Manage department budgets and allocations</p>
        </div>
        {isWriteAllowed && (
          <div className="flex gap-3">
            <button
              onClick={() => {
                setCsvFile(null);
                setCsvFyId(fys[0]?.id ? String(fys[0].id) : '');
                setUploadResult(null);
                setIsCsvModalOpen(true);
              }}
              className="btn-secondary flex items-center gap-2 border-slate-300 px-4 py-2 hover:bg-slate-100 transition-all font-semibold"
            >
              <Upload size={16} /> Bulk Upload CSV
            </button>
            <button onClick={() => { setEditingBudget(null); setIsModalOpen(true); }} className="btn-primary flex items-center gap-2 px-4 py-2 font-semibold">
              <Plus size={16} /> Add Budget File
            </button>
          </div>
        )}
      </div>

      <div className="card p-4 flex gap-4 bg-white border border-slate-200">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Filters:</span>
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="input-field max-w-[200px]">
          <option value="all">All Departments</option>
          {depts.map((d: any) => <option key={d.id} value={d.id}>{d.short_code} - {d.name}</option>)}
        </select>
        <select value={fyFilter} onChange={e => setFyFilter(e.target.value)} className="input-field max-w-[200px]">
          <option value="all">All Financial Years</option>
          {fys.map((f: any) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>File No / ID</th>
              <th>Department</th>
              <th>Item Name</th>
              <th>Total Cost</th>
              <th>Available</th>
              {isWriteAllowed && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loadingBudgets ? (
              <tr><td colSpan={isWriteAllowed ? 6 : 5} className="text-center py-8">Loading...</td></tr>
            ) : filteredBudgets.length === 0 ? (
              <tr><td colSpan={isWriteAllowed ? 6 : 5} className="text-center py-8 text-slate-500">No budget records found.</td></tr>
            ) : (
              filteredBudgets.map((b: any) => (
                <tr key={b.id} className="hover:bg-slate-50 border-b border-slate-100">
                  <td className="font-medium text-slate-900">{b.file_no} <span className="text-xs text-slate-400 font-normal">(ID: {b.id})</span></td>
                  <td>{depts.find((d: any) => d.id === b.department_id)?.short_code || b.department_id}</td>
                  <td>{b.item_name}</td>
                  <td>{formatCurrency(b.total_cost)}</td>
                  <td className="font-semibold text-green-600">{formatCurrency(b.available_amount)}</td>
                  {isWriteAllowed && (
                    <td>
                      <button onClick={() => handleEdit(b)} className="text-blue-600 hover:text-blue-800 p-1">
                        <Edit2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">{editingBudget ? 'Edit Budget' : 'Add Budget'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                  <select name="department_id" defaultValue={editingBudget?.department_id} required className="input-field w-full">
                    {depts.map((d: any) => <option key={d.id} value={d.id}>{d.short_code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Financial Year</label>
                  <select name="financial_year_id" defaultValue={editingBudget?.financial_year_id} required className="input-field w-full">
                    {fys.map((f: any) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Item Name</label>
                <input type="text" name="item_name" defaultValue={editingBudget?.item_name} required className="input-field w-full" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expenditure Category</label>
                  <select name="expenditure_category" defaultValue={editingBudget?.expenditure_category || 'CAPEX'} required className="input-field w-full">
                    <option value="CAPEX">CAPEX</option>
                    <option value="OPEX">OPEX</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select name="category" defaultValue={editingBudget?.category || 'computer'} required className="input-field w-full">
                    <option value="computer">Computer & Peripherals</option>
                    <option value="lab_equipment">Lab Equipment</option>
                    <option value="software">Software</option>
                    <option value="furniture">Furniture</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unit Cost (₹)</label>
                  <input type="number" name="unit_cost" defaultValue={editingBudget?.unit_cost || 0} required min="0" step="1" className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                  <input type="number" name="quantity" defaultValue={editingBudget?.quantity || 1} required min="1" step="1" className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">File No.</label>
                  <input type="text" name="file_no" defaultValue={editingBudget?.file_no} required className="input-field w-full" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
                  {saveMutation.isPending ? 'Saving...' : 'Save Budget'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCsvModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-[#1a3a6b] text-white">
              <h2 className="text-lg font-bold">Bulk Upload Budget CSV</h2>
              <button onClick={() => setIsCsvModalOpen(false)} className="text-white hover:text-slate-200 font-bold text-lg">×</button>
            </div>
            
            <div className="p-6 space-y-5">
              {/* Template Download Section */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-800">CSV Import Template</p>
                  <p className="text-xs text-slate-500">Download the structure before uploading your data</p>
                </div>
                <a
                  href="/api/admin/budget/import-template"
                  className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3 border-slate-300 hover:bg-slate-100"
                  download
                >
                  <Download size={14} /> Download Template
                </a>
              </div>

              {uploadResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
                    <CheckCircle size={18} />
                    Import completed successfully!
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <p className="text-xs text-slate-500 font-semibold uppercase">Total Rows</p>
                      <p className="text-2xl font-bold text-[#1a3a6b] mt-1">{uploadResult.total_rows}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                      <p className="text-xs text-slate-500 font-semibold uppercase">Created</p>
                      <p className="text-2xl font-bold text-emerald-600 mt-1">{uploadResult.created}</p>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
                      <p className="text-xs text-slate-500 font-semibold uppercase">Aggregated</p>
                      <p className="text-2xl font-bold text-indigo-600 mt-1">{uploadResult.aggregated}</p>
                    </div>
                  </div>

                  {uploadResult.errors && uploadResult.errors.length > 0 && (
                    <div className="bg-rose-50 border border-rose-100 rounded-lg p-3 text-xs text-rose-700 space-y-1 max-h-32 overflow-y-auto">
                      <p className="font-bold flex items-center gap-1"><AlertCircle size={12} /> Row Warnings:</p>
                      {uploadResult.errors.map((err: string, i: number) => (
                        <p key={i}>• {err}</p>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCsvModalOpen(false)}
                      className="btn-primary px-4 py-2"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCsvSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Financial Year</label>
                    <select
                      value={csvFyId}
                      onChange={e => setCsvFyId(e.target.value)}
                      required
                      className="input-field w-full"
                    >
                      <option value="">Select Financial Year...</option>
                      {fys.map((f: any) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Budget CSV File</label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={e => setCsvFile(e.target.files?.[0] || null)}
                      required
                      className="input-field w-full text-slate-600"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <button type="button" onClick={() => setIsCsvModalOpen(false)} className="btn-secondary">Cancel</button>
                    <button type="submit" disabled={uploadMutation.isPending} className="btn-primary flex items-center gap-2">
                      {uploadMutation.isPending ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> Uploading & Calculating...
                        </>
                      ) : (
                        <>
                          <Upload size={16} /> Import & Recalculate
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
