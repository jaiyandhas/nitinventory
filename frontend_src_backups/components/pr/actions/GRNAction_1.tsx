import React, { useState, useEffect } from 'react';
import { FileText, CheckCircle2, Clock, ShieldCheck, Landmark, DollarSign, PenTool } from 'lucide-react';
import { prApi } from '../../../services/api';
import { PurchaseRequest } from '../../../types';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../../utils/format';
import { Link } from 'react-router-dom';

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

  // Initiator stage fields
  const [packingAndForwardingCharges, setPackingAndForwardingCharges] = useState('0');
  const [otherCharges, setOtherCharges] = useState('0');
  const [otherChargesSpecification, setOtherChargesSpecification] = useState('');
  const [dueDateOfSupply, setDueDateOfSupply] = useState('');
  const [actualDateOfDelivery, setActualDateOfDelivery] = useState('');
  const [delayDays, setDelayDays] = useState('0');
  const [delayReason, setDelayReason] = useState('');
  const [liquidityDamagesDeducted, setLiquidityDamagesDeducted] = useState('No');
  const [justificationForLd, setJustificationForLd] = useState('');
  const [psTerms, setPsTerms] = useState('');
  const [warrantyTerms, setWarrantyTerms] = useState('');
  const [modeOfPs, setModeOfPs] = useState('Bank Guarantee');
  const [valueOfPs, setValueOfPs] = useState('0');
  const [validityOfPs, setValidityOfPs] = useState('');
  const [warrantyPeriodRequired, setWarrantyPeriodRequired] = useState('No');
  const [warrantyPeriodMonths, setWarrantyPeriodMonths] = useState('0');
  const [installationRequired, setInstallationRequired] = useState('No');
  const [installationCertificateEnclosed, setInstallationCertificateEnclosed] = useState('No');
  const [supplierName, setSupplierName] = useState('');
  const [supplierGst, setSupplierGst] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('0');
  const [justification, setJustification] = useState('');
  const [firmName, setFirmName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [labOfficeName, setLabOfficeName] = useState('');
  const [totalAcceptedValue, setTotalAcceptedValue] = useState('0');
  const [psWithheld, setPsWithheld] = useState('0');
  const [ldImposed, setLdImposed] = useState('0');
  const [advancePaid, setAdvancePaid] = useState('0');
  const [lcReleased, setLcReleased] = useState('0');
  const [partPayment, setPartPayment] = useState('0');
  const [netAmount, setNetAmount] = useState('0');

  // HOD fields
  const [nonConsumableVol, setNonConsumableVol] = useState('');
  const [nonConsumablePage, setNonConsumablePage] = useState('');
  const [consumableVol, setConsumableVol] = useState('');
  const [consumablePage, setConsumablePage] = useState('');

  // Superintendent fields
  const [assetRegisterVolume, setAssetRegisterVolume] = useState('');
  const [assetRegisterPage, setAssetRegisterPage] = useState('');
  const [receivedStoresDate, setReceivedStoresDate] = useState('');

  const verifiedDelivery = pr.deliveries?.find((d: any) => d.status === 'verified');
  const isPIOrAdmin = user?.id === pr.initiator_id || user?.role?.group_key === 'admin';
  const isHODOrAdmin = (user?.role?.group_key === 'hod' && user?.department_id === pr.initiator?.department?.id) || user?.role?.group_key === 'admin';
  const isSPOrAdmin = user?.role?.group_key === 'verifier_sp' || user?.role?.group_key === 'admin';

  useEffect(() => {
    if (verifiedDelivery) {
      setInvoiceNo(verifiedDelivery.invoice_number || '');
      setChallanNo(verifiedDelivery.challan_number || '');
      if (verifiedDelivery.received_date) {
        setInvoiceDate(verifiedDelivery.received_date.substring(0, 10));
        setChallanDate(verifiedDelivery.received_date.substring(0, 10));
        setActualDateOfDelivery(verifiedDelivery.received_date.substring(0, 10));
        setReceivedStoresDate(verifiedDelivery.received_date.substring(0, 10));
      } else {
        const todayStr = new Date().toISOString().substring(0, 10);
        setInvoiceDate(todayStr);
        setChallanDate(todayStr);
        setActualDateOfDelivery(todayStr);
        setReceivedStoresDate(todayStr);
      }
      
      const totalCost = verifiedDelivery.items?.reduce((sum: number, item: any) => sum + (item.unit_price * item.challan_quantity), 0) || 0;
      setInvoiceAmount(String(totalCost));
      setTotalAcceptedValue(String(totalCost));
      setNetAmount(String(totalCost));
      setBillAmount(String(totalCost.toFixed(2)));

      setSupplierName(pr.financial_evaluations?.find((fe: any) => fe.is_awarded)?.vendor_name || '');
    }

    if (pr.bill_passing) {
      setInvoiceNo(pr.bill_passing.invoice_number || '');
      setChallanNo(pr.bill_passing.challan_number || '');
      if (pr.bill_passing.invoice_date) setInvoiceDate(pr.bill_passing.invoice_date.substring(0, 10));
      if (pr.bill_passing.challan_date) setChallanDate(pr.bill_passing.challan_date.substring(0, 10));
      setBillAmount(String(pr.bill_passing.bill_amount));
      setGstAmount(String(pr.bill_passing.gst_amount || ''));
      setPaymentTerms(pr.bill_passing.payment_terms || '');
      setBpRemarks(pr.bill_passing.remarks || '');

      const info = pr.bill_passing.extra_info || {};
      setPackingAndForwardingCharges(String(info.packing_and_forwarding_charges ?? '0'));
      setOtherCharges(String(info.other_charges ?? '0'));
      setOtherChargesSpecification(info.other_charges_specification ?? '');
      setDueDateOfSupply(info.due_date_of_supply ?? '');
      if (info.actual_date_of_delivery) setActualDateOfDelivery(info.actual_date_of_delivery.substring(0, 10));
      setDelayDays(String(info.delay_days ?? '0'));
      setDelayReason(info.delay_reason ?? '');
      setLiquidityDamagesDeducted(info.liquidity_damages_deducted ?? 'No');
      setJustificationForLd(info.justification_for_ld ?? '');
      setPsTerms(info.ps_terms ?? '');
      setWarrantyTerms(info.warranty_terms ?? '');
      setModeOfPs(info.mode_of_ps ?? 'Bank Guarantee');
      setValueOfPs(String(info.value_of_ps ?? '0'));
      setValidityOfPs(info.validity_of_ps ?? '');
      setWarrantyPeriodRequired(info.warranty_period_required ?? 'No');
      setWarrantyPeriodMonths(String(info.warranty_period_months ?? '0'));
      setInstallationRequired(info.installation_required ?? 'No');
      setInstallationCertificateEnclosed(info.installation_certificate_enclosed ?? 'No');
      setSupplierName(info.supplier_name ?? '');
      setSupplierGst(info.supplier_gst ?? '');
      setInvoiceAmount(String(info.invoice_amount ?? '0'));
      setJustification(info.justification ?? '');
      setFirmName(info.firm_name ?? '');
      setAccountNumber(info.account_number ?? '');
      setAccountHolderName(info.account_holder_name ?? '');
      setBankName(info.bank_name ?? '');
      setBranchName(info.branch_name ?? '');
      setIfscCode(info.ifsc_code ?? '');
      setLabOfficeName(info.lab_office_name ?? '');
      setTotalAcceptedValue(String(info.total_accepted_value ?? '0'));
      setPsWithheld(String(info.ps_withheld ?? '0'));
      setLdImposed(String(info.ld_imposed ?? '0'));
      setAdvancePaid(String(info.advance_paid ?? '0'));
      setLcReleased(String(info.lc_released ?? '0'));
      setPartPayment(String(info.part_payment ?? '0'));
      setNetAmount(String(info.net_amount ?? '0'));

      setNonConsumableVol(info.non_consumable_vol ?? '');
      setNonConsumablePage(info.non_consumable_page ?? '');
      setConsumableVol(info.consumable_vol ?? '');
      setConsumablePage(info.consumable_page ?? '');

      setAssetRegisterVolume(info.asset_register_volume ?? '');
      setAssetRegisterPage(info.asset_register_page ?? '');
      if (info.received_stores_date) setReceivedStoresDate(info.received_stores_date.substring(0, 10));
    }
  }, [pr, verifiedDelivery]);

  // Dynamically recalculate Net Passed breakdown values
  useEffect(() => {
    if (!pr.bill_passing) {
      const total = parseFloat(totalAcceptedValue) || 0;
      const psw = parseFloat(psWithheld) || 0;
      const ldi = parseFloat(ldImposed) || 0;
      const adv = parseFloat(advancePaid) || 0;
      const lc = parseFloat(lcReleased) || 0;
      const part = parseFloat(partPayment) || 0;
      
      const calculatedNet = total - psw - ldi - adv + lc + part;
      setNetAmount(String(calculatedNet.toFixed(2)));
      setBillAmount(String(calculatedNet.toFixed(2)));
    }
  }, [totalAcceptedValue, psWithheld, ldImposed, advancePaid, lcReleased, partPayment]);

  const handleBillPassingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNo.trim()) { toast.error('Invoice Number is required'); return; }
    if (!invoiceDate) { toast.error('Invoice Date is required'); return; }
    if (!billAmount.trim()) { toast.error('Bill Amount is required'); return; }
    if (!bpRemarks.trim()) { toast.error('Remarks are required'); return; }

    const payload: any = {
      invoice_number: invoiceNo,
      invoice_date: invoiceDate,
      challan_number: challanNo || null,
      challan_date: challanDate || null,
      bill_amount: parseFloat(billAmount),
      gst_amount: gstAmount ? parseFloat(gstAmount) : 0.0,
      payment_terms: paymentTerms || null,
      remarks: bpRemarks,
    };

    const bpStatus = pr.bill_passing?.extra_info?.status || 'none';

    if (bpStatus === 'none') {
      Object.assign(payload, {
        packing_and_forwarding_charges: parseFloat(packingAndForwardingCharges) || 0,
        other_charges: parseFloat(otherCharges) || 0,
        other_charges_specification: otherChargesSpecification,
        due_date_of_supply: dueDateOfSupply || null,
        actual_date_of_delivery: actualDateOfDelivery || null,
        delay_days: parseInt(delayDays) || 0,
        delay_reason: delayReason,
        liquidity_damages_deducted: liquidityDamagesDeducted,
        justification_for_ld: justificationForLd,
        ps_terms: psTerms,
        warranty_terms: warrantyTerms,
        mode_of_ps: modeOfPs,
        value_of_ps: parseFloat(valueOfPs) || 0,
        validity_of_ps: validityOfPs || null,
        warranty_period_required: warrantyPeriodRequired,
        warranty_period_months: parseInt(warrantyPeriodMonths) || 0,
        installation_required: installationRequired,
        installation_certificate_enclosed: installationCertificateEnclosed,
        supplier_name: supplierName,
        supplier_gst: supplierGst,
        invoice_amount: parseFloat(invoiceAmount) || 0,
        justification: justification,
        firm_name: firmName,
        account_number: accountNumber,
        account_holder_name: accountHolderName,
        bank_name: bankName,
        branch_name: branchName,
        ifsc_code: ifscCode,
        lab_office_name: labOfficeName,
        total_accepted_value: parseFloat(totalAcceptedValue) || 0,
        ps_withheld: parseFloat(psWithheld) || 0,
        ld_imposed: parseFloat(ldImposed) || 0,
        advance_paid: parseFloat(advancePaid) || 0,
        lc_released: parseFloat(lcReleased) || 0,
        part_payment: parseFloat(partPayment) || 0,
        net_amount: parseFloat(netAmount) || 0,
      });
    } else if (bpStatus === 'pending_hod') {
      if (!nonConsumableVol.trim() && !consumableVol.trim()) {
        toast.error('HOD must register details for at least one stock register (Non-Consumable or Consumable)');
        return;
      }
      Object.assign(payload, {
        non_consumable_vol: nonConsumableVol,
        non_consumable_page: nonConsumablePage,
        consumable_vol: consumableVol,
        consumable_page: consumablePage,
      });
    } else if (bpStatus === 'pending_superintendent') {
      if (!assetRegisterVolume.trim()) {
        toast.error('Asset Register Volume Number is required');
        return;
      }
      if (!assetRegisterPage.trim()) {
        toast.error('Asset Register Page Number is required');
        return;
      }
      Object.assign(payload, {
        asset_register_volume: assetRegisterVolume,
        asset_register_page: assetRegisterPage,
        received_stores_date: receivedStoresDate,
      });
    }

    setActionLoading(true);
    try {
      await prApi.billPassing(pr.id, payload);
      toast.success(bpStatus === 'none' ? 'Bill details submitted to HOD!' : bpStatus === 'pending_hod' ? 'Bill approved & forwarded to Superintendent!' : 'Bill passed and PO completed!');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Submission failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (!verifiedDelivery) {
    const activeDelivery = pr.deliveries?.find((d: any) => d.status !== 'verified' && d.status !== 'completed');
    
    if (activeDelivery) {
      const deliveryLink = `/inventory/deliveries/${activeDelivery.id}`;
      
      let title = "Awaiting Delivery & Verification";
      let description = "Awaiting physical delivery of goods and GRN verification from the Department HOD and Central Stores.";
      let buttonText = "";
      let showButton = false;

      if (activeDelivery.status === 'pending') {
        if (user?.id === pr.initiator_id || user?.role?.group_key === 'admin') {
          title = "Action Required: Confirm Delivery Receipt";
          description = "The Purchase Order has been generated. As the Purchase Initiator, please confirm physical receipt of goods by uploading the vendor's invoice PDF and delivery challan PDF.";
          buttonText = "Confirm Receipt & Upload Docs";
          showButton = true;
        } else {
          title = "Awaiting Initiator Confirmation";
          description = "The Purchase Order has been issued. Awaiting the Purchase Initiator to confirm receipt and upload invoice/challan documents.";
        }
      } else if (activeDelivery.status === 'initiator_confirmed') {
        if ((user?.role?.group_key === 'hod' && user?.department_id === pr.initiator?.department?.id) || user?.role?.group_key === 'admin') {
          title = "Action Required: Log Department Receipt";
          description = "The initiator has confirmed delivery. As the HOD, please log the department verification, stock entries, and physical condition of the received goods.";
          buttonText = "Log Department Receipt";
          showButton = true;
        } else {
          title = "Awaiting HOD Verification";
          description = "The initiator has confirmed delivery. Awaiting the department HOD to inspect the items and log the department receipt.";
        }
      } else if (activeDelivery.status === 'dept_logged') {
        if (user?.role?.group_key === 'verifier_sp' || user?.role?.group_key === 'admin') {
          title = "Action Required: Log Central Stores Receipt";
          description = "The department has logged the receipt. As the Stores Superintendent/Representative, please perform central inspection and log the stores receipt.";
          buttonText = "Log Stores Receipt";
          showButton = true;
        } else {
          title = "Awaiting Central Stores Verification";
          description = "The department HOD has verified the receipt. Awaiting Central Stores to verify and log the stores receipt.";
        }
      } else if (activeDelivery.status === 'stores_logged') {
        if (user?.role?.group_key === 'apex_approver' || user?.role?.group_key === 'admin') {
          title = "Action Required: Approve Stores Verification";
          description = "Stores has logged the receipt. As the Apex Authority, please approve the stores verification to generate assets and unlock payment.";
          buttonText = "Approve Stores Verification";
          showButton = true;
        } else {
          title = "Awaiting Apex Approval";
          description = "Stores has logged the receipt. Awaiting Apex Authority (Director/Registrar) approval of stores verification.";
        }
      } else if (activeDelivery.status === 'discrepancy') {
        title = "Quantity Discrepancy Found";
        description = "A quantity mismatch was found between department and stores verification, blocking asset generation and payment. Click below to inspect details.";
        buttonText = "Inspect Discrepancy";
        showButton = true;
      }

      return (
        <div className="card p-6 bg-slate-50 border-slate-200 text-left space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
            <Clock size={16} className="text-slate-500 animate-pulse" /> {title}
          </h3>
          <p className="text-xs text-slate-600 font-semibold leading-relaxed">
            {description}
          </p>
          {showButton && (
            <div className="pt-2">
              <Link
                to={deliveryLink}
                className="btn-primary inline-flex items-center gap-2 py-2 px-6 font-semibold shadow-md bg-[#1a3a6b] hover:bg-[#10274c] text-white border-none text-xs rounded"
              >
                {buttonText} &rarr;
              </Link>
            </div>
          )}
        </div>
      );
    }

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

  const bpStatus = pr.bill_passing?.extra_info?.status || 'none';

  // Render Completed Summary
  if (bpStatus === 'completed') {
    return (
      <div className="card p-6 bg-slate-50 border-slate-200 text-left space-y-4">
        <h3 className="text-sm font-bold text-green-700 uppercase tracking-wide flex items-center gap-1.5">
          <CheckCircle2 size={18} /> Purchase Bill Passed &amp; Completed
        </h3>
        <p className="text-xs text-slate-600 font-semibold">
          This purchase request has successfully passed the three-tier verification (Initiator, HOD, and Superintendent). All stock register entries are recorded.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-white p-4 rounded-lg border border-slate-200">
          <div><span className="font-semibold text-slate-500">Invoice:</span> {pr.bill_passing?.invoice_number} ({pr.bill_passing?.invoice_date})</div>
          <div><span className="font-semibold text-slate-500">Net Passed Amount:</span> {formatCurrency(pr.bill_passing?.bill_amount)}</div>
          <div><span className="font-semibold text-slate-500">Non-Consumable Register:</span> Vol: {pr.bill_passing?.extra_info?.non_consumable_vol} · Page: {pr.bill_passing?.extra_info?.non_consumable_page}</div>
          <div><span className="font-semibold text-slate-500">Asset Register:</span> Vol: {pr.bill_passing?.extra_info?.asset_register_volume} · Page: {pr.bill_passing?.extra_info?.asset_register_page}</div>
        </div>
        <div className="flex justify-end pt-2">
          <a
            href={`/api/purchase-requests/${pr.id}/print?module=bill_passing`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary py-2 px-6 font-semibold shadow-md flex items-center gap-2"
          >
            <FileText size={16} /> Print Bill Passing Certificate
          </a>
        </div>
      </div>
    );
  }

  // Render Initiator Form
  if (bpStatus === 'none') {
    if (!isPIOrAdmin) {
      return (
        <div className="card p-6 bg-slate-50 border-slate-200 text-left space-y-2">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
            <Clock size={16} className="text-slate-500" /> Awaiting Initiator Details
          </h3>
          <p className="text-xs text-slate-600 font-medium">
            Goods delivery has been verified. Awaiting the Purchase Initiator to fill and submit the bill passing details.
          </p>
        </div>
      );
    }

    return (
      <form onSubmit={handleBillPassingSubmit} className="card p-6 bg-blue-50 border-blue-200 space-y-6 text-left">
        <h3 className="text-sm font-bold text-[#1a3a6b] uppercase tracking-wide border-b border-blue-100 pb-2 flex items-center gap-2">
          <FileText size={18} /> 1. Draft Bill Passing Certificate (Initiator Stage)
        </h3>

        {/* Section 1: General & Delivery Details */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-[#1a3a6b] uppercase flex items-center gap-1.5 border-l-2 border-[#1a3a6b] pl-2">
            <Clock size={14} /> General &amp; Delivery Details
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Invoice Number *</label>
              <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className="input-field mt-1 text-xs bg-white" required />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Invoice Date *</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="input-field mt-1 text-xs bg-white" required />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Challan Number</label>
              <input type="text" value={challanNo} onChange={e => setChallanNo(e.target.value)} className="input-field mt-1 text-xs bg-white" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Challan Date</label>
              <input type="date" value={challanDate} onChange={e => setChallanDate(e.target.value)} className="input-field mt-1 text-xs bg-white" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Due Date of Supply (PO)</label>
              <input type="date" value={dueDateOfSupply} onChange={e => setDueDateOfSupply(e.target.value)} className="input-field mt-1 text-xs bg-white" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Actual Date of Delivery *</label>
              <input type="date" value={actualDateOfDelivery} onChange={e => setActualDateOfDelivery(e.target.value)} className="input-field mt-1 text-xs bg-white" required />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Delay Days</label>
              <input type="number" value={delayDays} onChange={e => setDelayDays(e.target.value)} className="input-field mt-1 text-xs bg-white" />
            </div>
            <div className="md:col-span-2">
              <label className="label text-slate-600 font-semibold text-xs">Reason for Delay</label>
              <input type="text" value={delayReason} onChange={e => setDelayReason(e.target.value)} className="input-field mt-1 text-xs bg-white" placeholder="If delayed, specify reasons" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Liquidity Damages (LD) Deducted?</label>
              <select value={liquidityDamagesDeducted} onChange={e => setLiquidityDamagesDeducted(e.target.value)} className="input-field mt-1 text-xs bg-white">
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label text-slate-600 font-semibold text-xs">Justification for LD / Waiver</label>
              <input type="text" value={justificationForLd} onChange={e => setJustificationForLd(e.target.value)} className="input-field mt-1 text-xs bg-white" placeholder="If LD is No, provide waiver justifications" />
            </div>
          </div>
        </div>

        {/* Section 2: Performance Security & Warranties */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-[#1a3a6b] uppercase flex items-center gap-1.5 border-l-2 border-[#1a3a6b] pl-2">
            <ShieldCheck size={14} /> Performance Security &amp; Warranties
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Performance Security Terms</label>
              <input type="text" value={psTerms} onChange={e => setPsTerms(e.target.value)} className="input-field mt-1 text-xs bg-white" placeholder="e.g. 3% PBG valid for 14 months" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Warranty Terms</label>
              <input type="text" value={warrantyTerms} onChange={e => setWarrantyTerms(e.target.value)} className="input-field mt-1 text-xs bg-white" placeholder="e.g. 1 year OEM warranty" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Mode of PS</label>
              <select value={modeOfPs} onChange={e => setModeOfPs(e.target.value)} className="input-field mt-1 text-xs bg-white">
                <option value="None">None</option>
                <option value="Bank Guarantee">Bank Guarantee</option>
                <option value="Bank Deposit Receipt">Bank Deposit Receipt</option>
                <option value="Demand Draft">Demand Draft</option>
                <option value="To be deducted Bill Payment">To be deducted Bill Payment</option>
              </select>
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Value of PS (Rs.)</label>
              <input type="number" value={valueOfPs} onChange={e => setValueOfPs(e.target.value)} className="input-field mt-1 text-xs bg-white" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Validity of PS (Expiry Date)</label>
              <input type="text" value={validityOfPs} onChange={e => setValidityOfPs(e.target.value)} className="input-field mt-1 text-xs bg-white" placeholder="e.g. 2026-12-31" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Warranty Period Required?</label>
              <select value={warrantyPeriodRequired} onChange={e => setWarrantyPeriodRequired(e.target.value)} className="input-field mt-1 text-xs bg-white">
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Warranty Period (in months)</label>
              <input type="number" value={warrantyPeriodMonths} onChange={e => setWarrantyPeriodMonths(e.target.value)} className="input-field mt-1 text-xs bg-white" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Installation Required?</label>
              <select value={installationRequired} onChange={e => setInstallationRequired(e.target.value)} className="input-field mt-1 text-xs bg-white">
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Installation Cert Enclosed?</label>
              <select value={installationCertificateEnclosed} onChange={e => setInstallationCertificateEnclosed(e.target.value)} className="input-field mt-1 text-xs bg-white">
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Supplier & Bank Payment Details */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-[#1a3a6b] uppercase flex items-center gap-1.5 border-l-2 border-[#1a3a6b] pl-2">
            <Landmark size={14} /> Supplier &amp; Bank Payment Details
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Supplier Name *</label>
              <input type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)} className="input-field mt-1 text-xs bg-white" required />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Supplier GST No</label>
              <input type="text" value={supplierGst} onChange={e => setSupplierGst(e.target.value)} className="input-field mt-1 text-xs bg-white" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Invoice Amount (Rs.) *</label>
              <input type="number" value={invoiceAmount} onChange={e => setInvoiceAmount(e.target.value)} className="input-field mt-1 text-xs bg-white" required />
            </div>
            <div className="md:col-span-3">
              <label className="label text-slate-600 font-semibold text-xs">Justification (if any)</label>
              <input type="text" value={justification} onChange={e => setJustification(e.target.value)} className="input-field mt-1 text-xs bg-white" placeholder="Supplier or rate justification" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Firm / Company Name *</label>
              <input type="text" value={firmName} onChange={e => setFirmName(e.target.value)} className="input-field mt-1 text-xs bg-white" required />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Bank Account Number *</label>
              <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} className="input-field mt-1 text-xs bg-white" required />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Account Holder Name *</label>
              <input type="text" value={accountHolderName} onChange={e => setAccountHolderName(e.target.value)} className="input-field mt-1 text-xs bg-white" required />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Bank Name *</label>
              <input type="text" value={bankName} onChange={e => setBankName(e.target.value)} className="input-field mt-1 text-xs bg-white" required />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Branch Name *</label>
              <input type="text" value={branchName} onChange={e => setBranchName(e.target.value)} className="input-field mt-1 text-xs bg-white" required />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">IFSC Code *</label>
              <input type="text" value={ifscCode} onChange={e => setIfscCode(e.target.value)} className="input-field mt-1 text-xs bg-white" required />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Laboratory / Office Name *</label>
              <input type="text" value={labOfficeName} onChange={e => setLabOfficeName(e.target.value)} className="input-field mt-1 text-xs bg-white" placeholder="Department Lab location" required />
            </div>
          </div>
        </div>

        {/* Section 4: Cost Summary & Bill Break-up */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-[#1a3a6b] uppercase flex items-center gap-1.5 border-l-2 border-[#1a3a6b] pl-2">
            <DollarSign size={14} /> Cost Summary &amp; Bill Break-up
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-lg border border-slate-200">
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Packing &amp; Forwarding (Rs.)</label>
              <input type="number" value={packingAndForwardingCharges} onChange={e => setPackingAndForwardingCharges(e.target.value)} className="input-field mt-1 text-xs bg-slate-50" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Other Charges (Rs.)</label>
              <input type="number" value={otherCharges} onChange={e => setOtherCharges(e.target.value)} className="input-field mt-1 text-xs bg-slate-50" />
            </div>
            <div className="md:col-span-2">
              <label className="label text-slate-600 font-semibold text-xs">Specify Other Charges</label>
              <input type="text" value={otherChargesSpecification} onChange={e => setOtherChargesSpecification(e.target.value)} className="input-field mt-1 text-xs bg-slate-50" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Total Accepted Value (Rs.) *</label>
              <input type="number" value={totalAcceptedValue} onChange={e => setTotalAcceptedValue(e.target.value)} className="input-field mt-1 text-xs bg-slate-50 font-bold" required />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">PS Withheld (Rs.)</label>
              <input type="number" value={psWithheld} onChange={e => setPsWithheld(e.target.value)} className="input-field mt-1 text-xs bg-slate-50" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">LD Imposed (Rs.)</label>
              <input type="number" value={ldImposed} onChange={e => setLdImposed(e.target.value)} className="input-field mt-1 text-xs bg-slate-50" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Advance Paid (Rs.)</label>
              <input type="number" value={advancePaid} onChange={e => setAdvancePaid(e.target.value)} className="input-field mt-1 text-xs bg-slate-50" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">LC Amount Released (Rs.)</label>
              <input type="number" value={lcReleased} onChange={e => setLcReleased(e.target.value)} className="input-field mt-1 text-xs bg-slate-50" />
            </div>
            <div>
              <label className="label text-slate-600 font-semibold text-xs">Part Payment (Rs.)</label>
              <input type="number" value={partPayment} onChange={e => setPartPayment(e.target.value)} className="input-field mt-1 text-xs bg-slate-50" />
            </div>
            <div className="md:col-span-2">
              <label className="label text-slate-800 font-black text-xs">Net Passed amount (Rs.)</label>
              <input type="number" value={netAmount} className="input-field mt-1 text-xs font-bold text-green-700 bg-green-50 border-green-200" readOnly />
            </div>
          </div>
        </div>

        <div>
          <label className="label text-slate-600 font-semibold text-xs">Bill Passing Comments / Remarks *</label>
          <textarea
            value={bpRemarks}
            onChange={e => setBpRemarks(e.target.value)}
            className="input-field mt-1 text-xs h-20 bg-white"
            placeholder="Review invoice correctness and submit..."
            required
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button type="submit" disabled={actionLoading} className="btn-primary py-2.5 px-8 font-semibold shadow-md flex items-center gap-2">
            <CheckCircle2 size={16} /> Submit to HOD for Sign-off
          </button>
        </div>
      </form>
    );
  }

  // Render HOD Form
  if (bpStatus === 'pending_hod') {
    if (!isHODOrAdmin) {
      return (
        <div className="card p-6 bg-slate-50 border-slate-200 text-left space-y-2">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
            <Clock size={16} className="text-slate-500" /> Awaiting HOD Verification
          </h3>
          <p className="text-xs text-slate-600 font-medium">
            Initiator details have been successfully recorded. Awaiting the department HOD's stock entry validation and digital signature.
          </p>
        </div>
      );
    }

    return (
      <form onSubmit={handleBillPassingSubmit} className="card p-6 bg-yellow-50 border-yellow-200 space-y-6 text-left">
        <h3 className="text-sm font-bold text-yellow-800 uppercase tracking-wide border-b border-yellow-100 pb-2 flex items-center gap-2">
          <PenTool size={18} /> 2. Verify Stock Register &amp; Sign (HOD Stage)
        </h3>

        <div className="bg-white p-4 rounded-lg border border-yellow-100 space-y-3 text-xs">
          <p className="font-bold text-slate-700">Draft Details Submitted by Initiator:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div><span className="text-slate-500">Invoice:</span> {invoiceNo} ({invoiceDate})</div>
            <div><span className="text-slate-500">Supplier:</span> {supplierName}</div>
            <div><span className="text-slate-500">Net Amount:</span> ₹{parseFloat(netAmount).toLocaleString('en-IN')}</div>
            <div><span className="text-slate-500">Lab/Office Location:</span> {labOfficeName}</div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-xs font-bold text-yellow-800 uppercase flex items-center gap-1.5 border-l-2 border-yellow-600 pl-2">
            Stock Register details
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label text-slate-700 font-bold text-xs">Non-Consumable Register Volume Number</label>
              <input type="text" value={nonConsumableVol} onChange={e => setNonConsumableVol(e.target.value)} className="input-field mt-1 text-xs bg-white" placeholder="Volume reference (e.g. Vol III)" />
            </div>
            <div>
              <label className="label text-slate-700 font-bold text-xs">Non-Consumable Register Page Number</label>
              <input type="text" value={nonConsumablePage} onChange={e => setNonConsumablePage(e.target.value)} className="input-field mt-1 text-xs bg-white" placeholder="Page reference" />
            </div>
            <div>
              <label className="label text-slate-700 font-bold text-xs">Consumable Register Volume Number</label>
              <input type="text" value={consumableVol} onChange={e => setConsumableVol(e.target.value)} className="input-field mt-1 text-xs bg-white" placeholder="Volume reference" />
            </div>
            <div>
              <label className="label text-slate-700 font-bold text-xs">Consumable Register Page Number</label>
              <input type="text" value={consumablePage} onChange={e => setConsumablePage(e.target.value)} className="input-field mt-1 text-xs bg-white" placeholder="Page reference" />
            </div>
          </div>
        </div>

        <div>
          <label className="label text-slate-600 font-semibold text-xs">HOD Recommendation Comments *</label>
          <textarea
            value={bpRemarks}
            onChange={e => setBpRemarks(e.target.value)}
            className="input-field mt-1 text-xs h-20 bg-white"
            placeholder="Recommend for payment and verify stock registers..."
            required
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button type="submit" disabled={actionLoading} className="btn-primary py-2.5 px-8 font-semibold shadow-md flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 border-none text-white">
            <CheckCircle2 size={16} /> Verify Stock &amp; Forward to Superintendent
          </button>
        </div>
      </form>
    );
  }

  // Render Superintendent Form
  if (bpStatus === 'pending_superintendent') {
    if (!isSPOrAdmin) {
      return (
        <div className="card p-6 bg-slate-50 border-slate-200 text-left space-y-2">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
            <Clock size={16} className="text-slate-500" /> Awaiting Superintendent Sign-off
          </h3>
          <p className="text-xs text-slate-600 font-medium">
            HOD has approved stock allocations. Awaiting final verification and Stores and Purchase Section entry from S&P Superintendent.
          </p>
        </div>
      );
    }

    return (
      <form onSubmit={handleBillPassingSubmit} className="card p-6 bg-green-50 border-green-200 space-y-6 text-left">
        <h3 className="text-sm font-bold text-green-800 uppercase tracking-wide border-b border-green-100 pb-2 flex items-center gap-2">
          <ShieldCheck size={18} /> 3. Stores &amp; Purchase Section Entry (Superintendent Stage)
        </h3>

        <div className="bg-white p-4 rounded-lg border border-green-100 space-y-3 text-xs">
          <p className="font-bold text-slate-700">Verification Trail:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div><span className="text-slate-500">Invoice No:</span> {invoiceNo} ({invoiceDate})</div>
            <div><span className="text-slate-500">Net Passed Amount:</span> ₹{parseFloat(netAmount).toLocaleString('en-IN')}</div>
            <div><span className="text-slate-500">Non-Consumable Register:</span> Vol: {nonConsumableVol} · Page: {nonConsumablePage}</div>
            <div><span className="text-slate-500">Consumable Register:</span> Vol: {consumableVol} · Page: {consumablePage}</div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-xs font-bold text-green-800 uppercase flex items-center gap-1.5 border-l-2 border-green-600 pl-2">
            Stores and Purchase Section Register
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label text-slate-700 font-bold text-xs">Asset Register Volume Number *</label>
              <input type="text" value={assetRegisterVolume} onChange={e => setAssetRegisterVolume(e.target.value)} className="input-field mt-1 text-xs bg-white" placeholder="e.g. Asset Vol II" required />
            </div>
            <div>
              <label className="label text-slate-700 font-bold text-xs">Asset Register Page Number *</label>
              <input type="text" value={assetRegisterPage} onChange={e => setAssetRegisterPage(e.target.value)} className="input-field mt-1 text-xs bg-white" placeholder="Page reference" required />
            </div>
            <div>
              <label className="label text-slate-700 font-bold text-xs">Received by Stores Section Date *</label>
              <input type="date" value={receivedStoresDate} onChange={e => setReceivedStoresDate(e.target.value)} className="input-field mt-1 text-xs bg-white" required />
            </div>
          </div>
        </div>

        <div>
          <label className="label text-slate-600 font-semibold text-xs">Superintendent S&P Comments *</label>
          <textarea
            value={bpRemarks}
            onChange={e => setBpRemarks(e.target.value)}
            className="input-field mt-1 text-xs h-20 bg-white"
            placeholder="Final payment sanction approvals..."
            required
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button type="submit" disabled={actionLoading} className="btn-primary py-2.5 px-8 font-semibold shadow-md flex items-center gap-2 bg-green-600 hover:bg-green-700 border-none text-white">
            <CheckCircle2 size={16} /> Approve, Sign &amp; Complete PO
          </button>
        </div>
      </form>
    );
  }

  return null;
};
