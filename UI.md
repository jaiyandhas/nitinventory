# UI Changes — Procurement Document Visibility & Director Nominee Optional

All changes are in the **PR Detail Page** (`/pr/:id`).  
No new pages. No new routes. No database changes.

---

## 1. Every Stage — Collapsible Indent Document Panel

**Where:** Top of the stage content panel, below the stage title bar, in ALL stages EXCEPT the Request tab.  
**Affects:** AA · Tendering · Tech Eval · Financial Sanction · Purchase Order · Delivery · Assets

### What appears

A new collapsed panel sits at the very top of every workflow stage's content area.

```
┌────────────────────────────────────────────────────────────┐
│  📄  Indent / Purchase Request Document                    │
│      PI-2024-001 · Dr. Ramesh Kumar · CSE Department      │
│      [2 approvals ✓]              [View full document ▼]  │
└────────────────────────────────────────────────────────────┘
```

- **Header text:** "Indent / Purchase Request Document"
- **Sub-text:** Shows PR number · Initiator name · Department
- **Approval badge:** Shows count of completed approvals (e.g., "2 approvals ✓") in green
- **Toggle text:** "View full document" (collapsed) / "Hide" (expanded)
- **Border colour:** Indigo (distinct from the white stage content card)

### When expanded

Clicking the header opens two sections:

#### Section A — Full Read-Only Indent Summary

