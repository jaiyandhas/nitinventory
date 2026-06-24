import React, { useState, useEffect } from 'react';
import {
  CheckCircle2, XCircle, RotateCcw, UserPlus, Plus, Trash2, ShieldAlert, AlertCircle, Save, History, FileEdit
} from 'lucide-react';
import { prApi } from '../../../services/api';
import { formatCurrency } from '../../../utils/format';
import { PurchaseRequest } from '../../../types';
import toast from 'react-hot-toast';

interface TenderingActionProps {
  pr: PurchaseRequest;
  user: any;
  refetch: () => void;
  actionLoading: boolean;
  setActionLoading: (loading: boolean) => void;
  hasPrevStep: boolean;
  isLastStep: boolean;
  onReject: (remarks: string) => Promise<void>;
  onSendBack: (remarks: string) => Promise<void>;
  showSendBackModal: boolean;
  setShowSendBackModal: (show: boolean) => void;
  remarks: string;
  setRemarks: (val: string) => void;
}

const getDocLabel = (docKey: string): string => {
  if (!docKey) return 'Document';
  if (docKey === 'draft_tender_document') return 'Draft Tender Document';
  if (docKey === 'tender_document') return 'Tender Document';
  if (docKey === 'amendment_document') return 'Amendment Document';
  if (docKey === 'quotation_file' || docKey === 'basis_of_estimation') return 'Basis of Estimation (Quotation)';

  let label = docKey;
  label = label.replace(/_/g, ' ');
  label = label.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  label = label.replace(/Tech Specs?/i, 'Technical Specifications');
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

interface AmendmentRecord {
  sl: number;
  field: string;
  previous: string;
  revised: string;
  reason: string;
  updated_by: string;
  updated_on: string;
}

interface BidderRow {
  name: string;
  bidder_id: string;
}

export const TenderingAction: React.FC<TenderingActionProps> = ({
  pr,
  user,
  refetch,
  actionLoading,
  setActionLoading,
  hasPrevStep,
  isLastStep,
  onReject,
  onSendBack,
  showSendBackModal,
  setShowSendBackModal,
  remarks,
  setRemarks
}) => {
  // DA assignment states
  const [daList, setDaList] = useState<any[]>([]);
  const [selectedDa, setSelectedDa] = useState<number | ''>('');
  const [masterVendors, setMasterVendors] = useState<any[]>([]);

  // Tender Details fields
  const [tenderRef, setTenderRef] = useState('');
  const [tenderDate, setTenderDate] = useState('');
  const [tenderClosingDate, setTenderClosingDate] = useState('');
  const [techOpenDate, setTechOpenDate] = useState('');
  const [extendedClosingDate, setExtendedClosingDate] = useState('');

  // Bidder registry
  const [tenderVendors, setTenderVendors] = useState<BidderRow[]>([{ name: '', bidder_id: '' }]);
  const [vendorListLink, setVendorListLink] = useState('');

  // Document uploads
  const [draftTenderDoc, setDraftTenderDoc] = useState<File | null>(null);
  const [tenderDoc, setTenderDoc] = useState<File | null>(null);
  const [amendmentDocs, setAmendmentDocs] = useState<File[]>([]);

  // Amendment tracking
  const [amendmentHistory, setAmendmentHistory] = useState<AmendmentRecord[]>([]);
  const [showAmendmentForm, setShowAmendmentForm] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [preEditValues, setPreEditValues] = useState<Record<string, string> | null>(null);

  // LPC states
  const [lpcCommitteeMembers, setLpcCommitteeMembers] = useState('');
  const [lpcMinutesReference, setLpcMinutesReference] = useState('');
  const [lpcRemarks, setLpcRemarks] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(!!pr.tender_reference_number);
  const [daTab, setDaTab] = useState<'draft' | 'vendors'>('draft');
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const phaseName = pr.flow?.phase_name;
  const hasExistingDraft = pr.documents?.some((d: any) => d.doc_key === 'draft_tender_document');
  const hasExistingTender = pr.documents?.some((d: any) => d.doc_key === 'tender_document');
  const isAfterBiddingRegistry = (pr.flow?.step_order ?? 0) >= 6;
  const isEditing = isSaved === false && preEditValues !== null;

  useEffect(() => {
    if (
      phaseName === 'Tendering' &&
      pr.flow?.step_order === 1 &&
      pr.flow?.expected_role_name === 'Superintendent'
    ) {
      prApi.getDealingAssistants().then(res => setDaList(res.data)).catch(() => {});
    }

    if (phaseName === 'Tendering') {
      prApi.getVendors().then(res => setMasterVendors(res.data)).catch(() => {});

      if (pr.tender_reference_number) {
        setTenderRef(pr.tender_reference_number);
        setIsSaved(true);
      }
      if (pr.date_of_tender) setTenderDate(pr.date_of_tender.substring(0, 10));
      if (pr.date_of_tech_bid_opening) setTechOpenDate(pr.date_of_tech_bid_opening.substring(0, 10));
      if (pr.date_of_financial_bid_opening) setTenderClosingDate(pr.date_of_financial_bid_opening.substring(0, 10));
      if ((pr as any).form_data?.extended_closing_date) setExtendedClosingDate((pr as any).form_data.extended_closing_date);
      if (pr.vendor_list_link) setVendorListLink(pr.vendor_list_link);

      const savedAmendments = (pr as any).form_data?.tender_amendment_history;
      if (Array.isArray(savedAmendments)) setAmendmentHistory(savedAmendments);

      if (pr.commercial_evaluations && pr.commercial_evaluations.length > 0) {
        setTenderVendors(pr.commercial_evaluations.map((ce: any) => ({
          name: ce.vendor_name,
          bidder_id: ce.vendor_email || '',
        })));
      } else {
        setTenderVendors([{ name: '', bidder_id: '' }]);
      }

      if (pr.lpc_remarks) setLpcRemarks(pr.lpc_remarks);
      if (pr.lpc_committee_members) setLpcCommitteeMembers(pr.lpc_committee_members);
      if (pr.lpc_minutes_reference) setLpcMinutesReference(pr.lpc_minutes_reference);

      if (pr.tender_scheduling_done) {
        setDaTab('vendors');
      } else {
        setDaTab('draft');
      }
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

  const handleTenderScheduleSubmit = async () => {
    if (!hasExistingDraft && !draftTenderDoc) {
      toast.error('Draft Tender Document is mandatory');
      return;
    }
    if (!remarks.trim()) { toast.error('Remarks are required to schedule tender and advance'); return; }
    if (!window.confirm('Are you sure you want to schedule this tender and advance?')) return;

    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append('payload', JSON.stringify({ remarks }));
      if (draftTenderDoc) formData.append('draft_tender_document', draftTenderDoc);

      await prApi.scheduleTender(pr.id, formData);
      toast.success('Tender scheduled. Advancing step...');
      await prApi.advance(pr.id, remarks);
      setRemarks('');
      setDraftTenderDoc(null);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const buildAmendments = (updatedHistory: AmendmentRecord[]): AmendmentRecord[] => {
    if (!preEditValues) return updatedHistory;
    const fieldLabels: Record<string, string> = {
      tenderRef: 'Tender Reference Number',
      tenderDate: 'Date of Tender',
      tenderClosingDate: 'Tender Closing Date',
      techOpenDate: 'Technical Bid Opening Date',
      extendedClosingDate: 'Extended Closing Date',
    };
    const currentValues: Record<string, string> = { tenderRef, tenderDate, tenderClosingDate, techOpenDate, extendedClosingDate };
    const newEntries: AmendmentRecord[] = [];
    for (const [key, label] of Object.entries(fieldLabels)) {
      if ((preEditValues[key] || '') !== (currentValues[key] || '')) {
        newEntries.push({
          sl: updatedHistory.length + newEntries.length + 1,
          field: label,
          previous: preEditValues[key] || '-',
          revised: currentValues[key] || '-',
          reason: amendmentReason,
          updated_by: user?.name || 'Dealing Assistant',
          updated_on: new Date().toLocaleString('en-IN'),
        });
      }
    }
    return [...updatedHistory, ...newEntries];
  };

  const buildPayload = (updatedHistory: AmendmentRecord[]) => {
    const isLimitedTender = pr.procurement?.name?.toLowerCase().includes('limited tender') || pr.procurement?.name?.toLowerCase().includes('lpc');
    return {
      tender_reference_number: tenderRef || null,
      date_of_tender: tenderDate || null,
      date_of_tech_bid_opening: techOpenDate || null,
      date_of_financial_bid_opening: tenderClosingDate || null,
      extended_closing_date: extendedClosingDate || null,
      vendor_list_link: vendorListLink || null,
      vendors: tenderVendors.map(v => ({
        name: v.name?.trim() ?? '',
        bidder_id: v.bidder_id?.trim() ?? '',
        quoted_amount: null,
        is_qualified: true,
      })),
      amendment_history: updatedHistory,
      lpc_remarks: isLimitedTender ? lpcRemarks : null,
      lpc_committee_members: isLimitedTender ? lpcCommitteeMembers : null,
      lpc_minutes_reference: isLimitedTender ? lpcMinutesReference : null,
    };
  };

  const handleTenderDraftSave = async () => {
    if (!window.confirm('Save the current tender details as draft?')) return;
    setIsSaving(true);
    try {
      const updatedHistory = buildAmendments(amendmentHistory);
      if (updatedHistory.length > amendmentHistory.length) {
        setAmendmentHistory(updatedHistory);
        setPreEditValues(null);
        setAmendmentReason('');
      }

      const payload = buildPayload(updatedHistory);
      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));
      if (draftTenderDoc) formData.append('draft_tender_document', draftTenderDoc);
      if (tenderDoc) formData.append('tender_document', tenderDoc);
      amendmentDocs.forEach(f => formData.append('amendment_document', f));

      await prApi.saveTenderDraft(pr.id, formData);
      toast.success('Tender details saved. You can continue later.');
      setIsSaved(true);
      setDraftTenderDoc(null);
      setTenderDoc(null);
      setAmendmentDocs([]);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTenderSubmitClick = () => {
    if (!tenderRef.trim()) { toast.error('Tender Reference Number is required'); return; }
    if (!tenderDate) { toast.error('Date of Tender is required'); return; }
    if (!tenderClosingDate) { toast.error('Tender Closing Date is required'); return; }
    if (!techOpenDate) { toast.error('Technical Bid Opening Date is required'); return; }

    const namedVendors = tenderVendors.filter(v => v.name && v.name.trim());
    if (namedVendors.length === 0) { toast.error('Please add at least one bidder'); return; }
    if (tenderVendors.some(v => !v.name || !v.name.trim())) {
      toast.error('Bidder name is required for all rows');
      return;
    }

    const isLimitedTender = pr.procurement?.name?.toLowerCase().includes('limited tender') || pr.procurement?.name?.toLowerCase().includes('lpc');
    if (isLimitedTender) {
      if (!lpcCommitteeMembers.trim()) { toast.error('Committee members are required for Limited Tender (LPC)'); return; }
      if (!lpcMinutesReference.trim()) { toast.error('Minutes reference is required for Limited Tender (LPC)'); return; }
      if (!lpcRemarks.trim()) { toast.error('LPC remarks are required for Limited Tender (LPC)'); return; }
    }

    if (!hasExistingTender && !tenderDoc) { toast.error('Tender Document is mandatory'); return; }
    if (!remarks.trim()) { toast.error('Official Remarks are required to register and advance'); return; }

    setShowSubmitModal(true);
  };

  const handleTenderSubmitConfirm = async () => {
    setShowSubmitModal(false);
    setActionLoading(true);
    try {
      const updatedHistory = buildAmendments(amendmentHistory);
      const payload = {
        ...buildPayload(updatedHistory),
        remarks
      };

      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));
      if (draftTenderDoc) formData.append('draft_tender_document', draftTenderDoc);
      if (tenderDoc) formData.append('tender_document', tenderDoc);
      amendmentDocs.forEach(f => formData.append('amendment_document', f));

      await prApi.addTenderDetails(pr.id, formData);
      toast.success('Tender details registered. Advancing step...');
      await prApi.advance(pr.id, remarks);
      setRemarks('');
      setDraftTenderDoc(null);
      setTenderDoc(null);
      setAmendmentDocs([]);
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

  const fieldReadOnly = isSaved && !isEditing;

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
            <span className="text-[10px] text-slate-400 font-normal">Tendering Phase — Stage-based Flow</span>
          </h4>

          {/* Tab Switcher */}
          <div className="flex border border-slate-200 rounded-lg overflow-hidden text-xs font-semibold">
            <button
              type="button"
              disabled={pr.tender_scheduling_done}
              onClick={() => setDaTab('draft')}
              className={`flex-1 py-2 px-3 transition-colors flex items-center justify-center gap-1.5 ${
                daTab === 'draft'
                  ? 'bg-[#1a3a6b] text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              } ${pr.tender_scheduling_done ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {pr.tender_scheduling_done && <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />}
              1. Tender Scheduling
            </button>
            <button
              type="button"
              disabled={!pr.tender_scheduling_done}
              onClick={() => setDaTab('vendors')}
              className={`flex-1 py-2 px-3 transition-colors border-l border-slate-200 flex items-center justify-center gap-1.5 ${
                daTab === 'vendors'
                  ? 'bg-[#1a3a6b] text-white'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              } ${!pr.tender_scheduling_done ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {!pr.tender_scheduling_done && <AlertCircle size={13} className="text-slate-400 shrink-0" />}
              2. Bidding Registry
            </button>
          </div>

          {/* Tab 1: Tender Scheduling */}
          {daTab === 'draft' && (
            <div className="space-y-4">
              <div className="space-y-2 pt-1">
                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100/50 pb-0.5">Draft Tender Document</h5>
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
                  <p className="text-[10px] text-slate-400 mt-1 italic">Upload the draft tender document for Superintendent review before proceeding to vendor registration.</p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="label text-slate-700 font-bold text-xs">Remarks *</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Provide official remarks/justification to schedule tender and advance..."
                  className="input-field min-h-[60px] text-xs py-1.5"
                  required
                />

                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button
                    onClick={handleTenderScheduleSubmit}
                    disabled={actionLoading || !remarks.trim()}
                    className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs"
                  >
                    <CheckCircle2 size={14} /> Submit Tender Schedule &amp; Advance
                  </button>

                  {isLastStep && (
                    <button
                      onClick={() => onReject(remarks)}
                      disabled={actionLoading || !remarks.trim()}
                      className="btn-danger flex items-center gap-1.5 text-xs py-2 px-4"
                    >
                      <XCircle size={14} /> Reject
                    </button>
                  )}

                  {hasPrevStep && (
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

          {/* Tab 2: Bidding Registry */}
          {daTab === 'vendors' && (
            <div className="space-y-4">

              {/* ─── A. Tender Details ─── */}
              <div className="border border-[#1a3a6b]/20 rounded-lg overflow-hidden">
                <div className="bg-[#1a3a6b] px-3 py-2 flex items-center justify-between">
                  <h5 className="text-[10px] font-bold text-white uppercase tracking-widest">A. Tender Details</h5>
                  {isSaved && !showAmendmentForm && !isEditing && (
                    <button
                      type="button"
                      onClick={() => setShowAmendmentForm(true)}
                      className="flex items-center gap-1 text-[10px] text-amber-300 hover:text-amber-200 font-semibold transition"
                    >
                      <FileEdit size={11} /> Need to Change?
                    </button>
                  )}
                  {isEditing && (
                    <span className="text-[10px] text-amber-300 font-semibold flex items-center gap-1">
                      <FileEdit size={11} /> Editing Mode
                    </span>
                  )}
                </div>

                <div className="p-3 bg-slate-50/40 space-y-3">
                  {/* Amendment request form */}
                  {showAmendmentForm && (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-2">
                      <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1">
                        <AlertCircle size={12} /> Tender Schedule Amendment — Reason Required
                      </p>
                      <p className="text-[11px] text-amber-700">Provide the reason for modifying tender dates. This will be recorded in the Amendment History.</p>
                      <textarea
                        value={amendmentReason}
                        onChange={e => setAmendmentReason(e.target.value)}
                        placeholder="Reason for amendment (e.g., Extension of closing date due to public holiday) *"
                        className="input-field text-xs min-h-[52px] bg-white border-amber-300 focus:border-amber-500"
                        required
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (!amendmentReason.trim()) { toast.error('Reason is mandatory for amendment'); return; }
                            setPreEditValues({ tenderRef, tenderDate, tenderClosingDate, techOpenDate, extendedClosingDate });
                            setIsSaved(false);
                            setShowAmendmentForm(false);
                          }}
                          className="btn-primary text-[11px] px-3 py-1.5 flex items-center gap-1"
                        >
                          <FileEdit size={12} /> Begin Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowAmendmentForm(false); setAmendmentReason(''); }}
                          className="btn-secondary text-[11px] px-3 py-1.5"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="label text-slate-600 font-semibold text-[11px]">Tender Reference Number *</label>
                      <input
                        type="text"
                        value={tenderRef}
                        onChange={(e) => setTenderRef(e.target.value)}
                        className={`input-field mt-1 py-1 text-xs ${fieldReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                        readOnly={fieldReadOnly}
                        placeholder="e.g. NITT/TENDER/2026/001"
                        required
                      />
                    </div>
                    <div>
                      <label className="label text-slate-600 font-semibold text-[11px]">Date of Tender *</label>
                      <input
                        type="date"
                        value={tenderDate}
                        onChange={(e) => setTenderDate(e.target.value)}
                        className={`input-field mt-1 py-1 text-xs ${fieldReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                        readOnly={fieldReadOnly}
                        required
                      />
                    </div>
                    <div>
                      <label className="label text-slate-600 font-semibold text-[11px]">Tender Closing Date *</label>
                      <input
                        type="date"
                        value={tenderClosingDate}
                        onChange={(e) => setTenderClosingDate(e.target.value)}
                        className={`input-field mt-1 py-1 text-xs ${fieldReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                        readOnly={fieldReadOnly}
                        required
                      />
                    </div>
                    <div>
                      <label className="label text-slate-600 font-semibold text-[11px]">Technical Bid Opening Date *</label>
                      <input
                        type="date"
                        value={techOpenDate}
                        onChange={(e) => setTechOpenDate(e.target.value)}
                        className={`input-field mt-1 py-1 text-xs ${fieldReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                        readOnly={fieldReadOnly}
                        required
                      />
                    </div>
                    <div>
                      <label className="label text-slate-600 font-semibold text-[11px]">Extended Closing Date <span className="font-normal text-slate-400">(If Any)</span></label>
                      <input
                        type="date"
                        value={extendedClosingDate}
                        onChange={(e) => setExtendedClosingDate(e.target.value)}
                        className={`input-field mt-1 py-1 text-xs ${fieldReadOnly ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                        readOnly={fieldReadOnly}
                      />
                    </div>
                  </div>

                  {/* Save / Edit controls */}
                  {!showAmendmentForm && (
                    <div className="flex justify-end items-center gap-2 pt-1">
                      <button
                        onClick={handleTenderDraftSave}
                        disabled={isSaved || isSaving || actionLoading}
                        className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition border disabled:opacity-60 disabled:cursor-not-allowed ${
                          isSaved
                            ? 'border-emerald-400 text-emerald-800 bg-emerald-100 cursor-default'
                            : 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                        }`}
                        title={isSaved ? 'Details saved' : 'Save progress without advancing the workflow'}
                      >
                        {isSaved ? <CheckCircle2 size={12} /> : <Save size={12} />}
                        {isSaving ? 'Saving…' : isSaved ? 'Saved ✓' : 'Save'}
                      </button>
                    </div>
                  )}

                  {/* Amendment History Table */}
                  {amendmentHistory.length > 0 && (
                    <div className="pt-3 border-t border-slate-200 space-y-2">
                      <h6 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <History size={11} /> Tender Schedule Amendment History
                      </h6>
                      <div className="border border-slate-200 rounded overflow-hidden">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wide">
                              <th className="px-2 py-1.5 text-center w-[4%]">Sl.</th>
                              <th className="px-2 py-1.5 text-left w-[18%]">Field Modified</th>
                              <th className="px-2 py-1.5 text-left w-[14%]">Previous Date</th>
                              <th className="px-2 py-1.5 text-left w-[14%]">Revised Date</th>
                              <th className="px-2 py-1.5 text-left w-[28%]">Reason / Remarks</th>
                              <th className="px-2 py-1.5 text-left w-[12%]">Updated By</th>
                              <th className="px-2 py-1.5 text-left w-[10%]">Updated On</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                            {amendmentHistory.map((h, i) => (
                              <tr key={i} className="hover:bg-slate-50/40">
                                <td className="px-2 py-1.5 text-center text-slate-500">{h.sl}</td>
                                <td className="px-2 py-1.5 font-semibold text-slate-700">{h.field}</td>
                                <td className="px-2 py-1.5 text-slate-500">{h.previous}</td>
                                <td className="px-2 py-1.5 font-semibold text-[#1a3a6b]">{h.revised}</td>
                                <td className="px-2 py-1.5 text-slate-600 italic">{h.reason}</td>
                                <td className="px-2 py-1.5 text-slate-600">{h.updated_by}</td>
                                <td className="px-2 py-1.5 text-slate-500">{h.updated_on}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bid Document URL */}
              <div className="space-y-2">
                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100/50 pb-0.5">Bid Document URL</h5>
                <input
                  type="url"
                  value={vendorListLink}
                  onChange={(e) => setVendorListLink(e.target.value)}
                  className="input-field py-1.5 text-xs"
                  placeholder="https://drive.google.com/..."
                />
              </div>

              {/* LPC Section */}
              {(pr.procurement?.name?.toLowerCase().includes('limited tender') || pr.procurement?.name?.toLowerCase().includes('lpc')) && (
                <div className="space-y-2 pt-2 border-t border-slate-100 animate-fadeIn">
                  <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100/50 pb-0.5">Limited Purchase Committee Approval</h5>

                  <div className="flex items-start gap-2.5 bg-amber-50/80 border border-amber-200 rounded-lg p-3 text-xs text-amber-950 shadow-xs my-2">
                    <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <h5 className="font-bold text-[10px] uppercase tracking-wide text-amber-800 mb-0.5">Local Purchase Committee (LPC) - GFR 155 Disclaimer</h5>
                      <p className="text-[11px] leading-relaxed text-amber-700 italic">"The department proposed to procure the above item(s) through Local Purchase Committee (LPC) as per GFR 155. It will be ensured that the indented item(s) are not available in GeM portal before processing the LPC. Further, the committee shall survey the market and record the certificate as per GFR 155 before placing the PO."</p>
                    </div>
                  </div>

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

              {/* ─── B. Bidder Registry ─── */}
              <div className="border border-[#1a3a6b]/20 rounded-lg overflow-hidden">
                <div className="bg-[#1a3a6b] px-3 py-2 flex items-center justify-between">
                  <h5 className="text-[10px] font-bold text-white uppercase tracking-widest">B. Bidder Registry</h5>
                  <button
                    type="button"
                    onClick={() => setTenderVendors([...tenderVendors, { name: '', bidder_id: '' }])}
                    className="flex items-center gap-1 text-[10px] text-white/80 hover:text-white font-semibold transition"
                  >
                    <Plus size={11} /> Add Row
                  </button>
                </div>

                <div className="border border-slate-200 bg-slate-50/30 p-0.5">
                  <table className="w-full divide-y divide-slate-100 text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="px-2 py-1.5 text-left w-[50%]">Bidder Name *</th>
                        <th className="px-2 py-1.5 text-left w-[45%]">Bidder ID *</th>
                        <th className="px-2 py-1.5 text-center w-[5%]"></th>
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
                                setTenderVendors(tenderVendors.map((v, i) => i === index ? { ...v, name } : v));
                              }}
                              className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1.5 text-xs rounded transition-all placeholder:text-slate-300"
                              placeholder="e.g. ABC Technologies Pvt. Ltd."
                              required
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <input
                              type="text"
                              value={vendor.bidder_id}
                              onChange={(e) => {
                                setTenderVendors(tenderVendors.map((v, i) => i === index ? { ...v, bidder_id: e.target.value } : v));
                              }}
                              className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1.5 text-xs rounded transition-all placeholder:text-slate-300"
                              placeholder="e.g. GSTIN / Vendor Code"
                            />
                          </td>
                          <td className="px-1.5 py-1 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...tenderVendors];
                                updated.splice(index, 1);
                                setTenderVendors(updated.length ? updated : [{ name: '', bidder_id: '' }]);
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

              {/* Tender Routing Notice */}
              {pr.flow?.tender_vendors_threshold !== null && pr.flow?.tender_vendors_threshold !== undefined && (() => {
                const vendorCount = tenderVendors.filter(v => v.name && v.name.trim() !== '').length;
                const threshold = pr.flow.tender_vendors_threshold;
                return renderTenderRoutingNotice(vendorCount, threshold, pr.flow.tender_vendors_comparison, 'sm');
              })()}

              {/* ─── C. Documents ─── */}
              <div className="border border-[#1a3a6b]/20 rounded-lg overflow-hidden">
                <div className="bg-[#1a3a6b] px-3 py-2">
                  <h5 className="text-[10px] font-bold text-white uppercase tracking-widest">C. Documents</h5>
                </div>
                <div className="p-3 space-y-3 bg-slate-50/40">
                  {/* Tender Document (Mandatory) */}
                  <div className="p-2.5 border border-dashed border-slate-300 rounded-lg bg-white">
                    <label className="label text-slate-700 font-semibold flex flex-wrap gap-1 items-center mb-1 text-xs">
                      <span>Tender Document *</span>
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
                      required={!hasExistingTender}
                    />
                    {!hasExistingTender && (
                      <p className="text-[10px] text-rose-500 mt-1 font-medium">Mandatory: Upload the final signed tender document before submission.</p>
                    )}
                  </div>

                  {/* Amendment Documents */}
                  <div className="p-2.5 border border-dashed border-slate-200 rounded-lg bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="label text-slate-600 font-semibold flex items-center gap-1 text-xs">
                        Amendment Documents <span className="font-normal text-slate-400">(If Any)</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700 transition">
                        <Plus size={11} /> Add File(s)
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const incoming = Array.from(e.target.files || []);
                            setAmendmentDocs(prev => [...prev, ...incoming]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                    <p className="text-[10px] text-slate-400 italic">Corrigendum, extension notices, clarification documents, or revised specifications.</p>

                    {/* Saved files from server */}
                    {pr.documents?.filter((d: any) => d.doc_key === 'amendment_document').map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between text-[10px] bg-slate-50 border border-slate-200 rounded px-2 py-1">
                        <a href={d.path} target="_blank" rel="noopener noreferrer" className="text-slate-700 hover:underline truncate max-w-[85%]">{d.original_name}</a>
                      </div>
                    ))}

                    {/* Newly selected files */}
                    {amendmentDocs.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px] bg-slate-50 border border-slate-200 rounded px-2 py-1">
                        <span className="text-slate-700 truncate max-w-[85%]">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setAmendmentDocs(amendmentDocs.filter((_, idx) => idx !== i))}
                          className="text-slate-400 hover:text-rose-500 ml-1 shrink-0"
                          title="Remove"
                        >
                          <XCircle size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ─── D. Official Remarks & Actions ─── */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="label text-slate-700 font-bold text-xs">D. Official Remarks *</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Provide official remarks/justification to register and advance the tender details..."
                  className="input-field min-h-[60px] text-xs py-1.5"
                  required
                />

                <div className="flex flex-wrap gap-2.5 pt-1">
                  <button
                    onClick={handleTenderSubmitClick}
                    disabled={actionLoading || isSaving || !tenderRef || !tenderDate || !tenderClosingDate || tenderVendors.filter(v => v.name?.trim()).length === 0 || !remarks.trim()}
                    className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs"
                  >
                    <CheckCircle2 size={14} /> Submit Tender Details &amp; Advance
                  </button>

                  {isLastStep && (
                    <button
                      onClick={() => onReject(remarks)}
                      disabled={actionLoading || isSaving || !remarks.trim()}
                      className="btn-danger flex items-center gap-1.5 text-xs py-2 px-4"
                    >
                      <XCircle size={14} /> Reject
                    </button>
                  )}

                  {hasPrevStep && (
                    <button
                      onClick={() => setShowSendBackModal(true)}
                      disabled={actionLoading || isSaving}
                      className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition"
                    >
                      <RotateCcw size={14} /> Send Back
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <datalist id="master-vendors-datalist">
            {masterVendors.map(mv => (
              <option key={mv.id} value={mv.vendor_name}>{mv.vendor_name}</option>
            ))}
          </datalist>
        </div>
      )}

      {/* ── Submission Confirmation Modal ── */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-300">

            {/* Letterhead */}
            <div className="bg-[#1a3a6b] text-white px-6 py-4 rounded-t-lg shrink-0">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/60 text-center">National Institute of Technology Tiruchirappalli</p>
              <h2 className="text-xs font-bold uppercase tracking-widest text-center mt-0.5">Tender Details — Submission Preview</h2>
              <p className="text-[10px] text-white/60 text-center mt-0.5">Purchase Indent ID: {pr.id} &nbsp;|&nbsp; {pr.procurement?.name}</p>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 p-5 space-y-3 text-xs text-slate-800">

              {/* A. Tender Details */}
              <div className="border border-slate-300 rounded overflow-hidden">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#1a3a6b]">A. Tender Details</h3>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-3">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tender Reference Number</p>
                    <p className="font-bold text-slate-800">{tenderRef}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Date of Tender</p>
                    <p className="font-semibold">{tenderDate ? new Date(tenderDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Tender Closing Date</p>
                    <p className="font-semibold">{tenderClosingDate ? new Date(tenderClosingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Technical Bid Opening Date</p>
                    <p className="font-semibold">{techOpenDate ? new Date(techOpenDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</p>
                  </div>
                  {extendedClosingDate && (
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Extended Closing Date</p>
                      <p className="font-semibold">{new Date(extendedClosingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </div>
                  )}
                  {vendorListLink && (
                    <div className="col-span-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Bid Document URL</p>
                      <a href={vendorListLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{vendorListLink}</a>
                    </div>
                  )}
                </div>
              </div>

              {/* B. Bidder Registry */}
              <div className="border border-slate-300 rounded overflow-hidden">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#1a3a6b]">B. Bidder Registry</h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 w-10">Sl.</th>
                      <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-wider text-slate-500">Bidder Name</th>
                      <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-wider text-slate-500">Bidder ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tenderVendors.filter(v => v.name?.trim()).map((v, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800">{v.name}</td>
                        <td className="px-3 py-2 text-slate-600">{v.bidder_id || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* C. Documents */}
              <div className="border border-slate-300 rounded overflow-hidden">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#1a3a6b]">C. Documents</h3>
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex gap-3">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 w-36 shrink-0 pt-0.5">Tender Document</span>
                    <span className="font-semibold text-slate-800">
                      {tenderDoc ? tenderDoc.name : pr.documents?.find((d: any) => d.doc_key === 'tender_document')?.original_name || '—'}
                    </span>
                  </div>
                  {(() => {
                    const saved = pr.documents?.filter((d: any) => d.doc_key === 'amendment_document') ?? [];
                    const allAmend = [...saved.map((d: any) => d.original_name), ...amendmentDocs.map(f => f.name)];
                    return allAmend.length > 0 ? (
                      <div className="flex gap-3">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 w-36 shrink-0 pt-0.5">Amendment Docs</span>
                        <div className="space-y-0.5">
                          {allAmend.map((name, i) => (
                            <p key={i} className="font-semibold text-slate-800">{name}</p>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* D. LPC (if applicable) */}
              {(pr.procurement?.name?.toLowerCase().includes('limited tender') || pr.procurement?.name?.toLowerCase().includes('lpc')) && lpcCommitteeMembers && (
                <div className="border border-slate-300 rounded overflow-hidden">
                  <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#1a3a6b]">D. LPC Details</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-3">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Committee Members</p>
                      <p className="font-semibold text-slate-800">{lpcCommitteeMembers}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Minutes Reference</p>
                      <p className="font-semibold text-slate-800">{lpcMinutesReference}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">LPC Remarks</p>
                      <p className="font-semibold text-slate-800">{lpcRemarks}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* E. Official Remarks */}
              <div className="border border-slate-300 rounded overflow-hidden">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#1a3a6b]">
                    {(pr.procurement?.name?.toLowerCase().includes('limited tender') || pr.procurement?.name?.toLowerCase().includes('lpc')) ? 'E.' : 'D.'} Official Remarks
                  </h3>
                </div>
                <div className="p-3">
                  <p className="italic text-slate-700 leading-relaxed">"{remarks}"</p>
                </div>
              </div>

              {/* Declaration */}
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-[10px] text-amber-800 leading-relaxed">
                I hereby declare that the above information is correct and complete to the best of my knowledge. By confirming, these tender details will be registered and the purchase indent will be advanced to the next approval stage.
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-lg shrink-0">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="btn-secondary px-5 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleTenderSubmitConfirm}
                disabled={actionLoading}
                className="btn-primary px-5 py-2 text-xs font-semibold flex items-center gap-1.5"
              >
                <CheckCircle2 size={13} /> Confirm &amp; Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Superintendent / Consultant / General Review Form */}
      {pr.flow?.expected_role_name !== 'Dealing Assistant' && (pr.flow?.step_order ?? 0) >= 3 && (
        <div className="space-y-4 bg-white p-4 border border-blue-200 rounded shadow-sm text-left">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            {isAfterBiddingRegistry ? "Review Tender Details & Bidders" : "Review Scheduled Tender"}
          </h4>

          {isAfterBiddingRegistry && (
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded border border-slate-100 text-sm">
              <div>
                <span className="font-bold text-slate-500 text-xs">Tender Reference Number:</span>
                <p className="font-semibold text-slate-800">{pr.tender_reference_number}</p>
              </div>
              <div>
                <span className="font-bold text-slate-500 text-xs">Date of Tender:</span>
                <p className="font-semibold text-slate-800">{pr.date_of_tender ? pr.date_of_tender.substring(0, 10) : '-'}</p>
              </div>
              <div>
                <span className="font-bold text-slate-500 text-xs">Tender Closing Date:</span>
                <p className="font-semibold text-slate-800">{pr.date_of_financial_bid_opening ? pr.date_of_financial_bid_opening.substring(0, 10) : '-'}</p>
              </div>
              <div>
                <span className="font-bold text-slate-500 text-xs">Technical Bid Opening Date:</span>
                <p className="font-semibold text-slate-800">{pr.date_of_tech_bid_opening ? pr.date_of_tech_bid_opening.substring(0, 10) : '-'}</p>
              </div>
              {(pr as any).form_data?.extended_closing_date && (
                <div>
                  <span className="font-bold text-slate-500 text-xs">Extended Closing Date:</span>
                  <p className="font-semibold text-slate-800">{(pr as any).form_data.extended_closing_date}</p>
                </div>
              )}
              {pr.vendor_list_link && (
                <div className="col-span-2">
                  <span className="font-bold text-slate-500 text-xs">Bid Document URL:</span>
                  <p className="font-semibold text-slate-800">
                    <a href={pr.vendor_list_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                      {pr.vendor_list_link}
                    </a>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Amendment History (read-only for reviewers) */}
          {isAfterBiddingRegistry && Array.isArray((pr as any).form_data?.tender_amendment_history) && (pr as any).form_data.tender_amendment_history.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <History size={12} /> Tender Schedule Amendment History
              </h5>
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wide">
                      <th className="px-2 py-1.5 text-center w-[4%]">Sl.</th>
                      <th className="px-2 py-1.5 text-left w-[18%]">Field Modified</th>
                      <th className="px-2 py-1.5 text-left w-[14%]">Previous Date</th>
                      <th className="px-2 py-1.5 text-left w-[14%]">Revised Date</th>
                      <th className="px-2 py-1.5 text-left w-[28%]">Reason / Remarks</th>
                      <th className="px-2 py-1.5 text-left w-[12%]">Updated By</th>
                      <th className="px-2 py-1.5 text-left w-[10%]">Updated On</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {(pr as any).form_data.tender_amendment_history.map((h: AmendmentRecord, i: number) => (
                      <tr key={i} className="hover:bg-slate-50/40">
                        <td className="px-2 py-1.5 text-center text-slate-500">{h.sl}</td>
                        <td className="px-2 py-1.5 font-semibold text-slate-700">{h.field}</td>
                        <td className="px-2 py-1.5 text-slate-500">{h.previous}</td>
                        <td className="px-2 py-1.5 font-semibold text-[#1a3a6b]">{h.revised}</td>
                        <td className="px-2 py-1.5 text-slate-600 italic">{h.reason}</td>
                        <td className="px-2 py-1.5 text-slate-600">{h.updated_by}</td>
                        <td className="px-2 py-1.5 text-slate-500">{h.updated_on}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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

          {isAfterBiddingRegistry && (
            <div>
              <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Bidder List</h5>
              <div className="border border-slate-200 rounded bg-slate-50/30 p-0.5">
                <table className="w-full divide-y divide-slate-200 text-sm text-slate-700">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-xs">
                      <th className="px-3 py-1.5 text-left w-[50%]">Bidder Name</th>
                      <th className="px-3 py-1.5 text-left w-[50%]">Bidder ID</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {pr.commercial_evaluations?.map((ce: any) => (
                      <tr key={ce.id} className="hover:bg-slate-50/40 transition-colors">
                        <td className="px-3 py-2 font-medium">{ce.vendor_name}</td>
                        <td className="px-3 py-2 text-slate-500">{ce.vendor_email || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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

              {isLastStep && (
                <button
                  onClick={() => onReject(remarks)}
                  disabled={actionLoading || !remarks.trim()}
                  className="btn-danger flex items-center gap-1.5 text-xs py-2 px-4"
                >
                  <XCircle size={14} /> Reject
                </button>
              )}

              {hasPrevStep && (
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
