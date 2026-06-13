import { yesNoToBool } from '../config/prCreationQuestions';
import type { PRCommonFormState, PRItemFormState } from '../types/prCreation';

export function buildPRCreateFormData(
  selectedFileIds: number[],
  procurementMethodId: number,
  items: Record<number, PRItemFormState>,
  common: PRCommonFormState,
  administrativeApprovalId?: number | null
): FormData {
  const specs: Record<string, any> = {};
  selectedFileIds.forEach((fileId) => {
    const item = items[fileId];
    specs[String(fileId)] = {
      equipment_name: item.equipment_name,
      pdi_required: item.pdi_required,
      pdi_justification: item.pdi_required === 'Yes' ? item.pdi_justification : '',
      pre_bid_required: item.pre_bid_required,
      installation_scope: item.installation_required === 'Yes' ? item.installation_scope : '',
      training_required: item.training_required,
      training_location: item.training_required === 'Yes' ? item.training_location : '',
      tech_eligibility: item.tech_eligibility,
    };
  });

  const payload = {
    selected_file_ids: selectedFileIds,
    mop: procurementMethodId,
    purchase_type: common.purchase_type || 'departmental',
    nominee_id: common.nominee_id ? Number(common.nominee_id) : null,
    initiator_id: common.initiator_id ? Number(common.initiator_id) : null,
    administrative_approval_id: administrativeApprovalId || null,
    basis_of_estimate: common.basis_of_estimate === 'Others' ? common.basis_of_estimate_others : common.basis_of_estimate,
    basis_of_estimate_others: common.basis_of_estimate === 'Others' ? common.basis_of_estimate_others : null,
    emd: Number(common.emd),
    performance_security: Number(common.performance_security),
    delivery_location: common.delivery_location,
    delivery_mode: common.delivery_mode,

    // GFR defaults
    is_service_center_south: false,
    service_center_location: null,
    service_center_south_desc: null,
    is_quantity_split: false,
    split_quantity_justification: null,
    is_item_split: false,
    split_items_justification: null,
    exemption: false,
    exemption_remarks: null,
    training_required: false,
    training_type: null,
    training_vendor: null,

    // New common fields
    laboratory_office: common.laboratory_office,
    source_of_fund: common.source_of_fund,
    source_of_fund_project_code: common.source_of_fund === 'Project code' ? common.source_of_fund_project_code : null,
    source_of_fund_others: common.source_of_fund === 'Others' ? common.source_of_fund_others : null,
    bog_resolution_no: common.bog_resolution_no || null,
    fc_resolution_no: common.fc_resolution_no || null,
    item_category: common.item_category,
    purpose: common.purpose,
    purpose_justification: common.purpose === 'Others' ? common.purpose_justification : null,
    mii_clause: common.mii_clause,
    mii_justification: common.mii_clause === 'Not Applicable' ? common.mii_justification : null,

    items: selectedFileIds.map((fileId) => {
      const item = items[fileId];
      return {
        budget_file_id: fileId,
        quantity: Number(item.quantity) || 1,
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
    form_data: {
      ...(common.form_data || {}),
      specs,
    },
  };

  const form = new FormData();
  form.append('payload', JSON.stringify(payload));

  if (common.quotation_file) {
    form.append('quotation_file', common.quotation_file);
  }

  if (common.dept_pac_file) {
    form.append('dept_pac_file', common.dept_pac_file);
  }
  if (common.oem_pac_file) {
    form.append('oem_pac_file', common.oem_pac_file);
  }
  if (common.oem_auth_file) {
    form.append('oem_auth_file', common.oem_auth_file);
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
