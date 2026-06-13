import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Info } from 'lucide-react';
import { budgetApi, aaApi } from '../services/api';
import { formatCurrency } from '../utils/format';

export const AdministrativeApprovalCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | ''>('');
  const [itemDescription, setItemDescription] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [gstRate, setGstRate] = useState<number>(18); // Default 18%
  const [modeOfProcurement, setModeOfProcurement] = useState('GeM');
  const [justification, setJustification] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

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
      });
      const newAaId = response.data.id;
      if (attachmentFile && newAaId) {
        await aaApi.uploadAttachment(newAaId, attachmentFile);
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
            </div>

            {/* Section 2 - Item Information */}
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
                    <span className="text-xs font-semibold text-slate-500 block mb-1">GST Amount (Auto Calculated)</span>
                    <span className="font-bold text-slate-800 text-sm block pt-2">{formatCurrency(calculatedValues.gstAmount)}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-500 block mb-1">Total Cost (Auto Calculated)</span>
                    <span className="font-bold text-slate-800 text-sm block pt-2">{formatCurrency(calculatedValues.totalCost)}</span>
                  </div>
                </div>
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
                    <option value="Open Tender">Open Tender</option>
                    <option value="Limited Tender">Limited Tender</option>
                    <option value="Proprietary Purchase">Proprietary Purchase</option>
                    <option value="Single Tender">Single Tender</option>
                    <option value="Rate Contract">Rate Contract</option>
                    <option value="Local Purchase">Local Purchase</option>
                    <option value="Other">Other</option>
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

            {/* Section 4 – Supporting Attachment */}
            <div className="card p-6 bg-white shadow rounded-lg border border-slate-200 space-y-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b pb-2">
                Section 4 – Supporting Attachment (Optional)
              </h2>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Upload Supporting Document (PDF, PNG, JPG, JPEG under 10MB)
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      const file = e.target.files[0];
                      if (file.size > 10 * 1024 * 1024) {
                        toast.error('File size must be under 10MB.');
                        e.target.value = '';
                      } else {
                        setAttachmentFile(file);
                      }
                    } else {
                      setAttachmentFile(null);
                    }
                  }}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
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
