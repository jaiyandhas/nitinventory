import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Filter, Upload, Download, Loader2, AlertCircle, CheckCircle, Users, Award, ShieldAlert, Lock, Paperclip } from 'lucide-react';
import { adminApi, budgetApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatFileNo } from '../../utils/format';
import { toast } from 'react-hot-toast';

export const BudgetPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [searchTerm, setSearchTerm] = useState('');
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
  const [allocatedInitiatorId, setAllocatedInitiatorId] = useState<number | null>(null);

  const [selectedBudgetForDirector, setSelectedBudgetForDirector] = useState<any>(null);
  const [directorFacultyId, setDirectorFacultyId] = useState<number | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null);
  const [selectedBudgetForAllocation, setSelectedBudgetForAllocation] = useState<any>(null);
  const [allocationRemarks, setAllocationRemarks] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'review' | 'allocate'>('active');

  // Core Queries
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const { data: budgetsData, isLoading: loadingBudgets } = useQuery({ 
    queryKey: ['admin_budgets', searchTerm, deptFilter, fyFilter], 
    queryFn: () => adminApi.budget({ 
      skip: 0, 
      limit: 1000,
      search: searchTerm || undefined,
      department_id: deptFilter !== 'all' ? parseInt(deptFilter) : undefined,
      financial_year_id: fyFilter !== 'all' ? parseInt(fyFilter) : undefined
    }).then(res => res.data) 
  });

  const budgets = budgetsData?.items || [];
  
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

  const isWriteAllowed = user && user.role?.group_key === 'dean_approver';
  const isHOD = user && user.role?.group_key === 'hod';
  const isDirectorOrAdmin = user && (user.role?.value === 'director' || user.role?.group_key === 'apex_approver' || user.role?.group_key === 'admin');

  // Committee assignment mutations
  const assignCommitteeMutation = useMutation({
    mutationFn: ({ budgetId, expert1_id, expert2_id, allocated_initiator_id }: { budgetId: number; expert1_id: number | null; expert2_id: number | null; allocated_initiator_id?: number | null }) =>
      budgetApi.assignCommittee(budgetId, { expert1_id, expert2_id, allocated_initiator_id }),
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

  const assignPermanentFileNoMutation = useMutation({
    mutationFn: ({ budgetId, fileNo, remarks }: { budgetId: number; fileNo: string; remarks?: string }) =>
      adminApi.updateBudget(budgetId, { file_no: fileNo.replace(/^TEMP\//i, 'NITT/'), remarks }),
    onSuccess: () => {
      toast.success('Permanent file number assigned successfully and associated PRs resumed.');
      setSelectedBudgetId(null);
      setSelectedBudgetForAllocation(null);
      setAllocationRemarks('');
      queryClient.invalidateQueries({ queryKey: ['admin_budgets'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to assign permanent file number');
      setSelectedBudgetId(null);
    }
  });



  const activeBudgets = budgets.filter((b: any) => !b.file_no.toUpperCase().startsWith('TEMP/'));
  const tempBudgets = budgets.filter((b: any) => b.file_no.toUpperCase().startsWith('TEMP/'));
  const currentTabBudgets = activeTab === 'active' ? activeBudgets : tempBudgets;
  const total = currentTabBudgets.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const displayBudgets = currentTabBudgets.slice((page - 1) * limit, page * limit);

  // For the Allocate tab: same temp budgets, just renders action buttons
  // For the Review tab: same temp budgets, renders read-only detail view

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
    setAllocatedInitiatorId(budget.allocated_initiator_id || null);
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
      allocated_initiator_id: allocatedInitiatorId,
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
  const deptFaculties = faculties.filter((f: any) => Number(f.department_id) === Number(user?.department_id || user?.department?.id));

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
        
        {(isWriteAllowed || isHOD) && (
          <div className="flex gap-2">
            {isWriteAllowed && (
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
            )}
            <button 
              onClick={() => navigate('/budget/create')} 
              className="btn-primary flex items-center gap-2 px-4 py-2 font-semibold"
            >
              <Plus size={16} /> {isHOD ? 'Request Budget File' : 'Add Budget File'}
            </button>
          </div>
        )}
      </div>

      {/* Filters section */}
      <div className="card p-4 flex gap-4 bg-white border border-slate-200 shadow-sm items-center">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Filters:</span>
        </div>
        <input 
          type="text"
          placeholder="Search File No or Item Name..."
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
          className="input-field max-w-[250px] text-sm"
        />
        <select value={deptFilter} onChange={e => { setDeptFilter(e.target.value); setPage(1); }} className="input-field max-w-[200px] text-sm">
          <option value="all">All Departments</option>
          {depts.map((d: any) => <option key={d.id} value={d.id}>{d.short_code} - {d.name}</option>)}
        </select>
        <select value={fyFilter} onChange={e => { setFyFilter(e.target.value); setPage(1); }} className="input-field max-w-[200px] text-sm">
          <option value="all">All Financial Years</option>
          {fys.map((f: any) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 gap-0 px-1">
        <button
          onClick={() => { setActiveTab('active'); setPage(1); }}
          className={`pb-3 px-4 text-sm font-semibold tracking-wide border-b-2 transition-all relative ${
            activeTab === 'active'
              ? 'border-[#1a3a6b] text-[#1a3a6b]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Active Budgets
          <span className={`ml-2 px-2 py-0.5 text-xs rounded-full font-medium ${
            activeTab === 'active' ? 'bg-blue-100 text-[#1a3a6b]' : 'bg-slate-100 text-slate-600'
          }`}>
            {activeBudgets.length}
          </span>
        </button>
        <button
          onClick={() => { setActiveTab('review'); setPage(1); }}
          className={`pb-3 px-4 text-sm font-semibold tracking-wide border-b-2 transition-all relative ${
            activeTab === 'review'
              ? 'border-amber-500 text-amber-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Review Requests
          <span className={`ml-2 px-2 py-0.5 text-xs rounded-full font-semibold ${
            activeTab === 'review' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
          }`}>
            {tempBudgets.length}
          </span>
        </button>
        {isWriteAllowed && (
          <button
            onClick={() => { setActiveTab('allocate'); setPage(1); }}
            className={`pb-3 px-4 text-sm font-semibold tracking-wide border-b-2 transition-all relative ${
              activeTab === 'allocate'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Allocate
            {tempBudgets.length > 0 && (
              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full font-semibold ${
                activeTab === 'allocate' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {tempBudgets.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Active Budgets Table */}
      {activeTab === 'active' && (
        <div className="card overflow-x-auto border border-slate-200 shadow-sm">
          <table className="data-table">
            <thead>
              <tr>
                <th>File No / ID</th>
                <th>Dept</th>
                <th>Item Name</th>
                <th>Total Allocation</th>
                <th>Locked Fund</th>
                <th>Available Balance</th>
                <th>Technical Committee</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingBudgets ? (
                <tr><td colSpan={8} className="text-center py-8">Loading budget data...</td></tr>
              ) : displayBudgets.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-slate-500">No active budget records found.</td></tr>
              ) : (
                displayBudgets.map((b: any) => {
                  const matchesDept = Number(b.department_id) === Number(user?.department_id || user?.department?.id);
                  const budgetFy = fys.find((f: any) => f.id === b.financial_year_id);
                  const isFyClosed = budgetFy ? budgetFy.is_closed : false;
                  const fyLabel = budgetFy ? budgetFy.label : '';
                  return (
                    <tr key={b.id} className="hover:bg-slate-50 border-b border-slate-100">
                      <td className="font-medium text-slate-900">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-semibold uppercase tracking-wider">{formatFileNo(b.file_no, user?.role?.group_key)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-slate-400 font-normal">ID: {b.id}</span>
                            {fyLabel && (
                              <span className="px-1.5 py-0.2 bg-blue-50 border border-blue-200 text-blue-700 text-[10px] rounded font-sans font-medium">
                                {fyLabel}
                              </span>
                            )}
                            {isFyClosed && (
                              <span className="px-1.5 py-0.2 bg-red-50 border border-red-200 text-red-700 text-[10px] rounded font-sans font-semibold flex items-center gap-0.5" title="Financial Year is closed (Read-Only)">
                                <Lock size={10} /> Locked
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td><span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded">{depts.find((d: any) => d.id === b.department_id)?.short_code || b.department_id}</span></td>
                      <td className="max-w-[200px]" title={b.item_name}>
                        <div className="font-medium text-slate-800">{b.item_name}</div>
                        {b.remarks && (
                          <div className="text-[11px] text-slate-500 italic mt-0.5 max-w-[190px] truncate" title={b.remarks}>
                            Remarks: {b.remarks}
                          </div>
                        )}
                      </td>
                      <td>{formatCurrency(b.total_allocation ?? b.total_cost)}</td>
                      <td className="text-amber-600 font-medium">{formatCurrency(b.committed_amount ?? b.locked_amount)}</td>
                      <td className="font-semibold text-green-600">{formatCurrency(b.available_balance ?? b.available_amount)}</td>
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
                            <span className="font-medium text-slate-850 truncate">{b.director_faculty?.name || 'Not nominated'}</span>
                          </div>
                          <div className="flex justify-between gap-2 border-t border-slate-200/50 pt-1">
                            <span className="text-slate-400">Initiator:</span>
                            <span className="font-medium text-slate-850 truncate">{b.allocated_initiator?.name || 'Not allocated'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          {(isWriteAllowed || (isHOD && matchesDept)) && (
                            <button
                              onClick={() => navigate(`/budget/edit/${b.id}`)}
                              disabled={isFyClosed}
                              className={`p-1.5 rounded transition-colors ${
                                isFyClosed 
                                  ? 'text-slate-300 cursor-not-allowed bg-slate-50' 
                                  : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                              }`}
                              title={isFyClosed ? 'Locked - Financial Year is closed' : 'Edit details'}
                            >
                              <Edit2 size={16} />
                            </button>
                          )}
                          {isHOD && matchesDept && (
                            <button
                              onClick={() => openCommitteeModal(b)}
                              disabled={isFyClosed}
                              className={`p-1.5 rounded flex items-center gap-1 text-xs font-semibold border transition-colors ${
                                isFyClosed
                                  ? 'text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed opacity-60'
                                  : 'text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border-indigo-200'
                              }`}
                              title={isFyClosed ? 'Locked - Financial Year is closed' : 'Configure Technical Committee Experts'}
                            >
                              <Users size={14} /> Nominate
                            </button>
                          )}
                          {isDirectorOrAdmin && (
                            <button
                              onClick={() => openDirectorModal(b)}
                              disabled={isFyClosed}
                              className={`p-1.5 rounded flex items-center gap-1 text-xs font-semibold border transition-colors ${
                                isFyClosed
                                  ? 'text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed opacity-60'
                                  : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200'
                              }`}
                              title={isFyClosed ? 'Locked - Financial Year is closed' : 'Nominate Director Nominee'}
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
      )}

      {/* Review Requests Tab */}
      {(activeTab === 'review' || activeTab === 'allocate') && (
        <div className="card overflow-x-auto border border-slate-200 shadow-sm">
          {activeTab === 'review' && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
              <AlertCircle size={15} className="text-amber-600" />
              <p className="text-xs text-amber-700 font-medium">
                These are HOD-submitted temporary budget requests awaiting Dean review. File reference numbers are internal and not visible to HOD/Faculty.
              </p>
            </div>
          )}
          {activeTab === 'allocate' && isWriteAllowed && (
            <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
              <CheckCircle size={15} className="text-emerald-600" />
              <p className="text-xs text-emerald-700 font-medium">
                Review the request details and assign a permanent file number to approve the budget allocation.
              </p>
            </div>
          )}
          <table className="data-table">
            <thead>
              <tr>
                {isWriteAllowed && <th>Internal Ref No</th>}
                <th>Dept</th>
                <th>Item Description</th>
                <th>Category</th>
                <th>Financial Year</th>
                <th>Unit Cost</th>
                <th>Qty</th>
                <th>Total Cost</th>
                {activeTab === 'review' && <th>HOD Remarks</th>}
                {activeTab === 'allocate' && isWriteAllowed && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {loadingBudgets ? (
                <tr><td colSpan={9} className="text-center py-8">Loading...</td></tr>
              ) : tempBudgets.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-slate-500">No pending temporary budget requests.</td></tr>
              ) : (
                tempBudgets.map((b: any) => {
                  const budgetFy = fys.find((f: any) => f.id === b.financial_year_id);
                  const isFyClosed = budgetFy ? budgetFy.is_closed : false;
                  const fyLabel = budgetFy ? budgetFy.label : '—';
                  return (
                    <tr key={b.id} className="hover:bg-slate-50 border-b border-slate-100">
                      {isWriteAllowed && (
                        <td className="font-medium text-slate-900">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-[11px] font-bold text-amber-700 uppercase tracking-wider bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded w-fit">
                              {b.file_no}
                            </span>
                            <span className="text-[10px] text-slate-400">ID: {b.id}</span>
                            {isFyClosed && (
                              <span className="px-1.5 py-0.2 bg-red-50 border border-red-200 text-red-700 text-[10px] rounded font-sans font-semibold flex items-center gap-0.5 w-fit">
                                <Lock size={9} /> Locked
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      <td><span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded">{depts.find((d: any) => d.id === b.department_id)?.short_code || b.department_id}</span></td>
                      <td className="max-w-[180px]">
                        <div className="font-medium text-slate-800 text-sm">{b.item_name}</div>
                      </td>
                      <td>
                        <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-medium rounded capitalize">{b.category || '—'}</span>
                      </td>
                      <td>
                        <span className="px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 text-xs font-medium rounded">{fyLabel}</span>
                      </td>
                      <td className="text-slate-700 font-mono text-xs">{formatCurrency(b.unit_cost)}</td>
                      <td className="text-slate-700 font-semibold text-sm text-center">{b.quantity}</td>
                      <td className="font-bold text-slate-900">{formatCurrency(b.total_allocation ?? b.total_cost)}</td>
                      {activeTab === 'review' && (
                        <td className="max-w-[180px]">
                          {b.remarks ? (
                            <p className="text-xs text-slate-600 italic">{b.remarks}</p>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      )}
                      {activeTab === 'allocate' && isWriteAllowed && (
                        <td>
                          <button
                            onClick={() => {
                              setSelectedBudgetForAllocation(b);
                              setAllocationRemarks(b.remarks || '');
                            }}
                            disabled={isFyClosed}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 ${
                              isFyClosed
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow'
                            }`}
                            title={isFyClosed ? 'Locked - Financial Year is closed' : 'Assign Permanent File Number'}
                          >
                            {isFyClosed ? <Lock size={12} /> : <CheckCircle size={12} />}
                            Allocate
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls - only for Active Budgets tab */}
      {activeTab === 'active' && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 bg-white px-4 py-3 sm:px-6 mt-4 rounded-lg shadow-sm">
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-between w-full sm:w-auto">
            <p className="text-sm text-slate-700">
              Showing <span className="font-medium">{total === 0 ? 0 : (page - 1) * limit + 1}</span> to{' '}
              <span className="font-medium">{Math.min(page * limit, total)}</span> of{' '}
              <span className="font-medium">{total}</span> budgets
            </p>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Show</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border-slate-300 py-1 px-2 text-sm focus:border-[#1a3a6b] focus:ring-[#1a3a6b] bg-white border shadow-sm"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>per page</span>
            </div>
          </div>
          <div className="flex items-center justify-between w-full sm:w-auto gap-4">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="relative inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
                className="relative ml-3 inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            {totalPages > 1 && (
              <div className="hidden sm:block">
                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                  <button
                    onClick={() => setPage(p => Math.max(p - 1, 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center rounded-l-md px-3 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold focus:z-20 ${
                        p === page
                          ? 'z-10 bg-[#1a3a6b] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a3a6b]'
                          : 'text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:outline-offset-0'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                    disabled={page === totalPages}
                    className="relative inline-flex items-center rounded-r-md px-3 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            )}
          </div>
        </div>
      )}

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

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Purchase Initiator (Faculty) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={allocatedInitiatorId || ''}
                  onChange={e => setAllocatedInitiatorId(Number(e.target.value) || null)}
                  required
                  className="input-field w-full"
                >
                  <option value="">Select Purchase Initiator...</option>
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

      {/* Review Temporary Budget Allocation Modal */}
      {selectedBudgetForAllocation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 bg-amber-600 text-white flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">Review Temporary Budget Request</h2>
                <p className="text-xs text-amber-100 mt-0.5">Verify details before assigning permanent rolling number</p>
              </div>
              <button 
                onClick={() => { setSelectedBudgetForAllocation(null); setAllocationRemarks(''); }} 
                className="text-white hover:text-amber-100 font-bold text-xl leading-none"
              >
                &times;
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Temp File Reference</span>
                  <span className="font-mono font-bold text-slate-800 uppercase tracking-wide">{selectedBudgetForAllocation.file_no}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Department</span>
                  <span className="font-semibold text-slate-700">{depts.find((d: any) => d.id === selectedBudgetForAllocation.department_id)?.name || selectedBudgetForAllocation.department_id}</span>
                </div>
                <div className="col-span-2 border-t border-slate-200/60 pt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Item Description</span>
                  <span className="font-medium text-slate-900">{selectedBudgetForAllocation.item_name}</span>
                </div>
                <div className="border-t border-slate-200/60 pt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Category</span>
                  <span className="font-medium text-slate-750 capitalize">{selectedBudgetForAllocation.category}</span>
                </div>
                <div className="border-t border-slate-200/60 pt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Financial Year</span>
                  <span className="font-semibold text-slate-700">{fys.find((f: any) => f.id === selectedBudgetForAllocation.financial_year_id)?.label || selectedBudgetForAllocation.financial_year_id}</span>
                </div>
                <div className="border-t border-slate-200/60 pt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Unit Cost</span>
                  <span className="font-mono text-slate-900">{formatCurrency(selectedBudgetForAllocation.unit_cost)}</span>
                </div>
                <div className="border-t border-slate-200/60 pt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Quantity</span>
                  <span className="font-semibold text-slate-800">{selectedBudgetForAllocation.quantity}</span>
                </div>
                <div className="col-span-2 border-t border-slate-200/60 pt-2 bg-amber-50/50 -mx-4 -mb-4 p-4 rounded-b-xl border-t border-amber-100 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Total Cost / Allocation</span>
                    <span className="text-lg font-bold text-amber-800 font-sans">{formatCurrency(selectedBudgetForAllocation.total_allocation ?? selectedBudgetForAllocation.total_cost)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Target Rolling Sequence</span>
                    <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded uppercase tracking-wide">
                      {selectedBudgetForAllocation.file_no.replace(/^TEMP\//i, 'NITT/')}
                    </span>
                  </div>
                </div>
              </div>

              {selectedBudgetForAllocation.remarks && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                  <span className="font-semibold text-slate-700 block mb-1">HOD remarks & justification:</span>
                  <p className="text-slate-600 italic">"{selectedBudgetForAllocation.remarks}"</p>
                </div>
              )}

              {selectedBudgetForAllocation.attachment_url && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                  <Paperclip size={14} className="text-blue-600 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="font-semibold text-blue-800 block">Supporting Document</span>
                    <span className="text-blue-600 text-[11px]">Attached by HOD at the time of request</span>
                  </div>
                  <a
                    href={selectedBudgetForAllocation.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-[11px] flex items-center gap-1 transition-colors"
                  >
                    View Document
                  </a>
                </div>
              )}

              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block" htmlFor="alloc-remarks">
                  Allocation Remarks / Comments <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  id="alloc-remarks"
                  rows={2}
                  placeholder="Enter remarks or approval notes for the audit trail..."
                  value={allocationRemarks}
                  onChange={(e) => setAllocationRemarks(e.target.value)}
                  className="input-field w-full text-xs resize-none bg-white font-normal text-slate-700"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button
                type="button"
                onClick={() => { setSelectedBudgetForAllocation(null); setAllocationRemarks(''); }}
                className="btn-secondary text-xs px-4"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setSelectedBudgetId(selectedBudgetForAllocation.id);
                  assignPermanentFileNoMutation.mutate({
                    budgetId: selectedBudgetForAllocation.id,
                    fileNo: selectedBudgetForAllocation.file_no,
                    remarks: allocationRemarks
                  });
                }}
                disabled={assignPermanentFileNoMutation.isPending}
                className="btn-primary bg-amber-600 hover:bg-amber-700 border-none text-white text-xs px-5 flex items-center gap-1.5 shadow-sm font-semibold"
              >
                {assignPermanentFileNoMutation.isPending ? (
                  <><Loader2 size={14} className="animate-spin" /> Allocating...</>
                ) : (
                  <>Approve &amp; Assign Permanent File Number</>
                )}
              </button>
            </div>
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
