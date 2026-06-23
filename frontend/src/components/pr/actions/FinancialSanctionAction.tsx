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
  const isInitiator = user?.id === pr.initiator_id;
  const hasAwardedBid = pr.financial_evaluations?.some(fe => fe.is_awarded);

  // Qualified vendors from initiator's final technical_evaluations (member_id = null)
  const finalTechEvals = (pr.technical_evaluations ?? []).filter((te: any) => te.member_id === null || te.member_id === undefined);
  const qualifiedNames = finalTechEvals.filter((te: any) => te.is_qualified).map((te: any) => te.vendor_name);

  // Vendors eligible for financial ranking (qualified or all if no tech eval)
  const eligibleBids = (pr.financial_evaluations ?? [])
    .filter(fe => qualifiedNames.length === 0 || qualifiedNames.includes(fe.vendor_name));

  const rankOptions = eligibleBids.map((_, i) => `L${i + 1}`);

  // Editable rankings: keyed by financial_evaluation id
  const [vendorRankings, setVendorRankings] = useState<{ [id: number]: string }>(() => {
    const init: { [id: number]: string } = {};
    eligibleBids.forEach((fe, idx) => {
      init[fe.id] = fe.ranking || `L${idx + 1}`;
    });
    return init;
  });

  // Selected (recommended) vendor
  const [selectedBidId, setSelectedBidId] = useState<string>(() => {
    const awarded = pr.financial_evaluations?.find(fe => fe.is_awarded);
    if (awarded) return String(awarded.id);
    const l1 = eligibleBids.find(fe => fe.ranking === 'L1');
    return l1 ? String(l1.id) : '';
  });

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
    if (!selectedBidId) { toast.error('Please select the recommended vendor'); return; }

    // Validate rankings are unique
    const rankValues = eligibleBids.map(fe => vendorRankings[fe.id]).filter(Boolean);
    const uniqueRanks = new Set(rankValues);
    if (uniqueRanks.size !== rankValues.length) {
      toast.error('Each vendor must have a unique ranking — no duplicates allowed');
      return;
    }
    if (!rankValues.includes('L1')) {
      toast.error('Please assign L1 ranking to at least one vendor');
      return;
    }

    if (!window.confirm('Save rankings, confirm recommended vendor, and advance?')) return;
    setActionLoading(true);
    try {
      const vendors = eligibleBids.map(fe => ({
        name: fe.vendor_name,
        quoted_amount: fe.quoted_amount,
        ranking: vendorRankings[fe.id],
        remarks: fe.remarks,
        unit_price: fe.unit_price,
        taxes: fe.taxes ?? 0,
        delivery_period: fe.delivery_period,
        warranty: fe.warranty,
        is_awarded: String(fe.id) === selectedBidId,
      }));

      await prApi.addFinancialBids(pr.id, { vendors, remarks });

      if (pr.flow?.step_type === 'purchase_initiator' || pr.flow?.expected_group === 'faculty') {
        await prApi.advance(pr.id, remarks);
        toast.success('Rankings saved and advanced successfully');
      } else {
        toast.success('Rankings and vendor selection saved');
      }
      setRemarks('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Initiator step: enter/edit rankings and select recommended vendor
  if (isInitiator && eligibleBids.length > 0 && !hasAwardedBid) {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
          Financial Evaluation — Assign Rankings &amp; Select Recommended Vendor
        </h4>
        <p className="text-xs text-slate-500">
          Assign L1, L2, L3… rankings to each vendor and select the recommended vendor to proceed.
          Rankings are manually assigned — the system will not override your selection.
        </p>

        <div className="space-y-2">
          {eligibleBids.map(fe => {
            const currentRank = vendorRankings[fe.id] || '';
            const isSelected = selectedBidId === String(fe.id);
            const isL1 = currentRank === 'L1';
            const isL2 = currentRank === 'L2';
            return (
              <div key={fe.id}
                className={`flex items-center justify-between p-3 border rounded transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/30'
                    : isL1 ? 'border-green-200 bg-green-50/10'
                    : isL2 ? 'border-yellow-200 bg-yellow-50/10'
                    : 'border-slate-200'
                }`}>
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="radio"
                    name="awarded_vendor"
                    value={fe.id}
                    checked={isSelected}
                    onChange={e => setSelectedBidId(e.target.value)}
                    aria-label={`Select ${fe.vendor_name} as recommended vendor`}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500 shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-slate-800 truncate block">{fe.vendor_name}</span>
                    <span className="text-xs font-semibold text-[#1a3a6b]">{formatCurrency(fe.quoted_amount)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {isL1 && <Trophy size={13} className="text-green-600" />}
                  <select
                    value={currentRank}
                    onChange={e => setVendorRankings(prev => ({ ...prev, [fe.id]: e.target.value }))}
                    aria-label={`Ranking for ${fe.vendor_name}`}
                    className={`text-xs font-bold px-2 py-1 rounded border focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                      isL1 ? 'bg-green-100 text-green-800 border-green-300'
                      : isL2 ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                      : 'bg-slate-100 text-slate-800 border-slate-300'
                    }`}>
                    {rankOptions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <label htmlFor="fin-sanction-remarks" className="label text-slate-700 font-bold text-xs">
            Remarks / Justification *
          </label>
          <textarea
            id="fin-sanction-remarks"
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="Provide justification for rankings and vendor selection..."
            className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm"
            required
          />
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            onClick={handleInitiatorConfirm}
            disabled={actionLoading || !remarks.trim() || !selectedBidId}
            className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs">
            <CheckCircle2 size={14} /> Save Rankings &amp; Advance
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
        <label htmlFor="fin-sanction-approve-remarks" className="label text-slate-700 font-bold text-xs">Remarks *</label>
        <textarea
          id="fin-sanction-approve-remarks"
          value={remarks}
          onChange={e => setRemarks(e.target.value)}
          placeholder="Provide financial sanction evaluation remarks..."
          className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm"
          required
        />
      </div>

      <div className="flex flex-wrap gap-2.5 pt-1">
        <button onClick={handleAdvance} disabled={actionLoading || !remarks.trim()}
          className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs">
          <CheckCircle2 size={14} /> Approve &amp; Forward
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
};
