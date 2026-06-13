import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  FileText, CheckCircle, Clock, XCircle, TrendingUp, Package, 
  AlertTriangle, Wallet, Layers, Plus, ChevronRight, User, ShieldAlert 
} from 'lucide-react';
import { prApi, budgetApi, aaApi, inventoryApi, assetsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PR_STATUS_LABELS, PRStatus, PurchaseRequest } from '../types';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../utils/format';
import { queryKeys } from '../config/queryKeys';

interface PendingActionItem {
  id: number;
  number: string;
  title: string;
  type: 'AA' | 'PR';
  badgeText: string;
  badgeColor: string;
  amount: number;
  link: string;
  actionRequired: string;
}

export const DashboardPage: React.FC = () => {
  const { user, isRole } = useAuth();
  
  // State for stage-wise work queue filtering
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  // Queries
  const { data: prsData } = useQuery({
    queryKey: queryKeys.prs.dashboard(),
    queryFn: () => prApi.list({ limit: 200 }).then(r => r.data),
  });
  const prs = prsData?.items || [];

  const { data: aasData } = useQuery({
    queryKey: ['dashboard-aas'],
    queryFn: () => aaApi.list().then(r => r.data),
  });
  const aas = aasData || [];

  const { data: deliveriesData = [] } = useQuery({
    queryKey: queryKeys.inventory.deliveries,
    queryFn: () => inventoryApi.listDeliveries().then(r => r.data),
  });

  const { data: assetsData } = useQuery({
    queryKey: ['assets-dashboard'],
    queryFn: () => assetsApi.list({ limit: 1000 }).then(r => r.data),
  });
  const assets = assetsData?.items || [];

  const { data: budget } = useQuery({
    queryKey: queryKeys.budgets.overview(),
    queryFn: () => budgetApi.overview().then(r => r.data),
    enabled: isRole('faculty', 'hod', 'admin', 'dean_approver', 'apex_approver', 'verifier_general'),
  });

  const { data: discrepancies = [] } = useQuery({
    queryKey: queryKeys.inventory.discrepancies,
    queryFn: () => inventoryApi.listDiscrepancies().then(r => r.data),
    enabled: isRole('admin', 'verifier_sp', 'apex_approver'),
  });

  const safeBudget = {
    total: budget?.total || 0,
    available: budget?.available || 0,
    deducted: budget?.deducted || 0,
    locked: budget?.locked || 0
  };

  const showBudgetOverview = !!budget && isRole('faculty', 'hod', 'admin', 'dean_approver', 'apex_approver', 'verifier_general');

  // Bypass client-side filtering: Backend already scopes lists correctly
  const scopedAAs = aas;
  const scopedPRs = prs;

  // Categorize a request into one of the 9 stages of the procurement lifecycle
  const getRequestStage = (item: any): string | null => {
    if ('current_status' in item) {
      // It's a PR
      const status = item.current_status;
      if (status === 'budget_file_allocation') {
        return 'budget_alloc';
      }
      if (['completed', 'rejected', 'cancelled'].includes(status)) {
        return 'po_issuance';
      }
      const phase = item.flow?.phase_name;
      if (phase === 'Indent and Detailed Tech Specification' || phase === 'Administrative Approval') {
        return 'indent_specs';
      }
      if (phase === 'Tendering') {
        return 'tendering';
      }
      if (phase === 'Technical Evaluation') {
        return 'tech_eval';
      }
      if (phase === 'Financial Sanction' || phase === 'Financial Evaluation') {
        return 'fin_eval';
      }
      if (phase === 'Purchase Order' || status === 'po_issued') {
        return 'po_issuance';
      }
      return 'indent_specs';
    } else if ('gate_pass_no' in item || 'delivery_date' in item) {
      return 'delivery';
    } else if ('asset_tag' in item) {
      return 'assets';
    } else {
      // It's an AA
      const fileNo = item.budget_info?.file_no || item.budget_file?.file_no || item.file_no || '';
      if (fileNo.toUpperCase().startsWith('TEMP')) {
        return 'budget_alloc';
      }
      return 'admin_approval';
    }
  };

  // Helper to format ISO dates nicely
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  // Compile items in each stage
  const getStageItems = (stageKey: string) => {
    const items: any[] = [];
    
    if (stageKey === 'delivery') {
      deliveriesData.forEach((d: any) => {
        items.push({
          id: d.id,
          number: d.gate_pass_no || `#DEL-${d.id}`,
          department: d.purchase_request?.initiator?.department?.name || 'Central Office',
          description: d.purchase_request?.category?.title || 'Delivery Challan',
          pendingWith: d.status === 'pending' ? 'Department PI' : d.status === 'under_inspection' ? 'Stores / LPC' : 'Completed',
          status: d.status.toUpperCase(),
          type: 'DEL',
          amount: d.purchase_request?.amount || 0,
          currentStage: 'Delivery Verification',
          pendingSince: formatDate(d.updated_at || d.created_at),
          link: `/inventory/deliveries/${d.id}`
        });
      });
      return items;
    }

    if (stageKey === 'assets') {
      assets.forEach((ast: any) => {
        items.push({
          id: ast.id,
          number: ast.asset_tag || `#AST-${ast.id}`,
          department: ast.department?.name || 'Central Office',
          description: ast.asset_name || 'Asset Registry',
          pendingWith: 'None (Registered)',
          status: ast.condition?.toUpperCase() || 'GOOD',
          type: 'AST',
          amount: ast.cost || 0,
          currentStage: 'Asset Registry',
          pendingSince: formatDate(ast.created_at),
          link: `/assets/${ast.id}`
        });
      });
      return items;
    }

    scopedAAs.forEach((aa: any) => {
      if (getRequestStage(aa) === stageKey) {
        items.push({
          id: aa.id,
          number: aa.aa_number !== '-' ? aa.aa_number : `#AA-${aa.id}`,
          department: aa.pi_department_name || aa.pi_department?.name || 'Central Office',
          description: aa.item_name || 'Administrative Approval Request',
          pendingWith: aa.pending_with || 'HOD/Dean/Director',
          status: aa.status || 'Pending Approval',
          type: 'AA',
          amount: aa.total_cost,
          currentStage: 'Administrative Approval',
          pendingSince: formatDate(aa.updated_at || aa.created_at),
          link: `/administrative-approvals/${aa.id}`
        });
      }
    });

    scopedPRs.forEach((pr: any) => {
      if (getRequestStage(pr) === stageKey) {
        items.push({
          id: pr.id,
          number: pr.icr_number || `#PR-${pr.id}`,
          department: pr.initiator?.department?.name || 'Central Office',
          description: pr.category?.title || 'Purchase Request',
          pendingWith: pr.flow?.expected_user?.name 
            ? `${pr.flow.expected_user.name} (${pr.flow.expected_role_name || pr.flow.expected_group || 'User'})` 
            : pr.flow?.expected_role_name || pr.flow?.expected_group || 'System',
          status: PR_STATUS_LABELS[pr.current_status as PRStatus] || pr.current_status,
          type: 'PR',
          amount: pr.amount,
          currentStage: pr.flow?.phase_name || 'Indent Process',
          pendingSince: formatDate(pr.flow?.created_at || pr.updated_at),
          link: `/pr/${pr.id}`
        });
      }
    });
    return items;
  };

  // Calculate detailed counts (Total, Pending, Returned, Completed) per stage
  const getStageCounts = (stageKey: string) => {
    let pending = 0;
    let returned = 0;
    let completed = 0;

    if (stageKey === 'delivery') {
      deliveriesData.forEach((d: any) => {
        if (d.status === 'pending' || d.status === 'shipped' || d.status === 'under_inspection') {
          pending++;
        } else if (d.status === 'verified' || d.status === 'received') {
          completed++;
        }
      });
      const total = pending + returned + completed;
      return { total, pending, returned, completed };
    }

    if (stageKey === 'assets') {
      assets.forEach((ast: any) => {
        if (ast.disposal_status === 'flagged') {
          pending++;
        } else {
          completed++;
        }
      });
      const total = pending + returned + completed;
      return { total, pending, returned, completed };
    }

    scopedAAs.forEach((aa: any) => {
      const fileNo = aa.budget_info?.file_no || aa.budget_file?.file_no || aa.file_no || '';
      const isTemp = fileNo.toUpperCase().startsWith('TEMP');

      if (stageKey === 'budget_alloc') {
        if (isTemp) {
          if (aa.status === 'Returned' || aa.pending_with === 'PI') {
            returned++;
          } else {
            pending++;
          }
        } else {
          completed++;
        }
      } else if (stageKey === 'admin_approval') {
        if (!isTemp) {
          if (aa.status === 'Administrative Approval Granted' || aa.status === 'Rejected') {
            completed++;
          } else if (aa.status === 'Returned' || aa.pending_with === 'PI') {
            returned++;
          } else {
            pending++;
          }
        }
      }
    });

    scopedPRs.forEach((pr: any) => {
      const phase = pr.flow?.phase_name;
      const status = pr.current_status;

      if (stageKey === 'budget_alloc' || stageKey === 'admin_approval') {
        completed++;
      } else if (stageKey === 'indent_specs') {
        if (phase === 'Indent and Detailed Tech Specification' || phase === 'Administrative Approval') {
          if (status === 'returned') {
            returned++;
          } else {
            pending++;
          }
        } else if (phase && !['Indent and Detailed Tech Specification', 'Administrative Approval'].includes(phase)) {
          completed++;
        } else if (status === 'completed' || status === 'po_issued') {
          completed++;
        }
      } else if (stageKey === 'tendering') {
        if (phase === 'Tendering') {
          if (status === 'returned') {
            returned++;
          } else {
            pending++;
          }
        } else if (phase && !['Indent and Detailed Tech Specification', 'Administrative Approval', 'Tendering'].includes(phase)) {
          completed++;
        } else if (status === 'completed' || status === 'po_issued') {
          completed++;
        }
      } else if (stageKey === 'tech_eval') {
        if (phase === 'Technical Evaluation') {
          if (status === 'returned') {
            returned++;
          } else {
            pending++;
          }
        } else if (phase && !['Indent and Detailed Tech Specification', 'Administrative Approval', 'Tendering', 'Technical Evaluation'].includes(phase)) {
          completed++;
        } else if (status === 'completed' || status === 'po_issued') {
          completed++;
        }
      } else if (stageKey === 'fin_eval') {
        if (phase === 'Financial Sanction' || phase === 'Financial Evaluation') {
          if (status === 'returned') {
            returned++;
          } else {
            pending++;
          }
        } else if (phase && ['Purchase Order'].includes(phase)) {
          completed++;
        } else if (status === 'completed' || status === 'po_issued') {
          completed++;
        }
      } else if (stageKey === 'po_issuance') {
        if (phase === 'Purchase Order') {
          if (status === 'returned') {
            returned++;
          } else {
            pending++;
          }
        } else if (status === 'po_issued' || status === 'completed') {
          completed++;
        }
      }
    });

    // If a request is approved in AA but has no PR yet, it is pending indent specification creation
    if (stageKey === 'indent_specs') {
      const approvedAAsWithNoPR = scopedAAs.filter((aa: any) => {
        const fileNo = aa.budget_info?.file_no || aa.budget_file?.file_no || aa.file_no || '';
        const isTemp = fileNo.toUpperCase().startsWith('TEMP');
        if (isTemp || aa.status !== 'Administrative Approval Granted') return false;
        const hasPR = scopedPRs.some((pr: any) => pr.administrative_approval_id === aa.id || pr.administrative_approval?.id === aa.id);
        return !hasPR;
      });
      pending += approvedAAsWithNoPR.length;
    }

    const total = pending + returned + completed;
    return { total, pending, returned, completed };
  };

  // 9 Lifecycle stages definition
  const LIFECYCLE_STAGES = [
    { key: 'budget_alloc', label: 'Budget Allocation', icon: Wallet, desc: 'Allocating funds & ledger files' },
    { key: 'admin_approval', label: 'Administrative Approval', icon: CheckCircle, desc: 'AA workflow & nominee checks' },
    { key: 'indent_specs', label: 'Indent & Specs', icon: FileText, desc: 'Technical specifications review' },
    { key: 'tendering', label: 'Tendering Process', icon: Layers, desc: 'LPC minutes & vendor bidding' },
    { key: 'tech_eval', label: 'Tech Evaluation', icon: AlertTriangle, desc: 'Expert committee evaluation' },
    { key: 'fin_eval', label: 'Financial Sanction', icon: TrendingUp, desc: 'Price bid analysis & awards' },
    { key: 'po_issuance', label: 'Purchase Order', icon: Package, desc: 'PO drafting & delivery tracking' },
    { key: 'delivery', label: 'Delivery', icon: Clock, desc: 'Receipt verification & GRN' },
    { key: 'assets', label: 'Asset Management', icon: ShieldAlert, desc: 'Asset registry & tagging' }
  ];

  // Aggregated Action-Oriented Pending Queue
  const getMyPendingActions = (): PendingActionItem[] => {
    const actions: PendingActionItem[] = [];

    // Generic AA pending actions:
    aas.forEach((aa: any) => {
      if (['Administrative Approval Granted', 'Rejected', 'Cancelled'].includes(aa.status)) {
        return;
      }
      
      const isPendingHOD = (aa.pending_with === 'HOD' && isRole('hod') && aa.pi_department_id === user?.department_id) || (aa.pending_with === 'HOD' && isRole('admin'));
      const isPendingADPD = aa.pending_with === 'ADPD' && (isRole('verifier_general') || user?.role?.value === 'adpd' || isRole('admin'));
      const isPendingDean = aa.pending_with === 'Dean' && (isRole('dean_approver') || user?.role?.value === 'dean_pd' || isRole('admin'));
      const isPendingDirector = aa.pending_with === 'Director' && (isRole('apex_approver') || user?.role?.value === 'director' || isRole('admin'));
      const isPendingPI = (aa.pending_with === 'PI' || aa.status === 'Returned' || aa.status?.toLowerCase().includes('returned')) && aa.pi_id === user?.id;
      
      // Also check if user is a nominee with pending status
      const isNomineePending = aa.nominees && Array.isArray(aa.nominees) && aa.nominees.some(
        (nom: any) => nom.nominee_id === user?.id && nom.status === 'Pending'
      );
      
      if (isPendingHOD || isPendingADPD || isPendingDean || isPendingDirector || isPendingPI || isNomineePending) {
        let badgeText = 'AA Review';
        let badgeColor = 'bg-blue-100 text-blue-800 border border-blue-200';
        let actionRequired = 'Verify and approve administrative approval request.';
        
        if (isPendingPI) {
          badgeText = 'AA Returned';
          badgeColor = 'bg-amber-100 text-amber-800 border border-amber-200';
          actionRequired = 'Revise specifications and resubmit request.';
        } else if (isNomineePending) {
          badgeText = 'Nominee Review';
          badgeColor = 'bg-purple-100 text-purple-800 border border-purple-200';
          actionRequired = 'Review specifications and submit evaluation report.';
        } else if (isPendingADPD) {
          badgeText = 'AA ADPD Signoff';
          badgeColor = 'bg-cyan-100 text-cyan-800 border border-cyan-200';
          actionRequired = 'Verify and recommend approval to the Dean.';
        } else if (isPendingDean) {
          badgeText = 'AA Dean Signoff';
          badgeColor = 'bg-teal-100 text-teal-800 border border-teal-200';
          actionRequired = 'Verify and recommend approval to the Director.';
        } else if (isPendingDirector) {
          badgeText = 'AA Director Approval';
          badgeColor = 'bg-emerald-100 text-emerald-800 border border-emerald-200';
          actionRequired = 'Sanction administrative approval.';
        }
        
        actions.push({
          id: aa.id,
          number: aa.aa_number !== '-' ? aa.aa_number : `#AA-${aa.id}`,
          title: aa.item_name || 'Administrative Approval Request',
          type: 'AA',
          badgeText,
          badgeColor,
          amount: aa.total_cost,
          link: `/administrative-approvals/${aa.id}`,
          actionRequired
        });
      }
    });

    // Generic PR pending actions:
    prs.forEach((pr: any) => {
      if (['po_issued', 'rejected', 'cancelled', 'completed'].includes(pr.current_status)) {
        return;
      }
      
      const isExpectedUser = pr.flow?.expected_user_id === user?.id;
      const isExpectedGroup = pr.flow?.expected_group && isRole(pr.flow.expected_group);
      const isHODDeptMatch = pr.flow?.expected_group === 'hod' && pr.initiator?.department_id === user?.department_id;
      const isFacultyPRMatch = pr.flow?.expected_group === 'faculty' && pr.initiator_id === user?.id;
      const isReturned = pr.current_status === 'returned' || pr.current_status?.includes('returned');
      
      const isAwaitingAction = isExpectedUser || 
                               (isExpectedGroup && pr.flow?.expected_group !== 'hod' && pr.flow?.expected_group !== 'faculty') ||
                               isHODDeptMatch || 
                               isFacultyPRMatch ||
                               isRole('admin');
                               
      if (isAwaitingAction) {
        let badgeText = isReturned ? 'PR Returned' : `Pending ${pr.flow?.phase_name || 'Action'}`;
        let badgeColor = isReturned ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-indigo-100 text-indigo-800 border border-indigo-200';
        let actionRequired = isReturned ? 'Revise indent specifications.' : `Process ${pr.flow?.phase_name || 'request'} in workflow.`;
        
        if (isHODDeptMatch) {
          badgeText = 'PR HOD Review';
          badgeColor = 'bg-indigo-100 text-indigo-800 border border-indigo-200';
          actionRequired = 'Approve indent and verify specs.';
        } else if (isExpectedGroup && pr.flow?.expected_group === 'verifier_general') {
          badgeText = 'PR ADPD Signoff';
          badgeColor = 'bg-teal-100 text-teal-800 border border-teal-200';
          actionRequired = 'Verify financial bounds and compliance.';
        } else if (isExpectedGroup && pr.flow?.expected_group === 'apex_approver') {
          badgeText = 'PR Director Sanction';
          badgeColor = 'bg-emerald-50 text-emerald-700 border border-emerald-150';
          actionRequired = 'Sanction purchase order and funding.';
        }
        
        actions.push({
          id: pr.id,
          number: pr.icr_number || `#PR-${pr.id}`,
          title: pr.category?.title || 'Purchase Request',
          type: 'PR',
          badgeText,
          badgeColor,
          amount: pr.amount,
          link: `/pr/${pr.id}`,
          actionRequired
        });
      }
    });

    // General Referrals (All Roles)
    prs.forEach((pr: any) => {
      const activeReferral = pr.referrals?.find(
        (ref: any) => ref.referred_to?.id === user?.id && ref.status === 'pending'
      );
      if (activeReferral) {
        actions.push({
          id: pr.id,
          number: pr.icr_number || `#PR-${pr.id}`,
          title: pr.category?.title || 'Purchase Request',
          type: 'PR',
          badgeText: 'Query Referral',
          badgeColor: 'bg-orange-100 text-orange-850 border border-orange-200',
          amount: pr.amount,
          link: `/pr/${pr.id}`,
          actionRequired: `Referral Query: "${activeReferral.query_text || 'Awaiting response'}"`
        });
      }
    });

    // Deduplicate
    const seen = new Set();
    return actions.filter((act) => {
      const key = `${act.type}-${act.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const myPendingActionsList = getMyPendingActions();
  const activeStageItemsList = selectedStage ? getStageItems(selectedStage) : [];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-white p-6 border border-slate-200 rounded-xl shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#1a3a6b]">Workflow Dashboard</h1>
          <p className="text-sm text-slate-650 font-semibold mt-1">
            Welcome back, {user?.name}
          </p>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Designation: {user?.designation} | Department: {user?.department?.name || 'Central Office'}
          </p>
        </div>
        <div className="flex gap-2">
          {isRole('faculty') && (
            <Link
              to="/pr/create"
              className="inline-flex items-center justify-center gap-2 bg-[#1a3a6b] hover:bg-[#244b8f] text-white font-bold px-4 py-2 rounded-lg text-xs shadow-sm hover:shadow transition"
            >
              <Plus size={14} />
              Initiate Purchase Indent
            </Link>
          )}
          {isRole('hod', 'dean_approver', 'admin') && (
            <Link
              to="/budget"
              className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs shadow-sm transition"
            >
              <Wallet size={14} />
              Manage Budgets
            </Link>
          )}
        </div>
      </div>

      {/* Budget Overview Stat Cards */}
      {showBudgetOverview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white p-5 border border-slate-200/80 rounded-xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[110px]">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Allocation</p>
                <h3 className="text-lg font-extrabold text-slate-800 mt-2">{formatCurrency(safeBudget.total)}</h3>
              </div>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Wallet size={16} />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-medium mt-3 border-t border-slate-100 pt-2">Allocated Budget File Funds</p>
          </div>

          <div className="bg-white p-5 border border-slate-200/80 rounded-xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[110px]">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Locked (Committed)</p>
                <h3 className="text-lg font-extrabold text-amber-600 mt-2">{formatCurrency(safeBudget.locked)}</h3>
              </div>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <Clock size={16} />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-medium mt-3 border-t border-slate-100 pt-2">Active Indents & Tenders</p>
          </div>

          <div className="bg-white p-5 border border-slate-200/80 rounded-xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[110px]">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Utilized (Deducted)</p>
                <h3 className="text-lg font-extrabold text-indigo-650 mt-2">{formatCurrency(safeBudget.deducted)}</h3>
              </div>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <TrendingUp size={16} />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-medium mt-3 border-t border-slate-100 pt-2">PO Issued & Completed</p>
          </div>

          <div className="bg-white p-5 border border-slate-200/80 rounded-xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between min-h-[110px]">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Available Balance</p>
                <h3 className="text-lg font-extrabold text-emerald-600 mt-2">{formatCurrency(safeBudget.available)}</h3>
              </div>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <Package size={16} />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-medium mt-3 border-t border-slate-100 pt-2">Ready for New Procurement</p>
          </div>
        </div>
      )}

      {/* Discrepancy Banner */}
      {discrepancies.filter((d: { status: string }) => d.status === 'open').length > 0 && (
        <div className="border border-l-4 border-l-orange-500 border-slate-200 rounded-xl p-4 flex items-center gap-4 bg-orange-50/70 text-left shadow-sm">
          <AlertTriangle size={20} className="text-orange-600 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-bold text-orange-850">
              {discrepancies.filter((d: { status: string }) => d.status === 'open').length} Open Inventory Discrepancy Mismatches Detected
            </div>
            <div className="text-xs font-semibold text-orange-700 mt-0.5">Quantity mismatches must be resolved to unblock pending payments.</div>
          </div>
          <Link to="/inventory/discrepancies" className="btn-primary text-xs py-1.5 px-3 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg border-none shadow-sm transition">
            Resolve Now
          </Link>
        </div>
      )}

      {/* My Pending Actions Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-left shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-[#1a3a6b]" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">My Pending Actions</h3>
          </div>
          <span className="bg-rose-50 text-rose-700 px-2.5 py-1 rounded-full text-xs font-bold border border-rose-200">
            {myPendingActionsList.length} Action(s) Required
          </span>
        </div>

        {myPendingActionsList.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs font-semibold flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-slate-800 font-bold text-sm">All Caught Up!</p>
              <p className="text-slate-400 font-medium mt-1">No pending procurement actions at this moment.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myPendingActionsList.map((item) => (
              <div 
                key={`${item.type}-${item.id}`} 
                className="p-4 bg-white border border-slate-200 hover:border-[#1a3a6b] transition-all flex flex-col justify-between rounded-xl shadow-sm hover:shadow-md relative overflow-hidden group"
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {item.number}
                    </span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${item.badgeColor}`}>
                      {item.badgeText}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase line-clamp-1 group-hover:text-[#1a3a6b] transition-colors">{item.title}</h4>
                  <div className="text-[11px] text-slate-500 space-y-1 mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <p><span className="font-semibold text-slate-400">Total:</span> <span className="font-bold text-slate-700">{formatCurrency(item.amount)}</span></p>
                    <p><span className="font-semibold text-slate-400">Task:</span> <span className="font-semibold text-slate-655 italic">"{item.actionRequired}"</span></p>
                  </div>
                </div>
                <Link 
                  to={item.link} 
                  className="text-[11px] font-bold text-[#1a3a6b] group-hover:text-[#244b8f] hover:underline mt-4 inline-flex items-center gap-1 self-start transition-colors"
                >
                  Go to Action Desk <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Procurement Lifecycle Stage Cards */}
      <div className="space-y-4 text-left">
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Procurement Lifecycle Tracking</h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Click on a stage card to view the work queue of active requests in that phase.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {LIFECYCLE_STAGES.map((stage) => {
            const count = getStageItems(stage.key).length;
            const isActive = count > 0;
            const isSelected = selectedStage === stage.key;
            const counts = getStageCounts(stage.key);

            return (
              <button
                key={stage.key}
                onClick={() => setSelectedStage(isSelected ? null : stage.key)}
                className={`flex flex-col items-center justify-between text-center p-5 bg-white border rounded-xl shadow-sm transition-all focus:outline-none min-h-[160px] ${
                  isSelected 
                    ? 'border-[#1a3a6b] ring-2 ring-blue-100/70 bg-blue-50/10' 
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                }`}
              >
                <div className="w-full flex flex-col items-center justify-center space-y-1">
                  <p className={`text-xs font-bold uppercase tracking-wider ${isSelected ? 'text-[#1a3a6b]' : 'text-slate-700'}`}>
                    {stage.label}
                  </p>
                  
                  <p className="text-3xl font-black text-[#1a3a6b] py-2">
                    {counts.pending}
                  </p>
                  
                  <p className="text-[10px] text-slate-400 font-semibold tracking-wide uppercase">
                    {counts.pending === 1 ? '1 request under review' : `${counts.pending} requests under review`}
                  </p>
                </div>

                <div className="w-full border-t border-slate-100 mt-4 pt-3 flex justify-center gap-3 text-[10px] text-slate-450 font-bold tracking-tight">
                  <div>
                    <span className="text-slate-400">Total:</span> <span className="text-slate-700">{counts.total}</span>
                  </div>
                  <div>
                    <span className="text-amber-600">Ret:</span> <span className="text-slate-700">{counts.returned}</span>
                  </div>
                  <div>
                    <span className="text-emerald-600">Done:</span> <span className="text-slate-700">{counts.completed}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stage-Wise Work Queue Table */}
      {selectedStage && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm text-left overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Active Work Queue</span>
              <h3 className="text-xs font-extrabold text-slate-800 uppercase mt-0.5">
                Stage: {LIFECYCLE_STAGES.find(s => s.key === selectedStage)?.label} ({activeStageItemsList.length} Item(s))
              </h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-[10px] text-slate-450 border-b border-slate-200 bg-slate-50/30 uppercase tracking-wider font-bold">
                  <th className="px-5 py-3.5">Request Number</th>
                  <th className="px-5 py-3.5">Department</th>
                  <th className="px-5 py-3.5">Amount</th>
                  <th className="px-5 py-3.5">Current Stage</th>
                  <th className="px-5 py-3.5">Pending With User/Role</th>
                  <th className="px-5 py-3.5">Pending Since Date</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Action links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeStageItemsList.map((item) => (
                  <tr key={`${item.type}-${item.id}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4 font-bold text-slate-800">
                      <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-bold mr-1">
                        {item.type}
                      </span>
                      {item.number}
                    </td>
                    <td className="px-5 py-4 text-slate-600 font-semibold">{item.department}</td>
                    <td className="px-5 py-4 font-bold text-slate-700 font-mono">{formatCurrency(item.amount)}</td>
                    <td className="px-5 py-4">
                      <span className="bg-slate-100 text-slate-700 font-bold text-[9px] px-2 py-0.5 rounded border border-slate-200 uppercase tracking-wider">
                        {item.currentStage}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-550 font-semibold">{item.pendingWith}</td>
                    <td className="px-5 py-4 text-slate-500 font-mono font-medium">{item.pendingSince}</td>
                    <td className="px-5 py-4">
                      <span className="bg-blue-50 text-[#1a3a6b] font-bold text-[9px] px-2 py-0.5 rounded-full border border-blue-100 uppercase tracking-wider">
                        {item.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        to={item.link}
                        className="inline-flex items-center gap-1 text-[#1a3a6b] hover:text-[#244b8f] font-extrabold hover:underline"
                      >
                        View Request <ChevronRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {activeStageItemsList.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-slate-400 font-medium italic">
                      No active requests in this procurement stage.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
