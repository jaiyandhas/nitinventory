import React from 'react';
import { HelpCircle, Download, File } from 'lucide-react';
import { PurchaseRequest } from '../../../types';
import { PRFormViewer } from '../PRFormViewer';

interface PRDocumentsProps {
  pr: PurchaseRequest;
  formatCurrency: (n?: number) => string;
  selectedDocKey: string;
  setSelectedDocKey: (key: string) => void;
}

const FORM_DIRECTORY = [
  {
    title: "Indents & Specifications",
    items: [
      { key: "indent", name: "Purchase Indent Form", desc: "For administrative and financial approval of any indent" },
      { key: "specs", name: "Technical Specs Annexure", desc: "Specifications finalized by the TSC sub-committee" }
    ]
  },
  {
    title: "Mode-Specific Approvals",
    items: [
      { key: "pac_approval", name: "PAC Purchase Approval", desc: "Required basic approval for Proprietary Article purchases" },
      { key: "pac_cert", name: "PAC OEM Certificate", desc: "Sole manufacturer justification and OEM verification" },
      { key: "lpc_approval", name: "LPC GFR 155 Approval", desc: "Required approval for Local Purchase Committees under GFR 155" },
      { key: "single_source", name: "GFR 194 Nomination", desc: "Single source nomination justification and approvals" }
    ]
  },
  {
    title: "Tendering & Comparatives",
    items: [
      { key: "tech_minutes", name: "Technical evaluation", desc: "Minutes of technical evaluation committee" },
      { key: "tech_comparative", name: "Tech Comparative", desc: "Technical bid eligibility and compliance matrix" },
      { key: "price_comparative", name: "Price Comparative", desc: "Price comparative statement with bidder rankings" },
      { key: "techno_comm_comparative", name: "Techno-Commercial", desc: "Unified techno-commercial eligibility & price matrix" },
      { key: "fin_approval_single", name: "Financial Approval (Single Bid)", desc: "DPC Single Bid approval minutes" },
      { key: "fin_approval_two", name: "Financial Scrutiny (Two Bid)", desc: "DPC Two Bid financial scrutiny & award minutes" }
    ]
  },
  {
    title: "Receipts, Billing & Closures",
    items: [
      { key: "bill_passing", name: "Goods Receipt & Billing", desc: "Stock entry register reference and bill passing minutes" },
      { key: "po_cancel", name: "PO Cancellation Minutes", desc: "Purchase committee recommendation for PO cancellation" },
      { key: "tender_cancel", name: "Tender Cancellation", desc: "DPC minutes for tender process cancellation" }
    ]
  }
];

