import React, { useState, useEffect } from 'react';
import {
  CheckCircle2, XCircle, RotateCcw, FileText, Clock, User
} from 'lucide-react';
import { prApi } from '../../../services/api';
import { PurchaseRequest } from '../../../types';
import toast from 'react-hot-toast';
import { resolveTechCommitteeIds, resolveTechCommitteeMember } from '../../../utils/techCommittee';

interface TechEvalActionProps {
  pr: PurchaseRequest;
  user: any;
  refetch: () => void;
  actionLoading: boolean;
  setActionLoading: (loading: boolean) => void;
  sendBackCandidates: any[];
  onReject: (remarks: string) => Promise<void>;
  onSendBack: (step: number, remarks: string) => Promise<void>;
  showSendBackModal: boolean;
  setShowSendBackModal: (show: boolean) => void;
  selectedSendBackStep: number | '';
  setSelectedSendBackStep: (step: number | '') => void;
  remarks: string;
  setRemarks: (val: string) => void;
}

export const TechEvalAction: React.FC<TechEvalActionProps> = ({
  pr,
  user,
  refetch,
  actionLoading,
  setActionLoading,
  sendBackCandidates,
  onReject,
  showSendBackModal,
  setShowSendBackModal,
  remarks,
  setRemarks
}) => {
  // Per-vendor state for committee member evaluation
  const [myVendorEvals, setMyVendorEvals] = useState<Record<string, { is_qualified: boolean; remarks: string }>>({});
  // Per-vendor state for initiator final confirmation
  const [finalVendorEvals, setFinalVendorEvals] = useState<Record<string, { is_qualified: boolean; remarks: string }>>({});
  const [techEvalPdf, setTechEvalPdf] = useState<File | null>(null);

  const since = pr.te_initiated_at ? new Date(pr.te_initiated_at) : null;

  const committeeIds = resolveTechCommitteeIds(pr);
  const isCommitteeMember = committeeIds.includes(user?.id ?? -1);
  const isInitiator = user?.id === pr.initiator_id;

  const hasUserSigned = pr.history?.some((h: any) =>
    h.approver_id === user?.id &&
    (h.status === 'Technical Evaluation Completed' || h.status === 'Technical Evaluation Approved') &&
    (!since || !h.acted_at || new Date(h.acted_at) >= since)
  );

  const userTechEvalDocKey = `tech_eval_doc_${user?.id}`;
  const userTechEvalDoc = pr.documents?.find((d: any) => d.doc_key === userTechEvalDocKey);

  // Build committee progress
  const committeeProgress = (() => {
    const expert1Id = resolveTechCommitteeMember(pr, 'expert1');
    const expert2Id = resolveTechCommitteeMember(pr, 'expert2');
    const directorId = resolveTechCommitteeMember(pr, 'director');
    
    const allMembersList = [
      { id: expert1Id, name: pr.faculty1?.name || pr.budget_file?.expert1?.name || 'Expert 1', email: pr.faculty1?.email, roleLabel: 'Expert Nominated by HOD 1' },
      { id: expert2Id, name: pr.faculty2?.name || pr.budget_file?.expert2?.name || 'Expert 2', email: pr.faculty2?.email, roleLabel: 'Expert Nominated by HOD 2' },
      { id: directorId, name: pr.faculty3?.name || pr.budget_file?.director_faculty?.name || 'Director Nominated Faculty', email: pr.faculty3?.email, roleLabel: 'Faculty Nominated by Director' },
    ];

    const members = committeeIds.map(id => {
      const found = allMembersList.find(m => m.id === id);
      return found || { id, name: `Committee Member ${id}`, roleLabel: 'Committee Member' };
    });

    return members.map(m => ({
      ...m,
      hasSigned: pr.history?.some((h: any) =>
        h.approver_id === m.id &&
        (h.status === 'Technical Evaluation Completed' || h.status === 'Technical Evaluation Approved') &&
        (!since || !h.acted_at || new Date(h.acted_at) >= since)
      ) ?? false,
    }));
  })();

  const allCommitteeSigned = committeeProgress.length > 0 && committeeProgress.every(m => m.hasSigned);

  // Get vendors from commercial_evaluations (names only, no amounts)
  const vendors = (pr.commercial_evaluations ?? []).map((ce: any) => ce.vendor_name);

  // Initialize my evaluation state when vendors load
  useEffect(() => {
    if (vendors.length > 0 && Object.keys(myVendorEvals).length === 0) {
      const init: Record<string, { is_qualified: boolean; remarks: string }> = {};
      vendors.forEach(name => { init[name] = { is_qualified: true, remarks: '' }; });
      setMyVendorEvals(init);
    }
  }, [vendors.join(',')]);

  // Initialize final eval state from consolidated committee evaluations for initiator
  useEffect(() => {
    if (allCommitteeSigned && vendors.length > 0 && Object.keys(finalVendorEvals).length === 0) {
      const init: Record<string, { is_qualified: boolean; remarks: string }> = {};
      vendors.forEach(name => {
        // Default: qualified if any committee member said qualified (majority-friendly default)
        const memberEvals = (pr.technical_evaluations ?? []).filter((te: any) => te.vendor_name === name && te.member_id !== null);
        const qualifiedCount = memberEvals.filter((te: any) => te.is_qualified).length;
        init[name] = { is_qualified: qualifiedCount > 0, remarks: '' };
      });
      setFinalVendorEvals(init);
    }
  }, [allCommitteeSigned, vendors.join(',')]);

  const handleCommitteeMemberSubmit = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required'); return; }
    if (!techEvalPdf && !userTechEvalDoc) {
      toast.error('Please upload your signed Technical Evaluation Report PDF');
      return;
    }
    if (vendors.length > 0 && Object.values(myVendorEvals).length === 0) {
      toast.error('Please evaluate all vendors before submitting');
      return;
    }
    if (!window.confirm('Submit your technical evaluation? This cannot be undone.')) return;

    const formData = new FormData();
    formData.append('payload', JSON.stringify({
      vendors: vendors.map(name => ({
        name,
        is_qualified: myVendorEvals[name]?.is_qualified ?? true,
        remarks: myVendorEvals[name]?.remarks ?? '',
      })),
      remarks,
    }));
    if (techEvalPdf) formData.append('tech_evaluation_document', techEvalPdf);

    setActionLoading(true);
    try {
      await prApi.addTechnicalEval(pr.id, formData);
      toast.success('Technical evaluation submitted successfully.');
      setRemarks('');
      setTechEvalPdf(null);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleInitiatorConfirm = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required'); return; }
    if (!window.confirm('Confirm final vendor qualifications and advance to next approval step?')) return;

    setActionLoading(true);
    try {
      await prApi.advance(pr.id, remarks, {
        vendors: vendors.map(name => ({
          name,
          is_qualified: finalVendorEvals[name]?.is_qualified ?? false,
          remarks: finalVendorEvals[name]?.remarks ?? '',
        })),
      });
      toast.success('Technical evaluation confirmed. Advanced to next step.');
      setRemarks('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Non-committee step: either step_type is verifier/approver (not tech_evaluation)
  // OR it's step_order > 1 after the committee sub-phase (all committees done).
  // This handles categories where the TE phase has no tech_evaluation step type at all.
  const isCommitteeStep = pr.flow?.step_type === 'tech_evaluation';
  if (pr.flow && (!isCommitteeStep || pr.flow.step_order > 1)) {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
          Approve &amp; Forward Technical Evaluation
        </h4>
        {committeeProgress.length > 0 && <CommitteeProgressPanel committeeProgress={committeeProgress} pr={pr} />}
        <div className="space-y-2">
          <label className="label text-slate-700 font-bold text-xs">Remarks *</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder="Provide technical evaluation review remarks..."
            className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm" required />
        </div>
        <div className="flex flex-wrap gap-2.5 pt-1">
          <button onClick={async () => {
            if (!remarks.trim()) { toast.error('Remarks required'); return; }
            if (!window.confirm('Approve and advance?')) return;
            setActionLoading(true);
            try { await prApi.advance(pr.id, remarks); toast.success('Advanced'); setRemarks(''); refetch(); }
            catch (e: any) { toast.error(e.response?.data?.detail || 'Action failed'); }
            finally { setActionLoading(false); }
          }} disabled={actionLoading || !remarks.trim()} className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs">
            <CheckCircle2 size={14} /> Approve &amp; Forward
          </button>
          <button onClick={() => onReject(remarks)} disabled={actionLoading || !remarks.trim()} className="btn-danger flex items-center gap-1.5 text-xs py-2 px-4">
            <XCircle size={14} /> Reject
          </button>
          {sendBackCandidates.length > 0 && (
            <button onClick={() => setShowSendBackModal(true)} disabled={actionLoading}
              className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition">
              <RotateCcw size={14} /> Send Back
            </button>
          )}
        </div>
      </div>
    );
  }

  // Initiator finalization after all committee members have signed.
  // Only applies when there IS a committee (committeeIds assigned) and it's a tech_evaluation step.
  if (isCommitteeStep && allCommitteeSigned && isInitiator) {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
          Technical Evaluation — Final Vendor Qualification
        </h4>
        <p className="text-xs text-slate-500">
          All committee members have submitted their evaluations. Review their findings below and confirm the final qualified / not-qualified status for each vendor.
        </p>

        {/* Committee member evaluations per vendor */}
        {vendors.length > 0 && (
          <div className="space-y-3">
            {vendors.map(vendorName => {
              const memberEvals = (pr.technical_evaluations ?? []).filter((te: any) => te.vendor_name === vendorName && te.member_id !== null);
              const finalState = finalVendorEvals[vendorName] ?? { is_qualified: true, remarks: '' };
              return (
                <div key={vendorName} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800">{vendorName}</span>
                  </div>
                  {/* Committee member opinions */}
                  <div className="p-3 space-y-2">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Committee Evaluations</div>
                    {memberEvals.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No evaluations recorded.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {memberEvals.map((te: any) => (
                          <div key={te.id} className={`flex items-start gap-2 p-2 rounded text-xs ${te.is_qualified ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
                            <User size={12} className="mt-0.5 shrink-0 text-slate-500" />
                            <div>
                              <span className="font-semibold text-slate-700">{te.member_name || `Member #${te.member_id}`}</span>
                              <span className={`ml-2 font-bold ${te.is_qualified ? 'text-emerald-700' : 'text-red-700'}`}>
                                {te.is_qualified ? '✓ Qualified' : '✗ Not Qualified'}
                              </span>
                              {te.remarks && <p className="text-slate-500 mt-0.5">{te.remarks}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Final determination */}
                    <div className="border-t border-slate-100 pt-2 space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Your Final Decision</div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name={`final-${vendorName}`} checked={finalState.is_qualified}
                            onChange={() => setFinalVendorEvals(p => ({ ...p, [vendorName]: { ...finalState, is_qualified: true } }))}
                            className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-xs font-semibold text-emerald-700">Qualified</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name={`final-${vendorName}`} checked={!finalState.is_qualified}
                            onChange={() => setFinalVendorEvals(p => ({ ...p, [vendorName]: { ...finalState, is_qualified: false } }))}
                            className="w-3.5 h-3.5 text-red-600" />
                          <span className="text-xs font-semibold text-red-700">Not Qualified</span>
                        </label>
                      </div>
                      <input type="text" value={finalState.remarks}
                        onChange={e => setFinalVendorEvals(p => ({ ...p, [vendorName]: { ...finalState, remarks: e.target.value } }))}
                        placeholder="Remarks (optional)"
                        className="input-field py-1 text-xs w-full" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <label className="label text-slate-700 font-bold text-xs">Overall Remarks *</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder="Overall technical evaluation summary remarks..."
            className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm" required />
        </div>
        <div className="flex flex-wrap gap-2.5 pt-1">
          <button onClick={handleInitiatorConfirm} disabled={actionLoading || !remarks.trim()}
            className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs">
            <CheckCircle2 size={14} /> Confirm &amp; Advance
          </button>
          <button onClick={() => onReject(remarks)} disabled={actionLoading || !remarks.trim()}
            className="btn-danger flex items-center gap-1.5 text-xs py-2 px-4">
            <XCircle size={14} /> Reject
          </button>
          {sendBackCandidates.length > 0 && (
            <button onClick={() => setShowSendBackModal(true)} disabled={actionLoading}
              className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition">
              <RotateCcw size={14} /> Send Back
            </button>
          )}
        </div>
      </div>
    );
  }

  // Committee member who has already signed: waiting status (only on tech_evaluation steps)
  if (isCommitteeStep && isCommitteeMember && hasUserSigned) {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Technical Committee Evaluation</h4>
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-4 space-y-2">
          <div className="font-semibold flex items-center gap-2 text-emerald-900 text-sm">
            <CheckCircle2 size={16} className="text-emerald-600" /> You have submitted your evaluation
          </div>
          <p className="text-xs text-emerald-700">
            {allCommitteeSigned
              ? 'All committee members have submitted. Waiting for the purchase initiator to confirm the final qualification list.'
              : 'Waiting for other committee members to submit their evaluations.'}
          </p>
          {userTechEvalDoc && (
            <div className="flex items-center gap-2 text-xs bg-white border border-emerald-100 rounded px-2 py-1.5 mt-1">
              <FileText size={13} className="text-emerald-600 shrink-0" />
              <span className="font-semibold text-slate-700">Your report:</span>
              <a href={userTechEvalDoc.path} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate font-semibold">
                {userTechEvalDoc.original_name}
              </a>
            </div>
          )}
        </div>
        <CommitteeProgressPanel committeeProgress={committeeProgress} pr={pr} />
      </div>
    );
  }

  // Committee member who hasn't signed yet: evaluation form (only on tech_evaluation steps)
  if (isCommitteeStep && isCommitteeMember && !hasUserSigned) {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
          Technical Committee — Submit Your Evaluation
        </h4>

        <CommitteeProgressPanel committeeProgress={committeeProgress} pr={pr} />

        {vendors.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-slate-200 rounded bg-slate-50 space-y-1">
            <p className="text-sm text-slate-500 italic">No vendors registered yet.</p>
            <p className="text-xs text-slate-400">Vendors must be registered in the Tendering phase first.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">
              Vendor Technical Qualification
            </div>
            {vendors.map(vendorName => {
              const state = myVendorEvals[vendorName] ?? { is_qualified: true, remarks: '' };
              return (
                <div key={vendorName} className="flex flex-col gap-2 bg-slate-50 p-3 border border-slate-100 rounded">
                  <div className="flex items-center gap-4">
                    <span className="w-1/3 text-sm font-bold text-slate-700 shrink-0">{vendorName}</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name={`qual-${vendorName}`} checked={state.is_qualified}
                        onChange={() => setMyVendorEvals(p => ({ ...p, [vendorName]: { ...state, is_qualified: true } }))}
                        className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-xs font-semibold text-emerald-700">Qualified</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name={`qual-${vendorName}`} checked={!state.is_qualified}
                        onChange={() => setMyVendorEvals(p => ({ ...p, [vendorName]: { ...state, is_qualified: false } }))}
                        className="w-3.5 h-3.5 text-red-600" />
                      <span className="text-xs font-semibold text-red-700">Not Qualified</span>
                    </label>
                  </div>
                  <input type="text" value={state.remarks}
                    onChange={e => setMyVendorEvals(p => ({ ...p, [vendorName]: { ...state, remarks: e.target.value } }))}
                    placeholder="Remarks on this vendor (optional)"
                    className="input-field py-1 text-xs" />
                </div>
              );
            })}
          </div>
        )}

        {/* PDF Upload */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
          <h5 className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
            <FileText size={14} className="text-amber-600" /> Technical Evaluation Report (PDF) *
          </h5>
          <p className="text-xs text-amber-700">Upload your individually signed Technical Evaluation Report before submitting.</p>
          {userTechEvalDoc && (
            <div className="flex items-center gap-2 text-xs bg-white border border-amber-100 rounded px-2 py-1.5">
              <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
              <span className="font-semibold text-slate-600">Currently saved:</span>
              <a href={userTechEvalDoc.path} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate font-semibold">
                {userTechEvalDoc.original_name}
              </a>
            </div>
          )}
          <input id="tech-eval-pdf" type="file" accept=".pdf,application/pdf"
            onChange={e => setTechEvalPdf(e.target.files?.[0] || null)}
            className="input-field mt-1 text-sm bg-white" required={!userTechEvalDoc} />
          {techEvalPdf && (
            <p className="text-xs text-emerald-700 flex items-center gap-1">
              <CheckCircle2 size={12} /> Selected: <span className="font-semibold">{techEvalPdf.name}</span>
            </p>
          )}
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-2">
          <label className="label text-slate-700 font-bold text-xs">Remarks *</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder="Provide your technical evaluation remarks / justification..."
            className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm" required />
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button onClick={handleCommitteeMemberSubmit}
            disabled={actionLoading || !remarks.trim() || (!techEvalPdf && !userTechEvalDoc)}
            className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs">
            <CheckCircle2 size={14} /> Submit My Technical Evaluation
          </button>
          <button onClick={() => onReject(remarks)} disabled={actionLoading || !remarks.trim()}
            className="btn-danger flex items-center gap-1.5 text-xs py-2 px-4">
            <XCircle size={14} /> Reject
          </button>
        </div>
      </div>
    );
  }

  // Observer at a tech_evaluation step (initiator waiting for committee, or non-committee user)
  if (isCommitteeStep) {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Technical Evaluation</h4>
        <div className="bg-slate-50 border border-slate-200 text-slate-600 rounded-lg p-3.5 text-xs font-semibold flex items-center gap-2">
          <Clock size={14} className="text-slate-400" />
          {allCommitteeSigned
            ? 'All committee members have submitted. Waiting for purchase initiator to confirm final qualification list.'
            : 'Waiting for technical evaluation committee members to submit their reports.'}
        </div>
        <CommitteeProgressPanel committeeProgress={committeeProgress} pr={pr} />
      </div>
    );
  }

  // Fallback: non-committee TE phase with no recognized step (should not reach here after guards above)
  return null;
};

// Shared committee progress display
const CommitteeProgressPanel: React.FC<{ committeeProgress: any[]; pr: PurchaseRequest }> = ({ committeeProgress, pr }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 shadow-xs">
    <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
      <CheckCircle2 size={14} className="text-blue-600" /> Committee Evaluation Progress
    </h5>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {committeeProgress.map(m => {
        const memberDoc = pr.documents?.find((d: any) => d.doc_key === `tech_eval_doc_${m.id}`);
        return (
          <div key={m.id} className={`flex items-center justify-between p-2.5 rounded-lg border bg-white transition-all ${m.hasSigned ? 'border-emerald-200 bg-emerald-50/10' : 'border-slate-200'}`}>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-800">{m.name}</span>
              <span className="text-xs text-slate-500">{m.roleLabel}</span>
              {memberDoc && (
                <a href={memberDoc.path} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold text-xs mt-1 flex items-center gap-1">
                  <FileText size={12} /> View Report
                </a>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {m.hasSigned ? (
                <>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">Submitted</span>
                  <CheckCircle2 size={16} className="text-emerald-600" />
                </>
              ) : (
                <>
                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 animate-pulse">Pending</span>
                  <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
