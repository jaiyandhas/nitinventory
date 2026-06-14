import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Info } from 'lucide-react';
import { budgetApi, aaApi } from '../services/api';
import { formatCurrency } from '../utils/format';

export const AdministrativeApprovalCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryBudgetId = searchParams.get('budget_id');
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | ''>(
    queryBudgetId ? Number(queryBudgetId) : ''
  );

  useEffect(() => {
    if (queryBudgetId) {
      setSelectedBudgetId(Number(queryBudgetId));
    }
  }, [queryBudgetId]);
  const [itemDescription, setItemDescription] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [gstRate, setGstRate] = useState<number>(18); // Default 18%
  const [modeOfProcurement, setModeOfProcurement] = useState('GeM');
  const [justification, setJustification] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  // Compliance states
  const [itemCategory, setItemCategory] = useState<'Assets' | 'Consumables'>('Assets');
  const [stockAvailable, setStockAvailable] = useState<'Yes' | 'No'>('No');
  const [presentStock, setPresentStock] = useState('');
  const [prevFileNo, setPrevFileNo] = useState('');
  const [justificationProcurement, setJustificationProcurement] = useState('');
  
  // Files
  const [basisOfEstimationFile, setBasisOfEstimationFile] = useState<File | null>(null);
  const [gemNonAvailabilityFile, setGemNonAvailabilityFile] = useState<File | null>(null);
  const [authorityApprovalFile, setAuthorityApprovalFile] = useState<File | null>(null);
  const [pacDeptCertFile, setPacDeptCertFile] = useState<File | null>(null);
  const [pacVendorCertFile, setPacVendorCertFile] = useState<File | null>(null);

  // Declarations
  const [declGeneric, setDeclGeneric] = useState(false);
  const [declSpecifications, setDeclSpecifications] = useState(false);
  const [declMii, setDeclMii] = useState(false);

  // Fetch PI budget allocations
  const { data: budgetFiles = [], isLoading: loadingBudgets } = useQuery({
    queryKey: ['pi-budget-files'],
    queryFn: () => budgetApi.files().then((r) => r.data),
    refetchOnMount: 'always',
  });

  const selectedBudget = useMemo(() => {
    return budgetFiles.find((f: any) => f.id === selectedBudgetId);
  }, [budgetFiles, selectedBudgetId]);

  // Sync quantity from selected budget file
  useEffect(() => {
    if (selectedBudget) {
      setQuantity(selectedBudget.quantity);
    }
  }, [selectedBudget]);

  // System Calculations
  const calculatedValues = useMemo(() => {
    if (!selectedBudget) return { gstAmount: 0, totalCost: 0, baseCost: 0 };
    const baseCost = quantity * selectedBudget.unit_cost;
    const gstAmount = baseCost * (gstRate / 100);
    const totalCost = baseCost + gstAmount;
    return { gstAmount, totalCost, baseCost };
  }, [selectedBudget, quantity, gstRate]);

  // Validate preconditions
  const nomineeSelectionCompleted = useMemo(() => {
    if (!selectedBudget) return true; // not selected yet
    // HOD nominees are expert1 and expert2
    return !!selectedBudget.expert1_id && !!selectedBudget.expert2_id;
  }, [selectedBudget]);

  const budgetIsSufficient = useMemo(() => {
    if (!selectedBudget) return true;
    return calculatedValues.totalCost <= selectedBudget.available_amount;
  }, [selectedBudget, calculatedValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBudgetId) {
      toast.error('Please select a Budget Allocation.');
      return;
    }
    if (quantity <= 0) {
      toast.error('Quantity must be greater than zero.');
      return;
    }
    if (!itemDescription.trim()) {
      toast.error('Item Description is mandatory.');
      return;
    }
    if (gstRate < 0) {
      toast.error('GST (%) must be greater than or equal to zero.');
      return;
    }
    if (!modeOfProcurement.trim()) {
      toast.error('Mode of Procurement is mandatory.');
      return;
    }
    if (!justification.trim()) {
      toast.error('Justification for Purchase is mandatory.');
      return;
    }

    // Compliance validation
    if (stockAvailable === 'Yes') {
      if (!presentStock.trim()) {
        toast.error('Present stock quantity is mandatory.');
        return;
      }
      if (!prevFileNo.trim()) {
        toast.error('Reference of previous file number is mandatory.');
        return;
      }
      if (!justificationProcurement.trim()) {
        toast.error('Justification for present procurement is mandatory.');
        return;
      }
    }

    // Attachment validation
    if (!basisOfEstimationFile) {
      toast.error('Basis of estimation file must be attached.');
      return;
    }
    if (modeOfProcurement !== 'GeM' && !gemNonAvailabilityFile) {
      toast.error('GeM Non-Availability report is required for procurement outside GeM.');
      return;
    }
    const needsAuthorityApproval = ['PAC', 'Nomination', 'Committee purchase (GFR 155)', 'Direct Purchase (GFR 154)'].includes(modeOfProcurement);
    if (needsAuthorityApproval && !authorityApprovalFile) {
      toast.error('Basic approval from competent authority must be attached.');
      return;
    }
    if (modeOfProcurement === 'PAC') {
      if (!pacDeptCertFile || !pacVendorCertFile) {
        toast.error('Both department and vendor PAC certificates must be attached.');
        return;
      }
    }

    // Declarations validation
    if (!declGeneric || !declSpecifications || !declMii) {
      toast.error('You must read and check all compliance declarations.');
      return;
    }

    if (!nomineeSelectionCompleted) {
      toast.error('HOD Nominee selection is not completed. Please contact your HOD.');
      return;
    }

    if (!budgetIsSufficient) {
      toast.error('Total Cost exceeds the Available Budget Balance.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await aaApi.create({
        budget_file_id: selectedBudgetId as number,
        quantity,
        item_description: itemDescription,
        gst_rate: gstRate,
        mode_of_procurement: modeOfProcurement,
        justification,
        item_category: itemCategory,
        stock_availability: stockAvailable,
        present_stock: stockAvailable === 'Yes' ? presentStock : null,
        prev_file_no: stockAvailable === 'Yes' ? prevFileNo : null,
        justification_procurement: stockAvailable === 'Yes' ? justificationProcurement : null,
        generic_specification_declaration: declGeneric && declSpecifications && declMii,
      });
      const newAaId = response.data.id;
      if (newAaId) {
        // Sequentially upload all files
        if (attachmentFile) {
          await aaApi.uploadAttachment(newAaId, attachmentFile);
        }
        if (basisOfEstimationFile) {
          await aaApi.uploadAttachment(newAaId, basisOfEstimationFile, 'basis_of_estimation');
        }
        if (gemNonAvailabilityFile) {
          await aaApi.uploadAttachment(newAaId, gemNonAvailabilityFile, 'gem_non_availability');
        }
        if (authorityApprovalFile) {
          await aaApi.uploadAttachment(newAaId, authorityApprovalFile, 'authority_approval');
        }
        if (pacDeptCertFile) {
          await aaApi.uploadAttachment(newAaId, pacDeptCertFile, 'pac_dept_cert');
        }
        if (pacVendorCertFile) {
          await aaApi.uploadAttachment(newAaId, pacVendorCertFile, 'pac_vendor_cert');
        }
      }
      toast.success('Administrative Approval request submitted successfully.');
      queryClient.invalidateQueries({ queryKey: ['administrative-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-aas'] });
      queryClient.invalidateQueries({ queryKey: ['pi-budget-files'] });
      navigate('/administrative-approvals');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(detail || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/administrative-approvals')}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Initiate Administrative Approval</h1>
          <p className="text-slate-500 text-sm">Create a preliminary approval request for procurement.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Budget Allocation Selector */}
        <div className="card p-6 bg-white shadow rounded-lg border border-slate-200">
          <label className="block text-sm font-bold text-slate-700 mb-2">Select Budget Allocation</label>
          {loadingBudgets ? (
            <div className="text-slate-500 text-sm flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading your budget allocations...
            </div>
          ) : (
            <select
              value={selectedBudgetId}
              onChange={(e) => setSelectedBudgetId(e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b] bg-white"
              required
            >
              <option value="">-- Choose Budget Allocation --</option>
              {budgetFiles.map((file: any) => (
                <option key={file.id} value={file.id}>
                  {file.file_no} | {file.item_name} (Avail: {formatCurrency(file.available_amount)})
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedBudget && (
          <>
            {/* Warnings/Checks */}
            {!nomineeSelectionCompleted && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-800">
                <Info size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">HOD Nominee Selection Incomplete</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Your Head of Department has not selected committee nominees (Expert 1 and Expert 2) for this budget allocation file yet.
                    You cannot submit this request until HOD selection is completed.
                  </p>
                </div>
              </div>
            )}

            {!budgetIsSufficient && (
              <div className="flex items-start gap-3 bg-rose-50 border border-rose-300 rounded-lg p-4 text-sm text-rose-800">
                <Info size={18} className="text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Insufficient Budget Balance</p>
                  <p className="text-xs text-rose-700 mt-1">
                    The requested Total Cost exceeds the Available Budget Balance. Please review your budget allocations.
                  </p>
                </div>
              </div>
            )}

            {/* Section 1 - Budget Information */}
            <div className="card p-6 bg-white shadow rounded-lg border border-slate-200 space-y-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b pb-2">
                Section 1 – Budget Information (Retrieved)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 block">PI Name</span>
                  <span className="font-bold text-slate-800">{selectedBudget.allocated_initiator?.name || 'Retrieved'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Department</span>
                  <span className="font-bold text-slate-800">{selectedBudget.department || 'Retrieved'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Source of Fund</span>
                  <span className="font-bold text-slate-800">{selectedBudget.source_of_fund || 'Retrieved'}</span>
                </div>
                {selectedBudget.project_code && (
                  <div>
                    <span className="text-slate-500 block">Project Code</span>
                    <span className="font-bold text-slate-800">{selectedBudget.project_code}</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-500 block">Financial Year</span>
                  <span className="font-bold text-slate-800">{selectedBudget.financial_year || 'Retrieved'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Allocated Budget</span>
                  <span className="font-bold text-slate-800">{formatCurrency(selectedBudget.total_allocation)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Available Budget Balance</span>
                  <span className="font-bold text-slate-800">{formatCurrency(selectedBudget.available_amount)}</span>
                </div>
              </div>
            </div>            {/* Section 2 - Item Information */}
            <div className="card p-6 bg-white shadow rounded-lg border border-slate-200 space-y-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b pb-2">
                Section 2 – Item Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Item Name (Retrieved)</label>
                  <input
                    type="text"
                    value={selectedBudget.item_name}
                    disabled
                    className="w-full border border-slate-200 bg-slate-50 rounded-lg py-2 px-3 text-sm font-medium text-slate-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Item Description / Detailed Requirement <span className="text-rose-500">*</span></label>
                  <textarea
                    rows={3}
                    placeholder="Enter detailed specifications or description of the required item..."
                    value={itemDescription}
                    onChange={(e) => setItemDescription(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity <span className="text-rose-500">*</span></label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={quantity || ''}
                      onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
                      className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">GST (%) <span className="text-rose-500">*</span></label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={gstRate}
                      onChange={(e) => setGstRate(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]"
                      required
                    />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-505 block mb-1">GST Amount (Auto Calculated)</span>
                    <span className="font-bold text-slate-800 text-sm block pt-2">{formatCurrency(calculatedValues.gstAmount)}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-505 block mb-1">Total Cost (Auto Calculated)</span>
                    <span className="font-bold text-slate-800 text-sm block pt-2">{formatCurrency(calculatedValues.totalCost)}</span>
                  </div>
                </div>

                {/* Compliance additions under Section 2 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">Category of Item <span className="text-rose-500">*</span></label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="itemCategory"
                          value="Assets"
                          checked={itemCategory === 'Assets'}
                          onChange={() => setItemCategory('Assets')}
                          className="accent-[#1a3a6b]"
                        />
                        Assets
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="itemCategory"
                          value="Consumables"
                          checked={itemCategory === 'Consumables'}
                          onChange={() => setItemCategory('Consumables')}
                          className="accent-[#1a3a6b]"
                        />
                        Consumables
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">Availability of Item in the Department? <span className="text-rose-500">*</span></label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="stockAvailable"
                          value="Yes"
                          checked={stockAvailable === 'Yes'}
                          onChange={() => setStockAvailable('Yes')}
                          className="accent-[#1a3a6b]"
                        />
                        Yes
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="stockAvailable"
                          value="No"
                          checked={stockAvailable === 'No'}
                          onChange={() => setStockAvailable('No')}
                          className="accent-[#1a3a6b]"
                        />
                        No
                      </label>
                    </div>
                  </div>
                </div>

                {stockAvailable === 'Yes' && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Present Stock Quantity <span className="text-rose-500">*</span></label>
                        <input
                          type="text"
                          placeholder="e.g. 5 units, 10 liters"
                          value={presentStock}
                          onChange={(e) => setPresentStock(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b] bg-white"
                          required={stockAvailable === 'Yes'}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Reference of Previous File No. <span className="text-rose-500">*</span></label>
                        <input
                          type="text"
                          placeholder="e.g. NITT/F.No.025/CS/2025-26"
                          value={prevFileNo}
                          onChange={(e) => setPrevFileNo(e.target.value)}
                          className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b] bg-white"
                          required={stockAvailable === 'Yes'}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Justification for Present Procurement <span className="text-rose-500">*</span></label>
                      <textarea
                        rows={2}
                        placeholder="Enter reasoning why additional procurement is required despite existing stock..."
                        value={justificationProcurement}
                        onChange={(e) => setJustificationProcurement(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b] bg-white"
                        required={stockAvailable === 'Yes'}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 3 - Procurement Information */}
            <div className="card p-6 bg-white shadow rounded-lg border border-slate-200 space-y-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b pb-2">
                Section 3 – Procurement Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mode of Procurement <span className="text-rose-500">*</span></label>
                  <select
                    value={modeOfProcurement}
                    onChange={(e) => setModeOfProcurement(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b] bg-white"
                    required
                  >
                    <option value="GeM">GeM</option>
                    <option value="CPPP">CPPP</option>
                    <option value="Direct Purchase (GFR 154)">Direct Purchase (GFR 154)</option>
                    <option value="Committee purchase (GFR 155)">Committee purchase (GFR 155)</option>
                    <option value="PAC">PAC</option>
                    <option value="Limited Tender Enquiry">Limited Tender Enquiry</option>
                    <option value="Nomination">Nomination</option>
                    <option value="Global Tender Enquiry">Global Tender Enquiry</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Justification for Purchase <span className="text-rose-500">*</span></label>
                  <textarea
                    rows={3}
                    placeholder="Enter detailed reason and justification for selecting this item and procurement mode..."
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Section 4 – Compliance Documents Upload */}
            <div className="card p-6 bg-white shadow rounded-lg border border-slate-200 space-y-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b pb-2">
                Section 4 – Compliance Documents Upload
              </h2>
              <div className="space-y-4">
                {/* Basis of Estimation */}
                <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-800">Basis of Estimation <span className="text-rose-500">*</span></label>
                    <p className="text-xs text-slate-500">Please attach a budgetary quote, previous purchase reference, or market survey.</p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setBasisOfEstimationFile(e.target.files?.[0] || null)}
                    className="text-xs text-slate-600"
                    required
                  />
                </div>

                {/* GeM Non-Availability (Required for non-GeM) */}
                {modeOfProcurement !== 'GeM' && (
                  <div className="border border-rose-100 rounded-lg p-3 bg-rose-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-800">GeM Non-Availability Report <span className="text-rose-500">*</span></label>
                      <p className="text-xs text-rose-600/90 font-medium">Mandatory. Please enclose the GeM Non-Availability report for procurement outside GeM.</p>
                    </div>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => setGemNonAvailabilityFile(e.target.files?.[0] || null)}
                      className="text-xs text-slate-600"
                      required={modeOfProcurement !== 'GeM'}
                    />
                  </div>
                )}

                {/* Competent Authority Approval (for PAC, Nomination, Committee, Direct Purchase) */}
                {['PAC', 'Nomination', 'Committee purchase (GFR 155)', 'Direct Purchase (GFR 154)'].includes(modeOfProcurement) && (
                  <div className="border border-amber-100 rounded-lg p-3 bg-amber-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-800">Competent Authority Basic Approval <span className="text-rose-500">*</span></label>
                      <p className="text-xs text-amber-800/90 font-medium">Mandatory. A separate basic approval from the competent authority has to be attached.</p>
                    </div>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => setAuthorityApprovalFile(e.target.files?.[0] || null)}
                      className="text-xs text-slate-600"
                      required
                    />
                  </div>
                )}

                {/* PAC Certificates */}
                {modeOfProcurement === 'PAC' && (
                  <div className="border border-indigo-100 rounded-lg p-4 bg-indigo-50/20 space-y-3">
                    <span className="block text-xs font-bold text-indigo-800 uppercase tracking-wider">PAC Compliance Certificates</span>
                    
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-3 border-indigo-100/50">
                      <div>
                        <label className="block text-sm font-semibold text-slate-800">PAC Certificate from Department <span className="text-rose-500">*</span></label>
                        <p className="text-xs text-slate-500">Enclose the official PAC certificate from the indenting department.</p>
                      </div>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(e) => setPacDeptCertFile(e.target.files?.[0] || null)}
                        className="text-xs text-slate-600"
                        required={modeOfProcurement === 'PAC'}
                      />
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
                      <div>
                        <label className="block text-sm font-semibold text-slate-800">PAC Certificate from Vendor <span className="text-rose-500">*</span></label>
                        <p className="text-xs text-slate-500">Enclose the proprietary certificate supplied by the OEM/Vendor.</p>
                      </div>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(e) => setPacVendorCertFile(e.target.files?.[0] || null)}
                        className="text-xs text-slate-600"
                        required={modeOfProcurement === 'PAC'}
                      />
                    </div>
                  </div>
                )}

                {/* Additional Supporting Attachment */}
                <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-800 font-normal">Other Supporting Attachment (Optional)</label>
                    <p className="text-xs text-slate-500">Any other brochure, spec sheet, or document.</p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                    className="text-xs text-slate-600"
                  />
                </div>
              </div>
            </div>

            {/* Section 5 – Compliance Declarations */}
            <div className="card p-6 bg-white shadow rounded-lg border border-slate-200 space-y-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b pb-2">
                Section 5 – Compliance Declarations
              </h2>
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-slate-50 select-none">
                  <input
                    type="checkbox"
                    checked={declGeneric}
                    onChange={(e) => setDeclGeneric(e.target.checked)}
                    className="mt-1 accent-[#1a3a6b] shrink-0"
                    required
                  />
                  <span className="text-xs text-slate-700 leading-relaxed font-medium">
                    Certified that the description of the item/equipment/service indented is generic and does not indicate any particular trade mark, trade name and brand. The specifications are generic and broad based without having any restrictive parameters.
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-slate-50 select-none">
                  <input
                    type="checkbox"
                    checked={declSpecifications}
                    onChange={(e) => setDeclSpecifications(e.target.checked)}
                    className="mt-1 accent-[#1a3a6b] shrink-0"
                    required
                  />
                  <span className="text-xs text-slate-700 leading-relaxed font-medium">
                    Certified that the technical specifications of the item/equipment/service are generic and broad based and are enclosed herewith.
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-slate-50 select-none">
                  <input
                    type="checkbox"
                    checked={declMii}
                    onChange={(e) => setDeclMii(e.target.checked)}
                    className="mt-1 accent-[#1a3a6b] shrink-0"
                    required
                  />
                  <span className="text-xs text-slate-700 leading-relaxed font-medium">
                    Certified that the item/equipment/service conforms to GFR provisions and local content requirements under Make In India policy.
                  </span>
                </label>
              </div>
            </div>

            {/* Submission Controls */}
            <div className="flex gap-4 items-center justify-end">
              <button
                type="button"
                className="btn-secondary py-2 px-4 border border-slate-300 hover:bg-slate-50 rounded text-slate-700 font-semibold text-sm"
                onClick={() => navigate('/administrative-approvals')}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !nomineeSelectionCompleted || !budgetIsSufficient}
                className="btn-primary py-2 px-6 flex items-center justify-center gap-2 bg-[#1a3a6b] hover:bg-[#1a3a6b]/90 text-white font-semibold text-sm rounded shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Submitting...
                  </>
                ) : (
                  'Submit for Approval'
                )}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
};
