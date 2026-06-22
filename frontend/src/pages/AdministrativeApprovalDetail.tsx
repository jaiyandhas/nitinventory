import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, AlertCircle, Edit, Send, FileText } from 'lucide-react';
import { aaApi, budgetApi } from '../services/api';
import { formatCurrency } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { AASummaryTable } from '../components/aa/detail/AASummaryTable';
import { SearchableSelect } from '../components/common/SearchableSelect';

export const AdministrativeApprovalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [remarks, setRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Editing states if returned to PI
  const [isEditing, setIsEditing] = useState(false);
  const [itemDescription, setItemDescription] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [gstRate, setGstRate] = useState<number>(18);
  const [modeOfProcurement, setModeOfProcurement] = useState('GeM');
  const [justification, setJustification] = useState('');
  const [editAttachmentFile, setEditAttachmentFile] = useState<File | null>(null);

  const aaId = Number(id);

  // Fetch AA details
  const { data: aa, isLoading, refetch } = useQuery({
    queryKey: ['administrative-approval-detail', aaId],
    queryFn: () => aaApi.get(aaId).then((r) => r.data),
    enabled: !isNaN(aaId),
  });

  const isHODPending = React.useMemo(() => {
    return aa?.pending_with?.toLowerCase() === 'hod';
  }, [aa]);

  // Check if current user can review
  const canReview = React.useMemo(() => {
    if (!aa || !user || !aa.pending_with) return false;
    const pending = aa.pending_with.toLowerCase().trim();
    const userRoleValue = (user.role?.value || '').toLowerCase().trim();
    const userGroupKey = (user.role?.group_key || '').toLowerCase().trim();
    const userRoleName = (user.role?.name || '').toLowerCase().trim();

    const normalize = (s: string) => s.replace(/[^a-z0-9]/g, '');

    const pendingNorm = normalize(pending);
    const roleValueNorm = normalize(userRoleValue);
    const groupKeyNorm = normalize(userGroupKey);
    const roleNameNorm = normalize(userRoleName);

    // If pending with Nominee
    if (pending.startsWith('nominee')) {
      const activeNom = aa.nominees?.find((n: any) => n.status === 'Pending');
      return activeNom && activeNom.nominee_id === user.id;
    }

    // HOD special check for department alignment
    if (pending === 'hod') {
      const isHodUser = userGroupKey === 'hod' || userRoleValue === 'hod' || roleNameNorm.includes('hod');
      return isHodUser && Number(user.department_id || user.department?.id) === Number(aa.budget_info?.department_id);
    }

    // Direct match
    if (
      pending === userRoleValue ||
      pending === userGroupKey ||
      pending === userRoleName ||
      pendingNorm === roleValueNorm ||
      pendingNorm === groupKeyNorm ||
      pendingNorm === roleNameNorm
    ) {
      return true;
    }

    // Alias checks
    if (pendingNorm.includes('dean')) {
      if (pendingNorm.includes('associate') || pendingNorm.includes('adpd')) {
        return roleValueNorm.includes('adpd') || roleNameNorm.includes('associatedean');
      } else {
        if (roleValueNorm.includes('adpd') || roleNameNorm.includes('associatedean')) {
          return false;
        }
        return roleValueNorm.includes('dean') || groupKeyNorm.includes('dean') || roleNameNorm.includes('dean');
      }
    }
    if (pendingNorm.includes('director') || pendingNorm.includes('apex')) {
      return (
        roleValueNorm.includes('director') ||
        groupKeyNorm.includes('director') ||
        roleNameNorm.includes('director') ||
        roleValueNorm.includes('apex') ||
        groupKeyNorm.includes('apex') ||
        roleNameNorm.includes('apex')
      );
    }
    if (pendingNorm === 'ia' || pendingNorm.includes('audit')) {
      return (
        roleValueNorm.includes('ia') ||
        groupKeyNorm.includes('ia') ||
        roleNameNorm.includes('ia') ||
        roleValueNorm.includes('audit') ||
        groupKeyNorm.includes('audit') ||
        roleNameNorm.includes('audit')
      );
    }

    return false;
  }, [aa, user]);

  const isReturnedToPI = aa?.status === 'Returned to PI' && aa?.pending_with?.toUpperCase() === 'PI' && user?.id === aa?.pi_id;

  // System Calculations during edit
  const calculatedValues = React.useMemo(() => {
    if (!aa) return { gstAmount: 0, totalCost: 0, baseCost: 0 };
    const baseCost = quantity * (aa.item_info.unit_cost || 0);
    const gstAmount = baseCost * (gstRate / 100);
    const totalCost = baseCost + gstAmount;
    return { gstAmount, totalCost, baseCost };
  }, [aa, quantity, gstRate]);

  const handleAction = async (action: 'Approve' | 'Send Back' | 'Reject') => {
    if (!remarks.trim()) {
      toast.error('Remarks are mandatory to perform an action.');
      return;
    }

    setActionLoading(true);
    try {
      await aaApi.action(aaId, action, remarks);
      toast.success(`Request ${action === 'Approve' ? 'approved' : action === 'Send Back' ? 'returned' : 'rejected'} successfully.`);
      setRemarks('');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['administrative-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-aas'] });
      queryClient.invalidateQueries({ queryKey: ['budget-overview'] });
      queryClient.invalidateQueries({ queryKey: ['budgetFiles'] });
      queryClient.invalidateQueries({ queryKey: ['prs'] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(detail || 'Failed to complete action.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemDescription.trim() || !justification.trim() || gstRate < 0 || quantity <= 0) {
      toast.error('Please fill in all mandatory fields correctly.');
      return;
    }

    setActionLoading(true);
    try {
      await aaApi.action(aaId, 'Approve', remarks || 'Resubmitted after correction', {
        quantity,
        item_description: itemDescription,
        gst_rate: gstRate,
        mode_of_procurement: modeOfProcurement,
        justification,
      });
      if (editAttachmentFile) {
        await aaApi.uploadAttachment(aaId, editAttachmentFile);
      }
      toast.success('Request resubmitted successfully.');
      setIsEditing(false);
      setEditAttachmentFile(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['administrative-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-aas'] });
      queryClient.invalidateQueries({ queryKey: ['budget-overview'] });
      queryClient.invalidateQueries({ queryKey: ['budgetFiles'] });
      queryClient.invalidateQueries({ queryKey: ['prs'] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(detail || 'Failed to resubmit.');
    } finally {
      setActionLoading(false);
    }
  };

  const startEditing = () => {
    if (!aa) return;
    setItemDescription(aa.item_info.item_description);
    setQuantity(aa.item_info.quantity || 1);
    setGstRate(aa.item_info.gst_rate);
    setModeOfProcurement(aa.procurement_info.mode_of_procurement);
    setJustification(aa.procurement_info.justification);
    setIsEditing(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 size={40} className="animate-spin text-[#1a3a6b]" />
      </div>
    );
  }

  if (!aa) {
    return (
      <div className="text-center py-10 text-slate-500 font-bold">
        Request not found.
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/administrative-approvals')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {aa.aa_number !== '-' ? aa.aa_number : `Admin Approval Request REQ-${aa.id}`}
            </h1>
            <p className="text-slate-500 text-sm">Detailed overview of administrative approval request.</p>
          </div>
        </div>
        
        {/* PDF Download Button */}
        <button
          onClick={() => {
            const absoluteUrl = `${window.location.origin}/api/administrative-approvals/${aa.id}/print`;
            window.open(absoluteUrl, '_blank');
          }}
          className="flex items-center gap-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg font-bold shadow transition-all shrink-0"
        >
          <FileText size={14} /> Download PDF Report
        </button>
      </div>

      {/* Completion Banner */}
      {aa.status === 'Administrative Approval Granted' && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800">
          <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
          <div>
            <h4 className="text-sm font-bold">Administrative Approval Granted</h4>
            <p className="text-xs text-emerald-600 font-medium mt-0.5">
              Director has approved the procurement request. Standard file number allocated: <span className="font-mono font-bold">{aa.aa_number}</span>
            </p>
          </div>
        </div>
      )}

      {/* Details Container */}
      <div className="max-w-4xl mx-auto space-y-6">
          {isEditing ? (
            <div className="card p-6 bg-white shadow rounded-lg border border-slate-200">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b pb-2 mb-4">
                Edit Returned Administrative Approval
              </h2>
              <form onSubmit={handleResubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-505 mb-1">Item Name</label>
                  <input
                    type="text"
                    value={aa.item_info.item_name}
                    disabled
                    className="w-full border border-slate-200 bg-slate-50 rounded-lg py-2 px-3 text-sm font-medium text-slate-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Item Description / Detailed Requirement <span className="text-rose-500">*</span></label>
                  <textarea
                    rows={3}
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity <span className="text-rose-500">*</span></label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={quantity || ''}
                      onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                      className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">GST (%) <span className="text-rose-500">*</span></label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={gstRate}
                      onChange={(e) => setGstRate(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Mode of Procurement <span className="text-rose-500">*</span></label>
                    <select
                      value={modeOfProcurement}
                      onChange={(e) => setModeOfProcurement(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]"
                      required
                    >
                      <option value="GeM">GeM</option>
                      <option value="Open Tender">Open Tender</option>
                      <option value="Limited Tender">Limited Tender</option>
                      <option value="Proprietary Purchase">Proprietary Purchase</option>
                      <option value="Single Tender">Single Tender</option>
                      <option value="Rate Contract">Rate Contract</option>
                      <option value="Local Purchase">Local Purchase</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block mb-1">GST Amount (Auto)</span>
                    <span className="font-bold text-slate-800 text-sm block pt-2">{formatCurrency(calculatedValues.gstAmount)}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block mb-1">Total Cost (Auto)</span>
                    <span className="font-bold text-[#1a3a6b] text-sm block pt-2">{formatCurrency(calculatedValues.totalCost)}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Justification for Purchase <span className="text-rose-500">*</span></label>
                  <textarea
                    rows={3}
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks for Resubmission (Optional)</label>
                  <input
                    type="text"
                    placeholder="E.g. Corrected details and resubmitted."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Upload New Supporting Document (Optional, replaces existing)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        const file = e.target.files[0];
                        if (file.size > 10 * 1024 * 1024) {
                          toast.error('File size must be under 10MB.');
                          e.target.value = '';
                        } else {
                          setEditAttachmentFile(file);
                        }
                      } else {
                        setEditAttachmentFile(null);
                      }
                    }}
                    className="w-full text-sm text-slate-505 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="btn-secondary py-1.5 px-4 rounded border text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="btn-primary py-1.5 px-6 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5"
                  >
                    <Send size={14} /> Resubmit Request
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              {isReturnedToPI && (
                <div className="flex justify-end">
                  <button
                    onClick={startEditing}
                    className="flex items-center gap-1.5 text-xs text-white bg-[#1a3a6b] hover:bg-[#1a3a6b]/95 px-4 py-2 rounded-lg font-bold shadow transition-all"
                  >
                    <Edit size={14} /> Correct & Edit Fields
                  </button>
                </div>
              )}
              <AASummaryTable aa={aa} formatCurrency={formatCurrency} />
            </div>
          )}

          {/* Approval Audit Trail */}
          {aa.history && aa.history.length > 0 && (
            <div className="card p-6 bg-white shadow rounded-lg border border-slate-200">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b pb-2 mb-4">
                Approval Audit Trail
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600 whitespace-nowrap">#</th>
                      <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600 whitespace-nowrap">Approver Name</th>
                      <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600 whitespace-nowrap">Designation / Role</th>
                      <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600 whitespace-nowrap">Action</th>
                      <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600">Remarks</th>
                      <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600 whitespace-nowrap">Date &amp; Time</th>
                      <th className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-600 whitespace-nowrap">Signature</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aa.history.map((h: any, idx: number) => (
                      <tr key={h.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="px-3 py-2 border border-slate-200 text-slate-400 text-center">{idx + 1}</td>
                        <td className="px-3 py-2 border border-slate-200 font-medium text-slate-800 whitespace-nowrap">{h.approver_name}</td>
                        <td className="px-3 py-2 border border-slate-200 text-slate-600">
                          <div className="font-medium">{h.approver_role}</div>
                          {h.designation && h.designation !== '-' && (
                            <div className="text-slate-400 text-xs">{h.designation}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 border border-slate-200 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded font-semibold text-xs ${
                            h.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                            h.status === 'Rejected' ? 'bg-rose-100 text-rose-800' :
                            h.status === 'Submitted' ? 'bg-blue-100 text-blue-800' :
                            h.status === 'Returned' ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>{h.status}</span>
                        </td>
                        <td className="px-3 py-2 border border-slate-200 text-slate-600 max-w-[220px] break-words">{h.remarks}</td>
                        <td className="px-3 py-2 border border-slate-200 text-slate-500 whitespace-nowrap">
                          {h.acted_at
                            ? new Date(h.acted_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                            : '—'}
                        </td>
                        <td className="px-3 py-2 border border-slate-200">
                          {h.signature_url ? (
                            <img
                              src={h.signature_url.startsWith('http') ? h.signature_url : `${window.location.origin}${h.signature_url}`}
                              alt="Signature"
                              className="h-8 max-w-[80px] object-contain"
                            />
                          ) : (
                            <span className="text-slate-400 italic">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400 mt-3 italic">This audit trail is immutable and cannot be modified once recorded.</p>
            </div>
          )}

          {/* Approver Action Panel */}
          {canReview && (
            <div className="card p-6 bg-amber-50 shadow rounded-lg border border-amber-300 space-y-4">
              <h2 className="text-sm font-bold text-amber-900 uppercase tracking-wider">
                Awaiting Your Decision
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks / Comments <span className="text-rose-500">*</span></label>
                  <textarea
                    rows={3}
                    placeholder="Enter approval details or return reasons here..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b] bg-white"
                    required
                  />
                </div>



                <div className="flex gap-3 items-center justify-end">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleAction('Send Back')}
                    className="py-2 px-4 rounded border border-amber-400 bg-white hover:bg-amber-100/50 text-amber-800 font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading ? 'Processing...' : 'Send Back'}
                  </button>
                  {(!aa.pending_with || aa.pending_with.toLowerCase() === 'director') && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleAction('Reject')}
                      className="py-2 px-4 rounded border border-rose-400 bg-rose-50 hover:bg-rose-100 text-rose-800 font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading ? 'Processing...' : 'Reject Procurement'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleAction('Approve')}
                    className="py-2 px-6 rounded bg-[#1a3a6b] hover:bg-[#1a3a6b]/95 text-white font-semibold text-sm shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {actionLoading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Approving...
                      </>
                    ) : (
                      'Approve Request'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};
