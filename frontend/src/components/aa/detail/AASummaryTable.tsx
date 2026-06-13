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

      {/* Signature & Workflow Stage Tracker Table */}
      {(() => {
        const piAction = aa.history?.find((h: any) => h.approver_role === 'PI');
        const hodAction = aa.history?.find((h: any) => h.approver_role.toLowerCase().includes('hod'));
        
        const subsequentActions = aa.history?.filter((h: any) => 
          !h.approver_role.toLowerCase().includes('hod') && 
          h.approver_role !== 'PI' && 
          !h.approver_role.toLowerCase().includes('nominee')
        ) || [];

        const rows: any[] = [];

        // 1. PI
        rows.push({
          step: '1',
          role: 'Purchase Indentor (PI)',
          officer: aa.budget_info?.pi_name || aa.pi_name || '—',
          status: 'Submitted',
          signatureUrl: aa.pi_signature_url,
          date: aa.created_at,
          remarks: piAction?.remarks || 'Initiated procurement request',
        });

        // 2. HOD
        let hodStatus = 'Awaiting';
        if (hodAction) {
          hodStatus = hodAction.status;
        } else if (aa.pending_with?.toLowerCase() === 'hod') {
          hodStatus = 'Pending';
        }
        rows.push({
          step: '2',
          role: 'Head of Department (HOD)',
          officer: hodAction?.approver_name || (aa.pending_with?.toLowerCase() === 'hod' ? 'Pending Action' : 'Head of Department'),
          status: hodStatus,
          signatureUrl: hodAction?.signature_url,
          date: hodAction?.acted_at,
          remarks: hodAction?.remarks || '—',
        });

        // 3. Nominees
        let nomineeOffset = 3;
        if (aa.nominees && aa.nominees.length > 0) {
          aa.nominees.forEach((nom: any, idx: number) => {
            let nomStatus = nom.status;
            if (nomStatus === 'Pending' && aa.pending_with?.toLowerCase() === `nominee ${nom.step_order}`) {
              nomStatus = 'Pending';
            } else if (nomStatus === 'Pending') {
              nomStatus = 'Awaiting';
            }
            rows.push({
              step: `${nomineeOffset + idx}`,
              role: `Committee Nominee ${nom.step_order} (${nom.nominee_dept || '-'})`,
              officer: nom.nominee_name || 'Nominee',
              status: nomStatus,
              signatureUrl: nom.signature_url,
              date: nom.acted_at,
              remarks: nom.remarks || '—',
            });
          });
          nomineeOffset += aa.nominees.length;
        }

        // 4. Subsequent roles
        const adpdAction = subsequentActions.find((h: any) => h.approver_role.toLowerCase().includes('adpd') || h.approver_role.toLowerCase().includes('dean'));
        const directorAction = subsequentActions.find((h: any) => h.approver_role.toLowerCase().includes('director') || h.approver_role.toLowerCase().includes('apex'));
        const spAction = subsequentActions.find((h: any) => h.approver_role.toLowerCase().includes('sp') || h.approver_role.toLowerCase().includes('stores'));
        const faAction = subsequentActions.find((h: any) => h.approver_role.toLowerCase().includes('fa') || h.approver_role.toLowerCase().includes('finance'));
        const iaAction = subsequentActions.find((h: any) => h.approver_role.toLowerCase().includes('ia') || h.approver_role.toLowerCase().includes('audit'));

        // ADPD Row
        let adpdStatus = 'Awaiting';
        if (adpdAction) {
          adpdStatus = adpdAction.status;
        } else if (aa.pending_with?.toLowerCase() === 'adpd') {
          adpdStatus = 'Pending';
        }
        rows.push({
          step: `${nomineeOffset}`,
          role: 'Associate Dean (ADPD) / Dean',
          officer: adpdAction?.approver_name || (aa.pending_with?.toLowerCase() === 'adpd' ? 'Pending Action' : 'ADPD / Dean'),
          status: adpdStatus,
          signatureUrl: adpdAction?.signature_url,
          date: adpdAction?.acted_at,
          remarks: adpdAction?.remarks || '—',
        });
        nomineeOffset += 1;

        // Stores & Purchase
        if (spAction || aa.pending_with?.toLowerCase() === 'sp' || aa.pending_with?.toLowerCase().includes('stores')) {
          let spStatus = 'Awaiting';
          if (spAction) spStatus = spAction.status;
          else if (aa.pending_with?.toLowerCase() === 'sp' || aa.pending_with?.toLowerCase().includes('stores')) spStatus = 'Pending';
          rows.push({
            step: `${nomineeOffset}`,
            role: 'DR/AR (Stores & Purchase)',
            officer: spAction?.approver_name || 'Stores Section',
            status: spStatus,
            signatureUrl: spAction?.signature_url,
            date: spAction?.acted_at,
            remarks: spAction?.remarks || '—',
          });
          nomineeOffset += 1;
        }

        // Finance & Accounts
        if (faAction || aa.pending_with?.toLowerCase() === 'fa' || aa.pending_with?.toLowerCase().includes('finance')) {
          let faStatus = 'Awaiting';
          if (faAction) faStatus = faAction.status;
          else if (aa.pending_with?.toLowerCase() === 'fa' || aa.pending_with?.toLowerCase().includes('finance')) faStatus = 'Pending';
          rows.push({
            step: `${nomineeOffset}`,
            role: 'DR/AR (Finance & Accounts)',
            officer: faAction?.approver_name || 'Finance Section',
            status: faStatus,
            signatureUrl: faAction?.signature_url,
            date: faAction?.acted_at,
            remarks: faAction?.remarks || '—',
          });
          nomineeOffset += 1;
        }

        // Internal Audit
        if (iaAction || aa.pending_with?.toLowerCase() === 'ia' || aa.pending_with?.toLowerCase().includes('audit')) {
          let iaStatus = 'Awaiting';
          if (iaAction) iaStatus = iaAction.status;
          else if (aa.pending_with?.toLowerCase() === 'ia' || aa.pending_with?.toLowerCase().includes('audit')) iaStatus = 'Pending';
          rows.push({
            step: `${nomineeOffset}`,
            role: 'Internal Auditor (IA)',
            officer: iaAction?.approver_name || 'Audit Section',
            status: iaStatus,
            signatureUrl: iaAction?.signature_url,
            date: iaAction?.acted_at,
            remarks: iaAction?.remarks || '—',
          });
          nomineeOffset += 1;
        }

        // Director Row
        let directorStatus = 'Awaiting';
        if (directorAction) {
          directorStatus = directorAction.status;
        } else if (aa.pending_with?.toLowerCase() === 'director') {
          directorStatus = 'Pending';
        }
        rows.push({
          step: `${nomineeOffset}`,
          role: 'Director (Competent Authority)',
          officer: directorAction?.approver_name || (aa.pending_with?.toLowerCase() === 'director' ? 'Pending Action' : 'Director'),
          status: directorStatus,
          signatureUrl: directorAction?.signature_url,
          date: directorAction?.acted_at,
          remarks: directorAction?.remarks || '—',
        });

        const getStatusBadge = (status: string) => {
          const s = status.toLowerCase();
          if (s === 'approved' || s === 'submitted' || s === 'completed') {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-250">
                Approved
              </span>
            );
          }
          if (s === 'pending') {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                Pending Action
              </span>
            );
          }
          if (s === 'returned') {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-250">
                Returned
              </span>
            );
          }
          if (s === 'rejected') {
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-950 border border-rose-300">
                Rejected
              </span>
            );
          }
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 text-slate-400 border border-slate-200">
              Awaiting
            </span>
          );
        };

        return (
          <div className="bg-white border border-slate-300 rounded-xl p-6 space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2">
              Section (b) – Approval Signatures & Workflow Tracker
            </h3>
            
            <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[9px]">
                    <th className="px-3 py-3 text-center w-12 border-r border-slate-200">Step</th>
                    <th className="px-4 py-3 border-r border-slate-200">Authority / Role</th>
                    <th className="px-4 py-3 border-r border-slate-200">Designated Officer</th>
                    <th className="px-4 py-3 border-r border-slate-200">Action / Status</th>
                    <th className="px-4 py-3 border-r border-slate-200 text-center w-36">Signature</th>
                    <th className="px-4 py-3 border-r border-slate-200 text-center w-36">Date &amp; Time</th>
                    <th className="px-4 py-3">Remarks / Comments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {rows.map((row, idx) => (
                    <tr key={idx} className={`${row.status === 'Pending' ? 'bg-amber-50/20 font-medium' : row.status === 'Awaiting' ? 'text-slate-400 bg-slate-50/10' : 'hover:bg-slate-50/30 text-slate-800'}`}>
                      <td className="px-3 py-3 text-center font-bold text-slate-500 border-r border-slate-200">{row.step}</td>
                      <td className="px-4 py-3 font-bold text-slate-700 border-r border-slate-200">{row.role}</td>
                      <td className="px-4 py-3 border-r border-slate-200 font-semibold">{row.officer}</td>
                      <td className="px-4 py-3 border-r border-slate-200">{getStatusBadge(row.status)}</td>
                      <td className="px-4 py-3 border-r border-slate-200 text-center">
                        {row.signatureUrl ? (
                          <img 
                            src={row.signatureUrl.startsWith('http') ? row.signatureUrl : `${window.location.origin}${row.signatureUrl}`} 
                            alt="Signature" 
                            className="h-8 object-contain mx-auto mix-blend-multiply" 
                          />
                        ) : (row.status === 'Approved' || row.status === 'Submitted' || row.status === 'Completed') ? (
                          <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-250">
                            Signed Digitally
                          </span>
                        ) : (
                          <span className="text-slate-350 font-light">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 border-r border-slate-200 text-center font-mono text-[10px]">
                        {row.date ? new Date(row.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-650 italic leading-relaxed whitespace-pre-wrap">{row.remarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

