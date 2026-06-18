import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldAlert, Search, FileText, Clock, Paperclip, ChevronRight, Download
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { formatCurrency } from '../utils/format';
import { prApi, budgetApi, adminApi, assetsApi } from '../services/api';
import { queryKeys } from '../config/queryKeys';
import { PurchaseRequest } from '../types';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

// Modular Detail Components
import { PRHeader } from '../components/pr/detail/PRHeader';
import { PRActionPanel } from '../components/pr/PRActionPanel';
import { PRSummaryTable } from '../components/pr/detail/PRSummaryTable';
import { CollapsibleIndentPanel } from '../components/pr/detail/CollapsibleIndentPanel';
import { resolveTechCommitteeIds } from '../utils/techCommittee';

const STAGES = [
  { key: 'request', label: 'Request', desc: 'Initial Indent' },
  { key: 'aa', label: 'Indent', desc: 'Indent Approval' },
  { key: 'tendering', label: 'Tendering', desc: 'Tender Prep' },
  { key: 'tech_eval', label: 'Tech Eval', desc: 'TSC Evaluation' },
  { key: 'fin_sanction', label: 'Fin Sanction', desc: 'Financial Sanction' },
  { key: 'po', label: 'Purchase Order', desc: 'PO Issuance' },
  { key: 'delivery', label: 'Delivery', desc: 'Receipt & GRN' },
  { key: 'assets', label: 'Assets', desc: 'Asset Logging' },
];

