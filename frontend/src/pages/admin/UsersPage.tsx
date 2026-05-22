import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import { toast } from 'react-hot-toast';
import { Edit, UserX, UserCheck, Key, Plus, UserPlus, FileText, Check, X, ShieldAlert } from 'lucide-react';

export const UsersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'active' | 'pending'>('active');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  // Queries
  const { data: users = [], isLoading: isUsersLoading } = useQuery({ 
    queryKey: ['admin_users'], 
    queryFn: () => adminApi.users().then(res => res.data) 
  });
  
  const { data: pendingUsers = [], isLoading: isPendingLoading } = useQuery({
    queryKey: ['admin_pending_users'],
    queryFn: () => adminApi.getPendingUsers().then(res => res.data),
    enabled: activeTab === 'pending'
  });

  const { data: roles = [] } = useQuery({ 
    queryKey: ['admin_roles'], 
    queryFn: () => adminApi.roles().then(res => res.data) 
  });
  
  const { data: depts = [] } = useQuery({ 
    queryKey: ['admin_depts'], 
    queryFn: () => adminApi.departments().then(res => res.data) 
  });

  const [filterRole, setFilterRole] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: any) => adminApi.createUser(data),
    onSuccess: () => {
      toast.success('User created');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error creating user')
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: any }) => adminApi.updateUser(id, data),
    onSuccess: () => {
      toast.success('User updated');
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
    }
  });

  const resetMutation = useMutation({
    mutationFn: (id: number) => adminApi.resetPassword(id),
    onSuccess: () => toast.success('Password reset to default (Password@123)')
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => adminApi.approveUser(id),
    onSuccess: () => {
      toast.success('User onboarding request approved!');
      queryClient.invalidateQueries({ queryKey: ['admin_users'] });
      queryClient.invalidateQueries({ queryKey: ['admin_pending_users'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error approving user')
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => adminApi.rejectUser(id),
    onSuccess: () => {
      toast.success('User onboarding request rejected & deleted');
      queryClient.invalidateQueries({ queryKey: ['admin_pending_users'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error rejecting user')
  });

  const filteredUsers = users.filter((u: any) => {
    if (filterRole && u.role_id !== Number(filterRole)) return false;
    if (filterDept && u.department_id !== Number(filterDept)) return false;
    if (filterStatus) {
      if (filterStatus === 'active' && !u.is_active) return false;
      if (filterStatus === 'inactive' && u.is_active) return false;
    }
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: any = Object.fromEntries(formData.entries());
    if (data.role_id) data.role_id = Number(data.role_id);
    if (data.department_id) data.department_id = Number(data.department_id);
    else delete data.department_id;

    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="page-header">User Management</h1>
          <p className="page-subtitle">Manage system users, roles, and access approvals</p>
        </div>
        <button onClick={() => { setEditingUser(null); setIsModalOpen(true); }} className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Add User
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'active'
              ? 'border-[#1a3a6b] text-[#1a3a6b]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Active Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'pending'
              ? 'border-[#1a3a6b] text-[#1a3a6b]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Pending Onboarding
          {pendingUsers.length > 0 && (
            <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {pendingUsers.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'active' ? (
        <div className="card p-6 bg-white border border-slate-200">
          {isUsersLoading ? (
            <div className="flex justify-center p-8">
              <div className="w-8 h-8 rounded-full border-2 border-[#1a3a6b] border-t-transparent animate-spin" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-4 mb-6">
                <input type="text" placeholder="Search name or email..." value={search} onChange={e => setSearch(e.target.value)} className="input-field max-w-xs" />
                <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="input-field">
                  <option value="">All Roles</option>
                  {roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="input-field">
                  <option value="">All Departments</option>
                  {depts.map((d: any) => <option key={d.id} value={d.id}>{d.short_code}</option>)}
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field">
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Role & Dept</th>
                      <th className="px-4 py-3">Signature</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Last Login</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u: any) => (
                      <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">
                          <div>{u.name}</div>
                          <div className="text-xs text-slate-500 font-normal">{u.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium mb-1">
                            {roles.find((r: any) => r.id === u.role_id)?.name || 'Unknown'}
                          </div>
                          {u.department_id && (
                            <div className="text-xs text-slate-500">
                              Dept: {depts.find((d: any) => d.id === u.department_id)?.short_code}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {u.signature_path ? (
                            <img src={u.signature_path} alt="Sig" className="h-8 max-w-[100px] object-contain border border-slate-200 p-0.5 rounded bg-slate-50" />
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">None</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs font-medium">
                          {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                        </td>
                        <td className="px-4 py-3 flex gap-2">
                          <button onClick={() => setEditingUser(u)} className="p-1 text-slate-400 hover:text-blue-600" title="Edit">
                            <Edit size={16} />
                          </button>
                          <button onClick={() => updateMutation.mutate({ id: u.id, data: { is_active: !u.is_active }})} className={`p-1 ${u.is_active ? 'text-slate-400 hover:text-red-600' : 'text-red-400 hover:text-green-600'}`} title={u.is_active ? "Deactivate" : "Activate"}>
                            {u.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                          </button>
                          <button onClick={() => { if(confirm('Reset password to Password@123?')) resetMutation.mutate(u.id); }} className="p-1 text-slate-400 hover:text-amber-600" title="Reset Password">
                            <Key size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="card p-6 bg-white border border-slate-200">
          {isPendingLoading ? (
            <div className="flex justify-center p-8">
              <div className="w-8 h-8 rounded-full border-2 border-[#1a3a6b] border-t-transparent animate-spin" />
            </div>
          ) : pendingUsers.length === 0 ? (
            <div className="text-center py-12 text-slate-500 space-y-3">
              <ShieldAlert className="mx-auto h-12 w-12 text-slate-300" />
              <p className="font-bold text-lg text-slate-700">No Pending Approvals</p>
              <p className="text-sm">All faculty and HOD onboarding requests have been processed.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {pendingUsers.map((u: any) => (
                <div key={u.id} className="border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between bg-slate-50">
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-slate-800 text-lg leading-tight">{u.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{u.email}</p>
                      </div>
                      <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wide">
                        Pending Onboarding
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs border-y border-slate-200 py-3">
                      <div>
                        <span className="text-slate-400 font-semibold uppercase block tracking-wider">Designation</span>
                        <span className="font-bold text-slate-700 text-sm mt-0.5 block">{u.designation || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold uppercase block tracking-wider">Gender</span>
                        <span className="font-bold text-slate-700 text-sm mt-0.5 block">{u.gender || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold uppercase block tracking-wider">Target Role</span>
                        <span className="font-bold text-slate-700 text-sm mt-0.5 block">{u.role?.name || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold uppercase block tracking-wider">Department</span>
                        <span className="font-bold text-slate-700 text-sm mt-0.5 block">{u.department?.short_code || 'N/A'}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-400 text-xs font-semibold uppercase block tracking-wider mb-2">Digital Signature</span>
                      {u.signature_path ? (
                        <div className="bg-white border border-slate-200 rounded-lg p-2 flex justify-center items-center h-24">
                          <img src={u.signature_path} alt="Signature Upload" className="max-h-full max-w-full object-contain" />
                        </div>
                      ) : (
                        <div className="bg-rose-50 border border-rose-100 text-rose-600 rounded-lg p-3 text-xs text-center font-bold">
                          No digital signature uploaded
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6 pt-4 border-t border-slate-200">
                    <button
                      onClick={() => {
                        if (confirm(`Approve and onboard ${u.name}?`)) approveMutation.mutate(u.id);
                      }}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      className="flex-1 btn-primary py-2 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 border-emerald-600"
                    >
                      <Check size={16} /> Approve & Onboard
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Reject and delete the onboarding request for ${u.name}?`)) rejectMutation.mutate(u.id);
                      }}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      className="btn-secondary text-rose-600 hover:text-white hover:bg-rose-600 hover:border-rose-600 border-slate-200 py-2 flex items-center justify-center gap-2"
                    >
                      <X size={16} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(isModalOpen || editingUser) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">{editingUser ? 'Edit User' : 'Add User'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input type="text" name="name" required defaultValue={editingUser?.name} className="input-field w-full" />
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input type="email" name="email" required className="input-field w-full" />
                </div>
              )}
              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <input type="password" name="password" required className="input-field w-full" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select name="role_id" required defaultValue={editingUser?.role_id} className="input-field w-full">
                  <option value="">Select Role...</option>
                  {roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department (Optional)</label>
                <select name="department_id" defaultValue={editingUser?.department_id || ''} className="input-field w-full">
                  <option value="">None</option>
                  {depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { setIsModalOpen(false); setEditingUser(null); }} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary">
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
