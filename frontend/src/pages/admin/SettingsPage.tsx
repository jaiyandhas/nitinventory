import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, ArrowDown, Plus, Trash2, Edit, AlertTriangle, UserX, UserCheck, Key } from 'lucide-react';
import { adminApi } from '../../services/api';
import { toast } from 'react-hot-toast';
import { formatCurrency } from '../../utils/format';
import { REQUIREMENT_TYPES } from '../../config/prCreationQuestions';

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'workflows' | 'roles' | 'categories' | 'procurement' | 'users'>('workflows');
  
  // Workflows states
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [selectedProc, setSelectedProc] = useState<number | null>(null);
  const [selectedPurchaseType, setSelectedPurchaseType] = useState<'department' | 'office'>('department');
  const [isWfModalOpen, setIsWfModalOpen] = useState(false);
  const [wfAssigneeType, setWfAssigneeType] = useState<'role' | 'tag' | 'group'>('role');

  // User tab states
  const [userSearch, setUserSearch] = useState('');
  const [userFilterRole, setUserFilterRole] = useState('');
  const [userFilterDept, setUserFilterDept] = useState('');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  // Role states
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isCustomGroupKey, setIsCustomGroupKey] = useState(false);

  // Category CRUD states
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);

  // Procurement CRUD states
  const [isProcModalOpen, setIsProcModalOpen] = useState(false);
  const [editingProc, setEditingProc] = useState<any>(null);

  // Queries
  const { data: workflows = [] } = useQuery({ queryKey: ['admin_workflows'], queryFn: () => adminApi.workflows().then(res => res.data) });
  const { data: categories = [] } = useQuery({ queryKey: ['admin_categories'], queryFn: () => adminApi.categories().then(res => res.data) });
  const { data: phases = [] } = useQuery({ queryKey: ['admin_phases'], queryFn: () => adminApi.phases().then(res => res.data) });
  const { data: roles = [] } = useQuery({ queryKey: ['admin_roles'], queryFn: () => adminApi.roles().then(res => res.data) });
  const { data: procs = [] } = useQuery({ queryKey: ['admin_procs'], queryFn: () => adminApi.procurementMethods().then(res => res.data) });
  const { data: users = [] } = useQuery({ queryKey: ['admin_users_list'], queryFn: () => adminApi.users().then(res => res.data) });
  const { data: depts = [] } = useQuery({ queryKey: ['admin_depts'], queryFn: () => adminApi.departments().then(res => res.data) });

  const filteredWfs = workflows.filter((w: any) => 
    w.category_id === selectedCat && 
    w.procurement_id === selectedProc &&
    w.purchase_type === selectedPurchaseType
  ).sort((a: any, b: any) => a.step_order - b.step_order);

  React.useEffect(() => {
    if (procs.length > 0 && selectedProc === null) {
      setSelectedProc(procs[0].id);
    }
  }, [procs, selectedProc]);

  React.useEffect(() => {
    if (selectedProc !== null && categories.length > 0) {
      const matchingCats = categories.filter((c: any) => c.procurement_id === selectedProc);
      if (matchingCats.length > 0) {
        if (selectedCat === null || !matchingCats.some((c: any) => c.id === selectedCat)) {
          setSelectedCat(matchingCats[0].id);
        }
      } else {
        setSelectedCat(null);
      }
    }
  }, [selectedProc, categories, selectedCat]);

  // Workflow mutations
  const createWfMutation = useMutation({
    mutationFn: (data: any) => adminApi.createWorkflow(data),
    onSuccess: () => {
      toast.success('Step added');
      setIsWfModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin_workflows'] });
    },
  });

  const deleteWfMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteWorkflow(id),
    onSuccess: () => {
      toast.success('Step removed');
      queryClient.invalidateQueries({ queryKey: ['admin_workflows'] });
    },
  });

  const toggleWfMutation = useMutation({
    mutationFn: (id: number) => adminApi.toggleWorkflow(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin_workflows'] }),
  });

  const updateWfMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => adminApi.updateWorkflow(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_workflows'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error updating workflow step')
  });

  const resetWfMutation = useMutation({
    mutationFn: () => adminApi.resetWorkflow({ category_id: selectedCat, procurement_id: selectedProc, purchase_type: selectedPurchaseType }),
    onSuccess: () => {
      toast.success('Workflows reset to default');
      queryClient.invalidateQueries({ queryKey: ['admin_workflows'] });
    },
  });

  // Role mutation
  const createRoleMutation = useMutation({
    mutationFn: (data: any) => adminApi.createRole(data),
    onSuccess: () => {
      toast.success('Role added successfully');
      setIsRoleModalOpen(false);
      setIsCustomGroupKey(false);
      queryClient.invalidateQueries({ queryKey: ['admin_roles'] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.detail || 'Failed to create role');
    }
  });

  const saveUserMutation = useMutation({
    mutationFn: ({ id, data }: { id?: number; data: any }) => 
      id ? adminApi.updateUser(id, data) : adminApi.createUser(data),
    onSuccess: (_, variables) => {
      toast.success(variables.id ? 'User updated successfully' : 'User created successfully');
      setIsUserModalOpen(false);
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ['admin_users_list'] });
      queryClient.invalidateQueries({ queryKey: ['admin_workflows'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to save user')
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: number) => adminApi.resetPassword(id),
    onSuccess: () => toast.success('Password reset to default (Password@123)'),
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to reset password')
  });

  // Category CRUD mutations
  const saveCatMutation = useMutation({
    mutationFn: (data: any) => editingCat 
      ? adminApi.updateCategory(editingCat.id, data) 
      : adminApi.createCategory(data),
    onSuccess: () => {
      toast.success(editingCat ? 'Category updated' : 'Category created');
      setIsCatModalOpen(false);
      setEditingCat(null);
      queryClient.invalidateQueries({ queryKey: ['admin_categories'] });
      queryClient.invalidateQueries({ queryKey: ['admin_workflows'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error saving category')
  });

  const deleteCatMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteCategory(id),
    onSuccess: () => {
      toast.success('Category and its workflow steps deleted');
      queryClient.invalidateQueries({ queryKey: ['admin_categories'] });
      queryClient.invalidateQueries({ queryKey: ['admin_workflows'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Cannot delete category. It is referenced by existing purchase requests.')
  });

  // Procurement CRUD mutations
  const saveProcMutation = useMutation({
    mutationFn: (data: any) => editingProc 
      ? adminApi.updateProcurementMethod(editingProc.id, data) 
      : adminApi.createProcurementMethod(data),
    onSuccess: () => {
      toast.success(editingProc ? 'Procurement method updated' : 'Procurement method created');
      setIsProcModalOpen(false);
      setEditingProc(null);
      queryClient.invalidateQueries({ queryKey: ['admin_procs'] });
      queryClient.invalidateQueries({ queryKey: ['admin_workflows'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error saving procurement method')
  });

  const deleteProcMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteProcurementMethod(id),
    onSuccess: () => {
      toast.success('Procurement method and its workflow steps deleted');
      queryClient.invalidateQueries({ queryKey: ['admin_procs'] });
      queryClient.invalidateQueries({ queryKey: ['admin_workflows'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Cannot delete procurement method. It is referenced by existing purchase requests.')
  });

  const handleMove = async (stepId: number, direction: 'up' | 'down') => {
    const step = workflows.find((w: any) => w.id === stepId);
    if (!step) return;

    const phaseSteps = workflows
      .filter((w: any) => 
        w.category_id === step.category_id && 
        w.procurement_id === step.procurement_id &&
        w.purchase_type === step.purchase_type &&
        w.phase_id === step.phase_id
      )
      .sort((a: any, b: any) => a.step_order - b.step_order);

    const index = phaseSteps.findIndex((w: any) => w.id === stepId);
    if (index === -1) return;

    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === phaseSteps.length - 1) return;

    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    
    const tempOrder = phaseSteps[index].step_order;
    phaseSteps[index].step_order = phaseSteps[targetIdx].step_order;
    phaseSteps[targetIdx].step_order = tempOrder;

    try {
      await adminApi.reorderWorkflows({
        steps: [
          { id: phaseSteps[index].id, step_order: phaseSteps[index].step_order },
          { id: phaseSteps[targetIdx].id, step_order: phaseSteps[targetIdx].step_order }
        ]
      });
      toast.success('Workflow reordered');
      queryClient.invalidateQueries({ queryKey: ['admin_workflows'] });
    } catch (e: any) {
      toast.error('Reordering failed');
    }
  };

  const handleWfAddSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    const payload: any = {
      category_id: Number(data.category_id),
      procurement_id: Number(data.procurement_id),
      purchase_type: String(data.purchase_type),
      phase_id: Number(data.phase_id),
      step_order: Number(data.step_order),
    };

    if (wfAssigneeType === 'tag') {
      payload.user_type = String(data.tag_user_type);
    } else {
      payload.user_type = String(data.step_action || 'verifier');
      if (wfAssigneeType === 'group') {
        payload.user_group = String(data.user_group);
      } else {
        payload.role_id = Number(data.role_id);
      }
    }

    createWfMutation.mutate(payload);
  };

  const handleUserSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const is_active = formData.get('is_active') === 'on';
    const is_approved = formData.get('is_approved') === 'on';

    const data: any = {
      name: String(formData.get('name')),
      email: String(formData.get('email')),
      designation: String(formData.get('designation') || ''),
      role_id: formData.get('role_id') ? Number(formData.get('role_id')) : null,
      department_id: formData.get('department_id') ? Number(formData.get('department_id')) : null,
      is_active,
      is_approved,
    };
    
    const password = formData.get('password');
    if (password) {
      data.password = String(password);
    }

    if (editingUser) {
      saveUserMutation.mutate({ id: editingUser.id, data });
    } else {
      saveUserMutation.mutate({ data });
    }
  };

  const handleRoleAddSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    createRoleMutation.mutate(data);
  };

  const handleCatSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: any = Object.fromEntries(formData.entries());
    data.min_amount = parseFloat(data.min_amount) || 0.0;
    data.max_amount = parseFloat(data.max_amount) || 0.0;
    data.is_active = data.is_active === 'true';
    if (data.procurement_id) {
      data.procurement_id = parseInt(data.procurement_id, 10);
    }
    data.requirement_type = data.requirement_type || null;

    saveCatMutation.mutate(data);
  };

  const handleProcSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: any = Object.fromEntries(formData.entries());
    if (data.max_amount) {
      data.max_amount = parseFloat(data.max_amount);
    } else {
      delete data.max_amount;
    }

    saveProcMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="page-header">System Config & Settings</h1>
          <p className="page-subtitle">Configure workflow steps, categories, procurement methods, and user roles</p>
        </div>
        <div className="flex flex-wrap border border-slate-200 rounded overflow-hidden shadow-sm bg-white self-start">
          <button 
            onClick={() => setActiveTab('workflows')} 
            className={`px-4 py-2 text-sm font-semibold transition ${activeTab === 'workflows' ? 'bg-[#1a3a6b] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Workflows
          </button>
          <button 
            onClick={() => setActiveTab('categories')} 
            className={`px-4 py-2 text-sm font-semibold transition ${activeTab === 'categories' ? 'bg-[#1a3a6b] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Categories
          </button>
          <button 
            onClick={() => setActiveTab('procurement')} 
            className={`px-4 py-2 text-sm font-semibold transition ${activeTab === 'procurement' ? 'bg-[#1a3a6b] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Procurement Modes
          </button>
          <button 
            onClick={() => setActiveTab('users')} 
            className={`px-4 py-2 text-sm font-semibold transition ${activeTab === 'users' ? 'bg-[#1a3a6b] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Users
          </button>
          <button 
            onClick={() => setActiveTab('roles')} 
            className={`px-4 py-2 text-sm font-semibold transition ${activeTab === 'roles' ? 'bg-[#1a3a6b] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Roles
          </button>
        </div>
      </div>

      {activeTab === 'workflows' && (
        <div className="space-y-6">
          <div className="card p-6 bg-white border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Purchase Category</label>
                <div className="flex flex-wrap gap-2">
                  {categories.filter((c: any) => c.procurement_id === selectedProc).map((c: any) => (
                    <button key={c.id} onClick={() => setSelectedCat(c.id)} className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${selectedCat === c.id ? 'bg-[#1a3a6b] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {c.title} {c.requirement_type ? `(${c.requirement_type})` : '(Any Requirement)'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Procurement Method</label>
                <select value={selectedProc || ''} onChange={(e) => setSelectedProc(Number(e.target.value))} className="input-field w-full">
                  {procs.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Purchase Type</label>
                <select value={selectedPurchaseType} onChange={(e) => setSelectedPurchaseType(e.target.value as 'department' | 'office')} className="input-field w-full">
                  <option value="department">Departmental Purchase</option>
                  <option value="office">Office Purchase</option>
                </select>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              {/* Approval Steps - full width */}
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold text-slate-800">Approval Steps</h3>
                  <div className="flex gap-2">
                    <button onClick={() => { if(confirm('Reset all steps for this combination to default?')) resetWfMutation.mutate(); }} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5 px-3">
                      Reset to Default
                    </button>
                    <button onClick={() => { setWfAssigneeType('role'); setIsWfModalOpen(true); }} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
                      <Plus size={16} /> Add Step
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {filteredWfs.length === 0 ? (
                    <p className="text-slate-500 italic p-4 text-center border border-dashed border-slate-300 rounded">No workflow defined for this combination.</p>
                  ) : (
                    phases.map((phase: any) => {
                      const stepsInPhase = filteredWfs.filter((wf: any) => wf.phase_id === phase.id);
                      if (stepsInPhase.length === 0) return null;
                      return (
                        <div key={phase.id} className="space-y-2 border border-slate-100 bg-slate-50/50 p-3 rounded">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 pl-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#1a3a6b]"></span>
                            {phase.phase_name}
                          </h4>
                          <div className="space-y-2">
                            {stepsInPhase.map((wf: any, phaseIdx: number) => {
                              return (
                                <div key={wf.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded shadow-xs">
                                  <div className="flex items-center gap-4 flex-1">
                                    <span className="w-6 h-6 rounded-full bg-[#1a3a6b] text-white flex items-center justify-center text-xs font-bold shrink-0">{phaseIdx + 1}</span>
                                    <div className="flex-1 min-w-[200px]">
                                      <select
                                        value={
                                          wf.user_type === 'purchase_initiator' ? 'tag:purchase_initiator' :
                                          wf.user_type === 'da_assigner' ? 'tag:da_assigner' :
                                          wf.user_type === 'verifier_da' ? 'tag:verifier_da' :
                                          wf.user_type === 'tech_evaluation' ? 'tag:tech_evaluation' :
                                          wf.user_type === 'user' ? `user:${wf.user_id}` :
                                          wf.role_id ? `role:${wf.role_id}` :
                                          wf.user_group ? `group:${wf.user_group}` : ''
                                        }
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const currentAction = ['verifier', 'approver'].includes(wf.user_type) ? wf.user_type : 'verifier';
                                          if (val.startsWith('tag:')) {
                                            const tag = val.substring(4);
                                            updateWfMutation.mutate({ id: wf.id, data: { user_type: tag } });
                                          } else if (val.startsWith('role:')) {
                                            const roleId = Number(val.substring(5));
                                            updateWfMutation.mutate({ id: wf.id, data: { role_id: roleId, user_type: currentAction } });
                                          } else if (val.startsWith('group:')) {
                                            const groupKey = val.substring(6);
                                            updateWfMutation.mutate({ id: wf.id, data: { user_group: groupKey, user_type: currentAction } });
                                          }
                                        }}
                                        className="font-semibold text-slate-800 bg-transparent border-b border-dashed border-slate-300 hover:border-slate-500 focus:border-[#1a3a6b] focus:outline-none pr-6 py-0.5 max-w-full text-sm cursor-pointer"
                                      >
                                        <optgroup label="Special Workflow Roles">
                                          <option value="tag:purchase_initiator">Purchase Initiator (Faculty)</option>
                                          <option value="tag:da_assigner">Superintendent (DA Assigner)</option>
                                          <option value="tag:verifier_da">Dealing Assistant (verifier_da)</option>
                                          <option value="tag:tech_evaluation">Committee (tech_evaluation)</option>
                                        </optgroup>
                                        <optgroup label="Roles">
                                          {roles.map((r: any) => (
                                            <option key={r.id} value={`role:${r.id}`}>
                                              {r.name}
                                            </option>
                                          ))}
                                        </optgroup>
                                        <optgroup label="User Groups">
                                          <option value="group:faculty">Faculty Group</option>
                                          <option value="group:hod">HOD Group</option>
                                          <option value="group:verifier_da">Dealing Assistant Group</option>
                                          <option value="group:verifier_sp">Superintendent / AR Group</option>
                                          <option value="group:verifier_general">Associate Dean Group</option>
                                          <option value="group:dean_approver">Dean Approver Group</option>
                                          <option value="group:apex_approver">Apex Approver Group</option>
                                        </optgroup>
                                      </select>
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                        <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                          Order: {wf.step_order} | Action:
                                          {wf.user_type === 'approver' ? (
                                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold uppercase tracking-wider">
                                              Approver (Ends Phase)
                                            </span>
                                          ) : ['purchase_initiator', 'da_assigner', 'verifier_da', 'tech_evaluation'].includes(wf.user_type) ? (
                                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold uppercase tracking-wider">
                                              Special: {wf.user_type}
                                            </span>
                                          ) : (
                                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold uppercase tracking-wider">
                                              Verifier
                                            </span>
                                          )}
                                        </p>
                                        
                                        {!['purchase_initiator', 'da_assigner', 'verifier_da', 'tech_evaluation'].includes(wf.user_type) && (
                                          <div className="flex items-center gap-1">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Action Type:</span>
                                            <select
                                              value={wf.user_type === 'approver' ? 'approver' : 'verifier'}
                                              onChange={(e) => {
                                                const newAction = e.target.value;
                                                updateWfMutation.mutate({ id: wf.id, data: { user_type: newAction } });
                                              }}
                                              className="text-[11px] font-semibold bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 cursor-pointer focus:outline-none focus:border-[#1a3a6b] hover:border-slate-300 transition-colors"
                                            >
                                              <option value="verifier">Verifier</option>
                                              <option value="approver">Approver</option>
                                            </select>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => toggleWfMutation.mutate(wf.id)} className={`px-2 py-1 text-xs rounded font-medium ${wf.is_enabled ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                                      {wf.is_enabled ? 'Enabled' : 'Disabled'}
                                    </button>
                                    <div className="w-px h-6 bg-slate-200 mx-1"></div>
                                    <button onClick={() => handleMove(wf.id, 'up')} disabled={phaseIdx === 0} className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400">
                                      <ArrowUp size={18} />
                                    </button>
                                    <button onClick={() => handleMove(wf.id, 'down')} disabled={phaseIdx === stepsInPhase.length - 1} className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400">
                                      <ArrowDown size={18} />
                                    </button>
                                    <div className="w-px h-6 bg-slate-200 mx-1"></div>
                                    <button onClick={() => deleteWfMutation.mutate(wf.id)} className="p-1.5 text-red-400 hover:text-red-600">
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="space-y-6">
          <div className="card p-6 bg-white border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Purchase Categories</h3>
                <p className="text-sm text-slate-500 font-medium mt-0.5">Define purchase category bounds for validation</p>
              </div>
              <button 
                onClick={() => { setEditingCat(null); setIsCatModalOpen(true); }} 
                className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3 font-semibold"
              >
                <Plus size={16} /> Add Category
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 flex items-start gap-2 mb-6">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Cascade Deletion Warning:</span> Deleting a Purchase Category will immediately cascade and delete all associated workflow steps in the settings. If a category is already referenced by submitted purchase requests, deletion will be blocked by the server database.
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-700">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
                    <th className="px-6 py-3 font-bold">Category Title</th>
                    <th className="px-6 py-3 font-bold">Procurement Method</th>
                    <th className="px-6 py-3 font-bold">Nature of Requirement</th>
                    <th className="px-6 py-3 font-bold">Min Bound</th>
                    <th className="px-6 py-3 font-bold">Max Bound</th>
                    <th className="px-6 py-3 font-bold">Status</th>
                    <th className="px-6 py-3 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((c: any) => {
                    const procName = procs.find((p: any) => p.id === c.procurement_id)?.name || 'Unknown';
                    return (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-bold text-slate-800">{c.title}</td>
                        <td className="px-6 py-4 font-semibold text-slate-600">{procName}</td>
                        <td className="px-6 py-4 text-slate-600 font-medium">{c.requirement_type || 'Any Requirement'}</td>
                        <td className="px-6 py-4 font-semibold text-slate-600">{formatCurrency(c.min_amount)}</td>
                        <td className="px-6 py-4 font-semibold text-slate-600">
                          {c.max_amount >= 99999999 ? 'No Limit' : formatCurrency(c.max_amount)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                            {c.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 flex gap-2">
                          <button 
                            onClick={() => { setEditingCat(c); setIsCatModalOpen(true); }} 
                            className="p-1 text-slate-400 hover:text-blue-600"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete category "${c.title}"? This will delete all workflow steps linked to this category.`)) {
                                deleteCatMutation.mutate(c.id);
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'procurement' && (
        <div className="space-y-6">
          <div className="card p-6 bg-white border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Procurement Modes</h3>
                <p className="text-sm text-slate-500 font-medium mt-0.5">Manage purchasing channels and max limits</p>
              </div>
              <button 
                onClick={() => { setEditingProc(null); setIsProcModalOpen(true); }} 
                className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3 font-semibold"
              >
                <Plus size={16} /> Add Procurement Mode
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 flex items-start gap-2 mb-6">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Cascade Deletion Warning:</span> Deleting a Procurement Mode will immediately cascade and delete all associated workflow steps in the settings. If a mode is already referenced by submitted purchase requests, deletion will be blocked by the server database.
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-700">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
                    <th className="px-6 py-3 font-bold">Mode Name</th>
                    <th className="px-6 py-3 font-bold">Description</th>
                    <th className="px-6 py-3 font-bold">Maximum Limit</th>
                    <th className="px-6 py-3 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {procs.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-bold text-slate-800">{p.name}</td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{p.description || '-'}</td>
                      <td className="px-6 py-4 font-semibold text-slate-600">
                        {p.max_amount !== null && p.max_amount !== undefined ? formatCurrency(p.max_amount) : 'No Limit'}
                      </td>
                      <td className="px-6 py-4 flex gap-2">
                        <button 
                          onClick={() => { setEditingProc(p); setIsProcModalOpen(true); }} 
                          className="p-1 text-slate-400 hover:text-blue-600"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete procurement mode "${p.name}"? This will delete all workflow steps linked to this mode.`)) {
                              deleteProcMutation.mutate(p.id);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="card p-6 bg-white border border-slate-200">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">User Directory</h3>
                <p className="text-sm text-slate-500 font-medium mt-0.5">Manage user profiles, departments, and roles. Determins authorization and visibility scopes.</p>
              </div>
              <button 
                onClick={() => { setEditingUser(null); setIsUserModalOpen(true); }} 
                className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3 font-semibold"
              >
                <Plus size={16} /> Add User
              </button>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-wrap gap-3 mb-5 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="input-field flex-1 min-w-[200px] text-sm"
              />
              <select
                value={userFilterDept}
                onChange={(e) => setUserFilterDept(e.target.value)}
                className="input-field min-w-[160px] text-sm"
              >
                <option value="">All Departments</option>
                {depts.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.short_code} — {d.name}</option>
                ))}
              </select>
              <select
                value={userFilterRole}
                onChange={(e) => setUserFilterRole(e.target.value)}
                className="input-field min-w-[160px] text-sm"
              >
                <option value="">All Roles</option>
                {roles.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-700">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
                    <th className="px-5 py-3 font-bold">Name</th>
                    <th className="px-5 py-3 font-bold">Email</th>
                    <th className="px-5 py-3 font-bold">Department</th>
                    <th className="px-5 py-3 font-bold">Role Assignment</th>
                    <th className="px-5 py-3 font-bold">Status</th>
                    <th className="px-5 py-3 font-bold w-32">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users
                    .filter((u: any) => {
                      if (userSearch && !u.name.toLowerCase().includes(userSearch.toLowerCase()) && !u.email.toLowerCase().includes(userSearch.toLowerCase())) return false;
                      if (userFilterRole && u.role_id !== Number(userFilterRole)) return false;
                      if (userFilterDept && u.department_id !== Number(userFilterDept)) return false;
                      return true;
                    })
                    .map((u: any) => {
                      const dept = depts.find((d: any) => d.id === u.department_id);
                      const currentRole = roles.find((r: any) => r.id === u.role_id);
                      return (
                        <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="font-bold text-slate-800">{u.name}</div>
                            {u.is_approved ? null : (
                              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Pending Approval</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-xs font-mono text-slate-500">{u.email}</td>
                          <td className="px-5 py-3">
                            {dept ? (
                              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-bold">
                                {dept.short_code}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {currentRole && (
                                <span className={`shrink-0 w-2 h-2 rounded-full ${
                                  currentRole.group_key === 'admin' ? 'bg-red-400' :
                                  currentRole.group_key === 'apex_approver' ? 'bg-purple-400' :
                                  currentRole.group_key === 'dean_approver' ? 'bg-indigo-400' :
                                  currentRole.group_key === 'hod' ? 'bg-blue-400' :
                                  currentRole.group_key === 'faculty' ? 'bg-green-400' :
                                  'bg-slate-300'
                                }`} />
                              )}
                              <select
                                value={u.role_id || ''}
                                onChange={(e) => {
                                  const newRoleId = Number(e.target.value);
                                  saveUserMutation.mutate({ id: u.id, data: { role_id: newRoleId } });
                                }}
                                className="bg-white border border-slate-200 rounded px-2 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#1a3a6b] w-full cursor-pointer hover:border-slate-400 transition-colors"
                              >
                                <option value="">— No Role —</option>
                                {roles.map((r: any) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name} [{r.group_key}]
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingUser(u);
                                  setIsUserModalOpen(true);
                                }}
                                className="p-1 text-slate-400 hover:text-[#1a3a6b] transition-colors"
                                title="Edit Details"
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                onClick={() => saveUserMutation.mutate({ id: u.id, data: { is_active: !u.is_active } })}
                                className={`p-1 transition-colors ${u.is_active ? 'text-slate-400 hover:text-red-600' : 'text-red-400 hover:text-green-600'}`}
                                title={u.is_active ? "Deactivate" : "Activate"}
                              >
                                {u.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Reset password to Password@123?')) {
                                    resetPasswordMutation.mutate(u.id);
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-amber-600 transition-colors"
                                title="Reset Password"
                              >
                                <Key size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {users.filter((u: any) => {
                if (userSearch && !u.name.toLowerCase().includes(userSearch.toLowerCase()) && !u.email.toLowerCase().includes(userSearch.toLowerCase())) return false;
                if (userFilterRole && u.role_id !== Number(userFilterRole)) return false;
                if (userFilterDept && u.department_id !== Number(userFilterDept)) return false;
                return true;
              }).length === 0 && (
                <p className="text-center text-slate-400 py-10 text-sm italic">No users match the current filters.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="space-y-6">
          <div className="card p-6 bg-white border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">System Roles Configuration</h3>
                <p className="text-sm text-slate-500 font-medium">Configure approval action scopes — define role names and their permission group keys. Assign roles to users in the Users tab.</p>
              </div>
              <button onClick={() => setIsRoleModalOpen(true)} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3 font-semibold">
                <Plus size={16} /> Add Role
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-slate-700">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-200">
                    <th className="px-6 py-3 font-bold">ID</th>
                    <th className="px-6 py-3 font-bold">Role Name</th>
                    <th className="px-6 py-3 font-bold">Value</th>
                    <th className="px-6 py-3 font-bold">Group Key</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roles.map((r: any) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3.5 font-medium text-slate-500">{r.id}</td>
                      <td className="px-6 py-3.5 font-bold text-slate-800">{r.name}</td>
                      <td className="px-6 py-3.5 font-mono text-xs text-blue-950">{r.value}</td>
                      <td className="px-6 py-3.5">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">
                          {r.group_key}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Workflow Step Modal */}
      {isWfModalOpen && (() => {
        const getNextStepOrder = () => {
          const steps = workflows.filter((w: any) => 
            w.category_id === selectedCat && 
            w.procurement_id === selectedProc &&
            w.purchase_type === selectedPurchaseType
          );
          return steps.length > 0 ? Math.max(...steps.map((w: any) => w.step_order)) + 1 : 1;
        };
        const defaultStepOrder = getNextStepOrder();

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-[#1a3a6b] text-white">
                <h2 className="text-lg font-bold">Add Workflow Step</h2>
              </div>
              <form onSubmit={handleWfAddSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Procurement Method</label>
                    <select name="procurement_id" required className="input-field w-full text-xs" defaultValue={selectedProc ?? ''}>
                      {procs.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Purchase Type</label>
                    <select name="purchase_type" required className="input-field w-full text-xs" defaultValue={selectedPurchaseType}>
                      <option value="department">Departmental</option>
                      <option value="office">Office</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Purchase Category</label>
                  <select name="category_id" required className="input-field w-full text-xs" defaultValue={selectedCat ?? ''}>
                    {categories.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.title} {c.requirement_type ? `(${c.requirement_type})` : '(Any Requirement)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Phase</label>
                    <select name="phase_id" required className="input-field w-full text-xs">
                      {phases.map((p: any) => <option key={p.id} value={p.id}>{p.phase_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Position</label>
                    <input name="step_order" type="number" required min="1" className="input-field w-full text-xs" defaultValue={defaultStepOrder} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Assignee Type</label>
                  <div className="flex flex-wrap gap-4 mb-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="assignee_type"
                        value="role"
                        checked={wfAssigneeType === 'role'}
                        onChange={() => setWfAssigneeType('role')}
                        className="text-[#1a3a6b]"
                      />
                      Role
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="assignee_type"
                        value="group"
                        checked={wfAssigneeType === 'group'}
                        onChange={() => setWfAssigneeType('group')}
                        className="text-[#1a3a6b]"
                      />
                      User Group
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="assignee_type"
                        value="tag"
                        checked={wfAssigneeType === 'tag'}
                        onChange={() => setWfAssigneeType('tag')}
                        className="text-[#1a3a6b]"
                      />
                      Special Role
                    </label>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 italic">Workflow steps reference roles only — not specific individuals. Individual role assignments are managed in the Users tab.</p>
                </div>
                {wfAssigneeType === 'role' && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Assigned Role</label>
                    <select name="role_id" required className="input-field w-full">
                      {roles.map((r: any) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.group_key})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {wfAssigneeType === 'group' && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Assigned User Group</label>
                    <select name="user_group" required className="input-field w-full">
                      <option value="faculty">Faculty Group</option>
                      <option value="hod">HOD Group</option>
                      <option value="verifier_da">Dealing Assistant Group</option>
                      <option value="verifier_sp">Superintendent / AR Group</option>
                      <option value="verifier_general">Associate Dean Group</option>
                      <option value="dean_approver">Dean Approver Group</option>
                      <option value="apex_approver">Apex Approver Group</option>
                    </select>
                  </div>
                )}
                {wfAssigneeType === 'tag' && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Assigned Special Role (Functional Tag)</label>
                    <select name="tag_user_type" required className="input-field w-full">
                      <option value="purchase_initiator">Purchase Initiator (Faculty)</option>
                      <option value="da_assigner">Superintendent (DA Assigner)</option>
                      <option value="verifier_da">Dealing Assistant (verifier_da)</option>
                      <option value="tech_evaluation">Committee Nominees (tech_evaluation)</option>
                    </select>
                  </div>
                )}
                {wfAssigneeType !== 'tag' && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Action Type</label>
                    <div className="flex gap-4 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer font-semibold">
                        <input
                          type="radio"
                          name="step_action"
                          value="verifier"
                          defaultChecked
                          className="text-[#1a3a6b]"
                        />
                        Verifier
                      </label>
                      <label className="flex items-center gap-2 text-sm text-[#1a3a6b] font-bold cursor-pointer">
                        <input
                          type="radio"
                          name="step_action"
                          value="approver"
                          className="text-[#1a3a6b]"
                        />
                        Approver (Ends Phase)
                      </label>
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button type="button" onClick={() => setIsWfModalOpen(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" disabled={createWfMutation.isPending} className="btn-primary">
                    {createWfMutation.isPending ? 'Adding...' : 'Add Step'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Add/Edit Category Modal */}
      {isCatModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-[#1a3a6b] text-white">
              <h2 className="text-lg font-bold">{editingCat ? 'Edit Purchase Category' : 'Create Purchase Category'}</h2>
            </div>
            <form onSubmit={handleCatSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Procurement Method</label>
                <select 
                  name="procurement_id" 
                  required 
                  defaultValue={editingCat?.procurement_id ?? selectedProc ?? ''} 
                  className="input-field w-full"
                >
                  {procs.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Category Title</label>
                <input 
                  name="title" 
                  type="text" 
                  required 
                  defaultValue={editingCat?.title}
                  placeholder="e.g. 1 Lakh to 10 Lakhs" 
                  className="input-field w-full" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Minimum Amount (₹)</label>
                  <input 
                    name="min_amount" 
                    type="number" 
                    required 
                    step="0.01"
                    defaultValue={editingCat?.min_amount ?? 0.0}
                    className="input-field w-full" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Maximum Amount (₹)</label>
                  <input 
                    name="max_amount" 
                    type="number" 
                    required 
                    step="0.01"
                    defaultValue={editingCat?.max_amount ?? 0.0}
                    className="input-field w-full" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Active Status</label>
                <select name="is_active" defaultValue={editingCat?.is_active ? 'true' : 'false'} className="input-field w-full">
                  <option value="true">Active (Enabled in PR creation)</option>
                  <option value="false">Inactive (Disabled)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nature of Requirement</label>
                <select 
                  name="requirement_type" 
                  defaultValue={editingCat?.requirement_type ?? ''} 
                  className="input-field w-full"
                >
                  <option value="">Any Requirement (General Fallback)</option>
                  {REQUIREMENT_TYPES.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { setIsCatModalOpen(false); setEditingCat(null); }} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saveCatMutation.isPending} className="btn-primary">
                  {saveCatMutation.isPending ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Procurement Modal */}
      {isProcModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-[#1a3a6b] text-white">
              <h2 className="text-lg font-bold">{editingProc ? 'Edit Procurement Mode' : 'Create Procurement Mode'}</h2>
            </div>
            <form onSubmit={handleProcSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Mode Name</label>
                <input 
                  name="name" 
                  type="text" 
                  required 
                  defaultValue={editingProc?.name}
                  placeholder="e.g. GeM Direct Purchase" 
                  className="input-field w-full" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                <textarea 
                  name="description" 
                  defaultValue={editingProc?.description}
                  placeholder="Rules or GFR codes mapping..." 
                  className="input-field w-full h-20 resize-none" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Maximum Allowed Cost Limit (₹) - Optional</label>
                <input 
                  name="max_amount" 
                  type="number" 
                  step="0.01"
                  defaultValue={editingProc?.max_amount ?? ''}
                  placeholder="Leave empty for unlimited"
                  className="input-field w-full" 
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { setIsProcModalOpen(false); setEditingProc(null); }} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saveProcMutation.isPending} className="btn-primary">
                  {saveProcMutation.isPending ? 'Saving...' : 'Save Mode'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Role Modal */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-[#1a3a6b] text-white">
              <h2 className="text-lg font-bold">Create New System Role</h2>
            </div>
            <form onSubmit={handleRoleAddSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Role Name</label>
                <input name="name" type="text" required placeholder="e.g. Associate Dean P&D" className="input-field w-full" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Role Value (Unique Identifier)</label>
                <input name="value" type="text" required placeholder="e.g. associate_dean_pd" className="input-field w-full font-mono text-sm" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-semibold text-slate-700">Action Group Category (Permission scope)</label>
                  <label className="flex items-center gap-1 text-xs text-[#1a3a6b] font-semibold cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={isCustomGroupKey} 
                      onChange={(e) => setIsCustomGroupKey(e.target.checked)} 
                      className="rounded text-[#1a3a6b] border-slate-300 focus:ring-[#1a3a6b]" 
                    />
                    Use Custom Key
                  </label>
                </div>
                {isCustomGroupKey ? (
                  <input 
                    name="group_key" 
                    type="text" 
                    required 
                    placeholder="e.g. dean_approver" 
                    className="input-field w-full font-mono text-sm" 
                  />
                ) : (
                  <select name="group_key" required className="input-field w-full">
                    <option value="faculty">Faculty (Submitters)</option>
                    <option value="hod">Head of Department (HOD)</option>
                    <option value="verifier_da">Dealing Assistant (Tendering/TE/FS entry)</option>
                    <option value="verifier_sp">Superintendent (Verifier)</option>
                    <option value="verifier_general">General Verifier (AR/DR/AD/Dean/Registrar)</option>
                    <option value="apex_approver">Apex Approver (Director)</option>
                    <option value="admin">System Admin</option>
                  </select>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setIsRoleModalOpen(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={createRoleMutation.isPending} className="btn-primary">
                  {createRoleMutation.isPending ? 'Creating...' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit User Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-[#1a3a6b] text-white">
              <h2 className="text-lg font-bold">{editingUser ? 'Edit User Details' : 'Create New User'}</h2>
            </div>
            <form onSubmit={handleUserSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Full Name</label>
                <input name="name" type="text" required defaultValue={editingUser?.name} placeholder="e.g. Dr. John Doe" className="input-field w-full" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
                <input name="email" type="email" required defaultValue={editingUser?.email} placeholder="e.g. john.doe@nitt.edu" className="input-field w-full font-mono text-sm animate-fadeIn" />
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
                  <input name="password" type="text" required placeholder="Temporary password" defaultValue="Password@123" className="input-field w-full font-mono text-sm" />
                </div>
              )}
              {editingUser && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Change Password (Optional)</label>
                  <input name="password" type="text" placeholder="Leave blank to keep current password" className="input-field w-full font-mono text-sm" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Department</label>
                  <select name="department_id" defaultValue={editingUser?.department_id ?? ''} className="input-field w-full">
                    <option value="">None / Center / All</option>
                    {depts.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.short_code} — {d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Designation</label>
                  <input name="designation" type="text" defaultValue={editingUser?.designation || ''} placeholder="e.g. Professor" className="input-field w-full" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">System Role</label>
                <select name="role_id" defaultValue={editingUser?.role_id ?? ''} className="input-field w-full">
                  <option value="">— No Role —</option>
                  {roles.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.group_key})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-6 pt-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 font-semibold cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    name="is_active"
                    defaultChecked={editingUser ? editingUser.is_active : true} 
                    className="rounded text-[#1a3a6b] border-slate-300 focus:ring-[#1a3a6b]" 
                  />
                  Active Account
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 font-semibold cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    name="is_approved"
                    defaultChecked={editingUser ? editingUser.is_approved : true} 
                    className="rounded text-[#1a3a6b] border-slate-300 focus:ring-[#1a3a6b]" 
                  />
                  Onboarding Approved
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { setIsUserModalOpen(false); setEditingUser(null); }} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={saveUserMutation.isPending} className="btn-primary">
                  {saveUserMutation.isPending ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
