import React, { useState } from 'react';
import { FileText, CheckCircle, Clock } from 'lucide-react';
import { PurchaseRequest, PRHistory } from '../../types';

interface PRFormViewerProps {
  pr: PurchaseRequest;
  formatCurrency: (n?: number) => string;
  selectedModule?: string;
  onModuleChange?: (moduleKey: string) => void;
  hideHeaderControls?: boolean;
}

export const PRFormViewer: React.FC<PRFormViewerProps> = ({
  pr,
  formatCurrency,
  selectedModule: propSelectedModule,
  onModuleChange,
  hideHeaderControls = false,
}) => {
  const [internalSelectedModule, setInternalSelectedModule] = useState<string>('indent');

  const selectedModule = propSelectedModule !== undefined ? propSelectedModule : internalSelectedModule;
  const setSelectedModule = onModuleChange !== undefined ? onModuleChange : setInternalSelectedModule;

  if (!pr) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 font-medium bg-white rounded-lg border border-slate-200 shadow-sm">
        <div className="w-6 h-6 rounded-full border-2 border-[#1a3a6b] border-t-transparent animate-spin mb-3" />
        Loading form details...
      </div>
    );
  }

  const modules = [
    { key: 'indent', label: 'Purchase Indent Form', active: true },
    { key: 'specs', label: 'Technical Specification Annexure', active: true },
    { key: 'pac_approval', label: 'PAC Purchase Approval', active: pr.procurement?.name === 'Proprietary Purchase' || pr.procurement?.name === 'PAC' },
    { key: 'pac_cert', label: 'Proprietary Article Certificate', active: pr.procurement?.name === 'Proprietary Purchase' || pr.procurement?.name === 'PAC' },
    { key: 'lpc_approval', label: 'LPC Purchase Approval (GFR 155)', active: pr.procurement?.name === 'Committee purchase' || pr.procurement?.name === 'LPC' || pr.lpc_remarks !== null },
    { key: 'single_source', label: 'Nomination on Single Source Basis (GFR 194)', active: pr.procurement?.name === 'Nomination' || pr.procurement?.name === 'Single Tender' || pr.single_bid_justification !== null },
    { key: 'bill_passing', label: 'Goods Receipt, Supplier & Bill Passing', active: pr.bill_passing !== null },
    { key: 'po_cancel', label: 'PO Cancellation Minutes', active: pr.current_status === 'cancelled' },
    { key: 'tech_minutes', label: 'Technical Evaluation Minutes', active: !!(pr.technical_evaluations && pr.technical_evaluations.length > 0) },
    { key: 'fin_approval_two', label: 'Financial Scrutiny & Approval (Two Bid)', active: !!(pr.financial_evaluations && pr.financial_evaluations.length > 0) },
    { key: 'tender_cancel', label: 'Tender Cancellation Minutes', active: pr.current_status === 'cancelled' },
    { key: 'tech_comparative', label: 'Technical Comparative Statement', active: !!(pr.commercial_evaluations && pr.commercial_evaluations.length > 0) },
    { key: 'price_comparative', label: 'Price Comparative Statement', active: !!(pr.financial_evaluations && pr.financial_evaluations.length > 0) },
    { key: 'techno_comm_comparative', label: 'Techno-Commercial Comparative Statement', active: !!(pr.technical_evaluations && pr.technical_evaluations.length > 0 && pr.financial_evaluations && pr.financial_evaluations.length > 0) },
    { key: 'fin_approval_single', label: 'Financial Approval (Single Bid)', active: pr.single_bid_justification !== null }
  ];

  // Helper to find signatures in history logs
  const findSignature = (roleVal?: string, statusKeyword?: string, userId?: number): PRHistory | null => {
    if (!pr.history) return null;
    const sorted = [...pr.history].sort((a, b) => new Date(b.acted_at || 0).getTime() - new Date(a.acted_at || 0).getTime());
    for (const h of sorted) {
      if (userId && h.approver_id === userId) {
        if (!statusKeyword || h.status.toLowerCase().includes(statusKeyword.toLowerCase())) {
          return h;
        }
      }
      if (roleVal && h.frozen_designation?.toLowerCase().includes(roleVal.toLowerCase())) {
        if (!statusKeyword || h.status.toLowerCase().includes(statusKeyword.toLowerCase())) {
          return h;
        }
      }
    }
    return null;
  };

  // Signatures resolved from history snapshot logs
  const initiatorSig = findSignature(undefined, undefined, pr.initiator_id);
  const faculty1Sig = findSignature(undefined, 'Technical Evaluation', pr.faculty1_id) || findSignature(undefined, 'Completed', pr.faculty1_id);
  const faculty2Sig = findSignature(undefined, 'Technical Evaluation', pr.faculty2_id) || findSignature(undefined, 'Completed', pr.faculty2_id);
  const faculty3Sig = findSignature(undefined, 'Technical Evaluation', pr.faculty3_id) || findSignature(undefined, 'Completed', pr.faculty3_id);
  
  // HOD verifier signature
  const hodSig = findSignature('hod') || findSignature('head of department') || (pr.hod_id ? findSignature(undefined, undefined, pr.hod_id) : null);
  
  // Dean verifier signature
  const deanSig = findSignature('dean_pd') || findSignature('dean');
  
  // Director approval signature
  const directorSig = findSignature('director');

  const renderSignatureBlock = (title: string, sig: PRHistory | null, defaultName?: string) => {
    return (
      <div className="flex flex-col items-center justify-end p-4 border border-slate-100 bg-slate-50/50 rounded-lg text-center min-h-[140px]">
        {sig && sig.frozen_signature_path ? (
          <div className="space-y-1">
            <img 
              src={sig.frozen_signature_path} 
              alt={`${title} Signature`} 
              className="h-10 max-w-[120px] object-contain mx-auto" 
            />
            <div className="flex items-center justify-center gap-1 text-[10px] text-green-700 font-bold uppercase tracking-wide">
              <CheckCircle size={10} className="text-green-600" /> Signed Digitally
            </div>
          </div>
        ) : (
          <div className="space-y-1 mb-2">
            <Clock size={20} className="text-slate-400 mx-auto animate-pulse" />
            <div className="text-[10px] text-slate-400 font-semibold italic">Awaiting Signature</div>
          </div>
        )}
        <div className="border-t border-slate-200/80 w-full pt-1.5 mt-2">
          <p className="text-xs font-bold text-slate-800">{sig?.frozen_actor_name || defaultName || 'Authorized Signatory'}</p>
          <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">{sig?.frozen_designation || title}</p>
          {sig?.acted_at && (
            <p className="text-[9px] text-slate-500 font-medium mt-0.5">{new Date(sig.acted_at).toLocaleDateString()}</p>
          )}
        </div>
      </div>
    );
  };

  const fileNo = pr.budget_file?.file_no || "-";
  const deptName = pr.initiator?.email?.includes('cse') ? 'Computer Science & Engineering' : 'Main Office';
  const indentName = pr.items?.[0]?.item_description || '-';
  const fundSource = pr.items?.[0]?.requirement_type || 'OH-35';
  const itemsList = pr.items || [];

  return (
    <div className="card border border-slate-200 shadow-sm overflow-hidden text-left bg-white print-section">
      {/* Header bar */}
      {!hideHeaderControls && (
        <div className="px-6 py-4 border-b border-slate-200 bg-[#1a3a6b] text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-blue-200" />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider">Virtual Form Modules Inspector</h3>
              <p className="text-[10px] text-blue-200 font-medium">NIT Procurement Policy virtual digital layout matching forms_context.md</p>
            </div>
          </div>
          
          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            className="bg-blue-900 border border-blue-700 text-white rounded px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
          >
            {modules.map(m => (
              <option key={m.key} value={m.key} className="bg-slate-900 text-white" disabled={!m.active}>
                {m.label} {!m.active ? '(Not applicable)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Main Form Display */}
      <div className="p-6 overflow-y-auto max-h-[75vh] space-y-6 print:max-h-none print:p-0">
        
        {/* FORM 1: Purchase Indent Form */}
        {selectedModule === 'indent' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">PURCHASE INDENT FORM</p>
            </div>

            <div className="bg-slate-50 p-4 border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs print:bg-white print:border-slate-300">
              <div>
                <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">File No</span>
                <span className="font-semibold text-slate-800">{fileNo}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Name of Department</span>
                <span className="font-semibold text-slate-800">{deptName}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Purchase Indent Name</span>
                <span className="font-semibold text-slate-800">{indentName}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Source of Fund</span>
                <span className="font-semibold text-slate-800">{fundSource}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">a) Details of the required items</h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden print:border-slate-300">
                <table className="min-w-full text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="px-3 py-2 text-left">S.No</th>
                      <th className="px-3 py-2 text-left">Description of the Item</th>
                      <th className="px-3 py-2 text-left">Qty</th>
                      <th className="px-3 py-2 text-left">Unit Cost</th>
                      <th className="px-3 py-2 text-left">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsList.map((item, idx) => (
                      <tr key={item.id || idx} className="border-b border-slate-100">
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2 font-medium">{item.item_description}</td>
                        <td className="px-3 py-2">{item.quantity || 1}</td>
                        <td className="px-3 py-2">{formatCurrency((item.estimated_total) / (item.quantity || 1))}</td>
                        <td className="px-3 py-2 font-semibold text-[#1a3a6b]">{formatCurrency(item.estimated_total)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50/50 font-bold border-t border-slate-200">
                      <td colSpan={4} className="px-3 py-2 text-right">Grand Total:</td>
                      <td className="px-3 py-2 text-[#1a3a6b]">{formatCurrency(pr.amount || 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 bg-blue-50/40 border border-blue-100 rounded-lg text-xs space-y-2 print:bg-white print:border-slate-300">
              <span className="font-bold text-[#1a3a6b] uppercase tracking-wider block text-[9px]">Declaration (Certified that)</span>
              <ul className="list-disc pl-4 text-slate-600 space-y-1">
                <li>The description of the item/equipment/service indented is generic and does not indicate any particular trade mark, trade name and brand.</li>
                <li>The eligibility criteria is not unduly restrictive.</li>
                <li>The demand for goods is not divided into small quantities to make piecemeal purchases to avoid tendering.</li>
              </ul>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
              {renderSignatureBlock('Purchase Initiator', initiatorSig, pr.initiator?.name)}
              {renderSignatureBlock('HoD, Chairperson', hodSig, pr.hod?.name)}
              {renderSignatureBlock('Dean P&D', deanSig)}
              {renderSignatureBlock('Director', directorSig)}
            </div>
          </div>
        )}

        {/* FORM 2: Technical Specification Annexure */}
        {selectedModule === 'specs' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">ANNEXURE – SPECIFICATIONS FINALIZED BY TSC</p>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="min-w-full text-xs text-slate-700">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-2 font-bold w-1/3 bg-slate-50">1) Name of the equipment / goods</td>
                    <td className="px-4 py-2 font-medium">{pr.items?.[0]?.item_description || '-'}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-2 font-bold bg-slate-50">2) Specifications</td>
                    <td className="px-4 py-2 font-mono whitespace-pre-wrap">{pr.items?.[0]?.tech_specs_text || 'Generic Specifications Finalized'}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-2 font-bold bg-slate-50">3) Pre-Dispatch Inspection Required?</td>
                    <td className="px-4 py-2">No</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-2 font-bold bg-slate-50">4) Pre-bid meeting required?</td>
                    <td className="px-4 py-2">No</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-2 font-bold bg-slate-50">5) Installation required?</td>
                    <td className="px-4 py-2">{pr.items?.[0]?.installation_required ? 'Yes' : 'No'}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-2 font-bold bg-slate-50">6) Training required?</td>
                    <td className="px-4 py-2">{pr.is_training_required ? 'Yes' : 'No'}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-2 font-bold bg-slate-50">7) Warranty required</td>
                    <td className="px-4 py-2">{pr.items?.[0]?.warranty || 12} Months</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-2 font-bold bg-slate-50">8) Delivery Period</td>
                    <td className="px-4 py-2">{pr.items?.[0]?.delivery_period || 8} Weeks</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-2 font-bold bg-slate-50">9) Delivery Location</td>
                    <td className="px-4 py-2">{pr.delivery_location || 'Department Lab, NIT Tiruchirappalli'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-slate-100">
              {renderSignatureBlock('HoD, Chairperson', hodSig, pr.hod?.name)}
              {renderSignatureBlock('Purchase Indentor', initiatorSig, pr.initiator?.name)}
              {renderSignatureBlock('Dept. Faculty 1 / Expert', faculty1Sig, pr.faculty1?.name)}
              {renderSignatureBlock('Dept. Faculty 2 / Expert', faculty2Sig, pr.faculty2?.name)}
              {renderSignatureBlock('Director Nominee', faculty3Sig, pr.faculty3?.name)}
            </div>
          </div>
        )}

        {/* FORM 3: Basic Approval for PAC Purchase */}
        {selectedModule === 'pac_approval' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">BASIC APPROVAL FOR PAC PURCHASE</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-800 print:bg-white print:border-slate-300">
              The department proposed to procure the following item(s) on Proprietary Article Certificate (PAC) basis. The items are proprietary in nature.
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="min-w-full text-xs text-slate-700">
                <thead className="bg-slate-50 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left">S.No</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-left">Estimated Amount</th>
                    <th className="px-3 py-2 text-left">Make & Model</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsList.map((item, idx) => (
                    <tr key={item.id || idx} className="border-b border-slate-100">
                      <td className="px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium">{item.item_description}</td>
                      <td className="px-3 py-2 font-bold text-[#1a3a6b]">{formatCurrency(item.estimated_total)}</td>
                      <td className="px-3 py-2 font-bold text-amber-800">{pr.form_data?.manufacturer_name || 'OEM Specified'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
              {renderSignatureBlock('Purchase Initiator', initiatorSig, pr.initiator?.name)}
              {renderSignatureBlock('HoD, Chairperson', hodSig, pr.hod?.name)}
              {renderSignatureBlock('Dean P&D', deanSig)}
              {renderSignatureBlock('Director', directorSig)}
            </div>
          </div>
        )}

        {/* FORM 4: PAC Certificate */}
        {selectedModule === 'pac_cert' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">PROPRIETARY ARTICLE CERTIFICATE</p>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
              <table className="min-w-full text-slate-700">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-2 font-bold w-1/3 bg-slate-50">Maker's name & address</td>
                    <td className="px-4 py-2 font-medium text-slate-800">{pr.form_data?.manufacturer_name || 'OEM'} (Address: {pr.form_data?.manufacturer_address || 'OEM address'})</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-2 font-bold bg-slate-50">PAC Justification Basis</td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px] uppercase">
                        {pr.form_data?.justification_type === 'sole_manufacturer' ? 'Sole Manufacturer' : 'No Alternative / spares compatibility'}
                      </span>
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-4 py-2 font-bold bg-slate-50">Finance Concurrence Ref</td>
                    <td className="px-4 py-2 font-semibold">{pr.form_data?.finance_concurrence_ref || 'N/A'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2 print:bg-white print:border-slate-300">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[9px] block">History of PAC purchase of this item (Past 3 Years)</span>
              <table className="min-w-full text-slate-700 text-[11px]">
                <thead>
                  <tr className="font-bold border-b border-slate-300 text-left">
                    <th className="py-1">Supplier</th>
                    <th className="py-1">Tender Ref</th>
                    <th className="py-1">Quantity</th>
                    <th className="py-1">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-1">{pr.form_data?.manufacturer_name || 'OEM'}</td>
                    <td className="py-1">NITT/{pr.initiator?.email?.includes('cse') ? 'CSE' : 'GEN'}/Prev-PAC</td>
                    <td className="py-1">1</td>
                    <td className="py-1 font-semibold">{formatCurrency(pr.amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <div className="w-64">
                {renderSignatureBlock('Purchase Initiator', initiatorSig, pr.initiator?.name)}
              </div>
            </div>
          </div>
        )}

        {/* FORM 5: LPC Purchase Approval */}
        {selectedModule === 'lpc_approval' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">BASIC APPROVAL FOR LPC PURCHASE (GFR 155)</p>
            </div>

            <div className="bg-slate-50 p-4 border border-slate-200 rounded-lg text-xs print:bg-white print:border-slate-300">
              <p className="italic text-slate-600">"The department proposed to procure the above item(s) through Local Purchase Committee (LPC) as per GFR 155. It will be ensured that the indented item(s) are not available in GeM portal before processing the LPC."</p>
              <div className="mt-3 font-semibold text-slate-700">
                Proposed LPC Committee:
                <ol className="list-decimal pl-4 mt-1 font-normal text-slate-600">
                  <li>HoD, Chairperson</li>
                  <li>Purchase Indentor (PI)</li>
                  <li>Dept. Faculty 1 / Expert ({pr.faculty1?.name || 'Faculty Nominated'})</li>
                  <li>S&P Nominee</li>
                  <li>F&A Nominee</li>
                </ol>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
              {renderSignatureBlock('Purchase Initiator', initiatorSig, pr.initiator?.name)}
              {renderSignatureBlock('HoD, Chairperson', hodSig, pr.hod?.name)}
              {renderSignatureBlock('Dean P&D', deanSig)}
              {renderSignatureBlock('Director', directorSig)}
            </div>
          </div>
        )}

        {/* FORM 6: Nomination on Single Source Basis */}
        {selectedModule === 'single_source' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">NOMINATION ON SINGLE SOURCE BASIS (GFR 194)</p>
            </div>

            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-800 space-y-1 print:bg-white print:border-slate-300">
              <span className="font-bold">Nomination Justification:</span>
              <p className="italic font-medium">"{pr.single_bid_justification || 'OEM compatibility / Proprietary parts / Specialized technical nature'}"</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
              {renderSignatureBlock('Purchase Initiator', initiatorSig, pr.initiator?.name)}
              {renderSignatureBlock('HoD, Chairperson', hodSig, pr.hod?.name)}
              {renderSignatureBlock('Dean P&D', deanSig)}
              {renderSignatureBlock('Director', directorSig)}
            </div>
          </div>
        )}

        {/* FORM 7 & 8: Goods Receipt & Bill Passing */}
        {selectedModule === 'bill_passing' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">GOODS RECEIPT, SUPPLIER & BILL PASSING MINUTES</p>
            </div>

            {pr.bill_passing ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs bg-slate-50 p-4 border border-slate-200 rounded-lg print:bg-white print:border-slate-300">
                  <div className="space-y-2 text-left">
                    <span className="font-bold text-[#1a3a6b] uppercase text-[9px] block tracking-wider">Supplier & Invoice details</span>
                    <p><span className="font-semibold text-slate-500">Invoice Number:</span> <span className="font-mono">{pr.bill_passing.invoice_number}</span></p>
                    <p><span className="font-semibold text-slate-500">Invoice Date:</span> {new Date(pr.bill_passing.invoice_date).toLocaleDateString()}</p>
                    <p><span className="font-semibold text-slate-500">Challan Number:</span> {pr.bill_passing.challan_number || '-'}</p>
                    <p><span className="font-semibold text-slate-500">Challan Date:</span> {pr.bill_passing.challan_date ? new Date(pr.bill_passing.challan_date).toLocaleDateString() : '-'}</p>
                  </div>
                  <div className="space-y-2 text-left">
                    <span className="font-bold text-[#1a3a6b] uppercase text-[9px] block tracking-wider">Financial passing details</span>
                    <p><span className="font-semibold text-slate-500">Passed Bill Amount:</span> <span className="font-bold text-emerald-700">{formatCurrency(pr.bill_passing.bill_amount)}</span></p>
                    <p><span className="font-semibold text-slate-500">Passed GST Amount:</span> {formatCurrency(pr.bill_passing.gst_amount || 0.0)}</p>
                    <p><span className="font-semibold text-slate-500">Payment Terms:</span> {pr.bill_passing.payment_terms || 'Standard'}</p>
                    <p><span className="font-semibold text-slate-500">Remarks:</span> <span className="italic">"{pr.bill_passing.remarks || '-'}"</span></p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                  {renderSignatureBlock('Purchase Initiator', initiatorSig, pr.initiator?.name)}
                  {renderSignatureBlock('HoD, Chairperson', hodSig, pr.hod?.name)}
                  {renderSignatureBlock('Dealing Assistant (S&P)', findSignature('dealing_assistant'))}
                  {renderSignatureBlock('Internal Audit', findSignature('internal_audit'))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 font-medium text-xs">
                Bill passing details are not generated yet. This form becomes active in the final Purchase Order billing phase.
              </div>
            )}
          </div>
        )}

        {/* FORM 9: Minutes for PO Cancellation */}
        {selectedModule === 'po_cancel' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">MINUTES OF THE COMMITTEE FOR PO CANCELLATION</p>
            </div>

            {pr.current_status === 'cancelled' ? (
              <div className="space-y-6">
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-xs text-rose-800 print:bg-white print:border-slate-300">
                  Purchase Order has been cancelled. Reinitiation method: <strong>{pr.form_data?.reinitiation_method || 'GeM'}</strong>.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                  {renderSignatureBlock('Purchase Initiator', initiatorSig, pr.initiator?.name)}
                  {renderSignatureBlock('HoD, Chairperson', hodSig, pr.hod?.name)}
                  {renderSignatureBlock('Dean P&D', deanSig)}
                  {renderSignatureBlock('Director', directorSig)}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 font-medium text-xs">
                This PR has not been cancelled. This minutes form is only generated if the PO/Tender process is cancelled.
              </div>
            )}
          </div>
        )}

        {/* FORM 10: Technical Evaluation Minutes */}
        {selectedModule === 'tech_minutes' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">TECHNICAL EVALUATION MINUTES</p>
            </div>

            {pr.technical_evaluations && pr.technical_evaluations.length > 0 ? (
              <div className="space-y-6">
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="min-w-full text-xs text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 font-bold">
                      <tr>
                        <th className="px-3 py-2 text-left">Vendor Name</th>
                        <th className="px-3 py-2 text-left">Technical Status</th>
                        <th className="px-3 py-2 text-left">Remarks / Scrutiny Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pr.technical_evaluations.map(te => (
                        <tr key={te.id} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-bold">{te.vendor_name}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${te.is_qualified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {te.is_qualified ? 'QUALIFIED' : 'DISQUALIFIED'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500 italic">{te.remarks || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-slate-100">
                  {renderSignatureBlock('HoD, Chairperson', hodSig, pr.hod?.name)}
                  {renderSignatureBlock('Purchase Indentor', initiatorSig, pr.initiator?.name)}
                  {renderSignatureBlock('Dept. Faculty 1 / Expert', faculty1Sig, pr.faculty1?.name)}
                  {renderSignatureBlock('Dept. Faculty 2 / Expert', faculty2Sig, pr.faculty2?.name)}
                  {renderSignatureBlock('Director Nominee', faculty3Sig, pr.faculty3?.name)}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 font-medium text-xs">
                Technical evaluation has not been processed or submitted yet.
              </div>
            )}
          </div>
        )}

        {/* FORM 11: Financial Scrutiny & Approval */}
        {selectedModule === 'fin_approval_two' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">FINANCIAL SCRUTINY & APPROVAL (TWO BID)</p>
            </div>

            {pr.financial_evaluations && pr.financial_evaluations.length > 0 ? (
              <div className="space-y-6">
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="min-w-full text-xs text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 font-bold">
                      <tr>
                        <th className="px-3 py-2 text-left">Vendor Name</th>
                        <th className="px-3 py-2 text-left">Quoted Cost</th>
                        <th className="px-3 py-2 text-left">Rank</th>
                        <th className="px-3 py-2 text-left">Award Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pr.financial_evaluations.map(fe => (
                        <tr key={fe.id} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-bold">{fe.vendor_name}</td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{formatCurrency(fe.quoted_amount)}</td>
                          <td className="px-3 py-2 font-bold text-[#1a3a6b]">{fe.ranking || '-'}</td>
                          <td className="px-3 py-2">
                            {fe.is_awarded ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-extrabold uppercase tracking-wide">
                                ★ Successful L1 Bidder
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                  {renderSignatureBlock('HoD, Chairperson', hodSig, pr.hod?.name)}
                  {renderSignatureBlock('Purchase Indentor', initiatorSig, pr.initiator?.name)}
                  {renderSignatureBlock('Dean P&D', deanSig)}
                  {renderSignatureBlock('Director', directorSig)}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 font-medium text-xs">
                Financial scrutiny has not been completed.
              </div>
            )}
          </div>
        )}

        {/* FORM 12: Tender Cancellation */}
        {selectedModule === 'tender_cancel' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">TENDER CANCELLATION MINUTES</p>
            </div>

            {pr.current_status === 'cancelled' ? (
              <div className="space-y-6">
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-xs text-rose-800 print:bg-white print:border-slate-300">
                  Tender process has been cancelled due to insufficient bids or technical specification mismatch.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                  {renderSignatureBlock('HoD, Chairperson', hodSig, pr.hod?.name)}
                  {renderSignatureBlock('Purchase Indentor', initiatorSig, pr.initiator?.name)}
                  {renderSignatureBlock('Dean P&D', deanSig)}
                  {renderSignatureBlock('Director', directorSig)}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 font-medium text-xs">
                This tender is not cancelled.
              </div>
            )}
          </div>
        )}

        {/* comparative statements (Modules 9, 11, 12, 13) */}
        {selectedModule === 'tech_comparative' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">TECHNICAL COMPARATIVE STATEMENT</p>
            </div>

            {pr.commercial_evaluations && pr.commercial_evaluations.length > 0 ? (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="min-w-full text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="px-3 py-2 text-left">S.No</th>
                      <th className="px-3 py-2 text-left">Participating Bidder Name</th>
                      <th className="px-3 py-2 text-left">Commercial / Eligibility Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.commercial_evaluations.map((ce, idx) => (
                      <tr key={ce.id || idx} className="border-b border-slate-100">
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2 font-bold">{ce.vendor_name}</td>
                        <td className="px-3 py-2 text-slate-600 font-medium">{ce.remarks || 'Standard Bidder Credentials Verified'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 font-medium text-xs">No bidder comparative data available yet.</div>
            )}
          </div>
        )}

        {selectedModule === 'price_comparative' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">PRICE COMPARATIVE STATEMENT</p>
            </div>

            {pr.financial_evaluations && pr.financial_evaluations.length > 0 ? (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="min-w-full text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="px-3 py-2 text-left">Rank</th>
                      <th className="px-3 py-2 text-left">Bidder Name</th>
                      <th className="px-3 py-2 text-left">Quoted Amount</th>
                      <th className="px-3 py-2 text-left">Delivery Period</th>
                      <th className="px-3 py-2 text-left">Warranty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.financial_evaluations.map((fe) => (
                      <tr key={fe.id} className="border-b border-slate-100">
                        <td className="px-3 py-2 font-bold text-[#1a3a6b]">{fe.ranking}</td>
                        <td className="px-3 py-2 font-medium">{fe.vendor_name}</td>
                        <td className="px-3 py-2 font-bold text-emerald-800">{formatCurrency(fe.quoted_amount)}</td>
                        <td className="px-3 py-2">{fe.delivery_period ? `${fe.delivery_period} Weeks` : 'As per Tender'}</td>
                        <td className="px-3 py-2">{fe.warranty ? `${fe.warranty} Months` : '12 Months'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 font-medium text-xs">Price comparative statement is empty.</div>
            )}
          </div>
        )}

        {selectedModule === 'techno_comm_comparative' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">TECHNO-COMMERCIAL COMPARATIVE STATEMENT</p>
            </div>

            {pr.technical_evaluations && pr.technical_evaluations.length > 0 ? (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="min-w-full text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="px-3 py-2 text-left">Vendor Name</th>
                      <th className="px-3 py-2 text-left">Technical Suitability</th>
                      <th className="px-3 py-2 text-left">Financial Quote</th>
                      <th className="px-3 py-2 text-left">Overall Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.technical_evaluations.map((te) => {
                      const fe = pr.financial_evaluations?.find(f => f.vendor_name === te.vendor_name);
                      return (
                        <tr key={te.id} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-bold">{te.vendor_name}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${te.is_qualified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {te.is_qualified ? 'QUALIFIED' : 'DISQUALIFIED'}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{fe ? formatCurrency(fe.quoted_amount) : 'N/A'}</td>
                          <td className="px-3 py-2 font-bold text-[#1a3a6b]">{fe?.ranking || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 font-medium text-xs">Comparative statement is empty.</div>
            )}
          </div>
        )}

        {selectedModule === 'fin_approval_single' && (
          <div className="space-y-6">
            <div className="text-center space-y-1 border-b border-slate-200 pb-4">
              <h2 className="text-base font-extrabold text-slate-800 uppercase">NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI</h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">FINANCIAL APPROVAL (SINGLE BID / GFR 194)</p>
            </div>

            {pr.single_bid_justification ? (
              <div className="space-y-6">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-800 print:bg-white print:border-slate-300">
                  <span className="font-bold">Single Bid Justification:</span>
                  <p className="italic font-medium mt-1">"{pr.single_bid_justification}"</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                  {renderSignatureBlock('HoD, Chairperson', hodSig, pr.hod?.name)}
                  {renderSignatureBlock('Purchase Indentor', initiatorSig, pr.initiator?.name)}
                  {renderSignatureBlock('Dean P&D', deanSig)}
                  {renderSignatureBlock('Director', directorSig)}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 font-medium text-xs">No Single Bid justification exists for this request.</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default PRFormViewer;
