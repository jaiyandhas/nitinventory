import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Check, ShieldAlert, Settings, Users, Award, X } from 'lucide-react';
import { PurchaseRequest, PR_STATUS_LABELS, PRStatus } from '../../types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetApi } from '../../services/api';
import toast from 'react-hot-toast';

interface PRHeaderProps {
  pr: PurchaseRequest;
  user: any;
  isAdmin: boolean;
  adminRoles: any[];
  adminUsers: any[];
  adminDepts: any[];
  updateWfMutation: any;
  formatCurrency: (n?: number) => string;
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
}) => {
  const queryClient = useQueryClient();
  const [showNominationModal, setShowNominationModal] = useState(false);
  const [showPrintDropdown, setShowPrintDropdown] = useState(false);
  const [expert1Id, setExpert1Id] = useState<number | ''>('');

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

  // HOD department faculties
  const { data: deptFaculties = [] } = useQuery<any[]>({
    queryKey: ['departmentFaculty'],
    queryFn: () => budgetApi.departmentFaculty().then(r => r.data),
    enabled: !!isHOD,
  });

  // Director nominee options (all users)
  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ['all_users_for_director_nomination'],
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
    mutationFn: ({ budgetId, expert1_id, expert2_id }: { budgetId: number; expert1_id: number | null; expert2_id: number | null }) =>
      budgetApi.assignCommittee(budgetId, { expert1_id, expert2_id }),
    onSuccess: () => {
      toast.success('Technical committee experts updated successfully');
      setShowNominationModal(false);
      queryClient.invalidateQueries({ queryKey: ['pr', pr.id] });
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
      setShowNominationModal(false);
      queryClient.invalidateQueries({ queryKey: ['pr', pr.id] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update director nominee');
    }
  });

  const handleNominateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pr.budget_file) return;

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
        budgetId: pr.budget_file.id,
        expert1_id: Number(expert1Id),
        expert2_id: Number(expert2Id)
      });
    } else if (isDirector) {
      if (!directorFacultyId) {
        toast.error('Director nominee must be selected');
        return;
      }
      assignDirectorCommitteeMutation.mutate({
        budgetId: pr.budget_file.id,
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
                    <div className="p-2">
                      <a
                        href={`/api/pr/${pr.id}/print`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShowPrintDropdown(false)}
                        className="group flex items-center px-3 py-2 text-xs font-bold text-[#1a3a6b] hover:bg-[#1a3a6b]/5 rounded transition-colors"
                      >
                        Default Purchase Request PDF
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
          </div>
          <h1 className="text-xl font-bold text-slate-800 uppercase">{pr.icr_number || `PR #${pr.id}`}</h1>
          <p className="text-sm font-medium text-slate-600 mt-1">
            {pr.category?.title} · {pr.procurement?.name}
            {pr.category?.requirement_type && ` · Nature of Requirement: ${pr.category.requirement_type}`}
          </p>
        </div>
        <span className="status-badge border-slate-300 bg-slate-100 text-slate-800 px-3 py-1 text-sm shadow-sm">
          {PR_STATUS_LABELS[pr.current_status as PRStatus] || pr.current_status.toUpperCase()}
        </span>
      </div>

      {/* Metadata Cards */}
      <div className="card p-6 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Amount</div>
          <div className="text-lg font-bold text-[#1a3a6b]">{formatCurrency(pr.amount)}</div>
        </div>
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Purchase Type</div>
          <div className="text-sm font-medium text-slate-800 capitalize">{pr.purchase_type}</div>
        </div>
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Initiator</div>
          <div className="text-sm font-medium text-slate-800">{pr.initiator?.name}</div>
        </div>
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Created</div>
          <div className="text-sm font-medium text-slate-800">{new Date(pr.created_at).toLocaleDateString()}</div>
        </div>
        
        {pr.flow && (
          <div className="col-span-2 border-t border-slate-100 pt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Workflow Stage</div>
            <div className="text-sm font-bold text-blue-800">
              Phase {pr.flow.phase_id}: {pr.flow.phase_name || 'N/A'} (Step {pr.flow.step_order})
            </div>
            <div className="text-xs font-medium text-slate-500 mt-1 flex flex-wrap items-center gap-1.5">
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
                      const tag = val.substring(4);
                      updateWfMutation.mutate({ id: stepId, data: { user_type: tag } });
                    } else if (val.startsWith('user:')) {
                      const userId = Number(val.substring(5));
                      updateWfMutation.mutate({ id: stepId, data: { user_id: userId, user_type: 'user' } });
                    } else if (val.startsWith('role:')) {
                      const roleId = Number(val.substring(5));
                      updateWfMutation.mutate({ id: stepId, data: { role_id: roleId, user_type: 'group' } });
                    } else if (val.startsWith('group:')) {
                      const groupKey = val.substring(6);
                      updateWfMutation.mutate({ id: stepId, data: { user_group: groupKey, user_type: 'group' } });
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
                    {adminRoles.map((r: any) => (
                      <option key={r.id} value={`role:${r.id}`}>
                        {r.name}
                      </option>
                    ))}
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
                    {adminUsers.map((u: any) => (
                      <option key={u.id} value={`user:${u.id}`}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </optgroup>
                </select>
              ) : (
                <span className="font-semibold text-slate-700">
                  {pr.flow.expected_user_name
                    ? `${pr.flow.expected_user_name} (User)`
                    : pr.flow.expected_role_name || pr.flow.expected_group || 'N/A'}
                </span>
              )}
            </div>
          </div>
        )}

        {pr.assignments && pr.assignments.length > 0 && (
          <div className="col-span-2 border-t border-slate-100 pt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Dealing Assistant Assignments</div>
            <div className="space-y-1 mt-1">
              {pr.assignments.map(a => (
                <div key={a.id} className="text-sm text-slate-700 font-medium flex items-center gap-2">
                  <Check size={14} className="text-green-600" />
                  <span>{a.assigned_da_name || 'N/A'}</span>
                  <span className="text-xs text-slate-500">({a.status})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {pr.budget_file && (
          <div className="col-span-2 border-t border-slate-100 pt-4">
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Purchase Committee</div>
              {((isHOD || isDirector) && pr.flow?.phase_name === "Administrative Approval") && (
                <button
                  onClick={() => setShowNominationModal(true)}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded transition-colors"
                >
                  <Settings size={12} className="text-indigo-600" /> Configure Nominees
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-3 border border-slate-200 rounded">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Purchase Initiator</span>
                <p className="text-xs font-bold text-slate-800">{pr.initiator?.name || 'N/A'}</p>
                <p className="text-[10px] text-slate-500">{pr.initiator?.email || ''}</p>
              </div>
              <div className="space-y-0.5 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Faculty Nominee 1 (HOD)</span>
                {pr.faculty1 ? (
                  <>
                    <p className="text-xs font-bold text-slate-800">{pr.faculty1.name}</p>
                    <p className="text-[10px] text-slate-500">{pr.faculty1.email}</p>
                  </>
                ) : (
                  <p className="text-xs text-rose-500 italic font-medium">Not nominated</p>
                )}
              </div>
              <div className="space-y-0.5 border-t md:border-t-0 md:border-l border-slate-200 pt-2 md:pt-0 md:pl-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Faculty Nominee 2 (HOD)</span>
                {pr.faculty2 ? (
                  <>
                    <p className="text-xs font-bold text-slate-800">{pr.faculty2.name}</p>
                    <p className="text-[10px] text-slate-500">{pr.faculty2.email}</p>
                  </>
                ) : (
                  <p className="text-xs text-rose-500 italic font-medium">Not nominated</p>
                )}
              </div>
              <div className="space-y-0.5 border-t md:border-t-0 md:border-l border-slate-200 pt-2 md:pt-0 md:pl-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Director Nominee</span>
                {pr.faculty3 ? (
                  <>
                    <p className="text-xs font-bold text-slate-800">{pr.faculty3.name}</p>
                    <p className="text-[10px] text-slate-500">{pr.faculty3.email}</p>
                  </>
                ) : (
                  <p className="text-xs text-rose-500 italic font-medium">Not nominated</p>
                )}
              </div>
            </div>
          </div>
        )}

        {pr.documents && pr.documents.length > 0 && (
          <div className="col-span-2 border-t border-slate-100 pt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Users size={12} className="text-slate-400" /> Uploaded Committee Reports &amp; Attachments
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pr.documents.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Download size={14} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 block truncate" title={doc.original_name}>
                        {doc.original_name}
                      </span>
                      <span className="text-[9px] font-semibold text-slate-400 block uppercase">
                        {doc.doc_key.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <a
                    href={doc.path}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold shrink-0 ml-4 hover:underline"
                  >
                    View File
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {pr.tender_reference_number && (
          <div className="col-span-2 border-t border-slate-100 pt-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tender Ref Number</div>
              <div className="text-sm font-bold text-slate-800">{pr.tender_reference_number}</div>
            </div>
            {pr.vendor_list_link && (
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Vendor List link</div>
                <a href={pr.vendor_list_link} target="_blank" rel="noreferrer" className="text-blue-600 text-sm hover:underline font-medium">View Vendor Link</a>
              </div>
            )}
            {pr.date_of_tender && (
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Date of Tender</div>
                <div className="text-sm text-slate-700">{new Date(pr.date_of_tender).toLocaleDateString()}</div>
              </div>
            )}
            {pr.date_of_tech_bid_opening && (
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tech Bid Opening</div>
                <div className="text-sm text-slate-700">{new Date(pr.date_of_tech_bid_opening).toLocaleDateString()}</div>
              </div>
            )}
            {pr.date_of_financial_bid_opening && (
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Financial Bid Opening</div>
                <div className="text-sm text-slate-700">{new Date(pr.date_of_financial_bid_opening).toLocaleDateString()}</div>
              </div>
            )}
          </div>
        )}

        {(pr.emd !== undefined || pr.performance_security !== undefined || pr.exemption || pr.is_item_split || pr.is_quantity_split) && (
          <div className="col-span-2 border-t border-slate-100 pt-4 grid grid-cols-2 gap-4">
            {pr.emd !== undefined && pr.emd !== null && (
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">EMD (Earnest Money Deposit)</div>
                <div className="text-sm font-semibold text-slate-800">{pr.emd}%</div>
              </div>
            )}
            {pr.performance_security !== undefined && pr.performance_security !== null && (
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Performance Security</div>
                <div className="text-sm font-semibold text-slate-800">{pr.performance_security}%</div>
              </div>
            )}
            {pr.exemption && (
              <div className="col-span-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Proprietary / Exemption Details</div>
                <div className="text-sm text-slate-700 bg-orange-50/50 p-2.5 border border-orange-100 rounded">
                  <span className="font-bold text-orange-800">Exempted:</span> {pr.exemption_remarks || 'No remarks provided'}
                </div>
              </div>
            )}
            {(pr.is_item_split || pr.is_quantity_split) && (
              <div className="col-span-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Split Details</div>
                <div className="text-sm text-slate-700 bg-slate-50 p-2.5 border border-slate-200 rounded space-y-1">
                  {pr.is_item_split && <div><span className="font-bold">Item Split:</span> {pr.item_split_justification || 'Yes'}</div>}
                  {pr.is_quantity_split && <div><span className="font-bold">Quantity Split:</span> {pr.quantity_split_details || 'Yes'}</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {(pr.delivery_location || pr.delivery_mode || pr.basis_of_estimate) && (
          <div className="col-span-2 border-t border-slate-100 pt-4 grid grid-cols-2 gap-4">
            {pr.delivery_location && (
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Delivery Location</div>
                <div className="text-sm font-semibold text-slate-800">{pr.delivery_location}</div>
              </div>
            )}
            {pr.delivery_mode && (
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Delivery Mode</div>
                <div className="text-sm font-semibold text-slate-800">{pr.delivery_mode}</div>
              </div>
            )}
            {pr.basis_of_estimate && (
              <div className="col-span-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Basis of Estimate</div>
                <div className="text-sm text-slate-700 bg-slate-50 p-2.5 border border-slate-200 rounded">{pr.basis_of_estimate}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nomination / Committee Edit Modal */}
      {showNominationModal && pr.budget_file && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 text-left">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-fadeIn">
            <div className="px-6 py-4 border-b border-slate-200 bg-[#1a3a6b] text-white flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">Configure Purchase Committee</h2>
                <p className="text-xs text-blue-200 mt-1">Budget File: {pr.budget_file.file_no}</p>
              </div>
              <button 
                type="button"
                onClick={() => setShowNominationModal(false)}
                className="text-white hover:text-slate-200 text-xl font-bold"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleNominateSubmit} className="p-6 space-y-4">
              {isHOD && (
                <>
                  <div className="p-3 bg-indigo-50 text-indigo-800 text-xs font-semibold rounded border border-indigo-200 leading-relaxed mb-2">
                    As HOD, configure the two department experts who will serve on the 5-member purchase committee for technical evaluation.
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Department Expert 1 <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={expert1Id}
                      onChange={e => setExpert1Id(e.target.value === '' ? '' : Number(e.target.value))}
                      required
                      className="input-field w-full bg-white text-sm"
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
                      value={expert2Id}
                      onChange={e => setExpert2Id(e.target.value === '' ? '' : Number(e.target.value))}
                      required
                      className="input-field w-full bg-white text-sm"
                    >
                      <option value="">Select Faculty Expert...</option>
                      {deptFaculties.map((f: any) => (
                        <option key={f.id} value={f.id}>{f.name} ({f.email})</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {isDirector && (
                <>
                  <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded border border-emerald-200 leading-relaxed mb-2">
                    As Director / Admin, configure the Director Nominee who will serve on the 5-member purchase committee for technical evaluation.
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Director Nominee <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={directorFacultyId}
                      onChange={e => setDirectorFacultyId(e.target.value === '' ? '' : Number(e.target.value))}
                      required
                      className="input-field w-full bg-white text-sm"
                    >
                      <option value="">Select Director Nominee...</option>
                      {allUsers.map((u: any) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                      ))}
                    </select>
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
    </div>
  );
};
