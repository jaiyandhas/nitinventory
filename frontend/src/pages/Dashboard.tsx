import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, CheckCircle, Clock, XCircle, TrendingUp, Package, AlertTriangle, Wallet, Layers } from 'lucide-react';
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

  const { data: prsData } = useQuery({
    queryKey: ['prs', 'dashboard'],
    queryFn: () => prApi.list({ limit: 200 }).then(r => r.data),
  });
  const prs = prsData?.items || [];

  const { data: budget } = useQuery({
    queryKey: ['budget-overview'],
    queryFn: () => budgetApi.overview().then(r => r.data),
    enabled: isRole('faculty', 'hod', 'admin'),
  });

  const { data: assetsData } = useQuery({
    queryKey: ['assets', 'dashboard'],
    queryFn: () => assetsApi.list({ limit: 200 }).then(r => r.data),
    enabled: isRole('hod', 'verifier_sp', 'admin'),
  });
  const assets = assetsData?.items || [];

  const { data: discrepancies = [] } = useQuery({
    queryKey: ['discrepancies'],
    queryFn: () => inventoryApi.listDiscrepancies().then(r => r.data),
    enabled: isRole('admin', 'verifier_sp', 'apex_approver'),
  });

  const activePrs = prs.filter((p: PurchaseRequest) => !['po_issued', 'rejected', 'cancelled', 'completed'].includes(p.current_status));
  const completedPrs = prs.filter((p: PurchaseRequest) => p.current_status === 'po_issued');
  const rejectedPrs = prs.filter((p: PurchaseRequest) => p.current_status === 'rejected');

  const pendingActions = prs.filter((pr: any) => {
    if (['po_issued', 'rejected', 'cancelled', 'completed'].includes(pr.current_status)) {
      return false;
    }

    const hasPendingReferralForMe = pr.referrals?.some(
      (ref: any) => ref.referred_to?.id === user?.id && ref.status === 'pending'
    );
    if (hasPendingReferralForMe) return true;

    if (!pr.flow) return false;

    if (user?.role?.group_key === 'admin') return true;

    if (pr.flow.phase_name === 'Technical Evaluation' && pr.flow.step_order === 1) {
      const committeeIds = [pr.initiator?.id, pr.faculty1_id, pr.faculty2_id, pr.faculty3_id].filter(Boolean);
      if (committeeIds.includes(user?.id)) {
        const since = pr.te_initiated_at ? new Date(pr.te_initiated_at) : null;
        const hasUserSigned = pr.history?.some((h: any) => 
          h.approver_id === user?.id && 
          (h.status === 'Technical Evaluation Completed' || h.status === 'Technical Evaluation Approved') &&
          (!since || !h.acted_at || new Date(h.acted_at) >= since)
        );
        return !hasUserSigned;
      }
    }

    if (pr.flow.expected_user_id) {
      return user?.id === pr.flow.expected_user_id;
    }

    if (pr.flow.expected_role_name === 'Faculty' || pr.flow.expected_group === 'faculty') {
      return user?.id === pr.initiator?.id;
    }

    if (pr.flow.expected_role_id) {
      return user?.role_id === pr.flow.expected_role_id;
    }

    if (pr.flow.expected_group) {
      return user?.role?.group_key === pr.flow.expected_group;
    }

    return false;
  });

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
        <StatCard icon={<Layers size={20} />} label="My Pending Actions" value={pendingActions.length} color="#8b5cf6" />
      </div>

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

      {/* My Pending Actions Widget */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-[#1a3a6b]" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">My Pending Actions</h3>
          </div>
          <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded text-xs font-bold">
            {pendingActions.length} Action(s) Required
          </span>
        </div>

        {pendingActions.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs font-semibold flex flex-col items-center justify-center gap-2">
            <CheckCircle size={32} className="text-green-500" />
            <div>All caught up! No pending procurement actions at this moment.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingActions.map((pr: any) => {
              const hasReferralForMe = pr.referrals?.some(
                (ref: any) => ref.referred_to?.id === user?.id && ref.status === 'pending'
              );
              let actionTitle = "Awaiting Action";
              let badgeColor = "bg-blue-100 text-blue-800";
              
              if (hasReferralForMe) {
                actionTitle = "Opinion Requested";
                badgeColor = "bg-amber-100 text-amber-800 border border-amber-300";
              } else if (pr.flow) {
                actionTitle = `${pr.flow.phase_name || 'N/A'}`;
              }

              return (
                <div key={pr.id} className="p-4 bg-slate-50 border border-slate-200 hover:border-[#1a3a6b] transition-all flex flex-col justify-between rounded-lg shadow-sm hover:shadow-md">
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                        {pr.icr_number || `#${pr.id}`}
                      </span>
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${badgeColor}`}>
                        {actionTitle}
                      </span>
                    </div>
                    <h4 className="text-xs font-black text-slate-800 uppercase line-clamp-1">{pr.category?.title}</h4>
                    <div className="text-[10.5px] text-slate-500 space-y-1">
                      <p><span className="font-semibold text-slate-600">Method:</span> {pr.procurement?.name}</p>
                      <p><span className="font-semibold text-slate-600">Initiator:</span> {pr.initiator?.name}</p>
                      <p><span className="font-semibold text-slate-600">Total:</span> {formatCurrency(pr.amount)}</p>
                    </div>
                  </div>
                  <Link to={`/pr/${pr.id}`} className="text-[11px] font-bold text-[#1a3a6b] hover:underline mt-4 inline-flex items-center gap-1 self-start">
                    Go to Action Desk →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
