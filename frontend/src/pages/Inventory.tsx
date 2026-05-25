import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, CheckCircle, AlertTriangle } from 'lucide-react';
import { inventoryApi } from '../services/api';
import { Delivery } from '../types';
import { Link } from 'react-router-dom';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600 border-slate-300',
  dept_logged: 'bg-blue-50 text-blue-700 border-blue-300',
  stores_logged: 'bg-yellow-50 text-yellow-700 border-yellow-300',
  verified: 'bg-green-50 text-green-700 border-green-300',
  discrepancy: 'bg-red-50 text-red-700 border-red-300',
};

export const DeliveriesPage: React.FC = () => {
  const { data: deliveries = [], isLoading } = useQuery<Delivery[]>({
    queryKey: ['deliveries'],
    queryFn: () => inventoryApi.listDeliveries().then(r => r.data),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-header">Deliveries & GRN</h1>
        <p className="page-subtitle">Goods receipt notes and delivery verification</p>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-slate-500 font-medium">Loading deliveries...</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50 uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-semibold">ID</th>
                <th className="text-left px-5 py-3 font-semibold">PO Ref</th>
                <th className="text-left px-5 py-3 font-semibold">Challan No.</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Created</th>
                <th className="text-left px-5 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {deliveries.map((d: Delivery) => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-bold text-[#1a3a6b]">#{d.id}</td>
                  <td className="px-5 py-3 text-slate-700">PR #{d.po_id}</td>
                  <td className="px-5 py-3 text-slate-600">{d.challan_number || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`status-badge ${STATUS_COLORS[d.status] || ''}`}>
                      {d.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500 font-medium">{new Date(d.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    <Link to={`/inventory/deliveries/${d.id}`} className="text-xs font-semibold text-[#1a3a6b] hover:underline">
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-slate-500 text-sm font-medium">No deliveries yet. PRs will appear here once PO is issued.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const DiscrepanciesPage: React.FC = () => {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['discrepancies'],
    queryFn: () => inventoryApi.listDiscrepancies().then(r => r.data),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-header">Discrepancies</h1>
        <p className="page-subtitle">Quantity mismatches blocking payment</p>
      </div>
      {isLoading ? (
        <div className="card p-8 text-center text-slate-500 font-medium">Loading discrepancies...</div>
      ) : (
        <div className="space-y-4">
          {items.map((d: { id: number; delivery_item_id: number; challan_qty: number; dept_qty: number; stores_qty: number; status: string; created_at: string }) => (
            <div key={d.id} className={`card p-5 border-l-4 ${d.status === 'open' ? 'border-l-red-500 bg-red-50' : 'border-l-green-500 bg-green-50'}`}>
              <div className="flex items-center gap-3 mb-4 border-b border-slate-200 pb-3">
                <AlertTriangle size={20} className={d.status === 'open' ? 'text-red-600' : 'text-green-600'} />
                <div className="font-bold text-slate-800">Delivery Item #{d.delivery_item_id}</div>
                <span className={`status-badge ml-auto ${d.status === 'open' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-green-100 text-green-700 border-green-300'}`}>
                  {d.status.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-6 text-sm bg-white p-4 rounded border border-slate-200 shadow-sm">
                <div><div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Challan Qty</div><div className="text-slate-800 font-bold text-lg">{d.challan_qty}</div></div>
                <div><div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Dept Received</div><div className={`font-bold text-lg ${d.dept_qty !== d.challan_qty ? 'text-red-600' : 'text-green-600'}`}>{d.dept_qty}</div></div>
                <div><div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Stores Logged</div><div className={`font-bold text-lg ${d.stores_qty !== d.challan_qty ? 'text-red-600' : 'text-green-600'}`}>{d.stores_qty}</div></div>
              </div>
              <div className="text-xs font-medium text-slate-500 mt-4 text-right">Reported {new Date(d.created_at).toLocaleDateString()}</div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="card p-12 text-center bg-green-50 border border-green-200">
              <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
              <div className="text-green-800 font-bold text-lg">No Discrepancies Found</div>
              <div className="text-green-700 mt-1 font-medium">All quantities match perfectly.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
