# IRIS — NIT Tiruchirappalli Codebase Database Schema Documentation

This document describes the current SQLAlchemy declarative models defining the database schema of the **IRIS (Institutional Resource & Inventory System)** project. Last updated: June 2026.

---

## 1. User & Authentication Management

### `departments`
Stores departmental details and tech-committee configuration per department.
- `id` (Integer, PK, Autoincrement)
- `name` (String(255), Not Null)
- `short_code` (String(20), Unique, Not Null) — e.g., "CSE", "ECE"
- `expert1_id` (Integer, FK → `users.id`, Nullable) — Tech committee Expert 1
- `expert2_id` (Integer, FK → `users.id`, Nullable) — Tech committee Expert 2
- `director_faculty_id` (Integer, FK → `users.id`, Nullable) — Director's nominee for committee

### `role_managers`
Defines system-wide authorization roles.
- `id` (Integer, PK, Autoincrement)
- `name` (String(100), Not Null) — e.g., "Internal Auditor"
- `value` (String(50), Unique, Not Null) — e.g., "ia"
- `group_key` (String(50), Not Null) — e.g., "internal_audit", "hod", "dean_approver"

### `users`
Faculty, staff, and administrative user accounts.
- `id` (Integer, PK, Autoincrement)
- `title` (String(50), Nullable, Default: "Mr.")
- `name` (String(255), Not Null)
- `email` (String(255), Unique, Not Null)
- `hashed_password` (String(255), Not Null)
- `designation` (String(255), Not Null)
- `gender` (String(20), Not Null)
- `role_id` (Integer, FK → `role_managers.id`, Nullable)
- `department_id` (Integer, FK → `departments.id`, Nullable)
- `is_active` (Boolean, Default: True)
- `signature_path` (String(500), Nullable)
- `is_approved` (Boolean, Default: False)
- `last_login_at` (DateTime, Nullable)
- `created_at` (DateTime, Default: now())

---

## 2. Budget & Procurement Configuration

### `financial_years`
Academic/financial year cycles.
- `id` (Integer, PK, Autoincrement)
- `label` (String(9), Not Null) — e.g., "2024-25"
- `start_date` (Date, Not Null)
- `end_date` (Date, Not Null)
- `is_active` (Boolean, Default: True)
- `is_closed` (Boolean, Default: False)

### `procurement_managers`
Modes of procurement (e.g., GeM, LPC, Proprietary Purchase, CPPP).
- `id` (Integer, PK, Autoincrement)
- `name` (String(100), Unique, Not Null)
- `description` (String(255), Nullable)
- `max_amount` (Float, Nullable)
- `form_schema` (JSON, Nullable)

### `purchase_categories`
GFR purchase categories and amount thresholds.
- `id` (Integer, PK, Autoincrement)
- `title` (String(255), Not Null)
- `min_amount` (Float, Not Null)
- `max_amount` (Float, Not Null)
- `is_active` (Boolean, Default: True)
- `procurement_id` (Integer, FK → `procurement_managers.id`, Not Null)
- `requirement_type` (String(100), Nullable)
- `created_at` (DateTime, Default: now())

### `phase_managers`
Procurement workflow phases (AA, Tendering, Technical Evaluation, Financial Sanction, PO).
- `id` (Integer, PK, Autoincrement)
- `phase_name` (String(50), Unique, Not Null)
- `description` (String(255), Nullable)
- `phase_order` (Integer, Default: 0)

### `source_of_funds`
Configurable source-of-fund master used for SOF-specific workflow routing.
- `id` (Integer, PK, Autoincrement)
- `name` (String(255), Unique, Not Null)
- `description` (String(255), Nullable)
- `is_active` (Boolean, Default: True)
- `created_at` (DateTime, Default: now())

