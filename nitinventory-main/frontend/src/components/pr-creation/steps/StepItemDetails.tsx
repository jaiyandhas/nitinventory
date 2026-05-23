import React from 'react';
import type { BudgetFile } from '../../../types';
import type { PRItemFormState } from '../../../types/prCreation';
import { REQUIREMENT_TYPES, isGemProcurement } from '../../../config/prCreationQuestions';
import { YesNoSelect } from '../YesNoSelect';
import { formatCurrency } from '../../../utils/format';

interface Props {
  files: BudgetFile[];
  items: Record<number, PRItemFormState>;
  procurementName: string;
  onUpdate: (fileId: number, patch: Partial<PRItemFormState>) => void;
}

export const StepItemDetails: React.FC<Props> = ({ files, items, procurementName, onUpdate }) => {
  const isGem = isGemProcurement(procurementName);

  return (
    <div className="space-y-8">
      {files.map((file, index) => {
        const item = items[file.id] ?? { budget_file_id: file.id };
        const fid = file.id;

        return (
          <section key={fid} className="card p-6 space-y-5">
            <h3 className="text-lg font-bold text-[#1a3a6b] border-b border-slate-200 pb-2">
              {index + 1}) {file.file_no} — {file.item_name}
              <span className="ml-2 text-sm font-normal text-slate-500">({formatCurrency(file.total_cost)})</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="label">GST &amp; Charges (%) *</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  required
                  className="input-field"
                  value={item.charges}
                  onChange={(e) => onUpdate(fid, { charges: e.target.value })}
                />
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
                  <input
                    type="file"
                    accept="application/pdf"
                    required={!item.gem_nac_file}
                    className="input-field"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUpdate(fid, { gem_nac_file: file });
                    }}
                  />
                  {item.gem_nac_file && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 w-fit font-medium">
                      <span className="font-semibold">✓ Current File:</span>
                      <span>{item.gem_nac_file.name}</span>
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
              <input
                type="file"
                accept="application/pdf"
                required={!item.tech_specs_file}
                className="input-field"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUpdate(fid, { tech_specs_file: file });
                }}
              />
              {item.tech_specs_file && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 w-fit font-medium">
                  <span className="font-semibold">✓ Current File:</span>
                  <span>{item.tech_specs_file.name}</span>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};
