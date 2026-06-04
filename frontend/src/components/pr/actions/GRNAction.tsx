import React, { useState, useEffect } from 'react';
import { FileText, CheckCircle2, Clock } from 'lucide-react';
import { prApi } from '../../../services/api';
import { PurchaseRequest } from '../../../types';
import toast from 'react-hot-toast';

interface GRNActionProps {
  pr: PurchaseRequest;
  user: any;
  refetch: () => void;
  actionLoading: boolean;
  setActionLoading: (loading: boolean) => void;
}

export const GRNAction: React.FC<GRNActionProps> = ({
  pr,
  user,
  refetch,
  actionLoading,
  setActionLoading
}) => {
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [challanNo, setChallanNo] = useState('');
  const [challanDate, setChallanDate] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [gstAmount, setGstAmount] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [bpRemarks, setBpRemarks] = useState('');

  const verifiedDelivery = pr.deliveries?.find((d: any) => d.status === 'verified');
  const isDAOrAdmin = user?.role?.group_key === 'verifier_da' || user?.role?.group_key === 'admin';

  useEffect(() => {
    if (verifiedDelivery) {
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
  }, [pr, verifiedDelivery]);

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

  if (!verifiedDelivery) {
    return (
      <div className="card p-6 bg-slate-50 border-slate-200 text-left space-y-2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
          <Clock size={16} className="text-slate-500" /> Awaiting Delivery &amp; Verification
        </h3>
        <p className="text-xs text-slate-600 font-medium">
          Awaiting physical delivery of goods and GRN verification from the Department HOD and Stores.
        </p>
      </div>
    );
  }

  if (!isDAOrAdmin) {
    return (
      <div className="card p-6 bg-slate-50 border-slate-200 text-left space-y-2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
          <Clock size={16} className="text-slate-500" /> Payment &amp; Bill Passing In Progress
        </h3>
        <p className="text-xs text-slate-600 font-medium">
          Delivery receipt of goods has been successfully verified (GRN verified). The payment processing and Bill Passing Certificate generation is currently in progress with the Dealing Assistant / Superintendent.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleBillPassingSubmit} className="card p-6 bg-blue-50 border-blue-200 space-y-4 text-left">
      <h3 className="text-sm font-bold text-[#1a3a6b] uppercase tracking-wide border-b border-blue-100 pb-2 flex items-center gap-2">
        <FileText size={18} /> Purchase Bill Passing Certificate
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
            className="input-field mt-1 text-xs bg-white"
            required
          />
        </div>
        <div>
          <label className="label text-slate-600 font-semibold text-xs">Invoice Date *</label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="input-field mt-1 text-xs bg-white"
            required
          />
        </div>
        <div>
          <label className="label text-slate-600 font-semibold text-xs">Challan Number</label>
          <input
            type="text"
            value={challanNo}
            onChange={(e) => setChallanNo(e.target.value)}
            className="input-field mt-1 text-xs bg-white"
          />
        </div>
        <div>
          <label className="label text-slate-600 font-semibold text-xs">Challan Date</label>
          <input
            type="date"
            value={challanDate}
            onChange={(e) => setChallanDate(e.target.value)}
            className="input-field mt-1 text-xs bg-white"
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
              className="input-field pl-6 text-xs font-mono bg-white"
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
              className="input-field pl-6 text-xs font-mono bg-white"
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
          className="input-field mt-1 text-xs bg-white"
          placeholder="e.g. 100% payment after delivery and installation"
        />
      </div>

      <div>
        <label className="label text-slate-600 font-semibold text-xs">Bill Passing Remarks / Comments *</label>
        <textarea
          value={bpRemarks}
          onChange={(e) => setBpRemarks(e.target.value)}
          className="input-field mt-1 text-xs h-20 bg-white"
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
          <CheckCircle2 size={16} /> Pass Bill &amp; Complete Lifecycle
        </button>
      </div>
    </form>
  );
};
