import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { prApi } from '../services/api';
import { PurchaseRequest, PR_STATUS_COLORS, PR_STATUS_LABELS, PRStatus } from '../types';
import { useAuth } from '../context/AuthContext';

export const PRListPage: React.FC = () => {
  const { isRole } = useAuth();
  const { data: prs = [], isLoading } = useQuery<PurchaseRequest[]>({
    queryKey: ['prs'],
    queryFn: () => prApi.list().then(r => r.data),
  });

  const formatCurrency = (n?: number) => {
    if (n === undefined || n === null || isNaN(n)) return '₹0.00L';
    return `₹${(n / 100000).toFixed(2)}L`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Purchase Requests</h1>
          <p className="page-subtitle">Showing {prs.length} request(s)</p>
        </div>
        {isRole('faculty', 'hod') && (
          <Link to="/pr/create" className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New PR
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-slate-500 font-medium">Loading records...</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50 uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-semibold">ICR Number</th>
                <th className="text-left px-5 py-3 font-semibold">Initiator</th>
                <th className="text-left px-5 py-3 font-semibold">Category</th>
                <th className="text-left px-5 py-3 font-semibold">Amount</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {prs.map((pr: PurchaseRequest) => (
                <tr key={pr.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link to={`/pr/${pr.id}`} className="text-[#1a3a6b] hover:underline font-bold">
                      {pr.icr_number || `#${pr.id}`}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{pr.initiator?.name || '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{pr.category?.title || '—'}</td>
                  <td className="px-5 py-3 text-slate-700 font-medium">{formatCurrency(pr.amount)}</td>
                  <td className="px-5 py-3">
                    <span className="status-badge border-slate-300 bg-slate-100 text-slate-700">
                      {PR_STATUS_LABELS[pr.current_status as PRStatus] || pr.current_status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500 font-medium">{new Date(pr.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {prs.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-slate-500 text-sm font-medium">No purchase requests found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
