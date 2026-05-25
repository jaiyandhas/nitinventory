import React from 'react';
import type { BudgetFile, ProcurementMethod } from '../../../types';
import { formatCurrency } from '../../../utils/format';

interface Props {
  selectedFiles: BudgetFile[];
  procurementMethod: ProcurementMethod | undefined;
}

export const StepReviewSelection: React.FC<Props> = ({ selectedFiles, procurementMethod }) => {
  const grandTotal = selectedFiles.reduce((s, f) => s + f.total_cost, 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Review your selection before answering item-specific questions. You can go back to change files or procurement mode.
      </p>

      <div className="overflow-x-auto border border-slate-200 rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-[#1a3a6b] text-white">
            <tr>
              <th className="px-3 py-2 text-left">File No.</th>
              <th className="px-3 py-2 text-left">Item</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {selectedFiles.map((f) => (
              <tr key={f.id} className="border-t border-slate-200">
                <td className="px-3 py-2 font-mono">{f.file_no}</td>
                <td className="px-3 py-2">{f.item_name}</td>
                <td className="px-3 py-2 text-right">{f.quantity}</td>
                <td className="px-3 py-2 text-right font-medium">{formatCurrency(f.total_cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold">
              <td colSpan={3} className="px-3 py-2 text-right">Grand total</td>
              <td className="px-3 py-2 text-right text-green-700">{formatCurrency(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="p-4 bg-slate-50 rounded border border-slate-200">
        <span className="text-sm font-semibold text-slate-700">Mode of purchase: </span>
        <span className="text-sm text-slate-900">{procurementMethod?.name ?? '—'}</span>
      </div>
    </div>
  );
};