### `budget_master`
Central budget ledger representing financial allocations per file/item.
- `id` (Integer, PK, Autoincrement)
- `department_id` (Integer, FK → `departments.id`, Nullable)
- `financial_year_id` (Integer, FK → `financial_years.id`, Not Null)
- `source_of_fund` (String(255), Not Null)
- `item_name` (String(255), Not Null)
- `category` (String(255), Not Null)
- `course_code` (String(255), Not Null)
- `unit_cost` (Float, Not Null)
- `quantity` (Integer, Not Null)
- `total_allocation` (Float, Not Null)
- `file_no` (String(64), Not Null)
- `is_revision` (Boolean, Default: False)
- `committed_amount` (Float, Default: 0.0) — Budget locked for in-progress PRs
- `utilized_amount` (Float, Default: 0.0) — Budget deducted after PO issuance
- `remarks` (Text, Nullable)
- `attachment_path` (String(512), Nullable)
- `project_code` (String(255), Nullable)
- `principal_investigator` (String(255), Nullable)
- `project_due_date` (Date, Nullable)
- `expert1_id` (Integer, FK → `users.id`, Nullable)
- `expert2_id` (Integer, FK → `users.id`, Nullable)
- `director_faculty_id` (Integer, FK → `users.id`, Nullable)
- `allocated_initiator_id` (Integer, FK → `users.id`, Nullable)
- `nominee_ids` (JSON, Nullable) — Committee member IDs list
- `created_at` (DateTime, Default: now())

> **Invariant**: `committed_amount` must never go negative. All updates use `func.greatest(0.0, ...)`.

### `settings`
Global system configurations (key-value store).
- `id` (Integer, PK, Autoincrement)
- `key_name` (String(255), Unique, Not Null)
- `value` (String(1024), Not Null)
- `updated_at` (DateTime, Default: now(), OnUpdate: now())

### `tc_master`
Terms & conditions templates for PR submission.
- `id` (Integer, PK, Autoincrement)
- `title` (String(255), Not Null)
- `content` (Text, Not Null)
- `created_at` (DateTime, Default: now())

---

## 3. Administrative Approvals (AA) Workflow

### `administrative_approvals`
Initial administrative clearance request before purchase processing.
- `id` (Integer, PK, Autoincrement)
- `aa_number` (String(100), Unique, Nullable)
- `budget_file_id` (Integer, FK → `budget_master.id`, Not Null)
- `pi_id` (Integer, FK → `users.id`, Not Null) — Principal Investigator
- `quantity` (Integer, Default: 1)
- `item_description` (Text, Not Null)
- `gst_rate` (Float, Not Null) — As percentage, e.g. 18.0
- `mode_of_procurement` (String(100), Not Null)
- `justification` (Text, Not Null)
- `gst_amount` (Float, Not Null)
- `total_cost` (Float, Not Null)
- `status` (String(100), Default: "Submitted to HOD")
- `pending_with` (String(50), Nullable) — e.g., "HOD", "ADPD", "Dean", "IA", "Director"
- `attachment_path` (String(512), Nullable)
- `item_category` (String(50), Nullable)
- `stock_availability` (String(10), Nullable)
- `present_stock` (String(255), Nullable)
- `prev_file_no` (String(255), Nullable)
- `justification_procurement` (Text, Nullable)
- `basis_of_estimation_path` (String(512), Nullable)
- `gem_non_availability_path` (String(512), Nullable)
- `authority_approval_path` (String(512), Nullable)
- `pac_dept_cert_path` (String(512), Nullable)
- `pac_vendor_cert_path` (String(512), Nullable)
- `generic_specification_declaration` (Boolean, Default: False)
- `created_at` (DateTime, Default: now())
- `approved_at` (DateTime, Nullable)

### `administrative_approval_history`
Immutable audit log of AA workflow actions.
- `id` (Integer, PK, Autoincrement)
- `approval_id` (Integer, FK → `administrative_approvals.id`, Not Null)
- `approver_id` (Integer, FK → `users.id`, Not Null)
- `approver_role` (String(50), Not Null) — "HOD", "ADPD", "Director"
- `status` (String(100), Not Null) — "Approved", "Returned", "Rejected"
- `remarks` (Text, Nullable)
- `acted_at` (DateTime, Default: now())

### `administrative_approval_workflows`
Dynamic workflow step definitions for AA processing.
- `id` (Integer, PK, Autoincrement)
- `category_id` (Integer, FK → `purchase_categories.id`, Nullable)
- `procurement_id` (Integer, FK → `procurement_managers.id`, Nullable)
- `purchase_type` (String(50), Nullable) — `"research"` or `"others"`
- `step_order` (Integer, Not Null)
- `role_id` (Integer, FK → `role_managers.id`, Nullable)
- `user_group` (String(100), Nullable)
- `is_enabled` (Boolean, Default: True)
- `skip_condition` (String(500), Nullable)
- `source_of_fund_id` (Integer, FK → `source_of_funds.id`, Nullable) — NULL = fallback; set = fund-specific variant

