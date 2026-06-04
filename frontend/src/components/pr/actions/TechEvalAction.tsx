import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, XCircle, RotateCcw, FileText, Clock
} from 'lucide-react';
import { prApi } from '../../../services/api';
import { PurchaseRequest } from '../../../types';
import toast from 'react-hot-toast';

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
  onSendBack,
  showSendBackModal,
  setShowSendBackModal,
  selectedSendBackStep,
  setSelectedSendBackStep,
  remarks,
  setRemarks
}) => {
  const [techQualifications, setTechQualifications] = useState<Record<string, { is_qualified: boolean; remarks: string }>>({});
  const [selectedAwardedVendorId, setSelectedAwardedVendorId] = useState<string>('');
  const [techEvalPdf, setTechEvalPdf] = useState<File | null>(null);

  const since = pr.te_initiated_at ? new Date(pr.te_initiated_at) : null;
  const hasUserSigned = pr.history?.some((h: any) => 
    h.approver_id === user?.id && 
    (h.status === 'Technical Evaluation Completed' || h.status === 'Technical Evaluation Approved') &&
    (!since || !h.acted_at || new Date(h.acted_at) >= since)
  );

  const isCommitteeMember = [
    pr.initiator_id,
    pr.faculty1_id,
    pr.faculty2_id,
    pr.faculty3_id,
  ].filter(Boolean).includes(user?.id);

  const userTechEvalDocKey = `tech_eval_doc_${user?.id}`;
  const userTechEvalDoc = pr.documents?.find((d: any) => d.doc_key === userTechEvalDocKey);

  const committeeProgress = (() => {
    const rawMembers = [
      { id: pr.initiator_id, name: pr.initiator?.name || 'Purchase Initiator', email: pr.initiator?.email, roleLabel: 'Purchase Initiator' },
      { id: pr.faculty1_id, name: pr.faculty1?.name || 'Expert 1', email: pr.faculty1?.email, roleLabel: 'Expert Nominated by HOD 1' },
      { id: pr.faculty2_id, name: pr.faculty2?.name || 'Expert 2', email: pr.faculty2?.email, roleLabel: 'Expert Nominated by HOD 2' },
      { id: pr.faculty3_id, name: pr.faculty3?.name || 'Director Nominated Faculty', email: pr.faculty3?.email, roleLabel: 'Faculty Nominated by Director' },
    ].filter(m => m.id !== null && m.id !== undefined) as { id: number; name: string; email?: string; roleLabel: string }[];

    const members: typeof rawMembers = [];
    const seen = new Set<number>();
    for (const m of rawMembers) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        members.push(m);
      }
    }

    const sinceVal = pr.te_initiated_at ? new Date(pr.te_initiated_at) : null;

    return members.map(m => {
      const hasSigned = pr.history?.some((h: any) => 
        h.approver_id === m.id && 
        (h.status === 'Technical Evaluation Completed' || h.status === 'Technical Evaluation Approved') &&
        (!sinceVal || !h.acted_at || new Date(h.acted_at) >= sinceVal)
      );
      return { ...m, hasSigned };
    });
  })();

  const isMyTurnToSign = isCommitteeMember && !hasUserSigned;

  useEffect(() => {
    if (pr.commercial_evaluations) {
      const initialQuals: Record<string, { is_qualified: boolean; remarks: string }> = {};
      pr.commercial_evaluations.forEach(ce => {
        const existingTe = pr.technical_evaluations?.find(t => t.vendor_name === ce.vendor_name);
        initialQuals[ce.vendor_name] = { 
          is_qualified: existingTe ? existingTe.is_qualified : true, 
          remarks: existingTe ? existingTe.remarks || '' : '' 
        };
      });
      setTechQualifications(initialQuals);
      
      const awarded = pr.financial_evaluations?.find(f => f.is_awarded);
      if (awarded) {
        setSelectedAwardedVendorId(String(awarded.id));
      }
    }
  }, [pr]);

  const handleTechEvalSubmit = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required to submit the technical evaluation'); return; }

    if (!techEvalPdf && !userTechEvalDoc) {
      toast.error('Please upload your signed Technical Evaluation Report PDF');
      return;
    }

    if (pr.initiator_id === user?.id) {
      const hasFinancialBids = pr.financial_evaluations && pr.financial_evaluations.length > 0;
      const qualifiedNames = Object.entries(techQualifications)
        .filter(([_, q]) => q.is_qualified)
        .map(([name]) => name);

      if (hasFinancialBids && qualifiedNames.length > 0 && !selectedAwardedVendorId) {
        toast.error('Please select the recommended vendor to award the bid');
        return;
      }
    }

    if (!window.confirm('Are you sure you want to submit your Technical Evaluation?')) return;

    const formattedVendors = pr.initiator_id === user?.id
      ? Object.entries(techQualifications).map(([name, data]) => ({
          name,
          is_qualified: data.is_qualified,
          remarks: data.remarks
        }))
      : [];

    const formData = new FormData();
    formData.append('payload', JSON.stringify({
      vendors: formattedVendors,
      remarks,
    }));
    if (techEvalPdf) {
      formData.append('tech_evaluation_document', techEvalPdf);
    }

    setActionLoading(true);
    try {
      await prApi.addTechnicalEval(pr.id, formData);

      if (pr.initiator_id === user?.id && selectedAwardedVendorId) {
        await prApi.awardBid(pr.id, parseInt(selectedAwardedVendorId), remarks);
      }

      toast.success('Technical Evaluation submitted. Advancing workflow...');
      await prApi.advance(pr.id, remarks);
      setRemarks('');
      setTechEvalPdf(null);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (pr.flow && pr.flow.step_order > 1) {
    const handleAdvanceOnly = async () => {
      if (!remarks.trim()) { toast.error('Remarks are required to approve and advance'); return; }
      if (!window.confirm('Are you sure you want to approve and advance this purchase request?')) return;
      setActionLoading(true);
      try {
        await prApi.advance(pr.id, remarks);
        toast.success('PR advanced successfully');
        setRemarks('');
        refetch();
      } catch (e: any) {
        toast.error(e.response?.data?.detail || 'Action failed');
      } finally {
        setActionLoading(false);
      }
    };

    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide font-semibold">
          Approve &amp; Forward Technical Evaluation
        </h4>
        
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 shadow-xs mb-4">
          <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 font-bold">
            <CheckCircle2 size={14} className="text-blue-600" />
            Committee Evaluation Progress (All Signed)
          </h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {committeeProgress.map(m => (
              <div key={m.id} className="flex items-center justify-between p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/10 transition-all">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-800">{m.name}</span>
                  <span className="text-xs text-slate-500">{m.roleLabel}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">Submitted</span>
                  <CheckCircle2 size={16} className="text-emerald-600" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="label text-slate-700 font-bold text-xs">
            Remarks / Recommendation Comments *
          </label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Provide technical evaluation review remarks..."
            className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm"
            required
          />
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button 
            onClick={handleAdvanceOnly} 
            disabled={actionLoading || !remarks.trim()}
            className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs"
          >
            <CheckCircle2 size={14} /> Approve &amp; Forward
          </button>

          <button 
            onClick={() => onReject(remarks)} 
            disabled={actionLoading || !remarks.trim()} 
            className="btn-danger flex items-center gap-1.5 text-xs py-2 px-4"
          >
            <XCircle size={14} /> Reject
          </button>

          {pr.flow && pr.flow.step_order > 1 && sendBackCandidates.length > 0 && (
            <button 
              type="button"
              onClick={() => setShowSendBackModal(true)} 
              disabled={actionLoading} 
              className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition"
            >
              <RotateCcw size={14} /> Send Back
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left">
      <h4 className="text-sm font-bold text-[#1a3a6b] uppercase tracking-wide pb-2 border-b border-slate-100">
        Register Technical Qualification
      </h4>
      
      {!isCommitteeMember && (
        <div className="bg-slate-50 border border-slate-200 text-slate-600 rounded-lg p-3.5 text-xs font-semibold flex items-center gap-2">
          <Clock size={14} className="text-slate-400" />
          <span>
            Waiting for technical evaluation committee members to submit their report.
          </span>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 shadow-xs">
        <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
          <CheckCircle2 size={14} className="text-blue-600" />
          Committee Evaluation Progress
        </h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {committeeProgress.map(m => (
            <div key={m.id} className={`flex items-center justify-between p-2.5 rounded-lg border bg-white transition-all ${
              m.hasSigned ? 'border-emerald-200 bg-emerald-50/10' : 'border-slate-200 hover:border-slate-300'
            }`}>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-800">{m.name}</span>
                <span className="text-xs text-slate-500">{m.roleLabel}</span>
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
          ))}
        </div>
      </div>          
      
      {hasUserSigned ? (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-4 text-sm space-y-1">
          <div className="font-semibold flex items-center gap-2 text-emerald-900">
            <CheckCircle2 size={16} className="text-emerald-600" /> Technical Evaluation Submitted
          </div>
          <p className="text-xs text-emerald-700">
            You have successfully submitted your Technical Evaluation Report. Waiting for other committee members to sign.
          </p>
          {userTechEvalDoc && (
            <div className="mt-2 flex items-center gap-2 text-xs bg-white border border-emerald-100 rounded px-2 py-1.5">
              <FileText size={13} className="text-emerald-600 shrink-0" />
              <span className="font-semibold text-slate-700">Your uploaded report:</span>
              <a href={userTechEvalDoc.path} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate font-semibold">
                {userTechEvalDoc.original_name}
              </a>
            </div>
          )}
        </div>
      ) : !pr.commercial_evaluations || pr.commercial_evaluations.length === 0 ? (
        <div className="p-6 text-center border border-dashed border-slate-200 rounded bg-slate-50 space-y-2">
          <p className="text-sm text-slate-500 italic">No vendors exist yet in commercial bids.</p>
          <p className="text-xs text-slate-400">Please go back to the Tendering phase or add commercial vendors first.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
            <h5 className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
              <FileText size={14} className="text-amber-600" />
              Technical Evaluation Report (PDF) *
            </h5>
            <p className="text-xs text-amber-700">
              Each committee member must upload their individually signed Technical Evaluation Report before submitting.
            </p>
            {userTechEvalDoc && (
              <div className="flex items-center gap-2 text-xs bg-white border border-amber-100 rounded px-2 py-1.5">
                <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                <span className="font-semibold text-slate-600">Currently saved:</span>
                <a href={userTechEvalDoc.path} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate font-semibold">
                  {userTechEvalDoc.original_name}
                </a>
              </div>
            )}
            <div>
              <input
                id="tech-eval-pdf"
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => setTechEvalPdf(e.target.files?.[0] || null)}
                className="input-field mt-1 text-sm bg-white"
                required={!userTechEvalDoc}
              />
              {techEvalPdf && (
                <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Selected: <span className="font-semibold">{techEvalPdf.name}</span>
                </p>
              )}
            </div>
          </div>

          {pr.initiator_id === user?.id && (
            <div className="space-y-3">
              <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">
                Vendor Qualification Checklist
              </h5>
              {pr.commercial_evaluations.map(ce => {
                const state = techQualifications[ce.vendor_name] || { is_qualified: true, remarks: '' };
                return (
                  <div key={ce.id} className="flex gap-4 items-center bg-slate-50 p-3 border border-slate-100 rounded">
                    <div className="w-1/3 text-sm font-bold text-slate-700">{ce.vendor_name}</div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id={`tech-check-${ce.id}`}
                        checked={state.is_qualified}
                        onChange={(e) => setTechQualifications({
                          ...techQualifications,
                          [ce.vendor_name]: { ...state, is_qualified: e.target.checked }
                        })}
                        className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                      />
                      <label htmlFor={`tech-check-${ce.id}`} className="text-sm font-semibold text-slate-600 select-none">Technically Qualified</label>
                    </div>
                    <div className="flex-1">
                      <input 
                        type="text"
                        value={state.remarks}
                        onChange={(e) => setTechQualifications({
                          ...techQualifications,
                          [ce.vendor_name]: { ...state, remarks: e.target.value }
                        })}
                        className="input-field py-1"
                        placeholder="Remarks"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {pr.initiator_id === user?.id && Object.values(techQualifications).some(v => v.is_qualified) && pr.financial_evaluations && pr.financial_evaluations.length > 0 && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <label className="label text-slate-700 font-bold">Select Recommended Vendor (Award Bid) *</label>
              <div className="space-y-2">
                {(() => {
                  const qualifiedNames = Object.entries(techQualifications)
                    .filter(([_, q]) => q.is_qualified)
                    .map(([name]) => name);
                    
                  const qualifiedBids = pr.financial_evaluations
                    .filter(fe => qualifiedNames.includes(fe.vendor_name))
                    .sort((a, b) => a.quoted_amount - b.quoted_amount);
                    
                  return qualifiedBids.map((fe, idx) => {
                    const rank = `L${idx + 1}`;
                    const isL1 = rank === 'L1';
                    const isL2 = rank === 'L2';
                    
                    return (
                      <label 
                        key={fe.id}
                        className={`flex items-center justify-between p-3 border rounded cursor-pointer transition-all hover:bg-slate-50 ${
                          selectedAwardedVendorId === String(fe.id)
                            ? 'border-blue-500 bg-blue-50/30'
                            : isL1 ? 'border-green-200 bg-green-50/10' : isL2 ? 'border-yellow-200 bg-yellow-50/10' : 'border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input 
                            type="radio" 
                            name="awarded_vendor"
                            value={fe.id}
                            checked={selectedAwardedVendorId === String(fe.id)}
                            onChange={(e) => setSelectedAwardedVendorId(e.target.value)}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <span className="text-sm font-bold text-slate-800">{fe.vendor_name}</span>
                            <span className="ml-2 text-xs font-semibold text-[#1a3a6b]">₹{(fe.quoted_amount / 100000).toFixed(2)} Lakhs</span>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${isL1 ? 'bg-green-100 text-green-800' : isL2 ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-600'}`}>
                          Rank: {rank}
                        </span>
                      </label>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <label className="label text-slate-700 font-bold text-xs">Remarks / Justification *</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Provide technical evaluation remarks/justification..."
              className="input-field min-h-[60px] text-xs py-1.5"
              required
            />
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <button 
              onClick={handleTechEvalSubmit} 
              disabled={actionLoading || !isMyTurnToSign || (!techEvalPdf && !userTechEvalDoc) || !remarks.trim()}
              className={`btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs ${!isMyTurnToSign ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <CheckCircle2 size={14} /> Submit Technical Evaluation Report
            </button>

            <button 
              onClick={() => onReject(remarks)} 
              disabled={actionLoading || !isMyTurnToSign || !remarks.trim()} 
              className={`btn-danger flex items-center gap-1.5 text-xs py-2 px-4 ${!isMyTurnToSign ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <XCircle size={14} /> Reject
            </button>

            {pr.flow && pr.flow.step_order > 1 && sendBackCandidates.length > 0 && (
              <button 
                onClick={() => setShowSendBackModal(true)} 
                disabled={actionLoading || !isMyTurnToSign} 
                className={`btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition ${!isMyTurnToSign ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <RotateCcw size={14} /> Send Back
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
