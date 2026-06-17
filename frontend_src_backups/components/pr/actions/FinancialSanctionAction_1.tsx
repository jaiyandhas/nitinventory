import React from 'react';
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
          onClick={handleAdvance} 
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
};