export const PRDocuments: React.FC<PRDocumentsProps> = ({
  pr,
  formatCurrency,
  selectedDocKey,
  setSelectedDocKey
}) => {
  const isFormActive = (key: string, targetPr: PurchaseRequest | undefined): boolean => {
    if (!targetPr) return false;
    if (key === 'indent' || key === 'specs') return true;
    if (key === 'pac_approval' || key === 'pac_cert') return targetPr.procurement?.name === 'Proprietary Purchase' || targetPr.procurement?.name === 'PAC';
    if (key === 'lpc_approval') return targetPr.procurement?.name === 'Committee purchase' || targetPr.procurement?.name === 'LPC' || targetPr.lpc_remarks !== null;
    if (key === 'single_source') return targetPr.procurement?.name === 'Nomination' || targetPr.procurement?.name === 'Single Tender' || targetPr.single_bid_justification !== null;
    if (key === 'tech_minutes') return !!(targetPr.technical_evaluations && targetPr.technical_evaluations.length > 0);
    if (key === 'tech_comparative') return !!(targetPr.commercial_evaluations && targetPr.commercial_evaluations.length > 0);
    if (key === 'price_comparative') return !!(targetPr.financial_evaluations && targetPr.financial_evaluations.length > 0);
    if (key === 'techno_comm_comparative') return !!(targetPr.technical_evaluations && targetPr.technical_evaluations.length > 0 && targetPr.financial_evaluations && targetPr.financial_evaluations.length > 0);
    if (key === 'fin_approval_single') return targetPr.single_bid_justification !== null;
    if (key === 'fin_approval_two') return !!(targetPr.financial_evaluations && targetPr.financial_evaluations.length > 0);
    if (key === 'bill_passing') return targetPr.bill_passing !== null;
    if (key === 'po_cancel' || key === 'tender_cancel') return targetPr.current_status === 'cancelled';
    return false;
  };

  const getFormInactiveReason = (key: string): string => {
    if (key === 'pac_approval' || key === 'pac_cert') return "Only generated for PAC/Proprietary Purchase modes.";
    if (key === 'lpc_approval') return "Only generated for LPC/Committee purchases (GFR 155).";
    if (key === 'single_source') return "Only generated for Single Tender/Nomination purchases (GFR 194).";
    if (key === 'tech_minutes') return "Active after technical evaluations have been uploaded and submitted.";
    if (key === 'tech_comparative') return "Active after bidders undergo eligibility commercial checks.";
    if (key === 'price_comparative') return "Active after financial bids are opened and recorded.";
    if (key === 'techno_comm_comparative') return "Active when both technical and financial evaluations are complete.";
    if (key === 'fin_approval_single') return "Active when a single qualified bidder justification is submitted.";
    if (key === 'fin_approval_two') return "Active during the DPC Two Bid financial selection phase.";
    if (key === 'bill_passing') return "Active in the final phase after PO completion, delivery, and bill submission.";
    if (key === 'po_cancel') return "Active only if a Purchase Order is cancelled.";
    if (key === 'tender_cancel') return "Active only if the tender process is cancelled.";
    return "This GFR module is not active for the current Purchase Request state.";
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start text-left">
      {/* GFR Forms Directory menu */}
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-4">
          <div className="font-bold text-slate-700 text-xs uppercase tracking-wide border-b border-slate-100 pb-2">
            Forms Directory
          </div>
          <div className="space-y-4">
            {FORM_DIRECTORY.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-1.5">
                <div className="text-[10px] uppercase font-bold text-[#1a3a6b] bg-blue-50/50 px-2.5 py-1 tracking-wider rounded">
                  {group.title}
                </div>
                <div className="space-y-1 pl-1">
                  {group.items.map((item) => {
                    const isActive = selectedDocKey === item.key;
                    const isApplicable = isFormActive(item.key, pr);
                    return (
                      <button
                        key={item.key}
                        onClick={() => setSelectedDocKey(item.key)}
                        className={`w-full text-left p-2.5 rounded transition-all flex items-start justify-between group cursor-pointer border ${
                          isActive 
                            ? 'bg-[#1a3a6b] text-white border-transparent shadow-xs' 
                            : isApplicable
                              ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-100 hover:border-slate-200'
                              : 'bg-slate-50/50 text-slate-400 border-slate-100/50 cursor-not-allowed opacity-70'
                        }`}
                        disabled={!isApplicable}
                        title={!isApplicable ? getFormInactiveReason(item.key) : undefined}
                      >
                        <div className="pr-2 space-y-0.5">
                          <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                            <File size={12} className={isActive ? 'text-blue-200' : isApplicable ? 'text-slate-400 group-hover:text-[#1a3a6b]' : 'text-slate-300'} />
                            {item.name}
                          </div>
                          <div className={`text-[10px] font-medium leading-tight ${isActive ? 'text-blue-100/80' : 'text-slate-400'}`}>
                            {item.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="bg-[#f0f4f8] border border-blue-100 rounded-lg p-4 text-xs text-slate-600 flex gap-3">
          <HelpCircle size={18} className="text-[#1a3a6b] flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-[#1a3a6b]">GFR Compliance Binder</span>
            <p className="leading-relaxed">
              These compliance documents are automatically generated using the PR details and actions logged in the workflow phases. You can download print-ready PDFs for audit and storage.
            </p>
          </div>
        </div>
      </div>

      {/* GFR Form Sheet previewer */}
      <div className="lg:col-span-8 space-y-6">
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Document Preview</h3>
            <p className="text-[10px] text-slate-500">Live preview of generated GFR form parameters.</p>
          </div>
          <a
            href={`/api/pr/${pr.id}/print?module=${selectedDocKey}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 px-3 py-1.5 rounded transition font-bold"
          >
            <Download size={12} /> Download PDF
          </a>
        </div>

        <div className="document-sheet shadow-md rounded-lg overflow-hidden bg-slate-100/50 p-2 sm:p-4">
          <PRFormViewer
            pr={pr}
            formatCurrency={formatCurrency}
            selectedModule={selectedDocKey}
            onModuleChange={setSelectedDocKey}
            hideHeaderControls={true}
          />
        </div>
      </div>
    </div>
  );
};
export default PRDocuments;