### `administrative_approval_nominees`
Nominated technical experts for AA scrutiny.
- `id` (Integer, PK, Autoincrement)
- `approval_id` (Integer, FK → `administrative_approvals.id`, Not Null)
- `nominee_id` (Integer, FK → `users.id`, Not Null)
- `step_order` (Integer, Default: 1)
- `status` (String(50), Default: "Pending")
- `acted_at` (DateTime, Nullable)
- `remarks` (Text, Nullable)

---

## 4. Purchase Requests & Lifecycle Management

### `purchase_requests`
Core PR entity representing the full procurement lifecycle.
- `id` (Integer, PK, Autoincrement)
- `icr_number` (String(100), Unique, Nullable) — Indent reference number
- `category_id` (Integer, FK → `purchase_categories.id`, Not Null)
- `financial_year_id` (Integer, FK → `financial_years.id`, Not Null)
- `initiator_id` (Integer, FK → `users.id`, Not Null)
- `nominee_id` (Integer, FK → `users.id`, Nullable)
- `procurement_id` (Integer, FK → `procurement_managers.id`, Not Null)
- `purchase_type` (String(50), Not Null) — `"research"` or `"others"`
- `current_status` (String(50), Default: `"pr_submitted"`) — Enum values: `pr_submitted`, `in_progress`, `sent_back`, `rejected`, `po_issued`, `cancelled`, `completed`, `rolled_over`, `budget_file_allocation`
- `amount` (Float, Not Null)
- `emd` (Float, Default: 0.0) — Earnest Money Deposit %
- `performance_security` (Float, Default: 0.0) — Performance Security %
- `vendor_list_link` (String(500), Nullable)
- `is_item_split` (Boolean, Default: False)
- `item_split_justification` (Text, Nullable)
- `is_quantity_split` (Boolean, Default: False)
- `quantity_split_details` (Text, Nullable)
- `is_service_center_in_south` (Boolean, Default: False)
- `service_center_south_desc` (String(500), Nullable)
- `basis_of_estimate_details` (Text, Nullable)
- `delivery_mode` (String(255), Nullable)
- `delivery_location` (String(255), Nullable)
- `exemption` (Boolean, Default: False)
- `exemption_remarks` (Text, Nullable)
- `is_training_required` (Boolean, Default: False)
- `training_type` (String(255), Nullable)
- `training_vendor` (String(255), Nullable)
- `training_comments` (String(500), Nullable)
- `tender_reference_number` (String(255), Nullable)
- `date_of_tender` (Date, Nullable)
- `date_of_tech_bid_opening` (Date, Nullable)
- `date_of_financial_bid_opening` (Date, Nullable)
- `tender_scheduling_done` (Boolean, Default: False)
- `aa_approved_at` (DateTime, Nullable)
- `te_initiated_at` / `te_approved_at` (DateTime, Nullable)
- `fs_initiated_at` / `fs_approved_at` (DateTime, Nullable)
- `po_initiated_at` / `po_approved_at` (DateTime, Nullable)
- `faculty1_id`, `faculty2_id`, `faculty3_id` (FK → `users.id`, Nullable) — Tech committee members
- `committee_nominee_ids` (JSON, Nullable)
- `aa_approver_id` (Integer, FK → `users.id`, Nullable)
- `form_data` (JSON, Nullable) — Dynamic form fields from PR wizard
- `parent_pr_id` (Integer, FK → `purchase_requests.id`, Nullable) — For re-initiated PRs
- `administrative_approval_id` (Integer, FK → `administrative_approvals.id`, Nullable)
- `lpc_remarks` (Text, Nullable)
- `lpc_committee_members` (Text, Nullable)
- `lpc_minutes_reference` (String(255), Nullable)
- `single_bid_justification` (Text, Nullable)
- `created_at` (DateTime, Default: now())

