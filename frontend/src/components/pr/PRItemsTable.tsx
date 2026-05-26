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
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Financial Bids & Rankings</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-slate-700">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Vendor Name</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600 font-mono">Quoted Amount</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Rank</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-600">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.financial_evaluations.map(fe => {
                      const isL1 = fe.ranking === 'L1';
                      const isL2 = fe.ranking === 'L2';
                      return (
                        <tr key={fe.id} className={`border-b border-slate-100 ${isL1 ? 'bg-green-50/50' : isL2 ? 'bg-yellow-50/50' : ''}`}>
                          <td className="px-3 py-2 font-medium flex items-center gap-2">
                            {fe.vendor_name}
                            {isL1 && <Award size={14} className="text-green-600" />}
                            {fe.is_awarded && <span className="bg-[#1a3a6b] text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-sm">★ AWARDED</span>}
                          </td>
                          <td className="px-3 py-2 font-semibold font-mono text-[#1a3a6b]">₹{(fe.quoted_amount).toFixed(2)} Lakhs</td>
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
        </div>
      )}
    </div>
  );
};
