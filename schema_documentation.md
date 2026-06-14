# NIT Inventory - Codebase Database Schema Documentation

This document describes the SQLAlchemy declarative models defining the database schema of the **NIT Inventory (Institutional Resource & Inventory System)** project.

---

## 1. User & Authentication Management

### `departments`
Stores departmental details within the institute.
- `id` (Integer, Primary Key, Autoincrement)
- `name` (String(255), Not Null) - Full department name
- `short_code` (String(20), Not Null, Unique) - e.g., "CSE", "ECE"
- `created_at` (DateTime, Default: now())

### `role_managers`
Defines system-wide authorization roles.
- `id` (Integer, Primary Key, Autoincrement)
- `name` (String(100), Not Null) - Role label (e.g. "Internal Auditor")
- `value` (String(50), Not Null, Unique) - Identifier (e.g. "ia")
- `group_key` (String(50), Not Null) - Authorization group (e.g. "internal_audit", "hod", "dean_approver")

### `users`
Represents faculty, staff, and administrative users.
- `id` (Integer, Primary Key, Autoincrement)
- `title` (String(50), Nullable, Default: "Mr.")
- `name` (String(255), Not Null)
- `email` (String(255), Not Null, Unique)
- `hashed_password` (String(255), Not Null)
- `designation` (String(255), Not Null)
- `gender` (String(20), Not Null)
- `role_id` (Integer, ForeignKey to `role_managers.id`, Nullable)
- `department_id` (Integer, ForeignKey to `departments.id`, Nullable)
- `is_active` (Boolean, Default: True)
- `signature_path` (String(500), Nullable) - Path to signature image
- `is_approved` (Boolean, Default: False)
- `last_login_at` (DateTime, Nullable)
- `created_at` (DateTime, Default: now())

---

## 2. Budget & Procurement Configuration

### `financial_years`
Identifies academic/financial year cycles.
- `id` (Integer, Primary Key, Autoincrement)
- `label` (String(9), Not Null) - e.g., "2024-25"
- `start_date` (Date, Not Null)
- `end_date` (Date, Not Null)
- `is_active` (Boolean, Default: True)
- `is_closed` (Boolean, Default: False)

### `procurement_managers`
Modes of procurement configuration (e.g., GeM, LPC, PAC).
- `id` (Integer, Primary Key, Autoincrement)
- `name` (String(100), Not Null, Unique)
- `description` (String(255), Nullable)
- `max_amount` (Float, Nullable)
- `form_schema` (JSON, Nullable)

### `purchase_categories`
Determines GFR purchase categories and thresholds.
- `id` (Integer, Primary Key, Autoincrement)
- `title` (String(255), Not Null)
- `min_amount` (Float, Not Null)
- `max_amount` (Float, Not Null)
- `is_active` (Boolean, Default: True)
- `procurement_id` (Integer, ForeignKey to `procurement_managers.id`, Not Null)
- `requirement_type` (String(100), Nullable)
- `created_at` (DateTime, Default: now())

### `phase_managers`
Maintains stages in the purchase workflow.
- `id` (Integer, Primary Key, Autoincrement)
- `phase_name` (String(50), Not Null, Unique)
- `description` (String(255), Nullable)
- `phase_order` (Integer, Default: 0)