### `purchase_request_items`
Line items within a purchase request, each tied to a budget file.
- `id` (Integer, PK, Autoincrement)
- `purchase_request_id` (Integer, FK → `purchase_requests.id`, Not Null)
- `budget_file_id` (Integer, FK → `budget_master.id`, Not Null)
- `item_description` (String(500), Not Null)
- `quantity` (Integer, Default: 1)
- `estimated_total` (Float, Not Null) — Base cost without GST
- `charges` (Float, Nullable) — GST % e.g. 18.0
- `requirement_type` (String(100), Not Null)
- `availability` (String(100), Not Null)
- `availability_remarks` (Text, Nullable)
- `site_readiness` (Boolean, Not Null)
- `site_readiness_remarks` (Text, Nullable)
- `warranty` (Float, Nullable) — In months
- `delivery_period` (Float, Nullable) — In weeks
- `present_stock` (String(255), Nullable)
- `justification_for_procurement` (Text, Nullable)
- `previous_file_no_reference` (String(255), Nullable)
- `installation_required` (Boolean, Default: False)
- `tech_specs_text` (Text, Nullable)
- `gem_link` (String(500), Nullable)

### `purchase_request_flows`
Single-row per PR tracking the **current** workflow position (phase + step).
- `id` (Integer, PK, Autoincrement)
- `purchase_request_id` (Integer, FK → `purchase_requests.id`, Unique, Not Null)
- `phase_id` (Integer, FK → `phase_managers.id`, Not Null)
- `step_order` (Integer, Not Null)
- `rejected` (Boolean, Default: False)

> This is NOT a multi-row history table. It holds exactly one row per PR at any given time, pointing to the current approver step.

### `purchase_request_history`
Immutable append-only audit trail with frozen actor snapshots.
- `id` (Integer, PK, Autoincrement)
- `purchase_request_id` (Integer, FK → `purchase_requests.id`, Not Null)
- `current_approver_id` (Integer, FK → `users.id`, Nullable)
- `status` (String(255), Not Null)
- `remarks` (Text, Nullable)
- `acted_at` (DateTime, Nullable)
- `frozen_actor_name` (String(255), Nullable)
- `frozen_title` (String(50), Nullable)
- `frozen_designation` (String(255), Nullable)
- `frozen_department` (String(255), Nullable)
- `frozen_signature_path` (String(500), Nullable)

> **Invariant**: Never UPDATE or DELETE rows — only INSERT.

### `purchase_request_assignments`
S&P DA assignment tracking for a PR.
- `id` (Integer, PK, Autoincrement)
- `purchase_request_id` (Integer, FK → `purchase_requests.id`, Not Null)
- `assigned_by_id` (Integer, FK → `users.id`, Not Null)
- `assigned_da_id` (Integer, FK → `users.id`, Not Null) — Dealing Assistant
- `status` (String(50), Default: `"pending"`) — Enum: `pending`, `in_progress`, `completed`
- `assigned_at` (DateTime, Default: now())

### `documents`
File attachments linked to purchase requests.
- `id` (Integer, PK, Autoincrement)
- `purchase_request_id` (Integer, FK → `purchase_requests.id`, Not Null)
- `doc_key` (String(255), Not Null) — e.g., "quotation_file", "gem_nac_file", "oem_pac_file"
- `doc_value` (JSON, Not Null) — Stores path, size, type metadata
- `uploaded_by_id` (Integer, FK → `users.id`, Nullable)
- `updated_at` (DateTime, Default: now(), OnUpdate: now())

### `workflow_hierarchies`
PR workflow step definitions — drives the flow engine for phase/step routing.
- `id` (Integer, PK, Autoincrement)
- `user_id` (Integer, FK → `users.id`, Nullable) — Specific user override
- `category_id` (Integer, FK → `purchase_categories.id`, Not Null)
- `phase_id` (Integer, FK → `phase_managers.id`, Not Null)
- `procurement_id` (Integer, FK → `procurement_managers.id`, Not Null)
- `step_order` (Integer, Not Null)
- `user_type` (String(255), Not Null)
- `user_group` (String(100), Nullable)
- `role_id` (Integer, FK → `role_managers.id`, Nullable)
- `purchase_type` (String(100), Not Null) — `"research"` or `"others"`
- `is_enabled` (Boolean, Default: True)
- `tender_vendors_threshold` (Integer, Nullable)
- `tender_vendors_comparison` (String(20), Nullable)
- `skip_condition` (String(500), Nullable) — AST-evaluated expression; if truthy, step is bypassed
- `condition_field` (String(100), Nullable)
- `condition_operator` (String(20), Nullable)
- `condition_value` (Integer, Nullable)
- `source_of_fund_id` (Integer, FK → `source_of_funds.id`, Nullable) — NULL = default; set = fund-specific variant

