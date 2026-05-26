import React from 'react';
import { Link } from 'react-router-dom';
import { Download, Check, ShieldAlert } from 'lucide-react';
import { PurchaseRequest, PR_STATUS_LABELS, PRStatus } from '../../types';

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
  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex items-start justify-between flex-wrap gap-4 bg-white p-5 border border-slate-200 rounded-md shadow-sm">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link to="/pr" className="text-[#1a3a6b] hover:underline text-sm font-semibold">← Back to List</Link>
            <a 
              href={`/api/pr/${pr.id}/print`} 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center gap-1 text-sm bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 px-3 py-1 rounded transition font-medium"
            >
              <Download size={14} /> Download Approval PDF
            </a>
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

        {(pr.faculty1 || pr.faculty2 || pr.faculty3) && (
          <div className="col-span-2 border-t border-slate-100 pt-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Purchase Committee</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-3 border border-slate-200 rounded">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Purchase Initiator</span>
                <p className="text-xs font-bold text-slate-800">{pr.initiator?.name || 'N/A'}</p>
                <p className="text-[10px] text-slate-500">{pr.initiator?.email || ''}</p>
              </div>
              {pr.faculty1 && (
                <div className="space-y-0.5 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Faculty Nominee 1</span>
                  <p className="text-xs font-bold text-slate-800">{pr.faculty1.name}</p>
                  <p className="text-[10px] text-slate-500">{pr.faculty1.email}</p>
                </div>
              )}
              {pr.faculty2 && (
                <div className="space-y-0.5 border-t md:border-t-0 md:border-l border-slate-200 pt-2 md:pt-0 md:pl-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Faculty Nominee 2</span>
                  <p className="text-xs font-bold text-slate-800">{pr.faculty2.name}</p>
                  <p className="text-[10px] text-slate-500">{pr.faculty2.email}</p>
                </div>
              )}
              {pr.faculty3 && (
                <div className="space-y-0.5 border-t md:border-t-0 md:border-l border-slate-200 pt-2 md:pt-0 md:pl-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Director Nominee</span>
                  <p className="text-xs font-bold text-slate-800">{pr.faculty3.name}</p>
                  <p className="text-[10px] text-slate-500">{pr.faculty3.email}</p>
                </div>
              )}
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
                <div className="text-sm font-semibold text-slate-800">₹{pr.emd.toLocaleString()}</div>
              </div>
            )}
            {pr.performance_security !== undefined && pr.performance_security !== null && (
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Performance Security</div>
                <div className="text-sm font-semibold text-slate-800">₹{pr.performance_security.toLocaleString()}</div>
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
    </div>
  );
};
