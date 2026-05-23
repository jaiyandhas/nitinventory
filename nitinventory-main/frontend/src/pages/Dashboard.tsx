import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, CheckCircle, Clock, XCircle, TrendingUp, Package, AlertTriangle, Wallet } from 'lucide-react';
import { prApi, budgetApi, assetsApi, inventoryApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PR_STATUS_COLORS, PR_STATUS_LABELS, PRStatus, PurchaseRequest } from '../types';
import { Link } from 'react-router-dom';

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color: string }> = ({ icon, label, value, color }) => (
  <div className="card p-5 border-l-4" style={{ borderLeftColor: color }}>
    <div className="flex items-center justify-between mb-2">
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      <div className="text-slate-400">{icon}</div>
    </div>
    <div className="text-sm font-medium text-slate-600">{label}</div>
  </div>
);

export const DashboardPage: React.FC = () => {
  const { user, isRole } = useAuth();

  const { data: prs = [] } = useQuery<PurchaseRequest[]>({
    queryKey: ['prs'],
    queryFn: () => prApi.list().then(r => r.data),
  });

  const { data: budget } = useQuery({
    queryKey: ['budget-overview'],
    queryFn: () => budgetApi.overview().then(r => r.data),
    enabled: isRole('faculty', 'hod', 'admin'),
  });

  const { data: assets = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: () => assetsApi.list().then(r => r.data),
    enabled: isRole('hod', 'verifier_sp', 'admin'),
  });

  const { data: discrepancies = [] } = useQuery({
    queryKey: ['discrepancies'],
    queryFn: () => inventoryApi.listDiscrepancies().then(r => r.data),
    enabled: isRole('admin', 'verifier_sp', 'apex_approver'),
  });

  const activePrs = prs.filter((p: PurchaseRequest) => !['po_issued', 'rejected', 'cancelled', 'completed'].includes(p.current_status));
  const completedPrs = prs.filter((p: PurchaseRequest) => p.current_status === 'po_issued');
  const rejectedPrs = prs.filter((p: PurchaseRequest) => p.current_status === 'rejected');

  const formatCurrency = (n?: number) => {
    if (n === undefined || n === null || isNaN(n)) return '₹0.00L';
    return `₹${(n / 100000).toFixed(2)}L`;
  };

  const safeBudget = {
    total: budget?.total || 0,
    available: budget?.available || 0,
    deducted: budget?.deducted || 0,
    locked: budget?.locked || 0
  };

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-white p-6 border border-slate-200 rounded-md shadow-sm">
        <h1 className="text-xl font-bold text-[#1a3a6b] mb-1">Administrative Dashboard</h1>
        <p className="text-sm text-slate-600 font-medium">
          Welcome, {user?.name} | {user?.role?.name} | {user?.department?.name || 'Central Office'}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<FileText size={20} />} label="Active PRs" value={activePrs.length} color="#3b82f6" />
        <StatCard icon={<CheckCircle size={20} />} label="PO Issued" value={completedPrs.length} color="#22c55e" />
        <StatCard icon={<XCircle size={20} />} label="Rejected" value={rejectedPrs.length} color="#ef4444" />
        {budget && (
          <StatCard icon={<Wallet size={20} />} label="Budget Available" value={formatCurrency(safeBudget.available)} color="#1a3a6b" />
        )}
        {isRole('hod', 'verifier_sp', 'admin') && !budget && (
          <StatCard icon={<Package size={20} />} label="Total Assets" value={assets.length} color="#8b5cf6" />
        )}
      </div>

      {/* Budget bar */}
      {budget && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Department Budget Overview</h3>
            <Link to="/budget" className="text-xs font-semibold text-[#1a3a6b] hover:underline">View Details</Link>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span>Total: {formatCurrency(safeBudget.total)}</span>
              <span>Available: {formatCurrency(safeBudget.available)}</span>
            </div>
            <div className="h-4 bg-slate-200 rounded overflow-hidden flex border border-slate-300">
              <div className="bg-red-600 h-full transition-all duration-500" style={{ width: `${safeBudget.total ? (safeBudget.deducted / safeBudget.total) * 100 : 0}%` }} title="Spent" />
              <div className="bg-yellow-500 h-full transition-all duration-500" style={{ width: `${safeBudget.total ? (safeBudget.locked / safeBudget.total) * 100 : 0}%` }} title="Locked" />
              <div className="bg-blue-100 h-full flex-1" title="Available" />
            </div>
            <div className="flex gap-6 text-xs font-medium text-slate-700">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-600" /> Spent {formatCurrency(safeBudget.deducted)}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-yellow-500" /> Locked {formatCurrency(safeBudget.locked)}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded border border-slate-300 bg-blue-100" /> Available {formatCurrency(safeBudget.available)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Open discrepancies alert */}
      {discrepancies.filter((d: { status: string }) => d.status === 'open').length > 0 && (
        <div className="card border-l-4 border-l-orange-500 p-4 flex items-center gap-4 bg-orange-50">
          <AlertTriangle size={24} className="text-orange-600 flex-shrink-0" />
          <div>
            <div className="text-sm font-bold text-orange-800">{discrepancies.filter((d: { status: string }) => d.status === 'open').length} Open Discrepanc{discrepancies.filter((d: { status: string }) => d.status === 'open').length > 1 ? 'ies' : 'y'}</div>
            <div className="text-xs font-medium text-orange-700 mt-0.5">Quantity mismatches detected. Payments are currently blocked.</div>
          </div>
          <Link to="/inventory/discrepancies" className="ml-auto btn-primary text-xs py-1.5 px-3">Resolve Now</Link>
        </div>
      )}

      {/* Recent PRs table */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Recent Purchase Requests</h3>
          <Link to="/pr" className="text-xs font-semibold text-[#1a3a6b] hover:underline">View All</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50 uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-semibold">ICR / ID</th>
                <th className="text-left px-5 py-3 font-semibold">Initiator</th>
                <th className="text-left px-5 py-3 font-semibold">Amount</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {prs.slice(0, 8).map((pr: PurchaseRequest) => (
                <tr key={pr.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link to={`/pr/${pr.id}`} className="text-[#1a3a6b] hover:underline font-bold">
                      {pr.icr_number || `#${pr.id}`}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{pr.initiator?.name || '—'}</td>
                  <td className="px-5 py-3 text-slate-700 font-medium">
                    {formatCurrency(pr.amount)}
                  </td>
                  <td className="px-5 py-3">
                    <span className="status-badge border-slate-300 bg-slate-100 text-slate-700">
                      {PR_STATUS_LABELS[pr.current_status as PRStatus] || pr.current_status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500 font-medium">{new Date(pr.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {prs.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">No purchase requests yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
