import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  FileText, Search, Printer, File, CheckCircle, 
  Layers, ChevronRight, HelpCircle, Eye, EyeOff, Lock, Unlock, AlertCircle
} from 'lucide-react';
import { prApi, budgetApi } from '../services/api';
import { PurchaseRequest } from '../types';
import { PRFormViewer } from '../components/pr/PRFormViewer';
import { PRActionPanel } from '../components/pr/PRActionPanel';
import { useAuth } from '../context/AuthContext';

// Static categories for grouping the 15 Forms in the sidebar
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

export const FormsDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialModule = searchParams.get('module') || 'indent';

  const [activeModule, setActiveModule] = useState<string>(initialModule);
  const [selectedPrId, setSelectedPrId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // List all available Purchase Requests
  const { data: prsData, isLoading: isLoadingList } = useQuery({
    queryKey: ['prs', 'forms_dashboard'],
    queryFn: () => prApi.list({ limit: 200 }).then(r => r.data),
  });
  const prs = prsData?.items || [];

  // Automatically select the most recent PR on load
  useEffect(() => {
    if (prs.length > 0 && !selectedPrId) {
      setSelectedPrId(String(prs[0].id));
    }
  }, [prs, selectedPrId]);

  // Synchronize URL query parameter with active module state
  useEffect(() => {
    const mod = searchParams.get('module');
    if (mod) {
      setActiveModule(mod);
    }
  }, [searchParams]);

  // Fetch full details of the selected PR
  const { data: activePr, isLoading: isLoadingDetail, refetch } = useQuery<PurchaseRequest>({
    queryKey: ['pr', selectedPrId],
    queryFn: () => prApi.get(Number(selectedPrId)).then(r => r.data),
    enabled: !!selectedPrId,
  });

  // Fetch faculties for HOD nominee selection
  const { data: faculties = [] } = useQuery<any[]>({
    queryKey: ['departmentFaculty'],
    queryFn: () => budgetApi.departmentFaculty().then(r => r.data),
    enabled: !!selectedPrId,
  });

  // Handle changing active module from state/url
  const handleSelectModule = (key: string) => {
    setActiveModule(key);
    setSearchParams({ module: key });
  };

  // Filter Purchase Requests for the select dropdown
  const filteredPrs = prs.filter((pr: any) => {
    const searchLower = searchTerm.toLowerCase();
    const icr = (pr.icr_number || '').toLowerCase();
    const idStr = String(pr.id);
    const initiator = (pr.initiator?.name || '').toLowerCase();
    const dept = (pr.initiator?.email || '').includes('cse') ? 'computer science' : 'main office';
    return icr.includes(searchLower) || idStr.includes(searchLower) || initiator.includes(searchLower) || dept.includes(searchLower);
  });

  const formatCurrency = (n?: number) => {
    if (n === undefined || n === null || isNaN(n)) return '₹0.00L';
    return `₹${(n / 100000).toFixed(2)}L`;
  };

  const handlePrint = () => {
    window.print();
  };

  // Calculate if the selected PR is actionable by the current user
  let canActOn = false;
  if (user?.role?.group_key === 'admin') {
    canActOn = true;
  } else if (activePr?.flow) {
    const phaseName = activePr.flow?.phase_name;
    if (phaseName === 'Technical Evaluation' && activePr.flow.step_order === 1) {
      const committeeIds = [activePr.initiator_id, activePr.faculty1_id, activePr.faculty2_id, activePr.faculty3_id].filter(Boolean);
      canActOn = committeeIds.includes(user?.id);
    } else if (activePr.flow.expected_user_id) {
      if (user?.id === activePr.flow.expected_user_id) {
        canActOn = true;
      }
    } else if (activePr.flow.expected_role_name === 'Faculty' || activePr.flow.expected_group === 'faculty') {
      canActOn = user?.id === activePr.initiator?.id;
    } else if (activePr.flow.expected_role_id) {
      if (user?.role_id === activePr.flow.expected_role_id) {
        canActOn = true;
      }
    } else if (activePr.flow.expected_group) {
      if (user?.role?.group_key === activePr.flow.expected_group) {
        canActOn = true;
      }
    }
  }

  const activeReferralForUser = activePr?.referrals?.find((ref: any) => ref.referred_to?.id === user?.id && ref.status === 'pending');
  const anyPendingReferral = activePr?.referrals?.find((ref: any) => ref.status === 'pending');

  const isActionable = activePr && (canActOn || !!activeReferralForUser || !!anyPendingReferral) && !['po_issued', 'rejected', 'cancelled', 'completed'].includes(activePr.current_status);

  // Helper to trace which form module currently expects action/signature from the logged-in user
  const getAwaitingActionModule = (pr: PurchaseRequest, currentUser: any): string | null => {
    if (!pr.flow) return null;
    const phaseName = pr.flow.phase_name;
    
    if (phaseName === 'Administrative Approval') {
      return 'indent';
    }
    if (phaseName === 'Technical Evaluation') {
      return 'tech_minutes';
    }
    if (phaseName === 'Financial Bid Opening' || phaseName === 'Financial Scrutiny') {
      return (pr.procurement?.name === 'Nomination' || pr.procurement?.name === 'Single Tender' || pr.procurement?.name === 'PAC' || pr.procurement?.name === 'Proprietary Purchase') ? 'fin_approval_single' : 'fin_approval_two';
    }
    if (phaseName === 'Tendering') {
      if (pr.procurement?.name === 'Committee purchase' || pr.procurement?.name === 'LPC') return 'lpc_approval';
      if (pr.procurement?.name === 'Nomination' || pr.procurement?.name === 'Single Tender') return 'single_source';
      return 'specs';
    }
    if (pr.current_status === 'po_issued' && !pr.bill_passing) {
      return 'bill_passing';
    }
    
    return null;
  };

  const awaitingModuleKey = activePr ? getAwaitingActionModule(activePr, user) : null;

  // Check whether a specific form key is active for the selected PR dynamically
  const isFormActive = (key: string, pr: PurchaseRequest | undefined): boolean => {
    if (!pr) return false;
    if (key === 'indent' || key === 'specs') return true;
    if (key === 'pac_approval' || key === 'pac_cert') return pr.procurement?.name === 'Proprietary Purchase' || pr.procurement?.name === 'PAC';
    if (key === 'lpc_approval') return pr.procurement?.name === 'Committee purchase' || pr.procurement?.name === 'LPC' || pr.lpc_remarks !== null;
    if (key === 'single_source') return pr.procurement?.name === 'Nomination' || pr.procurement?.name === 'Single Tender' || pr.single_bid_justification !== null;
    if (key === 'tech_minutes') return !!(pr.technical_evaluations && pr.technical_evaluations.length > 0);
    if (key === 'tech_comparative') return !!(pr.commercial_evaluations && pr.commercial_evaluations.length > 0);
    if (key === 'price_comparative') return !!(pr.financial_evaluations && pr.financial_evaluations.length > 0);
    if (key === 'techno_comm_comparative') return !!(pr.technical_evaluations && pr.technical_evaluations.length > 0 && pr.financial_evaluations && pr.financial_evaluations.length > 0);
    if (key === 'fin_approval_single') return pr.single_bid_justification !== null;
    if (key === 'fin_approval_two') return !!(pr.financial_evaluations && pr.financial_evaluations.length > 0);
    if (key === 'bill_passing') return pr.bill_passing !== null;
    if (key === 'po_cancel' || key === 'tender_cancel') return pr.current_status === 'cancelled';
    return false;
  };

  // Explanation when the form is not yet generated/active
  const getFormInactiveReason = (key: string, pr: PurchaseRequest | undefined): string => {
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

  const isModuleActive = isFormActive(activeModule, activePr);
  const inactiveReason = getFormInactiveReason(activeModule, activePr);

  if (isLoadingList) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-16 text-center text-slate-500 font-medium">
        <div className="w-8 h-8 rounded-full border-2 border-[#1a3a6b] border-t-transparent animate-spin mx-auto mb-4" />
        Loading procurement logs...
      </div>
    );
  }

  if (prs.length === 0) {
    return (
      <div className="card p-12 text-center text-slate-500 font-medium bg-white rounded-lg border border-slate-200 shadow-sm max-w-2xl mx-auto space-y-4">
        <EyeOff className="text-slate-400 mx-auto" size={40} />
        <h2 className="text-base font-extrabold text-slate-800 uppercase">No Purchase Requests Found</h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          No active or historical Purchase Requests were found in the system. Create a Purchase Request first to inspect its generated real-time forms.
        </p>
        <div className="pt-2">
          <Link to="/pr" className="btn-primary text-xs py-2 px-4">
            Go to Purchase Requests
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search & Select Panel */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
        <div className="space-y-1">
          <h1 className="text-lg font-extrabold text-[#1a3a6b] flex items-center gap-2">
            <Layers className="text-[#1a3a6b]" size={20} /> Procurement Forms Directory
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Centralized digital workstation. Type details and sign/forward forms directly online.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* PR Selection */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Purchase Request Binder</label>
            <div className="flex items-center gap-2">
              <select
                value={selectedPrId}
                onChange={(e) => setSelectedPrId(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded px-3 py-2 w-64 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                {filteredPrs.map((pr: any) => (
                  <option key={pr.id} value={pr.id}>
                    📄 {pr.icr_number || `#${pr.id}`} - {pr.initiator?.name || 'Initiator'} ({formatCurrency(pr.amount)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Filter */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Search Binder Requests</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by ICR, name, dept..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs text-slate-700 rounded pl-8 pr-3 py-2 w-48 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Search className="absolute left-2.5 top-2.5 text-slate-400" size={13} />
            </div>
          </div>

          {/* Print Button (De-emphasized) */}
          <button
            onClick={handlePrint}
            disabled={!isModuleActive}
            className="flex items-center justify-center p-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed mt-5"
            title="Download PDF Copy"
          >
            <Printer size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Directory Menu */}
        <div className="lg:col-span-4 space-y-4 print:hidden">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-4">
            <div className="font-bold text-slate-700 text-xs uppercase tracking-wide border-b border-slate-100 pb-2">
              Forms Directory
            </div>

            <div className="space-y-4">
              {/* Categorized menu */}
              {FORM_DIRECTORY.map((group, groupIdx) => (
                <div key={groupIdx} className="space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-[#1a3a6b]/80 bg-blue-50/50 px-2 py-1 tracking-wider rounded">
                    {group.title}
                  </div>
                  <div className="space-y-1 pl-1">
                    {group.items.map((item) => {
                      const isActive = activeModule === item.key;
                      const isApplicable = isFormActive(item.key, activePr);
                      const needsUserAction = isActionable && awaitingModuleKey === item.key;
                      return (
                        <button
                          key={item.key}
                          onClick={() => handleSelectModule(item.key)}
                          className={`w-full text-left p-2.5 rounded transition-all flex items-start justify-between group cursor-pointer border ${
                            isActive 
                              ? 'bg-[#1a3a6b] text-white border-transparent shadow-xs' 
                              : isApplicable
                                ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-100 hover:border-slate-200'
                                : 'bg-slate-50/50 text-slate-400 border-slate-100/50 cursor-pointer opacity-70 hover:bg-slate-50'
                          } ${needsUserAction && !isActive ? 'border-red-300 bg-red-50/20' : ''}`}
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
                          <div className="flex items-center gap-2 mt-0.5">
                            {needsUserAction && !isActive && (
                              <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                              </span>
                            )}
                            {isActive ? (
                              <ChevronRight size={14} className="text-blue-200 translate-x-0.5" />
                            ) : isApplicable ? (
                              <Unlock size={11} className="text-slate-300 group-hover:text-[#1a3a6b]" />
                            ) : (
                              <Lock size={11} className="text-slate-300" />
                            )}
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
              <span className="font-bold text-[#1a3a6b]">Real-Time Active Tracking</span>
              <p className="leading-relaxed">
                A red pulse indicator shows which form module requires your signature or details to advance the procurement process. Fill in the data and sign directly in the action desk.
              </p>
            </div>
          </div>
        </div>

        {/* Right: Simulated Document Sheet (A4 styling) */}
        <div className="lg:col-span-8 space-y-6">
          {isLoadingDetail ? (
            <div className="bg-white border border-slate-200 rounded-lg p-16 text-center text-slate-500 font-medium">
              <div className="w-8 h-8 rounded-full border-2 border-[#1a3a6b] border-t-transparent animate-spin mx-auto mb-4" />
              Loading form parameters from Purchase Request details...
            </div>
          ) : !activePr ? (
            <div className="bg-white border border-slate-200 rounded-lg p-16 text-center text-slate-400 font-medium">
              Select a Purchase Request to view forms.
            </div>
          ) : !isModuleActive ? (
            <div className="bg-white border border-slate-200 rounded-lg p-12 text-center max-w-md mx-auto shadow-sm my-16 space-y-4">
              <EyeOff className="text-slate-400 mx-auto" size={40} />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Form Module Inactive</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                This form module is not active for Purchase Request <strong className="text-slate-700">{activePr.icr_number || `#${activePr.id}`}</strong>.
              </p>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded text-xs text-slate-600 italic">
                "{inactiveReason}"
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Document Sheet */}
              <div className="document-sheet shadow-md rounded-lg overflow-hidden bg-slate-100/50 p-2 sm:p-4 print:p-0 print:bg-white print:shadow-none">
                <PRFormViewer
                  pr={activePr}
                  formatCurrency={formatCurrency}
                  selectedModule={activeModule}
                  onModuleChange={handleSelectModule}
                  hideHeaderControls={true}
                />
              </div>

              {/* Action Desk Container */}
              {isActionable && awaitingModuleKey === activeModule && (
                <div className="bg-white border border-red-200 rounded-lg p-5 shadow-sm mt-6 border-l-4 border-l-red-500">
                  <div className="font-extrabold text-red-700 text-xs uppercase tracking-wider border-b border-slate-100 pb-2 mb-4 flex items-center gap-2">
                    <Unlock size={14} className="text-red-500" /> Digital Signature & Execution Desk
                  </div>
                  <PRActionPanel
                    pr={activePr}
                    user={user}
                    refetch={refetch}
                    faculties={faculties}
                  />
                </div>
              )}

              {/* Referral / Consultation Desk */}
              {isActionable && awaitingModuleKey !== activeModule && (
                <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm mt-6">
                  <div className="font-extrabold text-[#1a3a6b] text-xs uppercase tracking-wider border-b border-slate-100 pb-2 mb-4 flex items-center gap-2">
                    <AlertCircle size={14} className="text-[#1a3a6b]" /> Secondary Consultation & referrals Desk
                  </div>
                  <p className="text-xs text-slate-500 mb-4 font-medium">
                    This form is active but the current workflow step expects action on another module. You can still refer this PR for consultation below:
                  </p>
                  <PRActionPanel
                    pr={activePr}
                    user={user}
                    refetch={refetch}
                    faculties={faculties}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FormsDashboardPage;
