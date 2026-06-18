import React from 'react';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { PurchaseRequest } from '../../../types';

interface AAActionProps {
  pr: PurchaseRequest;
  actionLoading: boolean;
  sendBackCandidates: any[];
  onAdvance: () => void;
  onReject: () => void;
  onSendBackClick: () => void;
  remarks: string;
  setRemarks: (val: string) => void;
  isHOD?: boolean;
  isDirector?: boolean;
  nominationDone?: boolean;
  expert1Id?: number | '';
  setExpert1Id?: (val: number | '') => void;
  expert2Id?: number | '';
  setExpert2Id?: (val: number | '') => void;
  directorFacultyId?: number | '';
  setDirectorFacultyId?: (val: number | '') => void;
  faculties?: any[];
  allUsers?: any[];
}

export const AAAction: React.FC<AAActionProps> = ({
  pr,
  actionLoading,
  sendBackCandidates,
  onAdvance,
  onReject,
  onSendBackClick,
  remarks,
  setRemarks,
  isHOD = false,
  isDirector = false,
  nominationDone = false,
  expert1Id = '',
  setExpert1Id,
  expert2Id = '',
  setExpert2Id,
  directorFacultyId = '',
  setDirectorFacultyId,
  faculties = [],
  allUsers = []
}) => {
  return (
    <div className="space-y-6 pt-2 border-t border-blue-200 text-left">
      {isHOD && !nominationDone && setExpert1Id && setExpert2Id && (
        <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg space-y-4">
          <div>
            <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider block">
              Purchase Committee Nomination
            </span>
            <p className="text-[11px] text-indigo-800/80 leading-normal mt-0.5">
              As HOD, you must nominate two faculty experts from your department to serve on the 5-member TSC.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Department Expert 1 <span className="text-rose-500">*</span>
              </label>
              <select
                value={expert1Id}
                onChange={e => setExpert1Id(e.target.value === '' ? '' : Number(e.target.value))}
                required
                className="input-field w-full bg-white text-xs py-2 shadow-xs"
              >
                <option value="">Select Expert 1...</option>
                {faculties.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name} ({f.email})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                Department Expert 2 <span className="text-rose-500">*</span>
              </label>
              <select
                value={expert2Id}
                onChange={e => setExpert2Id(e.target.value === '' ? '' : Number(e.target.value))}
                required
                className="input-field w-full bg-white text-xs py-2 shadow-xs"
              >
                <option value="">Select Expert 2...</option>
                {faculties.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name} ({f.email})</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {isDirector && setDirectorFacultyId && (
        <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-lg space-y-4">
          <div>
            <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider block">
              Director Nominee Selection
            </span>
            <p className="text-[11px] text-emerald-800/80 leading-normal mt-0.5">
              As Director, you may optionally nominate a representative to serve on the TSC. This selection is not mandatory.
            </p>
          </div>
          <div className="max-w-md">
            <label className="block text-xs font-bold text-slate-600 mb-1">
              Director Nominee{' '}
              <span className="text-slate-400 font-normal text-[10px]">(Optional)</span>
            </label>
            <select
              value={directorFacultyId}
              onChange={e => setDirectorFacultyId(e.target.value === '' ? '' : Number(e.target.value))}
              className="input-field w-full bg-white text-xs py-2 shadow-xs"
            >
              <option value="">— No nominee (skip) —</option>
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
          placeholder="Enter official remarks for Indent & Tech Spec approval..."
          rows={3}
          className="input-field resize-none bg-white mt-1"
        />
      </div>

      {isHOD && expert1Id && expert2Id && expert1Id === expert2Id && (
        <p className="text-xs text-rose-600 font-semibold bg-rose-50 border border-rose-200 rounded px-3 py-2">
          Expert 1 and Expert 2 must be different persons.
        </p>
      )}
      {isDirector && directorFacultyId && (
        (directorFacultyId === pr.faculty1_id || directorFacultyId === pr.faculty2_id) && (
          <p className="text-xs text-rose-600 font-semibold bg-rose-50 border border-rose-200 rounded px-3 py-2">
            Director Nominee must be different from Expert 1 and Expert 2.
          </p>
        )
      )}

      <div className="flex gap-3">
        <button
          onClick={onAdvance}
          disabled={
            actionLoading || !remarks.trim() ||
            (isHOD && !nominationDone && !!expert1Id && !!expert2Id && expert1Id === expert2Id) ||
            (isDirector && !!directorFacultyId && (directorFacultyId === pr.faculty1_id || directorFacultyId === pr.faculty2_id))
          }
          className="btn-primary flex items-center gap-2"
        >
          <CheckCircle2 size={16} /> Approve &amp; Forward
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
