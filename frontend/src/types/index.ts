// All TypeScript interfaces for NIT Inventory

export interface Role {
  group_key: string;
  name: string;
  value?: string;
}

export interface Department {
  id: number;
  name: string;
  short_code: string;
}

export interface User {
  id: number;
  title?: string;
  name: string;
  email: string;
  designation: string;
  gender?: string;
  role: Role | null;
  role_id?: number;
  department: Department | null;
  department_id?: number | null;
  signature_path?: string | null;
}

export interface PurchaseCategory {
  id: number;
  title: string;
  min_amount?: number;
  max_amount?: number;
  is_active?: boolean;
  procurement_id?: number;
  requirement_type?: string;
}

export interface ProcurementMethod {
  id: number;
  name: string;
  description?: string;
  max_amount?: number;
  form_schema?: Record<string, any> | null;
}

export interface BudgetFile {
  id: number;
  item_name: string;
  category: string;
  file_no: string;
  total_cost: number;
  total_allocation?: number;
  available_amount: number;
  available_balance?: number;
  unit_cost: number;
  quantity: number;
}

export interface BudgetOverview {
  total: number;
  total_allocation?: number;
  locked: number;
  committed_amount?: number;
  deducted: number;
  utilized_amount?: number;
  available: number;
  available_balance?: number;
}

export interface PRHistory {
  id: number;
  status: string;
  remarks?: string;
  acted_at?: string;
  approver_id?: number;
  frozen_actor_name?: string;
  frozen_designation?: string;
  frozen_department?: string;
  frozen_signature_path?: string;
}

export interface PRFlow {
  phase_id: number;
  phase_name?: string;
  step_order: number;
  rejected: boolean;
  expected_group?: string;
  expected_role_id?: number;
  expected_role_name?: string;
  expected_user_id?: number;
  expected_user_name?: string;
  workflow_step_id?: number;
  /** The user_type of the current step (e.g. 'verifier', 'approver', 'partial_approver') */
  step_type?: string | null;
  tender_vendors_threshold?: number | null;
  tender_vendors_comparison?: string | null;
  condition_field?: string | null;
  condition_operator?: string | null;
  condition_value?: number | null;
}

export interface PRItem {
  id: number;
  item_description: string;
  estimated_total: number;
  quantity?: number;
  charges?: number | null;   // GST percentage (e.g. 8 for 8%)
  requirement_type?: string;
  tech_specs_text?: string;
  installation_required?: boolean;
  warranty?: number;
  delivery_period?: number;
}

export type PRStatus =
  | 'pr_submitted'
  | 'in_progress'
  | 'sent_back'
  | 'rejected'
  | 'po_issued'
  | 'cancelled'
  | 'completed'
  | 'rolled_over'
  | 'budget_file_allocation';