### `budget_master`
Central budget ledger representing financial allocations.
- `id` (Integer, Primary Key, Autoincrement)
- `department_id` (Integer, ForeignKey to `departments.id`, Nullable)
- `financial_year_id` (Integer, ForeignKey to `financial_years.id`, Not Null)
- `source_of_fund` (String(255), Not Null)
- `item_name` (String(255), Not Null)
- `category` (String(255), Not Null)
- `course_code` (String(255), Not Null)
- `unit_cost` (Float, Not Null)
- `quantity` (Integer, Not Null)
- `total_allocation` (Float, Not Null)
- `file_no` (String(64), Not Null)
- `is_revision` (Boolean, Default: False)
- `committed_amount` (Float, Default: 0.0) - Currently locked budget
- `utilized_amount` (Float, Default: 0.0) - Final deducted budget
- `remarks` (Text, Nullable)
- `attachment_path` (String(512), Nullable)
- `project_code` (String(255), Nullable)
- `principal_investigator` (String(255), Nullable)
- `project_due_date` (Date, Nullable)
- `expert1_id` (Integer, ForeignKey to `users.id`, Nullable)
- `expert2_id` (Integer, ForeignKey to `users.id`, Nullable)
- `director_faculty_id` (Integer, ForeignKey to `users.id`, Nullable)
- `allocated_initiator_id` (Integer, ForeignKey to `users.id`, Nullable)
- `nominee_ids` (JSON, Nullable)
- `created_at` (DateTime, Default: now())

### `settings`
Global system configurations.
- `id` (Integer, Primary Key, Autoincrement)
- `key_name` (String(255), Not Null, Unique)
- `value` (String(1024), Not Null)
- `updated_at` (DateTime, Default: now(), OnUpdate: now())

### `tc_master`
Terms & conditions templates.
- `id` (Integer, Primary Key, Autoincrement)
- `title` (String(255), Not Null)
- `content` (Text, Not Null)
- `created_at` (DateTime, Default: now())

---

## 3. Administrative Approvals (AA) Workflow

### `administrative_approvals`
Tracks the initial request for administrative clearance before entering purchase processing.
- `id` (Integer, Primary Key, Autoincrement)
- `aa_number` (String(100), Unique, Nullable)
- `budget_file_id` (Integer, ForeignKey to `budget_master.id`, Not Null)
- `pi_id` (Integer, ForeignKey to `users.id`, Not Null)
- `quantity` (Integer, Default: 1)
- `item_description` (Text, Not Null)
- `gst_rate` (Float, Not Null)
- `mode_of_procurement` (String(100), Not Null)
- `justification` (Text, Not Null)
- `gst_amount` (Float, Not Null)
- `total_cost` (Float, Not Null)
- `status` (String(100), Default: "Submitted to HOD")
- `pending_with` (String(50), Nullable) - e.g., "HOD", "ADPD", "Dean", "IA", "Director"
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

### `administrative_approval_histories`
Audit log of administrative approval workflow actions.
- `id` (Integer, Primary Key, Autoincrement)
- `aa_id` (Integer, ForeignKey to `administrative_approvals.id`, Not Null)
- `approver_id` (Integer, ForeignKey to `users.id`, Not Null)
- `approver_role` (String(100), Not Null)
- `status` (String(100), Not Null)
- `remarks` (Text, Nullable)
- `acted_at` (DateTime, Default: now())

### `administrative_approval_workflows`
Custom workflow steps dynamically configured based on categories.
- `id` (Integer, Primary Key, Autoincrement)
- `category_id` (Integer, ForeignKey to `purchase_categories.id`, Nullable)
- `procurement_id` (Integer, ForeignKey to `procurement_managers.id`, Nullable)
- `purchase_type` (String(50), Nullable) - e.g., "department"
- `step_order` (Integer, Not Null)
- `role_id` (Integer, ForeignKey to `role_managers.id`, Nullable)
- `user_group` (String(100), Nullable)
- `is_enabled` (Boolean, Default: True)
- `skip_condition` (String(500), Nullable)

### `administrative_approval_nominees`
Nominated technical experts tasked with scrutinizing an administrative proposal.
- `id` (Integer, Primary Key, Autoincrement)
- `aa_id` (Integer, ForeignKey to `administrative_approvals.id`, Not Null)
- `nominee_id` (Integer, ForeignKey to `users.id`, Not Null)
- `step_order` (Integer, Not Null)
- `status` (String(50), Default: "Pending")
- `remarks` (Text, Nullable)
- `acted_at` (DateTime, Nullable)