All the same sections from the Request tab appear here in read-only form:
- Purchase Indent Summary header (PR number, date, total value)
- Identity & Classification grid (initiator, department, purchase type, category, procurement method, financial year)
- Linked Administrative Approval block (if AA was linked)
- Items Requested table (with tech spec sub-rows — see change #5)
- Procurement Method Specifics (GeM link, CPPP tender ID, etc.)
- Financial & Compliance Details (EMD, PS, exemption, split info)
- Training Requirement block (if applicable)
- Uploaded Documents & Attachments
- Purchase / Technical Committee panel

#### Section B — Workflow Approval Trail

Appears below the summary. Shows every real approver action in chronological numbered sequence.

```
─────────────────────────────────────────
✓  Workflow Approval Trail — actions taken by approvers in sequence
─────────────────────────────────────────

 ①  [Signature Image / ✓ icon]   Dr. A. Krishnamurthy
                                  Head of Department · CSE
                                  [APPROVED ✓]  15 Jan 2026, 11:23 AM
                                  Remarks: "Verified items list and budget allocation."

 ②  [Signature Image / ✓ icon]   Prof. S. Anand
                                  Dean P&D · Administration
                                  [APPROVED ✓]  16 Jan 2026, 09:45 AM
                                  Remarks: "Procurement method confirmed as per GFR."

 ③  [Signature Image / ✓ icon]   Dr. B. Rajendran
                                  Director · Administration
                                  [APPROVED ✓]  17 Jan 2026, 14:10 PM
                                  Remarks: "Sanctioned."
```

Each entry shows:
- **Step number** (circled, emerald)
- **Signature box** — shows the approver's actual signature image if available, otherwise a ✓ icon
- **Name** (bold)
- **Designation** below name
- **Department** below designation
- **Status badge** — "APPROVED" (green) / "SENT BACK" (orange) / "REJECTED" (red)
- **Timestamp** — date and time of action
- **Remarks** in italics below, prefixed with "Remarks:"

**What is NOT shown:** System-generated entries such as "Initiated", "Forwarded", "Tender Details Registered", "Technical Evaluation Completed", "Financial Bids Submitted", "PO Cancelled", "Bill Passed (PR Completed)". Only real human approval/rejection/send-back actions appear.

---

## 2. AA Stage — Director Nominee Field

**Where:** Action panel → "Action Stage: Indent and Detailed Tech Specification" → Director Nominee section  
**Visible to:** Director role only (when it is Director's turn to approve in AA phase)

### Before
```
Director Nominee Selection
As Director, select a Director Nominee to represent the administration on the TSC.

Director Nominee *
[ Select Director Nominee...        ▼ ]
```
- Field had a red asterisk `*`
- Empty field blocked the "Approve & Forward" button

### After
```
Director Nominee Selection
As Director, you may optionally nominate a representative to serve on the TSC.
This selection is not mandatory.

Director Nominee (Optional)
[ — No nominee (skip) —             ▼ ]
```
- Red `*` removed; replaced with grey `(Optional)` label
- Default option text changed from "Select Director Nominee..." to "— No nominee (skip) —"
- Director can click "Approve & Forward" without selecting anyone

---

## 3. AA Stage — Committee Nominees Grid

**Where:** AA stage content → "Purchase Committee Nominees" grid (shown when a budget file is linked)  
**Visible to:** All users who can view the PR in the AA stage

### Before
```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│ PURCHASE         │ FACULTY NOMINEE  │ FACULTY NOMINEE  │ DIRECTOR NOMINEE │
│ INITIATOR        │ 1 (HOD)          │ 2 (HOD)          │                  │
│ Dr. X            │ Prof. Y          │ Prof. Z          │ Not nominated ← rose/red text │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

### After
```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────────────┐
│ PURCHASE         │ FACULTY NOMINEE  │ FACULTY NOMINEE  │ DIRECTOR NOMINEE         │
│ INITIATOR        │ 1 (HOD)          │ 2 (HOD)          │ (Optional)               │
│ Dr. X            │ Prof. Y          │ Prof. Z          │ Not nominated ← grey/muted│
└──────────────────┴──────────────────┴──────────────────┴──────────────────────────┘
```
- Column header changed from "DIRECTOR NOMINEE" → "DIRECTOR NOMINEE (Optional)"
- Empty state text colour changed from rose/red → slate/grey (no longer looks like an error)

---

## 4. AA Stage — Administrative Approval Signature Cards

**Where:** AA stage content → "Administrative Approval Signatures" section  
**Visible to:** All users on AA stage

No change to the 4 signature card positions (Purchase Initiator, HoD Chairperson, Dean P&D, Director). These continue to show clock or signature image based on the approval history.

---

## 5. Request Tab — Items Table (Tech Spec Sub-Rows)

**Where:** Request tab → "Items Requested" table  
**Also visible inside:** The expanded CollapsibleIndentPanel on every other stage tab  
**Visible to:** All users who can view the PR

### Before — each item was a single row
```
┌────┬────────────────────────────┬─────┬──────────┬──────────┬───────────┐
│ #  │ Item Description           │ Qty │ Unit Cost│ Total    │ Budget    │
├────┼────────────────────────────┼─────┼──────────┼──────────┼───────────┤
│ 1  │ Dell Latitude 5540 Laptop  │  5  │ ₹90,000  │₹4,50,000 │ NITT/CS/1 │
└────┴────────────────────────────┴─────┴──────────┴──────────┴───────────┘
```

### After — each item has a main row + optional tech spec sub-row
```
┌────┬─────────────────────────────────────────┬─────┬──────────┬──────────┬───────────┐
│ #  │ Item Description & Specifications       │ Qty │ Unit Cost│ Total    │ Budget    │
├────┼─────────────────────────────────────────┼─────┼──────────┼──────────┼───────────┤
│ 1  │ Dell Latitude 5540 Laptop               │  5  │ ₹90,000  │₹4,50,000 │ NITT/CS/1 │
│    │ [Req. Type: New] [Warranty: 36 mo]      │     │          │          │           │
│    │ [Delivery: 4 wk] [Site Readiness: Ready]│     │          │          │           │
│    │ Processor: Intel i7 13th Gen, 16GB RAM, │     │          │          │           │
│    │ 512GB SSD, Windows 11 Pro...            │     │          │          │           │
├────┼─────────────────────────────────────────┼─────┼──────────┼──────────┼───────────┤
│ 2  │ HP LaserJet Pro Printer                 │  2  │ ₹25,000  │ ₹50,000  │ NITT/CS/1 │
│    │ [Req. Type: New] [Warranty: 12 mo]      │     │          │          │           │
└────┴─────────────────────────────────────────┴─────┴──────────┴──────────┴───────────┘
```

**Chip fields shown (only when the field has data):**
| Chip Label | Source Field | Example Value |
|---|---|---|
| Req. Type | `requirement_type` | New / Replacement / Additional |
| Warranty | `warranty` | 36 mo |
| Delivery | `delivery_period` | 4 wk |
| Availability | `availability` | Available / On Order |
| Site Readiness | `site_readiness` | Ready / Pending Civil Work |
| Installation | `installation_required` | Required |

**Tech specs text block** (shown below chips when present):
- Rendered in italic, slate colour, with a left border accent
- Contains the full free-text technical specification entered by the initiator

**Column header renamed:** "Item Description" → "Item Description & Specifications"

---

## 6. Request Tab — Purchase / Technical Committee Section

**Where:** Request tab → "Purchase / Technical Committee" section (Section 9 in PRSummaryTable)  
**Also visible inside:** The expanded CollapsibleIndentPanel on every other stage tab

### Before
```
Purchase Initiator    Expert 1 (HOD Nominee)    Expert 2 (HOD Nominee)    Expert 3 (Director Nominee)
Dr. X                 Prof. Y                   Prof. Z                   Not nominated yet ← rose/red
```

### After
```
Purchase Initiator    Expert 1 (HOD Nominee) *    Expert 2 (HOD Nominee) *    Director Nominee (Optional)
Dr. X                 Prof. Y                      Prof. Z                      Not nominated ← grey/muted
```
- Expert 1 and Expert 2 labels now have a red `*` indicating they are mandatory
- "Expert 3" label changed to "Director Nominee"
- "(Optional)" added to Director Nominee label
- Empty state changed from "Not nominated yet" (rose/red) → "Not nominated" (slate grey)

---

## 7. Tech Eval Stage — Expert Committee Progress Cards

**Where:** Tech Eval stage content → left column → "Expert Committee Progress" grid  
**Visible to:** All users on the Tech Eval stage

### Before — always showed 4 cards including a Director Nominee slot
```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ Purchase        │ HOD Nominated   │ HOD Nominated   │ Director        │
│ Initiator       │ Expert 1        │ Expert 2        │ Nominee         │
│ [sig / ✓]       │ [sig / ✓]       │ [sig / ✓]       │ ○ Awaiting ←   │
│                 │                 │                 │  (always showed │
│                 │                 │                 │   even if empty)│
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

### After — Director Nominee card is conditional

**When Director Nominee IS assigned:** Card appears normally with their name and signature status.
```
┌─────────────────┬─────────────────┬─────────────────┬───────────────────────┐
│ Purchase        │ HOD Nominated   │ HOD Nominated   │ Director Nominee      │
│ Initiator       │ Expert 1        │ Expert 2        │ (Optional)            │
│ Dr. X  ✓        │ Prof. Y  ✓      │ Prof. Z  ○      │ Prof. W  ○            │
└─────────────────┴─────────────────┴─────────────────┴───────────────────────┘
```

**When Director Nominee is NOT assigned:** Card is replaced by a dashed placeholder.
```
┌─────────────────┬─────────────────┬─────────────────┬──────────────────────────┐
│ Purchase        │ HOD Nominated   │ HOD Nominated   │ Director Nominee         │
│ Initiator       │ Expert 1        │ Expert 2        │ - - - - - - - - - - -   │
│ Dr. X  ✓        │ Prof. Y  ✓      │ Prof. Z  ○      │  Not Nominated (Optional)│
└─────────────────┴─────────────────┴─────────────────┴──────────────────────────┘
```
- Dashed border instead of solid
- Text: "Director Nominee" + "Not Nominated (Optional)" in grey
- No clock icon, no "Awaiting Signature" text

---

## 8. Tech Eval Stage — TE Expert Signature Cards (Committee Panel)

**Where:** AA stage → "Technical Evaluation Expert Signatures" section (shown after TE is completed)  
**Visible to:** All users on AA stage when TE is done

### Before
```
Director Nominee card → ○ Awaiting Signature  (even when faculty3 was never assigned)
```

### After
**When Director Nominee assigned:** Shows signature / awaiting as normal.  
**When Director Nominee NOT assigned:** Shows dashed placeholder card:
```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  Director Nominee
  Not Nominated (Optional)
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

---

## 9. PR Creation — Item Details Form (Budget Validation Warning)

**Where:** PR creation wizard → Step 3: Item Details → Quantity field helper text  
**Visible to:** Faculty (PR initiator) during creation

### Before
```
Quantity: [5]
Base Cost: ₹4,72,000 | Total Cost (incl. GST): ₹5,90,000
```
- Always showed "Base Cost | Total Cost incl. GST" in static grey text
- No visual warning when estimated cost approached or exceeded available balance

### After
```
Quantity: [5]
Estimated Cost: ₹4,72,000  + GST: ₹1,18,000       ← green when within budget
```
or if over budget:
```
Estimated Cost: ₹6,00,000  + GST: ₹1,50,000  ⚠ Exceeds available balance!  ← rose/red text
```
- Shows "Estimated Cost" (pre-GST) and "+ GST" amount separately
- Text turns rose/red and shows warning icon when estimated cost exceeds available balance
- Budget validation on submit now uses pre-GST estimated cost (not GST-inclusive total)

**Backend change:** Budget validation and locking now use the pre-GST `estimated_total` directly. The budget file's `available_balance` represents the total sanctioned amount covering all costs. GST is now informational only and does not inflate the budget comparison.

---

## 10. Rejected PR — Reinitiate Option

**Where:** PR Detail Page → Action Panel (appears when PR status = "Rejected")  
**Visible to:** Initiator (faculty who created the PR)

### Before
When a PR was rejected, the action panel went blank — no options available. The PR was effectively dead.

### After
```
┌─────────────────────────────────────────────────────────────────┐
│  ✗  Purchase Indent Returned                                     │
├─────────────────────────────────────────────────────────────────┤
│  This Purchase Indent was returned by the approving authority.   │
│  The budget allocation has been refunded.                        │
│                                                                  │
│  ┌──────────────────────────────────────┐                        │
│  │ RETURNED BY                          │                        │
│  │ Dr. B. Rajendran                     │                        │
│  │ Director                             │                        │
│  │ "Item specifications do not meet     │                        │
│  │  GFR 2017 requirements."             │                        │
│  └──────────────────────────────────────┘                        │
│                                                                  │
│  You may re-initiate this procurement with revised details.      │
│  A new Purchase Indent will be created with all items carried    │
│  over.                                                           │
│                                                                  │
│  [ ↺ Re-initiate Purchase Indent ]                              │
└─────────────────────────────────────────────────────────────────┘
```

**Elements shown:**
- Red-bordered panel with "Purchase Indent Returned" header
- Who returned it: name + designation from the last rejection history entry
- Their remarks (in italics)
- Explanation message
- "Re-initiate Purchase Indent" orange button (visible to initiator only)

**What happens on Re-initiate:** Creates a new PR cloned from this one (all items, budget files, committee info carried over). Redirects to the new PR for submission.

---

## Summary Table

| Stage / Location | Element | Before | After |
|---|---|---|---|
| **All stages** (except Request) | Top of stage content area | Nothing | Collapsible Indent Document panel with full PR summary + approval trail |
| **All stages** (approval trail) | Inside CollapsibleIndentPanel | Not shown | Name · Designation · Dept · Signature · Timestamp · Status · Remarks for each approver |
| **AA stage** → Director's action panel | Director Nominee field label | `Director Nominee *` (required) | `Director Nominee (Optional)` |
| **AA stage** → Director's action panel | Default dropdown option | "Select Director Nominee..." | "— No nominee (skip) —" |
| **AA stage** → Director's action panel | Helper text | "select a Director Nominee to represent the administration" | "you may optionally nominate a representative…This selection is not mandatory." |
| **AA stage** → Committee nominees grid | Director Nominee column header | "DIRECTOR NOMINEE" | "DIRECTOR NOMINEE (Optional)" |
| **AA stage** → Committee nominees grid | Empty state text | "Not nominated" in rose/red | "Not nominated" in slate/grey |
| **AA stage** → TE Expert Signatures | Director Nominee card (empty) | "Awaiting Signature" clock card | Dashed placeholder "Not Nominated (Optional)" |
| **Request tab** → Items table | Column header | "Item Description" | "Item Description & Specifications" |
| **Request tab** → Items table | Per-item display | Single row only | Main row + tech spec sub-row (chips + specs text) |
| **Request tab** → Committee section | Expert 1 label | "Expert 1 (HOD Nominee)" | "Expert 1 (HOD Nominee) *" |
| **Request tab** → Committee section | Expert 2 label | "Expert 2 (HOD Nominee)" | "Expert 2 (HOD Nominee) *" |
| **Request tab** → Committee section | Director label | "Expert 3 (Director Nominee)" | "Director Nominee (Optional)" |
| **Request tab** → Committee section | Empty director state | "Not nominated yet" in rose/red | "Not nominated" in slate/grey |
| **Tech Eval stage** → Committee Progress | Director card when unassigned | Always shown as "Awaiting" | Not shown (removed from grid) |
| **Tech Eval stage** → Committee Progress | Director card when assigned | Shown normally | Shown with label "Director Nominee (Optional)" |
| **PR creation** → Item Details form | Quantity helper text | "Base Cost | Total Cost incl. GST" static grey | "Estimated Cost + GST" with rose/red warning when over budget |
| **PR creation** → Submit validation | Budget comparison | Pre-GST amount × (1 + GST%) compared against available balance | Pre-GST estimated amount compared directly against available balance |
| **Rejected PR** → Action panel | Panel content | Blank / no options | "Purchase Indent Returned" panel with who rejected, their remarks, and Re-initiate button |
