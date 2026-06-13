import React from 'react';
import { Download, Paperclip, ChevronRight } from 'lucide-react';

interface AASummaryTableProps {
  aa: any;
  formatCurrency: (n?: number) => string;
}

const numberToWordsINR = (num: number): string => {
  const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  const numToWords = (n: number): string => {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? '-' + a[digit] : '');
  };

  const convert = (n: number): string => {
    if (n === 0) return 'zero';
    let str = '';
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    if (crore > 0) {
      str += numToWords(crore) + ' crore ';
    }
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    if (lakh > 0) {
      str += numToWords(lakh) + ' lakh ';
    }
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    if (thousand > 0) {
      str += numToWords(thousand) + ' thousand ';
    }
    const hundred = Math.floor(n / 100);
    n %= 100;
    if (hundred > 0) {
      str += numToWords(hundred) + ' hundred ';
    }
    if (n > 0) {
      if (str !== '') str += 'and ';
      str += numToWords(n) + ' ';
    }
    return str.trim();
  };

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);
  let result = convert(intPart) + ' rupees';
  if (decPart > 0) {
    result += ' and ' + convert(decPart) + ' paise';
  }
  return result.replace(/\s+/g, ' ').trim() + ' only';
};

export const AASummaryTable: React.FC<AASummaryTableProps> = ({ aa, formatCurrency }) => {
  const totalCost = aa.total_cost || aa.item_info?.total_cost || 0;
  const quantity = aa.quantity || aa.item_info?.quantity || 1;
  const unitCost = aa.item_info?.unit_cost || (quantity > 0 ? (totalCost - (aa.item_info?.gst_amount || 0)) / quantity : 0);
  const gstRate = aa.gst_rate || aa.item_info?.gst_rate || 0;
  const gstAmount = aa.item_info?.gst_amount || 0;
  const itemDescription = aa.item_description || aa.item_info?.item_description || '—';

  const handleViewFile = (url: string) => {
    const absoluteUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    window.open(absoluteUrl, '_blank');
  };

  const handleDownloadFile = (url: string) => {
    const absoluteUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    const link = document.createElement('a');
    link.href = absoluteUrl;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 text-left max-w-4xl mx-auto">
      {/* Official PDF Style Header */}
      <div className="bg-white border border-slate-300 rounded-xl p-6 md:p-8 space-y-6">
        <div className="text-center border-b border-slate-200 pb-6">
          <h1 className="text-lg md:text-xl font-extrabold text-slate-800 tracking-wide uppercase">
            National Institute of Technology Tiruchirappalli
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Tiruchirappalli - 620015, Tamil Nadu, India
          </p>
          <div className="mt-4 inline-block border border-slate-300 bg-slate-50 text-slate-700 px-6 py-1.5 rounded text-xs font-bold tracking-wider uppercase">
            Administrative Approval & Procurement Report
          </div>
        </div>

        {/* File and Date details */}
        <div className="flex flex-col sm:flex-row sm:justify-between gap-3 text-xs text-slate-600 bg-slate-50 p-4 rounded border border-slate-200">
          <div>
            <span className="font-bold text-slate-500 block uppercase tracking-wider text-[10px]">File No</span>
            <span className="font-semibold text-slate-800 text-sm">{aa.budget_info?.file_no || '—'}</span>
          </div>
          <div>
            <span className="font-bold text-slate-500 block uppercase tracking-wider text-[10px]">Request Ref</span>
            <span className="font-semibold text-slate-800 text-sm">
              {aa.aa_number && aa.aa_number !== '-' ? aa.aa_number : `REQ-${aa.id}`}
            </span>
          </div>
          <div>
            <span className="font-bold text-slate-500 block uppercase tracking-wider text-[10px]">Date of Initiation</span>
            <span className="font-semibold text-slate-800 text-sm">
              {aa.created_at ? new Date(aa.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
            </span>
          </div>
        </div>

        {/* Details Table - Match PDF layout */}
        <div className="border border-slate-300 rounded overflow-hidden">
          <table className="w-full border-collapse text-xs md:text-sm">
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="w-1/3 bg-slate-50/75 p-3 font-bold text-slate-700 border-r border-slate-200">Name of the Department</td>
                <td className="w-2/3 p-3 text-slate-800 font-semibold">{aa.budget_info?.department || '—'}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="bg-slate-50/75 p-3 font-bold text-slate-700 border-r border-slate-200 align-top">Name of the Purchase Indentor</td>
                <td className="p-3 text-slate-800 space-y-1">
                  <div><strong className="text-slate-500">Name:</strong> {aa.budget_info?.pi_name || '—'}</div>
                  <div><strong className="text-slate-500">Designation:</strong> {aa.pi_designation || 'Faculty'}</div>
                </td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="bg-slate-50/75 p-3 font-bold text-slate-700 border-r border-slate-200 align-top">Source of fund</td>
                <td className="p-3 text-slate-800 space-y-1">
                  <div>{aa.budget_info?.source_of_fund || '—'}</div>
                  {aa.budget_info?.project_code && aa.budget_info.project_code !== '-' && (
                    <div className="text-xs text-slate-500 font-medium">
                      Project Code: <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-mono text-slate-700">{aa.budget_info.project_code}</span>
                    </div>
                  )}
                </td>
              </tr>
              <tr>
                <td className="bg-slate-50/75 p-3 font-bold text-slate-700 border-r border-slate-200">Estimated amount (incl. GST)</td>
                <td className="p-3 text-lg font-extrabold text-slate-800">{formatCurrency(totalCost)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Section (a): Details of the required items */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Section (a) – Details of the Required Items
          </h3>
          <div className="border border-slate-300 rounded overflow-hidden">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[9px]">
                  <th className="px-4 py-3 text-center w-12 border-r border-slate-200">S.No</th>
                  <th className="px-4 py-3 text-left border-r border-slate-200">Description of the Item</th>
                  <th className="px-4 py-3 text-center w-16 border-r border-slate-200">Qty</th>
                  <th className="px-4 py-3 text-right w-28 border-r border-slate-200">Unit Cost</th>
                  <th className="px-4 py-3 text-center w-20 border-r border-slate-200">GST %</th>
                  <th className="px-4 py-3 text-right w-24 border-r border-slate-200">Total GST</th>
                  <th className="px-4 py-3 text-right w-28">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="px-4 py-3.5 text-center font-bold text-slate-500 border-r border-slate-200">1</td>
                  <td className="px-4 py-3.5 font-semibold text-slate-800 border-r border-slate-200 whitespace-pre-wrap leading-relaxed">{itemDescription}</td>
                  <td className="px-4 py-3.5 text-center font-bold text-slate-700 border-r border-slate-200">{quantity}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-600 border-r border-slate-200">{formatCurrency(unitCost)}</td>
                  <td className="px-4 py-3.5 text-center font-semibold text-slate-600 border-r border-slate-200">{gstRate}%</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-600 border-r border-slate-200">{formatCurrency(gstAmount)}</td>
                  <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-800">{formatCurrency(totalCost)}</td>
                </tr>
                {/* Grand Total Row */}
                <tr className="bg-slate-50 font-bold">
                  <td colSpan={6} className="px-4 py-3 text-right border-r border-slate-200 text-slate-600">Grand Total</td>
                  <td className="px-4 py-3 text-right font-mono font-extrabold text-slate-800 text-sm">{formatCurrency(totalCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Amount in words */}
          <div className="bg-slate-50 border border-slate-200 p-3 rounded text-xs leading-relaxed">
            <span className="font-bold text-slate-500 block uppercase tracking-wider text-[9px] mb-0.5">Amount in Words</span>
            <span className="font-bold text-slate-800 capitalize">{numberToWordsINR(totalCost)}</span>
          </div>
        </div>

        {/* Justification and Mode of Procurement */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded p-4 space-y-2 bg-white">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Purpose / Justification for Purchase
            </h4>
            <p className="text-xs text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">
              {aa.justification || aa.procurement_info?.justification || '—'}
            </p>
          </div>
          <div className="border border-slate-200 rounded p-4 space-y-2 bg-white">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Mode of Procurement
            </h4>
            <div className="flex items-center gap-2">
              <span className="bg-slate-100 border border-slate-300 px-2.5 py-1 rounded text-xs font-bold text-slate-700">
                {aa.mode_of_procurement || aa.procurement_info?.mode_of_procurement || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Attachments Section */}
      {((aa.attachment_path) || (aa.budget_info?.attachment_path)) && (
        <div className="bg-white border border-slate-300 rounded-xl p-6 space-y-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Paperclip size={14} /> Uploaded Documents & Attachments
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aa.attachment_path && (
              <div className="flex items-start justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded transition-all">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">
                      Supporting Document
                    </p>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wider">
                      Administrative Approval Attachment
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleViewFile(aa.attachment_url)}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-slate-900 border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 rounded transition-all"
                  >
                    <ChevronRight size={11} />
                    View
                  </button>
                  <button
                    onClick={() => handleDownloadFile(aa.attachment_url)}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-700 border border-slate-300 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded transition-all shadow-sm"
                  >
                    <Download size={11} />
                    Download
                  </button>
                </div>
              </div>
            )}

            {aa.budget_info?.attachment_path && (
              <div className="flex items-start justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded transition-all">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">
                      Budget Attachment
                    </p>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5 uppercase tracking-wider">
                      Budget File Supporting Document
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleViewFile(aa.budget_info.attachment_url)}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-slate-900 border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 rounded transition-all"
                  >
                    <ChevronRight size={11} />
                    View
                  </button>
                  <button
                    onClick={() => handleDownloadFile(aa.budget_info.attachment_url)}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-700 border border-slate-300 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded transition-all shadow-sm"
                  >
                    <Download size={11} />
                    Download
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Signature Grid */}
      <div className="bg-white border border-slate-300 rounded-xl p-6 space-y-6">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2">
          Approval Signatures & Sign-offs
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {/* 1. Initiator (PI) Signature */}
          <div className="border border-slate-200 rounded p-4 flex flex-col justify-between h-40 bg-slate-50/50">
            <div className="text-center">
              {aa.pi_signature_url ? (
                <img src={aa.pi_signature_url} alt="PI Signature" className="h-10 object-contain mx-auto mb-2" />
              ) : (
                <div className="h-10 flex items-center justify-center text-slate-400 text-xs italic mb-2">Signed Digitally</div>
              )}
              <div className="border-t border-slate-200 pt-1">
                <p className="font-bold text-slate-800 text-xs">{aa.budget_info?.pi_name || '—'}</p>
                <p className="text-[10px] text-slate-500 font-semibold">{aa.pi_designation || 'Faculty'}</p>
                <p className="text-[10px] text-slate-400 font-medium">Dept: {aa.pi_dept || '-'}</p>
              </div>
            </div>
            <div className="text-center text-[9px] text-slate-500 font-bold border-t border-slate-100 pt-1">
              Initiated on: {aa.created_at ? new Date(aa.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            </div>
          </div>

          {/* 2. HOD Signature */}
          {(() => {
            const hodAction = aa.history?.find((h: any) => h.approver_role.toLowerCase().includes('hod') && h.status === 'Approved');
            const isPendingHOD = aa.pending_with?.toLowerCase() === 'hod';
            return (
              <div className="border border-slate-200 rounded p-4 flex flex-col justify-between h-40 bg-slate-50/50">
                <div className="text-center">
                  {hodAction?.signature_url ? (
                    <img src={hodAction.signature_url} alt="HOD Signature" className="h-10 object-contain mx-auto mb-2" />
                  ) : isPendingHOD ? (
                    <div className="h-10 flex items-center justify-center text-amber-700 text-xs font-bold mb-2">Awaiting HOD Approval</div>
                  ) : hodAction ? (
                    <div className="h-10 flex items-center justify-center text-slate-400 text-xs italic mb-2">Signed Digitally</div>
                  ) : (
                    <div className="h-10 flex items-center justify-center text-slate-300 text-xs italic mb-2">—</div>
                  )}
                  <div className="border-t border-slate-200 pt-1">
                    <p className="font-bold text-slate-800 text-xs">
                      {hodAction ? hodAction.approver_name : isPendingHOD ? 'Pending Action' : 'Head of Department'}
                    </p>
                    <p className="text-[10px] text-slate-500 font-semibold">Head of Department</p>
                    <p className="text-[10px] text-slate-400 font-medium">Dept: {aa.pi_dept || '-'}</p>
                  </div>
                </div>
                <div className="text-center text-[9px] text-slate-500 font-bold border-t border-slate-100 pt-1">
                  {hodAction?.acted_at ? `Approved on: ${new Date(hodAction.acted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : '—'}
                </div>
              </div>
            );
          })()}

          {/* 3. Nominees Signatures */}
          {aa.nominees?.map((nom: any) => {
            const isPendingNom = nom.status === 'Pending';
            return (
              <div key={nom.id} className="border border-slate-200 rounded p-4 flex flex-col justify-between h-40 bg-slate-50/50">
                <div className="text-center">
                  {nom.signature_url ? (
                    <img src={nom.signature_url} alt={`${nom.nominee_name} Signature`} className="h-10 object-contain mx-auto mb-2" />
                  ) : isPendingNom ? (
                    <div className="h-10 flex items-center justify-center text-amber-700 text-xs font-bold mb-2">Awaiting Nominee {nom.step_order} Action</div>
                  ) : nom.status === 'Approved' ? (
                    <div className="h-10 flex items-center justify-center text-slate-400 text-xs italic mb-2">Signed Digitally</div>
                  ) : (
                    <div className="h-10 flex items-center justify-center text-rose-700 text-xs font-bold mb-2">{nom.status}</div>
                  )}
                  <div className="border-t border-slate-200 pt-1">
                    <p className="font-bold text-slate-800 text-xs">{nom.nominee_name}</p>
                    <p className="text-[10px] text-slate-500 font-semibold">Committee Nominee {nom.step_order}</p>
                    <p className="text-[10px] text-slate-400 font-medium">Dept: {nom.nominee_dept || '-'}</p>
                  </div>
                </div>
                <div className="text-center text-[9px] text-slate-500 font-bold border-t border-slate-100 pt-1">
                  {nom.acted_at ? `Approved on: ${new Date(nom.acted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : '—'}
                </div>
              </div>
            );
          })}

          {/* 4. Subsequent standard approvers (ADPD, Dean, Director etc.) */}
          {aa.history?.filter((h: any) => 
            !h.approver_role.toLowerCase().includes('hod') && 
            h.approver_role !== 'PI' && 
            !h.approver_role.toLowerCase().includes('nominee') &&
            h.status === 'Approved'
          ).map((h: any) => (
            <div key={h.id} className="border border-slate-200 rounded p-4 flex flex-col justify-between h-40 bg-slate-50/50">
              <div className="text-center">
                {h.signature_url ? (
                  <img src={h.signature_url} alt={`${h.approver_role} Signature`} className="h-10 object-contain mx-auto mb-2" />
                ) : (
                  <div className="h-10 flex items-center justify-center text-slate-400 text-xs italic mb-2">Signed Digitally</div>
                )}
                <div className="border-t border-slate-200 pt-1">
                  <p className="font-bold text-slate-800 text-xs">{h.approver_name}</p>
                  <p className="text-[10px] text-slate-500 font-semibold">{h.approver_role}</p>
                  <p className="text-[10px] text-slate-400 font-medium">Office: {h.approver_dept || '-'}</p>
                </div>
              </div>
              <div className="text-center text-[9px] text-slate-500 font-bold border-t border-slate-100 pt-1">
                Approved on: {h.acted_at ? new Date(h.acted_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
              </div>
            </div>
          ))}
          
          {/* 5. Awaiting subsequent standard roles */}
          {(() => {
            const currentPending = aa.pending_with?.toLowerCase();
            if (currentPending && !currentPending.startsWith('nominee') && currentPending !== 'hod' && currentPending !== 'pi') {
              return (
                <div className="border border-slate-200 border-dashed rounded p-4 flex flex-col justify-between h-40 bg-slate-50/20">
                  <div className="text-center">
                    <div className="h-10 flex items-center justify-center text-slate-400 text-xs font-semibold mb-2">Awaiting {aa.pending_with} Action</div>
                    <div className="border-t border-slate-200 pt-1">
                      <p className="font-bold text-slate-400 text-xs">Pending Decision</p>
                      <p className="text-[10px] text-slate-400 font-semibold">{aa.pending_with}</p>
                    </div>
                  </div>
                  <div className="text-center text-[9px] text-slate-400 font-semibold">—</div>
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>
    </div>
  );
};