export const PRDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role?.group_key === 'admin';
  const isHodOrAbove = user && user.role?.group_key !== 'faculty';


  const [selectedStageKey, setSelectedStageKey] = useState<string>('request');

  // Admin control states
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [adminFilterRole, setAdminFilterRole] = useState('');
  const [adminFilterDept, setAdminFilterDept] = useState('');
  const [forceAdvanceRemarks, setForceAdvanceRemarks] = useState('');
  const [isForceAdvanceOpen, setIsForceAdvanceOpen] = useState(false);

  // Admin queries
  const { data: adminRoles = [] } = useQuery({
    queryKey: queryKeys.admin.roles,
    queryFn: () => adminApi.roles().then(res => res.data),
    enabled: isAdmin
  });
  const { data: adminUsers = [] } = useQuery({
    queryKey: queryKeys.admin.usersList,
    queryFn: () => adminApi.users().then(res => res.data),
    enabled: isAdmin
  });
  const { data: adminDepts = [] } = useQuery({
    queryKey: queryKeys.admin.depts,
    queryFn: () => adminApi.departments().then(res => res.data),
    enabled: isAdmin
  });

  // Load assets and filter for this PR
  const { data: allAssetsData } = useQuery({
    queryKey: queryKeys.assets.detailList,
    queryFn: () => assetsApi.list({ limit: 200 }).then(r => r.data),
  });
  const allAssets = allAssetsData?.items || [];

  // Admin mutations
  const updateWfMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => adminApi.updateWorkflow(id, data),
    onSuccess: () => {
      toast.success('Workflow step updated successfully');
      queryClient.invalidateQueries({ queryKey: queryKeys.prs.detail(Number(id)) });
      queryClient.invalidateQueries({ queryKey: queryKeys.prs.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.files() });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview() });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.admin() });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update workflow step')
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => adminApi.updateUser(id, data),
    onSuccess: () => {
      toast.success('User role updated successfully');
      queryClient.invalidateQueries({ queryKey: queryKeys.prs.detail(Number(id)) });
      queryClient.invalidateQueries({ queryKey: queryKeys.prs.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.usersList });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update user role')
  });
  const forceAdvanceMutation = useMutation({
    mutationFn: (remarks: string) => adminApi.forceAdvancePr(Number(id), remarks),
    onSuccess: () => {
      toast.success('Purchase request force-advanced successfully');
      setForceAdvanceRemarks('');
      setIsForceAdvanceOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.prs.detail(Number(id)) });
      queryClient.invalidateQueries({ queryKey: queryKeys.prs.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.files() });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview() });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.admin() });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to force-advance purchase request');
    }
  });

  // Budget File Allocation state & mutation
  const [budgetAllocRemarks, setBudgetAllocRemarks] = useState('');
  const [selectedBudgetFileId, setSelectedBudgetFileId] = useState<number | ''>('');
  const allocateBudgetFileMutation = useMutation({
    mutationFn: () => prApi.allocateBudgetFile(Number(id), {
      remarks: budgetAllocRemarks,
      selected_budget_file_id: selectedBudgetFileId === '' ? null : Number(selectedBudgetFileId)
    }),
    onSuccess: () => {
      toast.success('Budget file number allocated — PR has resumed.');
      setBudgetAllocRemarks('');
      setSelectedBudgetFileId('');
      queryClient.invalidateQueries({ queryKey: queryKeys.prs.detail(Number(id)) });
      queryClient.invalidateQueries({ queryKey: queryKeys.prs.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.files() });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview() });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.admin() });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to allocate budget file number');
    },
  });
  const { data: pr, refetch: originalRefetch, isError, error } = useQuery<PurchaseRequest>({
    queryKey: queryKeys.prs.detail(Number(id)),
    queryFn: () => prApi.get(Number(id)).then(r => r.data),
    retry: (failureCount, err: any) => {
      // Never retry on auth/authz errors — they will not resolve on their own
      const status = err?.response?.status;
      if (status === 403 || status === 401 || status === 404) return false;
      return failureCount < 2;
    },
  });

  const refetch = () => {
    originalRefetch();
    queryClient.invalidateQueries({ queryKey: queryKeys.prs.all });
    queryClient.invalidateQueries({ queryKey: ['dashboard-aas'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview() });
    queryClient.invalidateQueries({ queryKey: queryKeys.budgets.files() });
    queryClient.invalidateQueries({ queryKey: ['administrative-approvals'] });
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.deliveries });
    queryClient.invalidateQueries({ queryKey: queryKeys.assets.all });
  };

  const { data: faculties = [] } = useQuery<any[]>({
    queryKey: queryKeys.users.deptFaculty,
    queryFn: () => budgetApi.departmentFaculty().then(r => r.data),
    enabled: !!pr && user?.role?.group_key === 'hod' && (
      pr.flow?.expected_group === 'hod' ||
      pr.flow?.expected_role_name?.toLowerCase().includes('hod') ||
      pr.flow?.phase_name === 'Indent and Detailed Tech Specification' ||
      pr.flow?.phase_name === 'Administrative Approval'
    ),
  });

  const { data: permanentBudgets = [] } = useQuery<any[]>({
    queryKey: queryKeys.budgets.permanent(pr?.initiator?.department?.id || pr?.initiator_id, pr?.financial_year_id),
    queryFn: () => adminApi.budget({
      department_id: pr?.initiator?.department?.id,
      financial_year_id: pr?.financial_year_id,
      is_temporary: false,
      limit: 1000
    }).then(r => r.data.items || []),
    enabled: !!pr && pr.current_status === 'budget_file_allocation' && ['dean_approver', 'admin'].includes(user?.role?.group_key || ''),
  });

  const getActiveStageIndex = (pr: PurchaseRequest): number => {
    if (!pr.flow) {
      if (pr.current_status === 'completed') return 7; // Assets
      if (pr.current_status === 'po_issued') return 6; // Delivery
      return 0; // Request
    }
    const phase = pr.flow.phase_name;
    // Support both old and new phase name for backward compat
    if (phase === 'Indent and Detailed Tech Specification' || phase === 'Administrative Approval') return 1;
    if (phase === 'Tendering') return 2;
    if (phase === 'Technical Evaluation') return 3;
    if (phase === 'Financial Sanction') return 4;
    if (phase === 'Purchase Order') return 5;
    return 0;
  };

  useEffect(() => {
    if (pr) {
      const activeIdx = getActiveStageIndex(pr);
      setSelectedStageKey(STAGES[activeIdx].key);
    }
  }, [pr]);

  if (isError) {
    const status = (error as any)?.response?.status;
    const detail = (error as any)?.response?.data?.detail;
    return (
      <div className="max-w-lg mx-auto mt-24 text-center space-y-4 px-4">
        <div className="text-5xl">{status === 403 ? '🔒' : status === 404 ? '🔍' : '⚠️'}</div>
        <h2 className="text-xl font-bold text-slate-800">
          {status === 403 ? 'Access Denied' : status === 404 ? 'Not Found' : 'Something went wrong'}
        </h2>
        <p className="text-sm text-slate-500">
          {detail || (status === 403 ? 'You do not have permission to view this purchase request.' : 'Unable to load purchase request.')}
        </p>
        <button onClick={() => window.history.back()} className="btn-primary px-6 py-2 text-sm">
          ← Go Back
        </button>
      </div>
    );
  }

  if (!pr) return <div className="text-center py-16 text-slate-500 font-medium">Loading details...</div>;

  const activeStageIndex = getActiveStageIndex(pr);
  const activeStageKey = STAGES[activeStageIndex].key;

  let canActOn = false;
  if (user?.role?.group_key === 'admin') {
    canActOn = true;
  } else if (pr.flow) {
    if (pr.flow.step_type === 'tech_evaluation') {
      const _committeeIds = resolveTechCommitteeIds(pr);
      const _isCommitteeMember = _committeeIds.includes(user?.id ?? -1);
      const _teSince = pr.te_initiated_at ? new Date(pr.te_initiated_at) : null;
      const _allCommitteeSigned = _committeeIds.length > 0 && _committeeIds.every((id: number) =>
        pr.history?.some((h: any) =>
          h.approver_id === id &&
          (h.status === 'Technical Evaluation Completed' || h.status === 'Technical Evaluation Approved') &&
          (!_teSince || !h.acted_at || new Date(h.acted_at) >= _teSince)
        )
      );
      canActOn = _isCommitteeMember || (_allCommitteeSigned && user?.id === pr.initiator?.id);
    } else if (pr.flow.expected_user_id) {
      if (user?.id === pr.flow.expected_user_id) {
        canActOn = true;
      }
    } else if (pr.flow.expected_role_name === 'Faculty' || pr.flow.expected_group === 'faculty') {
      canActOn = user?.id === pr.initiator?.id;
    } else if (pr.flow.expected_role_id) {
      if (user?.role_id === pr.flow.expected_role_id) {
        canActOn = true;
      }
    } else if (pr.flow.expected_group) {
      if (user?.role?.group_key === pr.flow.expected_group) {
        canActOn = true;
      }
    }
  }

  const activeReferralForUser = pr.referrals?.find((ref: any) => ref.referred_to?.id === user?.id && ref.status === 'pending');
  const anyPendingReferral = pr.referrals?.find((ref: any) => ref.status === 'pending');

  const isActionable = (canActOn || !!activeReferralForUser || !!anyPendingReferral) && !['po_issued', 'rejected', 'cancelled', 'completed', 'budget_file_allocation'].includes(pr.current_status);

  // Filter assets belonging to this PR's deliveries

  // Filter assets belonging to this PR's deliveries
  const prAssets = allAssets.filter((asset: any) => {
    if (asset.delivery_item_id && pr?.deliveries) {
      return pr.deliveries.some((d: any) => 
        d.items?.some((item: any) => item.id === asset.delivery_item_id)
      );
    }
    return false;
  });

  const activeReferral = pr.referrals?.find((ref: any) => ref.status === 'pending');

