import React, { useEffect, useState } from 'react';
import type { BudgetFile, ProcurementMethod } from '../../../types';
import type { PRWizardSelection } from '../../../types/prCreation';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

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
  const [filterTexts, setFilterTexts] = useState<Record<number, string>>({});
  const { isRole } = useAuth();
  const isHod = isRole('hod');

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

    const filterText = (filterTexts[index] || '').toLowerCase().trim();
    const filtered = budgetFiles.filter((f) => {
      if (f.id === current) return true;
      if (usedElsewhere.has(f.id)) return false;
      if (!filterText) return true;
      return (
        f.file_no.toLowerCase().includes(filterText) ||
        f.item_name.toLowerCase().includes(filterText)
      );
    });

    const displayLimit = 50;
    const sliced = filtered.slice(0, displayLimit);
    const hasMore = filtered.length > displayLimit;

    return (
      <div key={index} className="space-y-2 p-4 border border-slate-200 rounded-lg bg-slate-50/50">
        <label className="label font-semibold text-slate-700">{index + 1}) Select budget file</label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by file no or item name..."
            className="input-field text-sm w-full bg-white border border-slate-350"
            value={filterTexts[index] || ''}
            onChange={(e) => {
              setFilterTexts((prev) => ({ ...prev, [index]: e.target.value }));
            }}
          />
          {filterTexts[index] && (
            <button
              type="button"
              onClick={() => setFilterTexts((prev) => ({ ...prev, [index]: '' }))}
              className="px-3 text-xs bg-slate-200 hover:bg-slate-300 border border-slate-350 rounded font-semibold transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <select
          className="input-field bg-white w-full border border-slate-350"
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
          {sliced.map((f) => {
            const isExhausted = (f.available_balance ?? f.available_amount) < f.unit_cost;
            return (
              <option key={f.id} value={f.id} disabled={isExhausted}>
                {f.file_no} — {f.item_name} {isExhausted ? ' (Budget Exhausted)' : ''}
              </option>
            );
          })}
        </select>
        {hasMore && (
          <p className="text-[11px] text-slate-500 font-medium">
            Showing first {displayLimit} of {filtered.length} matching files. Type in search box above to filter.
          </p>
        )}
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

      {isHod && (
        <div className="flex justify-end pt-2">
          <Link
            to="/budget/create?redirect=/pr/create"
            className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-4 py-2 rounded-lg transition-all shadow-xs hover:shadow-sm"
          >
            <Plus size={14} /> Create/Request New Budget File
          </Link>
        </div>
      )}
    </div>
  );
};
