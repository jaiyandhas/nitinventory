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
  
  // Item-level specifications
  equipment_name: string;
  pdi_required: 'Yes' | 'No' | '';
  pdi_justification: string;
  pre_bid_required: 'Yes' | 'No' | '';
  installation_scope: 'Supplier' | 'Department' | '';
  training_required: 'Yes' | 'No' | '';
  training_location: "Purchaser's Premises" | "Supplier's Premises" | '';
  tech_eligibility: string;
}

export interface PRCommonFormState {
  nominee_id: string;
  initiator_id?: string;
  basis_of_estimate: 'Budgetary Quote' | 'Previous Purchase' | 'Market Survey' | 'Others' | '';
  basis_of_estimate_others: string;
  quotation_file: File | null;
  dept_pac_file?: File | null;
  oem_pac_file?: File | null;
  oem_auth_file?: File | null;
  emd: string;
  performance_security: string;
  delivery_location: string;
  delivery_mode: string;
  termsAccepted: boolean[];
  purchase_type: 'office' | 'department' | '';
  form_data: Record<string, any>;

  // New common fields
  laboratory_office: string;
  source_of_fund: 'OH-35' | 'OH-31' | 'SW' | 'SEED' | 'Project code' | 'Others' | '';
  source_of_fund_project_code: string;
  source_of_fund_others: string;
  bog_resolution_no: string;
  fc_resolution_no: string;
  item_category: 'Assets' | 'Consumables' | '';
  purpose: 'Research' | 'Others' | '';
  purpose_justification: string;
  mii_clause: 'Applicable' | 'Not Applicable' | '';
  mii_justification: string;
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

    // Item-level specifications
    equipment_name: '',
    pdi_required: '',
    pdi_justification: '',
    pre_bid_required: '',
    installation_scope: '',
    training_required: '',
    training_location: '',
    tech_eligibility: '',
  };
}

export function createEmptyCommonState(): PRCommonFormState {
  return {
    nominee_id: '',
    initiator_id: '',
    basis_of_estimate: '',
    basis_of_estimate_others: '',
    quotation_file: null,
    dept_pac_file: null,
    oem_pac_file: null,
    oem_auth_file: null,
    emd: '',
    performance_security: '',
    delivery_location: '',
    delivery_mode: '',
    termsAccepted: [false, false, false],
    purchase_type: '',
    form_data: {},

    // New common fields
    laboratory_office: '',
    source_of_fund: '',
    source_of_fund_project_code: '',
    source_of_fund_others: '',
    bog_resolution_no: '',
    fc_resolution_no: '',
    item_category: '',
    purpose: '',
    purpose_justification: '',
    mii_clause: '',
    mii_justification: '',
  };
}