---

## 4. Purchase Requests & Lifecycle Management

### `purchase_requests`
Main purchase lifecycle record representing indents, tenders, and evaluations.
- `id` (Integer, Primary Key, Autoincrement)
- `amount` (Float, Not Null)
- `status` (String(100), Default: "Submitted")
- `pending_with` (String(100), Nullable)
- `created_at` (DateTime, Default: now())
- `initiator_id` (Integer, ForeignKey to `users.id`, Not Null)
- `procurement_id` (Integer, ForeignKey to `procurement_managers.id`, Not Null)
- `category_id` (Integer, ForeignKey to `purchase_categories.id`, Nullable)
- `aa_approved_at` (DateTime, Nullable)
- `fs_approved_at` (DateTime, Nullable)
- `te_initiated_at` (DateTime, Nullable)
- `te_approved_at` (DateTime, Nullable)
- `po_approved_at` (DateTime, Nullable)
- `faculty1_id` (Integer, ForeignKey to `users.id`, Nullable)
- `faculty2_id` (Integer, ForeignKey to `users.id`, Nullable)
- `faculty3_id` (Integer, ForeignKey to `users.id`, Nullable)
- `delivery_location` (String(500), Nullable)
- `performance_security` (Float, Default: 3.0)
- `emd` (Float, Default: 2.0)

### `purchase_request_items`
Indented line items within a purchase request.
- `id` (Integer, Primary Key, Autoincrement)
- `pr_id` (Integer, ForeignKey to `purchase_requests.id`, Not Null)
- `budget_file_id` (Integer, ForeignKey to `budget_master.id`, Not Null)
- `item_description` (Text, Not Null)
- `quantity` (Integer, Default: 1)
- `charges` (Float, Default: 0.0) - entered as percentage, e.g. 18.0
- `estimated_total` (Float, Not Null) - base cost
- `tech_specs_text` (Text, Nullable)
- `warranty` (Integer, Default: 12)
- `delivery_period` (Integer, Default: 8)
- `installation_required` (Boolean, Default: False)
- `site_readiness` (String(255), Nullable)
- `site_readiness_remarks` (Text, Nullable)

### `purchase_request_flows`
Configured workflow stages for a Purchase Request.
- `id` (Integer, Primary Key, Autoincrement)
- `pr_id` (Integer, ForeignKey to `purchase_requests.id`, Not Null)
- `phase` (String(50), Not Null) - e.g., "Indent", "Technical", "Financial", "Purchase Order"
- `status` (String(50), Default: "Pending")
- `completed_at` (DateTime, Nullable)

### `purchase_request_histories`
Workflow audit logs for purchase requests.
- `id` (Integer, Primary Key, Autoincrement)
- `pr_id` (Integer, ForeignKey to `purchase_requests.id`, Not Null)
- `current_approver_id` (Integer, ForeignKey to `users.id`, Nullable)
- `status` (String(100), Not Null)
- `remarks` (Text, Nullable)
- `acted_at` (DateTime, Default: now())
- `frozen_signature_path` (String(500), Nullable)
- `frozen_actor_name` (String(255), Nullable)
- `frozen_designation` (String(255), Nullable)

### `purchase_request_assignments`
Tracks tasks assigned to specific administrative personnel (e.g., S&P staff).
- `id` (Integer, Primary Key, Autoincrement)
- `pr_id` (Integer, ForeignKey to `purchase_requests.id`, Not Null)
- `assigned_to_id` (Integer, ForeignKey to `users.id`, Not Null)
- `assigned_by_id` (Integer, ForeignKey to `users.id`, Not Null)
- `role` (String(50), Not Null) - e.g., "superintendent", "assistant"
- `created_at` (DateTime, Default: now())
- `completed_at` (DateTime, Nullable)

