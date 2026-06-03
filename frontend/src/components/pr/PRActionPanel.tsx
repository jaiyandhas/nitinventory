import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, XCircle, RotateCcw, UserPlus, FileText, Check, Plus, Trash2, Clock, Users, ShieldAlert
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { prApi, budgetApi } from '../../services/api';
import { PurchaseRequest } from '../../types';
import toast from 'react-hot-toast';

interface PRActionPanelProps {
  pr: PurchaseRequest;
  user: any;
  refetch: () => void;
  faculties: any[];
}

const getDocLabel = (docKey: string): string => {
  if (!docKey) return 'Document';
  if (docKey === 'draft_tender_document') return 'Draft Tender Document';
  if (docKey === 'tender_document') return 'Final Tender Document';
  if (docKey === 'quotation_file' || docKey === 'basis_of_estimation') return 'Basis of Estimation (Quotation)';
  if (docKey.startsWith('tech_eval_doc_')) return 'Technical Evaluation Report';
  
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

export const PRActionPanel: React.FC<PRActionPanelProps> = ({ pr, user, refetch, faculties }) => {
  const [remarks, setRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [faculty1Id, setFaculty1Id] = useState<number | ''>('');
  const [faculty2Id, setFaculty2Id] = useState<number | ''>('');
  const [faculty3Id, setFaculty3Id] = useState<number | ''>('');

  // Referral states
  const [selectedReferralUser, setSelectedReferralUser] = useState<number | ''>('');
  const [referralQuery, setReferralQuery] = useState('');
  const [responseRemarks, setResponseRemarks] = useState('');
  const [responsePdf, setResponsePdf] = useState<File | null>(null);

  // Fetch all users for consultation
  const { data: allUsers = [] } = useQuery({
    queryKey: ['all_users_for_consultation'],
    queryFn: () => budgetApi.allUsers().then((res: any) => res.data),
    enabled: !!user,
  });

  const activeReferral = pr.referrals?.find((r: any) => r.status === 'pending');
  const isReferralForMe = activeReferral && activeReferral.referred_to?.id === user?.id;
  const isReferralFromMe = activeReferral && activeReferral.referred_by?.id === user?.id;
  const isReferralActive = !!activeReferral;

  const handleReferPr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReferralUser) {
      toast.error('Please select a user to refer to');
      return;
    }
    if (!referralQuery.trim()) {
      toast.error('Please enter the consultation query');
      return;
    }
    setActionLoading(true);
    try {
      await prApi.referPr(pr.id, {
        referred_to_id: Number(selectedReferralUser),
        query: referralQuery.trim(),
      });
      toast.success('Purchase request referred successfully');
      setSelectedReferralUser('');
      setReferralQuery('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to refer purchase request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRespondReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!responseRemarks.trim()) {
      toast.error('Response remarks are required');
      return;
    }
    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append('payload', JSON.stringify({ response: responseRemarks.trim() }));
      if (responsePdf) {
        formData.append('response_document', responsePdf);
      }
      await prApi.respondReferral(pr.id, formData);
      toast.success('Opinion report submitted successfully');
      setResponseRemarks('');
      setResponsePdf(null);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to submit response');
    } finally {
      setActionLoading(false);
    }
  };

  // Send back states
  const [showSendBackModal, setShowSendBackModal] = useState(false);
  const [sendBackCandidates, setSendBackCandidates] = useState<any[]>([]);
  const [selectedSendBackStep, setSelectedSendBackStep] = useState<number | ''>('');

  // DA assignment states
  const [daList, setDaList] = useState<any[]>([]);
  const [selectedDa, setSelectedDa] = useState<number | ''>('');

  // Vendor master states
  const [masterVendors, setMasterVendors] = useState<any[]>([]);
  const [selectedMasterVendor, setSelectedMasterVendor] = useState<string>('');
  const [customVendorName, setCustomVendorName] = useState<string>('');

  // Tender form states
  const [tenderRef, setTenderRef] = useState('');
  const [tenderDate, setTenderDate] = useState('');
  const [techOpenDate, setTechOpenDate] = useState('');
  const [finOpenDate, setFinOpenDate] = useState('');
  const [tenderVendors, setTenderVendors] = useState<any[]>([]);
  const [vendorListLink, setVendorListLink] = useState('');
  const [draftTenderDoc, setDraftTenderDoc] = useState<File | null>(null);
  const [tenderDoc, setTenderDoc] = useState<File | null>(null);

  // Cancellation and Re-initiation states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelType, setCancelType] = useState<'tender' | 'po' | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [reinitiationMethod, setReinitiationMethod] = useState('none');
  const [reallocatedAmount, setReallocatedAmount] = useState('0');

  const isAuthorizedToCancel = user?.id === pr.initiator_id || user?.id === pr.hod_id || user?.role?.group_key === 'admin';

  const handleConfirmCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error('Cancellation reason is required.');
      return;
    }
    setActionLoading(true);
    try {
      if (cancelType === 'po') {
        await prApi.cancelPo(pr.id, cancelReason, reinitiationMethod, Number(reallocatedAmount));
        toast.success('Purchase Order cancelled successfully!');
      } else {
        await prApi.cancelTender(pr.id, cancelReason, reinitiationMethod);
        toast.success('Tender process cancelled successfully!');
      }
      setShowCancelModal(false);
      setCancelReason('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to cancel request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReinitiate = async () => {
    if (!window.confirm('Are you sure you want to re-initiate this purchase request? This will clone all items and start a new approval process.')) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await prApi.reinitiatePr(pr.id);
      toast.success('Purchase request re-initiated successfully!');
      window.location.href = `/pr/${res.data.id}`;
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to re-initiate request');
    } finally {
      setActionLoading(false);
    }
  };

  // Technical Evaluation states
  const [techQualifications, setTechQualifications] = useState<Record<string, { is_qualified: boolean; remarks: string }>>({});
  const [selectedAwardedVendorId, setSelectedAwardedVendorId] = useState<string>('');
  const [techEvalPdf, setTechEvalPdf] = useState<File | null>(null);

  // Financial Sanction states
  const [finBids, setFinBids] = useState<Record<string, {
    quoted_amount: string;
    remarks: string;
    unit_price?: string;
    taxes?: string;
    delivery_period?: string;
    warranty?: string;
  }>>({});

  // LPC states
  const [lpcCommitteeMembers, setLpcCommitteeMembers] = useState('');
  const [lpcMinutesReference, setLpcMinutesReference] = useState('');
  const [lpcRemarks, setLpcRemarks] = useState('');

  // Single bid state
  const [singleBidJustification, setSingleBidJustification] = useState('');

  // Bill passing states
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [challanNo, setChallanNo] = useState('');
  const [challanDate, setChallanDate] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [gstAmount, setGstAmount] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [bpRemarks, setBpRemarks] = useState('');

  const since = pr.te_initiated_at ? new Date(pr.te_initiated_at) : null;
  const hasUserSigned = pr.history?.some((h: any) => 
    h.approver_id === user?.id && 
    (h.status === 'Technical Evaluation Completed' || h.status === 'Technical Evaluation Approved') &&
    (!since || !h.acted_at || new Date(h.acted_at) >= since)
  );

  // Derive if the current user is a committee member for TE phase (including HOD)
  const isCommitteeMember = [
    pr.hod_id,
    pr.initiator_id,
    pr.faculty1_id,
    pr.faculty2_id,
    pr.faculty3_id,
  ].filter(Boolean).includes(user?.id);

  // Key for the user's own uploaded tech eval document
  const userTechEvalDocKey = `tech_eval_doc_${user?.id}`;
  const userTechEvalDoc = pr.documents?.find((d: any) => d.doc_key === userTechEvalDocKey);

  useEffect(() => {
    if (!pr) return;

    if (pr.faculty1_id) setFaculty1Id(pr.faculty1_id);
    if (pr.faculty2_id) setFaculty2Id(pr.faculty2_id);
    if (pr.faculty3_id) setFaculty3Id(pr.faculty3_id);

    const phaseName = pr.flow?.phase_name;

    if (
      phaseName === 'Tendering' &&
      pr.flow?.step_order === 1 &&
      pr.flow?.expected_role_name === 'Superintendent'
    ) {
      prApi.getDealingAssistants().then(res => setDaList(res.data)).catch(() => {});
    }

    if (pr.flow && pr.flow.step_order > 1) {
      prApi.getSendBackCandidates(pr.id).then(res => {
        setSendBackCandidates(res.data);
        if (res.data.length > 0) {
          setSelectedSendBackStep(res.data[res.data.length - 1].step_order);
        }
      }).catch(() => {});
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
          quoted_amount: ce.quoted_amount ? String(ce.quoted_amount) : '',
          is_qualified: ce.is_qualified !== false,
          remarks: ce.remarks || ''
        }));
        setTenderVendors(initialTenders);
      } else {
        setTenderVendors([{ name: '', email: '', quoted_amount: '', is_qualified: true, remarks: '' }]);
      }
    }

    if (phaseName === 'Technical Evaluation' && pr.commercial_evaluations) {
      const initialQuals: Record<string, { is_qualified: boolean; remarks: string }> = {};
      pr.commercial_evaluations.forEach(ce => {
        const existingTe = pr.technical_evaluations?.find(t => t.vendor_name === ce.vendor_name);
        initialQuals[ce.vendor_name] = { 
          is_qualified: existingTe ? existingTe.is_qualified : true, 
          remarks: existingTe ? existingTe.remarks || '' : '' 
        };
      });
      setTechQualifications(initialQuals);
      
      const awarded = pr.financial_evaluations?.find(f => f.is_awarded);
      if (awarded) {
        setSelectedAwardedVendorId(String(awarded.id));
      }
    }

    if (phaseName === 'Financial Sanction' && pr.technical_evaluations) {
      const initialBids: Record<string, {
        quoted_amount: string;
        remarks: string;
        unit_price?: string;
        taxes?: string;
        delivery_period?: string;
        warranty?: string;
      }> = {};
      pr.technical_evaluations.forEach(te => {
        if (te.is_qualified) {
          const existingFe = pr.financial_evaluations?.find(f => f.vendor_name === te.vendor_name);
          initialBids[te.vendor_name] = { 
            quoted_amount: existingFe ? String(existingFe.quoted_amount) : '', 
            remarks: existingFe ? existingFe.remarks || '' : '',
            unit_price: existingFe && existingFe.unit_price !== null ? String(existingFe.unit_price) : '',
            taxes: existingFe && existingFe.taxes !== undefined ? String(existingFe.taxes) : '0',
            delivery_period: existingFe && existingFe.delivery_period !== null ? String(existingFe.delivery_period) : '',
            warranty: existingFe && existingFe.warranty !== null ? String(existingFe.warranty) : '',
          };
        }
      });
      setFinBids(initialBids);
      if (pr.single_bid_justification) {
        setSingleBidJustification(pr.single_bid_justification);
      }
    }

    if (phaseName === 'Tendering') {
      if (pr.lpc_remarks) setLpcRemarks(pr.lpc_remarks);
      if (pr.lpc_committee_members) setLpcCommitteeMembers(pr.lpc_committee_members);
      if (pr.lpc_minutes_reference) setLpcMinutesReference(pr.lpc_minutes_reference);
    }

    const verifiedDelivery = pr.deliveries?.find((d: any) => d.status === 'verified');
    if (pr.current_status === 'po_issued' && verifiedDelivery) {
      setInvoiceNo(verifiedDelivery.invoice_number || '');
      setChallanNo(verifiedDelivery.challan_number || '');
      if (verifiedDelivery.received_date) {
        setInvoiceDate(verifiedDelivery.received_date.substring(0, 10));
        setChallanDate(verifiedDelivery.received_date.substring(0, 10));
      } else {
        const todayStr = new Date().toISOString().substring(0, 10);
        setInvoiceDate(todayStr);
        setChallanDate(todayStr);
      }
      const totalCost = verifiedDelivery.items?.reduce((sum: number, item: any) => sum + (item.unit_price * item.challan_quantity), 0);
      const prefilledBillAmount = totalCost ? totalCost / 100000 : 0;
      setBillAmount(prefilledBillAmount ? String(prefilledBillAmount.toFixed(2)) : '');
      if (pr.bill_passing) {
        setInvoiceNo(pr.bill_passing.invoice_number || '');
        setChallanNo(pr.bill_passing.challan_number || '');
        if (pr.bill_passing.invoice_date) setInvoiceDate(pr.bill_passing.invoice_date.substring(0, 10));
        if (pr.bill_passing.challan_date) setChallanDate(pr.bill_passing.challan_date.substring(0, 10));
        setBillAmount(String(pr.bill_passing.bill_amount));
        setGstAmount(String(pr.bill_passing.gst_amount || ''));
        setPaymentTerms(pr.bill_passing.payment_terms || '');
        setBpRemarks(pr.bill_passing.remarks || '');
      }
    }
  }, [pr]);
  const phaseName = pr.flow?.phase_name;
  const hasExistingDraft = pr.documents?.some((d: any) => d.doc_key === 'draft_tender_document');
  const hasExistingTender = pr.documents?.some((d: any) => d.doc_key === 'tender_document');

  const hasCustomForm = 
    (phaseName === 'Tendering' && pr.flow?.expected_role_name === 'Dealing Assistant') ||
    (phaseName === 'Tendering' && pr.flow?.expected_role_name === 'Superintendent' && pr.flow?.step_order === 3) ||
    (phaseName === 'Technical Evaluation' && pr.flow?.step_order === 1 && isCommitteeMember && !hasUserSigned) ||
    (phaseName === 'Financial Sanction' && pr.flow?.expected_group === 'faculty');
  const handleAdvance = async () => {
    if (phaseName === 'Purchase Order' && !user?.signature_path) {
      toast.error('You must upload a digital signature in your Profile to approve Purchase Order steps.');
      return;
    }
    if (!remarks.trim()) { toast.error('Remarks are required to advance the PR'); return; }
    if (!window.confirm('Are you sure you want to approve and advance this purchase request?')) return;

    let f1: number | undefined = undefined;
    let f2: number | undefined = undefined;
    let f3: number | undefined = undefined;

    setActionLoading(true);
    try {
      await prApi.advance(pr.id, remarks, undefined, f1, f2, f3);
      toast.success('PR advanced successfully');
      setRemarks('');
      refetch();
    } catch (e: any) {
      const detail = e.response?.data?.detail || 'Action failed';
      toast.error(detail);
    }
    setActionLoading(false);
  };

  const handleReject = async () => {
    if (!remarks.trim()) { toast.error('Rejection remarks are required'); return; }
    setActionLoading(true);
    try {
      await prApi.reject(pr.id, remarks);
      toast.success('PR rejected');
      setRemarks('');
      refetch();
    } catch (e: any) {
      const detail = e.response?.data?.detail || 'Action failed';
      toast.error(detail);
    }
    setActionLoading(false);
  };

  const handleSendBack = async () => {
    if (!selectedSendBackStep) { toast.error('Please select a workflow step to send back to'); return; }
    if (!remarks.trim()) { toast.error('Send back remarks are required'); return; }
    setActionLoading(true);
    try {
      await prApi.sendBack(pr.id, Number(selectedSendBackStep), remarks);
      toast.success('PR sent back successfully');
      setShowSendBackModal(false);
      setRemarks('');
      refetch();
    } catch (e: any) {
      const detail = e.response?.data?.detail || 'Action failed';
      toast.error(detail);
    }
    setActionLoading(false);
  };

  const handleDAAssignment = async () => {
    if (!selectedDa) { toast.error('Please select a Dealing Assistant'); return; }
    setActionLoading(true);
    try {
      await prApi.assignDa(pr.id, Number(selectedDa));
      toast.success('DA assigned successfully.');
      refetch();
    } catch (e: any) {
      const detail = e.response?.data?.detail || 'Action failed';
      toast.error(detail);
    }
    setActionLoading(false);
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
          quoted_amount: v.quoted_amount ? parseFloat(v.quoted_amount) : null,
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
      const detail = e.response?.data?.detail || 'Action failed';
      toast.error(detail);
    }
    setActionLoading(false);
  };

  const handleTechEvalSubmit = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required to submit the technical evaluation'); return; }

    // Require PDF upload for all committee members
    if (!techEvalPdf && !userTechEvalDoc) {
      toast.error('Please upload your signed Technical Evaluation Report PDF');
      return;
    }

    // For initiator: vendor qualifications must be filled
    if (pr.initiator_id === user?.id) {
      const hasFinancialBids = pr.financial_evaluations && pr.financial_evaluations.length > 0;
      const qualifiedNames = Object.entries(techQualifications)
        .filter(([_, q]) => q.is_qualified)
        .map(([name]) => name);

      if (hasFinancialBids && qualifiedNames.length > 0 && !selectedAwardedVendorId) {
        toast.error('Please select the recommended vendor to award the bid');
        return;
      }
    }

    if (!window.confirm('Are you sure you want to submit your Technical Evaluation?')) return;

    // Build FormData with JSON payload + PDF file
    const formattedVendors = pr.initiator_id === user?.id
      ? Object.entries(techQualifications).map(([name, data]) => ({
          name,
          is_qualified: data.is_qualified,
          remarks: data.remarks
        }))
      : [];

    const formData = new FormData();
    formData.append('payload', JSON.stringify({
      vendors: formattedVendors,
      remarks,
    }));
    if (techEvalPdf) {
      formData.append('tech_evaluation_document', techEvalPdf);
    }

    setActionLoading(true);
    try {
      await prApi.addTechnicalEval(pr.id, formData);

      if (pr.initiator_id === user?.id && selectedAwardedVendorId) {
        await prApi.awardBid(pr.id, parseInt(selectedAwardedVendorId), remarks);
      }

      toast.success('Technical Evaluation submitted. Advancing workflow...');
      await prApi.advance(pr.id, remarks);
      setRemarks('');
      setTechEvalPdf(null);
      refetch();
    } catch (e: any) {
      const detail = e.response?.data?.detail || 'Action failed';
      toast.error(detail);
    }
    setActionLoading(false);
  };

  const handleFinBidsSubmit = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required to register and advance'); return; }
    
    const isSingleBid = pr.technical_evaluations?.filter((t: any) => t.is_qualified).length === 1;
    if (isSingleBid && !singleBidJustification.trim()) {
      toast.error('Single Bid Justification is required');
      return;
    }

    const formattedBids = Object.entries(finBids).map(([name, data]) => {
      if (!data.quoted_amount.trim()) {
        toast.error(`Quoted total amount for ${name} is required`);
        throw new Error("Validation failed");
      }
      return {
        name,
        quoted_amount: parseFloat(data.quoted_amount),
        remarks: data.remarks,
        unit_price: data.unit_price ? parseFloat(data.unit_price) : null,
        taxes: data.taxes ? parseFloat(data.taxes) : 0,
        delivery_period: data.delivery_period ? parseInt(data.delivery_period) : null,
        warranty: data.warranty ? parseInt(data.warranty) : null,
      };
    });

    if (!window.confirm('Are you sure you want to submit these financial bids and advance?')) return;

    setActionLoading(true);
    try {
      await prApi.addFinancialBids(pr.id, {
        vendors: formattedBids,
        remarks,
        single_bid_justification: isSingleBid ? singleBidJustification : null
      });
      toast.success('Financial Bids saved. Advancing step...');
      await prApi.advance(pr.id, remarks);
      setRemarks('');
      refetch();
    } catch (e: any) {
      if (e.message !== "Validation failed") {
        const detail = e.response?.data?.detail || 'Action failed';
        toast.error(detail);
      }
    }
    setActionLoading(false);
  };

  const handleBillPassingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNo.trim()) { toast.error('Invoice Number is required'); return; }
    if (!invoiceDate) { toast.error('Invoice Date is required'); return; }
    if (!billAmount.trim()) { toast.error('Bill Amount is required'); return; }
    if (!bpRemarks.trim()) { toast.error('Remarks are required to pass the bill'); return; }

    setActionLoading(true);
    try {
      await prApi.billPassing(pr.id, {
        invoice_number: invoiceNo,
        invoice_date: invoiceDate,
        challan_number: challanNo || null,
        challan_date: challanDate || null,
        bill_amount: parseFloat(billAmount),
        gst_amount: gstAmount ? parseFloat(gstAmount) : 0.0,
        payment_terms: paymentTerms || null,
        remarks: bpRemarks,
      });
      toast.success('Bill Passing Certificate saved successfully. Purchase Request is now completed!');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to submit bill passing certificate');
    } finally {
      setActionLoading(false);
    }
  };

  const getLiveRankings = () => {
    const bidsList = Object.entries(finBids).map(([name, data]) => ({
      name,
      amount: parseFloat(data.quoted_amount) || Infinity
    }));
    bidsList.sort((a, b) => a.amount - b.amount);
    
    const rankings: Record<string, string> = {};
    bidsList.forEach((bid, idx) => {
      if (bid.amount !== Infinity) {
        rankings[bid.name] = `L1`;
        if (idx > 0) rankings[bid.name] = `L${idx + 1}`;
      } else {
        rankings[bid.name] = '-';
      }
    });
    return rankings;
  };
  const liveRankings = getLiveRankings();

  const committeeProgress = (() => {
    const rawMembers = [
      { id: pr.hod_id, name: pr.hod?.name || 'HOD / Chairperson', email: pr.hod?.email, roleLabel: 'HOD / Chairperson' },
      { id: pr.initiator_id, name: pr.initiator?.name || 'Purchase Initiator', email: pr.initiator?.email, roleLabel: 'Purchase Initiator' },
      { id: pr.faculty1_id, name: pr.faculty1?.name || 'Expert 1', email: pr.faculty1?.email, roleLabel: 'Expert Nominated by HOD 1' },
      { id: pr.faculty2_id, name: pr.faculty2?.name || 'Expert 2', email: pr.faculty2?.email, roleLabel: 'Expert Nominated by HOD 2' },
      { id: pr.faculty3_id, name: pr.faculty3?.name || 'Director Nominated Faculty', email: pr.faculty3?.email, roleLabel: 'Faculty Nominated by Director' },
    ].filter(m => m.id !== null && m.id !== undefined) as { id: number; name: string; email?: string; roleLabel: string }[];

    const members: typeof rawMembers = [];
    const seen = new Set<number>();
    for (const m of rawMembers) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        members.push(m);
      }
    }

    const since = pr.te_initiated_at ? new Date(pr.te_initiated_at) : null;

    return members.map(m => {
      const hasSigned = pr.history?.some((h: any) => 
        h.approver_id === m.id && 
        (h.status === 'Technical Evaluation Completed' || h.status === 'Technical Evaluation Approved') &&
        (!since || !h.acted_at || new Date(h.acted_at) >= since)
      );
      return { ...m, hasSigned };
    });
  })();

  const renderCancelModal = () => {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn text-left">
        <div className="bg-white rounded-lg shadow-lg border border-slate-200 max-w-md w-full p-6 space-y-4">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
            <XCircle size={18} className="text-red-600" /> Cancel {cancelType === 'po' ? 'Purchase Order (PO)' : 'Tender Process'}
          </h3>
          
          <div>
            <label className="label text-slate-600 font-bold block mb-1">Reason for Cancellation *</label>
            <textarea 
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Provide a detailed justification for cancellation..."
              className="input-field w-full mt-1 resize-none"
              rows={3}
              required
            />
          </div>

          <div>
            <label className="label text-slate-600 font-bold block mb-1">Re-initiation Method Preference</label>
            <select 
              value={reinitiationMethod} 
              onChange={(e) => setReinitiationMethod(e.target.value)}
              className="input-field w-full mt-1"
            >
              <option value="none">None (Do not re-initiate)</option>
              <option value="direct">Direct Purchase</option>
              <option value="gem">GeM Procurement</option>
              <option value="limited">Limited Tender</option>
              <option value="cppp">CPPP Portal</option>
            </select>
          </div>

          {cancelType === 'po' && (
            <div>
              <label className="label text-slate-600 font-bold block mb-1">Reallocated Budget Amount (if any)</label>
              <input 
                type="number"
                value={reallocatedAmount}
                onChange={(e) => setReallocatedAmount(e.target.value)}
                placeholder="0"
                className="input-field w-full mt-1"
                min="0"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button 
              type="button" 
              onClick={() => {
                setShowCancelModal(false);
                setCancelReason('');
              }}
              className="px-4 py-2 border border-slate-200 rounded text-slate-600 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button 
              type="button" 
              onClick={handleConfirmCancel}
              disabled={actionLoading || !cancelReason.trim()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded flex items-center gap-1.5"
            >
              Confirm Cancellation
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (pr.current_status === 'cancelled') {
    return (
      <div className="card p-6 bg-red-50 border-red-200 space-y-4 text-left">
        <h3 className="text-sm font-bold text-red-800 uppercase tracking-wide border-b border-red-100 pb-2 flex items-center gap-2">
          <XCircle size={18} /> Purchase Request Cancelled
        </h3>
        <p className="text-xs text-red-700 font-semibold">
          This purchase request has been cancelled and its budget allocation has been refunded.
        </p>
        {isAuthorizedToCancel && (
          <div className="pt-2">
            <button
              onClick={handleReinitiate}
              disabled={actionLoading}
              className="btn-primary py-2 px-6 font-semibold shadow-md flex items-center gap-2 bg-orange-600 hover:bg-orange-700 border-none"
            >
              <RotateCcw size={16} /> Re-initiate Purchase Request
            </button>
          </div>
        )}
      </div>
    );
  }

  if (pr.current_status === 'po_issued') {
    const verifiedDelivery = pr.deliveries?.find((d: any) => d.status === 'verified');
    const isDAOrAdmin = user?.role?.group_key === 'verifier_da' || user?.role?.group_key === 'admin';

    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="card p-6 bg-green-50 border-green-200 space-y-4 text-left">
          <h3 className="text-sm font-bold text-green-800 uppercase tracking-wide border-b border-green-100 pb-2 flex items-center gap-2">
            <CheckCircle2 size={18} /> Purchase Order Issued
          </h3>
          <p className="text-xs text-green-700 font-semibold">
            The purchase order has been successfully issued. Funds have been deducted from the department budget.
          </p>
          {isAuthorizedToCancel && !verifiedDelivery && (
            <div className="pt-2">
              <button
                onClick={() => {
                  setCancelType('po');
                  setShowCancelModal(true);
                }}
                disabled={actionLoading}
                className="btn-danger py-2 px-6 font-semibold shadow-md flex items-center gap-2"
              >
                <XCircle size={16} /> Cancel Purchase Order (PO)
              </button>
            </div>
          )}
          {showCancelModal && renderCancelModal()}
        </div>

        {verifiedDelivery ? (
          isDAOrAdmin ? (
            <form onSubmit={handleBillPassingSubmit} className="card p-6 bg-blue-50 border-blue-200 space-y-4 text-left">
              <h3 className="text-sm font-bold text-[#1a3a6b] uppercase tracking-wide border-b border-blue-100 pb-2 flex items-center gap-2">
                <FileText size={18} /> Purchase Bill Passing Certificate (Module 7)
              </h3>
              <p className="text-xs text-slate-500 font-semibold">
                Delivery has been verified. Please generate the Bill Passing Certificate to complete this purchase request.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label text-slate-600 font-semibold text-xs">Invoice Number *</label>
                  <input
                    type="text"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    className="input-field mt-1 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="label text-slate-600 font-semibold text-xs">Invoice Date *</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="input-field mt-1 text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="label text-slate-600 font-semibold text-xs">Challan Number</label>
                  <input
                    type="text"
                    value={challanNo}
                    onChange={(e) => setChallanNo(e.target.value)}
                    className="input-field mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="label text-slate-600 font-semibold text-xs">Challan Date</label>
                  <input
                    type="date"
                    value={challanDate}
                    onChange={(e) => setChallanDate(e.target.value)}
                    className="input-field mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="label text-slate-600 font-semibold text-xs">Bill Passed Amount (Lakhs) *</label>
                  <div className="relative mt-1">
                    <input
                      type="number"
                      step="0.01"
                      value={billAmount}
                      onChange={(e) => setBillAmount(e.target.value)}
                      className="input-field pl-6 text-xs font-mono"
                      required
                    />
                    <span className="absolute left-2.5 top-2.5 text-xs text-slate-400 font-bold">₹</span>
                  </div>
                </div>
                <div>
                  <label className="label text-slate-600 font-semibold text-xs">GST Amount (Lakhs)</label>
                  <div className="relative mt-1">
                    <input
                      type="number"
                      step="0.01"
                      value={gstAmount}
                      onChange={(e) => setGstAmount(e.target.value)}
                      className="input-field pl-6 text-xs font-mono"
                    />
                    <span className="absolute left-2.5 top-2.5 text-xs text-slate-400 font-bold">₹</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="label text-slate-600 font-semibold text-xs">Payment Terms</label>
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="input-field mt-1 text-xs"
                  placeholder="e.g. 100% payment after delivery and installation"
                />
              </div>

              <div>
                <label className="label text-slate-600 font-semibold text-xs">Bill Passing Remarks / Comments *</label>
                <textarea
                  value={bpRemarks}
                  onChange={(e) => setBpRemarks(e.target.value)}
                  className="input-field mt-1 text-xs h-20"
                  placeholder="Verify invoice/challan correctness and approve payment..."
                  required
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="btn-primary py-2 px-6 font-semibold shadow-md flex items-center gap-2"
                >
                  <CheckCircle2 size={16} /> Pass Bill & Complete Lifecycle
                </button>
              </div>
            </form>
          ) : (
            <div className="card p-6 bg-slate-50 border-slate-200 text-left space-y-2">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <Clock size={16} className="text-slate-500" /> Payment & Bill Passing In Progress
              </h3>
              <p className="text-xs text-slate-600 font-medium">
                Delivery receipt of goods has been successfully verified (GRN verified). The payment processing and Bill Passing Certificate generation is currently in progress with the Dealing Assistant / Superintendent.
              </p>
            </div>
          )
        ) : (
          <div className="card p-6 bg-slate-50 border-slate-200 text-left space-y-2">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <Clock size={16} className="text-slate-500" /> Awaiting Delivery & Verification
            </h3>
            <p className="text-xs text-slate-600 font-medium">
              Awaiting physical delivery of goods and GRN verification from the Department HOD and Stores.
            </p>
          </div>
        )}
      </div>
    );
  }

  if (isReferralActive) {
    if (isReferralForMe) {
      return (
        <div className="card p-6 bg-indigo-50 border-indigo-200 space-y-4 text-left">
          <h3 className="text-sm font-bold text-indigo-905 uppercase tracking-wide border-b border-indigo-100 pb-2 flex items-center gap-2">
            <Users size={18} className="text-indigo-600" /> Consultation Request
          </h3>
          <div className="bg-white border border-indigo-100 rounded-lg p-4 space-y-2">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Requested by</p>
            <p className="text-sm text-slate-800 font-medium">
              {activeReferral.referred_by?.name} ({activeReferral.referred_by?.email})
            </p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider pt-2">Query / Context</p>
            <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded border border-slate-100 italic">
              "{activeReferral.query}"
            </p>
          </div>

          <form onSubmit={handleRespondReferral} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Your Feedback / Opinion <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={responseRemarks}
                onChange={(e) => setResponseRemarks(e.target.value)}
                placeholder="Provide your detailed feedback or recommendations..."
                className="input-field w-full min-h-[100px] bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Upload Report Document (PDF, Optional)
              </label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setResponsePdf(e.target.files?.[0] || null)}
                className="input-field w-full text-slate-600 bg-white"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={actionLoading}
                className="btn-primary py-2.5 px-6 font-semibold shadow-md flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 border-none text-white text-xs"
              >
                {actionLoading ? 'Submitting...' : 'Submit Consultation & Send Back'}
              </button>
            </div>
          </form>
        </div>
      );
    } else {
      return (
        <div className="card p-6 bg-amber-50/70 border border-amber-200 space-y-3 text-left shadow-sm">
          <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wide border-b border-amber-100 pb-2 flex items-center gap-2">
            <Clock size={18} className="animate-spin text-amber-600" /> Awaiting Consultation Response
          </h3>
          <p className="text-xs text-amber-700 font-medium leading-relaxed">
            This purchase request has been referred to <span className="font-bold text-slate-800">{activeReferral.referred_to?.name} ({activeReferral.referred_to?.email})</span> for an opinion.
          </p>
          <div className="bg-white border border-amber-100 rounded p-3 text-xs text-slate-600 space-y-1">
            <span className="font-semibold text-slate-400">Consultation query:</span>
            <p className="italic">"{activeReferral.query}"</p>
          </div>
          <p className="text-[11px] text-amber-600 font-semibold bg-amber-100/50 p-2.5 rounded border border-amber-200/50 flex items-center gap-1.5">
            <ShieldAlert size={14} className="text-amber-600 flex-shrink-0" />
            Workflow actions are temporarily frozen until a consultation response is submitted.
          </p>
        </div>
      );
    }
  }

  const firstUnsignedMember = committeeProgress.find(m => !m.hasSigned);
  const isMyTurnToSign = firstUnsignedMember?.id === user?.id;

  return (
    <div className="card p-6 bg-blue-50 border-blue-100 space-y-6">
      <h3 className="text-sm font-bold text-[#1a3a6b] uppercase tracking-wide border-b border-blue-100 pb-2 flex items-center gap-2">
        <FileText size={18} /> Action Stage: {phaseName}
      </h3>

      {/* Committee nominees are configured globally, no longer selected here */}
      
      {/* DA Assignment Sub-Form */}
      {phaseName === 'Tendering' && pr.flow?.step_order === 1 && pr.flow?.expected_role_name === 'Superintendent' && (
        <div className="space-y-4 bg-white p-4 border border-blue-200 rounded">
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

      {/* Tendering phase inputs - Dealing Assistant Form */}
      {phaseName === 'Tendering' && pr.flow?.expected_role_name === 'Dealing Assistant' && (
        <div className="space-y-4 bg-white p-5 border border-slate-200 rounded-xl shadow-sm animate-fadeIn">
          <h4 className="text-sm font-bold text-[#1a3a6b] border-b border-slate-100 pb-1.5 flex justify-between items-center">
            <span>Register Tender Details</span>
            <span className="text-[10px] text-slate-400 font-normal">Please fill in specs and bidders</span>
          </h4>
          
          {/* Section 1: Specifications */}
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

          {/* Section 1.5: LPC Committee Form (Only for Limited Tender) */}
          {(pr.procurement?.name?.toLowerCase().includes('limited tender') || pr.procurement?.name?.toLowerCase().includes('lpc')) && (
            <div className="space-y-2 pt-2 border-t border-slate-100 animate-fadeIn">
              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100/50 pb-0.5">Limited Purchase Committee Approval (Module 5)</h5>
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

          {/* Section 2: Documents */}
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

          {/* Section 3: Bidding Vendor Registry */}
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

          {/* Tender Routing Notice inside form */}
          {pr.flow?.tender_vendors_threshold !== null && pr.flow?.tender_vendors_threshold !== undefined && (() => {
            const vendorCount = tenderVendors.filter(v => v.name && v.name.trim() !== '').length;
            const threshold = pr.flow.tender_vendors_threshold;
            return renderTenderRoutingNotice(vendorCount, threshold, pr.flow.tender_vendors_comparison, 'sm');
          })()}

          {/* Remarks & Buttons */}
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
                onClick={handleReject} 
                disabled={actionLoading} 
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

      {/* Tendering phase inputs - Superintendent Review Form */}
      {phaseName === 'Tendering' && pr.flow?.expected_role_name === 'Superintendent' && pr.flow?.step_order === 3 && (
        <div className="space-y-4 bg-white p-4 border border-blue-200 rounded shadow-sm">
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
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-slate-600" style={{ minWidth: '150px' }}>Vendor Name</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-600" style={{ minWidth: '180px' }}>Vendor Email</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-600" style={{ minWidth: '120px' }}>Quoted Amount</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-600" style={{ minWidth: '180px' }}>Techno-Commercial Status</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-600" style={{ minWidth: '150px' }}>Remarks</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {pr.commercial_evaluations?.map((ce: any) => (
                    <tr key={ce.id}>
                      <td className="px-3 py-2 font-medium">{ce.vendor_name}</td>
                      <td className="px-3 py-2 text-slate-500">{ce.vendor_email || '-'}</td>
                      <td className="px-3 py-2 font-semibold">
                        {ce.quoted_amount !== null && ce.quoted_amount !== undefined ? `₹${ce.quoted_amount} Lakhs` : '-'}
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
                onClick={async () => {
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
                  }
                  setActionLoading(false);
                }}
                disabled={actionLoading || !remarks.trim()}
                className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs"
              >
                <CheckCircle2 size={14} /> Approve &amp; Forward
              </button>

              <button 
                onClick={handleReject} 
                disabled={actionLoading} 
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
      {/* Technical Evaluation form — shown to all nominated committee members */}
      {phaseName === 'Technical Evaluation' && pr.flow?.step_order === 1 && isCommitteeMember && (
        <div className="space-y-4 bg-white p-4 border border-blue-200 rounded">
          <h4 className="text-sm font-bold text-[#1a3a6b] uppercase tracking-wide pb-2 border-b border-slate-100">
            Register Technical Qualification
          </h4>
          
          {/* Turn-based Signing Alert Warning */}
          {!isMyTurnToSign && firstUnsignedMember && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3.5 text-xs font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              <span>
                It is not your turn to sign. The next signer is <strong className="text-amber-900">{firstUnsignedMember.name}</strong> ({firstUnsignedMember.roleLabel}).
              </span>
            </div>
          )}

          {/* Committee Progress Checklist */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 shadow-xs">
            <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-blue-600" />
              Committee Evaluation Progress
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {committeeProgress.map(m => (
                <div key={m.id} className={`flex items-center justify-between p-2.5 rounded-lg border bg-white transition-all ${
                  m.hasSigned ? 'border-emerald-200 bg-emerald-50/10' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-800">{m.name}</span>
                    <span className="text-xs text-slate-500">{m.roleLabel}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {m.hasSigned ? (
                      <>
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">Submitted</span>
                        <CheckCircle2 size={16} className="text-emerald-600" />
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 animate-pulse">Pending</span>
                        <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>          
          {hasUserSigned ? (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-4 text-sm space-y-1">
              <div className="font-semibold flex items-center gap-2 text-emerald-900">
                <CheckCircle2 size={16} className="text-emerald-600" /> Technical Evaluation Submitted
              </div>
              <p className="text-xs text-emerald-700">
                You have successfully submitted your Technical Evaluation Report. Waiting for other committee members to sign.
              </p>
              {userTechEvalDoc && (
                <div className="mt-2 flex items-center gap-2 text-xs bg-white border border-emerald-100 rounded px-2 py-1.5">
                  <FileText size={13} className="text-emerald-600 shrink-0" />
                  <span className="font-semibold text-slate-700">Your uploaded report:</span>
                  <a href={userTechEvalDoc.path} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate font-semibold">
                    {userTechEvalDoc.original_name}
                  </a>
                </div>
              )}
            </div>
          ) : !pr.commercial_evaluations || pr.commercial_evaluations.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-slate-200 rounded bg-slate-50 space-y-2">
              <p className="text-sm text-slate-500 italic">No vendors exist yet in commercial bids.</p>
              <p className="text-xs text-slate-400">Please go back to the Tendering phase or add commercial vendors first.</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* PDF Upload — required for every committee member */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <h5 className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                  <FileText size={14} className="text-amber-600" />
                  Technical Evaluation Report (PDF) *
                </h5>
                <p className="text-xs text-amber-700">
                  Each committee member must upload their individually signed Technical Evaluation Report before submitting.
                </p>
                {userTechEvalDoc && (
                  <div className="flex items-center gap-2 text-xs bg-white border border-amber-100 rounded px-2 py-1.5">
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    <span className="font-semibold text-slate-600">Currently saved:</span>
                    <a href={userTechEvalDoc.path} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate font-semibold">
                      {userTechEvalDoc.original_name}
                    </a>
                  </div>
                )}
                <div>
                  <input
                    id="tech-eval-pdf"
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => setTechEvalPdf(e.target.files?.[0] || null)}
                    className="input-field mt-1 text-sm"
                    required={!userTechEvalDoc}
                  />
                  {techEvalPdf && (
                    <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Selected: <span className="font-semibold">{techEvalPdf.name}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Vendor Qualifications — only initiator fills this */}
              {pr.initiator_id === user?.id && (
                <div className="space-y-3">
                  <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">
                    Vendor Qualification Checklist
                  </h5>
                  {pr.commercial_evaluations.map(ce => {
                    const state = techQualifications[ce.vendor_name] || { is_qualified: true, remarks: '' };
                    return (
                      <div key={ce.id} className="flex gap-4 items-center bg-slate-50 p-3 border border-slate-100 rounded">
                        <div className="w-1/3 text-sm font-bold text-slate-700">{ce.vendor_name}</div>
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            id={`tech-check-${ce.id}`}
                            checked={state.is_qualified}
                            onChange={(e) => setTechQualifications({
                              ...techQualifications,
                              [ce.vendor_name]: { ...state, is_qualified: e.target.checked }
                            })}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                          />
                          <label htmlFor={`tech-check-${ce.id}`} className="text-sm font-semibold text-slate-600 select-none">Technically Qualified</label>
                        </div>
                        <div className="flex-1">
                          <input 
                            type="text"
                            value={state.remarks}
                            onChange={(e) => setTechQualifications({
                              ...techQualifications,
                              [ce.vendor_name]: { ...state, remarks: e.target.value }
                            })}
                            className="input-field py-1"
                            placeholder="Remarks"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Live Ranking & Award Selection */}
              {pr.initiator_id === user?.id && Object.values(techQualifications).some(v => v.is_qualified) && pr.financial_evaluations && pr.financial_evaluations.length > 0 && (
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <label className="label text-slate-700 font-bold">Select Recommended Vendor (Award Bid) *</label>
                  <div className="space-y-2">
                    {(() => {
                      const qualifiedNames = Object.entries(techQualifications)
                        .filter(([_, q]) => q.is_qualified)
                        .map(([name]) => name);
                        
                      const qualifiedBids = pr.financial_evaluations
                        .filter(fe => qualifiedNames.includes(fe.vendor_name))
                        .sort((a, b) => a.quoted_amount - b.quoted_amount);
                        
                      return qualifiedBids.map((fe, idx) => {
                        const rank = `L${idx + 1}`;
                        const isL1 = rank === 'L1';
                        const isL2 = rank === 'L2';
                        
                        return (
                          <label 
                            key={fe.id}
                            className={`flex items-center justify-between p-3 border rounded cursor-pointer transition-all hover:bg-slate-50 ${
                              selectedAwardedVendorId === String(fe.id)
                                ? 'border-blue-500 bg-blue-50/30'
                                : isL1 ? 'border-green-200 bg-green-50/10' : isL2 ? 'border-yellow-200 bg-yellow-50/10' : 'border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input 
                                type="radio" 
                                name="awarded_vendor"
                                value={fe.id}
                                checked={selectedAwardedVendorId === String(fe.id)}
                                onChange={(e) => setSelectedAwardedVendorId(e.target.value)}
                                className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                              />
                              <div>
                                <span className="text-sm font-bold text-slate-800">{fe.vendor_name}</span>
                                <span className="ml-2 text-xs font-semibold text-[#1a3a6b]">₹{fe.quoted_amount.toFixed(2)} Lakhs</span>
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${isL1 ? 'bg-green-100 text-green-800' : isL2 ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-600'}`}>
                              Rank: {rank}
                            </span>
                          </label>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Remarks / Justification for Technical Evaluation */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="label text-slate-700 font-bold text-xs">Remarks / Justification *</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Provide technical evaluation remarks/justification..."
                  className="input-field min-h-[60px] text-xs py-1.5"
                  required
                />
              </div>

              <div className="flex flex-wrap gap-2.5 pt-1">
                <button 
                  onClick={handleTechEvalSubmit} 
                  disabled={actionLoading || !isMyTurnToSign || (!techEvalPdf && !userTechEvalDoc) || !remarks.trim()}
                  className={`btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs ${!isMyTurnToSign ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <CheckCircle2 size={14} /> Submit Technical Evaluation Report
                </button>

                <button 
                  onClick={handleReject} 
                  disabled={actionLoading || !isMyTurnToSign} 
                  className={`btn-danger flex items-center gap-1.5 text-xs py-2 px-4 ${!isMyTurnToSign ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <XCircle size={14} /> Reject
                </button>

                {pr.flow && pr.flow.step_order > 1 && sendBackCandidates.length > 0 && (
                  <button 
                    onClick={() => setShowSendBackModal(true)} 
                    disabled={actionLoading || !isMyTurnToSign} 
                    className={`btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition ${!isMyTurnToSign ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <RotateCcw size={14} /> Send Back
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Financial Sanction bid input form */}
      {phaseName === 'Financial Sanction' && pr.flow?.expected_group === 'faculty' && (
        <div className="space-y-4 bg-white p-4 border border-blue-200 rounded">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Register Financial Bids</h4>
          
          {!pr.technical_evaluations || pr.technical_evaluations.filter(t => t.is_qualified).length === 0 ? (
            <div className="p-6 text-center border border-dashed border-slate-200 rounded bg-slate-50 space-y-2">
              <p className="text-sm text-slate-500 italic">No technically qualified vendors found.</p>
              <p className="text-xs text-slate-400">Please complete Technical Evaluation first.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto border border-slate-200 rounded-lg bg-slate-50/30 p-0.5">
                <table className="min-w-[900px] divide-y divide-slate-100 text-sm animate-fadeIn" style={{ minWidth: '900px' }}>
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                      <th className="px-3 py-2.5 text-left w-[20%]" style={{ minWidth: '150px' }}>Vendor Name</th>
                      <th className="px-3 py-2.5 text-center w-[8%]" style={{ minWidth: '70px' }}>Rank</th>
                      <th className="px-3 py-2.5 text-left w-[12%]" style={{ minWidth: '110px' }}>Unit Price (L)</th>
                      <th className="px-3 py-2.5 text-left w-[10%]" style={{ minWidth: '90px' }}>Taxes (%)</th>
                      <th className="px-3 py-2.5 text-left w-[14%]" style={{ minWidth: '120px' }}>Quoted Total (L) *</th>
                      <th className="px-3 py-2.5 text-left w-[12%]" style={{ minWidth: '100px' }}>Delivery (W)</th>
                      <th className="px-3 py-2.5 text-left w-[12%]" style={{ minWidth: '100px' }}>Warranty (M)</th>
                      <th className="px-3 py-2.5 text-left w-[12%]" style={{ minWidth: '120px' }}>Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {pr.technical_evaluations.filter(t => t.is_qualified).map((te) => {
                      const state = finBids[te.vendor_name] || { quoted_amount: '', remarks: '', unit_price: '', taxes: '0', delivery_period: '', warranty: '' };
                      const ranking = liveRankings[te.vendor_name] || '-';
                      const isL1 = ranking === 'L1';
                      const isL2 = ranking === 'L2';

                      // Helper to automatically calculate total if unit price and taxes are entered
                      const handleUnitPriceOrTaxesChange = (field: 'unit_price' | 'taxes', val: string) => {
                        const nextState = { ...state, [field]: val };
                        const uPrice = parseFloat(nextState.unit_price || '0');
                        const taxPercent = parseFloat(nextState.taxes || '0');
                        if (uPrice > 0) {
                          const totalAmt = uPrice * (1 + taxPercent / 100);
                          nextState.quoted_amount = String(totalAmt.toFixed(2));
                        }
                        setFinBids({
                          ...finBids,
                          [te.vendor_name]: nextState
                        });
                      };

                      return (
                        <tr key={te.id} className={`hover:bg-slate-50/40 transition-colors ${
                          isL1 ? 'bg-green-50/10' : isL2 ? 'bg-yellow-50/10' : ''
                        }`}>
                          <td className="px-3 py-2 font-semibold text-slate-800">{te.vendor_name}</td>
                          <td className="px-3 py-2 text-center font-semibold">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              isL1 ? 'bg-green-100 text-green-800 border border-green-200' : 
                              isL2 ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : 
                              'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {ranking}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="relative">
                              <input 
                                type="number"
                                step="0.01"
                                value={state.unit_price || ''}
                                onChange={(e) => handleUnitPriceOrTaxesChange('unit_price', e.target.value)}
                                className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 pl-4 pr-1 text-xs rounded transition-all placeholder:text-slate-300"
                                placeholder="0.00"
                              />
                              <span className="absolute left-1.5 top-1.5 text-[10px] text-slate-400 font-bold">₹</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input 
                              type="number"
                              step="0.1"
                              value={state.taxes || '0'}
                              onChange={(e) => handleUnitPriceOrTaxesChange('taxes', e.target.value)}
                              className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1.5 text-xs rounded transition-all font-mono"
                              placeholder="0"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="relative">
                              <input 
                                type="number"
                                step="0.01"
                                value={state.quoted_amount}
                                onChange={(e) => setFinBids({
                                  ...finBids,
                                  [te.vendor_name]: { ...state, quoted_amount: e.target.value }
                                })}
                                className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 pl-4 pr-1 text-xs rounded transition-all font-semibold font-mono"
                                placeholder="0.00"
                                required
                              />
                              <span className="absolute left-1.5 top-1.5 text-[10px] text-slate-400 font-bold">₹</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input 
                              type="number"
                              value={state.delivery_period || ''}
                              onChange={(e) => setFinBids({
                                ...finBids,
                                [te.vendor_name]: { ...state, delivery_period: e.target.value }
                              })}
                              className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1.5 text-xs rounded transition-all"
                              placeholder="weeks"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input 
                              type="number"
                              value={state.warranty || ''}
                              onChange={(e) => setFinBids({
                                ...finBids,
                                [te.vendor_name]: { ...state, warranty: e.target.value }
                              })}
                              className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1.5 text-xs rounded transition-all"
                              placeholder="months"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input 
                              type="text"
                              value={state.remarks}
                              onChange={(e) => setFinBids({
                                ...finBids,
                                [te.vendor_name]: { ...state, remarks: e.target.value }
                              })}
                              className="w-full bg-white border border-slate-200 focus:border-[#1a3a6b] focus:ring-1 focus:ring-[#1a3a6b] py-1 px-1.5 text-xs rounded transition-all placeholder:text-slate-300 placeholder:italic"
                              placeholder="Remarks"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Single Bid Justification Form (Module 13) */}
              {pr.technical_evaluations.filter(t => t.is_qualified).length === 1 && (
                <div className="pt-3 pb-2 space-y-2 border-t border-slate-100 bg-orange-50/20 p-4 rounded border border-orange-100/50 animate-fadeIn">
                  <label className="label text-[#1a3a6b] font-bold text-xs block mb-1">Single Bid Justification (Module 13) *</label>
                  <textarea
                    value={singleBidJustification}
                    onChange={(e) => setSingleBidJustification(e.target.value)}
                    placeholder="Provide explicit justification for proceeding with a single qualified bid..."
                    className="input-field min-h-[70px] text-xs py-1.5 bg-white border border-orange-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                    required
                  />
                </div>
              )}

              {/* Remarks / Justification for Financial Sanction */}
              <div className="pt-2 border-t border-slate-100 space-y-2 text-left">
                <label className="label text-slate-700 font-bold text-xs">Remarks / Recommendation Comments *</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Provide financial sanction evaluation remarks..."
                  className="input-field min-h-[60px] text-xs py-1.5"
                  required
                />
              </div>

              <div className="flex flex-wrap gap-2.5 pt-1">
                <button 
                  onClick={handleFinBidsSubmit} 
                  disabled={actionLoading || !remarks.trim()}
                  className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs"
                >
                  <CheckCircle2 size={14} /> Submit Financial Bids &amp; Advance
                </button>

                <button 
                  onClick={handleReject} 
                  disabled={actionLoading} 
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
          )}
        </div>
      )}

      {/* Standard text remarks & actions */}
      {!hasCustomForm && (
        <div className="space-y-4 pt-2 border-t border-blue-200">
          {phaseName === 'Tendering' && pr.flow?.tender_vendors_threshold !== null && pr.flow?.tender_vendors_threshold !== undefined && (() => {
            const vendorCount = pr.commercial_evaluations?.length || tenderVendors.filter(v => v.name && v.name.trim() !== '').length;
            const threshold = pr.flow.tender_vendors_threshold;
            return renderTenderRoutingNotice(vendorCount, threshold, pr.flow.tender_vendors_comparison, 'base');
          })()}

          <div>
            <label className="label font-bold text-slate-700">Remarks / Justification</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Enter official remarks..."
              rows={3}
              className="input-field resize-none bg-white mt-1"
            />
          </div>

          <div className="flex gap-3">
            {/* Hide default forward/approve button if this step requires specific form entry and forms aren't complete */}
            {(!['Tendering', 'Technical Evaluation', 'Financial Sanction'].includes(phaseName || '') || 
              (phaseName === 'Tendering' && !['Dealing Assistant', 'Superintendent'].includes(pr.flow?.expected_role_name || '')) ||
              (phaseName === 'Technical Evaluation' && (pr.flow?.step_order !== 1 || pr.flow?.expected_group !== 'faculty')) ||
              (phaseName === 'Financial Sanction' && pr.flow?.expected_group !== 'faculty')
            ) && !(phaseName === 'Technical Evaluation' && pr.flow?.step_order === 1 && isCommitteeMember) && (
              <button onClick={handleAdvance} disabled={actionLoading} className="btn-primary flex items-center gap-2">
                <CheckCircle2 size={16} /> Approve &amp; Forward
              </button>
            )}
            
            {/* Rejection button — hidden from TE committee nominees who haven't signed */}
            {!(phaseName === 'Technical Evaluation' && pr.flow?.step_order === 1 && isCommitteeMember && !hasUserSigned) && (
              <button onClick={handleReject} disabled={actionLoading} className="btn-danger flex items-center gap-2">
                <XCircle size={16} /> Reject
              </button>
            )}

            {isAuthorizedToCancel && ['Tendering', 'Technical Evaluation', 'Financial Sanction'].includes(phaseName || '') && (
              <button
                type="button"
                onClick={() => {
                  setCancelType('tender');
                  setShowCancelModal(true);
                }}
                disabled={actionLoading}
                className="px-4 py-2 border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 rounded font-semibold transition flex items-center gap-2"
              >
                <XCircle size={16} /> Cancel Tender
              </button>
            )}

            {/* Send Back button (only shown if step_order > 1) */}
            {pr.flow && pr.flow.step_order > 1 && sendBackCandidates.length > 0 && (
              <button 
                onClick={() => setShowSendBackModal(true)} 
                disabled={actionLoading} 
                className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-2 rounded px-4 py-2 font-medium transition"
              >
                <RotateCcw size={16} /> Send Back
              </button>
            )}
          </div>
        </div>
      )}

      {/* Refer for Consultation section */}
      {!isReferralActive && (
        <div className="border-t border-blue-200/60 pt-4 mt-4 space-y-3 text-left">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
            <Users size={14} className="text-slate-500" /> Seek Ad-hoc Consultation (Optional)
          </h4>
          <p className="text-[11px] text-slate-500 font-medium">
            Refer this purchase request to another user to seek their feedback or opinion. This will temporarily freeze the workflow until they respond.
          </p>
          <form onSubmit={handleReferPr} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end bg-white border border-slate-200 p-4 rounded-lg shadow-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Consultant User</label>
              <select
                value={selectedReferralUser}
                onChange={(e) => setSelectedReferralUser(e.target.value === '' ? '' : Number(e.target.value))}
                className="input-field text-xs bg-white w-full"
              >
                <option value="">-- Choose User --</option>
                {allUsers.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Consultation Query / Request Notes</label>
              <input
                type="text"
                placeholder="What feedback or report do you need?"
                value={referralQuery}
                onChange={(e) => setReferralQuery(e.target.value)}
                className="input-field text-xs bg-white w-full"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={actionLoading || !selectedReferralUser || !referralQuery.trim()}
                className="btn-secondary text-xs px-4 py-2.5 border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 flex items-center gap-1 font-semibold"
              >
                <Users size={12} /> Refer for Opinion
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Send Back Modal */}
      {showSendBackModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-lg shadow-lg border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
              <RotateCcw size={18} className="text-orange-600" /> Send Purchase Request Back
            </h3>
            
            <div>
              <label className="label text-slate-600">Select Target Workflow Step</label>
              <select 
                value={selectedSendBackStep} 
                onChange={(e) => setSelectedSendBackStep(Number(e.target.value))}
                className="input-field mt-1"
              >
                {sendBackCandidates.map(c => (
                  <option key={c.step_order} value={c.step_order}>
                    Step {c.step_order}: {c.user_type} ({c.user_group})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label text-slate-600">Remarks / Reason *</label>
              <textarea 
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Specify corrections required..."
                className="input-field mt-1 resize-none"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button 
                type="button" 
                onClick={() => setShowSendBackModal(false)}
                className="px-4 py-2 border border-slate-200 rounded text-slate-600 hover:bg-slate-50 font-medium"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleSendBack}
                disabled={actionLoading || !remarks.trim()}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded flex items-center gap-1.5"
              >
                Confirm Send Back
              </button>
            </div>
          </div>
        </div>
      )}
      {showCancelModal && renderCancelModal()}
    </div>
  );
};
