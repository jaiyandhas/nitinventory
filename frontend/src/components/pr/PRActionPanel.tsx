import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, XCircle, RotateCcw, UserPlus, FileText, Check, Plus, Trash2 
} from 'lucide-react';
import { prApi } from '../../services/api';
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
  
  let label = docKey;
  label = label.replace(/_/g, ' ');
  label = label.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  label = label.replace(/Tech Specs/i, 'Technical Specifications');
  label = label.replace(/Gem Nac/i, 'GeM Non-Availability Certificate');
  
  return label;
};

export const PRActionPanel: React.FC<PRActionPanelProps> = ({ pr, user, refetch, faculties }) => {
  const [remarks, setRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [faculty1Id, setFaculty1Id] = useState<number | ''>('');
  const [faculty2Id, setFaculty2Id] = useState<number | ''>('');
  const [faculty3Id, setFaculty3Id] = useState<number | ''>('');

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

  // Technical Evaluation states
  const [techQualifications, setTechQualifications] = useState<Record<string, { is_qualified: boolean; remarks: string }>>({});
  const [selectedAwardedVendorId, setSelectedAwardedVendorId] = useState<string>('');

  // Financial Sanction states
  const [finBids, setFinBids] = useState<Record<string, { quoted_amount: string; remarks: string }>>({});

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
      const initialBids: Record<string, { quoted_amount: string; remarks: string }> = {};
      pr.technical_evaluations.forEach(te => {
        if (te.is_qualified) {
          const existingFe = pr.financial_evaluations?.find(f => f.vendor_name === te.vendor_name);
          initialBids[te.vendor_name] = { 
            quoted_amount: existingFe ? String(existingFe.quoted_amount) : '', 
            remarks: existingFe ? existingFe.remarks || '' : '' 
          };
        }
      });
      setFinBids(initialBids);
    }
  }, [pr]);

  const phaseName = pr.flow?.phase_name;
  const hasExistingDraft = pr.documents?.some((d: any) => d.doc_key === 'draft_tender_document');
  const hasExistingTender = pr.documents?.some((d: any) => d.doc_key === 'tender_document');

  const handleAdvance = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required to advance the PR'); return; }
    if (!window.confirm('Are you sure you want to approve and advance this purchase request?')) return;

    let f1: number | undefined = undefined;
    let f2: number | undefined = undefined;
    let f3: number | undefined = undefined;

    if (user?.role?.group_key === 'hod' && (pr.flow?.expected_group === 'hod' || pr.flow?.expected_role_name?.toLowerCase().includes('hod') || phaseName === 'Administrative Approval')) {
      if (!faculty1Id || !faculty2Id || !faculty3Id) {
        toast.error('HOD must assign Faculty 1, Faculty 2, and Director Nominee (Faculty 3) committee members to approve this request.');
        return;
      }
      if (faculty1Id === faculty2Id || faculty1Id === faculty3Id || faculty2Id === faculty3Id) {
        toast.error('All 3 committee nominees must be different members.');
        return;
      }
      f1 = Number(faculty1Id);
      f2 = Number(faculty2Id);
      f3 = Number(faculty3Id);
    }

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
      toast.success('DA assigned successfully. Advancing step...');
      await prApi.advance(pr.id, `Assigned Dealing Assistant`);
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
    if (!remarks.trim()) { toast.error('Remarks are required to register and advance'); return; }
    
    const hasFinancialBids = pr.financial_evaluations && pr.financial_evaluations.length > 0;
    const qualifiedNames = Object.entries(techQualifications)
      .filter(([_, q]) => q.is_qualified)
      .map(([name]) => name);
      
    if (hasFinancialBids && qualifiedNames.length > 0 && !selectedAwardedVendorId) {
      toast.error('Please select the recommended vendor to award the bid');
      return;
    }

    if (!window.confirm('Are you sure you want to submit this technical evaluation and advance?')) return;

    const formattedVendors = Object.entries(techQualifications).map(([name, data]) => ({
      name,
      is_qualified: data.is_qualified,
      remarks: data.remarks
    }));

    setActionLoading(true);
    try {
      await prApi.addTechnicalEval(pr.id, formattedVendors);
      
      if (selectedAwardedVendorId) {
        await prApi.awardBid(pr.id, parseInt(selectedAwardedVendorId), remarks);
      }

      toast.success('Technical Evaluation saved. Advancing step...');
      await prApi.advance(pr.id, remarks);
      setRemarks('');
      refetch();
    } catch (e: any) {
      const detail = e.response?.data?.detail || 'Action failed';
      toast.error(detail);
    }
    setActionLoading(false);
  };

  const handleFinBidsSubmit = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required to register and advance'); return; }
    const formattedBids = Object.entries(finBids).map(([name, data]) => {
      if (!data.quoted_amount.trim()) {
        toast.error(`Quoted amount for ${name} is required`);
        throw new Error("Validation failed");
      }
      return {
        name,
        quoted_amount: parseFloat(data.quoted_amount),
        remarks: data.remarks
      };
    });

    if (!window.confirm('Are you sure you want to submit these financial bids and advance?')) return;

    setActionLoading(true);
    try {
      await prApi.addFinancialBids(pr.id, formattedBids, remarks);
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

  return (
    <div className="card p-6 bg-blue-50 border-blue-100 space-y-6">
      <h3 className="text-sm font-bold text-[#1a3a6b] uppercase tracking-wide border-b border-blue-100 pb-2 flex items-center gap-2">
        <FileText size={18} /> Action Stage: {phaseName}
      </h3>

      {/* Faculty Nominees dropdowns for HOD */}
      {user?.role?.group_key === 'hod' && phaseName === 'Administrative Approval' && (
        <div className="space-y-4 bg-white p-4 border border-blue-200 rounded shadow-sm">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
            <UserPlus size={16} className="text-[#1a3a6b]" /> Assign Purchase Committee Members
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label text-slate-600 font-bold text-xs">Faculty 1 Nominee (Dept) *</label>
              <select
                value={faculty1Id}
                onChange={(e) => setFaculty1Id(e.target.value === '' ? '' : Number(e.target.value))}
                className="input-field mt-1"
              >
                <option value="">-- Select Faculty 1 --</option>
                {faculties.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name} ({f.email})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-slate-600 font-bold text-xs">Faculty 2 Nominee (Dept) *</label>
              <select
                value={faculty2Id}
                onChange={(e) => setFaculty2Id(e.target.value === '' ? '' : Number(e.target.value))}
                className="input-field mt-1"
              >
                <option value="">-- Select Faculty 2 --</option>
                {faculties.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name} ({f.email})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-slate-600 font-bold text-xs">Faculty 3 Nominee (Director) *</label>
              <select
                value={faculty3Id}
                onChange={(e) => setFaculty3Id(e.target.value === '' ? '' : Number(e.target.value))}
                className="input-field mt-1"
              >
                <option value="">-- Select Director Nominee --</option>
                {faculties.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name} ({f.email})</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
      
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
        <div className="space-y-4 bg-white p-4 border border-blue-200 rounded shadow-sm">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Register Tender Details</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label text-slate-600 font-bold">Tender Reference Number *</label>
              <input 
                type="text" 
                value={tenderRef} 
                onChange={(e) => setTenderRef(e.target.value)} 
                className="input-field mt-1" 
                placeholder="e.g. NITT/CSE/2026/04" 
              />
            </div>
            <div>
              <label className="label text-slate-600 font-bold">Date of Tender *</label>
              <input 
                type="date" 
                value={tenderDate} 
                onChange={(e) => setTenderDate(e.target.value)} 
                className="input-field mt-1" 
              />
            </div>
            <div>
              <label className="label text-slate-600 font-bold">Tech Bid Opening Date</label>
              <input 
                type="date" 
                value={techOpenDate} 
                onChange={(e) => setTechOpenDate(e.target.value)} 
                className="input-field mt-1" 
              />
            </div>
            <div>
              <label className="label text-slate-600 font-bold">Financial Bid Opening Date</label>
              <input 
                type="date" 
                value={finOpenDate} 
                onChange={(e) => setFinOpenDate(e.target.value)} 
                className="input-field mt-1" 
              />
            </div>
            <div className="col-span-2">
              <label className="label text-slate-600 font-bold">External Vendor List Document URL</label>
              <input 
                type="text" 
                value={vendorListLink} 
                onChange={(e) => setVendorListLink(e.target.value)} 
                className="input-field mt-1" 
                placeholder="https://drive.google.com/..." 
              />
            </div>
            <div>
              <label className="label text-slate-600 font-bold">
                Draft Tender Document * {hasExistingDraft && <span className="text-green-600 text-xs font-normal">(Uploaded: {pr.documents?.find((d: any) => d.doc_key === 'draft_tender_document')?.original_name})</span>}
              </label>
              <input 
                type="file" 
                onChange={(e) => setDraftTenderDoc(e.target.files?.[0] || null)} 
                className="input-field mt-1" 
                required={!hasExistingDraft}
              />
            </div>
            <div>
              <label className="label text-slate-600 font-bold">
                Tender Document (Optional) {hasExistingTender && <span className="text-green-600 text-xs font-normal">(Uploaded: {pr.documents?.find((d: any) => d.doc_key === 'tender_document')?.original_name})</span>}
              </label>
              <input 
                type="file" 
                onChange={(e) => setTenderDoc(e.target.files?.[0] || null)} 
                className="input-field mt-1" 
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-4">
            <div className="flex justify-between items-center">
              <label className="label text-slate-700 font-bold">Bidding Vendors *</label>
              <button
                type="button"
                onClick={() => {
                  setTenderVendors([
                    ...tenderVendors,
                    { name: '', email: '', quoted_amount: '', is_qualified: true, remarks: '' }
                  ]);
                }}
                className="btn-secondary py-1 px-3 flex items-center gap-1 text-xs"
              >
                <Plus size={14} /> Add Vendor Row
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-slate-600">Vendor Name *</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-600">Vendor Email</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-600">Quoted Amount (Lakhs)</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-600">Status</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-600">Remarks</th>
                    <th className="px-3 py-2 text-center font-bold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {tenderVendors.map((vendor, index) => (
                    <tr key={index}>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={vendor.name}
                          onChange={(e) => {
                            const updated = [...tenderVendors];
                            updated[index].name = e.target.value;
                            setTenderVendors(updated);
                          }}
                          className="input-field py-1 px-2 text-sm w-full"
                          placeholder="Vendor Name"
                          required
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="email"
                          value={vendor.email}
                          onChange={(e) => {
                            const updated = [...tenderVendors];
                            updated[index].email = e.target.value;
                            setTenderVendors(updated);
                          }}
                          className="input-field py-1 px-2 text-sm w-full"
                          placeholder="email@example.com"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            value={vendor.quoted_amount}
                            onChange={(e) => {
                              const updated = [...tenderVendors];
                              updated[index].quoted_amount = e.target.value;
                              setTenderVendors(updated);
                            }}
                            className="input-field py-1 pl-5 pr-1 text-sm w-full"
                            placeholder="Amount"
                          />
                          <span className="absolute left-1.5 top-2 text-xs text-slate-400 font-bold">₹</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={vendor.is_qualified ? 'qualified' : 'unqualified'}
                          onChange={(e) => {
                            const updated = [...tenderVendors];
                            updated[index].is_qualified = e.target.value === 'qualified';
                            setTenderVendors(updated);
                          }}
                          className="input-field py-1 px-2 text-sm w-full"
                        >
                          <option value="qualified">Qualified</option>
                          <option value="unqualified">Not Qualified</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={vendor.remarks}
                          onChange={(e) => {
                            const updated = [...tenderVendors];
                            updated[index].remarks = e.target.value;
                            setTenderVendors(updated);
                          }}
                          className="input-field py-1 px-2 text-sm w-full"
                          placeholder="Remarks"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...tenderVendors];
                            updated.splice(index, 1);
                            setTenderVendors(updated);
                          }}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <label className="label text-slate-700 font-bold">Remarks *</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Provide remarks to register and advance this step..."
              className="input-field min-h-[80px]"
            />
          </div>

          <button 
            onClick={handleTenderSubmit} 
            disabled={actionLoading || !tenderRef || !tenderDate || tenderVendors.length === 0 || !remarks.trim()}
            className="btn-primary w-full py-2.5 mt-2 flex justify-center items-center gap-2"
          >
            Submit Tender Details & Advance
          </button>
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
            <div className="overflow-x-auto border border-slate-200 rounded">
              <table className="min-w-full text-sm text-slate-700 divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold text-slate-600">Vendor Name</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-600">Vendor Email</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-600">Quoted Amount</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-600">Techno-Commercial Status</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-600">Remarks</th>
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
            <label className="label text-slate-700 font-bold">Review Remarks *</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Provide remarks to approve and advance this step..."
              className="input-field min-h-[80px]"
            />
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
              disabled={actionLoading}
              className="btn-primary w-full py-2.5 flex justify-center items-center gap-2"
            >
              <CheckCircle2 size={16} /> Approve & Forward
            </button>
          </div>
        </div>
      )}

      {/* Technical Evaluation checklist form */}
      {phaseName === 'Technical Evaluation' && pr.flow?.expected_group === 'faculty' && (
        <div className="space-y-4 bg-white p-4 border border-blue-200 rounded">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Register Technical Qualification</h4>
          
          {!pr.commercial_evaluations || pr.commercial_evaluations.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-slate-200 rounded bg-slate-50 space-y-2">
              <p className="text-sm text-slate-500 italic">No vendors exist yet in commercial bids.</p>
              <p className="text-xs text-slate-400">Please go back to the Tendering phase or add commercial vendors first.</p>
            </div>
          ) : (
            <div className="space-y-3">
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

              {/* Live Ranking & Award Selection */}
              {Object.values(techQualifications).some(v => v.is_qualified) && pr.financial_evaluations && pr.financial_evaluations.length > 0 && (
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

              <button 
                onClick={handleTechEvalSubmit} 
                disabled={actionLoading}
                className="btn-primary w-full py-2.5 mt-2"
              >
                Submit Technical Qualification & Advance
              </button>
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
            <div className="space-y-3">
              {pr.technical_evaluations.filter(t => t.is_qualified).map(te => {
                const state = finBids[te.vendor_name] || { quoted_amount: '', remarks: '' };
                const ranking = liveRankings[te.vendor_name] || '-';
                const isL1 = ranking === 'L1';
                const isL2 = ranking === 'L2';

                return (
                  <div 
                    key={te.id} 
                    className={`flex flex-col md:flex-row gap-3 items-start md:items-center p-3 border rounded transition-colors ${
                      isL1 ? 'bg-green-50 border-green-200' : isL2 ? 'bg-yellow-50 border-yellow-200' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="w-full md:w-1/3 flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-700">{te.vendor_name}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${isL1 ? 'bg-green-100 text-green-800' : isL2 ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-600'}`}>
                        Rank: {ranking}
                      </span>
                    </div>
                    <div className="flex-1 flex gap-2 w-full">
                      <div className="relative flex-1">
                        <input 
                          type="number"
                          step="0.01"
                          value={state.quoted_amount}
                          onChange={(e) => setFinBids({
                            ...finBids,
                            [te.vendor_name]: { ...state, quoted_amount: e.target.value }
                          })}
                          className="input-field py-1.5 pl-6"
                          placeholder="Quoted Amount"
                        />
                        <span className="absolute left-2.5 top-2.5 text-xs text-slate-400 font-bold">₹</span>
                        <span className="absolute right-2 top-2.5 text-xs text-slate-400 font-medium font-sans pr-1">Lakhs</span>
                      </div>
                      <input 
                        type="text"
                        value={state.remarks}
                        onChange={(e) => setFinBids({
                          ...finBids,
                          [te.vendor_name]: { ...state, remarks: e.target.value }
                        })}
                        className="input-field py-1.5 flex-1"
                        placeholder="Remarks"
                      />
                    </div>
                  </div>
                );
              })}

              <button 
                onClick={handleFinBidsSubmit} 
                disabled={actionLoading}
                className="btn-primary w-full py-2.5 mt-2"
              >
                Submit Financial Bids & Advance
              </button>
            </div>
          )}
        </div>
      )}

      {/* Standard text remarks & actions */}
      <div className="space-y-4 pt-2 border-t border-blue-200">
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
            (phaseName === 'Technical Evaluation' && pr.flow?.expected_group !== 'faculty') ||
            (phaseName === 'Financial Sanction' && pr.flow?.expected_group !== 'faculty')
          ) && (
            <button onClick={handleAdvance} disabled={actionLoading} className="btn-primary flex items-center gap-2">
              <CheckCircle2 size={16} /> Approve & Forward
            </button>
          )}
          
          {/* Rejection button */}
          <button onClick={handleReject} disabled={actionLoading} className="btn-danger flex items-center gap-2">
            <XCircle size={16} /> Reject
          </button>

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
    </div>
  );
};
