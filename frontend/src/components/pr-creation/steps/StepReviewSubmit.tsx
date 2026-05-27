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
  onBack: () => void;
  onCancel: () => void;
  loading: boolean;
}

export const StepReviewSubmit: React.FC<Props> = ({
  files,
  items,
  common,
  procurementName,
  onUpdateCommon,
  onSubmit,
  onBack,
  onCancel,
  loading,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const canSubmit = confirmText.trim().toUpperCase() === 'CONFIRM' && common.termsAccepted.every(Boolean);

  const toggleTerm = (index: number) => {
    const next = [...common.termsAccepted];
    next[index] = !next[index];
    onUpdateCommon({ termsAccepted: next });
  };

  const grandTotal = files.reduce((sum, f) => {
    const item = items[f.id];
    const qty = item?.quantity !== undefined && item?.quantity !== '' ? Number(item.quantity) : 0;
    return sum + qty * f.unit_cost;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="card p-4 bg-slate-50 text-sm space-y-2">
        <p><strong>Files:</strong> {files.length} | <strong>Procurement:</strong> {procurementName} | <strong>Purchase Type:</strong> {common.purchase_type ? common.purchase_type.toUpperCase() : 'N/A'}</p>
        <ul className="list-disc pl-5 space-y-1">
          {files.map((f) => {
            const item = items[f.id];
            const qty = item?.quantity !== undefined && item?.quantity !== '' ? Number(item.quantity) : 0;
            const estTotal = qty * f.unit_cost;
            return (
              <li key={f.id}>
                <strong>{f.file_no}</strong> — {f.item_name}{' '}
                <span className="text-slate-600 font-medium">
                  (Qty: {qty} × {formatCurrency(f.unit_cost)} = {formatCurrency(estTotal)})
                </span>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-slate-200 pt-2 font-bold text-slate-800">
          Estimated Grand Total: <span className="text-[#1a3a6b]">{formatCurrency(grandTotal)}</span>
        </p>
      </div>

      {/* Uploaded Documents Preview Section */}
      <div className="card p-4 bg-slate-50 text-sm space-y-3">
        <h3 className="font-semibold text-[#1a3a6b] border-b border-slate-200 pb-1.5 flex items-center gap-2">
          <span>📂</span> Uploaded Documents Preview
        </h3>
        <div className="grid grid-cols-1 gap-2.5">
          {common.quotation_file && (
            <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-200 hover:shadow-sm transition-all">
              <span className="font-medium text-slate-700">📄 Basis of Estimation: {common.quotation_file.name}</span>
              <a
                href={URL.createObjectURL(common.quotation_file)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-xs font-semibold underline"
              >
                View PDF
              </a>
            </div>
          )}
          {files.map((f) => {
            const item = items[f.id];
            if (!item) return null;
            return (
              <React.Fragment key={f.id}>
                {item.tech_specs_file && (
                  <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-200 hover:shadow-sm transition-all">
                    <span className="font-medium text-slate-700">📄 {f.item_name} Tech Specs: {item.tech_specs_file.name}</span>
                    <a
                      href={URL.createObjectURL(item.tech_specs_file)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-xs font-semibold underline"
                    >
                      View PDF
                    </a>
                  </div>
                )}
                {item.gem_nac_file && (
                  <div className="flex items-center justify-between p-2 bg-white rounded border border-slate-200 hover:shadow-sm transition-all">
                    <span className="font-medium text-slate-700">📄 {f.item_name} GeM NAC: {item.gem_nac_file.name}</span>
                    <a
                      href={URL.createObjectURL(item.gem_nac_file)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-xs font-semibold underline"
                    >
                      View PDF
                    </a>
                  </div>
                )}
              </React.Fragment>
            );
          })}
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