> This is the primary driver of the PR workflow engine (`flow_engine.py`). Each row = one approval step.

### `vendor_master`
Supplier/vendor directory.
- `id` (Integer, PK, Autoincrement)
- `vendor_name` (String(255), Not Null)
- `email` (String(255), Unique, Not Null)
- `contact_number` (String(20), Nullable)
- `address` (String(500), Nullable)
- `pincode` (String(10), Nullable)
- `gst_number` (String(15), Nullable)
- `created_at` (DateTime, Default: now())

### `purchase_orders`
Official Purchase Orders issued to vendors (1:1 with a PR; vendor details embedded).
- `id` (Integer, PK, Autoincrement)
- `purchase_request_id` (Integer, FK → `purchase_requests.id`, Unique, Not Null)
- `po_number` (String(100), Unique, Not Null)
- `vendor_name` (String(255), Not Null)
- `vendor_address` (Text, Nullable)
- `vendor_gst` (String(20), Nullable)
- `vendor_bank_account` (String(100), Nullable)
- `vendor_bank_name` (String(255), Nullable)
- `vendor_ifsc` (String(20), Nullable)
- `po_amount` (Float, Not Null)
- `delivery_due_date` (Date, Nullable)
- `ps_amount` (Float, Nullable) — Performance security amount
- `ps_mode` (String(50), Nullable)
- `ps_validity` (Date, Nullable)
- `emd_amount` (Float, Nullable)
- `ld_applicable` (Boolean, Default: False) — Liquidated damages
- `issued_by_id` (Integer, FK → `users.id`, Not Null)
- `issued_at` (DateTime, Default: now())
- `remarks` (Text, Nullable)

### `technical_evaluations`
Vendor technical bid evaluations submitted by committee members.
- `id` (Integer, PK, Autoincrement)
- `purchase_request_id` (Integer, FK → `purchase_requests.id`, Not Null)
- `vendor_name` (String(255), Not Null)
- `is_qualified` (Boolean, Not Null)
- `remarks` (Text, Nullable)
- `created_at` (DateTime, Nullable)
- `bid_id` (String(100), Nullable)
- `committee_venue` (String(255), Nullable)
- `committee_date` (Date, Nullable)
- `committee_time` (String(50), Nullable)
- `no_of_bids_received` (Integer, Nullable)
- `member_id` (Integer, FK → `users.id`, Nullable) — Committee member who submitted this evaluation

### `financial_evaluations`
Comparative statement evaluations for vendor bid pricing.
- `id` (Integer, PK, Autoincrement)
- `purchase_request_id` (Integer, FK → `purchase_requests.id`, Not Null)
- `vendor_name` (String(255), Not Null)
- `quoted_amount` (Float, Not Null)
- `ranking` (String(10), Nullable) — e.g., "L1", "L2"
- `is_awarded` (Boolean, Default: False)
- `unit_price` (Float, Nullable)
- `taxes` (Float, Default: 0.0)
- `delivery_period` (Integer, Nullable)
- `warranty` (Integer, Nullable)
- `remarks` (Text, Nullable)
- `representation_notes` (Text, Nullable)
- `created_at` (DateTime, Default: now())

### `commercial_evaluations`
Commercial terms evaluations (eligibility check).
- `id` (Integer, PK, Autoincrement)
- `purchase_request_id` (Integer, FK → `purchase_requests.id`, Not Null)
- `vendor_name` (String(255), Not Null)
- `vendor_email` (String(255), Nullable)
- `quoted_amount` (Float, Nullable)
- `is_qualified` (Boolean, Not Null)
- `remarks` (Text, Nullable)

### `po_cancellations`
Logs cancellations of issued Purchase Orders with reinitiation details.
- `id` (Integer, PK, Autoincrement)
- `purchase_request_id` (Integer, FK → `purchase_requests.id`, Not Null)
- `reason` (Text, Not Null)
- `reinitiation_method` (String(50), Not Null) — e.g., "direct", "gem", "limited", "cppp"
- `reallocated_amount` (Float, Default: 0.0)
- `cancelled_by_id` (Integer, FK → `users.id`, Not Null)
- `cancelled_at` (DateTime, Default: now())

