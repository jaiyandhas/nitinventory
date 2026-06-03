import React from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { PurchaseRequest } from '../../../types';

interface PRCommitteePanelProps {
  pr: PurchaseRequest;
  initiatorSig: any | null;
  hodSig: any | null;
  deanSig: any | null;
  directorSig: any | null;
  faculty1Sig: any | null;
  faculty2Sig: any | null;
  faculty3Sig: any | null;
}

export const PRCommitteePanel: React.FC<PRCommitteePanelProps> = ({
  pr,
  initiatorSig,
  hodSig,
  deanSig,
  directorSig,
  faculty1Sig,
  faculty2Sig,
  faculty3Sig,
}) => {
  const renderSigCard = (title: string, sig: any | null, defaultName?: string) => {
    return (
      <div className="flex flex-col items-center justify-end p-4 border border-slate-200 bg-slate-50/50 rounded-md text-center min-h-[140px]">
        {sig && sig.frozen_signature_path ? (
          <div className="space-y-1">
            <img 
              src={sig.frozen_signature_path} 
              alt={`${title} Signature`} 
              className="h-10 max-w-[120px] object-contain mx-auto" 
            />
            <div className="flex items-center justify-center gap-1 text-[10px] text-green-700 font-bold uppercase tracking-wide">
              <CheckCircle2 size={10} className="text-green-600" /> Signed
            </div>
          </div>
        ) : (
          <div className="space-y-1 mb-2">
            <Clock size={20} className="text-slate-400 mx-auto" />
            <div className="text-[10px] text-slate-400 font-semibold italic">Awaiting Signature</div>
          </div>
        )}
        <div className="border-t border-slate-200 w-full pt-1.5 mt-2">
          <p className="text-xs font-bold text-slate-800">{sig?.frozen_actor_name || defaultName || 'Authorized Signatory'}</p>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{sig?.frozen_designation || title}</p>
          {sig?.acted_at && (
            <p className="text-[9px] text-slate-500 mt-0.5">{new Date(sig.acted_at).toLocaleDateString()}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 text-left animate-fadeIn">
      {/* Committee Grid */}
      {pr.budget_file && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Purchase Committee Nominees</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 border border-slate-200 rounded-lg">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">Purchase Initiator</span>
              <p className="text-xs font-bold text-slate-800">{pr.initiator?.name || 'N/A'}</p>
              <p className="text-[10px] text-slate-500">{pr.initiator?.email || ''}</p>
            </div>
            <div className="space-y-0.5 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-4">
              <span className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">Faculty Nominee 1 (HOD)</span>
              {pr.faculty1 ? (
                <>
                  <p className="text-xs font-bold text-slate-800">{pr.faculty1.name}</p>
                  <p className="text-[10px] text-slate-500">{pr.faculty1.email}</p>
                </>
              ) : (
                <p className="text-xs text-rose-500 italic font-medium">Not nominated</p>
              )}
            </div>
            <div className="space-y-0.5 border-t md:border-t-0 md:border-l border-slate-200 pt-2 md:pt-0 md:pl-4">
              <span className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">Faculty Nominee 2 (HOD)</span>
              {pr.faculty2 ? (
                <>
                  <p className="text-xs font-bold text-slate-800">{pr.faculty2.name}</p>
                  <p className="text-[10px] text-slate-500">{pr.faculty2.email}</p>
                </>
              ) : (
                <p className="text-xs text-rose-500 italic font-medium">Not nominated</p>
              )}
            </div>
            <div className="space-y-0.5 border-t md:border-t-0 md:border-l border-slate-200 pt-2 md:pt-0 md:pl-4">
              <span className="text-[10px] font-bold text-slate-400 tracking-wide uppercase">Director Nominee</span>
              {pr.faculty3 ? (
                <>
                  <p className="text-xs font-bold text-slate-800">{pr.faculty3.name}</p>
                  <p className="text-[10px] text-slate-500">{pr.faculty3.email}</p>
                </>
              ) : (
                <p className="text-xs text-rose-500 italic font-medium">Not nominated</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Administrative Approval Signatures */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Administrative Approval Signatures</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {renderSigCard('Purchase Initiator', initiatorSig, pr.initiator?.name)}
          {renderSigCard('HoD, Chairperson', hodSig, pr.hod?.name)}
          {renderSigCard('Dean P&D', deanSig)}
          {renderSigCard('Director', directorSig)}
        </div>
      </div>

      {/* Technical Evaluation Expert Committee Signatures */}
      {pr.technical_evaluations && pr.technical_evaluations.length > 0 && (
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Technical Evaluation Expert Signatures</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {renderSigCard('Purchase Initiator', initiatorSig, pr.initiator?.name)}
            {renderSigCard('HOD Nominated Expert 1', faculty1Sig, pr.faculty1?.name)}
            {renderSigCard('HOD Nominated Expert 2', faculty2Sig, pr.faculty2?.name)}
            {renderSigCard('Director Nominee', faculty3Sig, pr.faculty3?.name)}
          </div>
        </div>
      )}
    </div>
  );
};
