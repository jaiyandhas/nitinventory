import React from 'react';
import {
  FileText, User, Building2, Package, DollarSign,
  Truck, AlertCircle, Link as LinkIcon, Download, Paperclip,
  ChevronRight, Info, CheckCircle2
} from 'lucide-react';
import { PurchaseRequest } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { formatFileNo } from '../../../utils/format';

interface PRSummaryTableProps {
  pr: PurchaseRequest;
  formatCurrency: (n?: number) => string;
}

const FieldRow: React.FC<{ label: string; value?: React.ReactNode; span?: boolean }> = ({ label, value, span }) => {
  if (!value && value !== 0) return null;
  return (
    <div className={`flex flex-col gap-0.5 ${span ? 'col-span-2' : ''}`}>
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      <span className="text-sm font-semibold text-slate-800 leading-snug">{value}</span>
    </div>
  );
};

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-2 mb-3">
    <div className="w-7 h-7 rounded-md bg-[#1a3a6b]/10 flex items-center justify-center text-[#1a3a6b] shrink-0">
      {icon}
    </div>
    <div>
      <h4 className="text-xs font-bold text-[#1a3a6b] uppercase tracking-wider">{title}</h4>
      {subtitle && <p className="text-[10px] text-slate-400 font-medium">{subtitle}</p>}
    </div>
  </div>
);

