import React from 'react';
import { FileText, Download, ChevronRight } from 'lucide-react';
import { PurchaseRequest } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { formatFileNo } from '../../../utils/format';

interface PRSummaryTableProps {
  pr: PurchaseRequest;
  formatCurrency: (n?: number) => string;
}

const DocRow: React.FC<{ label: string; value?: React.ReactNode; full?: boolean }> = ({ label, value, full }) => {
  if (!value && value !== 0) return null;
  return (
    <tr className={full ? 'col-span-2' : ''}>
      <td className="border border-gray-300 px-3 py-2 text-[11px] font-semibold text-gray-600 bg-gray-50 whitespace-nowrap w-48 align-top">
        {label}
      </td>
      <td className="border border-gray-300 px-3 py-2 text-[12px] text-gray-900 align-top">
        {value}
      </td>
    </tr>
  );
};

const SectionTitle: React.FC<{ num: number; title: string }> = ({ num, title }) => (
  <tr>
    <td
      colSpan={2}
      className="border border-gray-400 px-3 py-2 bg-gray-100 text-[11px] font-bold text-gray-800 uppercase tracking-widest"
    >
      {num}. {title}
    </td>
  </tr>
);

export const PRSummaryTable: React.FC<PRSummaryTableProps> = ({ pr, formatCurrency }) => {
  const { user } = useAuth();

  const items = pr.items || [];
  const totalCost = pr.amount || 0;

  const formLabels: Record<string, string> = {
    gem_link: 'GeM Bid / RA Link',
    gem_nac_attached: 'GeM NAC Attached',
    tender_id: 'CPPP Tender ID',
    publication_date: 'Publication Date (CPPP)',
    invited_vendors: 'Invited Vendors',
    manufacturer_name: 'OEM Manufacturer Name',
    manufacturer_address: 'OEM Address',
    justification_type: 'PAC Justification Basis',
    finance_concurrence_ref: 'Finance Concurrence Reference',
  };

  const justificationTypeMap: Record<string, string> = {
    sole_manufacturer: 'Sole Manufacturer',
    no_alternative: 'No Alternative Product Acceptable',
    similar_unavailable: 'Similar Product Unavailable',
  };

  const formatFormValue = (key: string, val: any): string => {
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (key === 'justification_type') return justificationTypeMap[val] || val;
    return String(val);
  };

  const formDataEntries = pr.form_data
    ? Object.entries(pr.form_data).filter(
        ([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object' && !Array.isArray(v)
      )
    : [];

  const pr_any = pr as any;
  const linkedAA = pr_any.administrative_approval;
  const financialYear = pr_any.financial_year;
  const isTrainingRequired = pr_any.is_training_required;

  const dateStr = pr.created_at
    ? new Date(pr.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  const deptName = pr.initiator?.department?.name || '—';

  return (
    <div className="bg-white text-gray-900" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>

      {/* ── Letterhead ─────────────────────────────────────────────────── */}
      <div className="border-2 border-gray-800">

        {/* Institution header */}
        <div className="border-b-2 border-gray-800 text-center py-4 px-6 bg-[#0f2a54]">
          <p className="text-white text-[10px] font-bold uppercase tracking-[0.25em] opacity-80">
            National Institute of Technology · Tiruchirappalli — 620 015
          </p>
          <h1 className="text-white text-base font-bold uppercase tracking-wider mt-1" style={{ fontFamily: 'inherit' }}>
            Purchase Indent Form
          </h1>
          <p className="text-blue-200 text-[10px] mt-0.5 tracking-wide">
            {deptName !== '—' ? `Department of ${deptName}` : 'Department of —'}
          </p>
        </div>

        {/* Document meta row */}
        <div className="border-b border-gray-400 flex items-stretch text-[11px]">
          <div className="flex-1 px-4 py-2 border-r border-gray-400">
            <span className="font-bold text-gray-600 uppercase tracking-wider text-[9px]">Indent No.</span>
            <span className="ml-2 font-bold text-gray-900">{pr.icr_number || `PI-${pr.id}`}</span>
          </div>
          <div className="flex-1 px-4 py-2 border-r border-gray-400">
            <span className="font-bold text-gray-600 uppercase tracking-wider text-[9px]">Date</span>
            <span className="ml-2 text-gray-900">{dateStr}</span>
          </div>
          <div className="flex-1 px-4 py-2 border-r border-gray-400">
            <span className="font-bold text-gray-600 uppercase tracking-wider text-[9px]">Financial Year</span>
            <span className="ml-2 text-gray-900">{financialYear?.year || financialYear?.label || '—'}</span>
          </div>
          <div className="flex-1 px-4 py-2">
            <span className="font-bold text-gray-600 uppercase tracking-wider text-[9px]">Total Value</span>
            <span className="ml-2 font-bold text-gray-900">{formatCurrency(totalCost)}</span>
          </div>
        </div>

        {/* ── SECTION 1: Indent Details ─────────────────────────────────── */}
        <table className="w-full border-collapse">
          <tbody>
            <SectionTitle num={1} title="Indent Details" />
            <DocRow label="Name of Indenter" value={pr.initiator?.name} />
            <DocRow label="Designation" value={(pr.initiator as any)?.designation} />
            <DocRow label="Department" value={deptName} />
            <DocRow label="Purchase Type" value={<span className="capitalize">{pr.purchase_type || '—'}</span>} />
            <DocRow label="Category" value={pr.category?.title} />
            <DocRow label="Procurement Method" value={pr.procurement?.name} />
            {pr.delivery_location && <DocRow label="Delivery Location" value={pr.delivery_location} />}
            {pr.delivery_mode && <DocRow label="Delivery Mode" value={pr.delivery_mode} />}
            {pr.basis_of_estimate && <DocRow label="Basis of Estimation" value={pr.basis_of_estimate} />}
          </tbody>
        </table>

        {/* ── SECTION 2: Linked Administrative Approval ─────────────────── */}
        {linkedAA && (
          <table className="w-full border-collapse">
            <tbody>
              <SectionTitle num={2} title="Administrative Approval Reference" />
              <DocRow label="AA Reference No." value={linkedAA.reference_number || `AA-${linkedAA.id}`} />
              <DocRow label="AA Status" value={linkedAA.status} />
              {linkedAA.budget_file && (
                <DocRow label="Budget File" value={formatFileNo(linkedAA.budget_file.file_no, user?.role?.group_key)} />
              )}
              {linkedAA.item_description && <DocRow label="Item Description" value={linkedAA.item_description} />}
              {linkedAA.total_cost && <DocRow label="AA Approved Amount" value={formatCurrency(linkedAA.total_cost)} />}
            </tbody>
          </table>
        )}

        {/* ── SECTION 3: Items Requested ────────────────────────────────── */}
        {items.length > 0 && (
          <div>
            <div className="border-t border-b border-gray-400 px-3 py-2 bg-gray-100">
              <p className="text-[11px] font-bold text-gray-800 uppercase tracking-widest">
                {linkedAA ? '3' : '2'}. Items / Equipment Requested
              </p>
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-2 py-2 text-center text-[10px] font-bold text-gray-600 uppercase tracking-wider w-8">Sl.</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Item Description &amp; Technical Specifications</th>
                  <th className="border border-gray-300 px-2 py-2 text-center text-[10px] font-bold text-gray-600 uppercase tracking-wider w-12">Qty</th>
                  <th className="border border-gray-300 px-2 py-2 text-right text-[10px] font-bold text-gray-600 uppercase tracking-wider w-28">Unit Cost (₹)</th>
                  <th className="border border-gray-300 px-2 py-2 text-right text-[10px] font-bold text-gray-600 uppercase tracking-wider w-28">Total (₹)</th>
                  <th className="border border-gray-300 px-2 py-2 text-center text-[10px] font-bold text-gray-600 uppercase tracking-wider w-16">GST %</th>
                  <th className="border border-gray-300 px-2 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider w-28">Budget File</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const fileNo = (item as any).budget_file?.file_no;
                  const formattedFileNo = fileNo ? formatFileNo(fileNo, user?.role?.group_key) : '—';
                  const qty = item.quantity ?? 1;
                  const total = item.estimated_total ?? 0;
                  const unitCost = qty > 0 ? total / qty : 0;
                  const gst = item.charges ?? 0;

                  const specLines: string[] = [];
                  if (item.requirement_type) specLines.push(`Requirement: ${item.requirement_type}`);
                  if (item.warranty) specLines.push(`Warranty: ${item.warranty} months`);
                  if (item.delivery_period) specLines.push(`Delivery Period: ${item.delivery_period} weeks`);
                  if (item.availability) specLines.push(`Availability: ${item.availability}`);
                  if (item.site_readiness) specLines.push(`Site Readiness: ${item.site_readiness}`);
                  if ((item as any).installation_required === true || (item as any).installation_required === 'Yes')
                    specLines.push('Installation: Required');

                  return (
                    <React.Fragment key={item.id}>
                      <tr>
                        <td className="border border-gray-300 px-2 py-2 text-center align-top text-gray-700 font-semibold">{idx + 1}</td>
                        <td className="border border-gray-300 px-3 py-2 align-top">
                          <p className="font-semibold text-gray-900">{item.item_description}</p>
                          {item.gem_link && (
                            <p className="text-[10px] text-blue-700 mt-0.5">GeM Link: {item.gem_link}</p>
                          )}
                          {specLines.length > 0 && (
                            <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                              {specLines.join(' · ')}
                            </p>
                          )}
                          {item.tech_specs_text && (
                            <p className="text-[10px] text-gray-600 mt-1 italic border-l-2 border-gray-300 pl-2 leading-relaxed">
                              {item.tech_specs_text}
                            </p>
                          )}
                        </td>
                        <td className="border border-gray-300 px-2 py-2 text-center align-top font-semibold text-gray-800">{qty}</td>
                        <td className="border border-gray-300 px-2 py-2 text-right align-top font-mono text-gray-800">{formatCurrency(unitCost)}</td>
                        <td className="border border-gray-300 px-2 py-2 text-right align-top font-mono font-bold text-gray-900">{formatCurrency(total)}</td>
                        <td className="border border-gray-300 px-2 py-2 text-center align-top text-gray-700">{gst > 0 ? `${gst}%` : '—'}</td>
                        <td className="border border-gray-300 px-2 py-2 align-top text-[10px] text-gray-700">{formattedFileNo}</td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                {/* Grand total row */}
                <tr className="bg-gray-50">
                  <td colSpan={4} className="border border-gray-300 px-3 py-2 text-right font-bold text-gray-700 uppercase tracking-wider text-[10px]">
                    Grand Total (Estimated Cost)
                  </td>
                  <td className="border border-gray-300 px-2 py-2 text-right font-bold font-mono text-gray-900 text-sm">
                    {formatCurrency(totalCost)}
                  </td>
                  <td colSpan={2} className="border border-gray-300" />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ── SECTION 4: Procurement Method Specifics ───────────────────── */}
        {formDataEntries.length > 0 && (
          <table className="w-full border-collapse">
            <tbody>
              <SectionTitle num={items.length > 0 ? (linkedAA ? 4 : 3) : (linkedAA ? 3 : 2)} title={`Procurement Method Details (${pr.procurement?.name || 'Details'})`} />
              {formDataEntries.map(([key, val]) => {
                const label = formLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const displayVal = formatFormValue(key, val);
                const isLink = key === 'gem_link' || (typeof val === 'string' && val.startsWith('http'));
                return (
                  <DocRow
                    key={key}
                    label={label}
                    value={
                      isLink ? (
                        <a
                          href={displayVal.startsWith('http') ? displayVal : `https://${displayVal}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 hover:underline break-all text-[11px]"
                        >
                          {displayVal}
                        </a>
                      ) : displayVal
                    }
                  />
                );
              })}
            </tbody>
          </table>
        )}

        {/* ── SECTION 5: Financial & Compliance ────────────────────────── */}
        {(pr.emd != null || pr.performance_security != null || pr.exemption || pr.is_item_split || pr.is_quantity_split) && (
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td colSpan={2} className="border border-gray-400 px-3 py-2 bg-gray-100 text-[11px] font-bold text-gray-800 uppercase tracking-widest">
                  Financial &amp; Compliance Details
                </td>
              </tr>
              {pr.emd != null && <DocRow label="EMD (Earnest Money Deposit)" value={`${pr.emd}%`} />}
              {pr.performance_security != null && <DocRow label="Performance Security" value={`${pr.performance_security}%`} />}
              {pr.exemption && <DocRow label="Exemption / Proprietary Remarks" value={pr.exemption_remarks || 'Exempted'} />}
              {pr.is_item_split && <DocRow label="Item Split Justification" value={pr.item_split_justification || 'Yes'} />}
              {pr.is_quantity_split && <DocRow label="Quantity Split Details" value={pr.quantity_split_details || 'Yes'} />}
            </tbody>
          </table>
        )}

        {/* ── SECTION 6: Training ───────────────────────────────────────── */}
        {isTrainingRequired && (
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td colSpan={2} className="border border-gray-400 px-3 py-2 bg-gray-100 text-[11px] font-bold text-gray-800 uppercase tracking-widest">
                  Training Requirement
                </td>
              </tr>
              {pr_any.training_type && <DocRow label="Training Type" value={pr_any.training_type} />}
              {pr_any.training_vendor && <DocRow label="Training Vendor" value={pr_any.training_vendor} />}
              {pr_any.training_comments && <DocRow label="Training Comments" value={pr_any.training_comments} />}
            </tbody>
          </table>
        )}

        {/* ── SECTION 7: Purchase / Technical Committee ─────────────────── */}
        {(pr.initiator || pr.faculty1 || pr.faculty2 || pr.faculty3) && (
          <div>
            <div className="border-t border-gray-400 px-3 py-2 bg-gray-100">
              <p className="text-[11px] font-bold text-gray-800 uppercase tracking-widest">
                Purchase / Technical Sub-Committee (TSC) Members
              </p>
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Role</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Email</th>
                </tr>
              </thead>
              <tbody>
                {pr.initiator && (
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600 font-semibold bg-gray-50">Purchase Initiator</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-900 font-semibold">{pr.initiator.name}</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600 font-mono text-[10px]">{pr.initiator.email}</td>
                  </tr>
                )}
                {pr.faculty1 ? (
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600 font-semibold bg-gray-50">Expert 1 — HOD Nominee</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-900 font-semibold">{pr.faculty1.name}</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600 font-mono text-[10px]">{pr.faculty1.email}</td>
                  </tr>
                ) : (
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600 font-semibold bg-gray-50">Expert 1 — HOD Nominee</td>
                    <td colSpan={2} className="border border-gray-300 px-3 py-2 text-gray-400 italic text-[10px]">Not yet nominated</td>
                  </tr>
                )}
                {pr.faculty2 ? (
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600 font-semibold bg-gray-50">Expert 2 — HOD Nominee</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-900 font-semibold">{pr.faculty2.name}</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600 font-mono text-[10px]">{pr.faculty2.email}</td>
                  </tr>
                ) : (
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600 font-semibold bg-gray-50">Expert 2 — HOD Nominee</td>
                    <td colSpan={2} className="border border-gray-300 px-3 py-2 text-gray-400 italic text-[10px]">Not yet nominated</td>
                  </tr>
                )}
                {pr.faculty3 && (
                  <tr>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600 font-semibold bg-gray-50">Director Nominee <span className="font-normal text-gray-400">(Optional)</span></td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-900 font-semibold">{pr.faculty3.name}</td>
                    <td className="border border-gray-300 px-3 py-2 text-gray-600 font-mono text-[10px]">{pr.faculty3.email}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── SECTION 8: Attachments ────────────────────────────────────── */}
        {pr.documents && pr.documents.length > 0 && (
          <div>
            <div className="border-t border-gray-400 px-3 py-2 bg-gray-100">
              <p className="text-[11px] font-bold text-gray-800 uppercase tracking-widest">
                Enclosures / Attached Documents ({pr.documents.length})
              </p>
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-2 py-2 text-center text-[10px] font-bold text-gray-600 uppercase tracking-wider w-8">No.</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Document Name</th>
                  <th className="border border-gray-300 px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Category</th>
                  <th className="border border-gray-300 px-3 py-2 text-center text-[10px] font-bold text-gray-600 uppercase tracking-wider w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {pr.documents.map((doc: any, i: number) => {
                  const isEvalDoc = doc.doc_key?.startsWith('tech_eval_doc_');
                  const label = isEvalDoc
                    ? (doc.uploaded_by_name ? `Technical Evaluation — ${doc.uploaded_by_name}` : 'Technical Evaluation')
                    : doc.doc_key?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Document';
                  return (
                    <tr key={doc.id}>
                      <td className="border border-gray-300 px-2 py-2 text-center text-gray-600">{i + 1}</td>
                      <td className="border border-gray-300 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <FileText size={11} className="text-gray-400 shrink-0" />
                          <span className="text-gray-800 font-medium truncate">{doc.original_name}</span>
                        </div>
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-gray-500">{label}</td>
                      <td className="border border-gray-300 px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <a href={doc.path} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-[10px] font-semibold text-blue-700 hover:underline">
                            <ChevronRight size={10} /> View
                          </a>
                          <a href={doc.path} download={doc.original_name}
                            className="flex items-center gap-0.5 text-[10px] font-semibold text-gray-600 hover:underline">
                            <Download size={10} /> Save
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Document footer */}
        <div className="border-t border-gray-400 px-4 py-2 bg-gray-50 flex justify-between items-center">
          <p className="text-[9px] text-gray-400 uppercase tracking-widest">
            Generated by IRIS — NIT Tiruchirappalli Procurement System
          </p>
          <p className="text-[9px] text-gray-400">
            Indent No.: {pr.icr_number || `PI-${pr.id}`}
          </p>
        </div>

      </div>
    </div>
  );
};

export default PRSummaryTable;
