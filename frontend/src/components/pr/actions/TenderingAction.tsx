import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, XCircle, RotateCcw, UserPlus, Plus, Trash2, ShieldAlert
} from 'lucide-react';
import { prApi } from '../../../services/api';
import { PurchaseRequest } from '../../../types';
import toast from 'react-hot-toast';

interface TenderingActionProps {
  pr: PurchaseRequest;
  user: any;
  refetch: () => void;
  actionLoading: boolean;
  setActionLoading: (loading: boolean) => void;
  sendBackCandidates: any[];
  onReject: (remarks: string) => Promise<void>;
  onSendBack: (step: number, remarks: string) => Promise<void>;
  showSendBackModal: boolean;
  setShowSendBackModal: (show: boolean) => void;
  selectedSendBackStep: number | '';
  setSelectedSendBackStep: (step: number | '') => void;
  remarks: string;
  setRemarks: (val: string) => void;
}

const getDocLabel = (docKey: string): string => {
  if (!docKey) return 'Document';
  if (docKey === 'draft_tender_document') return 'Draft Tender Document';
  if (docKey === 'tender_document') return 'Final Tender Document';
  if (docKey === 'quotation_file' || docKey === 'basis_of_estimation') return 'Basis of Estimation (Quotation)';
  
  let label = docKey;
  label = label.replace(/_/g, ' ');
  label = label.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  label = label.replace(/Tech Specs/i, 'Technical Specifications');
  label = label.replace(/Gem Nac/i, 'GeM Non-Availability Certificate');
  
  return label;
};

const evaluateTenderComparison = (vendorCount: number, threshold: number, op: string = '<=') => {
  switch (op) {
    case '<=': return vendorCount <= threshold;
    case '>=': return vendorCount >= threshold;
    case '<': return vendorCount < threshold;
    case '>': return vendorCount > threshold;
    case '==': return vendorCount === threshold;
    case '!=': return vendorCount !== threshold;
    default: return vendorCount <= threshold;
  }
};

const renderTenderRoutingNotice = (vendorCount: number, threshold: number, comparisonOp?: string | null, size: 'sm' | 'base' = 'base') => {
  const op = comparisonOp || '<=';
  const isMet = evaluateTenderComparison(vendorCount, threshold, op);
  
  const opDescriptions: Record<string, string> = {
    '<=': 'less than or equal to',
    '>=': 'greater than or equal to',
    '<': 'less than',
    '>': 'greater than',
    '==': 'exactly',
    '!=': 'not equal to',
  };
  
  const opText = opDescriptions[op] || 'less than or equal to';
  
  const bgClass = isMet ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800';
  const dotClass = isMet ? 'bg-amber-500 animate-pulse' : 'bg-green-500';
  const textClass = size === 'sm' ? 'text-[10px] gap-1' : 'text-xs gap-1.5';
  const headerClass = size === 'sm' ? 'text-[9px]' : 'text-[10px]';

  return (
    <div className={`p-3 rounded border font-semibold flex flex-col ${bgClass} ${textClass}`}>
      <span className={`font-bold uppercase tracking-wider flex items-center gap-1.5 ${headerClass}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`}></span>
        Tender Routing Notice
      </span>
      <span>
        {isMet 
          ? `Since the bidding vendor count (${vendorCount}) is ${opText} the threshold of ${threshold}, this purchase request requires Director/Deputy Registrar approval.`
          : `Since the bidding vendor count (${vendorCount}) is not ${opText} the threshold of ${threshold}, this purchase request bypasses Director/Deputy Registrar approval and will advance directly to the Technical Evaluation phase.`}
      </span>
    </div>
  );
};

