import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ChevronDown, ChevronUp, ShieldAlert, Search, Layers, FileText, AlertTriangle
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { prApi, budgetApi, adminApi, assetsApi } from '../services/api';
import { PurchaseRequest } from '../types';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

// Modular Detail Components
import { PRHeader } from '../components/pr/detail/PRHeader';
import { PRItemsTable } from '../components/pr/detail/PRItemsTable';
import { PRTimeline } from '../components/pr/detail/PRTimeline';
import { PRDocuments } from '../components/pr/detail/PRDocuments';
import { PRCommitteePanel } from '../components/pr/detail/PRCommitteePanel';
import { PRActionPanel } from '../components/pr/PRActionPanel';

const STAGES = [
  { key: 'request', label: 'Request', desc: 'Initial Indent' },
  { key: 'aa', label: 'AA', desc: 'Admin Approval' },
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

  const [showHistory, setShowHistory] = useState(true);
  const [activeTab, setActiveTab] = useState<'stages' | 'compliance'>('stages');
  const [selectedStageKey, setSelectedStageKey] = useState<string>('request');
  const [selectedDocKey, setSelectedDocKey] = useState<string>('indent');

  // Admin control states
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [adminFilterRole, setAdminFilterRole] = useState('');
  const [adminFilterDept, setAdminFilterDept] = useState('');
  const [forceAdvanceRemarks, setForceAdvanceRemarks] = useState('');
  const [isForceAdvanceOpen, setIsForceAdvanceOpen] = useState(false);

  // Admin queries
  const { data: adminRoles = [] } = useQuery({
    queryKey: ['admin_roles'],
    queryFn: () => adminApi.roles().then(res => res.data),
    enabled: isAdmin
  });
  const { data: adminUsers = [] } = useQuery({
    queryKey: ['admin_users_list'],
    queryFn: () => adminApi.users().then(res => res.data),
    enabled: isAdmin
  });
  const { data: adminDepts = [] } = useQuery({
    queryKey: ['admin_depts'],
    queryFn: () => adminApi.departments().then(res => res.data),
    enabled: isAdmin
  });

  // Load assets and filter for this PR
  const { data: allAssetsData } = useQuery({
    queryKey: ['assets', 'detail_list'],
    queryFn: () => assetsApi.list({ limit: 200 }).then(r => r.data),
  });
  const allAssets = allAssetsData?.items || [];

  // Admin mutations
  const updateWfMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => adminApi.updateWorkflow(id, data),
    onSuccess: () => {
      toast.success('Workflow step updated successfully');
      queryClient.invalidateQueries({ queryKey: ['pr', id] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update workflow step')
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => adminApi.updateUser(id, data),
    onSuccess: () => {
      toast.success('User role updated successfully');
      queryClient.invalidateQueries({ queryKey: ['pr', id] });
      queryClient.invalidateQueries({ queryKey: ['admin_users_list'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update user role')
  });
  const forceAdvanceMutation = useMutation({
    mutationFn: (remarks: string) => adminApi.forceAdvancePr(Number(id), remarks),
    onSuccess: () => {
      toast.success('Purchase request force-advanced successfully');
      setForceAdvanceRemarks('');
      setIsForceAdvanceOpen(false);
      queryClient.invalidateQueries({ queryKey: ['pr', id] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to force-advance purchase request');
    }
  });
  const { data: pr, refetch, isError, error } = useQuery<PurchaseRequest>({
    queryKey: ['pr', id],
    queryFn: () => prApi.get(Number(id)).then(r => r.data),
    retry: (failureCount, err: any) => {
      // Never retry on auth/authz errors — they will not resolve on their own
      const status = err?.response?.status;
      if (status === 403 || status === 401 || status === 404) return false;
      return failureCount < 2;
    },
  });

  const { data: faculties = [] } = useQuery<any[]>({
    queryKey: ['departmentFaculty'],
    queryFn: () => budgetApi.departmentFaculty().then(r => r.data),
    enabled: !!pr && user?.role?.group_key === 'hod' && (pr.flow?.expected_group === 'hod' || pr.flow?.expected_role_name?.toLowerCase().includes('hod') || pr.flow?.phase_name === 'Administrative Approval'),
  });

  const getActiveStageIndex = (pr: PurchaseRequest): number => {
    if (!pr.flow) {
      if (pr.current_status === 'completed') return 7; // Assets
      if (pr.current_status === 'po_issued') return 6; // Delivery
      return 0; // Request
    }
    const phase = pr.flow.phase_name;
    if (phase === 'Administrative Approval') return 1;
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
    const phaseName = pr.flow?.phase_name;
    if (phaseName === 'Technical Evaluation' && pr.flow.step_order === 1) {
      const committeeIds = [pr.initiator_id, pr.faculty1_id, pr.faculty2_id, pr.faculty3_id].filter(Boolean);
      canActOn = committeeIds.includes(user?.id);
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

  const isActionable = (canActOn || !!activeReferralForUser || !!anyPendingReferral) && !['po_issued', 'rejected', 'cancelled', 'completed'].includes(pr.current_status);

  const formatCurrency = (n?: number) => {
    if (n === undefined || n === null || isNaN(n)) return '₹0.00L';
    return `₹${(n / 100000).toFixed(2)}L`;
  };

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

  const completedApprovers = pr.history?.filter((h: any) => 
    !['Forwarded', 'Forwarded to next phase', 'Initiated', 'pr_submitted', 'Tender Details Registered', 'Technical Evaluation Completed', 'Technical Evaluation Approved', 'Financial Bids Submitted', 'Bid Selected', 'PO Cancelled', 'Tender Cancelled', 'Bill Passed (PR Completed)'].includes(h.status)
  ) || [];

  const activeStageObj = STAGES.find(s => s.key === selectedStageKey);

  // Signatures resolved from history snapshot logs
  const findSignature = (roleVal?: string, statusKeyword?: string, userId?: number): any | null => {
    if (!pr.history) return null;
    const sorted = [...pr.history].sort((a, b) => new Date(b.acted_at || 0).getTime() - new Date(a.acted_at || 0).getTime());
    for (const h of sorted) {
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
  const hodSig = findSignature('hod') || findSignature('head of department') || (pr.hod_id ? findSignature(undefined, undefined, pr.hod_id) : null);
  const deanSig = findSignature('dean_pd') || findSignature('dean');
  const directorSig = findSignature('director');

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

      {/* Header */}
      <PRHeader
        pr={pr}
        user={user}
        isAdmin={isAdmin}
        adminRoles={adminRoles}
        adminUsers={adminUsers}
        adminDepts={adminDepts}
        updateWfMutation={updateWfMutation}
        formatCurrency={formatCurrency}
      />

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-200 bg-white p-2 rounded-lg shadow-sm">
        <button
          onClick={() => setActiveTab('stages')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-bold transition-all border ${
            activeTab === 'stages'
              ? 'bg-[#1a3a6b] text-white border-transparent shadow-sm'
              : 'text-slate-600 hover:text-slate-800 border-transparent hover:bg-slate-50'
          }`}
        >
          <Layers size={16} /> Workflow Stage Workspace
        </button>
        <button
          onClick={() => setActiveTab('compliance')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-bold transition-all border ${
            activeTab === 'compliance'
              ? 'bg-[#1a3a6b] text-white border-transparent shadow-sm'
              : 'text-slate-600 hover:text-slate-800 border-transparent hover:bg-slate-50'
          }`}
        >
          <FileText size={16} /> Compliance GFR Documents
        </button>
      </div>

      {activeTab === 'stages' ? (
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

            {/* Stage Content Panel */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm text-left space-y-6">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-base font-extrabold text-[#1a3a6b] uppercase tracking-wide">
                  Stage: {activeStageObj?.label} - {activeStageObj?.desc}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Procurement process state and compliance execution desk.
                </p>
              </div>

              {/* STAGE: Request */}
              {selectedStageKey === 'request' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 bg-slate-50 p-4 border border-slate-200 rounded-md text-xs">
                    <div>
                      <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Initiator</span>
                      <span className="font-semibold text-slate-800">{pr.initiator?.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Department</span>
                      <span className="font-semibold text-slate-800">{pr.initiator?.department?.name || 'CSE'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Category</span>
                      <span className="font-semibold text-slate-800">{pr.category?.title}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Procurement Method</span>
                      <span className="font-semibold text-slate-800">{pr.procurement?.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Purchase Type</span>
                      <span className="font-semibold text-slate-800 capitalize">{pr.purchase_type}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Total Amount</span>
                      <span className="font-bold text-[#1a3a6b]">{formatCurrency(pr.amount)}</span>
                    </div>
                    {pr.delivery_location && (
                      <div className="col-span-2 sm:col-span-3">
                        <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Delivery Location</span>
                        <span className="font-semibold text-slate-800">{pr.delivery_location} ({pr.delivery_mode})</span>
                      </div>
                    )}
                  </div>
                  <PRItemsTable pr={pr} formatCurrency={formatCurrency} />
                </div>
              )}

              {/* STAGE: AA */}
              {selectedStageKey === 'aa' && (
                <div className="space-y-6">
                  <PRCommitteePanel
                    pr={pr}
                    initiatorSig={initiatorSig}
                    hodSig={hodSig}
                    deanSig={deanSig}
                    directorSig={directorSig}
                    faculty1Sig={faculty1Sig}
                    faculty2Sig={faculty2Sig}
                    faculty3Sig={faculty3Sig}
                  />
                  {selectedStageKey === activeStageKey && isActionable ? (
                    <PRActionPanel pr={pr} user={user} refetch={refetch} faculties={faculties} />
                  ) : (
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded text-center text-xs text-slate-500 font-semibold italic">
                      Administrative approval stage has completed or is not actively awaiting actions.
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

                  {selectedStageKey === activeStageKey && isActionable ? (
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
                              { name: pr.initiator?.name, sig: initiatorSig, role: 'Purchase Initiator' },
                              { name: pr.faculty1?.name, sig: faculty1Sig, role: 'HOD Nominated Expert 1' },
                              { name: pr.faculty2?.name, sig: faculty2Sig, role: 'HOD Nominated Expert 2' },
                              { name: pr.faculty3?.name, sig: faculty3Sig, role: 'Director Nominee' },
                            ].map((member, i) => (
                              <div key={i} className="p-2.5 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between">
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
                            ))}
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
                  {pr.current_status === 'po_issued' || pr.current_status === 'completed' ? (
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

                  {selectedStageKey === activeStageKey && isActionable ? (
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
            
            {/* Case status details */}
            <div className="card text-left">
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Procurement Case Summary</h3>
              </div>
              <div className="p-5 space-y-4 text-xs font-semibold text-slate-600">
                
                {/* Active bottleneck referral warning */}
                {activeReferral && (
                  <div className="p-3 bg-amber-50 border-l-4 border-l-amber-500 border border-amber-200 rounded-r-md text-amber-800 space-y-1.5 shadow-xs text-left">
                    <span className="font-bold flex items-center gap-1 uppercase tracking-wider text-[9px]">
                      Active Bottleneck Referral
                    </span>
                    <p className="font-normal text-amber-900 leading-normal">
                      The workflow is currently frozen awaiting an opinion referral query response from <strong className="text-slate-800">{activeReferral.referred_to?.name}</strong>.
                    </p>
                    <div className="text-[10px] font-mono bg-white p-2 border border-amber-200 rounded">
                      <span className="font-bold text-slate-400">Query: </span>"{activeReferral.query}"
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Current active phase</span>
                  <p className="font-extrabold text-[#1a3a6b] text-sm">
                    {pr.flow ? `${pr.flow.phase_name} (Step ${pr.flow.step_order})` : pr.current_status.toUpperCase()}
                  </p>
                </div>

                {pr.flow && (
                  <div className="space-y-1 pt-1.5 border-t border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Pending Approver</span>
                    <p className="font-bold text-slate-800 text-xs">
                      {pr.flow.expected_user_name 
                        ? `${pr.flow.expected_user_name} (User)`
                        : pr.flow.expected_role_name || pr.flow.expected_group || 'N/A'}
                    </p>
                  </div>
                )}

                {completedApprovers.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Completed Approvers</span>
                    <div className="space-y-1 mt-1">
                      {completedApprovers.map(h => (
                        <div key={h.id} className="flex justify-between items-center text-[10px] text-slate-600 bg-slate-50 border border-slate-100 px-2 py-1 rounded">
                          <span className="font-bold">{h.frozen_actor_name || 'Approver'}</span>
                          <span className="font-mono text-[9px] text-slate-400">{h.frozen_designation || 'Signed'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Workflow Timeline history */}
            <div className="card h-fit">
              <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Workflow History Log</h3>
                <button onClick={() => setShowHistory(!showHistory)} className="text-slate-500 hover:text-[#1a3a6b]">
                  {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
              {showHistory && (
                <div className="p-5 max-h-[350px] overflow-y-auto pr-2">
                  <PRTimeline history={pr.history} currentStatus={pr.current_status} />
                </div>
              )}
            </div>

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
      ) : (
        /* Compliance GFR Documents directory tab view */
        <PRDocuments
          pr={pr}
          formatCurrency={formatCurrency}
          selectedDocKey={selectedDocKey}
          setSelectedDocKey={setSelectedDocKey}
        />
      )}

      {/* Procurement Mode Form Details */}
      {pr.form_data && Object.keys(pr.form_data).length > 0 && (
        <div className="card p-6 bg-white border border-slate-200 shadow-sm space-y-4 text-left">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2 flex items-center gap-2">
            <span className="w-1.5 h-3 bg-[#1a3a6b] rounded-xs"></span>
            Procurement Method Form Data ({pr.procurement?.name || 'Details'})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
            {Object.entries(pr.form_data).map(([key, val]) => {
              if (val === undefined || val === null || val === '') return null;
              
              const labels: Record<string, string> = {
                gem_link: 'GeM Bid / RA Link',
                gem_nac_attached: 'GeM Non-Availability Certificate (NAC) Attached?',
                tender_id: 'CPPP Tender ID',
                publication_date: 'Publication Date (CPPP)',
                invited_vendors: 'Invited Vendors',
                manufacturer_name: 'OEM Manufacturer Name',
                manufacturer_address: 'OEM Address',
                justification_type: 'PAC Justification Basis',
                finance_concurrence_ref: 'Finance Concurrence Reference',
              };

              const label = labels[key] || key.replace(/_/g, ' ').toUpperCase();
              
              let displayVal = String(val);
              if (typeof val === 'boolean') {
                displayVal = val ? 'Yes' : 'No';
              } else if (key === 'justification_type') {
                const map: Record<string, string> = {
                  sole_manufacturer: 'Sole Manufacturer',
                  no_alternative: 'No Alternative Product Acceptable',
                  similar_unavailable: 'Similar Product Unavailable',
                };
                displayVal = map[val] || val;
              }

              return (
                <div key={key} className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    {label}
                  </span>
                  {key === 'gem_link' ? (
                    <a
                      href={displayVal.startsWith('http') ? displayVal : `https://${displayVal}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-blue-600 hover:underline break-all"
                    >
                      {displayVal}
                    </a>
                  ) : (
                    <span className="text-sm font-semibold text-slate-800 break-words">
                      {displayVal}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PRDetailPage;