### `documents`
Uploaded attachments linked to purchase requests (e.g., quotes, certificates).
- `id` (Integer, Primary Key, Autoincrement)
- `pr_id` (Integer, ForeignKey to `purchase_requests.id`, Not Null)
- `doc_key` (String(100), Not Null) - e.g., "gem_arpt", "oem_pac_file"
- `doc_value` (JSON, Not Null) - Stores path, size, type metadata
- `uploaded_by_id` (Integer, ForeignKey to `users.id`, Not Null)
- `created_at` (DateTime, Default: now())
- `updated_at` (DateTime, Default: now(), OnUpdate: now())

### `workflow_hierarchies`
Direct structural hierarchies defining workflow paths.
- `id` (Integer, Primary Key, Autoincrement)
- `role_id` (Integer, ForeignKey to `role_managers.id`, Not Null)
- `reports_to_role_id` (Integer, ForeignKey to `role_managers.id`, Nullable)
- `is_active` (Boolean, Default: True)

### `vendor_masters`
Stores supplier database directory.
- `id` (Integer, Primary Key, Autoincrement)
- `name` (String(255), Not Null)
- `address` (Text, Nullable)
- `email` (String(255), Nullable)
- `phone` (String(50), Nullable)
- `pan` (String(20), Nullable)
- `gstin` (String(20), Nullable)
- `bank_name` (String(255), Nullable)
- `account_no` (String(100), Nullable)
- `ifsc` (String(20), Nullable)
- `is_active` (Boolean, Default: True)

### `purchase_orders`
Official Purchase Orders issued to vendors.
- `id` (Integer, Primary Key, Autoincrement)
- `pr_id` (Integer, ForeignKey to `purchase_requests.id`, Not Null)
- `vendor_id` (Integer, ForeignKey to `vendor_masters.id`, Not Null)
- `po_number` (String(100), Unique, Not Null)
- `po_date` (Date, Not Null)
- `total_amount` (Float, Not Null)
- `delivery_date` (Date, Nullable)
- `status` (String(50), Default: "Draft")
- `remarks` (Text, Nullable)
- `po_document_path` (String(512), Nullable)
- `created_by_id` (Integer, ForeignKey to `users.id`, Not Null)
- `created_at` (DateTime, Default: now())

### `technical_evaluations`
Contains evaluations submitted by technical committees.
- `id` (Integer, Primary Key, Autoincrement)
- `pr_id` (Integer, ForeignKey to `purchase_requests.id`, Not Null)
- `vendor_id` (Integer, ForeignKey to `vendor_masters.id`, Not Null)
- `is_qualified` (Boolean, Not Null)
- `remarks` (Text, Nullable)
- `created_by_id` (Integer, ForeignKey to `users.id`, Not Null)
- `created_at` (DateTime, Default: now())

### `financial_evaluations`
Contains comparative statement evaluations for bid pricing.
- `id` (Integer, Primary Key, Autoincrement)
- `pr_id` (Integer, ForeignKey to `purchase_requests.id`, Not Null)
- `vendor_id` (Integer, ForeignKey to `vendor_masters.id`, Not Null)
- `quoted_amount` (Float, Not Null)
- `is_l1` (Boolean, Default: False)
- `remarks` (Text, Nullable)
- `created_by_id` (Integer, ForeignKey to `users.id`, Not Null)
- `created_at` (DateTime, Default: now())

### `commercial_evaluations`
Tracks commercial terms evaluations.
- `id` (Integer, Primary Key, Autoincrement)
- `pr_id` (Integer, ForeignKey to `purchase_requests.id`, Not Null)
- `vendor_id` (Integer, ForeignKey to `vendor_masters.id`, Not Null)
- `terms_accepted` (Boolean, Default: True)
- `remarks` (Text, Nullable)
- `created_at` (DateTime, Default: now())