export const TenderingAction: React.FC<TenderingActionProps> = ({
  pr,
  user,
  refetch,
  actionLoading,
  setActionLoading,
  sendBackCandidates,
  onReject,
  onSendBack,
  showSendBackModal,
  setShowSendBackModal,
  selectedSendBackStep,
  setSelectedSendBackStep,
  remarks,
  setRemarks
}) => {
  // DA assignment states
  const [daList, setDaList] = useState<any[]>([]);
  const [selectedDa, setSelectedDa] = useState<number | ''>('');

  // Vendor master states
  const [masterVendors, setMasterVendors] = useState<any[]>([]);
  const [selectedMasterVendor, setSelectedMasterVendor] = useState<string>('');

  // Tender form states
  const [tenderRef, setTenderRef] = useState('');
  const [tenderDate, setTenderDate] = useState('');
  const [techOpenDate, setTechOpenDate] = useState('');
  const [finOpenDate, setFinOpenDate] = useState('');
  const [tenderVendors, setTenderVendors] = useState<any[]>([]);
  const [vendorListLink, setVendorListLink] = useState('');
  const [draftTenderDoc, setDraftTenderDoc] = useState<File | null>(null);
  const [tenderDoc, setTenderDoc] = useState<File | null>(null);

  // LPC states
  const [lpcCommitteeMembers, setLpcCommitteeMembers] = useState('');
  const [lpcMinutesReference, setLpcMinutesReference] = useState('');
  const [lpcRemarks, setLpcRemarks] = useState('');

  const phaseName = pr.flow?.phase_name;
  const hasExistingDraft = pr.documents?.some((d: any) => d.doc_key === 'draft_tender_document');
  const hasExistingTender = pr.documents?.some((d: any) => d.doc_key === 'tender_document');

  useEffect(() => {
    if (
      phaseName === 'Tendering' &&
      pr.flow?.step_order === 1 &&
      pr.flow?.expected_role_name === 'Superintendent'
    ) {
      prApi.getDealingAssistants().then(res => setDaList(res.data)).catch(() => {});
    }

    if (phaseName === 'Tendering') {
      prApi.getVendors().then(res => {
        setMasterVendors(res.data);
        if (res.data.length > 0) setSelectedMasterVendor(res.data[0].vendor_name);
      }).catch(() => {});

      if (pr.tender_reference_number) setTenderRef(pr.tender_reference_number);
      if (pr.date_of_tender) setTenderDate(pr.date_of_tender.substring(0, 10));
      if (pr.date_of_tech_bid_opening) setTechOpenDate(pr.date_of_tech_bid_opening.substring(0, 10));
      if (pr.date_of_financial_bid_opening) setFinOpenDate(pr.date_of_financial_bid_opening.substring(0, 10));
      if (pr.vendor_list_link) setVendorListLink(pr.vendor_list_link);

      if (pr.commercial_evaluations && pr.commercial_evaluations.length > 0) {
        const initialTenders = pr.commercial_evaluations.map(ce => ({
          name: ce.vendor_name,
          email: ce.vendor_email || '',
          quoted_amount: ce.quoted_amount ? String(ce.quoted_amount / 100000) : '',
          is_qualified: ce.is_qualified !== false,
          remarks: ce.remarks || ''
        }));
        setTenderVendors(initialTenders);
      } else {
        setTenderVendors([{ name: '', email: '', quoted_amount: '', is_qualified: true, remarks: '' }]);
      }

      if (pr.lpc_remarks) setLpcRemarks(pr.lpc_remarks);
      if (pr.lpc_committee_members) setLpcCommitteeMembers(pr.lpc_committee_members);
      if (pr.lpc_minutes_reference) setLpcMinutesReference(pr.lpc_minutes_reference);
    }
  }, [pr]);

  const handleDAAssignment = async () => {
    if (!selectedDa) { toast.error('Please select a Dealing Assistant'); return; }
    setActionLoading(true);
    try {
      await prApi.assignDa(pr.id, Number(selectedDa));
      toast.success('DA assigned successfully.');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTenderSubmit = async () => {
    if (!tenderRef.trim()) { toast.error('Tender Reference Number is required'); return; }
    if (!tenderDate) { toast.error('Tender date is required'); return; }
    if (tenderVendors.length === 0) { toast.error('Please add at least one commercial vendor'); return; }
    
    const hasEmptyVendorName = tenderVendors.some(v => !v.name || !v.name.trim());
    if (hasEmptyVendorName) {
      toast.error('Vendor name is required for all rows');
      return;
    }

    const isLimitedTender = pr.procurement?.name?.toLowerCase().includes('limited tender') || pr.procurement?.name?.toLowerCase().includes('lpc');
    if (isLimitedTender) {
      if (!lpcCommitteeMembers.trim()) { toast.error('Committee members are required for Limited Tender (LPC)'); return; }
      if (!lpcMinutesReference.trim()) { toast.error('Minutes reference is required for Limited Tender (LPC)'); return; }
      if (!lpcRemarks.trim()) { toast.error('LPC remarks are required for Limited Tender (LPC)'); return; }
    }

    if (!hasExistingDraft && !draftTenderDoc) {
      toast.error('Draft Tender Document is mandatory');
      return;
    }

    if (!remarks.trim()) { toast.error('Remarks are required to register and advance'); return; }
    if (!window.confirm('Are you sure you want to register these tender details and advance?')) return;

    setActionLoading(true);
    try {
      const formData = new FormData();
      const payload = {
        tender_reference_number: tenderRef,
        date_of_tender: tenderDate,
        date_of_tech_bid_opening: techOpenDate || null,
        date_of_financial_bid_opening: finOpenDate || null,
        vendor_list_link: vendorListLink || null,
        vendors: tenderVendors.map(v => ({
          name: v.name.trim(),
          email: v.email ? v.email.trim() : null,
          quoted_amount: v.quoted_amount ? parseFloat(v.quoted_amount) * 100000 : null,
          is_qualified: v.is_qualified !== false,
          remarks: v.remarks
        })),
        lpc_remarks: isLimitedTender ? lpcRemarks : null,
        lpc_committee_members: isLimitedTender ? lpcCommitteeMembers : null,
        lpc_minutes_reference: isLimitedTender ? lpcMinutesReference : null,
        remarks: remarks
      };
      
      formData.append('payload', JSON.stringify(payload));
      if (draftTenderDoc) {
        formData.append('draft_tender_document', draftTenderDoc);
      }
      if (tenderDoc) {
        formData.append('tender_document', tenderDoc);
      }

      await prApi.addTenderDetails(pr.id, formData);

      toast.success('Tender details registered. Advancing step...');
      await prApi.advance(pr.id, remarks);
      setRemarks('');
      setDraftTenderDoc(null);
      setTenderDoc(null);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveForwardSuperintendent = async () => {
    if (!remarks.trim()) {
      toast.error('Remarks are required to approve');
      return;
    }
    setActionLoading(true);
    try {
      await prApi.advance(pr.id, remarks);
      toast.success('Tender details approved. Advancing workflow...');
      setRemarks('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Approval failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      {/* DA Assignment Sub-Form */}
      {pr.flow?.step_order === 1 && pr.flow?.expected_role_name === 'Superintendent' && (
        <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1">
            <UserPlus size={14} /> Dealing Assistant Assignment Required
          </h4>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="label text-slate-600">Select Dealing Assistant</label>
              <select 
                value={selectedDa} 
                onChange={(e) => setSelectedDa(e.target.value === '' ? '' : Number(e.target.value))} 
                className="input-field mt-1"
              >
                <option value="">-- Choose DA --</option>
                {daList.map(da => (
                  <option key={da.id} value={da.id}>{da.name} ({da.email})</option>
                ))}
              </select>
            </div>
            <button 
              onClick={handleDAAssignment} 
              disabled={actionLoading || !selectedDa}
              className="btn-primary py-2.5 px-4 mb-0.5"
            >
              Assign & Proceed
            </button>
          </div>
        </div>
      )}

      {/* Dealing Assistant Form */}
      {pr.flow?.expected_role_name === 'Dealing Assistant' && (
        <div className="space-y-4 bg-white p-5 border border-slate-200 rounded-xl shadow-sm animate-fadeIn text-left">
          <h4 className="text-sm font-bold text-[#1a3a6b] border-b border-slate-100 pb-1.5 flex justify-between items-center">
            <span>Register Tender Details</span>
            <span className="text-[10px] text-slate-400 font-normal">Please fill in specs and bidders</span>
          </h4>
          
          <div className="space-y-2">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100/50 pb-0.5">Tender Specifications</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="label text-slate-600 font-semibold text-xs">Tender Ref Number *</label>
                <div className="relative mt-1">
                  <input 
                    type="text" 
                    value={tenderRef} 
                    onChange={(e) => setTenderRef(e.target.value)} 
                    className="input-field pl-8 py-1.5 text-xs" 
                    placeholder="e.g. NITT/CSE/2026/04" 
                    required
                  />
                  <span className="absolute left-3 top-2 text-slate-400 text-xs font-semibold font-mono">#</span>
                </div>
              </div>
              <div>
                <label className="label text-slate-600 font-semibold text-xs">Date of Tender *</label>
                <input 
                  type="date" 
                  value={tenderDate} 
                  onChange={(e) => setTenderDate(e.target.value)} 
                  className="input-field mt-1 py-1.5 text-xs" 
                  required
                />
              </div>
              <div>
                <label className="label text-slate-600 font-semibold text-xs">Tech Bid Opening</label>
                <input 
                  type="date" 
                  value={techOpenDate} 
                  onChange={(e) => setTechOpenDate(e.target.value)} 
                  className="input-field mt-1 py-1.5 text-xs" 
                />
              </div>
              <div>
                <label className="label text-slate-600 font-semibold text-xs">Fin Bid Opening</label>
                <input 
                  type="date" 
                  value={finOpenDate} 
                  onChange={(e) => setFinOpenDate(e.target.value)} 
                  className="input-field mt-1 py-1.5 text-xs" 
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label text-slate-600 font-semibold text-xs">External Vendor List Document URL</label>
                <input 
                  type="url" 
                  value={vendorListLink} 
                  onChange={(e) => setVendorListLink(e.target.value)} 
                  className="input-field mt-1 py-1.5 text-xs" 
                  placeholder="https://drive.google.com/..." 
                />
              </div>
            </div>
          </div>

          {(pr.procurement?.name?.toLowerCase().includes('limited tender') || pr.procurement?.name?.toLowerCase().includes('lpc')) && (
            <div className="space-y-2 pt-2 border-t border-slate-100 animate-fadeIn">
              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100/50 pb-0.5">Limited Purchase Committee Approval</h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label text-slate-600 font-semibold text-xs">LPC Committee Members *</label>
                  <input 
                    type="text" 
                    value={lpcCommitteeMembers} 
                    onChange={(e) => setLpcCommitteeMembers(e.target.value)} 
                    className="input-field mt-1 py-1.5 text-xs" 
                    placeholder="Dr. A, Dr. B, Dr. C"
                    required
                  />
                </div>
                <div>
                  <label className="label text-slate-600 font-semibold text-xs">Minutes Reference Number *</label>
                  <input 
                    type="text" 
                    value={lpcMinutesReference} 
                    onChange={(e) => setLpcMinutesReference(e.target.value)} 
                    className="input-field mt-1 py-1.5 text-xs" 
                    placeholder="e.g. NITT/LPC/MIN/2026/04" 
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label text-slate-600 font-semibold text-xs">LPC Remarks / Decision *</label>
                  <textarea 
                    value={lpcRemarks} 
                    onChange={(e) => setLpcRemarks(e.target.value)} 
                    className="input-field mt-1 py-1.5 text-xs h-16" 
                    placeholder="Provide committee recommendation and decision details..."
                    required
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-1">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100/50 pb-0.5">Tender Documents</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-2.5 border border-dashed border-slate-200 rounded-lg bg-slate-50/20">
                <label className="label text-slate-600 font-semibold flex flex-wrap gap-1 items-center mb-1 text-xs">
                  <span>Draft Tender Document *</span>
                  {hasExistingDraft && (
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 text-[9px] font-medium">
                      Saved: {pr.documents?.find((d: any) => d.doc_key === 'draft_tender_document')?.original_name}
                    </span>
                  )}
                </label>
                <input 
                  type="file" 
                  onChange={(e) => setDraftTenderDoc(e.target.files?.[0] || null)} 
                  className="w-full text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer" 
                  required={!hasExistingDraft}
                />
              </div>
              <div className="p-2.5 border border-dashed border-slate-200 rounded-lg bg-slate-50/20">
                <label className="label text-slate-600 font-semibold flex flex-wrap gap-1 items-center mb-1 text-xs">
                  <span>Tender Document (Optional)</span>
                  {hasExistingTender && (
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 text-[9px] font-medium">
                      Saved: {pr.documents?.find((d: any) => d.doc_key === 'tender_document')?.original_name}
                    </span>
                  )}
                </label>
                <input 
                  type="file" 
                  onChange={(e) => setTenderDoc(e.target.files?.[0] || null)} 
                  className="w-full text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer" 
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap gap-3 justify-between items-center border-b border-slate-100/50 pb-1">
              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bidding Vendor Registry</h5>
              <div className="flex items-center gap-2">
                {masterVendors.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      const selected = masterVendors.find(mv => mv.vendor_name === val);
                      if (selected) {
                        if (tenderVendors.some(v => v.name === selected.vendor_name)) {
                          toast.error('Vendor already added');
                          return;
                        }
                        const newVendors = [...tenderVendors];
                        if (newVendors.length === 1 && !newVendors[0].name && !newVendors[0].email) {
                          newVendors[0] = {
                            name: selected.vendor_name,
                            email: selected.email || '',
                            quoted_amount: '',
                            is_qualified: true,
                            remarks: ''
                          };
                        } else {
                          newVendors.push({
                            name: selected.vendor_name,
                            email: selected.email || '',
                            quoted_amount: '',
                            is_qualified: true,
                            remarks: ''
                          });
                        }
                        setTenderVendors(newVendors);
                      }
                    }}
                    className="text-[10px] py-0.5 px-1.5 border border-slate-300 rounded bg-white font-medium text-slate-700 outline-none focus:ring-1 focus:ring-[#1a3a6b]"
                  >
                    <option value="">-- Quick Add Vendor --</option>
                    {masterVendors.map(mv => (
                      <option key={mv.id} value={mv.vendor_name}>{mv.vendor_name}</option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTenderVendors([
                      ...tenderVendors,
                      { name: '', email: '', quoted_amount: '', is_qualified: true, remarks: '' }
                    ]);
                  }}
                  className="btn-secondary py-0.5 px-2 flex items-center gap-1 text-[10px] font-semibold border-slate-200 hover:border-slate-300"
                >
                  <Plus size={11} /> Add Row
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg bg-slate-50/30 p-0.5">
              <table className="min-w-[950px] divide-y divide-slate-100 text-xs" style={{ minWidth: '950px' }}>
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider">
                    <th className="px-2 py-1.5 text-left w-[22%]" style={{ minWidth: '220px' }}>Name *</th>
                    <th className="px-2 py-1.5 text-left w-[20%]" style={{ minWidth: '200px' }}>Email</th>
                    <th className="px-2 py-1.5 text-left w-[18%]" style={{ minWidth: '120px' }}>Quoted (L)</th>
                    <th className="px-2 py-1.5 text-left w-[15%]" style={{ minWidth: '140px' }}>Status</th>
                    <th className="px-2 py-1.5 text-left w-[20%]" style={{ minWidth: '220px' }}>Remarks</th>
                    <th className="px-2 py-1.5 text-center w-[5%]" style={{ minWidth: '50px' }}></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {tenderVendors.map((vendor, index) => (
                    <tr key={index} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-1.5 py-1">
                        <input
                          type="text"
                          list="master-vendors-datalist"
                          value={vendor.name}
                          onChange={(e) => {
                            const name = e.target.value;
                            const matched = masterVendors.find(mv => mv.vendor_name.toLowerCase() === name.toLowerCase());
                            setTenderVendors(tenderVendors.map((v, i) => i === index ? { 
                              ...v, 
                              name, 
                              email: matched ? matched.email || '' : v.email 
                            } : v));
                          }}
                          className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1.5 text-xs rounded transition-all placeholder:text-slate-300"
                          placeholder="e.g. Apple Inc."
                          required
                        />
                      </td>
                      <td className="px-1.5 py-1">
                        <input
                          type="email"
                          value={vendor.email}
                          onChange={(e) => {
                            setTenderVendors(tenderVendors.map((v, i) => i === index ? { ...v, email: e.target.value } : v));
                          }}
                          className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1.5 text-xs rounded transition-all placeholder:text-slate-300"
                          placeholder="email@example.com"
                        />
                      </td>
                      <td className="px-1.5 py-1">
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            value={vendor.quoted_amount}
                            onChange={(e) => {
                              setTenderVendors(tenderVendors.map((v, i) => i === index ? { ...v, quoted_amount: e.target.value } : v));
                            }}
                            className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 pl-4 pr-1 text-xs rounded transition-all placeholder:text-slate-300"
                            placeholder="0.00"
                          />
                          <span className="absolute left-1 top-1.5 text-[10px] text-slate-400 font-semibold">₹</span>
                        </div>
                      </td>
                      <td className="px-1.5 py-1">
                        <select
                          value={vendor.is_qualified ? 'qualified' : 'unqualified'}
                          onChange={(e) => {
                            setTenderVendors(tenderVendors.map((v, i) => i === index ? { ...v, is_qualified: e.target.value === 'qualified' } : v));
                          }}
                          className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1 text-xs rounded transition-all"
                        >
                          <option value="qualified">Qualified</option>
                          <option value="unqualified">Not Qualified</option>
                        </select>
                      </td>
                      <td className="px-1.5 py-1">
                        <input
                          type="text"
                          value={vendor.remarks}
                          onChange={(e) => {
                            setTenderVendors(tenderVendors.map((v, i) => i === index ? { ...v, remarks: e.target.value } : v));
                          }}
                          className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1.5 text-xs rounded transition-all placeholder:text-slate-300"
                          placeholder="Remarks"
                        />
                      </td>
                      <td className="px-1.5 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...tenderVendors];
                            updated.splice(index, 1);
                            setTenderVendors(updated);
                          }}
                          className="text-slate-400 hover:text-rose-600 transition-colors p-0.5"
                          title="Delete Row"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pr.flow?.tender_vendors_threshold !== null && pr.flow?.tender_vendors_threshold !== undefined && (() => {
            const vendorCount = tenderVendors.filter(v => v.name && v.name.trim() !== '').length;
            const threshold = pr.flow.tender_vendors_threshold;
            return renderTenderRoutingNotice(vendorCount, threshold, pr.flow.tender_vendors_comparison, 'sm');
          })()}

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <label className="label text-slate-700 font-bold text-xs">Remarks *</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Provide official remarks/justification to register and advance..."
              className="input-field min-h-[60px] text-xs py-1.5"
              required
            />
            
            <div className="flex flex-wrap gap-2.5 pt-1">
              <button 
                onClick={handleTenderSubmit} 
                disabled={actionLoading || !tenderRef || !tenderDate || tenderVendors.length === 0 || !remarks.trim()}
                className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs"
              >
                <CheckCircle2 size={14} /> Submit Tender Details &amp; Advance
              </button>

              <button 
                onClick={() => onReject(remarks)} 
                disabled={actionLoading || !remarks.trim()} 
                className="btn-danger flex items-center gap-1.5 text-xs py-2 px-4"
              >
                <XCircle size={14} /> Reject
              </button>

              {pr.flow && pr.flow.step_order > 1 && sendBackCandidates.length > 0 && (
                <button 
                  onClick={() => setShowSendBackModal(true)} 
                  disabled={actionLoading} 
                  className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition"
                >
                  <RotateCcw size={14} /> Send Back
                </button>
              )}
            </div>
          </div>
          
          <datalist id="master-vendors-datalist">
            {masterVendors.map(mv => (
              <option key={mv.id} value={mv.vendor_name}>{mv.email}</option>
            ))}
          </datalist>
        </div>
      )}

      {/* Superintendent / Consultant / General Review Form */}
      {(pr.flow?.step_order ?? 0) >= 3 && (
        <div className="space-y-4 bg-white p-4 border border-blue-200 rounded shadow-sm text-left">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Review Tender Details & Bidders</h4>
          
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded border border-slate-100 text-sm">
            <div>
              <span className="font-bold text-slate-500">Tender Reference Number:</span>
              <p className="font-semibold text-slate-800">{pr.tender_reference_number}</p>
            </div>
            <div>
              <span className="font-bold text-slate-500">Date of Tender:</span>
              <p className="font-semibold text-slate-800">{pr.date_of_tender ? pr.date_of_tender.substring(0, 10) : '-'}</p>
            </div>
            <div>
              <span className="font-bold text-slate-500">Tech Bid Opening Date:</span>
              <p className="font-semibold text-slate-800">{pr.date_of_tech_bid_opening ? pr.date_of_tech_bid_opening.substring(0, 10) : '-'}</p>
            </div>
            <div>
              <span className="font-bold text-slate-500">Financial Bid Opening Date:</span>
              <p className="font-semibold text-slate-800">{pr.date_of_financial_bid_opening ? pr.date_of_financial_bid_opening.substring(0, 10) : '-'}</p>
            </div>
            {pr.vendor_list_link && (
              <div className="col-span-2">
                <span className="font-bold text-slate-500">External Vendor List Document URL:</span>
                <p className="font-semibold text-slate-800">
                  <a href={pr.vendor_list_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                    {pr.vendor_list_link}
                  </a>
                </p>
              </div>
            )}
          </div>

          <div>
            <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Uploaded Documents</h5>
            <div className="space-y-2">
              {pr.documents && pr.documents.length > 0 ? (
                pr.documents.map((doc: any) => (
                  <div key={doc.id} className="flex items-center gap-2 text-sm bg-white p-2 border border-slate-100 rounded shadow-sm">
                    <span className="font-bold text-slate-600">
                      {getDocLabel(doc.doc_key)}:
                    </span>
                    <a href={doc.path} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 font-semibold">
                      {doc.original_name}
                    </a>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 italic">No documents uploaded.</p>
              )}
            </div>
          </div>

          <div>
            <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Vendor List</h5>
            <div className="overflow-x-auto border border-slate-200 rounded bg-slate-50/30 p-0.5">
              <table className="min-w-[780px] divide-y divide-slate-200 text-sm text-slate-700" style={{ minWidth: '780px' }}>
                <tbody className="bg-white divide-y divide-slate-200">
                  {pr.commercial_evaluations?.map((ce: any) => (
                    <tr key={ce.id}>
                      <td className="px-3 py-2 font-medium">{ce.vendor_name}</td>
                      <td className="px-3 py-2 text-slate-500">{ce.vendor_email || '-'}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">
                        {ce.quoted_amount !== null && ce.quoted_amount !== undefined ? `₹${(ce.quoted_amount / 100000).toFixed(2)} Lakhs` : '-'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${ce.is_qualified ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {ce.is_qualified ? 'Qualified' : 'Not Qualified'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500 italic">{ce.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <label className="label text-slate-700 font-bold text-xs">Review Remarks *</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Provide remarks to approve and advance this step..."
              className="input-field min-h-[60px] text-xs py-1.5"
              required
            />
            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                onClick={handleApproveForwardSuperintendent}
                disabled={actionLoading || !remarks.trim()}
                className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs"
              >
                <CheckCircle2 size={14} /> Approve &amp; Forward
              </button>

              <button 
                onClick={() => onReject(remarks)} 
                disabled={actionLoading || !remarks.trim()} 
                className="btn-danger flex items-center gap-1.5 text-xs py-2 px-4"
              >
                <XCircle size={14} /> Reject
              </button>

              {pr.flow && pr.flow.step_order > 1 && sendBackCandidates.length > 0 && (
                <button 
                  onClick={() => setShowSendBackModal(true)} 
                  disabled={actionLoading} 
                  className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition"
                >
                  <RotateCcw size={14} /> Send Back
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
