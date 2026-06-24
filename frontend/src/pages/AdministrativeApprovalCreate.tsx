import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Info } from 'lucide-react';
import { budgetApi, aaApi } from '../services/api';
import { formatCurrency } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const numberToWordsINR = (num: number): string => {
  const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const numToWords = (n: number): string => {
    if (n < 20) return a[n];
    const d = n % 10;
    return b[Math.floor(n / 10)] + (d ? '-' + a[d] : '');
  };
  const convert = (n: number): string => {
    if (n === 0) return 'zero';
    let s = '';
    const cr = Math.floor(n / 10000000); n %= 10000000;
    if (cr > 0) s += numToWords(cr) + ' crore ';
    const lk = Math.floor(n / 100000); n %= 100000;
    if (lk > 0) s += numToWords(lk) + ' lakh ';
    const th = Math.floor(n / 1000); n %= 1000;
    if (th > 0) s += numToWords(th) + ' thousand ';
    const hu = Math.floor(n / 100); n %= 100;
    if (hu > 0) s += numToWords(hu) + ' hundred ';
    if (n > 0) { if (s) s += 'and '; s += numToWords(n) + ' '; }
    return s.trim();
  };
  const intPart = Math.floor(num);
  const dec = Math.round((num - intPart) * 100);
  let result = convert(intPart) + ' rupees';
  if (dec > 0) result += ' and ' + convert(dec) + ' paise';
  return result.replace(/\s+/g, ' ').trim() + ' only';
};

