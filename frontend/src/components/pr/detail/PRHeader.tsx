import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Check, ShieldAlert, Settings, Users, Award, X, XCircle } from 'lucide-react';
import { PurchaseRequest, PR_STATUS_LABELS, PRStatus } from '../../../types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetApi } from '../../../services/api';
import { queryKeys } from '../../../config/queryKeys';
import toast from 'react-hot-toast';
import { formatFileNo } from '../../../utils/format';
import { CancelPOModal } from '../actions/CancelPOModal';
import { SearchableSelect } from '../../common/SearchableSelect';

interface PRHeaderProps {
  pr: PurchaseRequest;
  user: any;
  isAdmin: boolean;
  adminRoles: any[];
  adminUsers: any[];
  adminDepts: any[];
  updateWfMutation: any;
  formatCurrency: (n?: number) => string;
  refetch: () => void;
}

export const PRHeader: React.FC<PRHeaderProps> = ({
  pr,
  user,
  isAdmin,
  adminRoles,
  adminUsers,
  adminDepts,
  updateWfMutation,
  formatCurrency,
  refetch,
}) => {
  const queryClient = useQueryClient();
  const [showNominationModal, setShowNominationModal] = useState(false);
  const [showPrintDropdown, setShowPrintDropdown] = useState(false);
  const [expert1Id, setExpert1Id] = useState<number | ''>('');
  
  // Cancellation states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelType, setCancelType] = useState<'tender' | 'po' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const isAuthorizedToCancel = user?.id === pr.initiator_id || user?.id === pr.hod_id || user?.role?.group_key === 'admin';

  const printModules = [
    {
      category: "Sanctions & Indents",
      items: [
        { key: 'indent', label: 'Purchase Indent' },
        { key: 'pac_approval', label: 'PAC Purchase Approval' },
        { key: 'lpc_approval', label: 'LPC Purchase Approval' },
        { key: 'single_source', label: 'Single Source/Nomination Purchase Approval' },
        { key: 'fin_approval_single', label: 'Financial Approval (Single Bid)' },
        { key: 'fin_approval_two', label: 'Financial Approval (Two Bid)' },
      ]
    },
    {
      category: "Technical & Comparatives",
      items: [
        { key: 'specs', label: 'Technical Specification Annexure' },
        { key: 'tech_comparative', label: 'Technical Comparative Statement' },
        { key: 'tech_minutes', label: 'Technical Evaluation Minutes' },
        { key: 'price_comparative', label: 'Price Comparative Statement' },
        { key: 'techno_comm_comparative', label: 'Techno-Commercial Comparative Statement' },
      ]
    },
    {
      category: "Certificates & Cancellations",
      items: [
        { key: 'pac_cert', label: 'Proprietary Article Certificate' },
        { key: 'bill_passing', label: 'Purchase Bill Passing Certificate' },
        { key: 'po_cancel', label: 'PO Cancellation Certificate' },
        { key: 'tender_cancel', label: 'Tender Cancellation Certificate' },
      ]
    }
  ];
  const [expert2Id, setExpert2Id] = useState<number | ''>('');
  const [directorFacultyId, setDirectorFacultyId] = useState<number | ''>('');

  const isHOD = user && user.role?.group_key === 'hod' && pr.budget_file && Number(pr.budget_file.department_id) === Number(user.department_id || user.department?.id);
  const isDirector = user && (user.role?.value === 'director' || user.role?.group_key === 'apex_approver' || user.role?.group_key === 'admin');

  const allFileNos = Array.from(new Set((pr.items || []).map((item: any) => item.budget_file?.file_no).filter(Boolean)));
  const allFileNosStr = allFileNos.map(f => formatFileNo(f as string, user?.role?.group_key)).join(', ');

  // HOD department faculties
  const { data: deptFaculties = [] } = useQuery<any[]>({
    queryKey: queryKeys.users.deptFaculty,
    queryFn: () => budgetApi.departmentFaculty().then(r => r.data),
    enabled: !!isHOD,
  });

  // Director nominee options (all users)
  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: queryKeys.users.directorNomination,
    queryFn: () => budgetApi.allUsers().then(r => r.data),
    enabled: !!isDirector,
  });

  // Initialize form states when opening modal or on load
  React.useEffect(() => {
    if (pr.budget_file) {
      setExpert1Id(pr.budget_file.expert1_id || '');
      setExpert2Id(pr.budget_file.expert2_id || '');
      setDirectorFacultyId(pr.budget_file.director_faculty_id || '');
    }
  }, [pr.budget_file]);

  const assignCommitteeMutation = useMutation({
    mutationFn: async ({ budgetIds, expert1_id, expert2_id }: { budgetIds: number[]; expert1_id: number | null; expert2_id: number | null }) => {
      await Promise.all(budgetIds.map(id => budgetApi.assignCommittee(id, { expert1_id, expert2_id })));
    },
    onSuccess: () => {
      toast.success('Technical committee experts updated successfully');
      setShowNominationModal(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.prs.detail(pr.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.prs.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.files() });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview() });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.admin() });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update technical committee');
    }
  });

  const assignDirectorCommitteeMutation = useMutation({
    mutationFn: async ({ budgetIds, director_faculty_id }: { budgetIds: number[]; director_faculty_id: number | null }) => {
      await Promise.all(budgetIds.map(id => budgetApi.assignDirectorCommittee(id, { director_faculty_id })));
    },
    onSuccess: () => {
      toast.success('Director nominee updated successfully');
      setShowNominationModal(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.prs.detail(pr.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.prs.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.files() });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview() });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.admin() });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update director nominee');
    }
  });

  const handleNominateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const budgetIds = Array.from(new Set((pr.items || []).map((i: any) => i.budget_file_id).filter(Boolean))) as number[];
    if (budgetIds.length === 0) return;

    if (isHOD) {
      if (!expert1Id || !expert2Id) {
        toast.error('Both experts must be selected');
        return;
      }
      if (expert1Id === expert2Id) {
        toast.error('Expert 1 and Expert 2 must be different faculty members');
        return;
      }
      assignCommitteeMutation.mutate({
        budgetIds,
        expert1_id: Number(expert1Id),
        expert2_id: Number(expert2Id)
      });
    } else if (isDirector) {
      if (!directorFacultyId) {
        toast.error('Director nominee must be selected');
        return;
      }
      assignDirectorCommitteeMutation.mutate({
        budgetIds,
        director_faculty_id: Number(directorFacultyId)
      });
    }
  };
  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex items-start justify-between flex-wrap gap-4 bg-white p-5 border border-slate-200 rounded-md shadow-sm">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link to="/pr" className="text-[#1a3a6b] hover:underline text-sm font-semibold">← Back to List</Link>
            <div className="relative inline-block text-left">
              <button 
                onClick={() => setShowPrintDropdown(!showPrintDropdown)}
                className="flex items-center gap-1.5 text-sm bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 px-3 py-1.5 rounded transition font-medium focus:outline-none"
              >
                <Download size={14} /> Download Documents <span className="text-[10px] ml-1">▼</span>
              </button>
              
              {showPrintDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowPrintDropdown(false)}></div>
                  <div className="absolute left-0 mt-2 w-80 rounded-md shadow-xl bg-white border border-slate-200 divide-y divide-slate-100 focus:outline-none z-20 origin-top-left max-h-[80vh] overflow-y-auto">
                    <div className="p-2 space-y-1">
                      <a
                        href={`/api/pr/${pr.id}/print?module=office_document`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShowPrintDropdown(false)}
                        className="group flex items-center px-3 py-2 text-xs font-bold text-[#1a3a6b] hover:bg-[#1a3a6b]/5 rounded transition-colors"
                      >
                        Office Document (Official Clean Copy)
                      </a>
                      <a
                        href={`/api/pr/${pr.id}/print?module=everything_dossier`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShowPrintDropdown(false)}
                        className="group flex items-center px-3 py-2 text-xs font-bold text-[#1a3a6b] hover:bg-[#1a3a6b]/5 rounded transition-colors"
                      >
                        Full History &amp; Dossier (Everything)
                      </a>
                    </div>
                    {printModules.map((group) => (
                      <div key={group.category} className="p-2">
                        <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {group.category}
                        </div>
                        <div className="space-y-0.5 mt-1">
                          {group.items.map((item) => (
                            <a
                              key={item.key}
                              href={`/api/pr/${pr.id}/print?module=${item.key}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => setShowPrintDropdown(false)}
                              className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded font-medium transition-colors"
                            >
                              {item.label}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {isAuthorizedToCancel && pr.current_status === 'po_issued' && (
              <button
                onClick={() => {
                  setCancelType('po');
                  setShowCancelModal(true);
                }}
                disabled={actionLoading}
                className="flex items-center gap-1.5 text-sm bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 px-3 py-1.5 rounded transition font-medium focus:outline-none cursor-pointer"
              >
                <XCircle size={14} className="text-red-600 animate-pulse" /> Cancel Indent
              </button>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-800 uppercase">{pr.icr_number || `PI #${pr.id}`}</h1>
          <p className="text-sm font-medium text-slate-600 mt-1">
            {pr.category?.title} · {pr.procurement?.name}
            {pr.category?.requirement_type && ` · Nature of Requirement: ${pr.category.requirement_type}`}
          </p>
        </div>
        <span className="status-badge border-slate-300 bg-slate-100 text-slate-800 px-3 py-1 text-sm shadow-sm">
          {PR_STATUS_LABELS[pr.current_status as PRStatus] || pr.current_status.toUpperCase()}
        </span>
      </div>

      {/* Rollover Links */}
      {(pr.parent_pr || (pr.child_prs && pr.child_prs.length > 0)) && (
        <div className="flex flex-col gap-2.5 p-4 bg-blue-50 border border-blue-200 rounded-lg text-left shadow-sm">
          {pr.parent_pr && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-blue-800">
              <span className="px-2 py-0.5 bg-blue-100 border border-blue-300 text-blue-900 rounded text-[10px] uppercase font-bold tracking-wide">Rolled Over</span>
              <span>This indent was rolled over from</span>
              <Link to={`/pr/${pr.parent_pr.id}`} className="font-mono font-black text-blue-900 hover:text-blue-950 underline decoration-blue-400 decoration-2 hover:decoration-blue-700">
                {pr.parent_pr.icr_number || `PI #${pr.parent_pr.id}`}
              </Link>
              <span className="font-normal text-slate-500">due to the closure of the previous financial year.</span>
            </div>
          )}
          {pr.child_prs && pr.child_prs.map((child: any) => (
            <div key={child.id} className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-blue-800">
              <span className="px-2 py-0.5 bg-indigo-100 border border-indigo-300 text-indigo-900 rounded text-[10px] uppercase font-bold tracking-wide">Revised Sequence</span>
              <span>This indent has been transferred to new financial year as</span>
              <Link to={`/pr/${child.id}`} className="font-mono font-black text-indigo-900 hover:text-indigo-950 underline decoration-indigo-400 decoration-2 hover:decoration-indigo-700">
                {child.icr_number || `PI #${child.id}`}
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ── PR Metadata Table ─────────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg overflow-hidden text-left shadow-sm">
        <table className="w-full border-collapse text-sm">
          <tbody>

            {/* Row: Amount | Purchase Type */}
            <tr className="border-b border-gray-200">
              <td className="w-36 px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200 whitespace-nowrap">Total Amount</td>
              <td className="px-4 py-2.5 font-bold text-[#1a3a6b] text-base border-r border-gray-200">{formatCurrency(pr.amount)}</td>
              <td className="w-36 px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200 whitespace-nowrap">Purchase Type</td>
              <td className="px-4 py-2.5 font-medium text-gray-800 capitalize">{pr.purchase_type}</td>
            </tr>

            {/* Row: Initiator | Date */}
            <tr className="border-b border-gray-200">
              <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">Initiator</td>
              <td className="px-4 py-2.5 font-medium text-gray-800 border-r border-gray-200">{pr.initiator?.name || '—'}</td>
              <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">Date of Indent</td>
              <td className="px-4 py-2.5 text-gray-800">{new Date(pr.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
            </tr>

            {/* Row: Category | Procurement */}
            <tr className="border-b border-gray-200">
              <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">Category</td>
              <td className="px-4 py-2.5 font-medium text-gray-800 border-r border-gray-200">{pr.category?.title || '—'}</td>
              <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">Procurement Method</td>
              <td className="px-4 py-2.5 font-medium text-gray-800">{pr.procurement?.name || '—'}</td>
            </tr>

            {/* Row: Budget File */}
            <tr className="border-b border-gray-200">
              <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">Budget File(s)</td>
              <td colSpan={3} className="px-4 py-2.5 font-bold text-[#1a3a6b]">{allFileNosStr || '—'}</td>
            </tr>

            {/* Row: Workflow Stage */}
            {pr.flow && (
              <tr className="border-b border-gray-200">
                <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200 align-top">Workflow Stage</td>
                <td colSpan={3} className="px-4 py-2.5">
                  <p className="font-bold text-blue-800">
                    Phase {pr.flow.phase_id}: {pr.flow.phase_name || 'N/A'} (Step {pr.flow.step_order})
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs font-medium text-gray-500">
                    <span>Pending with:</span>
                    {isAdmin && pr.flow.workflow_step_id ? (
                      <select
                        value={
                          pr.flow.expected_user_id ? `user:${pr.flow.expected_user_id}` :
                          pr.flow.expected_role_id ? `role:${pr.flow.expected_role_id}` :
                          pr.flow.expected_group ? `group:${pr.flow.expected_group}` : ''
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          const stepId = pr.flow?.workflow_step_id;
                          if (!stepId) return;
                          if (val.startsWith('tag:')) {
                            updateWfMutation.mutate({ id: stepId, data: { user_type: val.substring(4) } });
                          } else if (val.startsWith('user:')) {
                            updateWfMutation.mutate({ id: stepId, data: { user_id: Number(val.substring(5)), user_type: 'user' } });
                          } else if (val.startsWith('role:')) {
                            updateWfMutation.mutate({ id: stepId, data: { role_id: Number(val.substring(5)), user_type: 'group' } });
                          } else if (val.startsWith('group:')) {
                            updateWfMutation.mutate({ id: stepId, data: { user_group: val.substring(6), user_type: 'group' } });
                          }
                        }}
                        className="font-semibold text-[#1a3a6b] bg-blue-50/50 border-b border-dashed border-blue-300 hover:border-[#1a3a6b] focus:border-[#1a3a6b] focus:outline-none pr-6 py-0.5 max-w-full text-xs cursor-pointer rounded"
                      >
                        <optgroup label="Special Workflow Roles">
                          <option value="tag:purchase_initiator">Purchase Initiator (Faculty)</option>
                          <option value="tag:da_assigner">Superintendent (DA Assigner)</option>
                          <option value="tag:verifier_da">Dealing Assistant (verifier_da)</option>
                          <option value="tag:tech_evaluation">Committee (tech_evaluation)</option>
                        </optgroup>
                        <optgroup label="Roles">
                          {adminRoles.map((r: any) => <option key={r.id} value={`role:${r.id}`}>{r.name}</option>)}
                        </optgroup>
                        <optgroup label="User Groups">
                          <option value="group:faculty">Faculty Group</option>
                          <option value="group:hod">HOD Group</option>
                          <option value="group:verifier_da">Dealing Assistant Group</option>
                          <option value="group:verifier_sp">Superintendent / AR Group</option>
                          <option value="group:verifier_general">Associate Dean Group</option>
                          <option value="group:dean_approver">Dean Approver Group</option>
                          <option value="group:apex_approver">Apex Approver Group</option>
                        </optgroup>
                        <optgroup label="Users">
                          {adminUsers.map((u: any) => <option key={u.id} value={`user:${u.id}`}>{u.name} ({u.email})</option>)}
                        </optgroup>
                      </select>
                    ) : (
                      <span className="font-semibold text-gray-700">
                        {pr.flow.step_type === 'tech_evaluation' && pr.flow.step_order === 1
                          ? 'TSC Committee (all members must sign)'
                          : pr.flow.expected_user_name
                            ? `${pr.flow.expected_user_name} (User)`
                            : pr.flow.expected_role_name || pr.flow.expected_group || 'N/A'}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            )}

            {/* Row: DA Assignments */}
            {pr.assignments && pr.assignments.length > 0 && (
              <tr className="border-b border-gray-200">
                <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200 align-top">DA Assignments</td>
                <td colSpan={3} className="px-4 py-2.5">
                  <div className="space-y-1">
                    {pr.assignments.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                        <Check size={13} className="text-green-600 shrink-0" />
                        <span>{a.assigned_da_name || 'N/A'}</span>
                        <span className="text-xs text-gray-400">({a.status})</span>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            )}

            {/* Row: EMD | Performance Security */}
            {(pr.emd != null || pr.performance_security != null) && (
              <tr className="border-b border-gray-200">
                <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">EMD</td>
                <td className="px-4 py-2.5 font-semibold text-gray-800 border-r border-gray-200">{pr.emd != null ? `${pr.emd}%` : '—'}</td>
                <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">Performance Security</td>
                <td className="px-4 py-2.5 font-semibold text-gray-800">{pr.performance_security != null ? `${pr.performance_security}%` : '—'}</td>
              </tr>
            )}

            {/* Row: Delivery Location | Mode */}
            {(pr.delivery_location || pr.delivery_mode) && (
              <tr className="border-b border-gray-200">
                <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">Delivery Location</td>
                <td className="px-4 py-2.5 font-medium text-gray-800 border-r border-gray-200">{pr.delivery_location || '—'}</td>
                <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">Delivery Mode</td>
                <td className="px-4 py-2.5 font-medium text-gray-800">{pr.delivery_mode || '—'}</td>
              </tr>
            )}

            {/* Row: Basis of Estimate */}
            {pr.basis_of_estimate && (
              <tr className="border-b border-gray-200">
                <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200 align-top">Basis of Estimate</td>
                <td colSpan={3} className="px-4 py-2.5 text-gray-700">{pr.basis_of_estimate}</td>
              </tr>
            )}

            {/* Row: Exemption */}
            {pr.exemption && (
              <tr className="border-b border-gray-200">
                <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200 align-top">Exemption</td>
                <td colSpan={3} className="px-4 py-2.5 text-orange-800 font-medium">
                  {pr.exemption_remarks || 'Exempted — no remarks provided'}
                </td>
              </tr>
            )}

            {/* Row: Split Details */}
            {(pr.is_item_split || pr.is_quantity_split) && (
              <tr className="border-b border-gray-200">
                <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200 align-top">Split Details</td>
                <td colSpan={3} className="px-4 py-2.5 text-gray-700 space-y-0.5">
                  {pr.is_item_split && <p><span className="font-semibold">Item Split:</span> {pr.item_split_justification || 'Yes'}</p>}
                  {pr.is_quantity_split && <p><span className="font-semibold">Qty Split:</span> {pr.quantity_split_details || 'Yes'}</p>}
                </td>
              </tr>
            )}

            {/* Rows: Tender Details */}
            {pr.tender_reference_number && (
              <>
                <tr className="border-b border-gray-200">
                  <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">Tender Ref No.</td>
                  <td className="px-4 py-2.5 font-bold text-gray-800 border-r border-gray-200">{pr.tender_reference_number}</td>
                  <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">Vendor List</td>
                  <td className="px-4 py-2.5">
                    {pr.vendor_list_link
                      ? <a href={pr.vendor_list_link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium text-sm">View Link ↗</a>
                      : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
                {(pr.date_of_tender || pr.date_of_tech_bid_opening || pr.date_of_financial_bid_opening) && (
                  <tr className="border-b border-gray-200">
                    <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">Date of Tender</td>
                    <td className="px-4 py-2.5 text-gray-800 border-r border-gray-200">{pr.date_of_tender ? new Date(pr.date_of_tender).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td className="px-4 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">Bid Opening</td>
                    <td className="px-4 py-2.5 text-gray-800 text-xs space-y-0.5">
                      {pr.date_of_tech_bid_opening && <p>Tech: {new Date(pr.date_of_tech_bid_opening).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
                      {pr.date_of_financial_bid_opening && <p>Fin: {new Date(pr.date_of_financial_bid_opening).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
                    </td>
                  </tr>
                )}
              </>
            )}

          </tbody>
        </table>
      </div>

      {/* Nomination / Committee Edit Modal */}
      {showNominationModal && pr.budget_file && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-left">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-visible animate-fadeIn">
            <div className="px-6 py-4 border-b border-slate-200 bg-[#1a3a6b] text-white flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">Configure Purchase Committee</h2>
                <p className="text-xs text-blue-200 mt-1">Budget File(s): {allFileNosStr || '-'}</p>
              </div>
              <button 
                type="button"
                onClick={() => setShowNominationModal(false)}
                className="text-white hover:text-slate-200 text-xl font-bold"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleNominateSubmit} className="p-6 space-y-4 overflow-visible">
              {isHOD && (
                <>
                  <div className="p-3 bg-indigo-50 text-indigo-800 text-xs font-semibold rounded border border-indigo-200 leading-relaxed mb-2">
                    As HOD, configure the two department experts who will serve on the 5-member purchase committee for technical evaluation.
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Department Expert 1 <span className="text-rose-500">*</span>
                    </label>
                    <SearchableSelect
                      options={deptFaculties}
                      value={expert1Id === '' ? null : Number(expert1Id)}
                      onChange={(val) => setExpert1Id(val === null ? '' : val)}
                      placeholder="Select Department Expert 1..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Department Expert 2 <span className="text-rose-500">*</span>
                    </label>
                    <SearchableSelect
                      options={deptFaculties}
                      value={expert2Id === '' ? null : Number(expert2Id)}
                      onChange={(val) => setExpert2Id(val === null ? '' : val)}
                      placeholder="Select Department Expert 2..."
                    />
                  </div>
                </>
              )}

              {isDirector && (
                <>
                  <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded border border-emerald-200 leading-relaxed mb-2">
                    As Director / Admin, configure the Director Nominee who will serve on the 5-member purchase committee for technical evaluation.
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Director Nominee <span className="text-rose-500">*</span>
                    </label>
                    <SearchableSelect
                      options={allUsers}
                      value={directorFacultyId === '' ? null : Number(directorFacultyId)}
                      onChange={(val) => setDirectorFacultyId(val === null ? '' : val)}
                      placeholder="Select Director Nominee..."
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNominationModal(false)}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignCommitteeMutation.isPending || assignDirectorCommitteeMutation.isPending}
                  className="btn-primary px-5 text-sm flex items-center gap-1.5"
                >
                  {(assignCommitteeMutation.isPending || assignDirectorCommitteeMutation.isPending) ? 'Updating...' : 'Save Nominees'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCancelModal && (
        <CancelPOModal
          prId={pr.id}
          cancelType={cancelType}
          onClose={() => {
            setShowCancelModal(false);
            setCancelType(null);
          }}
          refetch={refetch}
          actionLoading={actionLoading}
          setActionLoading={setActionLoading}
        />
      )}
    </div>
  );
};
