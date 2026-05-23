/**
 * Purchase Request creation field map — aligned with NPFS initiator/2_purchase_form.php.
 * Used by the PR wizard for rendering, validation, and API payload assembly.
 */

export const REQUIREMENT_TYPES = [
  'Teaching / Laboratory',
  'Research',
  'Office',
  'Institute',
] as const;

export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const EMD_PERCENT_OPTIONS = [2, 3, 4, 5] as const;
export const PERFORMANCE_SECURITY_OPTIONS = [3, 4, 5] as const;

export const PR_CREATION_STEPS = [
  { id: 'select', label: 'Select Files', description: 'Choose budget files and mode of procurement' },
  { id: 'review', label: 'Review Selection', description: 'Confirm selected files before detailed questions' },
  { id: 'items', label: 'Item Details', description: 'Per-file procurement questions' },
  { id: 'common', label: 'Common Details', description: 'Details applied to the entire purchase request' },
  { id: 'submit', label: 'Review & Submit', description: 'Terms acceptance and confirmation' },
] as const;

export type PRWizardStepId = (typeof PR_CREATION_STEPS)[number]['id'];

/** Per budget-file fields collected in step "items". */
export const PER_ITEM_FIELDS = {
  charges: { label: 'GST & Charges (%)', type: 'number', required: true, min: 0, max: 100 },
  requirement_type: { label: 'Nature of Requirement', type: 'select', required: true, options: REQUIREMENT_TYPES },
  warranty: { label: 'Warranty (months)', type: 'number', required: true, min: 0 },
  delivery_period: { label: 'Delivery Period (weeks)', type: 'number', required: true, min: 0 },
  installation_required: { label: 'Installation Required?', type: 'yesno', required: true },
  site_readiness: { label: 'Site Readiness', type: 'yesno', required: true },
  site_readiness_remarks: {
    label: 'Remarks on Site Readiness',
    type: 'text',
    required: true,
    showWhen: { field: 'site_readiness', equals: 'No' },
  },
  gem_link: {
    label: 'GeM Product Link',
    type: 'url',
    required: true,
    showWhen: { field: '_procurement_is_gem', equals: true },
  },
  gem_nac_file: {
    label: 'GeM Non-Availability Certificate (PDF)',
    type: 'file',
    accept: 'application/pdf',
    required: true,
    showWhen: { field: '_procurement_is_gem', equals: false },
  },
  availability: { label: 'Availability in Department?', type: 'yesno', required: true },
  present_stock: {
    label: 'Present Stock',
    type: 'text',
    required: true,
    showWhen: { field: 'availability', equals: 'Yes' },
  },
  justification_for_procurement: {
    label: 'Justification for Present Procurement',
    type: 'text',
    required: true,
    showWhen: { field: 'availability', equals: 'Yes' },
  },
  previous_file_no_reference: {
    label: 'Reference of Previous File No.',
    type: 'text',
    required: true,
    showWhen: { field: 'availability', equals: 'Yes' },
  },
  tech_specs_text: { label: 'Brief Tentative Specifications', type: 'textarea', required: true },
  tech_specs_file: { label: 'Tech Spec (PDF)', type: 'file', accept: 'application/pdf', required: true },
} as const;

/** PR-level fields collected in step "common". */
export const COMMON_FIELDS = {
  nominee_id: { label: 'Additional Faculty (optional)', type: 'faculty_select', required: false },
  basis_of_estimate: { label: 'How basis of estimate has been made?', type: 'text', required: true },
  quotation_file: { label: 'Basis Of Estimation (PDF)', type: 'file', accept: 'application/pdf', required: true },
  emd: { label: 'Earnest Money Deposit (%)', type: 'select', required: true, options: EMD_PERCENT_OPTIONS },
  performance_security: { label: 'Performance Security (%)', type: 'select', required: true, options: PERFORMANCE_SECURITY_OPTIONS },
  is_service_center_south: { label: 'Service center within southern region?', type: 'yesno', required: true },
  service_center_location: {
    label: 'Service centre location (city / centre name)',
    type: 'text',
    required: true,
    showWhen: { field: 'is_service_center_south', equals: 'Yes' },
  },
  service_center_south_desc: {
    label: 'Justification for using a southern-region service centre',
    type: 'text',
    required: true,
    showWhen: { field: 'is_service_center_south', equals: 'Yes' },
  },
  delivery_location: { label: 'Delivery Location', type: 'text', required: true },
  delivery_mode: { label: 'Delivery Mode', type: 'text', required: true },
  is_quantity_split: { label: 'Splitting of Quantity?', type: 'yesno', required: true },
  split_quantity_justification: {
    label: 'Justification for Non-Splitting of Quantity',
    type: 'text',
    required: true,
    showWhen: { field: 'is_quantity_split', equals: 'No' },
  },
  is_item_split: { label: 'Splitting of Items?', type: 'yesno', required: true },
  split_items_justification: {
    label: 'Justification for Non-Splitting of Items',
    type: 'text',
    required: true,
    showWhen: { field: 'is_item_split', equals: 'No' },
  },
  exemption: { label: 'Exception for MSE/Startup in experience & turnover?', type: 'yesno', required: true },
  exemption_remarks: {
    label: 'Justification for exception',
    type: 'text',
    required: true,
    showWhen: { field: 'exemption', equals: 'Yes' },
  },
  msme_no_exception_route: {
    label: 'When no exception — how will standard norms apply?',
    type: 'select',
    required: true,
    showWhen: { field: 'exemption', equals: 'No' },
  },
  training_required: { label: 'Training or Skill Required?', type: 'yesno', required: true },
  training_type: {
    label: 'Whether the user has been trained already?',
    type: 'yesno',
    required: true,
    showWhen: { field: 'training_required', equals: 'Yes' },
  },
  training_vendor: {
    label: 'Whether training will be provided as part of procurement?',
    type: 'yesno',
    required: true,
    showWhen: { field: 'training_required', equals: 'Yes' },
  },
} as const;

export const PR_TERMS = [
  'The GeM availability will be checked after the finalization of Technical Specifications and the procurement will be processed based on the GeM Availability Report and declaration of non-availability on GeM Portal.',
  'Description of the item/equipment/service is generic and does not indicate any particular trade mark, trade name or brand. In case of Proprietary purchases or purchases from single source, the trade mark, trade name or brand may be mentioned.',
  'The demand for goods is not divided into small quantities to make piecemeal purchases to avoid tendering or the necessity of obtaining the sanction of higher authorities required with reference to the estimated value of the total demand.',
] as const;

export function isGemProcurement(procurementName: string): boolean {
  return procurementName.toLowerCase().includes('gem');
}

export function yesNoToBool(value: string | undefined): boolean {
  return value === 'Yes' || value === 'yes';
}
