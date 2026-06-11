import React from 'react';
import { AlertCircle } from 'lucide-react';
import type { User } from '../../../types';
import type { PRCommonFormState } from '../../../types/prCreation';
import { EMD_PERCENT_OPTIONS, PERFORMANCE_SECURITY_OPTIONS } from '../../../config/prCreationQuestions';
import { DynamicFormRenderer } from '../../pr/DynamicFormRenderer';

interface Props {
  common: PRCommonFormState;
  procurementName: string;
  formSchema?: any;
  totalCost?: number;
  onUpdate: (patch: Partial<PRCommonFormState>) => void;
  isHod?: boolean;
  departmentFaculty?: any[];
}

export const StepCommonDetails: React.FC<Props> = ({
  common,
  procurementName,
  formSchema,
  totalCost = 0,
  onUpdate,
  isHod = false,
  departmentFaculty = [],
}) => {
  const getDisclaimer = () => {
    const name = procurementName.toLowerCase();
    if (name.includes('proprietary') || name.includes('pac')) {
      return {
        title: "Proprietary Article Certificate (PAC) Disclaimer",
        text: "The department proposed to procure the following item(s) on Proprietary Article Certificate (PAC) basis. The items are proprietary in nature. In case of discrepancy of proprietary nature, the department shall be responsible."
      };
    }
    if (name.includes('committee') || name.includes('lpc') || name.includes('limited tender')) {
      return {
        title: "Local Purchase Committee (LPC) - GFR 155 Disclaimer",
        text: "The department proposed to procure the above item(s) through Local Purchase Committee (LPC) as per GFR 155. It will be ensured that the indented item(s) are not available in GeM portal before processing the LPC. Further, the committee shall survey the market and record the certificate as per GFR 155 before placing the PO."
      };
    }
    if (name.includes('nomination') || name.includes('single tender') || name.includes('single source')) {
      return {
        title: "Nomination on Single Source Basis - GFR 194 Disclaimer",
        text: "The department proposed to procure the above item(s) through nomination on single source basis as per GFR 194. It is certified that these goods proposed to purchase are of the requisite quality and specification, the prices are reasonable, and the supplier is reliable."
      };
    }
    return null;
  };

  const disclaimer = getDisclaimer();
  const isPac = procurementName.toLowerCase().includes('proprietary') || procurementName.toLowerCase().includes('pac');

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">
          Common fields for this request (procurement mode: <strong>{procurementName}</strong>).
        </p>

        {disclaimer && (
          <div className="flex items-start gap-3 bg-amber-50/80 border border-amber-200 rounded-lg p-4 text-sm text-amber-950 shadow-xs">
            <AlertCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h5 className="font-bold text-xs uppercase tracking-wide text-amber-800 mb-1">{disclaimer.title}</h5>
              <p className="text-xs leading-relaxed text-amber-700 italic">"{disclaimer.text}"</p>
            </div>
          </div>
        )}
      </div>

      {isHod && departmentFaculty.length > 0 && (
        <div className="bg-[#f8fafc] border border-slate-205 rounded-xl p-5 space-y-4 shadow-sm border-l-4 border-l-[#1a3a6b]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-[#1a3a6b] inline-block" />
            <span className="text-xs font-bold text-[#1a3a6b] uppercase tracking-wider">
              Purchase Initiator Assignment
            </span>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Assign Purchase Initiator (Faculty Member) *</label>
            <select
              required
              className="input-field bg-white w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              value={common.initiator_id || ''}
              onChange={(e) => onUpdate({ initiator_id: e.target.value })}
            >
              <option value="" disabled>-- Select Faculty Member --</option>
              {departmentFaculty.map((f: any) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.email})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              Select a faculty member from your department to serve as the purchase initiator for this request.
            </p>
          </div>
        </div>
      )}

    {formSchema && (
      <div id="procurement-specific-fields" className="scroll-mt-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1 h-4 rounded-full bg-amber-500 inline-block" />
          <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
            {formSchema.title ?? 'Procurement-Specific Details'} — Fill all required fields below
          </span>
        </div>
        <DynamicFormRenderer
          schema={formSchema}
          value={common.form_data || {}}
          onChange={(val) => onUpdate({ form_data: val })}
        />
      </div>
    )}

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div>
        <label className="label">Purchase Type *</label>
        <select
          required
          className="input-field bg-white"
          value={common.purchase_type}
          onChange={(e) => onUpdate({ purchase_type: e.target.value as 'office' | 'department' })}
        >
          <option value="" disabled>Select Purchase Type</option>
          <option value="department">Departmental Purchase</option>
          <option value="office">Office Purchase</option>
        </select>
      </div>

      <div className="md:col-span-2">
        <label className="label">Laboratory / Office *</label>
        <input
          type="text"
          required
          className="input-field"
          placeholder="Name of laboratory / office"
          value={common.laboratory_office}
          onChange={(e) => onUpdate({ laboratory_office: e.target.value })}
        />
      </div>

      <div>
        <label className="label">Source of Fund *</label>
        <select
          required
          className="input-field bg-white"
          value={common.source_of_fund}
          onChange={(e) => onUpdate({
            source_of_fund: e.target.value as any,
            source_of_fund_project_code: '',
            source_of_fund_others: '',
          })}
        >
          <option value="" disabled>Select Source of Fund</option>
          <option value="OH-35">OH-35</option>
          <option value="OH-31">OH-31</option>
          <option value="SW">SW</option>
          <option value="SEED">SEED</option>
          <option value="Project code">Project code</option>
          <option value="Others">Others</option>
        </select>
      </div>

      {common.source_of_fund === 'Project code' && (
        <div>
          <label className="label">Project Code *</label>
          <input
            type="text"
            required
            className="input-field"
            placeholder="Enter project code details"
            value={common.source_of_fund_project_code}
            onChange={(e) => onUpdate({ source_of_fund_project_code: e.target.value })}
          />
        </div>
      )}

      {common.source_of_fund === 'Others' && (
        <div>
          <label className="label">Specify other source of fund *</label>
          <input
            type="text"
            required
            className="input-field"
            placeholder="Enter source of fund details"
            value={common.source_of_fund_others}
            onChange={(e) => onUpdate({ source_of_fund_others: e.target.value })}
          />
        </div>
      )}

      <div>
        <label className="label">BoG Resolution No (if applicable)</label>
        <input
          type="text"
          className="input-field"
          placeholder="e.g. BoG 64.3"
          value={common.bog_resolution_no}
          onChange={(e) => onUpdate({ bog_resolution_no: e.target.value })}
        />
      </div>

      <div>
        <label className="label">FC Resolution No (if applicable)</label>
        <input
          type="text"
          className="input-field"
          placeholder="e.g. FC 52.4"
          value={common.fc_resolution_no}
          onChange={(e) => onUpdate({ fc_resolution_no: e.target.value })}
        />
      </div>

      <div>
        <label className="label">Item Category *</label>
        <select
          required
          className="input-field bg-white"
          value={common.item_category}
          onChange={(e) => onUpdate({ item_category: e.target.value as any })}
        >
          <option value="" disabled>Select Item Category</option>
          <option value="Assets">Assets</option>
          <option value="Consumables">Consumables</option>
        </select>
      </div>

      <div>
        <label className="label">Basis of estimation (PDF) *</label>
        <input
          type="file"
          accept="application/pdf"
          required={!common.quotation_file}
          className="input-field"
          onChange={(e) => onUpdate({ quotation_file: e.target.files?.[0] ?? null })}
        />
        {common.quotation_file && (
          <div className="mt-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2.5 py-1 flex items-center gap-1.5 w-fit">
            <span>📄 Selected:</span>
            <span className="font-semibold">{common.quotation_file.name}</span>
          </div>
        )}
      </div>

      {isPac && (
        <>
          <div>
            <label className="label">Department PAC (PDF) *</label>
            <input
              type="file"
              accept="application/pdf"
              required={!common.dept_pac_file}
              className="input-field"
              onChange={(e) => onUpdate({ dept_pac_file: e.target.files?.[0] ?? null })}
            />
            {common.dept_pac_file && (
              <div className="mt-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2.5 py-1 flex items-center gap-1.5 w-fit">
                <span>📄 Selected:</span>
                <span className="font-semibold">{common.dept_pac_file.name}</span>
              </div>
            )}
          </div>

          <div>
            <label className="label">OEM PAC Certificate (PDF) *</label>
            <input
              type="file"
              accept="application/pdf"
              required={!common.oem_pac_file}
              className="input-field"
              onChange={(e) => onUpdate({ oem_pac_file: e.target.files?.[0] ?? null })}
            />
            {common.oem_pac_file && (
              <div className="mt-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2.5 py-1 flex items-center gap-1.5 w-fit">
                <span>📄 Selected:</span>
                <span className="font-semibold">{common.oem_pac_file.name}</span>
              </div>
            )}
          </div>

          <div>
            <label className="label">OEM Authorization Certificate (PDF) *</label>
            <input
              type="file"
              accept="application/pdf"
              required={!common.oem_auth_file}
              className="input-field"
              onChange={(e) => onUpdate({ oem_auth_file: e.target.files?.[0] ?? null })}
            />
            {common.oem_auth_file && (
              <div className="mt-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2.5 py-1 flex items-center gap-1.5 w-fit">
                <span>📄 Selected:</span>
                <span className="font-semibold">{common.oem_auth_file.name}</span>
              </div>
            )}
          </div>
        </>
      )}

      <div>
        <label className="label">Basis of Estimation *</label>
        <select
          required
          className="input-field bg-white"
          value={common.basis_of_estimate}
          onChange={(e) => onUpdate({
            basis_of_estimate: e.target.value as any,
            basis_of_estimate_others: '',
          })}
        >
          <option value="" disabled>Select Basis of Estimation</option>
          <option value="Budgetary Quote">Budgetary Quote</option>
          <option value="Previous Purchase">Previous Purchase</option>
          <option value="Market Survey">Market Survey</option>
          <option value="Others">Others</option>
        </select>
      </div>

      {common.basis_of_estimate === 'Others' && (
        <div className="md:col-span-2">
          <label className="label">Describe other basis of estimation *</label>
          <input
            type="text"
            required
            className="input-field"
            placeholder="Enter basis of estimation details"
            value={common.basis_of_estimate_others}
            onChange={(e) => onUpdate({ basis_of_estimate_others: e.target.value })}
          />
        </div>
      )}

      <div>
        <label className="label">EMD (%) *</label>
        <select
          required
          className="input-field bg-white"
          value={common.emd}
          onChange={(e) => onUpdate({ emd: e.target.value })}
        >
          <option value="" disabled>Select</option>
          {EMD_PERCENT_OPTIONS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Performance security (%) *</label>
        <select
          required
          className="input-field bg-white"
          value={common.performance_security}
          onChange={(e) => onUpdate({ performance_security: e.target.value })}
        >
          <option value="" disabled>Select</option>
          {PERFORMANCE_SECURITY_OPTIONS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Delivery location *</label>
        <input
          type="text"
          required
          className="input-field"
          value={common.delivery_location}
          onChange={(e) => onUpdate({ delivery_location: e.target.value })}
        />
      </div>

      <div>
        <label className="label">Delivery mode *</label>
        <input
          type="text"
          required
          className="input-field"
          value={common.delivery_mode}
          onChange={(e) => onUpdate({ delivery_mode: e.target.value })}
        />
      </div>

      <div>
        <label className="label">Purpose *</label>
        <select
          required
          className="input-field bg-white"
          value={common.purpose}
          onChange={(e) => onUpdate({
            purpose: e.target.value as any,
            purpose_justification: '',
          })}
        >
          <option value="" disabled>Select Purpose</option>
          <option value="Research">Research</option>
          <option value="Others">Others</option>
        </select>
      </div>

      {common.purpose === 'Others' && (
        <div className="md:col-span-2">
          <label className="label">Purpose Justification / Details *</label>
          <input
            type="text"
            required
            className="input-field"
            placeholder="Enter justification details"
            value={common.purpose_justification}
            onChange={(e) => onUpdate({ purpose_justification: e.target.value })}
          />
        </div>
      )}
    </div>

    {totalCost > 500000 && (
      <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[#1a3a6b] uppercase tracking-wider">
          Make in India (MII) Clause (Total Cost &gt; ₹5,00,000)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">MII Clause Applicability *</label>
            <select
              required
              className="input-field bg-white"
              value={common.mii_clause}
              onChange={(e) => onUpdate({
                mii_clause: e.target.value as any,
                mii_justification: '',
              })}
            >
              <option value="" disabled>Select Applicability</option>
              <option value="Applicable">Applicable</option>
              <option value="Not Applicable">Not Applicable</option>
            </select>
          </div>
          {common.mii_clause === 'Not Applicable' && (
            <div>
              <label className="label">Justification for MII Not Applicable *</label>
              <input
                type="text"
                required
                className="input-field"
                placeholder="State reason why MII clause is not applicable"
                value={common.mii_justification}
                onChange={(e) => onUpdate({ mii_justification: e.target.value })}
              />
            </div>
          )}
        </div>
      </section>
    )}
  </div>
  );
};
