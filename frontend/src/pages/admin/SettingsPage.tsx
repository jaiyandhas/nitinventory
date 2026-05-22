import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, ArrowDown, Plus, Trash2, Edit, AlertTriangle, ShieldCheck } from 'lucide-react';
import { adminApi } from '../../services/api';
import { toast } from 'react-hot-toast';
import { formatCurrency } from '../../utils/format';

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'workflows' | 'roles' | 'categories' | 'procurement'>('workflows');
  
  // Workflows states
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [selectedProc, setSelectedProc] = useState<number | null>(null);
  const [selectedPurchaseType, setSelectedPurchaseType] = useState<'department' | 'office'>('department');
  const [isWfModalOpen, setIsWfModalOpen] = useState(false);
  const [wfAssigneeType, setWfAssigneeType] = useState<'role' | 'user'>('role');

  // Role states
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);

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
      queryClient.invalidateQueries({ queryKey: ['admin_roles'] });
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.detail || 'Failed to create role');
    }
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

    const phaseId = Number(data.phase_id);
    const stepsInPhase = workflows.filter((w: any) => 
      w.category_id === selectedCat && 
      w.procurement_id === selectedProc &&
      w.purchase_type === selectedPurchaseType &&
      w.phase_id === phaseId
    );
    const nextStepOrder = stepsInPhase.length > 0 ? Math.max(...stepsInPhase.map((w: any) => w.step_order)) + 1 : 1;

    const payload: any = {
      category_id: selectedCat,
      procurement_id: selectedProc,
      purchase_type: selectedPurchaseType,
      phase_id: phaseId,
      step_order: nextStepOrder,
    };

    if (wfAssigneeType === 'user') {
      payload.user_type = 'user';
      payload.user_id = Number(data.user_id);
    } else {
      payload.user_type = 'group';
      payload.role_id = Number(data.role_id);
    }

    createWfMutation.mutate(payload);
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
        <div className="flex border border-slate-200 rounded overflow-hidden shadow-sm bg-white self-start">
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
                      {c.title}
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
              <div className="flex justify-between items-center mb-4">
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
                                <div className="flex items-center gap-4">
                                  <span className="w-6 h-6 rounded-full bg-[#1a3a6b] text-white flex items-center justify-center text-xs font-bold">{phaseIdx + 1}</span>
                                  <div>
                                    <p className="font-semibold text-slate-800">
                                      {wf.user_type === 'user'
                                        ? `${wf.user_name} (User)`
                                        : wf.role_name || (wf.user_group ? wf.user_group.replace("_", " ").toUpperCase() : '')}
                                    </p>
                                    <p className="text-xs text-slate-500">Order: {wf.step_order}</p>
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

      {activeTab === 'roles' && (
        <div className="space-y-6">
          <div className="card p-6 bg-white border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">System Roles Configuration</h3>
                <p className="text-sm text-slate-500 font-medium">Configure approval action scopes and user mapping</p>
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
      {isWfModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-[#1a3a6b] text-white">
              <h2 className="text-lg font-bold">Add Workflow Step</h2>
            </div>
            <form onSubmit={handleWfAddSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Phase</label>
                <select name="phase_id" required className="input-field w-full">
                  {phases.map((p: any) => <option key={p.id} value={p.id}>{p.phase_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Assignee Type</label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="assignee_type"
                      value="role"
                      checked={wfAssigneeType === 'role'}
                      onChange={() => setWfAssigneeType('role')}
                      className="text-[#1a3a6b]"
                    />
                    Role / Group
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="assignee_type"
                      value="user"
                      checked={wfAssigneeType === 'user'}
                      onChange={() => setWfAssigneeType('user')}
                      className="text-[#1a3a6b]"
                    />
                    Specific User
                  </label>
                </div>
              </div>
              {wfAssigneeType === 'role' ? (
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
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Assigned User</label>
                  <select name="user_id" required className="input-field w-full">
                    {users.map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
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
      )}

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
                <label className="block text-sm font-semibold text-slate-700 mb-1">Action Group Category (Permission scope)</label>
                <select name="group_key" required className="input-field w-full">
                  <option value="faculty">Faculty (Submitters)</option>
                  <option value="hod">Head of Department (HOD)</option>
                  <option value="verifier_da">Dealing Assistant (Tendering/TE/FS entry)</option>
                  <option value="verifier_sp">Superintendent (Verifier)</option>
                  <option value="verifier_general">General Verifier (AR/DR/AD/Dean/Registrar)</option>
                  <option value="apex_approver">Apex Approver (Director)</option>
                  <option value="admin">System Admin</option>
                </select>
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
    </div>
  );
};
