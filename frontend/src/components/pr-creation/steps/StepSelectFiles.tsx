import React, { useEffect, useState } from 'react';
import type { BudgetFile, ProcurementMethod } from '../../../types';
import type { PRWizardSelection } from '../../../types/prCreation';
import { Link } from 'react-router-dom';
import { Plus, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { formatFileNo, formatCurrency, formatIndianNumber } from '../../../utils/format';

// Maps AA mode_of_procurement labels to PR workflow method canonical names
const AA_TO_PR_METHOD: Record<string, string> = {
  pac: 'proprietary purchase',
  'proprietary purchase': 'proprietary purchase',
  nomination: 'proprietary purchase',
  'single tender': 'proprietary purchase',
  'limited tender enquiry': 'limited tender',
  'limited tender': 'limited tender',
  'global tender enquiry': 'cppp',
  'global tender': 'cppp',
  'open tender': 'cppp',
  gem: 'gem',
  cppp: 'cppp',
  'direct purchase (gfr 154)': 'direct purchase',
  'direct purchase': 'direct purchase',
  'committee purchase (gfr 155)': 'direct purchase',
  'committee purchase': 'direct purchase',
  'rate contract': 'direct purchase',
  'local purchase': 'direct purchase',
};

function resolveMethod(mopName: string, methods: ProcurementMethod[]): ProcurementMethod | undefined {
  const key = mopName.toLowerCase().trim();
  const target = AA_TO_PR_METHOD[key];
  if (target) {
    const hit = methods.find((m) => m.name.toLowerCase() === target ||
      m.name.toLowerCase().includes(target) || target.includes(m.name.toLowerCase()));
    if (hit) return hit;
  }
  return methods.find((m) => m.name.toLowerCase().includes(key) || key.includes(m.name.toLowerCase()));
}

interface Props {
  budgetFiles: BudgetFile[];
  procurementMethods: ProcurementMethod[];
  selection: PRWizardSelection;
  approvedAAs: any[];
  loadingAAs: boolean;
  onChange: (patch: Partial<PRWizardSelection>) => void;
}

export const StepSelectFiles: React.FC<Props> = ({
  budgetFiles,
  procurementMethods,
  selection,
  approvedAAs,
  loadingAAs,
  onChange,
}) => {
  const { user } = useAuth();
  const [filterTexts, setFilterTexts] = useState<Record<number, string>>({});

  useEffect(() => {
    const count = selection.fileCount;
    if (selection.selectedFileIds.length > count) {
      onChange({ selectedFileIds: selection.selectedFileIds.slice(0, count) });
    }
  }, [selection.fileCount, selection.selectedFileIds, onChange]);

  const selectedAA = React.useMemo(() => {
    if (!selection.administrativeApprovalId) return null;
    return approvedAAs.find((a) => a.id === selection.administrativeApprovalId);
  }, [approvedAAs, selection.administrativeApprovalId]);

  const renderFileSelect = (index: number) => {
    const current = selection.selectedFileIds[index] ?? null;

    if (selection.administrativeApprovalId) {
      // Read-only selected budget file from Administrative Approval
      const file = budgetFiles.find((f) => f.id === current);
      return (
        <div key={index} className="p-4 border border-emerald-250 rounded-lg bg-emerald-50/25 space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold uppercase tracking-wider">
            <CheckCircle2 size={14} className="text-emerald-600" /> Pre-Selected Budget File (From Approved AA)
          </div>
          <div className="text-sm font-bold text-slate-800 mt-1">
            {file ? `${formatFileNo(file.file_no, user?.role?.group_key)} — ${file.item_name}` : 'Loading...'}
          </div>
          {file && (
            <div className="grid grid-cols-2 gap-4 text-xs text-slate-500 font-semibold pt-1">
              <div>Allocated: {formatCurrency(file.total_allocation)}</div>
              <div>Available: {formatCurrency(file.available_amount)}</div>
            </div>
          )}
        </div>
      );
    }

    const usedElsewhere = new Set(
      selection.selectedFileIds.filter((_, i) => i !== index)
    );

    const filterText = (filterTexts[index] || '').toLowerCase().trim();
    const filtered = budgetFiles.filter((f) => {
      if (f.id === current) return true;
      if (usedElsewhere.has(f.id)) return false;
      if (f.file_no.toUpperCase().startsWith('TEMP')) return false;
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
            let available = f.available_balance ?? f.available_amount;
            if (selectedAA && selectedAA.budget_file_id === f.id) {
              available += selectedAA.total_cost;
            }
            const isExhausted = available < f.unit_cost;
            return (
              <option key={f.id} value={f.id} disabled={isExhausted}>
                {formatFileNo(f.file_no, user?.role?.group_key)} — {f.item_name} {isExhausted ? ' (Budget Exhausted)' : ''}
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
      {/* Pre-requisite step: Administrative Approval */}
      <div className="p-5 border border-blue-200 rounded-lg bg-blue-50/20 space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-[#1a3a6b] font-bold uppercase tracking-wider">
          <Info size={15} /> Pre-requisite Approval Step
        </div>
        <p className="text-xs text-slate-600 leading-relaxed font-semibold">
          Procurement requests must have an approved Administrative Approval before proceeding to the Indent and Technical Specification stage.
        </p>

        {loadingAAs ? (
          <div className="text-slate-500 text-xs flex items-center gap-1.5 pt-1">
            <Plus className="animate-spin" size={14} /> Loading your approved Administrative Approvals...
          </div>
        ) : approvedAAs.length === 0 ? (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded text-xs mt-2">
            <span className="font-bold">No Approved Administrative Approvals Found:</span> You do not have any Administrative Approvals with status &quot;Administrative Approval Granted&quot;. Please submit an Administrative Approval request first and wait for Director approval.
            <div className="mt-2.5">
              <Link
                to="/administrative-approvals/create"
                className="inline-flex items-center gap-1 text-xs text-blue-700 font-bold hover:underline"
              >
                Create Administrative Approval Request →
              </Link>
            </div>
          </div>
        ) : (
          <div className="pt-2 space-y-3">
            <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Choose Approved Administrative Reference <span className="text-rose-500">*</span>
            </label>
            <select
              className="w-full border border-slate-350 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b] bg-white"
              value={selection.administrativeApprovalId ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  onChange({
                    administrativeApprovalId: null,
                    selectedFileIds: [],
                    fileCount: 1,
                    procurementMethodId: null,
                  });
                  return;
                }
                const id = Number(val);
                const aa = approvedAAs.find((a) => a.id === id);
                if (aa) {
                  const method = resolveMethod(aa.mode_of_procurement || '', procurementMethods);
                  onChange({
                    administrativeApprovalId: id,
                    selectedFileIds: [aa.budget_file_id],
                    fileCount: 1,
                    procurementMethodId: method ? method.id : null,
                  });
                }
              }}
              required
            >
              <option value="">-- Select approved Administrative Approval --</option>
              {approvedAAs.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.aa_number} | {a.item_name} ({formatCurrency(a.total_cost)})
                </option>
              ))}
            </select>
            </div>

            {/* Show selected AA details + procurement method resolved */}
            {selectedAA && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-xs">
                <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider mb-1">Administrative Approval Reference Details</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-600">
                  <span className="font-semibold">File No:</span><span>{selectedAA.file_no || '—'}</span>
                  <span className="font-semibold">Name of the Department:</span><span>{selectedAA.department || selectedAA.pi_department_name || '—'}</span>
                  <span className="font-semibold">Name of the purchase Indentor:</span><span>{selectedAA.pi_name || '—'}</span>
                  <span className="font-semibold">Source of Fund:</span><span>{selectedAA.source_of_fund || '—'}</span>
                  <span className="font-semibold">Mode of Purchase:</span><span>{selectedAA.mode_of_procurement || '—'}</span>
                  <span className="font-semibold">Estimated amount:</span><span>{formatCurrency(selectedAA.total_cost)}</span>
                </div>
                {selection.procurementMethodId ? (
                  <div className="flex items-center gap-1.5 pt-1 text-emerald-700">
                    <CheckCircle2 size={13} />
                    <span className="font-semibold">Procurement method auto-selected: <span className="text-emerald-800">{procurementMethods.find((m) => m.id === selection.procurementMethodId)?.name}</span></span>
                  </div>
                ) : (
                  <div className="pt-2 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-amber-700">
                      <AlertCircle size={13} />
                      <span className="font-semibold">Could not auto-map &quot;{selectedAA.mode_of_procurement}&quot; to a PR workflow method. Please select manually:</span>
                    </div>
                    <select
                      className="w-full border border-amber-300 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                      value={selection.procurementMethodId ?? ''}
                      onChange={(e) => onChange({ procurementMethodId: e.target.value ? Number(e.target.value) : null })}
                      required
                    >
                      <option value="">-- Select procurement method --</option>
                      {procurementMethods.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual selection fallback only if not choosing from AA (but we enforce selection) */}
      {!selection.administrativeApprovalId && approvedAAs.length > 0 && (
        <div className="text-center text-xs text-slate-400 font-bold pt-4 border-t border-slate-100">
          Please select an approved Administrative Reference above to proceed.
        </div>
      )}
    </div>
  );
};