### `tender_cancellations`
Logs cancellations of ongoing tenders.
- `id` (Integer, PK, Autoincrement)
- `purchase_request_id` (Integer, FK → `purchase_requests.id`, Not Null)
- `reason` (Text, Not Null)
- `reinitiation_method` (String(50), Not Null)
- `cancelled_by_id` (Integer, FK → `users.id`, Not Null)
- `cancelled_at` (DateTime, Default: now())

### `bill_passings`
Bill submission and authorization for final payment settlement (1:1 with a PR).
- `id` (Integer, PK, Autoincrement)
- `purchase_request_id` (Integer, FK → `purchase_requests.id`, Unique, Not Null)
- `invoice_number` (String(100), Not Null)
- `invoice_date` (Date, Not Null)
- `challan_number` (String(100), Nullable)
- `challan_date` (Date, Nullable)
- `bill_amount` (Float, Not Null)
- `gst_amount` (Float, Default: 0.0)
- `payment_terms` (Text, Nullable)
- `passed_by_id` (Integer, FK → `users.id`, Not Null)
- `passed_at` (DateTime, Default: now())
- `remarks` (Text, Nullable)
- `extra_info` (JSON, Nullable)

### `pr_referrals`
Ad-hoc consultation referrals during procurement scrutiny.
- `id` (Integer, PK, Autoincrement)
- `purchase_request_id` (Integer, FK → `purchase_requests.id`, Not Null)
- `referred_by_id` (Integer, FK → `users.id`, Not Null)
- `referred_to_id` (Integer, FK → `users.id`, Not Null)
- `query` (Text, Not Null)
- `query_document_path` (String(500), Nullable)
- `response` (Text, Nullable)
- `response_document_path` (String(500), Nullable)
- `status` (String(20), Default: "pending")
- `referral_type` (String(50), Default: "consultation")
- `created_at` (DateTime, Default: now())
- `responded_at` (DateTime, Nullable)

---

## 5. Deliveries, Payments & Inventory Tracking

### `deliveries`
GRN workflow — tracks shipment arrival per PR.
- `id` (Integer, PK, Autoincrement)
- `po_id` (Integer, FK → `purchase_requests.id`, Not Null) — Stores PR id despite column name
- `gin_number` (String(100), Unique, Nullable) — Goods Inward Note number
- `challan_number` (String(100), Nullable)
- `invoice_number` (String(100), Nullable)
- `invoice_pdf_path` (String(512), Nullable)
- `challan_pdf_path` (String(512), Nullable)
- `department_id` (Integer, FK → `departments.id`, Not Null)
- `received_date` (DateTime, Nullable)
- `status` (String(50), Default: `"pending"`) — Enum: `pending`, `initiator_confirmed`, `dept_logged`, `stores_logged`, `verified`, `discrepancy`
- `created_at` (DateTime, Default: now())

### `delivery_items`
Individual items within a delivery (derived from PO line items).
- `id` (Integer, PK, Autoincrement)
- `delivery_id` (Integer, FK → `deliveries.id`, Not Null)
- `name` (String(255), Not Null)
- `category` (String(100), Not Null)
- `challan_quantity` (Integer, Not Null)
- `unit_price` (Float, Not Null)

### `dept_asset_logs`
Immutable HOD receipt log — records physical acceptance of delivered items.
- `id` (Integer, PK, Autoincrement)
- `delivery_item_id` (Integer, FK → `delivery_items.id`, Unique, Not Null)
- `logged_by_id` (Integer, FK → `users.id`, Not Null)
- `quantity` (Integer, Not Null)
- `condition` (String(50), Not Null) — "good", "damaged", "partial"
- `building` (String(100), Nullable)
- `room` (String(100), Nullable)
- `custodian_name` (String(255), Nullable)
- `serial_numbers` (JSON, Nullable)
- `remarks` (Text, Nullable)
- `logged_at` (DateTime, Default: now())

> **Invariant**: Append-only — no updates or deletes after creation.

