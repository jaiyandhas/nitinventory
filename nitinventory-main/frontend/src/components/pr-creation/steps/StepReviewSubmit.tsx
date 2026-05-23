import React, { useState } from 'react';
import type { BudgetFile } from '../../../types';
import type { PRCommonFormState, PRItemFormState } from '../../../types/prCreation';
import { PR_TERMS } from '../../../config/prCreationQuestions';
import { formatCurrency } from '../../../utils/format';

interface Props {
  files: BudgetFile[];
  items: Record<number, PRItemFormState>;
  common: PRCommonFormState;
  procurementName: string;
  onUpdateCommon: (patch: Partial<PRCommonFormState>) => void;
  onSubmit: () => void;
  loading: boolean;
  onBack: () => void;
  onCancel: () => void;
}

export const StepReviewSubmit: React.FC<Props> = ({
  files,
  items,
  common,
  procurementName,
  onUpdateCommon,
  onSubmit,
  loading,
  onBack,
  onCancel,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const canSubmit = confirmText.trim().toUpperCase() === 'CONFIRM' && common.termsAccepted.every(Boolean);

  const toggleTerm = (index: number) => {
    const next = [...common.termsAccepted];
    next[index] = !next[index];
    onUpdateCommon({ termsAccepted: next });
  };

  return (
    <div className="space-y-6">
      <div className="card p-4 bg-slate-50 text-sm space-y-2">
        <p><strong>Files:</strong> {files.length} | <strong>Procurement:</strong> {procurementName} | <strong>Purchase Type:</strong> {common.purchase_type ? common.purchase_type.toUpperCase() : 'N/A'}</p>
        <ul className="list-disc pl-5">
          {files.map((f) => (
            <li key={f.id}>{f.file_no} — {f.item_name} ({formatCurrency(f.total_cost)})</li>
          ))}
        </ul>
      </div>

      {/* Attached Files Review */}
      <div className="border border-slate-200 rounded-lg p-5 bg-white shadow-sm space-y-3">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
          Attached Documents Review
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {common.quotation_file && (
            <div className="flex items-center justify-between bg-slate-50 hover:bg-slate-100/85 transition-colors p-3 border border-slate-200 rounded-md">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                <div className="truncate text-xs">
                  <span className="font-bold text-slate-500 block">Quotation / Estimate</span>
                  <span className="text-slate-700 font-semibold">{common.quotation_file.name}</span>
                </div>
              </div>
            </div>
          )}
          {Object.values(items).map((item, idx) => {
            const row: React.ReactNode[] = [];
            if (item.tech_specs_file) {
              row.push(
                <div key={`tech-${idx}`} className="flex items-center justify-between bg-slate-50 hover:bg-slate-100/85 transition-colors p-3 border border-slate-200 rounded-md">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                    <div className="truncate text-xs">
                      <span className="font-bold text-slate-500 block">Item {idx + 1} Tech Spec</span>
                      <span className="text-slate-700 font-semibold">{item.tech_specs_file.name}</span>
                    </div>
                  </div>
                </div>
              );
            }
            if (item.gem_nac_file) {
              row.push(
                <div key={`gem-${idx}`} className="flex items-center justify-between bg-slate-50 hover:bg-slate-100/85 transition-colors p-3 border border-slate-200 rounded-md">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    <div className="truncate text-xs">
                      <span className="font-bold text-slate-500 block">Item {idx + 1} GeM NAC</span>
                      <span className="text-slate-700 font-semibold">{item.gem_nac_file.name}</span>
                    </div>
                  </div>
                </div>
              );
            }
            return row;
          })}
          {!common.quotation_file && !Object.values(items).some(item => item.tech_specs_file || item.gem_nac_file) && (
            <p className="text-xs text-slate-500 italic md:col-span-2">No files attached.</p>
          )}
        </div>
      </div>

      <div className="p-4 border border-gray-200 rounded-md bg-gray-50 space-y-3">
        <h3 className="font-semibold text-[#1a3a6b]">Terms and conditions *</h3>
        {PR_TERMS.map((text, i) => (
          <label key={i} className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={common.termsAccepted[i]} onChange={() => toggleTerm(i)}
              className="mt-1 accent-blue-600" />
            <span className="text-sm text-gray-700">{text}</span>
          </label>
        ))}
      </div>

      <div>
        <label className="label">Type CONFIRM to submit</label>
        <input className="input-field max-w-xs" value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
          placeholder="CONFIRM" />
      </div>

      <div className="flex gap-3 pt-6 mt-6 border-t border-slate-200">
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" disabled={!canSubmit || loading} className="btn-primary ml-auto" onClick={onSubmit}>
          {loading ? 'Submitting…' : 'Submit purchase request'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
};
