import React from 'react';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { PurchaseRequest } from '../../../types';
import toast from 'react-hot-toast';

interface POActionProps {
  pr: PurchaseRequest;
  user: any;
  actionLoading: boolean;
  sendBackCandidates: any[];
  onAdvance: () => void;
  onReject: () => void;
  onSendBackClick: () => void;
  remarks: string;
  setRemarks: (val: string) => void;
}

export const POAction: React.FC<POActionProps> = ({
  pr,
  user,
  actionLoading,
  sendBackCandidates,
  onAdvance,
  onReject,
  onSendBackClick,
  remarks,
  setRemarks
}) => {
  const handleApprove = () => {
    if (!user?.signature_path) {
      toast.error('You must upload a digital signature in your Profile to approve Purchase Order steps.');
      return;
    }
    onAdvance();
  };

  return (
    <div className="space-y-4 pt-2 border-t border-blue-200 text-left">
      <div>
        <label className="label font-bold text-slate-700">Remarks / Justification</label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Enter official remarks for Purchase Order approval..."
          rows={3}
          className="input-field resize-none bg-white mt-1"
        />
      </div>

      {!user?.signature_path && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded text-xs font-semibold">
          Warning: You do not have a digital signature uploaded in your profile. You must configure this in your Profile before you can approve this step.
        </div>
      )}

      <div className="flex gap-3">
        <button 
          onClick={handleApprove} 
          disabled={actionLoading || !remarks.trim() || !user?.signature_path} 
          className={`btn-primary flex items-center gap-2 ${!user?.signature_path ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <CheckCircle2 size={16} /> Approve &amp; Forward (PO)
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
