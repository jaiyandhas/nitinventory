import React, { useState } from 'react';
import {
  CheckCircle2, XCircle, RotateCcw, Trophy
} from 'lucide-react';
import { prApi } from '../../../services/api';
import { PurchaseRequest } from '../../../types';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../../utils/format';

interface FinancialSanctionActionProps {
  pr: PurchaseRequest;
  user: any;
  refetch: () => void;
  actionLoading: boolean;
  setActionLoading: (loading: boolean) => void;
  hasPrevStep: boolean;
  isLastStep: boolean;
  onReject: (remarks: string) => Promise<void>;
  onSendBack: (remarks: string) => Promise<void>;
  showSendBackModal: boolean;
  setShowSendBackModal: (show: boolean) => void;
  remarks: string;
  setRemarks: (val: string) => void;
}

export const FinancialSanctionAction: React.FC<FinancialSanctionActionProps> = ({
  pr,
  user,
  refetch,
  actionLoading,
  setActionLoading,
  hasPrevStep,
  isLastStep,
  onReject,
  showSendBackModal,
  setShowSendBackModal,
  remarks,
  setRemarks
}) => {
  const [selectedBidId, setSelectedBidId] = useState<string>(() => {
    const awarded = pr.financial_evaluations?.find(fe => fe.is_awarded);
    return awarded ? String(awarded.id) : '';
  });

  const isInitiator = user?.id === pr.initiator_id;
  const hasAwardedBid = pr.financial_evaluations?.some(fe => fe.is_awarded);

  // Qualified vendors from initiator's final technical_evaluations (member_id = null)
  const finalTechEvals = (pr.technical_evaluations ?? []).filter((te: any) => te.member_id === null || te.member_id === undefined);
  const qualifiedNames = finalTechEvals.filter((te: any) => te.is_qualified).map((te: any) => te.vendor_name);

  // Financial bids filtered to qualified vendors only, ranked by amount ascending
  const rankedBids = (pr.financial_evaluations ?? [])
    .filter(fe => qualifiedNames.length === 0 || qualifiedNames.includes(fe.vendor_name))
    .sort((a, b) => a.quoted_amount - b.quoted_amount)
    .map((fe, idx) => ({ ...fe, rank: `L${idx + 1}` }));

  const handleAdvance = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required to approve and advance'); return; }
    if (!window.confirm('Are you sure you want to approve and advance this purchase indent?')) return;
    setActionLoading(true);
    try {
      await prApi.advance(pr.id, remarks);
      toast.success('Purchase Indent advanced successfully');
      setRemarks('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleInitiatorConfirm = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required'); return; }
    if (!selectedBidId) { toast.error('Please select the vendor to award the bid'); return; }
    if (!window.confirm('Confirm selected vendor and advance to next approval step?')) return;
    setActionLoading(true);
    try {
      await prApi.awardBid(pr.id, parseInt(selectedBidId), remarks);
      // Only advance if the current step is the purchase initiator's step (faculty's own step).
      // If the PR has already moved to the next step (e.g., HOD), skip advance to avoid 403.
      if (pr.flow?.step_type === 'purchase_initiator' || pr.flow?.expected_group === 'faculty') {
        await prApi.advance(pr.id, remarks);
        toast.success('Vendor selected and advanced successfully');
      } else {
        toast.success('Vendor selection saved');
      }
      setRemarks('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Initiator with financial bids + no bid awarded yet: show bid selection
  if (isInitiator && rankedBids.length > 0 && !hasAwardedBid) {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
          Financial Evaluation — Select Recommended Vendor
        </h4>
        <p className="text-xs text-slate-500">
          Vendors below are technically qualified and ranked by quoted amount. Select the recommended vendor (L1 preferred) to proceed.
        </p>

        <div className="space-y-2">
          {rankedBids.map(fe => {
            const isL1 = fe.rank === 'L1';
            const isL2 = fe.rank === 'L2';
            return (
              <label key={fe.id}
                className={`flex items-center justify-between p-3 border rounded cursor-pointer transition-all hover:bg-slate-50 ${
                  selectedBidId === String(fe.id)
                    ? 'border-blue-500 bg-blue-50/30'
                    : isL1 ? 'border-green-200 bg-green-50/10'
                    : isL2 ? 'border-yellow-200 bg-yellow-50/10'
                    : 'border-slate-200'
                }`}>
                <div className="flex items-center gap-3">
                  <input type="radio" name="awarded_vendor" value={fe.id}
                    checked={selectedBidId === String(fe.id)}
                    onChange={e => setSelectedBidId(e.target.value)}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                  <div>
                    <span className="text-sm font-bold text-slate-800">{fe.vendor_name}</span>
                    <span className="ml-2 text-xs font-semibold text-[#1a3a6b]">{formatCurrency(fe.quoted_amount)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isL1 && <Trophy size={13} className="text-green-600" />}
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    isL1 ? 'bg-green-100 text-green-800'
                    : isL2 ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-slate-100 text-slate-600'
                  }`}>
                    {fe.rank}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <label className="label text-slate-700 font-bold text-xs">Remarks / Justification *</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder="Provide justification for vendor selection..."
            className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm" required />
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button onClick={handleInitiatorConfirm}
            disabled={actionLoading || !remarks.trim() || !selectedBidId}
            className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs">
            <CheckCircle2 size={14} /> Confirm Vendor &amp; Advance
          </button>
          {isLastStep && (
            <button onClick={() => onReject(remarks)} disabled={actionLoading || !remarks.trim()}
              className="btn-danger flex items-center gap-1.5 text-xs py-2 px-4">
              <XCircle size={14} /> Reject
            </button>
          )}
          {hasPrevStep && (
            <button onClick={() => setShowSendBackModal(true)} disabled={actionLoading}
              className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition">
              <RotateCcw size={14} /> Send Back
            </button>
          )}
        </div>
      </div>
    );
  }

  // Standard approve & forward for other approvers (or initiator after bid already awarded)
  return (
    <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
        Approve &amp; Forward Financial Sanction
      </h4>

      {hasAwardedBid && (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-xs text-emerald-800 space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <Trophy size={13} className="text-emerald-600" /> Awarded Vendor
          </div>
          {pr.financial_evaluations?.filter(fe => fe.is_awarded).map(fe => (
            <div key={fe.id} className="flex gap-2">
              <span className="font-semibold">{fe.vendor_name}</span>
              <span className="text-emerald-700">{formatCurrency(fe.quoted_amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <label className="label text-slate-700 font-bold text-xs">Remarks *</label>
        <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
          placeholder="Provide financial sanction evaluation remarks..."
          className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm" required />
      </div>

      <div className="flex flex-wrap gap-2.5 pt-1">
        <button onClick={handleAdvance} disabled={actionLoading || !remarks.trim()}
          className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs">
          <CheckCircle2 size={14} /> Approve &amp; Forward
        </button>
        <button onClick={() => onReject(remarks)} disabled={actionLoading || !remarks.trim()}
          className="btn-danger flex items-center gap-1.5 text-xs py-2 px-4">
          <XCircle size={14} /> Reject
        </button>
        {hasPrevStep && (
          <button onClick={() => setShowSendBackModal(true)} disabled={actionLoading}
            className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition">
            <RotateCcw size={14} /> Send Back
          </button>
        )}
      </div>
    </div>
  );
};