### `po_cancellations`
Logs cancellations requested on issued Purchase Orders.
- `id` (Integer, Primary Key, Autoincrement)
- `po_id` (Integer, ForeignKey to `purchase_orders.id`, Not Null)
- `reason` (Text, Not Null)
- `requested_by_id` (Integer, ForeignKey to `users.id`, Not Null)
- `approved_by_id` (Integer, ForeignKey to `users.id`, Nullable)
- `status` (String(50), Default: "Pending Approval")
- `created_at` (DateTime, Default: now())

### `tender_cancellations`
Logs cancellations applied to ongoing tenders.
- `id` (Integer, Primary Key, Autoincrement)
- `pr_id` (Integer, ForeignKey to `purchase_requests.id`, Not Null)
- `reason` (Text, Not Null)
- `requested_by_id` (Integer, ForeignKey to `users.id`, Not Null)
- `approved_by_id` (Integer, ForeignKey to `users.id`, Nullable)
- `status` (String(50), Default: "Pending Approval")
- `created_at` (DateTime, Default: now())

### `bill_passings`
Audits bill submission and authorization records for final settlement.
- `id` (Integer, Primary Key, Autoincrement)
- `po_id` (Integer, ForeignKey to `purchase_orders.id`, Not Null)
- `invoice_no` (String(100), Not Null)
- `invoice_date` (Date, Not Null)
- `invoice_amount` (Float, Not Null)
- `passed_amount` (Float, Not Null)
- `stock_entry_reference` (String(100), Nullable)
- `remarks` (Text, Nullable)
- `status` (String(50), Default: "Pending")
- `submitted_by_id` (Integer, ForeignKey to `users.id`, Not Null)
- `approved_by_id` (Integer, ForeignKey to `users.id`, Nullable)
- `created_at` (DateTime, Default: now())

### `pr_referrals`
Inter-departmental referrals/queries during procurement scrutiny.
- `id` (Integer, Primary Key, Autoincrement)
- `pr_id` (Integer, ForeignKey to `purchase_requests.id`, Not Null)
- `referred_by_id` (Integer, ForeignKey to `users.id`, Not Null)
- `referred_to_id` (Integer, ForeignKey to `users.id`, Not Null)
- `query` (Text, Not Null)
- `response` (Text, Nullable)
- `query_document_path` (String(512), Nullable)
- `response_document_path` (String(512), Nullable)
- `status` (String(50), Default: "Pending")
- `created_at` (DateTime, Default: now())
- `responded_at` (DateTime, Nullable)

---

## 5. Deliveries, Payments, & Inventory Tracking

### `deliveries`
Logs shipment arrivals.
- `id` (Integer, Primary Key, Autoincrement)
- `po_id` (Integer, ForeignKey to `purchase_orders.id`, Not Null)
- `received_date` (Date, Not Null)
- `challan_no` (String(100), Nullable)
- `remarks` (Text, Nullable)
- `status` (String(50), Default: "Received")

### `delivery_items`
Specific items received in a delivery.
- `id` (Integer, Primary Key, Autoincrement)
- `delivery_id` (Integer, ForeignKey to `deliveries.id`, Not Null)
- `item_id` (Integer, ForeignKey to `purchase_request_items.id`, Not Null)
- `quantity_received` (Integer, Default: 1)
- `quantity_accepted` (Integer, Default: 1)
- `quantity_rejected` (Integer, Default: 0)

### `payments`
Tracks financial releases made to vendors.
- `id` (Integer, Primary Key, Autoincrement)
- `bill_passing_id` (Integer, ForeignKey to `bill_passings.id`, Not Null)
- `payment_reference` (String(100), Unique, Not Null)
- `payment_date` (Date, Not Null)
- `amount_paid` (Float, Not Null)
- `status` (String(50), Default: "Completed")

### `dept_asset_logs`
Department asset registration tracker.
- `id` (Integer, Primary Key, Autoincrement)
- `department_id` (Integer, ForeignKey to `departments.id`, Not Null)
- `item_description` (Text, Not Null)
- `serial_no` (String(100), Nullable)
- `quantity` (Integer, Default: 1)
- `value` (Float, Not Null)
- `purchase_date` (Date, Nullable)
- `location` (String(255), Nullable)