export interface PurchaseRequest {
  id: number;
  icr_number?: string;
  current_status: PRStatus;
  amount: number;
  purchase_type: string;
  created_at: string;
  is_potential_split?: boolean;
  initiator?: { id: number; name: string; email: string; department?: { id: number; name: string; short_code: string } };
  parent_pr_id?: number | null;
  parent_pr?: { id: number; icr_number?: string } | null;
  child_prs?: Array<{ id: number; icr_number?: string }>;
  category?: PurchaseCategory;
  procurement?: ProcurementMethod;
  form_data?: Record<string, any> | null;
  emd?: number;
  performance_security?: number;
  is_item_split?: boolean;
  item_split_justification?: string;
  is_quantity_split?: boolean;
  quantity_split_details?: string;
  exemption?: boolean;
  exemption_remarks?: string;
  is_training_required?: boolean;
  tender_reference_number?: string;
  vendor_list_link?: string;
  date_of_tender?: string;
  date_of_tech_bid_opening?: string;
  date_of_financial_bid_opening?: string;
  delivery_location?: string;
  delivery_mode?: string;
  basis_of_estimate?: string;
  history?: PRHistory[];
  items?: PRItem[];
  flow?: PRFlow;
  commercial_evaluations?: any[];
  technical_evaluations?: any[];
  financial_evaluations?: {
    id: number;
    vendor_name: string;
    quoted_amount: number;
    ranking: string;
    is_awarded: boolean;
    remarks?: string;
    unit_price?: number | null;
    taxes?: number;
    delivery_period?: number | null;
    warranty?: number | null;
  }[];
  assignments?: any[];
  documents?: any[];
  lpc_remarks?: string | null;
  lpc_committee_members?: string | null;
  lpc_minutes_reference?: string | null;
  single_bid_justification?: string | null;
  bill_passing?: {
    id: number;
    invoice_number: string;
    invoice_date: string;
    challan_number?: string;
    challan_date?: string;
    bill_amount: number;
    gst_amount: number;
    payment_terms?: string;
    passed_by_id: number;
    remarks?: string;
    extra_info?: Record<string, any> | null;
  } | null;
  deliveries?: {
    id: number;
    status: string;
    challan_number?: string;
    invoice_number?: string;
    received_date?: string;
    created_at: string;
    items?: {
      id: number;
      name: string;
      challan_quantity: number;
      unit_price: number;
    }[];
  }[];
  faculty1_id?: number;
  faculty2_id?: number;
  faculty3_id?: number;
  initiator_id?: number;
  aa_approver_id?: number;
  faculty1?: { id: number; name: string; email: string };
  faculty2?: { id: number; name: string; email: string };
  faculty3?: { id: number; name: string; email: string };
  aa_approver?: { id: number; name: string; email: string };
  te_initiated_at?: string;
  hod_id?: number;
  expert1_id?: number;
  expert2_id?: number;
  director_faculty_id?: number;
  hod?: { id: number; name: string; email: string };
  expert1?: { id: number; name: string; email: string };
  expert2?: { id: number; name: string; email: string };
  director_faculty?: { id: number; name: string; email: string };
  referrals?: PRReferral[];
  budget_file?: any;
}

export interface PRReferral {
  id: number;
  referred_by: { id: number; name: string; email: string } | null;
  referred_to: { id: number; name: string; email: string } | null;
  query: string;
  query_document_path: string | null;
  response: string | null;
  response_document_path: string | null;
  status: string;
  referral_type: string; // 'consultation' | 'clarification'
  created_at: string | null;
  responded_at: string | null;
}

export interface DeliveryItem {
  id: number;
  name: string;
  category: string;
  challan_quantity: number;
  unit_price: number;
}

export interface Delivery {
  id: number;
  po_id: number;
  status: string;
  challan_number?: string;
  invoice_number?: string;
  received_date?: string;
  created_at: string;
  items?: DeliveryItem[];
}

export interface Discrepancy {
  id: number;
  delivery_item_id: number;
  challan_qty: number;
  dept_qty: number;
  stores_qty: number;
  status: string;
  created_at: string;
}

export interface Asset {
  id: number;
  asset_tag: string;
  legacy_asset_tag?: string;
  name: string;
  category: string;
  condition: string;
  disposal_status: string;
  department_id?: number;
  fund_source?: string;
  building?: string;
  room?: string;
  custodian?: string;
  serial_number?: string;
  unit_cost?: number;
  purchase_date?: string;
  warranty_expiry?: string;
  qr_code_url?: string;
  remarks?: string;
  is_verified?: boolean;
  verified_at?: string;
  asset_source?: string;
  supplier_name?: string;
  supplier_address?: string;
  bill_number?: string;
  bill_date?: string;
  stock_register_volume?: string;
  stock_register_page?: string;
  delivery_date?: string;
  movements?: { from_room?: string; to_room: string; moved_at: string; reason?: string }[];
  logs?: { action: string; performed_at: string; old_value?: object; new_value?: object }[];
}

export const PR_STATUS_LABELS: Record<PRStatus, string> = {
  pr_submitted: 'PR Submitted',
  in_progress: 'In Progress',
  sent_back: 'Sent Back',
  rejected: 'Rejected',
  po_issued: 'PO Issued',
  cancelled: 'Cancelled',
  completed: 'Completed',
  rolled_over: 'Rolled Over',
  budget_file_allocation: 'Awaiting Budget File Allocation',
};

export const PR_STATUS_COLORS: Record<PRStatus, string> = {
  pr_submitted: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  in_progress: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  sent_back: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
  po_issued: 'bg-green-500/20 text-green-300 border-green-500/30',
  cancelled: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  rolled_over: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  budget_file_allocation: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

export interface FinancialYear {
  id: number;
  label: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_closed: boolean;
}
