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
}

export const StepReviewSubmit: React.FC<Props> = ({
  files,
  items,
  common,
  procurementName,
  onUpdateCommon,
  onSubmit,
  loading,
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

      <button type="button" disabled={!canSubmit || loading} className="btn-primary" onClick={onSubmit}>
        {loading ? 'Submitting…' : 'Submit purchase request'}
      </button>
    </div>
  );
};