export const AdministrativeApprovalCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryBudgetId = searchParams.get('budget_id');
  const queryClient = useQueryClient();
  const { user } = useAuth();
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
  interface ItemDetail {
    id: string;
    description: string;
    qty: number;
    unitCost: number;
    gstRate: number;
  }

  const [itemsList, setItemsList] = useState<ItemDetail[]>([
    { id: Date.now().toString(), description: '', qty: 1, unitCost: 0, gstRate: 0 }
  ]);
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

  // Declarations (NIT-style)
  const [declEligibility, setDeclEligibility] = useState(false);
  const [declDemandDivision, setDeclDemandDivision] = useState(false);

  // Sub-procurement method: applies to modes that can be done via GeM, outside GeM, or via CPPP
  const [subProcurementMethod, setSubProcurementMethod] = useState<'gem' | 'outside_gem' | 'cppp'>('outside_gem');

  // Fetch PI budget allocations
  const { data: budgetFiles = [], isLoading: loadingBudgets } = useQuery({
    queryKey: ['pi-budget-files'],
    queryFn: () => budgetApi.files().then((r) => r.data),
    refetchOnMount: 'always',
  });

  const selectedBudget = useMemo(() => {
    return budgetFiles.find((f: any) => f.id === selectedBudgetId);
  }, [budgetFiles, selectedBudgetId]);

  // Sync initial item from selected budget file
  useEffect(() => {
    if (selectedBudget) {
      setItemsList([{
        id: Date.now().toString(),
        description: selectedBudget.item_name || '',
        qty: selectedBudget.quantity || 1,
        unitCost: selectedBudget.unit_cost || 0,
        gstRate: 0
      }]);
    }
  }, [selectedBudget]);

  // System Calculations
  const calculatedValues = useMemo(() => {
    let baseCost = 0;
    let gstAmount = 0;
    itemsList.forEach(item => {
      const itemBase = item.qty * item.unitCost;
      baseCost += itemBase;
      gstAmount += itemBase * (item.gstRate / 100);
    });
    const totalCost = baseCost + gstAmount;
    return { gstAmount, totalCost, baseCost };
  }, [itemsList]);

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

  // Modes that need a sub-method question (GeM / Outside GeM / CPPP)
  const SUB_METHOD_MODES = ['PAC', 'Limited Tender Enquiry', 'Nomination', 'Global Tender Enquiry', 'Direct Purchase (GFR 154)', 'Committee purchase (GFR 155)'];
  const needsSubMethod = SUB_METHOD_MODES.includes(modeOfProcurement);
  const isPureGem = modeOfProcurement === 'GeM';

  // Document requirement flags derived from (mode × sub_method)
  const showGemNonAvail = needsSubMethod
    ? subProcurementMethod === 'outside_gem'
    : !isPureGem; // CPPP standalone → true; GeM standalone → false

  const showAuthorityApproval = needsSubMethod
    ? (subProcurementMethod === 'cppp' ||
       (subProcurementMethod === 'outside_gem' && ['PAC', 'Nomination', 'Committee purchase (GFR 155)', 'Direct Purchase (GFR 154)', 'Global Tender Enquiry'].includes(modeOfProcurement)) ||
       (subProcurementMethod === 'gem' && ['PAC', 'Nomination'].includes(modeOfProcurement)))
    : ['PAC', 'Nomination', 'Committee purchase (GFR 155)', 'Direct Purchase (GFR 154)'].includes(modeOfProcurement);

  const showPacCerts = modeOfProcurement === 'PAC' && (!needsSubMethod || subProcurementMethod === 'outside_gem');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBudgetId) {
      toast.error('Please select a Budget Allocation.');
      return;
    }
    if (itemsList.length === 0) {
      toast.error('At least one item is required.');
      return;
    }
    const hasInvalidItem = itemsList.some(i => !i.description.trim() || i.qty <= 0 || i.unitCost < 0 || i.gstRate < 0);
    if (hasInvalidItem) {
      toast.error('Please fill all item details correctly.');
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
    if (showGemNonAvail && !gemNonAvailabilityFile) {
      toast.error('GeM Non-Availability report is required for procurement outside GeM.');
      return;
    }
    if (showAuthorityApproval && !authorityApprovalFile) {
      toast.error(subProcurementMethod === 'cppp' ? 'CPPP NIT document must be attached.' : 'Basic approval from competent authority must be attached.');
      return;
    }
    if (showPacCerts) {
      if (!pacDeptCertFile || !pacVendorCertFile) {
        toast.error('Both department and vendor PAC certificates must be attached.');
        return;
      }
    }

    // Declarations validation
    if (!declEligibility || !declDemandDivision) {
      toast.error('You must certify both compliance declarations before submitting.');
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
        quantity: itemsList.reduce((acc, i) => acc + i.qty, 0),
        item_description: itemsList.map(i => `${i.description} (Qty: ${i.qty}, Cost: ${i.unitCost}, GST: ${i.gstRate}%)`).join('\n'),
        gst_rate: itemsList[0]?.gstRate || 18,
        total_cost: calculatedValues.totalCost,
        gst_amount: calculatedValues.gstAmount,
        mode_of_procurement: modeOfProcurement,
        sub_procurement_method: needsSubMethod ? subProcurementMethod : null,
        justification,
        item_category: itemCategory,
        stock_availability: stockAvailable,
        present_stock: stockAvailable === 'Yes' ? presentStock : null,
        prev_file_no: stockAvailable === 'Yes' ? prevFileNo : null,
        justification_procurement: stockAvailable === 'Yes' ? justificationProcurement : null,
        generic_specification_declaration: declEligibility && declDemandDivision,
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

            {/* Section 1 - Budget Information (Traditional bordered table) */}
            <div style={{ background: '#fff', border: '1px solid #888', padding: '14px 16px', fontFamily: 'Times New Roman, Times, serif' }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #000', paddingBottom: '5px', marginBottom: '8px', color: '#000' }}>
                Section 1 – Budget Information (Retrieved)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', color: '#000' }}>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', width: '22%', background: '#f7f7f7' }}>PI / Indentor Name</td>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', width: '28%' }}>{selectedBudget.allocated_initiator?.name || '—'}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', width: '22%', background: '#f7f7f7' }}>Department</td>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', width: '28%' }}>{selectedBudget.department || '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', background: '#f7f7f7' }}>Designation</td>
                    <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{user?.designation || '—'}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', background: '#f7f7f7' }}>Contact (Email)</td>
                    <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{user?.email || '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', background: '#f7f7f7' }}>Source of Fund</td>
                    <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{selectedBudget.source_of_fund || '—'}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', background: '#f7f7f7' }}>Financial Year</td>
                    <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{selectedBudget.financial_year || '—'}</td>
                  </tr>
                  {selectedBudget.project_code && (
                    <tr>
                      <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', background: '#f7f7f7' }}>Project Code</td>
                      <td style={{ border: '1px solid #000', padding: '4px 8px' }} colSpan={3}>{selectedBudget.project_code}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', background: '#f7f7f7' }}>Allocated Budget</td>
                    <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{formatCurrency(selectedBudget.total_allocation)}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', background: '#f7f7f7' }}>Available Budget Balance</td>
                    <td style={{ border: '1px solid #000', padding: '4px 8px' }}>{formatCurrency(selectedBudget.available_amount)}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', background: '#f7f7f7' }}>Estimated Amount (Incl. GST)</td>
                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', color: calculatedValues.totalCost > selectedBudget.available_amount ? '#c00' : '#000' }} colSpan={3}>
                      {formatCurrency(calculatedValues.totalCost)}
                      {calculatedValues.totalCost > 0 && (
                        <span style={{ fontWeight: 'normal', fontSize: '11px', marginLeft: '8px', color: '#555' }}>(auto-calculated from item details)</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Section 2 - Item Information */}
            <div style={{ background: '#fff', border: '1px solid #888', padding: '14px 16px', fontFamily: 'Times New Roman, Times, serif' }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #000', paddingBottom: '5px', marginBottom: '10px', color: '#000', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Section 2 – Details of the required items</span>
                <button 
                  type="button" 
                  onClick={() => setItemsList([...itemsList, { id: Date.now().toString(), description: '', qty: 1, unitCost: 0, gstRate: 18 }])}
                  className="text-xs text-blue-600 hover:underline font-normal normal-case"
                >
                  + Add Item
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', color: '#000', textAlign: 'center' }}>
                  <thead>
                    <tr style={{ background: '#f7f7f7' }}>
                      <th style={{ border: '1px solid #000', padding: '4px', width: '5%' }}>S.No</th>
                      <th style={{ border: '1px solid #000', padding: '4px', width: '35%' }}>Description of the Item</th>
                      <th style={{ border: '1px solid #000', padding: '4px', width: '10%' }}>Qty</th>
                      <th style={{ border: '1px solid #000', padding: '4px', width: '15%' }}>Unit Cost (Rs.)</th>
                      <th style={{ border: '1px solid #000', padding: '4px', width: '10%' }}>GST %</th>
                      <th style={{ border: '1px solid #000', padding: '4px', width: '10%' }}>GST Amount (Rs.)</th>
                      <th style={{ border: '1px solid #000', padding: '4px', width: '15%' }}>Total Cost (Rs.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsList.map((item, index) => {
                      const itemBase = item.qty * item.unitCost;
                      const itemGst = itemBase * (item.gstRate / 100);
                      const itemTotal = itemBase + itemGst;
                      return (
                        <tr key={item.id}>
                          <td style={{ border: '1px solid #000', padding: '4px' }}>
                            <div className="flex items-center justify-center gap-1">
                              {index + 1}
                              {itemsList.length > 1 && (
                                <button type="button" onClick={() => setItemsList(itemsList.filter(i => i.id !== item.id))} className="text-rose-500 text-xs ml-1" title="Remove row">×</button>
                              )}
                            </div>
                          </td>
                          <td style={{ border: '1px solid #000', padding: '2px' }}>
                            <textarea
                              rows={1}
                              value={item.description}
                              onChange={(e) => setItemsList(itemsList.map(i => i.id === item.id ? { ...i, description: e.target.value } : i))}
                              style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', resize: 'vertical', minHeight: '24px', fontSize: '12.5px', fontFamily: 'inherit', padding: '2px 4px' }}
                              placeholder="Enter item description..."
                              required
                            />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '2px' }}>
                            <input
                              type="number"
                              min="1"
                              value={item.qty || ''}
                              onChange={(e) => setItemsList(itemsList.map(i => i.id === item.id ? { ...i, qty: Math.max(1, parseInt(e.target.value) || 0) } : i))}
                              onWheel={(e) => (e.target as HTMLInputElement).blur()}
                              style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', textAlign: 'center', fontSize: '12.5px', fontFamily: 'inherit' }}
                              required
                            />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '2px' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitCost === 0 ? '' : item.unitCost}
                              onChange={(e) => setItemsList(itemsList.map(i => i.id === item.id ? { ...i, unitCost: parseFloat(e.target.value) || 0 } : i))}
                              onWheel={(e) => (e.target as HTMLInputElement).blur()}
                              style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', textAlign: 'center', fontSize: '12.5px', fontFamily: 'inherit' }}
                              placeholder="0.00"
                              required
                            />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '2px' }}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={item.gstRate === 0 ? '' : item.gstRate}
                              onChange={(e) => setItemsList(itemsList.map(i => i.id === item.id ? { ...i, gstRate: parseFloat(e.target.value) || 0 } : i))}
                              onWheel={(e) => (e.target as HTMLInputElement).blur()}
                              style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', textAlign: 'center', fontSize: '12.5px', fontFamily: 'inherit' }}
                              placeholder="0"
                              required
                            />
                          </td>
                          <td style={{ border: '1px solid #000', padding: '4px' }}>
                            {formatCurrency(itemGst).replace('₹', '')}
                          </td>
                          <td style={{ border: '1px solid #000', padding: '4px', fontWeight: 'bold' }}>
                            {formatCurrency(itemTotal).replace('₹', '')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '16px', textAlign: 'right', fontSize: '12.5px', color: '#000' }}>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ marginRight: '16px' }}>Grand Total Rs.</span>
                  <span style={{ fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '2px', display: 'inline-block', minWidth: '120px', textAlign: 'center' }}>
                    {formatCurrency(calculatedValues.totalCost).replace('₹', '')}
                  </span>
                </div>
                <div style={{ fontStyle: 'italic', fontSize: '11px', color: '#555', textAlign: 'left' }}>
                  <strong>Grand Total (in words):</strong>{' '}
                  <span style={{ textTransform: 'capitalize' }}>
                    {calculatedValues.totalCost > 0 ? numberToWordsINR(calculatedValues.totalCost) : '—'}
                  </span>
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
                    onChange={(e) => { setModeOfProcurement(e.target.value); setSubProcurementMethod('outside_gem'); }}
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

                {/* Sub-procurement method: applies for PAC, LTE, Nomination, GTE, Direct Purchase, Committee */}
                {needsSubMethod && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                    <label className="block text-xs font-semibold text-slate-700">
                      Will this <span className="font-bold">{modeOfProcurement}</span> procurement be done via GeM Portal, outside GeM, or via CPPP? <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-6">
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="subProcurementMethod"
                          value="gem"
                          checked={subProcurementMethod === 'gem'}
                          onChange={() => setSubProcurementMethod('gem')}
                          className="accent-[#1a3a6b]"
                        />
                        Via GeM Portal
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="subProcurementMethod"
                          value="outside_gem"
                          checked={subProcurementMethod === 'outside_gem'}
                          onChange={() => setSubProcurementMethod('outside_gem')}
                          className="accent-[#1a3a6b]"
                        />
                        Outside GeM
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="subProcurementMethod"
                          value="cppp"
                          checked={subProcurementMethod === 'cppp'}
                          onChange={() => setSubProcurementMethod('cppp')}
                          className="accent-[#1a3a6b]"
                        />
                        Via CPPP
                      </label>
                    </div>
                    {subProcurementMethod === 'gem' && (
                      <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                        Procurement will be processed through the <strong>Government e-Marketplace (GeM)</strong>. Justify why {modeOfProcurement} via GeM is the appropriate method.
                      </p>
                    )}
                    {subProcurementMethod === 'outside_gem' && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        Procurement is <strong>outside GeM</strong>. A <strong>GeM Non-Availability Report</strong> is mandatory. Justify why GeM cannot be used and why {modeOfProcurement} is the chosen method.
                      </p>
                    )}
                    {subProcurementMethod === 'cppp' && (
                      <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded px-3 py-2">
                        Procurement will be processed through the <strong>Central Public Procurement Portal (CPPP)</strong>. Attach the CPPP NIT document.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {needsSubMethod
                      ? subProcurementMethod === 'gem'
                        ? `Justification for ${modeOfProcurement} via GeM`
                        : subProcurementMethod === 'cppp'
                        ? `Justification for ${modeOfProcurement} via CPPP`
                        : `Justification for ${modeOfProcurement} outside GeM`
                      : 'Justification for Purchase'
                    }
                    {' '}<span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder={
                      needsSubMethod
                        ? subProcurementMethod === 'gem'
                          ? `Explain why ${modeOfProcurement} via GeM is the appropriate procurement method for this item...`
                          : subProcurementMethod === 'cppp'
                          ? `Explain why ${modeOfProcurement} via CPPP is the appropriate method and provide CPPP tender details...`
                          : `Explain why GeM is not applicable and why ${modeOfProcurement} outside GeM is being chosen. Include details about non-availability on GeM...`
                        : 'Enter detailed reason and justification for selecting this item and procurement mode...'
                    }
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

                {/* GeM Non-Availability (required when outside_gem sub-method, or non-GeM standalone modes) */}
                {showGemNonAvail && (
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
                      required={showGemNonAvail}
                    />
                  </div>
                )}

                {/* Competent Authority Approval / CPPP NIT Document */}
                {showAuthorityApproval && (
                  <div className="border border-amber-100 rounded-lg p-3 bg-amber-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-800">
                        {subProcurementMethod === 'cppp'
                          ? 'CPPP NIT Document'
                          : 'Competent Authority Basic Approval'
                        } <span className="text-rose-500">*</span>
                      </label>
                      <p className="text-xs text-amber-800/90 font-medium">
                        {subProcurementMethod === 'cppp'
                          ? 'Mandatory. Attach the CPPP NIT (Notice Inviting Tender) document.'
                          : 'Mandatory. A separate basic approval from the competent authority has to be attached.'
                        }
                      </p>
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

                {/* PAC Certificates — only for PAC outside GeM */}
                {showPacCerts && (
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
                        required={showPacCerts}
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
                        required={showPacCerts}
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

            {/* Section 5 – Compliance Declarations (NIT-style) */}
            <div style={{ background: '#fff', border: '1px solid #888', padding: '14px 16px', fontFamily: 'Times New Roman, Times, serif' }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #000', paddingBottom: '5px', marginBottom: '10px', color: '#000' }}>
                Section 5 – Declaration
              </div>
              <p style={{ fontSize: '12.5px', marginBottom: '10px', color: '#000' }}>
                <strong>Certified that:</strong>
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: declEligibility ? 'default' : 'pointer', fontSize: '12.5px', color: '#000', lineHeight: '1.6' }}>
                  <input
                    type="checkbox"
                    checked={declEligibility}
                    onChange={(e) => { if (e.target.checked) setDeclEligibility(true); }}
                    style={{ marginTop: '3px', flexShrink: 0, width: '14px', height: '14px', cursor: declEligibility ? 'default' : 'pointer' }}
                    required
                  />
                  <span>
                    The eligibility criteria is not unduly restrictive.
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: declDemandDivision ? 'default' : 'pointer', fontSize: '12.5px', color: '#000', lineHeight: '1.6' }}>
                  <input
                    type="checkbox"
                    checked={declDemandDivision}
                    onChange={(e) => { if (e.target.checked) setDeclDemandDivision(true); }}
                    style={{ marginTop: '3px', flexShrink: 0, width: '14px', height: '14px', cursor: declDemandDivision ? 'default' : 'pointer' }}
                    required
                  />
                  <span>
                    The demand for goods is not divided into small quantities to make piecemeal purchases to avoid tendering or the necessity of obtaining the sanction of higher authorities required with references to the estimated value of the total demand.
                  </span>
                </label>
              </div>
            </div>

            {/* Committee Note – dynamic based on estimated total cost */}
            {(() => {
              const cost = calculatedValues.totalCost;
              // Committee composition thresholds (as per NIT institutional norms):
              // ≤ 2L       : HOD + PI
              // 2L – 10L   : HOD + PI + Expert 1 + AR/DR
              // 10L – 30L  : HOD + PI + Expert 1 + Expert 2 + AR/DR + IA
              // > 30L      : HOD + PI + Expert 1 + Expert 2 + Director Nominee + AR/DR + IA
              const L = 100000;
              const show1Expert = cost > 2 * L;
              const show2Expert = cost > 10 * L;
              const showDirectorNominee = cost > 30 * L;
              const showArDr = cost > 2 * L;
              const showIA = cost > 10 * L;

              const cellB = { border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold' as const, width: '38%', background: '#f7f7f7' } as React.CSSProperties;
              const cellV = { border: '1px solid #000', padding: '4px 8px' } as React.CSSProperties;

              return (
                <div style={{ background: '#fff', border: '1px solid #888', padding: '14px 16px', fontFamily: 'Times New Roman, Times, serif' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #000', paddingBottom: '5px', marginBottom: '10px', color: '#000' }}>
                    Note – Purchase Committee
                  </div>
                  <p style={{ fontSize: '12px', color: '#555', marginBottom: '8px', fontStyle: 'italic' }}>
                    The following committee may finalize the above purchase
                    {cost > 0 ? ` (estimated: ${formatCurrency(cost)})` : ''}:
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', color: '#000' }}>
                    <tbody>
                      <tr>
                        <td style={cellB}>HOD</td>
                        <td style={cellV}>{selectedBudget?.hod_name || '(As per department, nominated by Director)'}</td>
                      </tr>
                      <tr>
                        <td style={cellB}>Purchase Indentor</td>
                        <td style={cellV}>{user?.name || '—'}</td>
                      </tr>
                      {show1Expert && (
                        <tr>
                          <td style={cellB}>Technical Expert 1 (Nominated by HOD)</td>
                          <td style={cellV}>{selectedBudget?.expert1_name || '(To be nominated by HOD)'}</td>
                        </tr>
                      )}
                      {show2Expert && (
                        <tr>
                          <td style={cellB}>Technical Expert 2 (Nominated by HOD)</td>
                          <td style={cellV}>{selectedBudget?.expert2_name || '(To be nominated by HOD)'}</td>
                        </tr>
                      )}
                      {showDirectorNominee && (
                        <tr>
                          <td style={cellB}>Director Nominee (Faculty)</td>
                          <td style={cellV}>{selectedBudget?.director_faculty_name || '(To be nominated by Director)'}</td>
                        </tr>
                      )}
                      {showArDr && (
                        <tr>
                          <td style={cellB}>AR/DR (Stores & Purchase)</td>
                          <td style={cellV}>(As per institutional roster)</td>
                        </tr>
                      )}
                      {showIA && (
                        <tr>
                          <td style={cellB}>Internal Auditor (IA)</td>
                          <td style={cellV}>(As per institutional roster)</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {showDirectorNominee && (
                    <p style={{ fontSize: '12px', color: '#000', marginTop: '10px', fontStyle: 'italic', borderTop: '1px solid #ccc', paddingTop: '8px', lineHeight: '1.6' }}>
                      <strong>Note:</strong> The onus of freezing the specification / technical parameters and evaluation of technical parameters shall lie with the <strong>technical sub-committee (TSC)</strong>. PI shall be the convener for such meetings.
                    </p>
                  )}
                  {cost === 0 && (
                    <p style={{ fontSize: '11px', color: '#888', marginTop: '6px', fontStyle: 'italic' }}>
                      Enter item costs above to see the applicable committee composition.
                    </p>
                  )}
                </div>
              );
            })()}

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
                disabled={submitting || !nomineeSelectionCompleted || !budgetIsSufficient || !declEligibility || !declDemandDivision}
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
