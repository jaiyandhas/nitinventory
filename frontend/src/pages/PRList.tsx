import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../utils/format';
import { Plus } from 'lucide-react';
import { prApi } from '../services/api';
import { PurchaseRequest, PR_STATUS_COLORS, PR_STATUS_LABELS, PRStatus } from '../types';
import { useAuth } from '../context/AuthContext';

export const PRListPage: React.FC = () => {
  const { isRole } = useAuth();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  
  const { data, isLoading } = useQuery({
    queryKey: ['prs', page, limit],
    queryFn: () => prApi.list({ skip: (page - 1) * limit, limit }).then(r => r.data),
  });

  const prs = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit) || 1;



  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Purchase Requests</h1>
          <p className="page-subtitle">Showing {prs.length} request(s) of {total} total</p>
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
        <>
          <div className="card overflow-x-auto">
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

          {/* Pagination Controls */}
          {total > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 bg-white px-4 py-3 sm:px-6 mt-4 rounded-lg shadow-sm">
              <div className="flex flex-col sm:flex-row items-center gap-4 justify-between w-full sm:w-auto">
                <p className="text-sm text-slate-700">
                  Showing <span className="font-medium">{total === 0 ? 0 : (page - 1) * limit + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(page * limit, total)}</span> of{' '}
                  <span className="font-medium">{total}</span> requests
                </p>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span>Show</span>
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setPage(1);
                    }}
                    className="rounded-md border-slate-300 py-1 px-2 text-sm focus:border-[#1a3a6b] focus:ring-[#1a3a6b] bg-white border shadow-sm"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>per page</span>
                </div>
              </div>
              <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                <div className="flex flex-1 justify-between sm:hidden">
                  <button
                    onClick={() => setPage(p => Math.max(p - 1, 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                    disabled={page === totalPages}
                    className="relative ml-3 inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
                {totalPages > 1 && (
                  <div className="hidden sm:block">
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                      <button
                        onClick={() => setPage(p => Math.max(p - 1, 1))}
                        disabled={page === 1}
                        className="relative inline-flex items-center rounded-l-md px-3 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold focus:z-20 ${
                            p === page
                              ? 'z-10 bg-[#1a3a6b] text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a3a6b]'
                              : 'text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:outline-offset-0'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                      <button
                        onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                        disabled={page === totalPages}
                        className="relative inline-flex items-center rounded-r-md px-3 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </nav>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
