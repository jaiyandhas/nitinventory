import React from 'react';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { PurchaseRequest } from '../../../types';

interface DirectorApprovalActionProps {
  pr: PurchaseRequest;
  actionLoading: boolean;
  sendBackCandidates: any[];
  onAdvance: () => void;
  onReject: () => void;
  onSendBackClick: () => void;
  remarks: string;
  setRemarks: (val: string) => void;
}

export const DirectorApprovalAction: React.FC<DirectorApprovalActionProps> = ({
  pr,
  actionLoading,
  sendBackCandidates,
  onAdvance,
  onReject,
  onSendBackClick,
  remarks,
  setRemarks
}) => {
  return (
    <div className="space-y-4 pt-2 border-t border-blue-200 text-left">
      <div>
        <label className="label font-bold text-slate-700">Remarks / Justification</label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Enter official remarks for Director/Apex Approval..."
          rows={3}
          className="input-field resize-none bg-white mt-1"
        />
      </div>

      <div className="flex gap-3">
        <button 
          onClick={onAdvance} 
          disabled={actionLoading || !remarks.trim()} 
          className="btn-primary flex items-center gap-2"
        >
          <CheckCircle2 size={16} /> Approve &amp; Forward (Director/Apex)
        </button>
        
        <button 
          onClick={onReject} 
          disabled={actionLoading || !remarks.trim()} 
          className="btn-danger flex items-center gap-2"
        >
          <XCircle size={16} /> Reject
        </button>

        {pr.flow && pr.flow.step_order > 1 && sendBackCandidates.length > 0 && (
          <button 
            onClick={onSendBackClick} 
            disabled={actionLoading} 
            className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-2 rounded px-4 py-2 font-medium transition"
          >
            <RotateCcw size={16} /> Send Back
          </button>
        )}
      </div>
    </div>
  );
};
