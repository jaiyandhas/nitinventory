import React, { useEffect } from 'react';
import type { BudgetFile, ProcurementMethod } from '../../../types';
import type { PRWizardSelection } from '../../../types/prCreation';

interface Props {
  budgetFiles: BudgetFile[];
  procurementMethods: ProcurementMethod[];
  selection: PRWizardSelection;
  onChange: (patch: Partial<PRWizardSelection>) => void;
}

export const StepSelectFiles: React.FC<Props> = ({
  budgetFiles,
  procurementMethods,
  selection,
  onChange,
}) => {
  useEffect(() => {
    const count = selection.fileCount;
    if (selection.selectedFileIds.length > count) {
      onChange({ selectedFileIds: selection.selectedFileIds.slice(0, count) });
    }
  }, [selection.fileCount, selection.selectedFileIds, onChange]);

  const renderFileSelect = (index: number) => {
    const current = selection.selectedFileIds[index] ?? null;
    const usedElsewhere = new Set(
      selection.selectedFileIds.filter((_, i) => i !== index)
    );

    return (
      <div key={index}>
        <label className="label">{index + 1}) Select budget file</label>
        <select
          className="input-field bg-white"
          value={current ?? ''}
          onChange={(e) => {
            const id = Number(e.target.value);
            const next = [...selection.selectedFileIds];
            next[index] = id;
            onChange({ selectedFileIds: next.filter(Boolean) });
          }}
          required
        >
          <option value="" disabled>
            -- Select file --
          </option>
          {budgetFiles
            .filter((f) => !usedElsewhere.has(f.id) || f.id === current)
            .map((f) => {
              const isExhausted = f.available_amount < f.unit_cost;
              return (
                <option key={f.id} value={f.id} disabled={isExhausted}>
                  {f.file_no} — {f.item_name} {isExhausted ? ' (Budget Exhausted)' : ''}
                </option>
              );
            })}
        </select>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="label" htmlFor="fileCount">
          How many purchase files do you want to include?
        </label>
        <input
          id="fileCount"
          type="number"
          min={1}
          max={Math.min(50, budgetFiles.length || 1)}
          className="input-field w-32"
          value={selection.fileCount}
          onChange={(e) => {
            const count = Math.max(1, Math.min(50, Number(e.target.value) || 1));
            onChange({ fileCount: count, selectedFileIds: selection.selectedFileIds.slice(0, count) });
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {Array.from({ length: selection.fileCount }, (_, i) => renderFileSelect(i))}
      </div>

      <div>
        <label className="label" htmlFor="mop">
          Proposed mode of purchase <span className="text-red-500">*</span>
        </label>
        <select
          id="mop"
          required
          className="input-field bg-white"
          value={selection.procurementMethodId ?? ''}
          onChange={(e) => onChange({ procurementMethodId: Number(e.target.value) })}
        >
          <option value="" disabled>
            -- Select mode of purchase --
          </option>
          {procurementMethods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {budgetFiles.length === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
          No budget files are available for your department in the active financial year.
        </p>
      )}
    </div>
  );
};
