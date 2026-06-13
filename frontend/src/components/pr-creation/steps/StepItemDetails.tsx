import React from 'react';
import type { BudgetFile } from '../../../types';
import type { PRItemFormState } from '../../../types/prCreation';
import { REQUIREMENT_TYPES, isGemProcurement } from '../../../config/prCreationQuestions';
import { YesNoSelect } from '../YesNoSelect';
import { formatCurrency, formatFileNo } from '../../../utils/format';
import { useAuth } from '../../../context/AuthContext';

interface Props {
  files: BudgetFile[];
  items: Record<number, PRItemFormState>;
  procurementName: string;
  onUpdate: (fileId: number, patch: Partial<PRItemFormState>) => void;
  administrativeApprovalId?: number | null;
  approvedAAs?: any[];
}

export const StepItemDetails: React.FC<Props> = ({
  files,
  items,
  procurementName,
  onUpdate,
  administrativeApprovalId = null,
  approvedAAs = [],
}) => {
  const { user } = useAuth();
  const isGem = isGemProcurement(procurementName);

  return (
    <div className="space-y-8">
      {files.map((file, index) => {
        const item = items[file.id] ?? { budget_file_id: file.id };
        const fid = file.id;

        // Retrieve selected AA cost if this is the budget file linked to it
        const selectedAA = administrativeApprovalId
          ? approvedAAs.find((a) => a.id === administrativeApprovalId && a.budget_file_id === fid)
          : null;
        const aaCost = selectedAA ? selectedAA.total_cost : 0;
        const availableAmount = (file.available_balance ?? file.available_amount) + aaCost;

        return (
          <section key={fid} className="card p-6 space-y-5">
            <h3 className="text-lg font-bold text-[#1a3a6b] border-b border-slate-200 pb-2">
              {index + 1}) {formatFileNo(file.file_no, user?.role?.group_key)} — {file.item_name}
              <span className="ml-2 text-sm font-normal text-slate-500">({formatCurrency(file.total_allocation ?? file.total_cost)})</span>
            </h3>

            {/* Budget Details Card */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="block text-slate-500 font-semibold uppercase tracking-wider mb-0.5">Allocated Qty</span>
                <span className="font-bold text-sm text-slate-800">{file.quantity}</span>
              </div>
              <div>
                <span className="block text-slate-500 font-semibold uppercase tracking-wider mb-0.5">Unit Cost</span>
                <span className="font-bold text-sm text-slate-800">{formatCurrency(file.unit_cost)}</span>
              </div>
              <div>
                <span className="block text-slate-500 font-semibold uppercase tracking-wider mb-0.5">Available Balance</span>
                <span className="font-bold text-sm text-emerald-700">{formatCurrency(availableAmount)}</span>
              </div>
              <div>
                <span className="block text-slate-500 font-semibold uppercase tracking-wider mb-0.5">Max Purchase Qty</span>
                <span className="font-bold text-sm text-blue-700">
                  {Math.floor(availableAmount / file.unit_cost)}
                </span>
              </div>
            </div>

            {/* Warning banner if budget is exhausted */}
            {Math.floor(availableAmount / file.unit_cost) <= 0 && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 text-sm space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-red-900">
                  <span>⚠️</span> Budget Exhausted
                </div>
                <p className="text-xs text-red-700">
                  The available budget for this file ({formatCurrency(availableAmount)}) is less than the unit cost ({formatCurrency(file.unit_cost)}). No units can be purchased.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="label">Quantity to Purchase *</label>
                <input
                  type="number"
                  min={1}
                  required
                  className="input-field font-medium text-slate-750 disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-slate-100/50"
                  value={item.quantity || ''}
                  onChange={(e) => onUpdate(fid, { quantity: e.target.value })}
                  disabled={!!administrativeApprovalId}
                />
                <span className="text-xs text-slate-500 mt-1 block font-medium">
                  Base Cost: <span className="text-slate-700 font-bold">{formatCurrency((Number(item.quantity) || 0) * file.unit_cost)}</span>
                  {' | '}
                  Total Cost (incl. GST): <strong className="text-[#1a3a6b] font-bold">{formatCurrency(((Number(item.quantity) || 0) * file.unit_cost) * (1 + (Number(item.charges) || 0) / 100))}</strong>
                </span>
              </div>

              <div>
                <label className="label">GST &amp; Charges (%) *</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  required
                  className="input-field disabled:opacity-75 disabled:cursor-not-allowed disabled:bg-slate-100/50"
                  value={item.charges}
                  onChange={(e) => onUpdate(fid, { charges: e.target.value })}
                  disabled={!!administrativeApprovalId}
                />
                <span className="text-xs text-slate-500 mt-1 block font-medium">
                  GST Amount: <span className="text-slate-700 font-bold">{formatCurrency(((Number(item.quantity) || 0) * file.unit_cost) * (Number(item.charges) || 0) / 100)}</span>
                </span>
              </div>

              <div>
                <label className="label">Nature of Requirement *</label>
                <select
                  required
                  className="input-field bg-white"
                  value={item.requirement_type}
                  onChange={(e) => onUpdate(fid, { requirement_type: e.target.value as PRItemFormState['requirement_type'] })}
                >
                  <option value="" disabled>Select</option>
                  {REQUIREMENT_TYPES.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Warranty (months) *</label>
                <input type="number" min={0} required className="input-field" value={item.warranty}
                  onChange={(e) => onUpdate(fid, { warranty: e.target.value })} />
              </div>

              <div>
                <label className="label">Delivery Period (weeks) *</label>
                <input type="number" min={0} required className="input-field" value={item.delivery_period}
                  onChange={(e) => onUpdate(fid, { delivery_period: e.target.value })} />
              </div>

              <YesNoSelect label="Installation Required?" required value={item.installation_required}
                onChange={(v) => onUpdate(fid, { installation_required: v })} />

              <YesNoSelect label="Site Readiness" required value={item.site_readiness}
                onChange={(v) => onUpdate(fid, { site_readiness: v })} />

              {item.site_readiness === 'No' && (
                <div className="md:col-span-2">
                  <label className="label">Remarks on Site Readiness *</label>
                  <input type="text" required className="input-field" value={item.site_readiness_remarks}
                    onChange={(e) => onUpdate(fid, { site_readiness_remarks: e.target.value })} />
                </div>
              )}

              {isGem ? (
                <div className="md:col-span-2">
                  <label className="label">GeM Product Link *</label>
                  <input type="url" required className="input-field" placeholder="https://gem.gov.in/..."
                    value={item.gem_link} onChange={(e) => onUpdate(fid, { gem_link: e.target.value })} />
                </div>
              ) : (
                <div className="md:col-span-2">
                  <label className="label">GeM Non-Availability Certificate (PDF) *</label>
                  <input type="file" accept="application/pdf" required={!item.gem_nac_file} className="input-field"
                    onChange={(e) => onUpdate(fid, { gem_nac_file: e.target.files?.[0] ?? null })} />
                  {item.gem_nac_file && (
                    <div className="mt-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2.5 py-1 flex items-center gap-1.5 w-fit">
                      <span>📄 Selected:</span>
                      <span className="font-semibold">{item.gem_nac_file.name}</span>
                    </div>
                  )}
                </div>
              )}

              <YesNoSelect label="Availability in Department?" required value={item.availability}
                onChange={(v) => onUpdate(fid, { availability: v })} />

              {item.availability === 'Yes' && (
                <>
                  <div>
                    <label className="label">Present Stock *</label>
                    <input type="text" required className="input-field" value={item.present_stock}
                      onChange={(e) => onUpdate(fid, { present_stock: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Justification for Procurement *</label>
                    <input type="text" required className="input-field" value={item.justification_for_procurement}
                      onChange={(e) => onUpdate(fid, { justification_for_procurement: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Previous File No. Reference *</label>
                    <input type="text" required className="input-field" value={item.previous_file_no_reference}
                      onChange={(e) => onUpdate(fid, { previous_file_no_reference: e.target.value })} />
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="label">Brief Tentative Specifications *</label>
              <textarea required rows={4} className="input-field min-h-[100px]" value={item.tech_specs_text}
                onChange={(e) => onUpdate(fid, { tech_specs_text: e.target.value })} />
            </div>

            <div>
              <label className="label">Upload Tech Spec (PDF) *</label>
              <input type="file" accept="application/pdf" required={!item.tech_specs_file} className="input-field"
                onChange={(e) => onUpdate(fid, { tech_specs_file: e.target.files?.[0] ?? null })} />
              {item.tech_specs_file && (
                <div className="mt-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2.5 py-1 flex items-center gap-1.5 w-fit">
                  <span>📄 Selected:</span>
                  <span className="font-semibold">{item.tech_specs_file.name}</span>
                </div>
              )}
            </div>
            {/* Technical Sub-Committee Specifications Annexure Fields */}
            <div className="border-t border-slate-200 pt-4 space-y-4">
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Technical Specifications &amp; Committee Details (Annexure)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="label">Name of Equipment *</label>
                  <input
                    type="text"
                    required
                    className="input-field"
                    placeholder="e.g. High Performance Server Module"
                    value={item.equipment_name || ''}
                    onChange={(e) => onUpdate(fid, { equipment_name: e.target.value })}
                  />
                </div>

                <YesNoSelect
                  label="Pre-Dispatch Inspection (PDI) Required?"
                  required
                  value={item.pdi_required || ''}
                  onChange={(v) => onUpdate(fid, { pdi_required: v as any })}
                />

                {item.pdi_required === 'Yes' && (
                  <div className="md:col-span-2">
                    <label className="label">Justification for PDI *</label>
                    <input
                      type="text"
                      required
                      className="input-field"
                      placeholder="Enter justification..."
                      value={item.pdi_justification || ''}
                      onChange={(e) => onUpdate(fid, { pdi_justification: e.target.value })}
                    />
                  </div>
                )}

                <YesNoSelect
                  label="Pre-bid Meeting Required?"
                  required
                  value={item.pre_bid_required || ''}
                  onChange={(v) => onUpdate(fid, { pre_bid_required: v as any })}
                />

                {item.installation_required === 'Yes' && (
                  <div>
                    <label className="label">Scope of Installation *</label>
                    <select
                      required
                      className="input-field bg-white"
                      value={item.installation_scope || ''}
                      onChange={(e) => onUpdate(fid, { installation_scope: e.target.value as any })}
                    >
                      <option value="" disabled>Select Scope</option>
                      <option value="Supplier">Supplier</option>
                      <option value="Department">Department</option>
                    </select>
                  </div>
                )}

                <YesNoSelect
                  label="Training Required?"
                  required
                  value={item.training_required || ''}
                  onChange={(v) => onUpdate(fid, { training_required: v as any })}
                />

                {item.training_required === 'Yes' && (
                  <div>
                    <label className="label">Training Location *</label>
                    <select
                      required
                      className="input-field bg-white"
                      value={item.training_location || ''}
                      onChange={(e) => onUpdate(fid, { training_location: e.target.value as any })}
                    >
                      <option value="" disabled>Select Location</option>
                      <option value="Purchaser's Premises">Purchaser's Premises</option>
                      <option value="Supplier's Premises">Supplier's Premises</option>
                    </select>
                  </div>
                )}

                <div className="md:col-span-2">
                  <label className="label">Technical Eligibility Criteria (for bidders) *</label>
                  <textarea
                    required
                    rows={3}
                    className="input-field min-h-[80px]"
                    placeholder="Specify minimum experience, certifications, etc."
                    value={item.tech_eligibility || ''}
                    onChange={(e) => onUpdate(fid, { tech_eligibility: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};
