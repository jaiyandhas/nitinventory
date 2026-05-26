import type { RequirementType } from '../config/prCreationQuestions';

export interface PRItemFormState {
  budget_file_id: number;
  quantity: string;
  charges: string;
  requirement_type: RequirementType | '';
  warranty: string;
  delivery_period: string;
  installation_required: 'Yes' | 'No' | '';
  site_readiness: 'Yes' | 'No' | '';
  site_readiness_remarks: string;
  gem_link: string;
  gem_nac_file: File | null;
  availability: 'Yes' | 'No' | '';
  present_stock: string;
  justification_for_procurement: string;
  previous_file_no_reference: string;
  tech_specs_text: string;
  tech_specs_file: File | null;
}

/** When no MSE/startup relaxation — how standard participation norms apply */
export type MsmeNoExceptionRoute = '' | 'competitive' | 'gem' | 'institute' | 'other';

export interface PRCommonFormState {
  nominee_id: string;
  basis_of_estimate: string;
  quotation_file: File | null;
  emd: string;
  performance_security: string;
  is_service_center_south: 'Yes' | 'No' | '';
  /** Required when service centre in southern region is Yes */
  service_center_location: string;
  /** Justification for using a southern-region service centre (Yes) */
  service_center_south_desc: string;
  delivery_location: string;
  delivery_mode: string;
  is_quantity_split: 'Yes' | 'No' | '';
  split_quantity_justification: string;
  is_item_split: 'Yes' | 'No' | '';
  split_items_justification: string;
  exemption: 'Yes' | 'No' | '';
  exemption_remarks: string;
  /** When exemption is No — declared compliance route */
  msme_no_exception_route: MsmeNoExceptionRoute;
  training_required: 'Yes' | 'No' | '';
  training_type: 'Yes' | 'No' | '';
  training_vendor: 'Yes' | 'No' | '';
  termsAccepted: boolean[];
  purchase_type: 'office' | 'department' | '';
}

export interface PRWizardSelection {
  fileCount: number;
  selectedFileIds: number[];
  procurementMethodId: number | null;
}

export function createEmptyItemState(budgetFileId: number): PRItemFormState {
  return {
    budget_file_id: budgetFileId,
    quantity: '1',
    charges: '',
    requirement_type: '',
    warranty: '',
    delivery_period: '',
    installation_required: '',
    site_readiness: '',
    site_readiness_remarks: '',
    gem_link: '',
    gem_nac_file: null,
    availability: '',
    present_stock: '',
    justification_for_procurement: '',
    previous_file_no_reference: '',
    tech_specs_text: '',
    tech_specs_file: null,
  };
}

export function createEmptyCommonState(): PRCommonFormState {
  return {
    nominee_id: '',
    basis_of_estimate: '',
    quotation_file: null,
    emd: '',
    performance_security: '',
    is_service_center_south: '',
    service_center_location: '',
    service_center_south_desc: '',
    delivery_location: '',
    delivery_mode: '',
    is_quantity_split: '',
    split_quantity_justification: '',
    is_item_split: '',
    split_items_justification: '',
    exemption: '',
    exemption_remarks: '',
    msme_no_exception_route: '',
    training_required: '',
    training_type: '',
    training_vendor: '',
    termsAccepted: [false, false, false],
    purchase_type: '',
  };
}
