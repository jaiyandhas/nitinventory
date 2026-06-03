import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Filter, Upload, Download, Loader2, AlertCircle, CheckCircle, Users, Award, ShieldAlert } from 'lucide-react';
import { adminApi, budgetApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/format';
import { toast } from 'react-hot-toast';

export const BudgetPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [fyFilter, setFyFilter] = useState<string>('all');
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  // CSV upload states
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvFyId, setCsvFyId] = useState<string>('');
  const [uploadResult, setUploadResult] = useState<any>(null);

  // Technical Committee assignment states
  const [selectedBudgetForCommittee, setSelectedBudgetForCommittee] = useState<any>(null);
  const [expert1Id, setExpert1Id] = useState<number | null>(null);
  const [expert2Id, setExpert2Id] = useState<number | null>(null);

  const [selectedBudgetForDirector, setSelectedBudgetForDirector] = useState<any>(null);
  const [directorFacultyId, setDirectorFacultyId] = useState<number | null>(null);

  // Core Queries
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

  // Nominee Options Queries
  const { data: faculties = [] } = useQuery({
    queryKey: ['all_faculties'],
    queryFn: () => budgetApi.allFaculties().then(res => res.data)
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all_users'],
    queryFn: () => budgetApi.allUsers().then(res => res.data)
  });

  const isWriteAllowed = user && ['admin', 'dean_approver'].includes(user.role?.group_key || '');
  const isHOD = user && user.role?.group_key === 'hod';
  const isDirectorOrAdmin = user && (user.role?.value === 'director' || user.role?.group_key === 'admin');

  // Committee assignment mutations
  const assignCommitteeMutation = useMutation({
    mutationFn: ({ budgetId, expert1_id, expert2_id }: { budgetId: number; expert1_id: number | null; expert2_id: number | null }) =>
      budgetApi.assignCommittee(budgetId, { expert1_id, expert2_id }),
    onSuccess: () => {
      toast.success('Technical committee updated successfully');
      setSelectedBudgetForCommittee(null);
      queryClient.invalidateQueries({ queryKey: ['admin_budgets'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update technical committee');
    }
  });

  const assignDirectorCommitteeMutation = useMutation({
    mutationFn: ({ budgetId, director_faculty_id }: { budgetId: number; director_faculty_id: number | null }) =>
      budgetApi.assignDirectorCommittee(budgetId, { director_faculty_id }),
    onSuccess: () => {
      toast.success('Director nominee updated successfully');
      setSelectedBudgetForDirector(null);
      queryClient.invalidateQueries({ queryKey: ['admin_budgets'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update director nominee');
    }
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

  const clearBudgetsMutation = useMutation({
    mutationFn: () => adminApi.clearBudgets(),
    onSuccess: (res: any) => {
      toast.success(res.data?.message || 'Unlinked budgets cleared successfully!');
      queryClient.invalidateQueries({ queryKey: ['admin_budgets'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to clear budgets');
    }
  });

  const handleClearBudgets = () => {
    if (window.confirm("Are you sure you want to clear all unlinked budget entries? This action cannot be undone.")) {
      clearBudgetsMutation.mutate();
    }
  };

  const filteredBudgets = budgets.filter((b: any) => {
    if (deptFilter !== 'all' && b.department_id !== parseInt(deptFilter)) return false;
    if (fyFilter !== 'all' && b.financial_year_id !== parseInt(fyFilter)) return false;
    return true;
  });

  const handleCsvSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      toast.error('Please select a CSV file');
      return;
    }
    if (!csvFyId) {
      toast.error('Please select a financial year');
      return;
    }
    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('financial_year_id', csvFyId);
    uploadMutation.mutate(formData);
  };

  const openCommitteeModal = (budget: any) => {
    setSelectedBudgetForCommittee(budget);
    setExpert1Id(budget.expert1_id || null);
    setExpert2Id(budget.expert2_id || null);
  };

  const openDirectorModal = (budget: any) => {
    setSelectedBudgetForDirector(budget);
    setDirectorFacultyId(budget.director_faculty_id || null);
  };

  const submitCommittee = (e: React.FormEvent) => {
    e.preventDefault();
    if (expert1Id && expert2Id && expert1Id === expert2Id) {
      toast.error('Expert 1 and Expert 2 must be different faculty members');
      return;
    }
    assignCommitteeMutation.mutate({
      budgetId: selectedBudgetForCommittee.id,
      expert1_id: expert1Id,
      expert2_id: expert2Id,
    });
  };

  const submitDirectorCommittee = (e: React.FormEvent) => {
    e.preventDefault();
    assignDirectorCommitteeMutation.mutate({
      budgetId: selectedBudgetForDirector.id,
      director_faculty_id: directorFacultyId,
    });
  };

  // Filter department faculties for HOD select dropdowns
  const deptFaculties = faculties.filter((f: any) => f.department_id === user?.department_id);

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Budget Management Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">
            Initiate standalone budget master files, assign technical committees, and track allocations.
          </p>
        </div>
        
        {isWriteAllowed && (
          <div className="flex gap-2">
            <button
              onClick={handleClearBudgets}
              disabled={clearBudgetsMutation.isPending}
              className="px-4 py-2 border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg font-semibold text-sm transition-all"
            >
              Clear Budgets
            </button>
            <button
              onClick={() => {
                setUploadResult(null);
                setCsvFile(null);
                setIsCsvModalOpen(true);
              }}
              className="btn-secondary flex items-center gap-2 border-slate-300 px-4 py-2 hover:bg-slate-100 transition-all font-semibold"
            >
              <Upload size={16} /> Bulk Upload CSV
            </button>
            <button 
              onClick={() => navigate('/budget/create')} 
              className="btn-primary flex items-center gap-2 px-4 py-2 font-semibold"
            >
              <Plus size={16} /> Add Budget File
            </button>
          </div>
        )}
      </div>

      {/* Filters section */}
      <div className="card p-4 flex gap-4 bg-white border border-slate-200 shadow-sm">
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

      {/* Main budgets table */}
      <div className="card overflow-hidden border border-slate-200 shadow-sm">
        <table className="data-table">
          <thead>
            <tr>
              <th>File No / ID</th>
              <th>Dept</th>
              <th>Item Name</th>
              <th>Total Cost</th>
              <th>Locked (PRs)</th>
              <th>Spent (POs)</th>
              <th>Available</th>
              <th>Technical Committee</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingBudgets ? (
              <tr><td colSpan={9} className="text-center py-8">Loading budget data...</td></tr>
            ) : filteredBudgets.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-slate-500">No budget records found.</td></tr>
            ) : (
              filteredBudgets.map((b: any) => {
                const hasCommittee = b.expert1 || b.expert2 || b.director_faculty;
                const matchesDept = b.department_id === user?.department_id;
                
                return (
                  <tr key={b.id} className="hover:bg-slate-50 border-b border-slate-100">
                    <td className="font-medium text-slate-900">
                      <div className="font-mono text-xs font-semibold uppercase tracking-wider">{b.file_no}</div>
                      <span className="text-[10px] text-slate-400 font-normal">ID: {b.id}</span>
                    </td>
                    <td><span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded">{depts.find((d: any) => d.id === b.department_id)?.short_code || b.department_id}</span></td>
                    <td className="max-w-[150px] truncate" title={b.item_name}>{b.item_name}</td>
                    <td>{formatCurrency(b.total_cost)}</td>
                    <td className="text-amber-600 font-medium">{formatCurrency(b.locked_amount)}</td>
                    <td className="text-slate-600 font-medium">{formatCurrency(b.deducted_amount)}</td>
                    <td className="font-semibold text-green-600">{formatCurrency(b.available_amount)}</td>
                    <td>
                      <div className="text-xs space-y-1 bg-slate-50 border border-slate-200/60 p-2 rounded-lg max-w-[200px]">
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400">Exp 1:</span>
                          <span className="font-medium text-slate-700 truncate">{b.expert1?.name || 'Not nominated'}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-400">Exp 2:</span>
                          <span className="font-medium text-slate-700 truncate">{b.expert2?.name || 'Not nominated'}</span>
                        </div>
                        <div className="flex justify-between gap-2 border-t border-slate-200/50 pt-1">
                          <span className="text-slate-400">Nominee:</span>
                          <span className="font-medium text-slate-800 truncate">{b.director_faculty?.name || 'Not nominated'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {/* Edit details button */}
                        {isWriteAllowed && (
                          <button
                            onClick={() => navigate(`/budget/edit/${b.id}`)}
                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                            title="Edit details"
                          >
                            <Edit2 size={16} />
                          </button>
                        )}

                        {/* HOD Assign Experts button */}
                        {isHOD && matchesDept && (
                          <button
                            onClick={() => openCommitteeModal(b)}
                            className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded flex items-center gap-1 text-xs font-semibold border border-indigo-200"
                            title="Configure Technical Committee Experts"
                          >
                            <Users size={14} /> Nominate
                          </button>
                        )}

                        {/* Director Nominee button */}
                        {isDirectorOrAdmin && (
                          <button
                            onClick={() => openDirectorModal(b)}
                            className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded flex items-center gap-1 text-xs font-semibold border border-emerald-200"
                            title="Nominate Director Nominee"
                          >
                            <Award size={14} /> Nominee
                          </button>
                        )}
                        
                        {!isWriteAllowed && (!isHOD || !matchesDept) && !isDirectorOrAdmin && (
                          <span className="text-xs text-slate-400 italic">No Actions</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* HOD nomination modal */}
      {selectedBudgetForCommittee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-[#1a3a6b] text-white">
              <h2 className="text-lg font-bold">Nominate Technical Committee</h2>
              <p className="text-xs text-blue-200 mt-1">File No: {selectedBudgetForCommittee.file_no}</p>
            </div>
            
            <form onSubmit={submitCommittee} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Department Expert 1 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={expert1Id || ''}
                  onChange={e => setExpert1Id(Number(e.target.value) || null)}
                  required
                  className="input-field w-full"
                >
                  <option value="">Select Faculty Expert...</option>
                  {deptFaculties.map((f: any) => (
                    <option key={f.id} value={f.id}>{f.name} ({f.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Department Expert 2 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={expert2Id || ''}
                  onChange={e => setExpert2Id(Number(e.target.value) || null)}
                  required
                  className="input-field w-full"
                >
                  <option value="">Select Faculty Expert...</option>
                  {deptFaculties.map((f: any) => (
                    <option key={f.id} value={f.id}>{f.name} ({f.email})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedBudgetForCommittee(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignCommitteeMutation.isPending}
                  className="btn-primary px-5 flex items-center gap-1.5"
                >
                  {assignCommitteeMutation.isPending ? 'Updating...' : 'Nominate Experts'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Director nominee modal */}
      {selectedBudgetForDirector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-[#1a3a6b] text-white">
              <h2 className="text-lg font-bold">Assign Director Nominee</h2>
              <p className="text-xs text-blue-200 mt-1">File No: {selectedBudgetForDirector.file_no}</p>
            </div>
            
            <form onSubmit={submitDirectorCommittee} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Director Nominee (Faculty/User) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={directorFacultyId || ''}
                  onChange={e => setDirectorFacultyId(Number(e.target.value) || null)}
                  required
                  className="input-field w-full"
                >
                  <option value="">Select Nominee...</option>
                  {allUsers.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedBudgetForDirector(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignDirectorCommitteeMutation.isPending}
                  className="btn-primary px-5 flex items-center gap-1.5"
                >
                  {assignDirectorCommitteeMutation.isPending ? 'Updating...' : 'Assign Nominee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk upload CSV modal */}
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
                      <p className="font-bold flex items-center gap-1"><ShieldAlert size={12} /> Row Warnings:</p>
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
