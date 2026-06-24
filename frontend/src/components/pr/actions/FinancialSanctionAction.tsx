import React, { useState, useEffect } from 'react';
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
  const stepType = pr.flow?.step_type;

  // Split commercial_evaluations into qualified / not-qualified
  const ces = pr.commercial_evaluations ?? [];
  const qualifiedBidders = ces.filter(ce => ce.tech_status === 'Qualified' || ce.is_qualified);
  const notQualifiedBidders = ces.filter(ce => ce.tech_status === 'Not Qualified' && !ce.is_qualified);

  // ── DA amount entry state ───────────────────────────────────────────────────
  const [daAmounts, setDaAmounts] = useState<Record<number, string>>({});
  const [daSaving, setDaSaving] = useState(false);

  useEffect(() => {
    const init: Record<number, string> = {};
    qualifiedBidders.forEach(ce => {
      init[ce.id] = ce.quoted_amount != null ? String(ce.quoted_amount) : '';
    });
    setDaAmounts(init);
  }, [ces.length, pr.id]);

  // ── PI ranking state ────────────────────────────────────────────────────────
  const hasAwardedBid = pr.financial_evaluations?.some(fe => fe.is_awarded);

  // Qualified bidders with amounts (from commercial_evaluations)
  const qualifiedWithAmounts = qualifiedBidders.filter(ce => ce.quoted_amount != null);

  // If financial_evaluations already exist (PI already submitted), use those for display
  const useFinEvals = (pr.financial_evaluations ?? []).length > 0;
  const eligibleBids = useFinEvals
    ? (pr.financial_evaluations ?? [])
    : qualifiedWithAmounts.map(ce => ({ id: ce.id, vendor_name: ce.vendor_name, quoted_amount: ce.quoted_amount!, ranking: '', is_awarded: false, remarks: undefined, unit_price: undefined, taxes: 0, delivery_period: undefined, warranty: undefined }));

  const rankOptions = eligibleBids.map((_, i) => `L${i + 1}`);

  const [vendorRankings, setVendorRankings] = useState<Record<number, string>>({});
  const [selectedBidId, setSelectedBidId] = useState<string>('');

  useEffect(() => {
    // Auto-sort by quoted_amount ascending → assign L1, L2, L3…
    const sorted = [...eligibleBids].sort((a, b) => (a.quoted_amount ?? 0) - (b.quoted_amount ?? 0));
    const init: Record<number, string> = {};
    sorted.forEach((fe, idx) => {
      init[fe.id] = fe.ranking || `L${idx + 1}`;
    });
    setVendorRankings(init);

    const awarded = eligibleBids.find(fe => fe.is_awarded);
    if (awarded) {
      setSelectedBidId(String(awarded.id));
    } else {
      const l1 = sorted[0];
      if (l1) setSelectedBidId(String(l1.id));
    }
  }, [eligibleBids.length, pr.id]);

  // ── DA: save quoted amounts (draft) ────────────────────────────────────────
  const handleDaSaveDraft = async () => {
    setDaSaving(true);
    try {
      const bidders = qualifiedBidders.map(ce => ({
        id: ce.id,
        quoted_amount: daAmounts[ce.id] !== '' ? parseFloat(daAmounts[ce.id]) : null,
      }));
      await prApi.saveFaAmounts(pr.id, { bidders });
      toast.success('Quoted amounts saved as draft');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setDaSaving(false);
    }
  };

  // ── DA: submit and advance ──────────────────────────────────────────────────
  const handleDaSubmit = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required'); return; }
    const missing = qualifiedBidders.filter(ce => !daAmounts[ce.id] || isNaN(parseFloat(daAmounts[ce.id])));
    if (missing.length > 0) { toast.error(`Enter quoted amount for all ${missing.length} qualified bidder(s)`); return; }
    if (!window.confirm('Submit quoted amounts and advance to Purchase Initiator for ranking?')) return;

    setActionLoading(true);
    try {
      const bidders = qualifiedBidders.map(ce => ({
        id: ce.id,
        quoted_amount: parseFloat(daAmounts[ce.id]),
      }));
      await prApi.saveFaAmounts(pr.id, { bidders });
      await prApi.advance(pr.id, remarks);
      toast.success('Quoted amounts submitted. Advancing to PI for ranking.');
      setRemarks('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // ── PI: submit rankings + award ─────────────────────────────────────────────
  const handlePIConfirm = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required'); return; }
    if (!selectedBidId) { toast.error('Please select the recommended vendor'); return; }

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
      await prApi.advance(pr.id, remarks);
      toast.success('Rankings saved and advanced successfully');
      setRemarks('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Standard approve & forward ──────────────────────────────────────────────
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

  // ── CASE 1: DA enters quoted amounts (FS Step 1) ───────────────────────────
  if (stepType === 'verifier_da') {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <div className="bg-[#1a3a6b] text-white rounded px-3 py-2">
          <h4 className="text-xs font-bold uppercase tracking-wide">Financial Evaluation — Quoted Amount Entry</h4>
          <p className="text-[10px] text-blue-200 mt-0.5">Enter quoted amount for each qualified bidder</p>
        </div>

        {/* Qualified bidders — amount entry */}
        {qualifiedBidders.length === 0 ? (
          <div className="p-4 text-center border border-dashed border-slate-200 rounded bg-slate-50">
            <p className="text-sm text-slate-500 italic">No qualified bidders from technical evaluation.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">
              Qualified Bidders
            </div>
            <div className="rounded border border-slate-200 overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#1a3a6b] text-white">
                    <th className="px-3 py-1.5 text-left font-semibold">Sl.</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Bidder Name</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Bidder ID</th>
                    <th className="px-3 py-1.5 text-left font-semibold">Quoted Amount (₹) *</th>
                  </tr>
                </thead>
                <tbody>
                  {qualifiedBidders.map((ce, idx) => (
                    <tr key={ce.id} className={`border-t border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <td className="px-3 py-1.5 text-slate-500 font-semibold">{idx + 1}</td>
                      <td className="px-3 py-1.5 font-semibold text-slate-800">{ce.vendor_name}</td>
                      <td className="px-3 py-1.5 text-slate-500">{ce.vendor_email || '—'}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number" min="0" step="0.01"
                          value={daAmounts[ce.id] ?? ''}
                          onChange={e => setDaAmounts(prev => ({ ...prev, [ce.id]: e.target.value }))}
                          placeholder="Enter amount"
                          className="text-xs border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Non-qualified bidders — read-only, greyed out */}
        {notQualifiedBidders.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-red-500 uppercase tracking-wide border-b border-red-100 pb-1">
              Not Qualified Bidders (Excluded from Financial Evaluation)
            </div>
            <div className="rounded border border-red-100 overflow-hidden opacity-60">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-red-50">
                    <th className="px-3 py-1.5 text-left font-semibold text-red-700">Sl.</th>
                    <th className="px-3 py-1.5 text-left font-semibold text-red-700">Bidder Name</th>
                    <th className="px-3 py-1.5 text-left font-semibold text-red-700">Bidder ID</th>
                    <th className="px-3 py-1.5 text-left font-semibold text-red-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {notQualifiedBidders.map((ce, idx) => (
                    <tr key={ce.id} className="border-t border-red-50 bg-red-50/20">
                      <td className="px-3 py-1.5 text-red-400">{idx + 1}</td>
                      <td className="px-3 py-1.5 text-red-700 font-semibold line-through">{ce.vendor_name}</td>
                      <td className="px-3 py-1.5 text-red-400">{ce.vendor_email || '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Not Qualified</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <label className="label text-slate-700 font-bold text-xs">Remarks *</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder="Provide remarks on quoted amounts..."
            className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm" />
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button onClick={handleDaSaveDraft} disabled={daSaving || actionLoading}
            className="btn-secondary border border-slate-300 text-slate-700 bg-slate-50 hover:bg-slate-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition">
            {daSaving ? 'Saving…' : 'Save Draft'}
          </button>
          <button onClick={handleDaSubmit} disabled={actionLoading || !remarks.trim()}
            className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs">
            <CheckCircle2 size={14} /> Submit Amounts &amp; Advance
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
  }

  // ── CASE 2: PI assigns rankings (FS Step 2) ────────────────────────────────
  if (stepType === 'purchase_initiator' && isInitiator && !hasAwardedBid) {
    const sortedBidders = [...eligibleBids].sort((a, b) => (a.quoted_amount ?? 0) - (b.quoted_amount ?? 0));

    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <div className="bg-[#1a3a6b] text-white rounded px-3 py-2">
          <h4 className="text-xs font-bold uppercase tracking-wide">Financial Evaluation — Assign Rankings &amp; Select Recommended Vendor</h4>
          <p className="text-[10px] text-blue-200 mt-0.5">Auto-sorted by quoted amount (lowest first). Assign L1/L2/L3 and select the recommended vendor.</p>
        </div>

        {/* Qualified bidders with amounts + ranking */}
        {eligibleBids.length === 0 ? (
          <div className="p-4 text-center border border-dashed border-slate-200 rounded bg-slate-50">
            <p className="text-sm text-slate-500 italic">No qualified bidders with quoted amounts found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedBidders.map((fe, idx) => {
              const currentRank = vendorRankings[fe.id] || '';
              const isSelected = selectedBidId === String(fe.id);
              const isL1 = currentRank === 'L1';
              const isL2 = currentRank === 'L2';
              return (
                <div key={fe.id}
                  className={`flex items-center justify-between p-3 border rounded transition-all ${
                    isSelected ? 'border-blue-500 bg-blue-50/30'
                    : isL1 ? 'border-emerald-200 bg-emerald-50/10'
                    : isL2 ? 'border-yellow-200 bg-yellow-50/10'
                    : 'border-slate-200'
                  }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <input type="radio" name="awarded_vendor" value={fe.id}
                      checked={isSelected} onChange={e => setSelectedBidId(e.target.value)}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-slate-800 truncate block">{fe.vendor_name}</span>
                      <span className="text-xs font-semibold text-[#1a3a6b]">{formatCurrency(fe.quoted_amount!)}</span>
                      {idx === 0 && <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded">Lowest Bid</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {isL1 && <Trophy size={13} className="text-emerald-600" />}
                    <select value={currentRank}
                      onChange={e => setVendorRankings(prev => ({ ...prev, [fe.id]: e.target.value }))}
                      className={`text-xs font-bold px-2 py-1 rounded border focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                        isL1 ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : isL2 ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                        : 'bg-slate-100 text-slate-800 border-slate-300'
                      }`}>
                      {rankOptions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Non-qualified shown below, read-only */}
        {notQualifiedBidders.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-red-500 uppercase tracking-wide">Not Qualified (Excluded)</div>
            <div className="rounded border border-red-100 overflow-hidden opacity-60">
              <table className="w-full text-xs border-collapse">
                <tbody>
                  {notQualifiedBidders.map(ce => (
                    <tr key={ce.id} className="border-t border-red-50 bg-red-50/20">
                      <td className="px-3 py-1.5 text-red-700 line-through">{ce.vendor_name}</td>
                      <td className="px-3 py-1.5 text-red-400">{ce.vendor_email || '—'}</td>
                      <td className="px-3 py-1.5">
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Not Qualified</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <label className="label text-slate-700 font-bold text-xs">Remarks / Justification *</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder="Provide justification for rankings and vendor selection..."
            className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm" />
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button onClick={handlePIConfirm} disabled={actionLoading || !remarks.trim() || !selectedBidId}
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

  // ── CASE 3: Standard approve & forward (HOD/Dean/Director etc.) ─────────────
  return (
    <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
        Approve &amp; Forward Financial Sanction
      </h4>

      {/* Show awarded vendor if selected */}
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

      {/* Financial evaluation table (read-only) */}
      {(pr.financial_evaluations ?? []).length > 0 && (
        <div className="rounded border border-slate-200 overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[#1a3a6b] text-white">
                <th className="px-3 py-1.5 text-left font-semibold">Rank</th>
                <th className="px-3 py-1.5 text-left font-semibold">Bidder Name</th>
                <th className="px-3 py-1.5 text-right font-semibold">Quoted Amount</th>
                <th className="px-3 py-1.5 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...(pr.financial_evaluations ?? [])].sort((a, b) => (a.ranking || '').localeCompare(b.ranking || '')).map((fe, idx) => (
                <tr key={fe.id} className={`border-t border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                  <td className="px-3 py-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${fe.ranking === 'L1' ? 'bg-emerald-100 text-emerald-700' : fe.ranking === 'L2' ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-700'}`}>
                      {fe.ranking || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-semibold text-slate-800">{fe.vendor_name}</td>
                  <td className="px-3 py-1.5 text-right text-slate-700 font-semibold">{formatCurrency(fe.quoted_amount)}</td>
                  <td className="px-3 py-1.5 text-center">
                    {fe.is_awarded && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-1 justify-center"><Trophy size={10} /> Recommended</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Non-qualified bidders info */}
      {notQualifiedBidders.length > 0 && (
        <div className="text-[10px] text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1.5">
          {notQualifiedBidders.length} bidder(s) excluded from financial evaluation (Not Qualified in TE):
          {notQualifiedBidders.map(ce => ` ${ce.vendor_name}`).join(',')}
        </div>
      )}

      <div className="space-y-2">
        <label className="label text-slate-700 font-bold text-xs">Remarks *</label>
        <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
          placeholder="Provide financial sanction evaluation remarks..."
          className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm" />
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