### `stores_asset_logs`
Stores (SP Superintendent) document verification log — editable until approved.
- `id` (Integer, PK, Autoincrement)
- `delivery_item_id` (Integer, FK → `delivery_items.id`, Unique, Not Null)
- `logged_by_id` (Integer, FK → `users.id`, Not Null)
- `quantity` (Integer, Not Null)
- `condition` (String(50), Not Null)
- `building` (String(100), Nullable)
- `room` (String(100), Nullable)
- `custodian_name` (String(255), Nullable)
- `serial_numbers` (JSON, Nullable)
- `is_approved` (Boolean, Default: False)
- `approved_by_id` (Integer, FK → `users.id`, Nullable)
- `approved_at` (DateTime, Nullable)
- `updated_at` (DateTime, Default: now(), OnUpdate: now())
- `grn_number` (String(100), Unique, Nullable) — Goods Receipt Note number
- `inspection_remarks` (Text, Nullable)

### `discrepancies`
Quantity discrepancy reports between challan, dept log, and stores log.
- `id` (Integer, PK, Autoincrement)
- `delivery_item_id` (Integer, FK → `delivery_items.id`, Unique, Not Null)
- `challan_qty` (Integer, Not Null)
- `dept_qty` (Integer, Not Null)
- `stores_qty` (Integer, Not Null)
- `status` (String(50), Default: `"open"`) — Enum: `open`, `resolved`
- `resolution_remarks` (Text, Nullable)
- `resolved_by_id` (Integer, FK → `users.id`, Nullable)
- `resolved_at` (DateTime, Nullable)
- `created_at` (DateTime, Default: now())

### `payments`
Financial releases tracked per delivery.
- `id` (Integer, PK, Autoincrement)
- `delivery_id` (Integer, FK → `deliveries.id`, Not Null)
- `invoice_number` (String(100), Not Null)
- `amount` (Float, Not Null)
- `status` (String(50), Default: `"pending"`) — Enum: `pending`, `approved`, `paid`, `blocked`
- `approved_by_id` (Integer, FK → `users.id`, Nullable)
- `paid_at` (DateTime, Nullable)
- `created_at` (DateTime, Default: now())

---

## 6. Physical Assets Directory

### `assets`
Identified institutional equipment/capital assets. Tags generated via PostgreSQL sequences.
- `id` (Integer, PK, Autoincrement)
- `asset_tag` (String(50), Unique, Not Null) — Format: `NIT-{DEPT}-{YY}-{SEQ:03d}` e.g. `NIT-CSE-26-001`
- `name` (String(255), Not Null)
- `category` (String(50), Not Null) — Enum: `lab_equipment`, `furniture`, `computer`, `other`
- `department_id` (Integer, FK → `departments.id`, Not Null)
- `building` (String(100), Nullable)
- `room` (String(100), Nullable)
- `custodian` (String(255), Nullable)
- `custodian_designation` (String(255), Nullable)
- `custodian_department_id` (Integer, FK → `departments.id`, Nullable)
- `serial_number` (String(255), Nullable)
- `legacy_asset_tag` (String(100), Nullable) — Pre-IRIS tag reference
- `fund_source` (String(100), Nullable)
- `condition` (String(50), Default: `"working"`) — Enum: `working`, `damaged`, `under_repair`, `obsolete`
- `disposal_status` (String(50), Default: `"active"`) — Enum: `active`, `pending_disposal`, `disposed`
- `qr_code_url` (String(500), Nullable) — Path to generated QR PNG
- `purchase_date` (Date, Nullable)
- `unit_cost` (Float, Nullable)
- `warranty_expiry` (Date, Nullable)
- `delivery_item_id` (Integer, FK → `delivery_items.id`, Nullable) — Link to GRN delivery item
- `remarks` (Text, Nullable)
- `is_verified` (Boolean, Default: False)
- `verified_at` (DateTime, Nullable)
- `asset_source` (String(50), Default: "legacy") — "legacy" or "grn"
- `supplier_name` (String(255), Nullable) — Stock register details
- `supplier_address` (Text, Nullable)
- `bill_number` (String(100), Nullable)
- `bill_date` (Date, Nullable)
- `stock_register_volume` (String(100), Nullable)
- `stock_register_page` (String(100), Nullable)
- `delivery_date` (Date, Nullable)
- `created_at` (DateTime, Default: now())

> **Invariant**: Asset tags are generated via PostgreSQL `nextval()` — never generate client-side.