export const PRSummaryTable: React.FC<PRSummaryTableProps> = ({ pr, formatCurrency }) => {
  const { user } = useAuth();

  // Compute cost summary
  const items = pr.items || [];
  const totalCost = pr.amount || 0;

  // Procurement form_data labels
  const formLabels: Record<string, string> = {
    gem_link: 'GeM Bid / RA Link',
    gem_nac_attached: 'GeM NAC Attached?',
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
    ? Object.entries(pr.form_data).filter(([, v]) => v !== null && v !== undefined && v !== '')
    : [];

  const pr_any = pr as any;
  const linkedAA = pr_any.administrative_approval;
  const financialYear = pr_any.financial_year;
  const isTrainingRequired = pr_any.is_training_required;
  const isServiceCenter = pr_any.is_service_center_in_south;

  return (
    <div className="space-y-5 text-left">

      {/* ── SECTION 1: Identity & Classification ─────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-[#1a3a6b] to-[#243f7a] px-5 py-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-sm tracking-wide">
                Purchase Indent Summary
              </h3>
              <p className="text-blue-200 text-[11px] font-medium mt-0.5">
                {pr.icr_number || `PI-${pr.id}`} · {new Date(pr.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-blue-200 font-bold uppercase tracking-widest">Total Value</div>
              <div className="text-xl font-extrabold text-white">{formatCurrency(totalCost)}</div>
            </div>
          </div>
        </div>

        <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-left">
          <FieldRow label="Initiator (Purchase Initiator)" value={
            <span className="flex items-center gap-1.5">
              <User size={12} className="text-slate-400" />
              {pr.initiator?.name || '—'}
            </span>
          } />
          <FieldRow label="Department" value={
            <span className="flex items-center gap-1.5">
              <Building2 size={12} className="text-slate-400" />
              {pr.initiator?.department?.name || '—'}
            </span>
          } />
          <FieldRow label="Purchase Type" value={
            <span className="capitalize">{pr.purchase_type || '—'}</span>
          } />
          <FieldRow label="Category" value={pr.category?.title} />
          <FieldRow label="Procurement Method" value={pr.procurement?.name} />
          <FieldRow label="Financial Year" value={financialYear?.year || financialYear?.label || '—'} />
          {pr.delivery_location && (
            <FieldRow label="Delivery Location" value={pr.delivery_location} />
          )}
          {pr.delivery_mode && (
            <FieldRow label="Delivery Mode" value={pr.delivery_mode} />
          )}
          {pr.basis_of_estimate && (
            <FieldRow label="Basis of Estimation" value={pr.basis_of_estimate} span />
          )}
        </div>
      </div>

      {/* ── SECTION 2: Linked Administrative Approval ─────────────────────── */}
      {linkedAA && (
        <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 space-y-3">
          <SectionHeader
            icon={<CheckCircle2 size={15} />}
            title="Linked Administrative Approval"
            subtitle="Pre-approved via standalone AA module"
          />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <FieldRow label="AA Reference" value={linkedAA.reference_number || `AA-${linkedAA.id}`} />
            <FieldRow label="Status" value={
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                {linkedAA.status}
              </span>
            } />
            <FieldRow label="Budget File" value={
              linkedAA.budget_file ? formatFileNo(linkedAA.budget_file.file_no, user?.role?.group_key) : '—'
            } />
            {linkedAA.item_description && (
              <FieldRow label="Item Description" value={linkedAA.item_description} span />
            )}
            {linkedAA.total_cost && (
              <FieldRow label="AA Approved Amount" value={formatCurrency(linkedAA.total_cost)} />
            )}
          </div>
        </div>
      )}

      {/* ── SECTION 3: Item-wise Breakdown ────────────────────────────────── */}
      {items.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <SectionHeader icon={<Package size={15} />} title="Items Requested" />
            <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-2.5 py-1 rounded-full">
              {items.length} item{items.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider text-[9px]">S.No</th>
                  <th className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider text-[9px]">Item Description</th>
                  <th className="px-4 py-2.5 text-center font-bold text-slate-500 uppercase tracking-wider text-[9px]">Qty</th>
                  <th className="px-4 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider text-[9px]">Unit Cost</th>
                  <th className="px-4 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider text-[9px]">Total</th>
                  <th className="px-4 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider text-[9px]">Budget File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item, idx) => {
                  const fileNo = (item as any).budget_file?.file_no;
                  const formattedFileNo = fileNo ? formatFileNo(fileNo, user?.role?.group_key) : null;
                  const qty = item.quantity ?? 1;
                  const total = item.estimated_total ?? 0;
                  const unitCost = qty > 0 ? total / qty : 0;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 max-w-xs">
                        <div>{item.item_description}</div>
                        {(item as any).tech_specs_summary && (
                          <div className="text-[10px] text-slate-400 mt-0.5 italic">{(item as any).tech_specs_summary}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-slate-700">{qty}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{formatCurrency(unitCost)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#1a3a6b]">{formatCurrency(total)}</td>
                      <td className="px-4 py-3">
                        {formattedFileNo ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {formattedFileNo}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={4} className="px-4 py-3 text-right font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                    Grand Total
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold text-[#1a3a6b] text-base font-mono">
                    {formatCurrency(totalCost)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── SECTION 4: Procurement Method Details ─────────────────────────── */}
      {formDataEntries.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <SectionHeader icon={<Info size={15} />} title="Procurement Method Specifics" subtitle={pr.procurement?.name} />
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            {formDataEntries.map(([key, val]) => {
              const label = formLabels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              const displayVal = formatFormValue(key, val);
              const isLink = key === 'gem_link' || (typeof val === 'string' && val.startsWith('http'));
              return (
                <div key={key} className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
                  {isLink ? (
                    <a
                      href={displayVal.startsWith('http') ? displayVal : `https://${displayVal}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-blue-600 hover:underline flex items-center gap-1 break-all"
                    >
                      <LinkIcon size={11} />
                      {displayVal}
                    </a>
                  ) : (
                    <span className="text-sm font-semibold text-slate-800">{displayVal}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SECTION 5: Financial & Compliance Fields ──────────────────────── */}
      {(pr.emd != null || pr.performance_security != null || pr.exemption || pr.is_item_split || pr.is_quantity_split) && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <SectionHeader icon={<DollarSign size={15} />} title="Financial & Compliance Details" />
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
            {pr.emd != null && pr.emd !== undefined && (
              <FieldRow label="EMD (Earnest Money Deposit)" value={`${pr.emd}%`} />
            )}
            {pr.performance_security != null && pr.performance_security !== undefined && (
              <FieldRow label="Performance Security" value={`${pr.performance_security}%`} />
            )}
            {pr.exemption && (
              <div className="col-span-2 flex flex-col gap-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Proprietary / Exemption</span>
                <span className="text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-100 px-2.5 py-1.5 rounded">
                  {pr.exemption_remarks || 'Exempted — No remarks provided'}
                </span>
              </div>
            )}
            {pr.is_item_split && (
              <div className="col-span-2 flex flex-col gap-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Item Split Justification</span>
                <span className="text-sm font-semibold text-slate-800">{pr.item_split_justification || 'Yes'}</span>
              </div>
            )}
            {pr.is_quantity_split && (
              <div className="col-span-2 flex flex-col gap-0.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Quantity Split Details</span>
                <span className="text-sm font-semibold text-slate-800">{pr.quantity_split_details || 'Yes'}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SECTION 6: Training Details ───────────────────────────────────── */}
      {isTrainingRequired && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-3">
          <SectionHeader icon={<AlertCircle size={15} />} title="Training Requirement" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <FieldRow label="Training Type" value={pr_any.training_type} />
            <FieldRow label="Training Vendor" value={pr_any.training_vendor} />
            {pr_any.training_comments && <FieldRow label="Training Comments" value={pr_any.training_comments} span />}
          </div>
        </div>
      )}

      {/* ── SECTION 7: Service Center Info ───────────────────────────────── */}
      {isServiceCenter && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <SectionHeader icon={<Truck size={15} />} title="Service Center (Southern Region)" />
          <p className="text-sm font-semibold text-slate-700">{pr_any.service_center_south_desc || 'Service center available in southern region.'}</p>
        </div>
      )}

      {/* ── SECTION 8: Uploaded Attachments ──────────────────────────────── */}
      {pr.documents && pr.documents.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <SectionHeader icon={<Paperclip size={15} />} title="Uploaded Documents & Attachments" />
            <span className="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-2.5 py-1 rounded-full">
              {pr.documents.length} file{pr.documents.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {pr.documents.map((doc: any) => {
              const isEvalDoc = doc.doc_key?.startsWith('tech_eval_doc_');
              const label = isEvalDoc
                ? (doc.uploaded_by_name ? `Technical Evaluation — ${doc.uploaded_by_name}` : 'Technical Evaluation Report')
                : doc.doc_key?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Document';

              return (
                <div
                  key={doc.id}
                  className="flex items-start justify-between gap-3 p-3 bg-slate-50 border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/20 rounded-lg transition-all group"
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 shrink-0 rounded-md bg-indigo-100 flex items-center justify-center">
                      <FileText size={14} className="text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-700 truncate" title={doc.original_name}>
                        {doc.original_name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wider">
                        {label}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={doc.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View file"
                      className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-[#1a3a6b] border border-slate-200 hover:border-[#1a3a6b] px-2 py-1 rounded transition-colors"
                    >
                      <ChevronRight size={11} />
                      View
                    </a>
                    <a
                      href={doc.path}
                      download={doc.original_name}
                      title="Download file"
                      className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-colors"
                    >
                      <Download size={11} />
                      Download
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SECTION 9: Purchase Committee ────────────────────────────────── */}
      {(pr.faculty1 || pr.faculty2 || pr.faculty3) && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <SectionHeader icon={<User size={15} />} title="Purchase / Technical Committee" subtitle="Nominated members for technical evaluation" />
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Purchase Initiator', person: pr.initiator },
              { label: 'Expert 1 (HOD Nominee)', person: pr.faculty1 },
              { label: 'Expert 2 (HOD Nominee)', person: pr.faculty2 },
              { label: 'Expert 3 (Director Nominee)', person: pr.faculty3 },
            ].map(({ label, person }) => (
              <div key={label} className="p-3 border border-slate-100 rounded-lg bg-slate-50/60">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                {person ? (
                  <>
                    <p className="text-xs font-bold text-slate-800">{person.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{person.email}</p>
                  </>
                ) : (
                  <p className="text-xs text-rose-400 italic font-medium">Not nominated yet</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delivery info is already shown in Section 1 (Identity) */}

    </div>
  );
};

export default PRSummaryTable;
