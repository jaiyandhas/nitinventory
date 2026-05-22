// All TypeScript interfaces for IRIS

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
  name: string;
  email: string;
  designation: string;
  gender?: string;
  role: Role | null;
  role_id?: number;
  department: Department | null;
}

export interface PurchaseCategory {
  id: number;
  title: string;
}

export interface ProcurementMethod {
  id: number;
  name: string;
  description?: string;
}

export interface BudgetFile {
  id: number;
  item_name: string;
  category: string;
  file_no: string;
  total_cost: number;
  available_amount: number;
  unit_cost: number;
  quantity: number;
}

export interface BudgetOverview {
  total: number;
  locked: number;
  deducted: number;
  available: number;
}

export interface PRHistory {
  id: number;
  status: string;
  remarks?: string;
  acted_at?: string;
  approver_id?: number;
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
}

export interface PRItem {
  id: number;
  item_description: string;
  estimated_total: number;
}

export type PRStatus =
  | 'pr_submitted'
  | 'in_progress'
  | 'sent_back'
  | 'rejected'
  | 'po_issued'
  | 'cancelled'
  | 'completed';

export interface PurchaseRequest {
  id: number;
  icr_number?: string;
  current_status: PRStatus;
  amount: number;
  purchase_type: string;
  created_at: string;
  initiator?: { id: number; name: string; email: string };
  category?: PurchaseCategory;
  procurement?: ProcurementMethod;
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
  financial_evaluations?: any[];
  assignments?: any[];
  documents?: any[];
  faculty1_id?: number;
  faculty2_id?: number;
  faculty1?: { id: number; name: string; email: string };
  faculty2?: { id: number; name: string; email: string };
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
  name: string;
  category: string;
  condition: string;
  disposal_status: string;
  building?: string;
  room?: string;
  custodian?: string;
  serial_number?: string;
  unit_cost?: number;
  purchase_date?: string;
  warranty_expiry?: string;
  qr_code_url?: string;
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
};

export const PR_STATUS_COLORS: Record<PRStatus, string> = {
  pr_submitted: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  in_progress: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  sent_back: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
  po_issued: 'bg-green-500/20 text-green-300 border-green-500/30',
  cancelled: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};
