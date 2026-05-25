import { yesNoToBool } from '../config/prCreationQuestions';
import type { PRCommonFormState, PRItemFormState } from '../types/prCreation';

/** Final text stored on PR when requesting or declining MSE/startup relaxation. */
export function buildExemptionRemarks(common: PRCommonFormState): string | null {
  if (common.exemption === 'Yes') {
    const t = common.exemption_remarks.trim();
    return t || null;
  }
  if (common.exemption === 'No') {
    const route = common.msme_no_exception_route;
    const fixed: Record<string, string> = {
      competitive:
        'Standard competitive eligibility (turnover/experience) will apply; no MSE/startup relaxation requested.',
      gem: 'Procurement via GeM / e-marketplace; no MSE/startup relaxation in experience & turnover.',
      institute: 'Institute procurement policy; no MSE/startup relaxation in experience & turnover.',
    };
    if (!route) return null;
    if (route === 'other') {
      const detail = common.exemption_remarks.trim();
      return detail ? `[No MSE/startup exception] Other: ${detail}` : null;
    }
    return `[No MSE/startup exception] ${fixed[route]}`;
  }
  return null;
}

export function buildPRCreateFormData(
  selectedFileIds: number[],
  procurementMethodId: number,
  items: Record<number, PRItemFormState>,
  common: PRCommonFormState
): FormData {
  const payload = {
    selected_file_ids: selectedFileIds,
    mop: procurementMethodId,
    purchase_type: common.purchase_type || 'departmental',
    nominee_id: common.nominee_id ? Number(common.nominee_id) : null,
    basis_of_estimate: common.basis_of_estimate,
    emd: Number(common.emd),
    performance_security: Number(common.performance_security),
    is_service_center_south: yesNoToBool(common.is_service_center_south),
    service_center_location:
      common.is_service_center_south === 'Yes' ? common.service_center_location.trim() || null : null,
    service_center_south_desc:
      common.is_service_center_south === 'Yes' ? common.service_center_south_desc.trim() || null : null,
    delivery_location: common.delivery_location,
    delivery_mode: common.delivery_mode,
    is_quantity_split: yesNoToBool(common.is_quantity_split),
    split_quantity_justification: common.split_quantity_justification || null,
    is_item_split: yesNoToBool(common.is_item_split),
    split_items_justification: common.split_items_justification || null,
    exemption: yesNoToBool(common.exemption),
    exemption_remarks: buildExemptionRemarks(common),
    training_required: yesNoToBool(common.training_required),
    training_type: common.training_required === 'Yes' ? common.training_type : null,
    training_vendor: common.training_required === 'Yes' ? common.training_vendor : null,
    items: selectedFileIds.map((fileId) => {
      const item = items[fileId];
      return {
        budget_file_id: fileId,
        charges: item.charges ? Number(item.charges) : null,
        requirement_type: item.requirement_type,
        warranty: item.warranty ? Number(item.warranty) : null,
        delivery_period: item.delivery_period ? Number(item.delivery_period) : null,
        installation_required: yesNoToBool(item.installation_required),
        site_readiness: yesNoToBool(item.site_readiness),
        site_readiness_remarks: item.site_readiness_remarks || null,
        gem_link: item.gem_link || null,
        availability: item.availability,
        availability_remarks: null,
        present_stock: item.present_stock || null,
        justification_for_procurement: item.justification_for_procurement || null,
        previous_file_no_reference: item.previous_file_no_reference || null,
        tech_specs_text: item.tech_specs_text,
      };
    }),
  };

  const form = new FormData();
  form.append('payload', JSON.stringify(payload));

  if (common.quotation_file) {
    form.append('quotation_file', common.quotation_file);
  }

  selectedFileIds.forEach((fileId, index) => {
    const item = items[fileId];
    if (item.tech_specs_file) {
      form.append(`tech_specs_file_${index}`, item.tech_specs_file);
    }
    if (item.gem_nac_file) {
      form.append(`gem_nac_file_${index}`, item.gem_nac_file);
    }
  });

  return form;
}
