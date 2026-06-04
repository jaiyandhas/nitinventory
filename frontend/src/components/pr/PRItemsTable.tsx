import React from 'react';
import { Award } from 'lucide-react';
import { PurchaseRequest } from '../../types';

interface PRItemsTableProps {
  pr: PurchaseRequest;
  formatCurrency: (n?: number) => string;
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

export const PRItemsTable: React.FC<PRItemsTableProps> = ({ pr, formatCurrency }) => {
  return (
    <div className="space-y-6">
      {/* Items */}
      {pr.items && pr.items.length > 0 && (
        <div className="card">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Procurement Items</h3>
          </div>
          <div className="divide-y divide-slate-200">
            {pr.items.map(item => (
              <div key={item.id} className="flex justify-between items-center px-6 py-4">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-700">{item.item_description}</span>
                  <span className="text-xs text-slate-500 font-semibold mt-0.5">Quantity: {item.quantity ?? 1}</span>
                </div>
                <span className="text-sm font-bold text-[#1a3a6b]">{formatCurrency(item.estimated_total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global Uploaded Documents card */}
      {pr.documents && pr.documents.length > 0 && (
        <div className="card">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Uploaded Documents</h3>
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {pr.documents.length} File(s)
            </span>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {pr.documents.map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between p-3 border border-slate-100 hover:border-slate-200 hover:shadow-sm bg-white rounded-lg transition-all">
                <div className="flex flex-col gap-1 pr-4 min-w-0">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {getDocLabel(doc.doc_key)}
                  </span>
                  <span className="text-sm font-semibold text-slate-800 truncate" title={doc.original_name}>
                    {doc.original_name}
                  </span>
                </div>
                <a
                  href={doc.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-xs py-1.5 px-3 border-blue-200 text-blue-600 hover:bg-blue-50 shrink-0 font-semibold"
                >
                  View PDF
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past Evaluations Section */}
      {((pr.commercial_evaluations && pr.commercial_evaluations.length > 0) || 
        (pr.technical_evaluations && pr.technical_evaluations.length > 0) ||
        (pr.financial_evaluations && pr.financial_evaluations.length > 0)) && (
        <div className="card p-6 space-y-6">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2">Registered Vendors & Evaluations</h3>
          
          {pr.commercial_evaluations && pr.commercial_evaluations.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Commercial / Bidder List</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-slate-700">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Vendor Name</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.commercial_evaluations.map(ce => (
                      <tr key={ce.id} className="border-b border-slate-50">
                        <td className="px-3 py-2 font-medium">{ce.vendor_name}</td>
                        <td className="px-3 py-2 text-slate-500 italic">{ce.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pr.technical_evaluations && pr.technical_evaluations.length > 0 && (
            <div className="pt-2">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Technical Evaluation Log</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-slate-700">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Vendor Name</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Qualified?</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.technical_evaluations.map(te => (
                      <tr key={te.id} className="border-b border-slate-50">
                        <td className="px-3 py-2 font-medium">{te.vendor_name}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${te.is_qualified ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {te.is_qualified ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500 italic">{te.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pr.financial_evaluations && pr.financial_evaluations.length > 0 && (
            <div className="pt-2">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Price Comparative Statement</h4>
              <div className="overflow-x-auto border border-slate-100 rounded-lg">
                <table className="min-w-full text-sm text-slate-700">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Vendor Name</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Unit Price</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Taxes</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Total Quoted</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Delivery</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Warranty</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Rank</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.financial_evaluations.map(fe => {
                      const isL1 = fe.ranking === 'L1';
                      const isL2 = fe.ranking === 'L2';
                      return (
                        <tr key={fe.id} className={`border-b border-slate-50 hover:bg-slate-50/30 ${isL1 ? 'bg-green-50/30' : isL2 ? 'bg-yellow-50/20' : ''}`}>
                          <td className="px-3 py-2 font-semibold text-slate-800 flex items-center gap-2">
                            {fe.vendor_name}
                            {isL1 && <Award size={14} className="text-green-600" />}
                            {fe.is_awarded && <span className="bg-[#1a3a6b] text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-sm">★ AWARDED</span>}
                          </td>
                          <td className="px-3 py-2 font-medium">{fe.unit_price !== undefined && fe.unit_price !== null ? `₹${(fe.unit_price / 100000).toFixed(2)} Lakhs` : '-'}</td>
                          <td className="px-3 py-2 font-medium">{fe.taxes !== undefined ? `${fe.taxes}%` : '0%'}</td>
                          <td className="px-3 py-2 font-semibold font-mono text-[#1a3a6b]">₹{(fe.quoted_amount / 100000).toFixed(2)} Lakhs</td>
                          <td className="px-3 py-2 text-xs font-semibold">{fe.delivery_period !== undefined && fe.delivery_period !== null ? `${fe.delivery_period} weeks` : '-'}</td>
                          <td className="px-3 py-2 text-xs font-semibold">{fe.warranty !== undefined && fe.warranty !== null ? `${fe.warranty} months` : '-'}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${isL1 ? 'bg-green-100 text-green-800' : isL2 ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-800'}`}>
                              {fe.ranking}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500 italic">{fe.remarks || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pr.technical_evaluations && pr.technical_evaluations.length > 0 && pr.financial_evaluations && pr.financial_evaluations.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Techno-Commercial Comparative Statement</h4>
              <div className="overflow-x-auto border border-slate-100 rounded-lg">
                <table className="min-w-full text-sm text-slate-700">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Vendor Name</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Technical Qualification</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Financial Bid</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Rank</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.technical_evaluations.map(te => {
                      const fe = pr.financial_evaluations?.find(f => f.vendor_name === te.vendor_name);
                      return (
                        <tr key={te.id} className="border-b border-slate-50 hover:bg-slate-50/30">
                          <td className="px-3 py-2 font-semibold text-slate-800">{te.vendor_name}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${te.is_qualified ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {te.is_qualified ? 'QUALIFIED' : 'DISQUALIFIED'}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-semibold font-mono text-[#1a3a6b]">
                            {te.is_qualified && fe ? `₹${(fe.quoted_amount / 100000).toFixed(2)} Lakhs` : 'N/A (Disqualified)'}
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-xs font-bold text-slate-600">
                              {te.is_qualified && fe ? fe.ranking : '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500 italic">
                            {te.remarks || fe?.remarks || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pr.single_bid_justification && (
            <div className="pt-4 border-t border-slate-100 bg-blue-50/30 p-3.5 rounded-lg border border-blue-100/50">
              <h4 className="text-xs font-extrabold text-[#1a3a6b] uppercase tracking-wider mb-1">Single Bid Justification</h4>
              <p className="text-sm text-slate-700 italic font-medium">"{pr.single_bid_justification}"</p>
            </div>
          )}

          {pr.lpc_remarks && (
            <div className="pt-4 border-t border-slate-100 bg-slate-50/50 p-4 rounded-lg border border-slate-200/60 space-y-2">
              <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Limited Purchase Committee Approval</h4>
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-600">
                <div>
                  <span className="text-slate-400 font-bold">LPC Committee:</span> {pr.lpc_committee_members || 'N/A'}
                </div>
                <div>
                  <span className="text-slate-400 font-bold">Minutes Reference:</span> {pr.lpc_minutes_reference || 'N/A'}
                </div>
              </div>
              <div className="text-xs italic text-slate-600 pt-1 border-t border-slate-100">
                <span className="font-bold text-slate-500 not-italic block mb-0.5">LPC Decision/Remarks:</span>
                "{pr.lpc_remarks}"
              </div>
            </div>
          )}

          {pr.bill_passing && (
            <div className="pt-4 border-t border-slate-100 bg-emerald-50/20 p-4 rounded-lg border border-emerald-100/60 space-y-3">
              <h4 className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                Purchase Bill Passing Certificate
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold text-slate-700">
                <div>
                  <span className="text-slate-400 block font-bold">Invoice Number</span>
                  <span className="text-slate-800 font-mono text-sm">{pr.bill_passing.invoice_number}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold">Invoice Date</span>
                  <span className="text-slate-800">{new Date(pr.bill_passing.invoice_date).toLocaleDateString()}</span>
                </div>
                {pr.bill_passing.challan_number && (
                  <div>
                    <span className="text-slate-400 block font-bold">Challan Number</span>
                    <span className="text-slate-800 font-mono text-sm">{pr.bill_passing.challan_number}</span>
                  </div>
                )}
                {pr.bill_passing.challan_date && (
                  <div>
                    <span className="text-slate-400 block font-bold">Challan Date</span>
                    <span className="text-slate-800">{new Date(pr.bill_passing.challan_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-700 pt-1">
                <div>
                  <span className="text-slate-400 block font-bold">Passed Bill Amount</span>
                  <span className="text-emerald-700 font-bold text-sm">₹{pr.bill_passing.bill_amount.toFixed(2)} Lakhs</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-bold">Passed GST Amount</span>
                  <span className="text-slate-800">₹{(pr.bill_passing.gst_amount || 0.0).toFixed(2)} Lakhs</span>
                </div>
              </div>
              {pr.bill_passing.payment_terms && (
                <div className="text-xs">
                  <span className="text-slate-400 font-bold block">Payment Terms:</span>
                  <span className="text-slate-700 font-semibold">{pr.bill_passing.payment_terms}</span>
                </div>
              )}
              {pr.bill_passing.remarks && (
                <div className="text-xs italic text-slate-600 bg-white/40 p-2.5 rounded border border-emerald-100/30">
                  <span className="font-bold text-slate-500 not-italic block mb-0.5">DA Remarks:</span>
                  "{pr.bill_passing.remarks}"
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Procurement Mode Form Details */}
      {pr.form_data && Object.keys(pr.form_data).length > 0 && (
        <div className="card p-6 bg-white border border-slate-200 shadow-sm space-y-4 text-left">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2 flex items-center gap-2">
            <span className="w-1.5 h-3 bg-[#1a3a6b] rounded-xs"></span>
            Procurement Method Form Data ({pr.procurement?.name || 'Details'})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(pr.form_data).map(([key, val]) => {
              if (val === undefined || val === null || val === '') return null;
              
              // Human readable labels
              const labels: Record<string, string> = {
                gem_link: 'GeM Bid / RA Link',
                gem_nac_attached: 'GeM Non-Availability Certificate (NAC) Attached?',
                tender_id: 'CPPP Tender ID',
                publication_date: 'Publication Date (CPPP)',
                invited_vendors: 'Invited Vendors',
                manufacturer_name: 'OEM Manufacturer Name',
                manufacturer_address: 'OEM Address',
                justification_type: 'PAC Justification Basis',
                finance_concurrence_ref: 'Finance Concurrence Reference',
              };

              const label = labels[key] || key.replace(/_/g, ' ').toUpperCase();
              
              // Values formatting
              let displayVal = String(val);
              if (typeof val === 'boolean') {
                displayVal = val ? 'Yes' : 'No';
              } else if (key === 'justification_type') {
                const map: Record<string, string> = {
                  sole_manufacturer: 'Sole Manufacturer',
                  no_alternative: 'No Alternative Product Acceptable',
                  similar_unavailable: 'Similar Product Unavailable',
                };
                displayVal = map[val] || val;
              }

              return (
                <div key={key} className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    {label}
                  </span>
                  {key === 'gem_link' ? (
                    <a
                      href={displayVal.startsWith('http') ? displayVal : `https://${displayVal}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-blue-600 hover:underline break-all"
                    >
                      {displayVal}
                    </a>
                  ) : (
                    <span className="text-sm font-semibold text-slate-800 break-words">
                      {displayVal}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