### `stores_asset_logs`
Main stores central repository asset ledger.
- `id` (Integer, Primary Key, Autoincrement)
- `po_id` (Integer, ForeignKey to `purchase_orders.id`, Nullable)
- `item_description` (Text, Not Null)
- `quantity` (Integer, Default: 1)
- `unit` (String(50), Nullable)
- `status` (String(50), Default: "In Stores")
- `created_at` (DateTime, Default: now())

### `discrepancies`
Discrepancy logs reported during delivery inspection.
- `id` (Integer, Primary Key, Autoincrement)
- `delivery_id` (Integer, ForeignKey to `deliveries.id`, Not Null)
- `reported_by_id` (Integer, ForeignKey to `users.id`, Not Null)
- `description` (Text, Not Null)
- `status` (String(50), Default: "Open")
- `created_at` (DateTime, Default: now())

---

## 6. Physical Assets Directory

### `assets`
Identified institutional equipment/capital assets.
- `id` (Integer, Primary Key, Autoincrement)
- `asset_code` (String(100), Unique, Not Null) - Permanent tracking barcode/code
- `po_id` (Integer, ForeignKey to `purchase_orders.id`, Nullable)
- `department_id` (Integer, ForeignKey to `departments.id`, Not Null)
- `item_description` (Text, Not Null)
- `serial_no` (String(100), Nullable)
- `value` (Float, Not Null)
- `location` (String(255), Nullable)
- `status` (String(50), Default: "In Use")
- `is_consumable` (Boolean, Default: False)
- `warranty_expiry` (Date, Nullable)
- `created_at` (DateTime, Default: now())

### `asset_movements`
Audits movement of assets across labs or departments.
- `id` (Integer, Primary Key, Autoincrement)
- `asset_id` (Integer, ForeignKey to `assets.id`, Not Null)
- `from_location` (String(255), Nullable)
- `to_location` (String(255), Not Null)
- `moved_by_id` (Integer, ForeignKey to `users.id`, Not Null)
- `movement_date` (Date, Not Null)
- `remarks` (Text, Nullable)

### `asset_logs`
Logs of operations or servicing done on an asset.
- `id` (Integer, Primary Key, Autoincrement)
- `asset_id` (Integer, ForeignKey to `assets.id`, Not Null)
- `action` (String(100), Not Null) - e.g., "Service", "Verification"
- `logged_by_id` (Integer, ForeignKey to `users.id`, Not Null)
- `remarks` (Text, Nullable)
- `created_at` (DateTime, Default: now())

### `installation_records`
Servicing and site readiness/installation audits.
- `id` (Integer, Primary Key, Autoincrement)
- `asset_id` (Integer, ForeignKey to `assets.id`, Not Null)
- `installed_by` (String(255), Nullable)
- `installation_date` (Date, Nullable)
- `is_successful` (Boolean, Default: True)
- `report_path` (String(512), Nullable)

---

## 7. Notifications & Utilities

### `notifications`
System alerts dispatched to users.
- `id` (Integer, Primary Key, Autoincrement)
- `user_id` (Integer, ForeignKey to `users.id`, Not Null)
- `title` (String(255), Not Null)
- `message` (Text, Not Null)
- `link` (String(255), Nullable)
- `is_read` (Boolean, Default: False)
- `created_at` (DateTime, Default: now())

### `email_queues`
Emails scheduled/queued for background delivery.
- `id` (Integer, Primary Key, Autoincrement)
- `recipient` (String(255), Not Null)
- `subject` (String(255), Not Null)
- `body` (Text, Not Null)
- `status` (String(50), Default: "Pending")
- `retry_count` (Integer, Default: 0)
- `created_at` (DateTime, Default: now())
- `sent_at` (DateTime, Nullable)
