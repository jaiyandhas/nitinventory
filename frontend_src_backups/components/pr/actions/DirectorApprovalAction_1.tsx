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
  isDirector?: boolean;
  directorFacultyId?: number | '';
  setDirectorFacultyId?: (val: number | '') => void;
  allUsers?: any[];
}

export const DirectorApprovalAction: React.FC<DirectorApprovalActionProps> = ({
  pr,
  actionLoading,
  sendBackCandidates,
  onAdvance,
  onReject,
  onSendBackClick,
  remarks,
  setRemarks,
  isDirector = false,
  directorFacultyId = '',
  setDirectorFacultyId,
  allUsers = []
}) => {
  return (
    <div className="space-y-6 pt-2 border-t border-blue-200 text-left">
      {isDirector && setDirectorFacultyId && (
        <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-lg space-y-4">
          <div>
            <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider block">
              Director Nominee Selection
            </span>
            <p className="text-[11px] text-emerald-800/80 leading-normal mt-0.5">
              As Director, select a Director Nominee to represent the administration on the TSC.
            </p>
          </div>
          <div className="max-w-md">
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Director Nominee <span className="text-rose-500">*</span>
            </label>
            <select
              value={directorFacultyId}
              onChange={e => setDirectorFacultyId(e.target.value === '' ? '' : Number(e.target.value))}
              required
              className="input-field w-full bg-white text-xs py-2 shadow-xs"
            >
              <option value="">Select Director Nominee...</option>
              {allUsers.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>
        </div>
      )}

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
