import React from 'react';
import type { User } from '../../../types';
import type { MsmeNoExceptionRoute, PRCommonFormState } from '../../../types/prCreation';
import { EMD_PERCENT_OPTIONS, PERFORMANCE_SECURITY_OPTIONS } from '../../../config/prCreationQuestions';
import { YesNoSelect } from '../YesNoSelect';

interface Props {
  common: PRCommonFormState;
  facultyOptions: Pick<User, 'id' | 'name' | 'email'>[];
  procurementName: string;
  onUpdate: (patch: Partial<PRCommonFormState>) => void;
}

const MSME_NO_ROUTE_OPTIONS: { value: MsmeNoExceptionRoute; label: string }[] = [
  { value: 'competitive', label: 'Full competitive criteria — no relaxation' },
  { value: 'gem', label: 'GeM / e-marketplace route — no relaxation' },
  { value: 'institute', label: 'Institute procurement policy — no relaxation' },
  { value: 'other', label: 'Other (specify)' },
];

export const StepCommonDetails: React.FC<Props> = ({
  common,
  facultyOptions,
  procurementName,
  onUpdate,
}) => (
  <div className="space-y-8">
    <p className="text-sm text-slate-600">
      Common fields for this request (procurement mode: <strong>{procurementName}</strong>).
    </p>

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

      <div>
        <label className="label">Additional faculty (optional)</label>
        <select
          className="input-field bg-white"
          value={common.nominee_id}
          onChange={(e) => onUpdate({ nominee_id: e.target.value })}
        >
          <option value="">— None —</option>
          {facultyOptions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.email})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Basis of estimation (PDF) *</label>
        <input
          type="file"
          accept="application/pdf"
          required
          className="input-field"
          onChange={(e) => onUpdate({ quotation_file: e.target.files?.[0] ?? null })}
        />
      </div>

      <div className="md:col-span-2">
        <label className="label">How basis of estimate has been made? *</label>
        <input
          type="text"
          required
          className="input-field"
          value={common.basis_of_estimate}
          onChange={(e) => onUpdate({ basis_of_estimate: e.target.value })}
        />
      </div>

      <div>
        <label className="label">EMD (%) *</label>
        <select
          required
          className="input-field bg-white"
          value={common.emd}
          onChange={(e) => onUpdate({ emd: e.target.value })}
        >
          <option value="" disabled>
            Select
          </option>
          {EMD_PERCENT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
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
          <option value="" disabled>
            Select
          </option>
          {PERFORMANCE_SECURITY_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>

    {/* Southern region service centre — NPFS: Yes opens justification */}
    <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-[#1a3a6b]">Southern region service centre</h3>
      <YesNoSelect
        label="Will a service centre in the southern region be used?"
        required
        value={common.is_service_center_south}
        onChange={(v) =>
          onUpdate({
            is_service_center_south: v,
            service_center_location: '',
            service_center_south_desc: '',
          })
        }
      />
      {common.is_service_center_south === 'Yes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-slate-200/80">
          <div className="md:col-span-2">
            <label className="label">Service centre location *</label>
            <input
              type="text"
              required
              className="input-field"
              placeholder="City, centre name, or address"
              value={common.service_center_location}
              onChange={(e) => onUpdate({ service_center_location: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Justification for using this service centre *</label>
            <input
              type="text"
              required
              className="input-field"
              placeholder="Why procurement is routed through this southern-region centre"
              value={common.service_center_south_desc}
              onChange={(e) => onUpdate({ service_center_south_desc: e.target.value })}
            />
          </div>
        </div>
      )}
      {common.is_service_center_south === 'No' && (
        <p className="text-sm text-slate-600 border-t border-slate-200/80 pt-3">
          No southern-region service centre is declared for this procurement. Delivery details below still apply.
        </p>
      )}
    </section>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

      <YesNoSelect
        label="Splitting of quantity?"
        required
        value={common.is_quantity_split}
        onChange={(v) => onUpdate({ is_quantity_split: v })}
      />

      {common.is_quantity_split === 'No' && (
        <div>
          <label className="label">Justification for non-splitting of quantity *</label>
          <input
            type="text"
            required
            className="input-field"
            value={common.split_quantity_justification}
            onChange={(e) => onUpdate({ split_quantity_justification: e.target.value })}
          />
        </div>
      )}

      <YesNoSelect
        label="Splitting of items?"
        required
        value={common.is_item_split}
        onChange={(v) => onUpdate({ is_item_split: v })}
      />

      {common.is_item_split === 'No' && (
        <div>
          <label className="label">Justification for non-splitting of items *</label>
          <input
            type="text"
            required
            className="input-field"
            value={common.split_items_justification}
            onChange={(e) => onUpdate({ split_items_justification: e.target.value })}
          />
        </div>
      )}
    </div>

    {/* MSE / startup — Yes: exception justification; No: structured compliance path */}
    <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-[#1a3a6b]">MSE / startup (experience &amp; turnover)</h3>
      <YesNoSelect
        label="Request exception for MSE/startup in experience & turnover?"
        required
        value={common.exemption}
        onChange={(v) =>
          onUpdate({
            exemption: v,
            exemption_remarks: '',
            msme_no_exception_route: '',
          })
        }
      />

      {common.exemption === 'Yes' && (
        <div className="pt-1 border-t border-slate-200/80">
          <label className="label">Justification for the exception *</label>
          <textarea
            required
            rows={3}
            className="input-field min-h-[88px]"
            placeholder="Why relaxation from standard MSE/startup norms is needed"
            value={common.exemption_remarks}
            onChange={(e) => onUpdate({ exemption_remarks: e.target.value })}
          />
        </div>
      )}

      {common.exemption === 'No' && (
        <div className="space-y-3 pt-1 border-t border-slate-200/80">
          <p className="text-sm text-slate-600">
            No exception — choose how standard participation rules will apply (streamlined declaration).
          </p>
          <fieldset className="space-y-2">
            <legend className="sr-only">Compliance when no MSE exception</legend>
            {MSME_NO_ROUTE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-start gap-3 cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-slate-300"
              >
                <input
                  type="radio"
                  name="msme_no_route"
                  required
                  className="mt-1"
                  checked={common.msme_no_exception_route === opt.value}
                  onChange={() =>
                    onUpdate({
                      msme_no_exception_route: opt.value,
                      exemption_remarks: opt.value === 'other' ? common.exemption_remarks : '',
                    })
                  }
                />
                <span className="text-sm text-slate-800">{opt.label}</span>
              </label>
            ))}
          </fieldset>
          {common.msme_no_exception_route === 'other' && (
            <div>
              <label className="label">Describe the compliance route *</label>
              <textarea
                required
                rows={2}
                className="input-field min-h-[72px]"
                placeholder="Briefly state which norms apply"
                value={common.exemption_remarks}
                onChange={(e) => onUpdate({ exemption_remarks: e.target.value })}
              />
            </div>
          )}
        </div>
      )}
    </section>

    <div className="md:col-span-2">
      <YesNoSelect
        label="Training or skill required?"
        required
        value={common.training_required}
        onChange={(v) => onUpdate({ training_required: v })}
      />
    </div>

    {common.training_required === 'Yes' && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <YesNoSelect
          label="User already trained?"
          required
          value={common.training_type}
          onChange={(v) => onUpdate({ training_type: v })}
        />
        <YesNoSelect
          label="Training part of procurement?"
          required
          value={common.training_vendor}
          onChange={(v) => onUpdate({ training_vendor: v })}
        />
      </div>
    )}
  </div>
);
