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
  type: 'AA' | 'PR' | 'BUDGET';
  badgeText: string;
  badgeColor: string;
  amount: number;
  link: string;
  actionRequired: string;
  department?: string;
  initiator?: string;
  date?: string;
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

  const { data: budgetFiles = [] } = useQuery({
    queryKey: queryKeys.budgets.files(),
    queryFn: () => budgetApi.files().then(r => r.data),
    enabled: isRole('hod'),
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

  // Categorize a request into one of the 8 stages of the procurement lifecycle
  const getRequestStage = (item: any): string | null => {
    if ('current_status' in item) {
      // It's a PR
      const status = item.current_status;
      if (['completed', 'rejected', 'cancelled'].includes(status)) {
        return 'asset';
      }
      if (status === 'budget_file_allocation') {
        return 'indent_specs';
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
      if (phase === 'Purchase Order') {
        return 'approver';
      }
      if (status === 'po_issued' || status === 'po_draft' || status === 'po_approved') {
        return 'po_issued';
      }
      return 'indent_specs';
    } else if ('gate_pass_no' in item || 'delivery_date' in item || 'gin_number' in item) {
      // It's a Delivery
      return item.status === 'completed' || item.status === 'verified' ? 'asset' : 'po_issued';
    } else if ('asset_tag' in item) {
      // It's an Asset
      return 'asset';
    } else {
      // It's an AA
      if (['Administrative Approval Granted', 'Rejected', 'Cancelled'].includes(item.status)) {
        const hasPR = prs.some((pr: any) => pr.administrative_approval_id === item.id || pr.administrative_approval?.id === item.id);
        return hasPR ? 'asset' : 'indent_specs';
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

    // PO issued Stage
    if (stageKey === 'po_issued') {
      deliveriesData.forEach((d: any) => {
        if (d.status === 'pending' || d.status === 'under_inspection' || d.status === 'discrepancy') {
          const hasUnapprovedLogs = d.items?.some((i: any) => i.stores_log && !i.stores_log.is_approved);
          items.push({
            id: d.id,
            number: d.gin_number || d.gate_pass_no || `#DEL-${d.id}`,
            department: d.purchase_request?.initiator?.department?.name || 'Central Office',
            description: d.purchase_request?.category?.title || 'Delivery Receipt/Inspection',
            pendingWith: d.status === 'pending'
              ? (d.purchase_request?.initiator_name || 'Faculty (Initiator)')
              : hasUnapprovedLogs ? 'Apex Approver' : 'HOD / Stores',
            status: d.status === 'pending' ? 'AWAITING GIN CONFIRMATION' : d.status.toUpperCase().replace('_', ' '),
            type: 'DEL',
            amount: d.purchase_request?.amount || 0,
            currentStage: 'PO issued',
            pendingSince: formatDate(d.updated_at || d.created_at),
            link: `/inventory/deliveries/${d.id}`
          });
        }
      });

      // Show PRs with status po_issued that don't have deliveries yet
      scopedPRs.forEach((pr: any) => {
        if (pr.current_status === 'po_issued') {
          const hasDel = deliveriesData.some((d: any) => d.purchase_request_id === pr.id || d.purchase_request?.id === pr.id);
          if (!hasDel) {
            items.push({
              id: pr.id,
              number: pr.icr_number || `#PR-${pr.id}`,
              department: pr.initiator?.department?.name || 'Central Office',
              description: pr.category?.title || 'Purchase Request (PO Issued)',
              pendingWith: 'Faculty (Awaiting Delivery)',
              status: 'PO ISSUED',
              type: 'PR',
              amount: pr.amount,
              currentStage: 'PO issued',
              pendingSince: formatDate(pr.updated_at),
              link: `/pr/${pr.id}`
            });
          }
        }
      });

      return items;
    }

    // Asset Stage
    if (stageKey === 'asset') {
      // Assets
      assets.forEach((ast: any) => {
        items.push({
          id: ast.id,
          number: ast.asset_tag || `#AST-${ast.id}`,
          department: ast.department?.name || 'Central Office',
          description: ast.asset_name || 'Asset Registry',
          pendingWith: 'None (Completed)',
          status: 'COMPLETED',
          type: 'AST',
          amount: ast.cost || 0,
          currentStage: 'Asset Registry',
          pendingSince: formatDate(ast.created_at),
          link: `/assets/${ast.id}`
        });
      });
      // Completed Deliveries
      deliveriesData.forEach((d: any) => {
        if (d.status === 'completed' || d.status === 'verified') {
          items.push({
            id: d.id,
            number: d.gin_number || d.gate_pass_no || `#DEL-${d.id}`,
            department: d.purchase_request?.initiator?.department?.name || 'Central Office',
            description: d.purchase_request?.category?.title || 'Delivery Completed',
            pendingWith: 'None (Completed)',
            status: 'COMPLETED',
            type: 'DEL',
            amount: d.purchase_request?.amount || 0,
            currentStage: 'Delivery Completed',
            pendingSince: formatDate(d.updated_at || d.created_at),
            link: `/inventory/deliveries/${d.id}`
          });
        }
      });
      // Completed/Rejected/Cancelled PRs
      prs.forEach((pr: any) => {
        if (['completed', 'rejected', 'cancelled'].includes(pr.current_status)) {
          items.push({
            id: pr.id,
            number: pr.icr_number || `#PR-${pr.id}`,
            department: pr.initiator?.department?.name || 'Central Office',
            description: pr.category?.title || 'Purchase Request',
            pendingWith: 'None',
            status: pr.current_status.toUpperCase(),
            type: 'PR',
            amount: pr.amount,
            currentStage: 'Completed',
            pendingSince: formatDate(pr.updated_at),
            link: `/pr/${pr.id}`
          });
        }
      });
      return items;
    }

    // Administrative Approval Stage
    scopedAAs.forEach((aa: any) => {
      // Avoid duplicate entries when the AA is in 'indent_specs' stage
      if (getRequestStage(aa) === stageKey && stageKey !== 'indent_specs') {
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

    // Indent and Detailed Tech specifications Stage
    if (stageKey === 'indent_specs') {
      const approvedAAsWithNoPR = scopedAAs.filter((aa: any) => {
        const fileNo = aa.budget_info?.file_no || aa.budget_file?.file_no || aa.file_no || '';
        const isTemp = fileNo.toUpperCase().startsWith('TEMP');
        if (isTemp || aa.status !== 'Administrative Approval Granted') return false;
        const hasPR = scopedPRs.some((pr: any) => pr.administrative_approval_id === aa.id || pr.administrative_approval?.id === aa.id);
        return !hasPR;
      });
      approvedAAsWithNoPR.forEach((aa: any) => {
        items.push({
          id: aa.id,
          number: aa.aa_number !== '-' ? aa.aa_number : `#AA-${aa.id}`,
          department: aa.pi_department_name || aa.pi_department?.name || 'Central Office',
          description: aa.item_name || 'Administrative Approval Request',
          pendingWith: aa.pi_name || 'Faculty (PI)',
          status: 'AWAITING INDENT',
          type: 'AA',
          amount: aa.total_cost,
          currentStage: 'Indent & Specs (Pending)',
          pendingSince: formatDate(aa.updated_at || aa.created_at),
          link: `/pr/create?aa_id=${aa.id}`
        });
      });

      // Budget committee setup actions:
      if (isRole('hod') && Array.isArray(budgetFiles)) {
        budgetFiles.forEach((bf: any) => {
          const needsInitiator = !bf.allocated_initiator_id;
          const needsCommittee = !bf.expert1_id || !bf.expert2_id;
          if (needsInitiator || needsCommittee) {
            items.push({
              id: bf.id,
              number: bf.file_no || `#BUDGET-${bf.id}`,
              department: bf.department?.name || user?.department?.name || 'Department',
              description: `Setup Committee: ${bf.item_name || 'Budget File'}`,
              pendingWith: bf.hod_name || 'HOD',
              status: 'COMMITTEE SETUP',
              type: 'BUDGET',
              amount: bf.total_allocation,
              currentStage: 'Budget Setup',
              pendingSince: formatDate(bf.updated_at || bf.created_at),
              link: `/budget?setup_committee_id=${bf.id}`
            });
          }
        });
      }
    }

    // PRs matching the current stage
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

  // 8 Lifecycle stages definition
  const LIFECYCLE_STAGES = [
    { key: 'admin_approval', label: 'Administrative Approval', desc: 'Admin approvals and internal technical committee nominee reviews.' },
    { key: 'indent_specs', label: 'Indent and Detailed Tech specifications', desc: 'Purchase Initiator creates purchase request form and uploads specifications.' },
    { key: 'tendering', label: 'Tendering', desc: 'Procurement section publishes tender or processes local purchase selection.' },
    { key: 'tech_eval', label: 'Technical Evaluation', desc: 'Expert committee reviews submitted technical bids and signs evaluation report.' },
    { key: 'fin_eval', label: 'Financial Sanctions', desc: 'Dean/Director reviews financial comparative sheets and grants sanction.' },
    { key: 'approver', label: 'Approver', desc: 'Dean/Director final approval and purchase order verification.' },
    { key: 'po_issued', label: 'PO issued', desc: 'Official purchase order generation, delivery logging, and final billing.' },
    { key: 'asset', label: 'Asset', desc: 'Completed purchases and asset tagging.' }
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
      const isPendingIA = (aa.pending_with === 'IA' || aa.pending_with?.toLowerCase().includes('audit')) && (user?.role?.value === 'ia' || user?.role?.value === 'internal_auditor' || user?.role?.group_key === 'internal_audit' || user?.role?.group_key === 'auditor' || isRole('admin'));
      const isPendingDirector = aa.pending_with === 'Director' && (isRole('apex_approver') || user?.role?.value === 'director' || isRole('admin'));
      const isPendingPI = (aa.pending_with === 'PI' || aa.status === 'Returned' || aa.status?.toLowerCase().includes('returned')) && aa.pi_id === user?.id;

      // Also check if user is a nominee with pending status
      const isNomineePending = aa.nominees && Array.isArray(aa.nominees) && aa.nominees.some(
        (nom: any) => nom.nominee_id === user?.id && nom.status === 'Pending'
      );

      if (isPendingHOD || isPendingADPD || isPendingDean || isPendingIA || isPendingDirector || isPendingPI || isNomineePending) {
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
        } else if (isPendingIA) {
          badgeText = 'AA IA Scrutiny';
          badgeColor = 'bg-indigo-100 text-indigo-850 border border-indigo-200';
          actionRequired = 'Scrutinize and sign the administrative approval file.';
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
          actionRequired,
          department: aa.pi_department_name || aa.pi_department?.name || 'Central Office',
          initiator: aa.pi_name || 'Purchase Initiator',
          date: formatDate(aa.updated_at || aa.created_at)
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
          actionRequired,
          department: pr.initiator?.department?.name || 'Central Office',
          initiator: pr.initiator?.name || 'Faculty',
          date: formatDate(pr.updated_at || pr.created_at)
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
          actionRequired: `Referral Query: "${activeReferral.query_text || 'Awaiting response'}"`,
          department: pr.initiator?.department?.name || 'Central Office',
          initiator: pr.initiator?.name || 'Faculty',
          date: formatDate(activeReferral.created_at || pr.updated_at)
        });
      }
    });

    // HOD Budget Committee Setup pending actions:
    if (isRole('hod') && Array.isArray(budgetFiles)) {
      budgetFiles.forEach((bf: any) => {
        const needsInitiator = !bf.allocated_initiator_id;
        const needsCommittee = !bf.expert1_id || !bf.expert2_id;
        if (needsInitiator || needsCommittee) {
          actions.push({
            id: bf.id,
            number: bf.file_no || `#BUDGET-${bf.id}`,
            title: `Setup Committee: ${bf.item_name || 'Budget File'}`,
            type: 'BUDGET',
            badgeText: 'Committee Setup',
            badgeColor: 'bg-amber-100 text-amber-800 border border-amber-250',
            amount: bf.total_allocation,
            link: `/budget?setup_committee_id=${bf.id}`,
            actionRequired: needsInitiator && needsCommittee
              ? 'Assign a Purchase Initiator and Technical Committee nominees.'
              : needsInitiator
                ? 'Assign a Purchase Initiator.'
                : 'Assign Technical Committee nominees.',
            department: bf.department?.name || user?.department?.name || 'Department',
            initiator: bf.hod_name || 'HOD',
            date: formatDate(bf.updated_at || bf.created_at)
          });
        }
      });
    }

    // Faculty Pending Administrative Approvals actions:
    if (isRole('faculty') && Array.isArray(budgetFiles)) {
      budgetFiles.forEach((bf: any) => {
        if (Number(bf.allocated_initiator_id) === Number(user?.id)) {
          const hasAA = aas.some((aa: any) => Number(aa.budget_file_id) === Number(bf.id));
          if (!hasAA) {
            actions.push({
              id: bf.id,
              number: bf.file_no || `#BUDGET-${bf.id}`,
              title: `Initiate Admin Approval: ${bf.item_name || 'Budget File'}`,
              type: 'BUDGET',
              badgeText: 'AA Action Needed',
              badgeColor: 'bg-emerald-100 text-emerald-800 border border-emerald-250',
              amount: bf.total_allocation,
              link: `/administrative-approvals/create?budget_id=${bf.id}`,
              actionRequired: 'Please initiate the Administrative Approval request for this budget.',
              department: bf.department || user?.department?.name || 'Department',
              initiator: 'System',
              date: formatDate(bf.updated_at || bf.created_at)
            });
          }
        }
      });
    }

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

  const isActionRequiredForUser = (item: any): boolean => {
    // 1. Check against myPendingActionsList for AA, PR, BUDGET
    const inPendingList = myPendingActionsList.some(
      (act) => act.type === item.type && act.id === item.id
    );
    if (inPendingList) return true;

    // 2. Check for GIN/GRN (DEL pending or under inspection)
    if (item.type === 'DEL') {
      const delRecord = deliveriesData.find((d: any) => d.id === item.id);
      if (delRecord) {
        if (delRecord.status === 'pending') {
          const isInitiator = user && delRecord.purchase_request?.initiator_id === user.id;
          return !!isInitiator;
        }
        if (delRecord.status === 'under_inspection' || delRecord.status === 'discrepancy') {
          const hasUnapprovedLogs = delRecord.items?.some((i: any) => i.stores_log && !i.stores_log.is_approved);
          const isHod = user?.role?.group_key === 'hod';
          const isStores = user?.role?.group_key === 'verifier_sp';
          const isApex = user?.role?.group_key === 'apex_approver';
          const isAdmin = user?.role?.group_key === 'admin';

          if (hasUnapprovedLogs && isApex) return true;
          if (!hasUnapprovedLogs && (isHod || isStores || isAdmin)) return true;
        }
      }
    }

    // 3. Check for AAs awaiting indent
    if (item.type === 'AA' && item.status === 'AWAITING INDENT') {
      const aaRecord = aas.find((a: any) => a.id === item.id);
      if (aaRecord && aaRecord.pi_id === user?.id) {
        return true;
      }
    }

    return false;
  };

  const activeStageItemsList = selectedStage
    ? getStageItems(selectedStage).sort((a, b) => {
      const aReq = isActionRequiredForUser(a) ? 1 : 0;
      const bReq = isActionRequiredForUser(b) ? 1 : 0;
      return bReq - aReq;
    })
    : [];

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

      {!selectedStage ? (
        <div className="space-y-4 text-left">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Procurement Lifecycle Tracking</h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Click on a stage card to view the work queue of active requests in that phase.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {LIFECYCLE_STAGES.map((stage) => {
              const stageItems = getStageItems(stage.key);
              const totalCount = stageItems.length;

              // Determine status and pending counts
              const pendingUserItems = stageItems.filter(isActionRequiredForUser);
              const pendingUserCount = pendingUserItems.length;

              // Under review items are items in progress that are not requiring current user action
              const underReviewCount = stageItems.filter(item => {
                if (isActionRequiredForUser(item)) return false;
                if (item.status === 'COMPLETED' || item.status === 'REJECTED' || item.status === 'CANCELLED' || item.status === 'GOOD') return false;
                return true;
              }).length;

              let statusColor = 'bg-emerald-500';
              let statusText = 'No Action Required';
              let borderStyle = 'border-slate-200';

              if (pendingUserCount > 0) {
                statusColor = 'bg-rose-500';
                statusText = `${pendingUserCount} Action Required`;
                borderStyle = 'border-rose-350 ring-1 ring-rose-50/50';
              } else if (underReviewCount > 0) {
                statusColor = 'bg-amber-400';
                statusText = `${underReviewCount} Under Review`;
                borderStyle = 'border-slate-250';
              }

              return (
                <button
                  key={stage.key}
                  onClick={() => setSelectedStage(stage.key)}
                  className={`flex flex-col text-left p-5 bg-white border rounded-xl shadow-sm transition-all focus:outline-none min-h-[140px] hover:border-slate-350 hover:shadow ${borderStyle}`}
                >
                  <div className="flex justify-between items-start w-full gap-2">
                    <h4 className="text-xs font-extrabold text-slate-800 tracking-tight uppercase">{stage.label}</h4>
                    <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                      {totalCount} {totalCount === 1 ? 'Record' : 'Records'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 font-medium mt-1.5 flex-grow line-clamp-2">
                    {stage.desc}
                  </p>

                  <div className={`w-full mt-4 pt-2.5 border-t border-slate-100 flex items-center gap-1.5`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                    <span className="text-[10px] font-extrabold tracking-wider uppercase text-slate-600">
                      {statusText}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Stage-Wise Work Queue Table */
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm text-left overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSelectedStage(null)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#1a3a6b] bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm transition"
              >
                ← Back to Dashboard
              </button>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Active Work Queue</span>
                <h3 className="text-xs font-extrabold text-slate-800 uppercase mt-0.5">
                  Stage: {LIFECYCLE_STAGES.find(s => s.key === selectedStage)?.label} ({activeStageItemsList.length} Item(s))
                </h3>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-[10px] text-slate-450 border-b border-slate-200 bg-slate-50/30 uppercase tracking-wider font-bold">
                  <th className="px-5 py-3.5">Reference No</th>
                  <th className="px-5 py-3.5">Department</th>
                  <th className="px-5 py-3.5">Description</th>
                  <th className="px-5 py-3.5">Amount</th>
                  <th className="px-5 py-3.5">Pending With User/Role</th>
                  <th className="px-5 py-3.5">Pending Since</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeStageItemsList.map((item) => {
                  const requiresAction = isActionRequiredForUser(item);
                  return (
                    <tr
                      key={`${item.type}-${item.id}`}
                      className={`transition-colors ${requiresAction
                        ? 'bg-rose-50/25 hover:bg-rose-50/40 border-l-2 border-l-rose-500'
                        : 'hover:bg-slate-50/50'
                        }`}
                    >
                      <td className="px-5 py-4 font-bold text-slate-800">
                        <span className="font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[10px] font-bold mr-1.5">
                          {item.type}
                        </span>
                        {item.number}
                      </td>
                      <td className="px-5 py-4 text-slate-600 font-semibold">{item.department}</td>
                      <td className="px-5 py-4 text-slate-700 font-medium max-w-xs truncate" title={item.description}>{item.description}</td>
                      <td className="px-5 py-4 font-bold text-slate-700 font-mono">{formatCurrency(item.amount)}</td>
                      <td className="px-5 py-4 text-slate-550 font-semibold">{item.pendingWith}</td>
                      <td className="px-5 py-4 text-slate-500 font-mono font-medium">{item.pendingSince}</td>
                      <td className="px-5 py-4">
                        <span className={`font-bold text-[9px] px-2 py-0.5 rounded border uppercase tracking-wider ${requiresAction
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                          {requiresAction ? 'Action Required' : item.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {item.type === 'AA' && item.status === 'AWAITING INDENT' && (
                            <Link
                              to={`/administrative-approvals/${item.id}`}
                              className="text-slate-500 hover:text-slate-700 font-semibold hover:underline flex items-center gap-0.5"
                            >
                              View Request <ChevronRight size={13} />
                            </Link>
                          )}
                          <Link
                            to={item.link}
                            className={`inline-flex items-center gap-1 font-extrabold hover:underline ${requiresAction ? 'text-rose-600 hover:text-rose-700' : 'text-[#1a3a6b] hover:text-[#244b8f]'
                              }`}
                          >
                            {item.type === 'AA' && item.status === 'AWAITING INDENT' ? 'Initiate Indent' : requiresAction ? 'Take Action' : 'View Request'} <ChevronRight size={13} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
