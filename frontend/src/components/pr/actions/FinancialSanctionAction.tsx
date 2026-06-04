import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, XCircle, RotateCcw
} from 'lucide-react';
import { prApi } from '../../../services/api';
import { PurchaseRequest } from '../../../types';
import toast from 'react-hot-toast';

interface FinancialSanctionActionProps {
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

export const FinancialSanctionAction: React.FC<FinancialSanctionActionProps> = ({
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
  const [finBids, setFinBids] = useState<Record<string, {
    quoted_amount: string;
    remarks: string;
    unit_price?: string;
    taxes?: string;
    delivery_period?: string;
    warranty?: string;
  }>>({});
  const [singleBidJustification, setSingleBidJustification] = useState('');

  const isInitiatorStep = user?.id === pr.initiator_id && pr.flow?.step_order === 1;

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

  useEffect(() => {
    if (pr.technical_evaluations) {
      const initialBids: Record<string, {
        quoted_amount: string;
        remarks: string;
        unit_price?: string;
        taxes?: string;
        delivery_period?: string;
        warranty?: string;
      }> = {};
      pr.technical_evaluations.forEach(te => {
        if (te.is_qualified) {
          const existingFe = pr.financial_evaluations?.find(f => f.vendor_name === te.vendor_name);
          initialBids[te.vendor_name] = { 
            quoted_amount: existingFe ? String(existingFe.quoted_amount / 100000) : '', 
            remarks: existingFe ? existingFe.remarks || '' : '',
            unit_price: existingFe && existingFe.unit_price !== undefined && existingFe.unit_price !== null ? String(existingFe.unit_price / 100000) : '',
            taxes: existingFe && existingFe.taxes !== undefined ? String(existingFe.taxes) : '0',
            delivery_period: existingFe && existingFe.delivery_period !== undefined && existingFe.delivery_period !== null ? String(existingFe.delivery_period) : '',
            warranty: existingFe && existingFe.warranty !== undefined && existingFe.warranty !== null ? String(existingFe.warranty) : '',
          };
        }
      });
      setFinBids(initialBids);
      if (pr.single_bid_justification) {
        setSingleBidJustification(pr.single_bid_justification);
      }
    }
  }, [pr]);

  const getLiveRankings = () => {
    const bidsList = Object.entries(finBids).map(([name, data]) => ({
      name,
      amount: parseFloat(data.quoted_amount) || Infinity
    }));
    bidsList.sort((a, b) => a.amount - b.amount);
    
    const rankings: Record<string, string> = {};
    bidsList.forEach((bid, idx) => {
      if (bid.amount !== Infinity) {
        rankings[bid.name] = `L1`;
        if (idx > 0) rankings[bid.name] = `L${idx + 1}`;
      } else {
        rankings[bid.name] = '-';
      }
    });
    return rankings;
  };
  const liveRankings = getLiveRankings();

  const handleFinBidsSubmit = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required to register and advance'); return; }
    
    const isSingleBid = pr.technical_evaluations?.filter((t: any) => t.is_qualified).length === 1;
    if (isSingleBid && !singleBidJustification.trim()) {
      toast.error('Single Bid Justification is required');
      return;
    }

    try {
      const formattedBids = Object.entries(finBids).map(([name, data]) => {
        if (!data.quoted_amount.trim()) {
          toast.error(`Quoted total amount for ${name} is required`);
          throw new Error("Validation failed");
        }
        return {
          name,
          quoted_amount: parseFloat(data.quoted_amount) * 100000,
          remarks: data.remarks,
          unit_price: data.unit_price ? parseFloat(data.unit_price) * 100000 : null,
          taxes: data.taxes ? parseFloat(data.taxes) : 0,
          delivery_period: data.delivery_period ? parseInt(data.delivery_period) : null,
          warranty: data.warranty ? parseInt(data.warranty) : null,
        };
      });

      if (!window.confirm('Are you sure you want to submit these financial bids and advance?')) return;

      setActionLoading(true);
      await prApi.addFinancialBids(pr.id, {
        vendors: formattedBids,
        remarks,
        single_bid_justification: isSingleBid ? singleBidJustification : null
      });
      toast.success('Financial Bids saved. Advancing step...');
      await prApi.advance(pr.id, remarks);
      setRemarks('');
      refetch();
    } catch (e: any) {
      if (e.message !== "Validation failed") {
        toast.error(e.response?.data?.detail || 'Action failed');
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (!isInitiatorStep) {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
          Approve &amp; Forward Financial Sanction
        </h4>
        
        <div className="space-y-2">
          <label className="label text-slate-700 font-bold text-xs">
            Remarks / Recommendation Comments *
          </label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Provide financial sanction evaluation remarks..."
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
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Register Financial Bids</h4>
      
      {!pr.technical_evaluations || pr.technical_evaluations.filter(t => t.is_qualified).length === 0 ? (
        <div className="p-6 text-center border border-dashed border-slate-200 rounded bg-slate-50 space-y-2">
          <p className="text-sm text-slate-500 italic">No technically qualified vendors found.</p>
          <p className="text-xs text-slate-400">Please complete Technical Evaluation first.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto border border-slate-200 rounded-lg bg-slate-50/30 p-0.5">
            <table className="min-w-[900px] divide-y divide-slate-100 text-sm animate-fadeIn" style={{ minWidth: '900px' }}>
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left w-[20%]" style={{ minWidth: '150px' }}>Vendor Name</th>
                  <th className="px-3 py-2.5 text-center w-[8%]" style={{ minWidth: '70px' }}>Rank</th>
                  <th className="px-3 py-2.5 text-left w-[12%]" style={{ minWidth: '110px' }}>Unit Price (L)</th>
                  <th className="px-3 py-2.5 text-left w-[10%]" style={{ minWidth: '90px' }}>Taxes (%)</th>
                  <th className="px-3 py-2.5 text-left w-[14%]" style={{ minWidth: '120px' }}>Quoted Total (L) *</th>
                  <th className="px-3 py-2.5 text-left w-[12%]" style={{ minWidth: '100px' }}>Delivery (W)</th>
                  <th className="px-3 py-2.5 text-left w-[12%]" style={{ minWidth: '100px' }}>Warranty (M)</th>
                  <th className="px-3 py-2.5 text-left w-[12%]" style={{ minWidth: '120px' }}>Remarks</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {pr.technical_evaluations.filter(t => t.is_qualified).map((te) => {
                  const state = finBids[te.vendor_name] || { quoted_amount: '', remarks: '', unit_price: '', taxes: '0', delivery_period: '', warranty: '' };
                  const ranking = liveRankings[te.vendor_name] || '-';
                  const isL1 = ranking === 'L1';
                  const isL2 = ranking === 'L2';

                  const handleUnitPriceOrTaxesChange = (field: 'unit_price' | 'taxes', val: string) => {
                    const nextState = { ...state, [field]: val };
                    const uPrice = parseFloat(nextState.unit_price || '0');
                    const taxPercent = parseFloat(nextState.taxes || '0');
                    if (uPrice > 0) {
                      const totalAmt = uPrice * (1 + taxPercent / 100);
                      nextState.quoted_amount = String(totalAmt.toFixed(2));
                    }
                    setFinBids({
                      ...finBids,
                      [te.vendor_name]: nextState
                    });
                  };

                  return (
                    <tr key={te.id} className={`hover:bg-slate-50/40 transition-colors ${
                      isL1 ? 'bg-green-50/10' : isL2 ? 'bg-yellow-50/10' : ''
                    }`}>
                      <td className="px-3 py-2 font-semibold text-slate-800">{te.vendor_name}</td>
                      <td className="px-3 py-2 text-center font-semibold">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          isL1 ? 'bg-green-100 text-green-800 border border-green-200' : 
                          isL2 ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : 
                          'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {ranking}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative">
                          <input 
                            type="number"
                            step="0.01"
                            value={state.unit_price || ''}
                            onChange={(e) => handleUnitPriceOrTaxesChange('unit_price', e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 pl-4 pr-1 text-xs rounded transition-all placeholder:text-slate-300 font-mono"
                            placeholder="0.00"
                          />
                          <span className="absolute left-1.5 top-1.5 text-[10px] text-slate-400 font-bold">₹</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input 
                          type="number"
                          step="0.1"
                          value={state.taxes || '0'}
                          onChange={(e) => handleUnitPriceOrTaxesChange('taxes', e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1.5 text-xs rounded transition-all font-mono"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative">
                          <input 
                            type="number"
                            step="0.01"
                            value={state.quoted_amount}
                            onChange={(e) => setFinBids({
                              ...finBids,
                              [te.vendor_name]: { ...state, quoted_amount: e.target.value }
                            })}
                            className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 pl-4 pr-1 text-xs rounded transition-all font-semibold font-mono"
                            placeholder="0.00"
                            required
                          />
                          <span className="absolute left-1.5 top-1.5 text-[10px] text-slate-400 font-bold">₹</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input 
                          type="number"
                          value={state.delivery_period || ''}
                          onChange={(e) => setFinBids({
                            ...finBids,
                            [te.vendor_name]: { ...state, delivery_period: e.target.value }
                          })}
                          className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1.5 text-xs rounded transition-all"
                          placeholder="weeks"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input 
                          type="number"
                          value={state.warranty || ''}
                          onChange={(e) => setFinBids({
                            ...finBids,
                            [te.vendor_name]: { ...state, warranty: e.target.value }
                          })}
                          className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1.5 text-xs rounded transition-all"
                          placeholder="months"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input 
                          type="text"
                          value={state.remarks}
                          onChange={(e) => setFinBids({
                            ...finBids,
                            [te.vendor_name]: { ...state, remarks: e.target.value }
                          })}
                          className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1.5 text-xs rounded transition-all placeholder:text-slate-300 placeholder:italic"
                          placeholder="Remarks"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pr.technical_evaluations.filter(t => t.is_qualified).length === 1 && (
            <div className="pt-3 pb-2 space-y-2 border-t border-slate-100 bg-orange-50/20 p-4 rounded border border-orange-100/50 animate-fadeIn">
              <label className="label text-[#1a3a6b] font-bold text-xs block mb-1">Single Bid Justification *</label>
              <textarea
                value={singleBidJustification}
                onChange={(e) => setSingleBidJustification(e.target.value)}
                placeholder="Provide explicit justification for proceeding with a single qualified bid..."
                className="input-field min-h-[70px] text-xs py-1.5 bg-white border border-orange-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                required
              />
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <label className="label text-slate-700 font-bold text-xs">Remarks / Recommendation Comments *</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Provide financial sanction evaluation remarks..."
              className="input-field min-h-[60px] text-xs py-1.5"
              required
            />
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <button 
              onClick={handleFinBidsSubmit} 
              disabled={actionLoading || !remarks.trim()}
              className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs"
            >
              <CheckCircle2 size={14} /> Submit Financial Bids &amp; Advance
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
                onClick={() => setShowSendBackModal(true)} 
                disabled={actionLoading} 
                className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition"
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