const activeStageObj = STAGES.find(s => s.key === selectedStageKey);

  // Signatures resolved from history snapshot logs
  const findSignature = (roleVal?: string, statusKeyword?: string, userId?: number): any | null => {
    if (!pr.history) return null;
    const sorted = [...pr.history].sort((a, b) => new Date(b.acted_at || 0).getTime() - new Date(a.acted_at || 0).getTime());
    for (const h of sorted) {
      if (h.status?.includes('Voided')) continue;
      if (userId && h.approver_id === userId) {
        if (!statusKeyword || h.status.toLowerCase().includes(statusKeyword.toLowerCase())) {
          return h;
        }
      }
      if (roleVal && h.frozen_designation?.toLowerCase().includes(roleVal.toLowerCase())) {
        if (!statusKeyword || h.status.toLowerCase().includes(statusKeyword.toLowerCase())) {
          return h;
        }
      }
    }
    return null;
  };

  const initiatorSig = findSignature(undefined, undefined, pr.initiator_id);
  const faculty1Sig = findSignature(undefined, 'Technical Evaluation', pr.faculty1_id) || findSignature(undefined, 'Completed', pr.faculty1_id);
  const faculty2Sig = findSignature(undefined, 'Technical Evaluation', pr.faculty2_id) || findSignature(undefined, 'Completed', pr.faculty2_id);
  const faculty3Sig = findSignature(undefined, 'Technical Evaluation', pr.faculty3_id) || findSignature(undefined, 'Completed', pr.faculty3_id);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Split-Demand Warning Banner */}
      {pr && pr.is_potential_split && isHodOrAbove && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-lg shadow-sm">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-bold text-amber-800">Potential Split-Demand Warning</h3>
              <div className="mt-1 text-xs text-amber-700">
                <p>
                  This department/initiator has submitted other purchase requests in the same category within the last 30 days. The combined total exceeds the maximum GFR limit for the selected procurement method ({formatCurrency(pr.procurement?.max_amount)}).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <PRHeader
        pr={pr}
        user={user}
        isAdmin={isAdmin}
        adminRoles={adminRoles}
        adminUsers={adminUsers}
        adminDepts={adminDepts}
        updateWfMutation={updateWfMutation}
        formatCurrency={formatCurrency}
        refetch={refetch}
      />

      {(
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main workspace */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Stepper */}
            <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm overflow-x-auto">
              <div className="flex items-center justify-between min-w-[700px]">
                {STAGES.map((s, idx) => {
                  const isCompleted = idx < activeStageIndex;
                  const isActive = idx === activeStageIndex;
                  const isSelected = selectedStageKey === s.key;
                  
                  let circleBg = "bg-slate-100 border-slate-300 text-slate-400";
                  let borderCol = "border-slate-200";

                  if (isCompleted) {
                    circleBg = "bg-green-100 border-green-300 text-green-700";
                    borderCol = "border-green-300";
                  } else if (isActive) {
                    if (pr.current_status === 'rejected' || pr.current_status === 'cancelled') {
                      circleBg = "bg-red-100 border-red-300 text-red-700";
                      borderCol = "border-red-300";
                    } else if (pr.current_status === 'budget_file_allocation') {
                      circleBg = "bg-amber-100 border-amber-400 text-amber-800 ring-2 ring-amber-400 ring-offset-2 animate-pulse";
                      borderCol = "border-amber-400";
                    } else {
                      circleBg = "bg-blue-100 border-blue-500 text-blue-800 ring-2 ring-blue-400 ring-offset-2 animate-pulse";
                      borderCol = "border-blue-400";
                    }
                  }

                  return (
                    <React.Fragment key={s.key}>
                      <button
                        onClick={() => setSelectedStageKey(s.key)}
                        className={`flex flex-col items-center gap-1.5 focus:outline-none transition-all ${
                          isSelected ? 'scale-105' : 'opacity-85 hover:opacity-100'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs ${circleBg}`}>
                          {isCompleted ? <span className="font-bold">✓</span> : idx + 1}
                        </div>
                        <div className="text-center">
                          <p className={`text-xs font-bold ${isSelected ? 'text-[#1a3a6b] font-black' : 'text-slate-600'}`}>{s.label}</p>
                          <p className="text-[9px] text-slate-400 font-semibold">{s.desc}</p>
                        </div>
                      </button>
                      {idx < STAGES.length - 1 && (
                        <div className={`flex-1 h-0.5 mx-2 border-t border-dashed ${borderCol}`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* ── Budget File Allocation Banner ─────────────────────────────────── */}
            {pr.current_status === 'budget_file_allocation' && (
              <div className="rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 bg-amber-100/60 border-b border-amber-200">
                  <Clock size={18} className="text-amber-600 shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-900 tracking-wide">Awaiting Budget File Allocation</h3>
                    <p className="text-xs text-amber-700 font-medium mt-0.5">
                      This request was approved administratively but is paused until the Dean Budget/Finance section assigns a permanent budget file number.
                    </p>
                  </div>
                </div>

                <div className="p-5">
                  {/* Temp file number details from linked items */}
                  {pr.items && pr.items.some((item: any) => item.budget_file?.file_no?.toUpperCase().startsWith('TEMP')) && (
                    <div className="mb-4 space-y-2.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Temporary Budget File References</span>
                      {pr.items
                        .filter((item: any) => item.budget_file?.file_no?.toUpperCase().startsWith('TEMP'))
                        .map((item: any, i: number) => {
                          const permanentNum = item.budget_file.file_no.replace(/^TEMP\//i, 'NITT/');
                          return (
                            <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs bg-white border border-amber-200/80 p-3 rounded-lg shadow-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-mono bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200 font-bold tracking-wide">
                                  {item.budget_file.file_no}
                                </span>
                                <span className="text-slate-600 font-medium">{item.item_description}</span>
                              </div>
                              <div className="flex items-center gap-3 justify-between sm:justify-end">
                                <span className="text-[10px] text-slate-400">
                                  Will auto-roll to: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded font-bold text-slate-700">{permanentNum}</code>
                                </span>
                              </div>
                            </div>
                          );
                        })
                      }
                    </div>
                  )}

                  {/* Action form — only for Dean Budget/Finance or Admin */}
                  {['dean_approver', 'admin'].includes(user?.role?.group_key || '') ? (
                    <div className="space-y-4 pt-3 border-t border-amber-200">
                      <p className="text-xs font-semibold text-slate-700">
                        Assign a permanent budget file and resume the request:
                      </p>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1" htmlFor="selected-budget-file">
                          Allocate to Existing Budget File <span className="text-slate-400 font-normal">(Optional - Choose to link to an existing permanent budget instead of auto-generating new numbers)</span>
                        </label>
                        <select
                          id="selected-budget-file"
                          value={selectedBudgetFileId}
                          onChange={(e) => setSelectedBudgetFileId(e.target.value === '' ? '' : Number(e.target.value))}
                          className="input-field w-full text-sm bg-white border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]"
                        >
                          <option value="">-- Auto-Generate Permanent Rolling Number --</option>
                          {permanentBudgets.map((b: any) => (
                            <option key={b.id} value={b.id}>
                              {b.file_no} ({b.item_name}) - Available: {formatCurrency(b.available_balance ?? b.available_amount ?? 0)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1" htmlFor="budget-alloc-remarks">
                          Allocation Remarks <span className="text-slate-400 font-normal">(Optional)</span>
                        </label>
                        <textarea
                          id="budget-alloc-remarks"
                          rows={2}
                          placeholder="Enter any remarks for the audit trail..."
                          value={budgetAllocRemarks}
                          onChange={(e) => setBudgetAllocRemarks(e.target.value)}
                          className="input-field w-full text-sm resize-none"
                        />
                      </div>
                      <button
                        id="budget-alloc-submit-btn"
                        onClick={() => {
                          const msg = selectedBudgetFileId 
                            ? 'Assign selected permanent budget file and resume this procurement request?' 
                            : 'Automatically allocate permanent file numbers and resume this procurement request?';
                          if (window.confirm(msg)) {
                            allocateBudgetFileMutation.mutate();
                          }
                        }}
                        disabled={allocateBudgetFileMutation.isPending}
                        className="btn-primary w-full bg-amber-600 hover:bg-amber-700 border-none text-white text-sm py-2.5 flex items-center justify-center gap-2 font-semibold shadow-sm"
                      >
                        {allocateBudgetFileMutation.isPending ? (
                          <><span className="animate-spin">⏳</span> Allocating &amp; Resuming...</>
                        ) : selectedBudgetFileId ? (
                          <>✅ Assign Selected Budget &amp; Resume PR</>
                        ) : (
                          <>✅ Allocate Permanent File Numbers &amp; Resume PR</>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-sm text-amber-800 font-medium">
                      <Clock size={28} className="mx-auto mb-2 text-amber-400 opacity-70" />
                      The Dean Budget/Finance section must assign a permanent budget file number before this request can continue to the next procurement stage.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Stage Content Panel */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm text-left space-y-6">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-base font-extrabold text-[#1a3a6b] uppercase tracking-wide">
                  {activeStageObj?.label}{activeStageObj?.desc ? ` — ${activeStageObj.desc}` : ''}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedStageKey === 'aa'
                    ? 'Indent & Tech Specification approval workflow.'
                    : 'Procurement process state and compliance execution desk.'}
                </p>
              </div>

              {/* ── Collapsible Indent Document (visible in every stage except Request) ── */}
              {selectedStageKey !== 'request' && (
                <CollapsibleIndentPanel pr={pr} />
              )}

              {/* STAGE: Request — Full PR Summary */}
              {selectedStageKey === 'request' && (
                <div className="space-y-4">
                  <PRSummaryTable pr={pr} formatCurrency={formatCurrency} />
                </div>
              )}

              {/* STAGE: AA */}
              {selectedStageKey === 'aa' && (
                <div className="space-y-6">
                  {selectedStageKey === activeStageKey && (isActionable || pr.current_status === 'rejected') ? (
                    <PRActionPanel pr={pr} user={user} refetch={refetch} faculties={faculties} />
                  ) : (
                    <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl space-y-5">
                      <div className="text-center text-xs text-slate-500 font-semibold italic">
                        Indent approval stage has completed or is not actively awaiting actions.
                      </div>
                      
                      {pr.administrative_approval_id && (
                        <div className="border-t border-slate-200 pt-4 flex flex-col md:flex-row items-center justify-between gap-4">
                          <div>
                            <h4 className="text-xs font-bold text-slate-700">Administrative Approval PDF Report</h4>
                            <p className="text-[10px] text-slate-400">Download the signed administrative approval document for records.</p>
                          </div>
                          <button
                            onClick={() => {
                              const absoluteUrl = `${window.location.origin}/api/administrative-approvals/${pr.administrative_approval_id}/print`;
                              window.open(absoluteUrl, '_blank');
                            }}
                            className="flex items-center gap-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg font-bold shadow transition-all shrink-0 cursor-pointer border-none"
                          >
                            <FileText size={14} /> Download AA PDF Report
                          </button>
                        </div>
                      )}

                      {/* Display attached documents uploaded during the stage if present */}
                      {pr.administrative_approval && (
                        (pr.administrative_approval.attachment_path ||
                         pr.administrative_approval.basis_of_estimation_path ||
                         pr.administrative_approval.gem_non_availability_path ||
                         pr.administrative_approval.authority_approval_path ||
                         pr.administrative_approval.pac_dept_cert_path ||
                         pr.administrative_approval.pac_vendor_cert_path)
                      ) && (
                        <div className="border-t border-slate-200 pt-4 space-y-3">
                          <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Paperclip size={14} /> Attached Documents Uploaded During Stage
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {pr.administrative_approval.attachment_path && (
                              <div className="flex items-start justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-200 transition-all">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-700 truncate">
                                    {pr.administrative_approval.attachment_path.split('/').pop() || 'Attachment'}
                                  </p>
                                  <p className="text-[9px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wider">
                                    Administrative Approval Attachment
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <a
                                    href={pr.administrative_approval.attachment_url || undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-[#1a3a6b] border border-slate-200 hover:border-[#1a3a6b] px-2 py-1 rounded transition-colors"
                                  >
                                    <ChevronRight size={10} /> View
                                  </a>
                                  <a
                                    href={pr.administrative_approval.attachment_url || undefined}
                                    download={pr.administrative_approval.attachment_path.split('/').pop()}
                                    className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                                  >
                                    <Download size={10} /> Download
                                  </a>
                                </div>
                              </div>
                            )}
                            {pr.administrative_approval.basis_of_estimation_path && (
                              <div className="flex items-start justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-200 transition-all">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-700 truncate">
                                    {pr.administrative_approval.basis_of_estimation_path.split('/').pop() || 'Basis of Estimation'}
                                  </p>
                                  <p className="text-[9px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wider">
                                    Basis of Estimation
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <a
                                    href={pr.administrative_approval.basis_of_estimation_url || undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-[#1a3a6b] border border-slate-200 hover:border-[#1a3a6b] px-2 py-1 rounded transition-colors"
                                  >
                                    <ChevronRight size={10} /> View
                                  </a>
                                  <a
                                    href={pr.administrative_approval.basis_of_estimation_url || undefined}
                                    download={pr.administrative_approval.basis_of_estimation_path.split('/').pop()}
                                    className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                                  >
                                    <Download size={10} /> Download
                                  </a>
                                </div>
                              </div>
                            )}
                            {pr.administrative_approval.gem_non_availability_path && (
                              <div className="flex items-start justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-200 transition-all">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-700 truncate">
                                    {pr.administrative_approval.gem_non_availability_path.split('/').pop() || 'GeM ARpt'}
                                  </p>
                                  <p className="text-[9px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wider">
                                    GeM Non-Availability Report
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <a
                                    href={pr.administrative_approval.gem_non_availability_url || undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-[#1a3a6b] border border-slate-200 hover:border-[#1a3a6b] px-2 py-1 rounded transition-colors"
                                  >
                                    <ChevronRight size={10} /> View
                                  </a>
                                  <a
                                    href={pr.administrative_approval.gem_non_availability_url || undefined}
                                    download={pr.administrative_approval.gem_non_availability_path.split('/').pop()}
                                    className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                                  >
                                    <Download size={10} /> Download
                                  </a>
                                </div>
                              </div>
                            )}
                            {pr.administrative_approval.authority_approval_path && (
                              <div className="flex items-start justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-200 transition-all">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-700 truncate">
                                    {pr.administrative_approval.authority_approval_path.split('/').pop() || 'Authority Approval'}
                                  </p>
                                  <p className="text-[9px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wider">
                                    Competent Authority Approval
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <a
                                    href={pr.administrative_approval.authority_approval_url || undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-[#1a3a6b] border border-slate-200 hover:border-[#1a3a6b] px-2 py-1 rounded transition-colors"
                                  >
                                    <ChevronRight size={10} /> View
                                  </a>
                                  <a
                                    href={pr.administrative_approval.authority_approval_url || undefined}
                                    download={pr.administrative_approval.authority_approval_path.split('/').pop()}
                                    className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                                  >
                                    <Download size={10} /> Download
                                  </a>
                                </div>
                              </div>
                            )}
                            {pr.administrative_approval.pac_dept_cert_path && (
                              <div className="flex items-start justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-200 transition-all">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-700 truncate">
                                    {pr.administrative_approval.pac_dept_cert_path.split('/').pop() || 'PAC Dept Cert'}
                                  </p>
                                  <p className="text-[9px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wider">
                                    PAC Department Certificate
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <a
                                    href={pr.administrative_approval.pac_dept_cert_url || undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-[#1a3a6b] border border-slate-200 hover:border-[#1a3a6b] px-2 py-1 rounded transition-colors"
                                  >
                                    <ChevronRight size={10} /> View
                                  </a>
                                  <a
                                    href={pr.administrative_approval.pac_dept_cert_url || undefined}
                                    download={pr.administrative_approval.pac_dept_cert_path.split('/').pop()}
                                    className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                                  >
                                    <Download size={10} /> Download
                                  </a>
                                </div>
                              </div>
                            )}
                            {pr.administrative_approval.pac_vendor_cert_path && (
                              <div className="flex items-start justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-200 transition-all">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-700 truncate">
                                    {pr.administrative_approval.pac_vendor_cert_path.split('/').pop() || 'PAC Vendor Cert'}
                                  </p>
                                  <p className="text-[9px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wider">
                                    PAC Vendor Certificate
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <a
                                    href={pr.administrative_approval.pac_vendor_cert_url || undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-[#1a3a6b] border border-slate-200 hover:border-[#1a3a6b] px-2 py-1 rounded transition-colors"
                                  >
                                    <ChevronRight size={10} /> View
                                  </a>
                                  <a
                                    href={pr.administrative_approval.pac_vendor_cert_url || undefined}
                                    download={pr.administrative_approval.pac_vendor_cert_path.split('/').pop()}
                                    className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                                  >
                                    <Download size={10} /> Download
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STAGE: Tendering */}
              {selectedStageKey === 'tendering' && (
                <div className="space-y-6">
                  {pr.tender_reference_number ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-6 bg-slate-50 p-4 border border-slate-200 rounded-md text-xs">
                        <div>
                          <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Tender Ref Number</span>
                          <span className="font-bold text-[#1a3a6b] text-sm">{pr.tender_reference_number}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Tender Date</span>
                          <span className="font-semibold text-slate-800">{pr.date_of_tender ? new Date(pr.date_of_tender).toLocaleDateString() : '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Tech Bid Opening</span>
                          <span className="font-semibold text-slate-800">{pr.date_of_tech_bid_opening ? new Date(pr.date_of_tech_bid_opening).toLocaleDateString() : '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Financial Bid Opening</span>
                          <span className="font-semibold text-slate-800">{pr.date_of_financial_bid_opening ? new Date(pr.date_of_financial_bid_opening).toLocaleDateString() : '-'}</span>
                        </div>
                        {pr.vendor_list_link && (
                          <div className="col-span-2">
                            <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Vendor List Link</span>
                            <a href={pr.vendor_list_link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-semibold">{pr.vendor_list_link}</a>
                          </div>
                        )}
                      </div>

                      {pr.lpc_remarks && (
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded text-xs">
                          <span className="font-bold text-amber-800 block uppercase tracking-wider text-[9px] mb-1">Local Purchase Committee (GFR 155) Details</span>
                          <p><span className="font-semibold text-slate-600">Committee Members:</span> {pr.lpc_committee_members}</p>
                          <p><span className="font-semibold text-slate-600">Minutes Reference:</span> {pr.lpc_minutes_reference}</p>
                          <p className="mt-1 italic">"{pr.lpc_remarks}"</p>
                        </div>
                      )}

                      {pr.commercial_evaluations && pr.commercial_evaluations.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Invited/Participating Vendors</h4>
                          <div className="border border-slate-200 rounded-md overflow-hidden text-xs">
                            <table className="w-full">
                              <thead className="bg-slate-50 border-b border-slate-200 font-bold">
                                <tr>
                                  <th className="px-3 py-2 text-left">Vendor Name</th>
                                  <th className="px-3 py-2 text-left">Email</th>
                                  <th className="px-3 py-2 text-left">Eligibility Remarks</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pr.commercial_evaluations.map(ve => (
                                  <tr key={ve.id} className="border-b border-slate-100">
                                    <td className="px-3 py-2 font-semibold text-slate-800">{ve.vendor_name}</td>
                                    <td className="px-3 py-2 text-slate-500">{ve.vendor_email || '-'}</td>
                                    <td className="px-3 py-2 text-slate-600">{ve.remarks || 'Standard'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-md text-center text-xs text-slate-500 italic">
                      Tender has not been registered yet.
                    </div>
                  )}

                  {selectedStageKey === activeStageKey && (isActionable || pr.current_status === 'rejected' || (pr.flow?.phase_name === 'Tendering' && user?.id === pr.initiator_id)) ? (
                    <PRActionPanel pr={pr} user={user} refetch={refetch} faculties={faculties} />
                  ) : null}
                </div>
              )}

              {/* STAGE: Tech Eval */}
              {selectedStageKey === 'tech_eval' && (
                <div className="space-y-6">
                  {pr.technical_evaluations && pr.technical_evaluations.length > 0 ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Bidders Technical Evaluation</h4>
                          <div className="border border-slate-200 rounded-md overflow-hidden text-xs">
                            <table className="w-full">
                              <thead className="bg-slate-50 border-b border-slate-200 font-bold">
                                <tr>
                                  <th className="px-3 py-2 text-left">Bidder</th>
                                  <th className="px-3 py-2 text-left">Status</th>
                                  <th className="px-3 py-2 text-left">Remarks</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pr.technical_evaluations.map(te => (
                                  <tr key={te.id} className="border-b border-slate-100">
                                    <td className="px-3 py-2 font-semibold text-slate-800">{te.vendor_name}</td>
                                    <td className="px-3 py-2">
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                        te.is_qualified ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                      }`}>
                                        {te.is_qualified ? 'Qualified' : 'Disqualified'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-500 italic">{te.remarks || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Expert Committee Progress</h4>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {[
                              { name: pr.initiator?.name, sig: initiatorSig, role: 'Purchase Initiator', id: pr.initiator_id },
                              { name: pr.faculty1?.name, sig: faculty1Sig, role: 'HOD Nominated Expert 1', id: pr.faculty1_id },
                              { name: pr.faculty2?.name, sig: faculty2Sig, role: 'HOD Nominated Expert 2', id: pr.faculty2_id },
                              // Director Nominee is optional — only show the card when actually assigned
                              ...(pr.faculty3_id ? [{ name: pr.faculty3?.name, sig: faculty3Sig, role: 'Director Nominee (Optional)', id: pr.faculty3_id }] : []),
                            ].map((member, i) => {
                              const memberDoc = pr.documents?.find((d: any) => d.doc_key === `tech_eval_doc_${member.id}`);
                              return (
                                <div key={i} className="p-2.5 bg-slate-50 border border-slate-200 rounded-md flex flex-col justify-between">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <p className="font-bold text-slate-800">{member.name || 'Nominee'}</p>
                                      <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">{member.role}</p>
                                    </div>
                                    {member.sig ? (
                                      <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" title="Signed" />
                                    ) : (
                                      <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" title="Awaiting" />
                                    )}
                                  </div>
                                  {memberDoc && (
                                    <div className="mt-2 pt-2 border-t border-slate-200/50">
                                      <a href={memberDoc.path} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold text-[11px] flex items-center gap-1">
                                        <FileText size={12} /> View Evaluation Report
                                      </a>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {pr.financial_evaluations?.some(f => f.is_awarded) && (
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded text-xs text-emerald-800">
                          <span className="font-bold uppercase tracking-wider text-[9px] block mb-1">Recommended Vendor Award</span>
                          Recommended Bidder: <strong>{pr.financial_evaluations?.find(f => f.is_awarded)?.vendor_name}</strong>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-md text-center text-xs text-slate-500 italic">
                      Technical evaluations have not been recorded yet.
                    </div>
                  )}

                  {selectedStageKey === activeStageKey && isActionable ? (
                    <PRActionPanel pr={pr} user={user} refetch={refetch} faculties={faculties} />
                  ) : null}
                </div>
              )}

              {/* STAGE: FS */}
              {selectedStageKey === 'fin_sanction' && (
                <div className="space-y-6">
                  {pr.financial_evaluations && pr.financial_evaluations.length > 0 ? (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Price Comparative &amp; Bid Scrutiny</h4>
                        <div className="border border-slate-200 rounded-md overflow-hidden text-xs">
                          <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-200 font-bold">
                              <tr>
                                <th className="px-3 py-2 text-left">Rank</th>
                                <th className="px-3 py-2 text-left">Vendor Name</th>
                                <th className="px-3 py-2 text-left">Quoted Rate</th>
                                <th className="px-3 py-2 text-left">Taxes</th>
                                <th className="px-3 py-2 text-left">Delivery</th>
                                <th className="px-3 py-2 text-left">Warranty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pr.financial_evaluations.map(fe => (
                                <tr key={fe.id} className="border-b border-slate-100">
                                  <td className="px-3 py-2 font-bold text-[#1a3a6b]">{fe.ranking}</td>
                                  <td className="px-3 py-2 font-semibold text-slate-800">{fe.vendor_name}</td>
                                  <td className="px-3 py-2 font-bold text-emerald-800">{formatCurrency(fe.quoted_amount)}</td>
                                  <td className="px-3 py-2 text-slate-500">₹{fe.taxes || 0}</td>
                                  <td className="px-3 py-2 text-slate-500">{fe.delivery_period ? `${fe.delivery_period} Weeks` : '-'}</td>
                                  <td className="px-3 py-2 text-slate-500">{fe.warranty ? `${fe.warranty} Mos` : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {pr.single_bid_justification && (
                        <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 rounded text-xs space-y-1">
                          <span className="font-bold uppercase tracking-wider text-[9px] block">Single Bid Justification Reference</span>
                          <p className="italic">"{pr.single_bid_justification}"</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-md text-center text-xs text-slate-500 italic">
                      Financial quotes have not been registered yet.
                    </div>
                  )}

                  {selectedStageKey === activeStageKey && isActionable ? (
                    <PRActionPanel pr={pr} user={user} refetch={refetch} faculties={faculties} />
                  ) : null}
                </div>
              )}

              {/* STAGE: Purchase Order */}
              {selectedStageKey === 'po' && (
                <div className="space-y-6">
                  {pr.purchase_order ? (
                    <div className="p-5 border border-green-200 bg-green-50/50 rounded-lg space-y-3 text-left">
                      <div className="flex items-center justify-between border-b border-green-200/50 pb-2">
                        <div>
                          <span className="text-[10px] font-bold text-green-800 uppercase tracking-wide block">PO Issuance Certified</span>
                          <span className="text-sm font-black text-[#1a3a6b] font-mono">{pr.purchase_order.po_number}</span>
                        </div>
                        <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded font-mono uppercase">Issued</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Vendor</span>
                          <span className="font-semibold text-slate-800">{pr.purchase_order.vendor_name}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">PO Amount</span>
                          <span className="font-bold text-emerald-800">{formatCurrency(pr.purchase_order.po_amount)}</span>
                        </div>
                        {pr.purchase_order.delivery_due_date && (
                          <div>
                            <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Delivery Due Date</span>
                            <span className="font-semibold text-slate-800">{new Date(pr.purchase_order.delivery_due_date).toLocaleDateString()}</span>
                          </div>
                        )}
                        {pr.purchase_order.remarks && (
                          <div className="col-span-2">
                            <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Remarks</span>
                            <span className="text-slate-600 italic">"{pr.purchase_order.remarks}"</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : pr.current_status === 'po_issued' || pr.current_status === 'completed' ? (
                    <div className="p-5 border border-green-200 bg-green-50/50 rounded-lg flex items-center justify-between">
                      <div className="text-xs space-y-1 text-left">
                        <span className="text-[10px] font-bold text-green-800 uppercase tracking-wide block">PO Issuance Certified</span>
                        <p className="font-semibold text-slate-700">Purchase Order has been generated and dispatched to the L1 vendor.</p>
                        <p className="text-slate-500">Logistics &amp; delivery tracking is now open.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-md text-center text-xs text-slate-500 italic">
                      Purchase Order is not yet issued.
                    </div>
                  )}

                  {selectedStageKey === activeStageKey && isActionable ? (
                    <PRActionPanel pr={pr} user={user} refetch={refetch} faculties={faculties} />
                  ) : null}
                </div>
              )}

              {/* STAGE: Delivery */}
              {selectedStageKey === 'delivery' && (
                <div className="space-y-6">
                  {pr.deliveries && pr.deliveries.length > 0 ? (
                    <div className="space-y-4">
                      {pr.deliveries.map(d => (
                        <div key={d.id} className="border border-slate-200 rounded-lg overflow-hidden text-xs bg-slate-50/50 shadow-xs">
                          <div className="bg-slate-100 border-b border-slate-200 px-4 py-2.5 flex justify-between items-center">
                            <span className="font-bold text-[#1a3a6b]">Challan: {d.challan_number || '-'} | Invoice: {d.invoice_number || '-'}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                              d.status === 'verified' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              Status: {d.status}
                            </span>
                          </div>
                          <div className="p-4 space-y-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px] text-slate-600">
                              <p><span className="font-semibold">Received Date:</span> {d.received_date ? new Date(d.received_date).toLocaleDateString() : '-'}</p>
                              <p><span className="font-semibold">Logged At:</span> {new Date(d.created_at).toLocaleDateString()}</p>
                            </div>
                            <div className="border-t border-slate-200/50 pt-2.5">
                              <span className="font-bold text-slate-700 block text-[9px] uppercase mb-1">Delivered Items</span>
                              {d.items?.map((di: any) => (
                                <div key={di.id} className="flex justify-between py-1 border-b border-slate-100 last:border-0 font-medium">
                                  <span>{di.name}</span>
                                  <span>Qty: {di.challan_quantity} · Rate: {formatCurrency(di.unit_price)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}

                      {pr.bill_passing && (
                        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-lg text-xs space-y-2 text-emerald-800">
                          <span className="font-bold uppercase tracking-wider text-[9px] block">Bill Passing Certificate Minutes</span>
                          <div className="grid grid-cols-2 gap-4 text-emerald-900 font-medium">
                            <p><span className="font-semibold text-emerald-700">Invoice Reference:</span> {pr.bill_passing.invoice_number}</p>
                            <p><span className="font-semibold text-emerald-700">Bill Amount Passed:</span> {formatCurrency(pr.bill_passing.bill_amount)}</p>
                            <p><span className="font-semibold text-emerald-700">GST Amount:</span> {formatCurrency(pr.bill_passing.gst_amount || 0)}</p>
                            <p className="col-span-2"><span className="font-semibold text-emerald-700">Remarks:</span> "{pr.bill_passing.remarks || '-'}"</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-md text-center text-xs text-slate-500 italic">
                      No deliveries have been registered yet.
                    </div>
                  )}

                  {(selectedStageKey === activeStageKey && isActionable) || (selectedStageKey === 'delivery' && (pr.current_status === 'po_issued' || pr.current_status === 'completed')) ? (
                    <PRActionPanel pr={pr} user={user} refetch={refetch} faculties={faculties} />
                  ) : null}
                </div>
              )}

              {/* STAGE: Assets */}
              {selectedStageKey === 'assets' && (
                <div className="space-y-6">
                  {prAssets && prAssets.length > 0 ? (
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Registered Institutional Assets</h4>
                      <div className="border border-slate-200 rounded-md overflow-hidden text-xs">
                        <table className="w-full">
                          <thead className="bg-slate-50 border-b border-slate-200 font-bold">
                            <tr>
                              <th className="px-3 py-2 text-left">Asset Tag</th>
                              <th className="px-3 py-2 text-left">Name</th>
                              <th className="px-3 py-2 text-left">Location</th>
                              <th className="px-3 py-2 text-left">Custodian</th>
                              <th className="px-3 py-2 text-left">Condition</th>
                              <th className="px-3 py-2 text-left">Serial No</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prAssets.map((asset: any) => (
                              <tr key={asset.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="px-3 py-2 font-mono font-bold text-[#1a3a6b]">{asset.asset_tag}</td>
                                <td className="px-3 py-2 font-semibold text-slate-800">{asset.name}</td>
                                <td className="px-3 py-2 text-slate-500">{[asset.building, asset.room].filter(Boolean).join(', ') || '-'}</td>
                                <td className="px-3 py-2 text-slate-600 font-medium">{asset.custodian || '-'}</td>
                                <td className="px-3 py-2">
                                  <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-green-100 text-green-800">
                                    {asset.condition}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-slate-500">{asset.serial_number || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-slate-50 border border-slate-200 rounded-md text-center text-xs text-slate-500 italic space-y-2">
                      <p>No asset tags registered for this purchase yet.</p>
                      <p className="text-[10px] text-slate-400 font-normal">Assets will be auto-generated in the background once stores verification approves the logged department delivery quantities.</p>
                    </div>
                  )}

                  {selectedStageKey === activeStageKey && isActionable ? (
                    <PRActionPanel pr={pr} user={user} refetch={refetch} faculties={faculties} />
                  ) : null}
                </div>
              )}

            </div>



          </div>

          {/* Right column: Status details / history */}
          <div className="lg:col-span-4 space-y-6">

            {/* Active bottleneck referral warning */}
            {activeReferral && (
              <div className="p-3 bg-amber-50 border-l-4 border-l-amber-500 border border-amber-200 rounded-r-md text-amber-800 space-y-1.5 shadow-xs text-left">
                <span className="font-bold flex items-center gap-1 uppercase tracking-wider text-[9px]">Active Bottleneck Referral</span>
                <p className="font-normal text-amber-900 leading-normal text-xs">
                  The workflow is frozen awaiting a referral query response from <strong>{activeReferral.referred_to?.name}</strong>.
                </p>
                <div className="text-[10px] font-mono bg-white p-2 border border-amber-200 rounded">
                  <span className="font-bold text-slate-400">Query: </span>"{activeReferral.query}"
                </div>
              </div>
            )}

            {/* Quick Admin user role editor */}
            {isAdmin && (
              <div className="card h-fit border border-blue-200 bg-blue-50/20 text-left">
                <div className="px-5 py-4 border-b border-blue-100 bg-blue-50/50 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#1a3a6b] uppercase tracking-wide flex items-center gap-1.5">
                    Quick User Roles Admin
                  </h3>
                  <button 
                    onClick={() => setIsAdminPanelOpen(!isAdminPanelOpen)} 
                    className="text-[#1a3a6b] hover:underline text-xs font-semibold"
                  >
                    {isAdminPanelOpen ? 'Hide' : 'Show'}
                  </button>
                </div>
                
                {isAdminPanelOpen && (
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Search User</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="Search name/email..." 
                          value={adminUserSearch}
                          onChange={(e) => setAdminUserSearch(e.target.value)}
                          className="input-field pl-8 text-xs py-1 px-2 h-8 w-full bg-white"
                        />
                        <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Filter Role</label>
                        <select 
                          value={adminFilterRole} 
                          onChange={(e) => setAdminFilterRole(e.target.value)}
                          className="input-field text-xs py-1.5 px-1 h-8 bg-white"
                        >
                          <option value="">All Roles</option>
                          {adminRoles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Filter Dept</label>
                        <select 
                          value={adminFilterDept} 
                          onChange={(e) => setAdminFilterDept(e.target.value)}
                          className="input-field text-xs py-1.5 px-1 h-8 bg-white"
                        >
                          <option value="">All Depts</option>
                          {adminDepts.map((d: any) => <option key={d.id} value={d.id}>{d.short_code}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                      {adminUsers
                        .filter((u: any) => {
                          if (adminUserSearch && !u.name.toLowerCase().includes(adminUserSearch.toLowerCase()) && !u.email.toLowerCase().includes(adminUserSearch.toLowerCase())) return false;
                          if (adminFilterRole && u.role_id !== Number(adminFilterRole)) return false;
                          if (adminFilterDept && u.department_id !== Number(adminFilterDept)) return false;
                          return true;
                        })
                        .map((u: any) => (
                          <div key={u.id} className="bg-white border border-slate-100 p-2.5 rounded shadow-sm flex flex-col gap-1.5 text-xs hover:border-slate-300 transition-colors">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-bold text-slate-800 leading-snug">{u.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono leading-none mt-0.5">{u.email}</div>
                              </div>
                              {u.department_id && (
                                <span className="bg-slate-100 text-slate-600 px-1 py-0.5 rounded text-[9px] font-bold">
                                  {adminDepts.find((d: any) => d.id === u.department_id)?.short_code}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 pt-1 border-t border-slate-55">
                              <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0">Role:</span>
                              <select
                                value={u.role_id || ''}
                                onChange={(e) => {
                                  const newRoleId = Number(e.target.value);
                                  updateUserRoleMutation.mutate({ id: u.id, data: { role_id: newRoleId } });
                                }}
                                className="bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-[11px] font-semibold text-slate-700 focus:outline-none focus:border-[#1a3a6b] w-full cursor-pointer"
                              >
                                <option value="">No Role</option>
                                {adminRoles.map((r: any) => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quick Force Advance Admin override panel */}
            {isAdmin && pr && pr.flow && (
              <div className="card h-fit border border-amber-200 bg-amber-50/20 mt-4 text-left">
                <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/50 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                    Admin Workflow Override
                  </h3>
                  <button 
                    onClick={() => setIsForceAdvanceOpen(!isForceAdvanceOpen)} 
                    className="text-amber-800 hover:underline text-xs font-semibold"
                  >
                    {isForceAdvanceOpen ? 'Hide' : 'Show'}
                  </button>
                </div>
                
                {isForceAdvanceOpen && (
                  <div className="p-5 space-y-4">
                    <p className="text-xs text-amber-700 font-medium">
                      Bypasses standard approvals/rules (e.g. signature verification) and advances the request to the next step or phase.
                    </p>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Mandatory Remarks / Audit Log <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        value={forceAdvanceRemarks}
                        onChange={(e) => setForceAdvanceRemarks(e.target.value)}
                        placeholder="State reason for administrative override..."
                        className="input-field text-xs py-2 px-3 w-full h-20 resize-none bg-white"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (!forceAdvanceRemarks.trim()) {
                          toast.error('Mandatory remarks are required.');
                          return;
                        }
                        if (window.confirm('Are you sure you want to force advance this purchase request? This action is audited.')) {
                          forceAdvanceMutation.mutate(forceAdvanceRemarks);
                        }
                      }}
                      disabled={forceAdvanceMutation.isPending}
                      className="btn-primary w-full bg-amber-600 hover:bg-amber-700 text-xs py-2 text-white border-none"
                    >
                      {forceAdvanceMutation.isPending ? 'Advancing...' : 'Force Advance PR'}
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};

export default PRDetailPage;
