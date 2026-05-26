import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, 
  RotateCcw, ShieldAlert, Search
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { prApi, budgetApi, adminApi } from '../services/api';
import { PurchaseRequest } from '../types';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

import { PRHeader } from '../components/pr/PRHeader';
import { PRItemsTable } from '../components/pr/PRItemsTable';
import { PRActionPanel } from '../components/pr/PRActionPanel';

const WorkflowTimeline: React.FC<{ history: PurchaseRequest['history']; currentStatus: string }> = ({ history = [] }) => {
  return (
    <div className="space-y-4">
      {history.map((h, i) => {
        const isLast = i === history.length - 1;
        const isRejected = h.status.toLowerCase().includes('reject');
        const isSentBack = h.status.toLowerCase().includes('sent back');
        return (
          <div key={h.id} className="flex gap-4 items-start">
            <div className="flex flex-col items-center mt-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border ${isRejected ? 'bg-red-50 border-red-200 text-red-600' : isSentBack ? 'bg-orange-50 border-orange-200 text-orange-600' : isLast ? 'bg-blue-50 border-blue-200 text-[#1a3a6b]' : 'bg-green-50 border-green-200 text-green-600'}`}>
                {isRejected ? <XCircle size={14} /> : isSentBack ? <RotateCcw size={12} /> : isLast ? <Clock size={12} /> : <CheckCircle2 size={14} />}
              </div>
              {i < history.length - 1 && <div className="w-px h-6 bg-slate-200 mt-2" />}
            </div>
            <div className="flex-1 pb-2">
              <div className="text-sm font-bold text-slate-800">{h.status}</div>
              {h.remarks && <div className="text-sm text-slate-600 mt-1 italic">"{h.remarks}"</div>}
              {h.acted_at && <div className="text-xs text-slate-500 mt-1 font-medium">{new Date(h.acted_at).toLocaleString()}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const PRDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role?.group_key === 'admin';

  const [showHistory, setShowHistory] = useState(true);

  // Admin control states
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [adminFilterRole, setAdminFilterRole] = useState('');
  const [adminFilterDept, setAdminFilterDept] = useState('');

  // Admin queries
  const { data: adminRoles = [] } = useQuery({
    queryKey: ['admin_roles'],
    queryFn: () => adminApi.roles().then(res => res.data),
    enabled: isAdmin
  });
  const { data: adminUsers = [] } = useQuery({
    queryKey: ['admin_users_list'],
    queryFn: () => adminApi.users().then(res => res.data),
    enabled: isAdmin
  });
  const { data: adminDepts = [] } = useQuery({
    queryKey: ['admin_depts'],
    queryFn: () => adminApi.departments().then(res => res.data),
    enabled: isAdmin
  });

  // Admin mutations
  const updateWfMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => adminApi.updateWorkflow(id, data),
    onSuccess: () => {
      toast.success('Workflow step updated successfully');
      queryClient.invalidateQueries({ queryKey: ['pr', id] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update workflow step')
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => adminApi.updateUser(id, data),
    onSuccess: () => {
      toast.success('User role updated successfully');
      queryClient.invalidateQueries({ queryKey: ['pr', id] });
      queryClient.invalidateQueries({ queryKey: ['admin_users_list'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update user role')
  });

  const { data: pr, refetch } = useQuery<PurchaseRequest>({
    queryKey: ['pr', id],
    queryFn: () => prApi.get(Number(id)).then(r => r.data),
  });

  const { data: faculties = [] } = useQuery<any[]>({
    queryKey: ['departmentFaculty'],
    queryFn: () => budgetApi.departmentFaculty().then(r => r.data),
    enabled: !!pr && user?.role?.group_key === 'hod' && (pr.flow?.expected_group === 'hod' || pr.flow?.expected_role_name?.toLowerCase().includes('hod') || pr.flow?.phase_name === 'Administrative Approval'),
  });

  if (!pr) return <div className="text-center py-16 text-slate-500 font-medium">Loading details...</div>;

  let canActOn = false;
  if (user?.role?.group_key === 'admin') {
    canActOn = true;
  } else if (pr.flow) {
    if (pr.flow.expected_user_id) {
      if (user?.id === pr.flow.expected_user_id) {
        canActOn = true;
      }
    } else if (pr.flow.expected_role_name === 'Faculty' || pr.flow.expected_group === 'faculty') {
      canActOn = user?.id === pr.initiator?.id;
    } else if (pr.flow.expected_role_id) {
      if (user?.role_id === pr.flow.expected_role_id) {
        canActOn = true;
      }
    } else if (pr.flow.expected_group) {
      if (user?.role?.group_key === pr.flow.expected_group) {
        canActOn = true;
      }
    }
  }

  const isActionable = canActOn && !['po_issued', 'rejected', 'cancelled', 'completed'].includes(pr.current_status);

  const formatCurrency = (n?: number) => {
    if (n === undefined || n === null || isNaN(n)) return '₹0.00L';
    return `₹${(n / 100000).toFixed(2)}L`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <PRHeader
        pr={pr}
        user={user}
        isAdmin={isAdmin}
        adminRoles={adminRoles}
        adminUsers={adminUsers}
        adminDepts={adminDepts}
        updateWfMutation={updateWfMutation}
        formatCurrency={formatCurrency}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-6">
          <PRItemsTable
            pr={pr}
            formatCurrency={formatCurrency}
          />

          {/* Action area */}
          {isActionable && (
            <PRActionPanel
              pr={pr}
              user={user}
              refetch={refetch}
              faculties={faculties}
            />
          )}
        </div>

        {/* Timeline */}
        <div className="space-y-6">
          <div className="card h-fit">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Workflow History</h3>
              <button onClick={() => setShowHistory(!showHistory)} className="text-slate-500 hover:text-[#1a3a6b]">
                {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            {showHistory && (
              <div className="p-5">
                <WorkflowTimeline history={pr.history} currentStatus={pr.current_status} />
              </div>
            )}
          </div>

          {/* Admin user role quick edit panel */}
          {isAdmin && (
            <div className="card h-fit border border-blue-200 bg-blue-50/20">
              <div className="px-5 py-4 border-b border-blue-100 bg-blue-50/50 flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#1a3a6b] uppercase tracking-wide flex items-center gap-1.5">
                  <ShieldAlert size={14} /> Quick User Roles Admin
                </h3>
                <button 
                  onClick={() => setIsAdminPanelOpen(!isAdminPanelOpen)} 
                  className="text-[#1a3a6b] hover:underline text-xs font-semibold"
                >
                  {isAdminPanelOpen ? 'Hide' : 'Show'}
                </button>
              </div>
              
              {isAdminPanelOpen && (
                <div className="p-5 space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Search User</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Search name/email..." 
                        value={adminUserSearch}
                        onChange={(e) => setAdminUserSearch(e.target.value)}
                        className="input-field pl-8 text-xs py-1 px-2 h-8"
                      />
                      <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Filter Role</label>
                      <select 
                        value={adminFilterRole} 
                        onChange={(e) => setAdminFilterRole(e.target.value)}
                        className="input-field text-xs py-1.5 px-1 h-8"
                      >
                        <option value="">All Roles</option>
                        {adminRoles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Filter Dept</label>
                      <select 
                        value={adminFilterDept} 
                        onChange={(e) => setAdminFilterDept(e.target.value)}
                        className="input-field text-xs py-1.5 px-1 h-8"
                      >
                        <option value="">All Depts</option>
                        {adminDepts.map((d: any) => <option key={d.id} value={d.id}>{d.short_code}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    {adminUsers
                      .filter((u: any) => {
                        if (adminUserSearch && !u.name.toLowerCase().includes(adminUserSearch.toLowerCase()) && !u.email.toLowerCase().includes(adminUserSearch.toLowerCase())) return false;
                        if (adminFilterRole && u.role_id !== Number(adminFilterRole)) return false;
                        if (adminFilterDept && u.department_id !== Number(adminFilterDept)) return false;
                        return true;
                      })
                      .map((u: any) => (
                        <div key={u.id} className="bg-white border border-slate-100 p-2.5 rounded shadow-sm flex flex-col gap-1.5 text-xs hover:border-slate-300 transition-colors">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-slate-800 leading-snug">{u.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono leading-none mt-0.5">{u.email}</div>
                            </div>
                            {u.department_id && (
                              <span className="bg-slate-100 text-slate-600 px-1 py-0.5 rounded text-[9px] font-bold">
                                {adminDepts.find((d: any) => d.id === u.department_id)?.short_code}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 pt-1 border-t border-slate-50">
                            <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0">Role:</span>
                            <select
                              value={u.role_id || ''}
                              onChange={(e) => {
                                const newRoleId = Number(e.target.value);
                                updateUserRoleMutation.mutate({ id: u.id, data: { role_id: newRoleId } });
                              }}
                              className="bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-[11px] font-semibold text-slate-700 focus:outline-none focus:border-[#1a3a6b] w-full cursor-pointer"
                            >
                              <option value="">No Role</option>
                              {adminRoles.map((r: any) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default PRDetailPage;