### `asset_movements`
Append-only movement log for asset location changes.
- `id` (Integer, PK, Autoincrement)
- `asset_id` (Integer, FK → `assets.id`, Not Null)
- `from_building` (String(100), Nullable)
- `from_room` (String(100), Nullable)
- `to_building` (String(100), Not Null)
- `to_room` (String(100), Not Null)
- `moved_by_id` (Integer, FK → `users.id`, Not Null)
- `reason` (Text, Nullable)
- `moved_at` (DateTime, Default: now())

### `asset_logs`
Append-only audit trail for all asset state changes.
- `id` (Integer, PK, Autoincrement)
- `asset_id` (Integer, FK → `assets.id`, Not Null)
- `action` (String(100), Not Null) — e.g., "Service", "Verification", "Condition Update"
- `performed_by_id` (Integer, FK → `users.id`, Not Null)
- `old_value` (JSON, Nullable) — Previous state snapshot
- `new_value` (JSON, Nullable) — New state snapshot
- `performed_at` (DateTime, Default: now())

### `installation_records`
Commissioning and installation records for delivered assets.
- `id` (Integer, PK, Autoincrement)
- `asset_id` (Integer, FK → `assets.id`, Not Null)
- `installation_date` (Date, Nullable)
- `installed_by` (String(255), Nullable) — Vendor name or "Department"
- `installation_scope` (String(50), Nullable) — "supplier" or "department"
- `is_commissioned` (Boolean, Default: False)
- `certificate_path` (String(512), Nullable)
- `remarks` (Text, Nullable)
- `recorded_by_id` (Integer, FK → `users.id`, Not Null)
- `recorded_at` (DateTime, Default: now())

---

## 7. Notifications & Utilities

### `notifications`
System alerts dispatched to users.
- `id` (Integer, PK, Autoincrement)
- `user_id` (Integer, FK → `users.id` CASCADE, Not Null)
- `title` (String(255), Not Null)
- `message` (Text, Not Null)
- `link` (String(512), Nullable)
- `is_read` (Boolean, Default: False)
- `created_at` (DateTime, Default: now())

### `email_queue`
Emails queued for background delivery.
- `id` (Integer, PK, Autoincrement)
- `subject` (String(255), Not Null)
- `body` (Text, Not Null)
- `recipient` (String(255), Not Null)
- `attachments` (JSON, Nullable)
- `sent` (Boolean, Default: False)
- `error_message` (Text, Nullable)
- `created_at` (DateTime, Default: now())
- `sent_at` (DateTime, Nullable)

---

## Key Enums Summary

| Enum | Table | Values |
|------|-------|--------|
| `RequestStatus` | `purchase_requests.current_status` | `pr_submitted`, `in_progress`, `sent_back`, `rejected`, `po_issued`, `cancelled`, `completed`, `rolled_over`, `budget_file_allocation` |
| `PurchaseType` | `purchase_requests.purchase_type`, `workflow_hierarchies.purchase_type`, `administrative_approval_workflows.purchase_type` | `"research"`, `"others"` |
| `AssignmentStatus` | `purchase_request_assignments.status` | `pending`, `in_progress`, `completed` |
| `DeliveryStatus` | `deliveries.status` | `pending`, `initiator_confirmed`, `dept_logged`, `stores_logged`, `verified`, `discrepancy` |
| `DiscrepancyStatus` | `discrepancies.status` | `open`, `resolved` |
| `PaymentStatus` | `payments.status` | `pending`, `approved`, `paid`, `blocked` |
| `AssetCondition` | `assets.condition` | `working`, `damaged`, `under_repair`, `obsolete` |
| `AssetCategory` | `assets.category` | `lab_equipment`, `furniture`, `computer`, `other` |
| `DisposalStatus` | `assets.disposal_status` | `active`, `pending_disposal`, `disposed` |

---

## Critical Invariants

1. `budget_master.committed_amount` must never go negative — all SQL updates use `func.greatest(0.0, ...)`
2. `purchase_request_history` is append-only — never UPDATE or DELETE rows
3. `dept_asset_logs` is immutable after creation
4. `asset_tag` values are generated via PostgreSQL `nextval()` sequences — never client-side
5. `purchase_request_flows` holds exactly **one** row per PR (the current step) — not a history table
6. All vendor details in `purchase_orders` are embedded strings — no FK to `vendor_master`
7. `deliveries.po_id` stores `purchase_requests.id` despite the column name
